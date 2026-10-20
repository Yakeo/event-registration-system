/**
 * controllers/adminController.js
 * Dashboard, participants list, attendance generation, CSV export,
 * and user account administration.
 */
const { Op } = require('sequelize');
const {
  User,
  Venue,
  Event,
  Registration,
  Attendance,
  RegistrationStatusChange,
  AuditLog,
  sequelize,
  eventVenueInclude,
  getEventCapacity,
  logAudit,
  logStatusChange,
} = require('../models');
const { decorateWithCapacity } = require('./eventController');
const { promoteFromWaitlist } = require('./registrationController');
const { validateAdminPassword } = require('../middlewares/validate');

/**
 * CSV escaping that also neutralises spreadsheet formula injection:
 * a participant called "=HYPERLINK(...)" must not execute when the exported
 * attendance file is opened in Excel/Sheets.
 */
function csvEscape(value) {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const adminController = {
  /** GET /admin -> dashboard tiles + capacity table + latest registrations */
  async dashboard(req, res) {
    const [totalEvents, totalUsers, confirmed, waitlisted, checkedIn] = await Promise.all([
      Event.count(),
      User.count(),
      Registration.count({ where: { status: 'confirmed' } }),
      Registration.count({ where: { status: 'waitlisted' } }),
      Attendance.count(),
    ]);

    const events = await Event.findAll({
      include: [eventVenueInclude],
      order: [['event_date', 'ASC']],
    });
    const decorated = await decorateWithCapacity(events);

    const latest = await Registration.findAll({
      where: { status: { [Op.ne]: 'cancelled' } },
      include: [
        { model: User, as: 'user', attributes: ['full_name', 'email'] },
        { model: Event, as: 'event', attributes: ['title', 'event_date'] },
      ],
      order: [['registration_date', 'DESC']],
      limit: 8,
    });

    return res.render('admin/dashboard', {
      title: 'Admin dashboard',
      stats: {
        totalEvents,
        totalUsers,
        confirmed,
        waitlisted,
        checkedIn,
        seatsOffered: decorated.reduce((s, e) => s + e.max, 0),
        seatsTaken: decorated.reduce((s, e) => s + e.taken, 0),
      },
      events: decorated,
      latest,
    });
  },

  /** GET /admin/events/:id/participants -> registered participants per event */
  async participants(req, res) {
    const event = await Event.findByPk(req.params.id, { include: [eventVenueInclude] });
    if (!event) {
      return res.status(404).render('error', {
        title: 'Event not found',
        status: 404,
        message: 'That event does not exist.',
      });
    }

    const requested = (req.query.status || 'all').toLowerCase();
    const status = ['all', 'confirmed', 'waitlisted', 'cancelled'].includes(requested)
      ? requested
      : 'all';
    const where = { event_id: event.event_id };
    if (status !== 'all') where.status = status;

    const rows = await Registration.findAll({
      where,
      include: [
        { model: User, as: 'user', attributes: ['user_id', 'full_name', 'email'] },
        { model: Attendance, as: 'attendance', required: false },
      ],
      order: [['registration_date', 'ASC']],
    });

    const [decorated] = await decorateWithCapacity([event]);
    const checkedIn = rows.filter((r) => r.attendance).length;
    return res.render('admin/participants', {
      title: `Participants - ${event.title}`,
      event: decorated,
      rows,
      status,
      checkedIn,
    });
  },

  /** POST /admin/registrations/:id/status -> confirm / cancel / waitlist */
  async updateStatus(req, res) {
    const preview = await Registration.findByPk(req.params.id);
    const next = (req.body.status || '').toLowerCase();
    const fallbackUrl = preview
      ? `/admin/events/${preview.event_id}/participants`
      : '/admin/events';

    if (!preview || !['confirmed', 'waitlisted', 'cancelled'].includes(next)) {
      req.session.flashError = 'Invalid registration update requested.';
      return res.redirect(fallbackUrl);
    }

    // Never redirect back to an attacker-controlled Referer header.
    const outcome = await sequelize.transaction(async (t) => {
      const registration = await Registration.findByPk(req.params.id, {
        transaction: t,
        lock: sequelize.getDialect() === 'sqlite' ? undefined : t.LOCK.UPDATE,
      });
      if (!registration) return { notFound: true };

      const previous = registration.status;
      if (previous === next) return { unchanged: true };

      // Capacity safeguard: prevent setting to 'confirmed' if event is already full
      if (next === 'confirmed' && previous !== 'confirmed') {
        const event = await Event.findByPk(registration.event_id, {
          transaction: t,
          lock: sequelize.getDialect() === 'sqlite' ? undefined : t.LOCK.UPDATE,
        });
        const taken = await Registration.count({
          where: { event_id: registration.event_id, status: 'confirmed' },
          transaction: t,
        });
        if (taken >= Number(event.max_participants)) {
          return { full: true, taken, max: Number(event.max_participants) };
        }
      }

      await registration.update({ status: next }, { transaction: t });
      await logStatusChange({
        registrationId: registration.registration_id,
        from: previous,
        to: next,
        actorId: req.session.user ? req.session.user.user_id : null,
        reason: 'Changed by an administrator',
        transaction: t,
      });

      // Auto-promote from waiting list if a confirmed slot was cancelled
      let promoted = null;
      if (next === 'cancelled' && previous === 'confirmed') {
        promoted = await promoteFromWaitlist(registration.event_id, t);
      }
      return { registration, next, promoted, previous };
    });

    if (outcome.notFound) {
      req.session.flashError = 'Registration not found.';
      return res.redirect('/admin/events');
    }
    if (outcome.full) {
      req.session.flashError = `Cannot confirm registration #${req.params.id}: Event is at maximum capacity (${outcome.taken}/${outcome.max} slots). Increase event capacity first to admit more participants.`;
      return res.redirect(fallbackUrl);
    }
    if (outcome.unchanged) {
      req.session.flashInfo = 'That registration already has the requested status.';
      return res.redirect(fallbackUrl);
    }

    await logAudit({
      req,
      action: 'registration.status_change',
      entity: 'REGISTRATION',
      entityId: req.params.id,
      detail: { from: outcome.previous, to: next, promoted: outcome.promoted ? outcome.promoted.registration_id : null },
    });

    req.session.flashSuccess = outcome.promoted
      ? `Registration #${req.params.id} set to "${next}". Waitlisted participant ${
          outcome.promoted.user ? outcome.promoted.user.full_name : ''
        } was automatically promoted to confirmed.`
      : `Registration #${req.params.id} set to "${next}".`;

    return res.redirect(fallbackUrl);
  },

  /** GET /admin/events/:id/attendance -> printable attendance list */
  async attendance(req, res) {
    const event = await Event.findByPk(req.params.id, { include: [eventVenueInclude] });
    if (!event) {
      return res.status(404).render('error', {
        title: 'Event not found',
        status: 404,
        message: 'That event does not exist.',
      });
    }
    const rows = await Registration.findAll({
      where: { event_id: event.event_id, status: 'confirmed' },
      include: [
        { model: User, as: 'user', attributes: ['full_name', 'email'] },
        { model: Attendance, as: 'attendance', required: false, include: [{ model: User, as: 'checkedInBy', attributes: ['full_name'], required: false }] },
      ],
      order: [['registration_date', 'ASC']],
    });
    const [decorated] = await decorateWithCapacity([event]);
    const checkedIn = rows.filter((r) => r.attendance).length;

    return res.render('admin/attendance', {
      title: `Attendance list - ${event.title}`,
      event: decorated,
      rows,
      checkedIn,
      generatedAt: new Date(),
    });
  },

  /** GET /admin/events/:id/attendance.csv -> attendance list as CSV download */
  async attendanceCsv(req, res) {
    const event = await Event.findByPk(req.params.id, { include: [eventVenueInclude] });
    if (!event) {
      return res.status(404).render('error', {
        title: 'Event not found',
        status: 404,
        message: 'That event does not exist.',
      });
    }
    const rows = await Registration.findAll({
      where: { event_id: event.event_id, status: 'confirmed' },
      include: [
        { model: User, as: 'user', attributes: ['full_name', 'email'] },
        { model: Attendance, as: 'attendance', required: false },
      ],
      order: [['registration_date', 'ASC']],
    });

    const header = [
      'No.',
      'Participant Name',
      'Email',
      'Registration Date',
      'Status',
      'Checked in at',
      'Signature',
    ];
    const lines = [header.join(',')];
    rows.forEach((r, i) => {
      lines.push(
        [
          i + 1,
          r.user.full_name,
          r.user.email,
          new Date(r.registration_date).toLocaleString('en-PH'),
          r.status,
          r.attendance ? new Date(r.attendance.checked_in_at).toLocaleString('en-PH') : '',
          '',
        ]
          .map(csvEscape)
          .join(',')
      );
    });

    const slug = event.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="attendance-${slug || event.event_id}.csv"`);
    return res.send('\uFEFF' + lines.join('\n'));
  },

  /* ----------------------- USER MANAGEMENT (ADMIN) ------------------------- */

  /** GET /admin/users -> user list with roles & registration statistics */
  async users(req, res) {
    const users = await User.findAll({
      order: [['user_id', 'ASC']],
      // Password hashes and reset tokens must never reach the template layer.
      attributes: { exclude: ['password', 'reset_password_token', 'reset_password_expires'] },
      include: [{ model: Registration, as: 'registrations', attributes: ['registration_id', 'status'] }],
    });

    const usersData = users.map((u) => {
      const plain = u.get({ plain: true });
      const regs = plain.registrations || [];
      return {
        ...plain,
        totalRegistrations: regs.length,
        confirmedCount: regs.filter((r) => r.status === 'confirmed').length,
        waitlistCount: regs.filter((r) => r.status === 'waitlisted').length,
      };
    });

    return res.render('admin/users', {
      title: 'Manage users',
      users: usersData,
    });
  },

  /** POST /admin/users/:id/role -> change role between admin and participant */
  async updateUserRole(req, res) {
    const target = await User.findByPk(req.params.id);
    if (!target) {
      req.session.flashError = 'User not found.';
      return res.redirect('/admin/users');
    }

    const newRole = (req.body.role || '').toLowerCase();
    if (!['admin', 'participant'].includes(newRole)) {
      req.session.flashError = 'Invalid role specified.';
      return res.redirect('/admin/users');
    }

    // Safeguard: Do not demote the last administrator
    if (target.role === 'admin' && newRole === 'participant') {
      const adminCount = await User.count({ where: { role: 'admin' } });
      if (adminCount <= 1) {
        req.session.flashError = 'Cannot demote the sole administrator of the system.';
        return res.redirect('/admin/users');
      }
    }

    const previousRole = target.role;
    await target.update({ role: newRole });
    await logAudit({
      req,
      action: 'user.role_change',
      entity: 'USER',
      entityId: target.user_id,
      detail: { from: previousRole, to: newRole, email: target.email },
    });
    req.session.flashSuccess = `Role for ${target.full_name} (${target.email}) changed to "${newRole}".`;
    return res.redirect('/admin/users');
  },

  /** POST /admin/users/:id/reset-password -> admin sets a temporary password */
  async adminResetPassword(req, res) {
    const target = await User.findByPk(req.params.id);
    if (!target) {
      req.session.flashError = 'User not found.';
      return res.redirect('/admin/users');
    }

    // An empty field used to silently fall back to the public string
    // "password123" for every account. Require an explicit password instead.
    const newPassword = req.body.new_password || '';
    const errors = validateAdminPassword(newPassword);
    if (errors.length) {
      req.session.flashError = `Password not changed: ${errors.join(' ')}`;
      return res.redirect('/admin/users');
    }

    target.password = newPassword;
    target.reset_password_token = null;
    target.reset_password_expires = null;
    await target.save();

    await logAudit({
      req,
      action: 'user.password_reset',
      entity: 'USER',
      entityId: target.user_id,
      detail: { email: target.email, by: 'administrator' },
    });

    // The plaintext password is intentionally NOT echoed back into a flash
    // message (it would end up in logs, browser history and session storage).
    req.session.flashSuccess = `Password for ${target.full_name} (${target.email}) was reset. Share the new password securely and ask the user to change it after signing in.`;
    return res.redirect('/admin/users');
  },

  /* ------------------------------- ATTENDANCE ------------------------------ */

  /**
   * POST /admin/attendance/:registrationId
   * Toggles a physical check-in. Attendance is its own table, so a confirmed
   * participant who never shows up stays "not checked in" in the report.
   */
  async toggleAttendance(req, res) {
    const registration = await Registration.findByPk(req.params.registrationId);
    if (!registration) {
      req.session.flashError = 'Registration not found.';
      return res.redirect('/admin/events');
    }
    const back = `/admin/events/${registration.event_id}/attendance`;

    const existing = await Attendance.findOne({
      where: { registration_id: registration.registration_id },
    });

    if (existing) {
      await existing.destroy();
      await logAudit({
        req,
        action: 'attendance.undo_check_in',
        entity: 'REGISTRATION',
        entityId: registration.registration_id,
        detail: { checked_in_at: existing.checked_in_at },
      });
      req.session.flashInfo = 'Check-in was undone.';
      return res.redirect(back);
    }

    if (registration.status !== 'confirmed') {
      req.session.flashError =
        'Only confirmed participants can be checked in. Confirm the registration first.';
      return res.redirect(back);
    }

    await Attendance.create({
      registration_id: registration.registration_id,
      checked_in_at: new Date(),
      checked_in_by: req.session.user ? req.session.user.user_id : null,
    });
    await logAudit({
      req,
      action: 'attendance.check_in',
      entity: 'REGISTRATION',
      entityId: registration.registration_id,
      detail: { event_id: registration.event_id },
    });

    req.session.flashSuccess = `Participant checked in for registration #${registration.registration_id}.`;
    return res.redirect(back);
  },

  /* -------------------------- REGISTRATION HISTORY ------------------------- */

  /** GET /admin/registrations/:id/history -> status timeline + audit trail */
  async registrationHistory(req, res) {
    const registration = await Registration.findByPk(req.params.id, {
      include: [
        { model: User, as: 'user', attributes: ['user_id', 'full_name', 'email'] },
        { model: Event, as: 'event', include: [eventVenueInclude] },
        { model: Attendance, as: 'attendance', required: false },
      ],
    });
    if (!registration) {
      return res.status(404).render('error', {
        title: 'Registration not found',
        status: 404,
        message: 'That registration does not exist.',
      });
    }

    const changes = await RegistrationStatusChange.findAll({
      where: { registration_id: registration.registration_id },
      include: [{ model: User, as: 'changedBy', attributes: ['full_name', 'email'], required: false }],
      order: [['changed_at', 'ASC'], ['change_id', 'ASC']],
    });

    return res.render('admin/registration-history', {
      title: `History - registration #${registration.registration_id}`,
      registration,
      changes,
    });
  },

  /* --------------------------------- AUDIT -------------------------------- */

  /** GET /admin/audit -> paginated, filterable AUDIT_LOGS browser */
  async auditIndex(req, res) {
    const pageSize = 25;
    const page = Math.max(Number(req.query.page) || 1, 1);
    const q = (req.query.q || '').trim();
    const entity = (req.query.entity || '').trim().toUpperCase();

    const where = {};
    if (entity) where.entity = entity;
    if (q) {
      where[Op.or] = [
        { action: { [Op.like]: `%${q}%` } },
        { entity: { [Op.like]: `%${q}%` } },
        { entity_id: { [Op.like]: `%${q}%` } },
      ];
    }

    const { rows, count } = await AuditLog.findAndCountAll({
      where,
      include: [{ model: User, as: 'actor', attributes: ['user_id', 'full_name', 'email'], required: false }],
      order: [['created_at', 'DESC'], ['log_id', 'DESC']],
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });

    const totalPages = Math.max(Math.ceil(count / pageSize), 1);
    const entities = await AuditLog.findAll({
      attributes: ['entity'],
      group: ['entity'],
      raw: true,
    });

    return res.render('admin/audit', {
      title: 'Audit log',
      rows,
      count,
      page,
      pageSize,
      totalPages,
      q,
      entity,
      entities: entities.map((e) => e.entity),
    });
  },

  /* --------------------------------- VENUES -------------------------------- */

  /** GET /admin/venues -> venue master data + usage counts */
  async venues(req, res) {
    const venues = await Venue.findAll({
      include: [{ model: Event, as: 'events', attributes: ['event_id'], required: false }],
      order: [['name', 'ASC']],
    });
    return res.render('admin/venues', {
      title: 'Venues',
      venues: venues.map((v) => {
        const plain = v.get({ plain: true });
        return { ...plain, eventCount: (plain.events || []).length };
      }),
      errors: [],
      old: {},
    });
  },

  /** POST /admin/venues -> add a venue */
  async createVenue(req, res) {
    const name = (req.body.name || '').trim();
    const city = (req.body.city || '').trim().slice(0, 120);
    const address = (req.body.address || '').trim().slice(0, 255) || null;

    const errors = [];
    if (name.length < 2) errors.push('Venue name must be at least 2 characters.');
    if (name.length > 180) errors.push('Venue name must not exceed 180 characters.');

    const duplicate = await Venue.findOne({ where: { name, city } });
    if (!errors.length && duplicate) {
      errors.push(`"${name}${city ? `, ${city}` : ''}" already exists.`);
    }

    if (errors.length) {
      const venues = await Venue.findAll({
        include: [{ model: Event, as: 'events', attributes: ['event_id'], required: false }],
        order: [['name', 'ASC']],
      });
      return res.status(422).render('admin/venues', {
        title: 'Venues',
        venues: venues.map((v) => {
          const plain = v.get({ plain: true });
          return { ...plain, eventCount: (plain.events || []).length };
        }),
        errors,
        old: { name, city, address },
      });
    }

    const venue = await Venue.create({ name, city, address });
    await logAudit({
      req,
      action: 'venue.create',
      entity: 'VENUE',
      entityId: venue.venue_id,
      detail: { name, city },
    });
    req.session.flashSuccess = `Venue "${venue.displayName()}" was added.`;
    return res.redirect('/admin/venues');
  },

  /** POST /admin/venues/:id/delete -> only when no event uses it */
  async deleteVenue(req, res) {
    const venue = await Venue.findByPk(req.params.id);
    if (!venue) {
      req.session.flashError = 'Venue not found.';
      return res.redirect('/admin/venues');
    }
    const used = await Event.count({ where: { venue_id: venue.venue_id } });
    if (used > 0) {
      req.session.flashError = `"${venue.displayName()}" is used by ${used} event(s) and cannot be deleted.`;
      return res.redirect('/admin/venues');
    }
    await venue.destroy();
    await logAudit({
      req,
      action: 'venue.delete',
      entity: 'VENUE',
      entityId: venue.venue_id,
      detail: { name: venue.name },
    });
    req.session.flashSuccess = `Venue "${venue.displayName()}" was deleted.`;
    return res.redirect('/admin/venues');
  },
};

module.exports = adminController;

/**
 * controllers/adminController.js
 * Dashboard, participants list, attendance generation, CSV export,
 * and user account administration.
 */
const { Op } = require('sequelize');
const { User, Event, Registration, sequelize, getEventCapacity } = require('../models');
const { decorateWithCapacity } = require('./eventController');

function csvEscape(value) {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const adminController = {
  /** GET /admin -> dashboard tiles + capacity table + latest registrations */
  async dashboard(req, res) {
    const [totalEvents, totalUsers, confirmed, waitlisted] = await Promise.all([
      Event.count(),
      User.count(),
      Registration.count({ where: { status: 'confirmed' } }),
      Registration.count({ where: { status: 'waitlisted' } }),
    ]);

    const events = await Event.findAll({ order: [['event_date', 'ASC']] });
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
        seatsOffered: decorated.reduce((s, e) => s + e.max, 0),
        seatsTaken: decorated.reduce((s, e) => s + e.taken, 0),
      },
      events: decorated,
      latest,
    });
  },

  /** GET /admin/events/:id/participants -> registered participants per event */
  async participants(req, res) {
    const event = await Event.findByPk(req.params.id);
    if (!event) {
      return res.status(404).render('error', {
        title: 'Event not found',
        status: 404,
        message: 'That event does not exist.',
      });
    }

    const status = (req.query.status || 'all').toLowerCase();
    const where = { event_id: event.event_id };
    if (status !== 'all') where.status = status;

    const rows = await Registration.findAll({
      where,
      include: [{ model: User, as: 'user', attributes: ['user_id', 'full_name', 'email'] }],
      order: [['registration_date', 'ASC']],
    });

    const [decorated] = await decorateWithCapacity([event]);
    return res.render('admin/participants', {
      title: `Participants - ${event.title}`,
      event: decorated,
      rows,
      status,
    });
  },

  /** POST /admin/registrations/:id/status -> confirm / cancel / waitlist */
  async updateStatus(req, res) {
    const registration = await Registration.findByPk(req.params.id, {
      include: [{ model: Event, as: 'event' }],
    });
    const next = (req.body.status || '').toLowerCase();
    const fallbackUrl = registration
      ? `/admin/events/${registration.event_id}/participants`
      : '/admin/events';
    const redirectUrl = req.get('Referrer') || fallbackUrl;

    if (!registration || !['confirmed', 'waitlisted', 'cancelled'].includes(next)) {
      req.session.flashError = 'Invalid registration update requested.';
      return res.redirect(redirectUrl);
    }

    const previous = registration.status;
    const event = registration.event;

    // Capacity safeguard: prevent setting to 'confirmed' if event is already full
    if (next === 'confirmed' && previous !== 'confirmed') {
      const capacity = await getEventCapacity(event);
      if (capacity.isFull) {
        req.session.flashError = `Cannot confirm registration #${registration.registration_id}: Event is at maximum capacity (${capacity.taken}/${capacity.max} slots). Increase event capacity first to admit more participants.`;
        return res.redirect(redirectUrl);
      }
    }

    await registration.update({ status: next });

    // Auto-promote from waiting list if confirmed slot was cancelled
    let promoted = null;
    if (next === 'cancelled' && previous === 'confirmed') {
      const waiting = await Registration.findOne({
        where: { event_id: registration.event_id, status: 'waitlisted' },
        include: [{ model: User, as: 'user' }],
        order: [['registration_date', 'ASC'], ['registration_id', 'ASC']],
      });
      if (waiting) {
        await waiting.update({ status: 'confirmed' });
        promoted = waiting;
      }
    }

    req.session.flashSuccess = promoted
      ? `Registration #${registration.registration_id} set to "${next}". Waitlisted participant ${promoted.user ? promoted.user.full_name : ''} was automatically promoted to confirmed.`
      : `Registration #${registration.registration_id} set to "${next}".`;

    return res.redirect(fallbackUrl);
  },

  /** GET /admin/events/:id/attendance -> printable attendance list */
  async attendance(req, res) {
    const event = await Event.findByPk(req.params.id);
    if (!event) {
      return res.status(404).render('error', {
        title: 'Event not found',
        status: 404,
        message: 'That event does not exist.',
      });
    }
    const rows = await Registration.findAll({
      where: { event_id: event.event_id, status: 'confirmed' },
      include: [{ model: User, as: 'user', attributes: ['full_name', 'email'] }],
      order: [['registration_date', 'ASC']],
    });
    const [decorated] = await decorateWithCapacity([event]);

    return res.render('admin/attendance', {
      title: `Attendance list - ${event.title}`,
      event: decorated,
      rows,
      generatedAt: new Date(),
    });
  },

  /** GET /admin/events/:id/attendance.csv -> attendance list as CSV download */
  async attendanceCsv(req, res) {
    const event = await Event.findByPk(req.params.id);
    if (!event) {
      return res.status(404).render('error', {
        title: 'Event not found',
        status: 404,
        message: 'That event does not exist.',
      });
    }
    const rows = await Registration.findAll({
      where: { event_id: event.event_id, status: 'confirmed' },
      include: [{ model: User, as: 'user', attributes: ['full_name', 'email'] }],
      order: [['registration_date', 'ASC']],
    });

    const header = ['No.', 'Participant Name', 'Email', 'Registration Date', 'Status', 'Signature'];
    const lines = [header.join(',')];
    rows.forEach((r, i) => {
      lines.push(
        [
          i + 1,
          r.user.full_name,
          r.user.email,
          new Date(r.registration_date).toLocaleString('en-PH'),
          r.status,
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

    await target.update({ role: newRole });
    req.session.flashSuccess = `Role for ${target.full_name} (${target.email}) changed to "${newRole}".`;
    return res.redirect('/admin/users');
  },

  /** POST /admin/users/:id/reset-password -> admin manually resets a user password */
  async adminResetPassword(req, res) {
    const target = await User.findByPk(req.params.id);
    if (!target) {
      req.session.flashError = 'User not found.';
      return res.redirect('/admin/users');
    }

    const tempPassword = (req.body.new_password || '').trim() || 'password123';
    if (tempPassword.length < 6) {
      req.session.flashError = 'Password must be at least 6 characters.';
      return res.redirect('/admin/users');
    }

    target.password = tempPassword;
    target.reset_password_token = null;
    target.reset_password_expires = null;
    await target.save();

    req.session.flashSuccess = `Password for ${target.full_name} was reset to "${tempPassword}".`;
    return res.redirect('/admin/users');
  },
};

module.exports = adminController;

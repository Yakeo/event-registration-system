/**
 * controllers/eventController.js
 * Public event listing/detail page + admin CRUD for events.
 *
 * Venues are a first-class table now: the form either picks an existing
 * VENUES row (venue_id) or creates one from the "new venue" fields, so the
 * venue name/address is stored once instead of being retyped per event.
 */
const { Op } = require('sequelize');
const {
  Event,
  Venue,
  Registration,
  User,
  sequelize,
  dialect,
  eventVenueInclude,
  logAudit,
} = require('../models');
const { validateEvent } = require('../middlewares/validate');
const { queueEventCancellation } = require('../services/notifications');

/**
 * Converts a Date/string to YYYY-MM-DDTHH:MM for <input type="datetime-local">.
 * The value is rendered in Asia/Manila (the timezone used across the UI), not
 * in whatever timezone the Node process happens to run in.
 */
function formatDateTimeLocal(d) {
  if (!d) return '';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/**
 * Parses the timezone-less value submitted by <input type="datetime-local">
 * as Asia/Manila time (UTC+8, no DST), so the instant stored in the database
 * matches what the organiser actually typed.
 */
function parseEventDate(value) {
  if (!value) return value;
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) {
    return new Date(`${raw}:00+08:00`);
  }
  return new Date(raw);
}

/** Escapes LIKE wildcards so a search for "100%" is not a wildcard query. */
function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, (match) => `\\${match}`);
}

/** Adds taken/remaining/isFull/isPast counters to a list of events (2 queries, no N+1). */
async function decorateWithCapacity(events) {
  if (!events.length) return [];
  const ids = events.map((e) => e.event_id);
  const counts = await Registration.findAll({
    attributes: ['event_id', [sequelize.fn('COUNT', sequelize.col('registration_id')), 'taken']],
    where: { event_id: { [Op.in]: ids }, status: 'confirmed' },
    group: ['event_id'],
    raw: true,
  });
  const map = new Map(counts.map((c) => [Number(c.event_id), Number(c.taken)]));
  const now = new Date();

  return events.map((event) => {
    const plain = event.get ? event.get({ plain: true }) : event;
    const taken = map.get(Number(plain.event_id)) || 0;
    const max = Number(plain.max_participants) || 0;
    const eventDate = new Date(plain.event_date);
    const isPast = eventDate < now;
    return {
      ...plain,
      taken,
      max,
      remaining: Math.max(max - taken, 0),
      isFull: taken >= max,
      isPast,
      percent: max ? Math.min(Math.round((taken / max) * 100), 100) : 0,
    };
  });
}

/**
 * Resolves the venue for a submitted event form.
 * - `venue_id` chose an existing venue (validated: it must exist)
 * - otherwise `new_venue_name` (+ optional city/address) find-or-creates one
 * Returns { venueId } or { error }.
 */
async function resolveVenue(body, transaction) {
  const venueId = Number(body.venue_id);
  if (body.venue_id && Number.isInteger(venueId) && venueId > 0) {
    const existing = await Venue.findByPk(venueId, { transaction });
    if (!existing) return { error: 'The selected venue no longer exists. Please choose another one.' };
    return { venueId: existing.venue_id };
  }

  const name = (body.new_venue_name || '').trim();
  if (!name) {
    return { error: 'Venue is required - pick an existing venue or add a new one.' };
  }
  if (name.length < 2 || name.length > 180) {
    return { error: 'Venue name must be 2 to 180 characters.' };
  }

  const city = (body.new_venue_city || '').trim().slice(0, 120);
  const address = (body.new_venue_address || '').trim().slice(0, 255) || null;

  // findOrCreate keeps the UNIQUE(name, city) rule idempotent, so submitting
  // the same venue twice reuses the row instead of failing.
  const [venue] = await Venue.findOrCreate({
    where: sequelize.where(
      sequelize.fn('LOWER', sequelize.col('name')),
      name.toLowerCase()
    ),
    defaults: { name, city, address },
    transaction,
  });
  return { venueId: venue.venue_id };
}

const eventController = {
  // GET  /                 -> public event listing page
  async publicList(req, res) {
    const q = (req.query.q || '').trim();
    const where = {};
    const include = [{ ...eventVenueInclude }];

    if (q) {
      const likeOp = dialect === 'postgres' ? Op.iLike : Op.like;
      const needle = `%${escapeLike(q)}%`;
      where[Op.or] = [
        { title: { [likeOp]: needle } },
        { description: { [likeOp]: needle } },
        { '$venue.name$': { [likeOp]: needle } },
        { '$venue.city$': { [likeOp]: needle } },
      ];
    }

    const events = await Event.findAll({
      where,
      include,
      order: [['event_date', 'ASC']],
      subQuery: false,
    });
    const decorated = await decorateWithCapacity(events);

    return res.render('events/index', {
      title: 'Upcoming Events',
      events: decorated,
      q,
      stats: {
        total: decorated.length,
        open: decorated.filter((e) => !e.isFull && !e.isPast).length,
        openSlots: decorated.filter((e) => !e.isPast).reduce((sum, e) => sum + e.remaining, 0),
      },
    });
  },

  // GET  /events/:id       -> event detail + registration form
  async show(req, res) {
    const event = await Event.findByPk(req.params.id, { include: [eventVenueInclude] });
    if (!event) {
      return res.status(404).render('error', {
        title: 'Event not found',
        status: 404,
        message: 'The event you are looking for does not exist or was deleted.',
      });
    }
    const [decorated] = await decorateWithCapacity([event]);

    const old = {
      full_name: req.session.user ? req.session.user.full_name : '',
      email: req.session.user ? req.session.user.email : '',
    };
    return res.render('events/show', {
      title: decorated.title,
      event: decorated,
      errors: [],
      old,
    });
  },

  // GET  /admin/events     -> admin event management table
  async adminIndex(req, res) {
    const events = await Event.findAll({
      include: [eventVenueInclude],
      order: [['event_date', 'DESC']],
    });
    const decorated = await decorateWithCapacity(events);
    const archivedCount = await Event.count({ paranoid: false, where: { deleted_at: { [Op.ne]: null } } });
    return res.render('admin/events', {
      title: 'Manage events',
      events: decorated,
      archivedCount,
    });
  },

  // GET  /admin/events/new
  async showCreateForm(req, res) {
    const venues = await Venue.findAll({ order: [['name', 'ASC']] });
    return res.render('admin/event-form', {
      title: 'Create event',
      errors: [],
      old: {},
      event: null,
      venues,
      formatDateTimeLocal,
    });
  },

  // POST /admin/events
  async create(req, res) {
    const payload = {
      title: (req.body.title || '').trim(),
      description: (req.body.description || '').trim(),
      event_date: req.body.event_date,
      max_participants: req.body.max_participants,
    };
    const errors = validateEvent(payload, { requireFuture: true });

    let venueId = null;
    const venueResult = await resolveVenue(req.body);
    if (venueResult.error) errors.push(venueResult.error);
    else venueId = venueResult.venueId;

    if (errors.length) {
      const venues = await Venue.findAll({ order: [['name', 'ASC']] });
      return res.status(422).render('admin/event-form', {
        title: 'Create event',
        errors,
        old: { ...req.body, ...payload },
        event: null,
        venues,
        formatDateTimeLocal,
      });
    }

    const event = await Event.create({
      ...payload,
      event_date: parseEventDate(payload.event_date),
      venue_id: venueId,
      max_participants: Number(payload.max_participants),
    });
    await logAudit({
      req,
      action: 'event.create',
      entity: 'EVENT',
      entityId: event.event_id,
      detail: { title: event.title, venue_id: venueId, max_participants: event.max_participants },
    });

    req.session.flashSuccess = `Event "${payload.title}" was created successfully.`;
    return res.redirect('/admin/events');
  },

  // GET  /admin/events/:id/edit
  async showEditForm(req, res) {
    const event = await Event.findByPk(req.params.id, { include: [eventVenueInclude] });
    if (!event) {
      return res.status(404).render('error', {
        title: 'Event not found',
        status: 404,
        message: 'That event does not exist.',
      });
    }
    const venues = await Venue.findAll({ order: [['name', 'ASC']] });
    const plain = event.get({ plain: true });
    return res.render('admin/event-form', {
      title: 'Edit event',
      errors: [],
      old: plain,
      event,
      venues,
      formatDateTimeLocal,
    });
  },

  // PUT  /admin/events/:id
  async update(req, res) {
    const event = await Event.findByPk(req.params.id);
    if (!event) {
      return res.status(404).render('error', {
        title: 'Event not found',
        status: 404,
        message: 'That event does not exist.',
      });
    }

    const payload = {
      title: (req.body.title || '').trim(),
      description: (req.body.description || '').trim(),
      event_date: req.body.event_date,
      max_participants: req.body.max_participants,
    };
    const errors = validateEvent(payload);

    let venueId = event.venue_id;
    const venueResult = await resolveVenue(req.body);
    if (venueResult.error) errors.push(venueResult.error);
    else venueId = venueResult.venueId;

    // Capacity may never be reduced below the confirmed head-count
    const { getEventCapacity } = require('../models');
    const capacity = await getEventCapacity(event);
    if (!errors.length && Number(payload.max_participants) < capacity.taken) {
      errors.push(
        `Maximum participants cannot be lower than the ${capacity.taken} confirmed registration(s).`
      );
    }

    if (errors.length) {
      const venues = await Venue.findAll({ order: [['name', 'ASC']] });
      return res.status(422).render('admin/event-form', {
        title: 'Edit event',
        errors,
        old: { ...req.body, ...payload, event_id: event.event_id, venue_id: venueId },
        event,
        venues,
        formatDateTimeLocal,
      });
    }

    const before = { title: event.title, event_date: event.event_date, venue_id: event.venue_id };
    await event.update({
      ...payload,
      event_date: parseEventDate(payload.event_date),
      venue_id: venueId,
      max_participants: Number(payload.max_participants),
    });
    await logAudit({
      req,
      action: 'event.update',
      entity: 'EVENT',
      entityId: event.event_id,
      detail: {
        before,
        after: { title: event.title, event_date: event.event_date, venue_id: event.venue_id },
      },
    });

    req.session.flashSuccess = `Event "${event.title}" was updated successfully.`;
    return res.redirect('/admin/events');
  },

  // DELETE /admin/events/:id  -> soft delete (history is preserved)
  async destroy(req, res) {
    const event = await Event.findByPk(req.params.id, { include: [eventVenueInclude] });
    if (!event) {
      req.session.flashError = 'Event not found.';
      return res.redirect('/admin/events');
    }
    const { title, event_id } = event;
    const registrationCount = await Registration.count({ where: { event_id } });

    // Soft delete: registrations, attendance and status history stay in the
    // database, the event simply disappears from the listings.
    await event.destroy();

    // Archiving cancels the event for everyone still holding a place, and
    // nobody used to be told. Queue one e-mail per affected participant.
    const affected = await Registration.findAll({
      where: { event_id, status: { [Op.in]: ['confirmed', 'waitlisted'] } },
      include: [{ model: User, as: 'user' }],
    });
    const notified = await queueEventCancellation(event, affected);
    await logAudit({
      req,
      action: 'event.archive',
      entity: 'EVENT',
      entityId: event_id,
      detail: { title, registrations_preserved: registrationCount },
    });

    req.session.flashSuccess =
      `Event "${title}" was archived. Its ${registrationCount} registration(s) and attendance history were preserved, ` +
      `and ${notified} cancellation notice(s) were queued.`;
    return res.redirect('/admin/events');
  },

  // GET  /admin/events/archived -> soft-deleted events (restore)
  async archivedIndex(req, res) {
    const events = await Event.findAll({
      paranoid: false,
      where: { deleted_at: { [Op.ne]: null } },
      include: [eventVenueInclude],
      order: [['event_date', 'DESC']],
    });
    return res.render('admin/archived', {
      title: 'Archived events',
      events: events.map((e) => e.get({ plain: true })),
    });
  },

  // POST /admin/events/:id/restore
  async restore(req, res) {
    const event = await Event.findByPk(req.params.id, { paranoid: false });
    if (!event || !event.deleted_at) {
      req.session.flashError = 'That event is not archived.';
      return res.redirect('/admin/events/archived');
    }
    await event.restore();
    await logAudit({
      req,
      action: 'event.restore',
      entity: 'EVENT',
      entityId: event.event_id,
      detail: { title: event.title },
    });
    req.session.flashSuccess = `Event "${event.title}" was restored.`;
    return res.redirect('/admin/events');
  },
};

module.exports = {
  eventController,
  decorateWithCapacity,
  formatDateTimeLocal,
  parseEventDate,
  escapeLike,
  resolveVenue,
};

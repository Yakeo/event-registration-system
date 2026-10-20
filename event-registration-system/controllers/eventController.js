/**
 * controllers/eventController.js
 * Public event listing/detail page + admin CRUD for events.
 */
const { Op } = require('sequelize');
const { Event, Registration, sequelize, dialect } = require('../models');
const { validateEvent } = require('../middlewares/validate');

/** Converts Date object or string to YYYY-MM-DDTHH:MM for <input type="datetime-local"> */
function formatDateTimeLocal(d) {
  if (!d) return '';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const h = pad(date.getHours());
  const min = pad(date.getMinutes());
  return `${y}-${m}-${day}T${h}:${min}`;
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

const eventController = {
  // GET  /                 -> public event listing page
  async publicList(req, res) {
    const q = (req.query.q || '').trim();
    const where = {};
    if (q) {
      const likeOp = dialect === 'postgres' ? Op.iLike : Op.like;
      where[Op.or] = [
        { title: { [likeOp]: `%${q}%` } },
        { venue: { [likeOp]: `%${q}%` } },
        { description: { [likeOp]: `%${q}%` } },
      ];
    }
    const events = await Event.findAll({ where, order: [['event_date', 'ASC']] });
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
    const event = await Event.findByPk(req.params.id);
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
    const events = await Event.findAll({ order: [['event_date', 'DESC']] });
    const decorated = await decorateWithCapacity(events);
    return res.render('admin/events', { title: 'Manage events', events: decorated });
  },

  // GET  /admin/events/new
  showCreateForm(req, res) {
    return res.render('admin/event-form', {
      title: 'Create event',
      errors: [],
      old: {},
      event: null,
      formatDateTimeLocal,
    });
  },

  // POST /admin/events
  async create(req, res) {
    const payload = {
      title: (req.body.title || '').trim(),
      description: (req.body.description || '').trim(),
      event_date: req.body.event_date,
      venue: (req.body.venue || '').trim(),
      max_participants: req.body.max_participants,
    };
    const errors = validateEvent(payload);
    if (errors.length) {
      return res.status(422).render('admin/event-form', {
        title: 'Create event',
        errors,
        old: payload,
        event: null,
        formatDateTimeLocal,
      });
    }

    await Event.create({ ...payload, max_participants: Number(payload.max_participants) });
    req.session.flashSuccess = `Event "${payload.title}" was created successfully.`;
    return res.redirect('/admin/events');
  },

  // GET  /admin/events/:id/edit
  async showEditForm(req, res) {
    const event = await Event.findByPk(req.params.id);
    if (!event) {
      return res.status(404).render('error', {
        title: 'Event not found',
        status: 404,
        message: 'That event does not exist.',
      });
    }
    const plain = event.get({ plain: true });
    return res.render('admin/event-form', {
      title: 'Edit event',
      errors: [],
      old: plain,
      event,
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
      venue: (req.body.venue || '').trim(),
      max_participants: req.body.max_participants,
    };
    const errors = validateEvent(payload);

    // Capacity may never be reduced below the confirmed head-count
    const { getEventCapacity } = require('../models');
    const capacity = await getEventCapacity(event);
    if (!errors.length && Number(payload.max_participants) < capacity.taken) {
      errors.push(
        `Maximum participants cannot be lower than the ${capacity.taken} confirmed registration(s).`
      );
    }

    if (errors.length) {
      return res.status(422).render('admin/event-form', {
        title: 'Edit event',
        errors,
        old: { ...payload, event_id: event.event_id },
        event,
        formatDateTimeLocal,
      });
    }

    await event.update({ ...payload, max_participants: Number(payload.max_participants) });
    req.session.flashSuccess = `Event "${event.title}" was updated successfully.`;
    return res.redirect('/admin/events');
  },

  // DELETE /admin/events/:id
  async destroy(req, res) {
    const event = await Event.findByPk(req.params.id);
    if (!event) {
      req.session.flashError = 'Event not found.';
      return res.redirect('/admin/events');
    }
    const title = event.title;
    await sequelize.transaction(async (t) => {
      await Registration.destroy({ where: { event_id: event.event_id }, transaction: t });
      await event.destroy({ transaction: t });
    });
    req.session.flashSuccess = `Event "${title}" and its registrations were deleted.`;
    return res.redirect('/admin/events');
  },
};

module.exports = { eventController, decorateWithCapacity, formatDateTimeLocal };

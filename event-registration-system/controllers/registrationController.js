/**
 * controllers/registrationController.js
 * Implements the system registration workflow and business rules:
 *
 *   1. Capacity limit enforcement (atomic check within transaction)
 *   2. Duplicate prevention (one registration per email per event)
 *   3. Re-registration capability (safely reactivates cancelled records)
 *   4. Past event protection (blocks registration on concluded events)
 *   5. Automatic waitlist promotion upon cancellation
 */
const { Op } = require('sequelize');
const { User, Event, Registration, sequelize, dialect, getEventCapacity } = require('../models');
const { validateRegistration, normalizeEmail } = require('../middlewares/validate');

/** Renders the event page again with validation errors. */
async function rerenderWithErrors(req, res, eventId, errors, old, status = 422) {
  const event = await Event.findByPk(eventId);
  if (!event) {
    return res.status(404).render('error', {
      title: 'Event not found',
      status: 404,
      message: 'That event does not exist.',
    });
  }
  const { decorateWithCapacity } = require('./eventController');
  const [decorated] = await decorateWithCapacity([event]);
  return res.status(status).render('events/show', {
    title: decorated.title,
    event: decorated,
    errors,
    old,
  });
}

const registrationController = {
  /**
   * POST /events/:id/register
   * "Enter participant details" -> validate -> check capacity -> save -> confirm
   */
  async store(req, res) {
    const eventId = Number(req.params.id);
    const full_name = (req.body.full_name || '').trim();
    const email = normalizeEmail(req.body.email);

    const event = await Event.findByPk(eventId);
    if (!event) {
      return res.status(404).render('error', {
        title: 'Event not found',
        status: 404,
        message: 'That event does not exist.',
      });
    }

    /* ---------- 0. PAST EVENT CHECK ---------------------------------- */
    if (new Date(event.event_date) < new Date()) {
      return res.status(400).render('error', {
        title: 'Registration closed',
        status: 400,
        message: 'Registration is closed because this event has already concluded.',
      });
    }

    /* ---------- 1. PRELIMINARY CAPACITY CHECK ----------------------- */
    const capacity = await getEventCapacity(event);
    if (capacity.isFull) {
      return res.status(409).render('events/full', {
        title: 'Event full',
        event,
        capacity,
        joinWaitlist: true,
      });
    }

    /* ---------- 2. VALIDATE email + required fields ------------------ */
    const errors = validateRegistration({ full_name, email });
    if (errors.length) {
      return rerenderWithErrors(req, res, eventId, errors, { full_name, email });
    }

    /* ---------- 3. DUPLICATE CHECK (same email, same event) ---------- */
    const existingUser = await User.findOne({ where: { email } });
    let existingReg = null;
    if (existingUser) {
      existingReg = await Registration.findOne({
        where: { event_id: eventId, user_id: existingUser.user_id },
      });
      // Active duplicate (confirmed or waitlisted)
      if (existingReg && existingReg.status !== 'cancelled') {
        return res.status(409).render('events/duplicate', {
          title: 'Already registered',
          event,
          participant: { full_name: existingUser.full_name, email },
          registration: existingReg,
        });
      }
    }

    /* ---------- 4. SAVE REGISTRATION (transaction + locking) -------- */
    let registration;
    let isReactivation = false;
    try {
      registration = await sequelize.transaction(async (t) => {
        // Concurrency control: Lock the parent Event row (cross-dialect safe)
        const lockedEvent = await Event.findByPk(eventId, {
          transaction: t,
          lock: dialect === 'sqlite' ? undefined : t.LOCK.UPDATE,
        });

        // Re-check capacity inside transaction to guarantee no overbooking
        const taken = await Registration.count({
          where: { event_id: eventId, status: 'confirmed' },
          transaction: t,
        });

        if (taken >= Number(lockedEvent.max_participants)) {
          const err = new Error('EVENT_FULL');
          err.code = 'EVENT_FULL';
          throw err;
        }

        // Reuse existing participant or create new one
        let user = existingUser;
        if (!user) {
          user = await User.create(
            {
              full_name,
              email,
              password: Math.random().toString(36).slice(-10) + 'Aa1!',
              role: 'participant',
            },
            { transaction: t }
          );
        }

        // Check if there is an existing cancelled registration to reactivate
        const priorReg =
          existingReg ||
          (await Registration.findOne({
            where: { event_id: eventId, user_id: user.user_id },
            transaction: t,
          }));

        if (priorReg) {
          // Reactivate cancelled registration record
          await priorReg.update(
            {
              status: 'confirmed',
              registration_date: new Date(),
            },
            { transaction: t }
          );
          isReactivation = true;
          return priorReg;
        }

        // Fresh registration
        return Registration.create(
          {
            user_id: user.user_id,
            event_id: eventId,
            registration_date: new Date(),
            status: 'confirmed',
          },
          { transaction: t }
        );
      });
    } catch (err) {
      if (err.code === 'EVENT_FULL') {
        const fresh = await getEventCapacity(event);
        return res.status(409).render('events/full', {
          title: 'Event full',
          event,
          capacity: fresh,
          joinWaitlist: true,
        });
      }
      if (err.name === 'SequelizeUniqueConstraintError') {
        return res.status(409).render('events/duplicate', {
          title: 'Already registered',
          event,
          participant: { full_name, email },
        });
      }
      throw err;
    }

    /* ---------- 5. CONFIRMATION ------------------------------------- */
    const updated = await getEventCapacity(event);
    req.session.flashSuccess = isReactivation
      ? `Registration reactivated and confirmed for ${event.title}.`
      : `Registration confirmed for ${event.title}.`;

    return res.status(201).render('events/confirmation', {
      title: 'Registration confirmed',
      event,
      participant: { full_name, email },
      registration,
      capacity: updated,
      isNewAccount: !existingUser,
    });
  },

  /**
   * POST /events/:id/waitlist
   * Waitlist enrollment when event has reached maximum capacity.
   */
  async waitlist(req, res) {
    const eventId = Number(req.params.id);
    const full_name = (req.body.full_name || '').trim();
    const email = normalizeEmail(req.body.email);

    const event = await Event.findByPk(eventId);
    if (!event) {
      return res.status(404).render('error', {
        title: 'Event not found',
        status: 404,
        message: 'That event does not exist.',
      });
    }

    if (new Date(event.event_date) < new Date()) {
      return res.status(400).render('error', {
        title: 'Registration closed',
        status: 400,
        message: 'The waiting list is closed because this event has already concluded.',
      });
    }

    const errors = validateRegistration({ full_name, email });
    const capacity = await getEventCapacity(event);
    if (errors.length) {
      return rerenderWithErrors(req, res, eventId, errors, { full_name, email });
    }

    let user = await User.findOne({ where: { email } });
    const isNewAccount = !user;
    if (!user) {
      user = await User.create({
        full_name,
        email,
        password: Math.random().toString(36).slice(-10) + 'Aa1!',
        role: 'participant',
      });
    }

    const existing = await Registration.findOne({
      where: { event_id: eventId, user_id: user.user_id },
    });

    let registration;
    if (existing) {
      if (existing.status !== 'cancelled') {
        return res.status(409).render('events/duplicate', {
          title: 'Already registered',
          event,
          participant: { full_name: user.full_name, email },
          registration: existing,
        });
      }
      // Reactivate cancelled registration into waitlisted
      await existing.update({
        status: 'waitlisted',
        registration_date: new Date(),
      });
      registration = existing;
    } else {
      registration = await Registration.create({
        user_id: user.user_id,
        event_id: eventId,
        registration_date: new Date(),
        status: 'waitlisted',
      });
    }

    req.session.flashSuccess = 'You have been added to the waiting list.';
    return res.status(201).render('events/confirmation', {
      title: 'Added to waiting list',
      event,
      participant: { full_name, email },
      registration,
      capacity,
      isNewAccount,
    });
  },

  /** POST /registrations/:id/cancel  (participant cancels own registration) */
  async cancel(req, res) {
    const registration = await Registration.findByPk(req.params.id, {
      include: [{ model: Event, as: 'event' }],
    });
    if (!registration) {
      req.session.flashError = 'Registration not found.';
      return res.redirect('/my-registrations');
    }
    const isOwner = req.session.user && req.session.user.user_id === registration.user_id;
    const isAdmin = req.session.user && req.session.user.role === 'admin';
    if (!isOwner && !isAdmin) {
      return res.status(403).render('error', {
        title: 'Access denied',
        status: 403,
        message: 'You can only cancel your own registration.',
      });
    }

    const previousStatus = registration.status;
    await registration.update({ status: 'cancelled' });

    // Promote the earliest person on the waiting list into the freed slot
    let promoted = null;
    if (previousStatus === 'confirmed') {
      const next = await Registration.findOne({
        where: { event_id: registration.event_id, status: 'waitlisted' },
        include: [{ model: User, as: 'user' }],
        order: [['registration_date', 'ASC'], ['registration_id', 'ASC']],
      });
      if (next) {
        await next.update({ status: 'confirmed' });
        promoted = next;
      }
    }

    req.session.flashSuccess = promoted
      ? `Registration cancelled. Participant ${promoted.user ? promoted.user.full_name : ''} on the waiting list was automatically promoted to confirmed.`
      : 'Registration cancelled. The slot is now available.';

    return res.redirect(
      isAdmin && !isOwner
        ? `/admin/events/${registration.event_id}/participants`
        : '/my-registrations'
    );
  },
};

module.exports = registrationController;

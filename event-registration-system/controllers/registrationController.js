/**
 * controllers/registrationController.js
 * Implements the system registration workflow and business rules:
 *
 *   1. Capacity limit enforcement (atomic check within transaction)
 *   2. Duplicate prevention (one registration per email per event)
 *   3. Re-registration capability (safely reactivates cancelled records)
 *   4. Past event protection (blocks registration on concluded events)
 *   5. Automatic waitlist promotion upon cancellation
 *
 * Every state change that touches capacity runs inside a transaction, and
 * the waitlist promotion helper re-counts confirmed seats before promoting -
 * otherwise two simultaneous cancellations could each promote a person and
 * overbook the event.
 */
const {
  User,
  Event,
  Registration,
  sequelize,
  dialect,
  eventVenueInclude,
  getEventCapacity,
  logStatusChange,
} = require('../models');
const { validateRegistration, normalizeEmail } = require('../middlewares/validate');
const crypto = require('crypto');
const { Op } = require('sequelize');
const { queue, payloadFor, link } = require('../services/notifications');

/**
 * The account that triggered a public registration action, when it is a
 * signed-in participant acting on their own e-mail. Otherwise null (anonymous
 * visitor), which is how the history distinguishes "self-service" from admin
 * actions.
 */
function actorIdFor(req, email) {
  const user = req.session ? req.session.user : null;
  if (!user) return null;
  return normalizeEmail(user.email) === normalizeEmail(email) ? user.user_id : null;
}

/** Row lock that is a no-op on SQLite (single writer, no FOR UPDATE support). */
function lockOption(transaction) {
  return dialect === 'sqlite' ? undefined : transaction.LOCK.UPDATE;
}

/** Renders the event page again with validation errors. */
async function rerenderWithErrors(req, res, eventId, errors, old, status = 422) {
  const event = await Event.findByPk(eventId, { include: [eventVenueInclude] });
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

/**
 * Number of people ahead of this registration in the waiting-list queue.
 * Uses the same ordering as promoteFromWaitlist (registration_date, then id),
 * so the number shown to the participant is the one that will actually apply.
 */
async function waitlistPosition(registration, transaction = null) {
  const ahead = await Registration.count({
    where: {
      event_id: registration.event_id,
      status: 'waitlisted',
      ...(registration.registration_date
        ? {
            [Op.or]: [
              { registration_date: { [Op.lt]: registration.registration_date } },
              {
                registration_date: registration.registration_date,
                registration_id: { [Op.lte]: registration.registration_id },
              },
            ],
          }
        : {}),
    },
    transaction,
  });
  return ahead;
}

/**
 * Queues the confirmation e-mail for a registration.
 *
 * Called INSIDE the caller's transaction: the mail row, the registration and
 * the status-history row all commit together, so a crash can never produce a
 * booking whose e-mail was silently skipped.
 *
 * A brand-new participant gets 'account_claim' instead of a plain receipt: the
 * account was created with a random password nobody saw, so this is the only
 * way they can ever log in. The token is written through the transaction (not
 * user.generateResetToken(), which saves on its own connection and would block
 * behind the row we are holding).
 */
async function notifyRegistration({
  transaction,
  event,
  user,
  registration,
  isNewAccount = false,
  actorId = null,
}) {
  const extra = {};
  if (registration.status === 'waitlisted') {
    extra.waitlist_position = await waitlistPosition(registration, transaction);
  }

  let kind = registration.status === 'waitlisted' ? 'waitlisted' : 'registration_confirmed';

  if (isNewAccount) {
    const rawToken = crypto.randomBytes(32).toString('hex');
    user.reset_password_token = User.hashResetToken(rawToken);
    user.reset_password_expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    await user.save({ transaction });
    extra.claim_url = link(`/reset-password/${rawToken}`);
    kind = 'account_claim';
  }

  return queue({
    kind,
    email: user.email,
    userId: user.user_id,
    registrationId: registration.registration_id,
    eventId: event.event_id,
    payload: payloadFor({
      event,
      participant: user,
      registration,
      extra: { ...extra, actor_id: actorId },
    }),
    transaction,
  });
}

/**
 * Promotes the earliest waitlisted registration into a free confirmed seat.
 * Must be called inside a transaction. Returns the promoted row or null.
 */
async function promoteFromWaitlist(eventId, transaction) {
  const event = await Event.findByPk(eventId, {
    include: [eventVenueInclude],
    transaction,
    lock: lockOption(transaction),
  });
  if (!event) return null;

  // Never auto-promote for an event that has already happened.
  if (new Date(event.event_date) <= new Date()) return null;

  const taken = await Registration.count({
    where: { event_id: eventId, status: 'confirmed' },
    transaction,
  });
  if (taken >= Number(event.max_participants)) return null;

  const next = await Registration.findOne({
    where: { event_id: eventId, status: 'waitlisted' },
    include: [{ model: User, as: 'user' }],
    order: [['registration_date', 'ASC'], ['registration_id', 'ASC']],
    transaction,
    lock: lockOption(transaction),
  });
  if (!next) return null;

  await next.update({ status: 'confirmed' }, { transaction });
  // Automatic promotion: changed_by stays NULL so the history shows the system
  // did it, not an administrator.
  await logStatusChange({
    registrationId: next.registration_id,
    from: 'waitlisted',
    to: 'confirmed',
    actorId: null,
    reason: 'Automatically promoted from the waiting list',
    transaction,
  });

  // Tell the person who just got a seat. This is the notification that used to
  // be missing entirely: people were promoted and never found out.
  await queue({
    kind: 'promoted',
    email: next.user.email,
    userId: next.user.user_id,
    registrationId: next.registration_id,
    eventId: event.event_id,
    payload: payloadFor({
      event,
      participant: next.user,
      registration: next,
      extra: {
        capacity_taken: taken + 1,
        capacity_max: Number(event.max_participants),
      },
    }),
    transaction,
  });

  return next;
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

    const event = await Event.findByPk(eventId, { include: [eventVenueInclude] });
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
      const outcome = await sequelize.transaction(async (t) => {
        // Concurrency control: Lock the parent Event row (cross-dialect safe)
        const lockedEvent = await Event.findByPk(eventId, {
          transaction: t,
          lock: lockOption(t),
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
        let createdUser = false;
        if (!user) {
          createdUser = true;
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
          // A concurrent request may have reactivated it already.
          if (priorReg.status !== 'cancelled') {
            return { conflict: true, registration: priorReg };
          }
          await priorReg.update(
            {
              status: 'confirmed',
              registration_date: new Date(),
            },
            { transaction: t }
          );
          await logStatusChange({
            registrationId: priorReg.registration_id,
            from: 'cancelled',
            to: 'confirmed',
            actorId: actorIdFor(req, email),
            reason: 'Participant re-registered after cancelling',
            transaction: t,
          });
          isReactivation = true;
          await notifyRegistration({
            transaction: t,
            event,
            user,
            registration: priorReg,
            isNewAccount: createdUser,
            actorId: actorIdFor(req, email),
          });
          return { registration: priorReg };
        }

        // Fresh registration
        const created = await Registration.create(
          {
            user_id: user.user_id,
            event_id: eventId,
            registration_date: new Date(),
            status: 'confirmed',
          },
          { transaction: t }
        );
        await logStatusChange({
          registrationId: created.registration_id,
          from: null,
          to: 'confirmed',
          actorId: actorIdFor(req, email),
          reason: 'Online registration',
          transaction: t,
        });
        await notifyRegistration({
          transaction: t,
          event,
          user,
          registration: created,
          isNewAccount: createdUser,
          actorId: actorIdFor(req, email),
        });
        return { registration: created };
      });

      if (outcome.conflict) {
        return res.status(409).render('events/duplicate', {
          title: 'Already registered',
          event,
          participant: { full_name, email },
          registration: outcome.registration,
        });
      }
      registration = outcome.registration;
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
   * Waitlist enrollment. Only permitted once the event is actually full -
   * otherwise a visitor could park themselves on the waiting list while
   * confirmed seats are still available.
   */
  async waitlist(req, res) {
    const eventId = Number(req.params.id);
    const full_name = (req.body.full_name || '').trim();
    const email = normalizeEmail(req.body.email);

    const event = await Event.findByPk(eventId, { include: [eventVenueInclude] });
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
    if (errors.length) {
      return rerenderWithErrors(req, res, eventId, errors, { full_name, email });
    }

    const capacity = await getEventCapacity(event);
    if (!capacity.isFull) {
      return rerenderWithErrors(
        req,
        res,
        eventId,
        ['Seats are still available for this event - please use the registration form instead of the waiting list.'],
        { full_name, email },
        409
      );
    }

    const outcome = await sequelize.transaction(async (t) => {
      const lockedEvent = await Event.findByPk(eventId, { transaction: t, lock: lockOption(t) });
      const taken = await Registration.count({
        where: { event_id: eventId, status: 'confirmed' },
        transaction: t,
      });
      if (taken < Number(lockedEvent.max_participants)) {
        return { seatsOpen: true };
      }

      let user = await User.findOne({ where: { email }, transaction: t });
      const isNewAccount = !user;
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

      const existing = await Registration.findOne({
        where: { event_id: eventId, user_id: user.user_id },
        transaction: t,
      });

      if (existing && existing.status !== 'cancelled') {
        return { conflict: true, registration: existing, user };
      }

      if (existing) {
        // Reactivate cancelled registration into waitlisted
        await existing.update(
          { status: 'waitlisted', registration_date: new Date() },
          { transaction: t }
        );
        await logStatusChange({
          registrationId: existing.registration_id,
          from: 'cancelled',
          to: 'waitlisted',
          actorId: actorIdFor(req, email),
          reason: 'Joined the waiting list',
          transaction: t,
        });
        await notifyRegistration({
          transaction: t,
          event,
          user,
          registration: existing,
          isNewAccount,
          actorId: actorIdFor(req, email),
        });
        return { registration: existing, user, isNewAccount };
      }

      const registration = await Registration.create(
        {
          user_id: user.user_id,
          event_id: eventId,
          registration_date: new Date(),
          status: 'waitlisted',
        },
        { transaction: t }
      );
      await logStatusChange({
        registrationId: registration.registration_id,
        from: null,
        to: 'waitlisted',
        actorId: actorIdFor(req, email),
        reason: 'Joined the waiting list',
        transaction: t,
      });
      await notifyRegistration({
        transaction: t,
        event,
        user,
        registration,
        isNewAccount,
        actorId: actorIdFor(req, email),
      });
      return { registration, user, isNewAccount };
    });

    if (outcome.seatsOpen) {
      return rerenderWithErrors(
        req,
        res,
        eventId,
        ['A seat just became available - please submit the registration form instead.'],
        { full_name, email },
        409
      );
    }

    if (outcome.conflict) {
      return res.status(409).render('events/duplicate', {
        title: 'Already registered',
        event,
        participant: { full_name: outcome.user.full_name, email },
        registration: outcome.registration,
      });
    }

    req.session.flashSuccess = 'You have been added to the waiting list.';
    return res.status(201).render('events/confirmation', {
      title: 'Added to waiting list',
      event,
      participant: { full_name, email },
      registration: outcome.registration,
      capacity,
      isNewAccount: outcome.isNewAccount,
    });
  },

  /** POST /registrations/:id/cancel  (participant cancels own registration) */
  async cancel(req, res) {
    const preview = await Registration.findByPk(req.params.id);
    if (!preview) {
      req.session.flashError = 'Registration not found.';
      return res.redirect('/my-registrations');
    }

    const isOwner = req.session.user && req.session.user.user_id === preview.user_id;
    const isAdmin = req.session.user && req.session.user.role === 'admin';
    if (!isOwner && !isAdmin) {
      return res.status(403).render('error', {
        title: 'Access denied',
        status: 403,
        message: 'You can only cancel your own registration.',
      });
    }

    const redirectTo =
      isAdmin && !isOwner
        ? `/admin/events/${preview.event_id}/participants`
        : '/my-registrations';

    const outcome = await sequelize.transaction(async (t) => {
      const registration = await Registration.findByPk(req.params.id, {
        transaction: t,
        lock: lockOption(t),
      });
      if (!registration) return { notFound: true };
      if (registration.status === 'cancelled') return { alreadyCancelled: true };

      const previousStatus = registration.status;
      await registration.update({ status: 'cancelled' }, { transaction: t });
      await logStatusChange({
        registrationId: registration.registration_id,
        from: previousStatus,
        to: 'cancelled',
        actorId: req.session.user ? req.session.user.user_id : null,
        reason: isAdmin && !isOwner ? 'Cancelled by an administrator' : 'Cancelled by the participant',
        transaction: t,
      });

      // Confirm the cancellation to whoever asked for it.
      const owner = await User.findByPk(registration.user_id, { transaction: t });
      if (owner) {
        const cancelEvent = await Event.findByPk(registration.event_id, {
          include: [eventVenueInclude],
          transaction: t,
        });
        await queue({
          kind: 'registration_cancelled',
          email: owner.email,
          userId: owner.user_id,
          registrationId: registration.registration_id,
          eventId: registration.event_id,
          payload: payloadFor({
            event: cancelEvent,
            participant: owner,
            registration,
            extra: {
              reason: isAdmin && !isOwner
                ? 'Cancelled by an administrator'
                : 'Cancelled by the participant',
            },
          }),
          transaction: t,
        });
      }

      // Promote the earliest person on the waiting list into the freed slot
      let promoted = null;
      if (previousStatus === 'confirmed') {
        promoted = await promoteFromWaitlist(registration.event_id, t);
      }
      return { promoted, previousStatus };
    });

    if (outcome.notFound) {
      req.session.flashError = 'Registration not found.';
      return res.redirect('/my-registrations');
    }
    if (outcome.alreadyCancelled) {
      req.session.flashInfo = 'That registration was already cancelled.';
      return res.redirect(redirectTo);
    }

    req.session.flashSuccess = outcome.promoted
      ? `Registration cancelled. Participant ${
          outcome.promoted.user ? outcome.promoted.user.full_name : ''
        } on the waiting list was automatically promoted to confirmed.`
      : 'Registration cancelled. The slot is now available.';

    return res.redirect(redirectTo);
  },
};

module.exports = registrationController;
module.exports.promoteFromWaitlist = promoteFromWaitlist;

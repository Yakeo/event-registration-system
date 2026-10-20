/**
 * controllers/manageController.js
 * Passwordless self-service for guests: GET/POST `/r/:token`.
 *
 * Possession of the link in the confirmation e-mail is the proof of identity,
 * so no session is required. The three actions are:
 *
 *   GET  /r/:token          view the registration (+ set a password, optionally)
 *   POST /r/:token/cancel   cancel it (runs the same engine as the logged-in flow)
 *   POST /r/:token/claim    set a password, which turns the guest into an account
 *
 * Security notes:
 *  - Tokens are 32 random bytes; only their SHA-256 digest is stored.
 *  - Rendering the page does NOT consume the token (people reload it); only a
 *    state-changing action does, inside its transaction.
 *  - An invalid, expired or consumed token all render the same page, so the
 *    response never reveals which of those it was.
 */
const {
  Event,
  sequelize,
  eventVenueInclude,
  getEventCapacity,
  logAudit,
} = require('../models');
const { cancelRegistration } = require('./registrationController');
const manageTokens = require('../services/manageTokens');
const { validatePassword, normalizeEmail } = require('../middlewares/validate');
const { regenerateSession } = require('../middlewares/auth');

/** Loads the event for a registration so the view can show venue/date. */
async function withEvent(registration) {
  if (!registration) return null;
  return Event.findByPk(registration.event_id, { include: [eventVenueInclude] });
}

function invalidLink(res) {
  return res.status(400).render('error', {
    title: 'Link not valid',
    status: 400,
    message:
      'This link is not valid, has expired, or has already been used. ' +
      'Request a fresh one from the Forgot Password page, or register again.',
  });
}

const manageController = {
  // GET /r/:token
  async show(req, res) {
    const found = await manageTokens.verify(req.params.token);
    if (!found) return invalidLink(res);

    const { token, user, registration, expired, used } = found;
    if (expired || !registration) return invalidLink(res);

    const event = await withEvent(registration);

    return res.render('manage/show', {
      title: 'Manage your registration',
      token: req.params.token,
      // The link stays usable after a state change so the page can be reloaded,
      // but we tell the person when it has already been spent.
      used,
      registration,
      event,
      participant: user,
      capacity: await getEventCapacity(event),
      errors: [],
      notice: null,
    });
  },

  // POST /r/:token/cancel
  async cancel(req, res) {
    const found = await manageTokens.verify(req.params.token);
    if (!found || found.expired || !found.registration) return invalidLink(res);

    const { token, registration } = found;

    const outcome = await cancelRegistration({
      registrationId: registration.registration_id,
      actorId: null, // the guest has no account row they are logged in as
      reason: 'Cancelled by the participant via the emailed manage link',
    });

    // Consume the link only when it actually changed something.
    if (!outcome.alreadyCancelled && !outcome.notFound) {
      await manageTokens.consumeFor(token);
    }

    const event = await withEvent(registration);

    return res.render('manage/cancelled', {
      title: outcome.alreadyCancelled ? 'Already cancelled' : 'Registration cancelled',
      alreadyCancelled: Boolean(outcome.alreadyCancelled),
      promoted: outcome.promoted || null,
      registration,
      event,
      participant: found.user,
    });
  },

  // POST /r/:token/claim
  async claim(req, res) {
    const found = await manageTokens.verify(req.params.token);
    if (!found || found.expired) return invalidLink(res);

    const { token, user, registration } = found;
    const password = req.body.password || '';
    const confirm_password = req.body.confirm_password || '';

    const errors = validatePassword(password, confirm_password);

    // The event may already have an account with a password (someone who
    // registered earlier, then registered again as a guest): never overwrite it
    // from a link alone.
    if (user.password) {
      errors.push(
        'This account already has a password. Use Forgot Password if you need to change it.'
      );
    }

    const event = await withEvent(registration);

    if (errors.length) {
      return res.status(422).render('manage/show', {
        title: 'Manage your registration',
        token: req.params.token,
        used: Boolean(token.used_at),
        registration,
        event,
        participant: user,
        capacity: await getEventCapacity(event),
        errors,
        notice: null,
      });
    }

    await sequelize.transaction(async (t) => {
      user.password = password;
      user.claimed_at = new Date();
      // Setting a password supersedes any pending reset link.
      user.reset_password_token = null;
      user.reset_password_expires = null;
      await user.save({ transaction: t });
      await manageTokens.consumeFor(token, t);
    });

    await logAudit({
      req,
      actorId: user.user_id,
      action: 'user.account_claimed',
      entity: 'USER',
      entityId: user.user_id,
      detail: { email: user.email, via: 'manage-link' },
    });

    // Log them straight in: they just proved control of the inbox and chose a
    // password, so a second login form would be busy-work.
    await regenerateSession(req);
    req.session.user = {
      user_id: user.user_id,
      full_name: user.full_name,
      email: normalizeEmail(user.email),
      role: user.role,
    };
    req.session.flashSuccess =
      'Password set. You can now log in any time to see all of your registrations.';
    return res.redirect('/my-registrations');
  },
};

module.exports = manageController;

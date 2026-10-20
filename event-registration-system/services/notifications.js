/**
 * services/notifications.js
 * The transactional outbox: build a payload, render it, queue it.
 *
 * `queue()` is called *inside* the transaction that performs the state change,
 * so the notification row and the change it describes commit together. Nothing
 * here talks to a network: delivery is the worker's job.
 */
const path = require('path');
const ejs = require('ejs');

const { Notification } = require('../models');
const format = require('../config/format');

const TEMPLATE = path.join(__dirname, '..', 'views', 'emails', 'notification.ejs');

function appUrl() {
  return (process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
}

function link(pathname) {
  return `${appUrl()}${pathname}`;
}

/* ------------------------------- view model ------------------------------- */

const STATUS_LABELS = {
  confirmed: 'Confirmed',
  waitlisted: 'Waitlisted',
  cancelled: 'Cancelled',
  pending: 'Pending approval',
  rejected: 'Not approved',
};

/**
 * Turns the stored payload into everything the template needs.
 * Kept as pure data so the same function can render the queued e-mail and the
 * admin preview, guaranteeing they are identical.
 */
function contentFor(kind, payload = {}) {
  const eventTitle = payload.event_title || 'the event';
  const rows = [];

  if (payload.reference) rows.push(['Reference no.', payload.reference]);
  if (payload.event_title) rows.push(['Event', payload.event_title]);
  if (payload.event_date) rows.push(['Date & time', format.fmtDate(payload.event_date)]);
  if (payload.venue_name) rows.push(['Venue', payload.venue_name]);
  if (payload.status) rows.push(['Status', STATUS_LABELS[payload.status] || payload.status]);
  if (payload.waitlist_position) rows.push(['Position in queue', `#${payload.waitlist_position}`]);
  if (payload.capacity_taken !== undefined && payload.capacity_max) {
    rows.push(['Slots filled', `${payload.capacity_taken} / ${payload.capacity_max}`]);
  }
  if (payload.reason) rows.push(['Reason', payload.reason]);

  // Guest self-service: when the registration e-mail carries a manage link,
  // that is the primary button - it is the credential, not a decoration.
  const manageCta = payload.manage_url
    ? { label: 'Manage this registration', url: payload.manage_url }
    : null;
  const viewCta = payload.event_id
    ? { label: 'View event details', url: link(`/events/${payload.event_id}`) }
    : null;

  const base = { tone: 'info', rows, footnote: null, cta: null, secondary: null };

  switch (kind) {
    case 'registration_confirmed':
      return {
        ...base,
        tone: 'success',
        subject: `Registration confirmed — ${eventTitle}`,
        heading: 'Your slot is confirmed',
        intro: `Hi ${payload.participant_name || 'there'}, your registration for ${eventTitle} has been confirmed. Please keep the reference number below for verification upon entry.`,
        cta: manageCta || viewCta,
        secondary: manageCta ? viewCta : null,
        footnote: manageCta
          ? 'That link is personal — keep it to view or cancel this registration. No password needed.'
          : null,
      };

    case 'waitlisted':
      return {
        ...base,
        tone: 'warning',
        subject: `You are on the waiting list — ${eventTitle}`,
        heading: 'You are on the waiting list',
        intro: `Hi ${payload.participant_name || 'there'}, ${eventTitle} is currently at full capacity, so you have been placed on the official waiting list. If a confirmed participant cancels, the earliest person in the queue is promoted automatically and you will be e-mailed straight away.`,
        cta: manageCta || viewCta,
        secondary: manageCta ? viewCta : null,
        footnote: manageCta
          ? 'Use that link to check your position or leave the waiting list.'
          : null,
      };

    case 'promoted':
      return {
        ...base,
        tone: 'success',
        subject: `A seat opened up — you are confirmed for ${eventTitle}`,
        heading: 'A seat opened up',
        intro: `Hi ${payload.participant_name || 'there'}, a confirmed participant cancelled their slot, so you have been promoted from the waiting list and your registration for ${eventTitle} is now confirmed. No further action is needed.`,
        cta: viewCta,
      };

    case 'status_changed':
      return {
        ...base,
        subject: `Your registration was updated — ${eventTitle}`,
        heading: 'Your registration was updated',
        intro: `Hi ${payload.participant_name || 'there'}, an organiser changed the status of your registration for ${eventTitle}. The new status is shown below.`,
        cta: { label: 'View event details', url: link(`/events/${payload.event_id || ''}`) },
      };

    case 'registration_cancelled':
      return {
        ...base,
        subject: `Registration cancelled — ${eventTitle}`,
        heading: 'Your registration was cancelled',
        intro: `Hi ${payload.participant_name || 'there'}, your registration for ${eventTitle} has been cancelled and your slot has been released. If this was a mistake you can register again while seats remain.`,
        cta: { label: 'View event details', url: link(`/events/${payload.event_id || ''}`) },
      };

    case 'event_cancelled':
      return {
        ...base,
        tone: 'warning',
        subject: `Event cancelled — ${eventTitle}`,
        heading: 'This event has been cancelled',
        intro: `Hi ${payload.participant_name || 'there'}, ${eventTitle} has been cancelled by the organiser and your registration is no longer active. We are sorry for the inconvenience.`,
        footnote: 'No further action is required — nothing will be charged and your details are not shared with third parties.',
      };

    case 'password_reset':
      return {
        ...base,
        rows: [],
        subject: payload.is_new_account
          ? 'Set a password for your EventReg account'
          : 'Reset your EventReg password',
        heading: payload.is_new_account ? 'Set a password' : 'Reset your password',
        intro: payload.is_new_account
          ? `Hi ${payload.participant_name || 'there'}, an account already exists for ${payload.email || 'your address'} from a previous registration, but it has no password yet. Choose one below to log in and see all your registrations.`
          : `Hi ${payload.participant_name || 'there'}, we received a request to reset the password for ${payload.email || 'your account'}. This link expires in one hour and can only be used once.`,
        cta: { label: 'Choose a new password', url: payload.reset_url || link('/forgot-password') },
        footnote: 'If you did not request this, you can safely ignore this e-mail — your password will not change.',
      };

    case 'account_claim': {
      // The person registered without an account; this message is both the
      // receipt and the way in. Wording follows the actual status.
      const waiting = payload.status === 'waitlisted';
      return {
        ...base,
        tone: waiting ? 'warning' : 'success',
        subject: waiting
          ? `You are on the waiting list for ${eventTitle}`
          : `Your registration for ${eventTitle} is confirmed`,
        heading: waiting ? 'You are on the waiting list' : 'Your registration is confirmed',
        intro: waiting
          ? `Hi ${payload.participant_name || 'there'}, ${eventTitle} is at full capacity, so you have been placed on the official waiting list. A profile was created for ${payload.email || 'your e-mail address'} — the link below is how you check your position or cancel.`
          : `Hi ${payload.participant_name || 'there'}, your registration for ${eventTitle} is confirmed. A profile was created for ${payload.email || 'your e-mail address'}. The link below is yours: use it to view or cancel this registration, or to set a password if you would rather log in.`,
        cta: manageCta || { label: 'Set your password', url: payload.claim_url || link('/forgot-password') },
        secondary: manageCta ? viewCta : null,
        footnote: 'No password is required — keep this link private, because anyone who has it can manage the booking.',
      };
    }

    default:
      return {
        ...base,
        subject: `Update from EventReg — ${eventTitle}`,
        heading: 'An update about your registration',
        intro: payload.summary || 'There is an update about your registration.',
      };
  }
}

async function render(kind, payload) {
  const view = contentFor(kind, payload);
  const html = await ejs.renderFile(TEMPLATE, { ...view, payload }, { async: false });
  const textLines = [view.heading, '', view.intro, ''];
  for (const [label, value] of view.rows) textLines.push(`${label}: ${value}`);
  if (view.cta) textLines.push('', `${view.cta.label}: ${view.cta.url}`);
  if (view.secondary) textLines.push(`${view.secondary.label}: ${view.secondary.url}`);
  if (view.footnote) textLines.push('', view.footnote);
  textLines.push('', '— EventReg, Online Event Registration System');
  return { subject: view.subject, html, text: textLines.join('\n'), view };
}

/* --------------------------------- queueing -------------------------------- */

/**
 * Writes one row to NOTIFICATIONS.
 * Pass `transaction` to keep it atomic with the change being announced.
 */
async function queue({
  kind,
  email,
  userId = null,
  registrationId = null,
  eventId = null,
  payload = {},
  transaction = null,
}) {
  if (!email) throw new Error(`Notification "${kind}" needs a recipient e-mail.`);

  return Notification.create(
    {
      kind,
      email,
      user_id: userId,
      registration_id: registrationId,
      event_id: eventId,
      payload: JSON.stringify(payload),
      status: 'queued',
      attempts: 0,
      created_at: new Date(),
    },
    { transaction }
  );
}

/**
 * Convenience wrapper used by the controllers: takes Sequelize rows and builds
 * the payload so callers never hand-assemble JSON.
 */
function payloadFor({ event, participant, registration, extra = {} }) {
  return {
    participant_name: participant && participant.full_name ? participant.full_name : null,
    email: participant && participant.email ? participant.email : null,
    event_id: event ? event.event_id : null,
    event_title: event ? event.title : null,
    event_date: event && event.event_date ? new Date(event.event_date).toISOString() : null,
    venue_name: event ? format.venueName(event.venue) : null,
    reference: registration && registration.referenceCode ? registration.referenceCode() : null,
    status: registration ? registration.status : null,
    ...extra,
  };
}

/** One e-mail per confirmed/waitlisted registrant on an event about to vanish. */
async function queueEventCancellation(event, registrations, transaction) {
  let queued = 0;
  for (const registration of registrations) {
    const user = registration.user;
    if (!user || !user.email) continue;
    if (registration.status === 'cancelled') continue;

    await queue({
      kind: 'event_cancelled',
      email: user.email,
      userId: user.user_id,
      registrationId: registration.registration_id,
      eventId: event.event_id,
      payload: payloadFor({ event, participant: user, registration }),
      transaction,
    });
    queued += 1;
  }
  return queued;
}

module.exports = { queue, render, contentFor, payloadFor, queueEventCancellation, appUrl, link };

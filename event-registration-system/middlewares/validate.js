/**
 * middlewares/validate.js
 * Reusable validation routines for inputs, events, and authentication.
 *
 * Every length limit mirrors the matching column size in models/ and
 * docs/schema.sql, so oversized input is rejected with a friendly 422
 * instead of surfacing as a database error (HTTP 500).
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const LIMITS = {
  full_name: 120,
  email: 160,
  title: 180,
  venue: 180,
  description: 10000,
  passwordMaxBytes: 72, // bcrypt only uses the first 72 bytes
  maxParticipants: 100000,
};

function validateRegistration({ full_name, email }) {
  const errors = [];
  if (!full_name || !full_name.trim()) {
    errors.push('Participant name is required.');
  } else if (full_name.trim().length < 2) {
    errors.push('Participant name must be at least 2 characters long.');
  } else if (full_name.trim().length > LIMITS.full_name) {
    errors.push(`Participant name must not exceed ${LIMITS.full_name} characters.`);
  }

  if (!email || !email.trim()) {
    errors.push('Email address is required.');
  } else if (!EMAIL_RE.test(email.trim())) {
    errors.push('Please enter a valid email address (e.g. juan@email.com).');
  } else if (email.trim().length > LIMITS.email) {
    errors.push(`Email address must not exceed ${LIMITS.email} characters.`);
  }
  return errors;
}

/**
 * Validates the event fields. The venue is *not* validated here any more: it is
 * either `venue_id` (a VENUES foreign key) or the "new venue" fields, both
 * resolved by eventController.resolveVenue().
 *
 * @param {object} event
 * @param {{ requireFuture?: boolean }} [options] - when creating an event the
 *   start date must be in the future; existing (historical) events may still
 *   be edited while keeping their original date.
 */
function validateEvent({ title, description, event_date, max_participants }, options = {}) {
  const errors = [];
  if (!title || !title.trim()) {
    errors.push('Event title is required.');
  } else if (title.trim().length > LIMITS.title) {
    errors.push(`Event title must not exceed ${LIMITS.title} characters.`);
  }

  if (description && String(description).length > LIMITS.description) {
    errors.push(`Event description must not exceed ${LIMITS.description} characters.`);
  }

  if (!event_date) {
    errors.push('Event date and time is required.');
  } else {
    const parsedDate = new Date(event_date);
    if (Number.isNaN(parsedDate.getTime())) {
      errors.push('Please provide a valid date and time.');
    } else if (options.requireFuture && parsedDate <= new Date()) {
      errors.push('The event date and time must be in the future.');
    }
  }

  const max = Number(max_participants);
  if (max_participants === '' || max_participants === undefined || Number.isNaN(max)) {
    errors.push('Maximum participants is required.');
  } else if (!Number.isInteger(max) || max < 1) {
    errors.push('Maximum participants must be a whole number of at least 1.');
  } else if (max > LIMITS.maxParticipants) {
    errors.push(`Maximum participants must not exceed ${LIMITS.maxParticipants}.`);
  }
  return errors;
}

function validatePassword(password, confirmPassword = null) {
  const errors = [];
  if (!password || password.length < 6) {
    errors.push('Password must be at least 6 characters long.');
  } else if (Buffer.byteLength(password, 'utf8') > LIMITS.passwordMaxBytes) {
    // bcrypt silently ignores everything after 72 bytes, so two different
    // long passwords could otherwise authenticate the same account.
    errors.push(`Password must not exceed ${LIMITS.passwordMaxBytes} bytes.`);
  }
  if (confirmPassword !== null && password !== confirmPassword) {
    errors.push('Password confirmation does not match.');
  }
  return errors;
}

/**
 * Admin password changes are not "create a password" flows: do not restrict
 * the length beyond bcrypt's hard 72-byte input limit.
 */
function validateAdminPassword(password) {
  const errors = [];
  if (!password || password.length < 6) {
    errors.push('Password must be at least 6 characters long.');
  } else if (Buffer.byteLength(password, 'utf8') > LIMITS.passwordMaxBytes) {
    errors.push(`Password must not exceed ${LIMITS.passwordMaxBytes} bytes.`);
  }
  return errors;
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

module.exports = {
  validateRegistration,
  validateEvent,
  validatePassword,
  validateAdminPassword,
  normalizeEmail,
  EMAIL_RE,
  LIMITS,
};

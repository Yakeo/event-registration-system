/**
 * middlewares/validate.js
 * Reusable validation routines for inputs, events, and authentication.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validateRegistration({ full_name, email }) {
  const errors = [];
  if (!full_name || !full_name.trim()) {
    errors.push('Participant name is required.');
  } else if (full_name.trim().length < 2) {
    errors.push('Participant name must be at least 2 characters long.');
  }

  if (!email || !email.trim()) {
    errors.push('Email address is required.');
  } else if (!EMAIL_RE.test(email.trim())) {
    errors.push('Please enter a valid email address (e.g. juan@email.com).');
  }
  return errors;
}

function validateEvent({ title, event_date, venue, max_participants }) {
  const errors = [];
  if (!title || !title.trim()) errors.push('Event title is required.');
  if (!event_date) {
    errors.push('Event date and time is required.');
  } else {
    const parsedDate = new Date(event_date);
    if (Number.isNaN(parsedDate.getTime())) {
      errors.push('Please provide a valid date and time.');
    }
  }

  if (!venue || !venue.trim()) errors.push('Venue is required.');
  const max = Number(max_participants);
  if (max_participants === '' || max_participants === undefined || Number.isNaN(max)) {
    errors.push('Maximum participants is required.');
  } else if (!Number.isInteger(max) || max < 1) {
    errors.push('Maximum participants must be a whole number of at least 1.');
  }
  return errors;
}

function validatePassword(password, confirmPassword = null) {
  const errors = [];
  if (!password || password.length < 6) {
    errors.push('Password must be at least 6 characters long.');
  }
  if (confirmPassword !== null && password !== confirmPassword) {
    errors.push('Password confirmation does not match.');
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
  normalizeEmail,
  EMAIL_RE,
};

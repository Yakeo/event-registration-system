/**
 * config/format.js
 * Display helpers shared by the EJS views (via app.locals) and by the e-mail
 * templates (rendered outside Express, where res.locals does not exist).
 *
 * Keeping one implementation means a date in an e-mail is formatted exactly
 * like the same date on the page it confirms.
 */

const TIME_ZONE = 'Asia/Manila';

function toDate(value) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Venue may be a VENUES row, a plain object, or a legacy string. */
function venueName(value) {
  if (!value) return '-';
  const venue = value.venue !== undefined ? value.venue : value;
  if (!venue) return '-';
  if (typeof venue === 'string') return venue;
  const name = venue.name || '';
  const city = venue.city || '';
  if (!name) return '-';
  return city ? `${name}, ${city}` : name;
}

module.exports = {
  TIME_ZONE,
  venueName: venueName,

  money: (v) => Number(v || 0).toLocaleString(),

  fmtDate: (d) => {
    const parsed = toDate(d);
    if (!parsed) return '-';
    return parsed.toLocaleString('en-PH', {
      timeZone: TIME_ZONE,
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  },

  fmtDateOnly: (d) => {
    const parsed = toDate(d);
    if (!parsed) return '-';
    return parsed.toLocaleDateString('en-PH', { timeZone: TIME_ZONE, dateStyle: 'medium' });
  },

  fmtTimeOnly: (d) => {
    const parsed = toDate(d);
    if (!parsed) return '-';
    return parsed.toLocaleTimeString('en-PH', { timeZone: TIME_ZONE, timeStyle: 'short' });
  },

  /** `2026-10-30T14:00` in Manila time - the value datetime-local inputs want. */
  formatDateTimeLocal: (d) => {
    const date = toDate(d);
    if (!date) return '';
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: TIME_ZONE,
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
  },
};

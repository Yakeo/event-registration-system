/**
 * server.js - application entry point
 * Node.js 18+ / Express / Sequelize / EJS  (MVC Architecture)
 */
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const methodOverride = require('method-override');

const { sequelize, dialect, Session } = require('./models');
const { exposeUser, csrfProtection } = require('./middlewares/auth');
const { SequelizeSessionStore } = require('./config/sessionStore');
const routes = require('./routes');

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';
const DEV_SESSION_SECRET = 'event-registration-dev-only-secret';

if (isProduction && !process.env.SESSION_SECRET) {
  // Never boot production with a secret that is public in the repository.
  throw new Error('SESSION_SECRET must be set when NODE_ENV=production.');
}

/* ------------------------------ VIEW ENGINE ------------------------------- */
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.disable('x-powered-by');
// Required so secure cookies work behind the preview/reverse proxy.
app.set('trust proxy', 1);

/* ------------------------------- MIDDLEWARE ------------------------------- */
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  // No inline <script>/onclick handlers anywhere in views; styles are inline
  // only for capacity-bar widths, so style-src keeps 'unsafe-inline'.
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "img-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self'",
      "font-src 'self'",
      "connect-src 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "object-src 'none'",
    ].join('; ')
  );
  if (isProduction) {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  next();
});

app.use(express.urlencoded({ extended: true, limit: '100kb' }));
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(methodOverride('_method')); // lets HTML forms send PUT / DELETE
// Sessions live in the SESSIONS table by default (survives restarts and can be
// shared by several processes); SESSION_STORE=memory restores the old
// behaviour for local experiments.
const sessionStore =
  process.env.SESSION_STORE === 'memory' ? undefined : new SequelizeSessionStore();

app.use(
  session({
    name: 'eventreg.sid',
    secret: process.env.SESSION_SECRET || DEV_SESSION_SECRET,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction,
      maxAge: 1000 * 60 * 60 * 8,
    },
  })
);
app.use(exposeUser);
app.use(csrfProtection); // every POST/PUT/PATCH/DELETE needs the form token

if (!sessionStore) {
  console.warn(
    '[WARN] SESSION_STORE=memory - sessions are lost on restart and are not shared ' +
      'between processes.'
  );
}

/* ------------------------------- APP LOCALS ------------------------------- */
// Safe defaults so a template that renders before the session middleware runs
// (e.g. a body-parser error) cannot blow up on an undefined variable.
app.locals.currentUser = null;
app.locals.flash = { success: null, error: null, info: null };
app.locals.csrfToken = '';
/**
 * Venue display helper. `event.venue` is the associated VENUES row (or null if
 * a query did not include it); older call sites passed a plain string.
 */
app.locals.venueName = (value) => {
  if (!value) return '-';
  const venue = value.venue !== undefined ? value.venue : value;
  if (!venue) return '-';
  if (typeof venue === 'string') return venue;
  const name = venue.name || '';
  const city = venue.city || '';
  if (!name) return '-';
  return city ? `${name}, ${city}` : name;
};

app.locals.money = (v) => Number(v || 0).toLocaleString();
app.locals.fmtDate = (d) => {
  if (!d) return '-';
  const parsed = new Date(d);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
};
app.locals.fmtDateOnly = (d) => {
  if (!d) return '-';
  const parsed = new Date(d);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium' });
};
app.locals.fmtTimeOnly = (d) => {
  if (!d) return '-';
  const parsed = new Date(d);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', timeStyle: 'short' });
};
app.locals.formatDateTimeLocal = (d) => {
  if (!d) return '';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  // Render in the same timezone the rest of the UI uses (Asia/Manila).
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
};

/* -------------------------------- ROUTES ---------------------------------- */
app.use('/', routes);

/* ------------------------------- 404 / 500 -------------------------------- */
app.use((req, res) => {
  res.status(404).render('error', {
    title: 'Page not found',
    status: 404,
    message: `No route matches ${req.originalUrl}`,
  });
});

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status || 500;
  if (status >= 500) {
    console.error('\n[SERVER ERROR]', err.message);
    if (process.env.NODE_ENV !== 'production') console.error(err.stack);
  } else {
    // Expected 4xx (expired CSRF token, bad input) - no stack trace noise.
    console.warn(`[${status}] ${req.method} ${req.originalUrl} - ${err.message}`);
  }
  res.status(err.status || 500).render('error', {
    title:
      err.status === 403
        ? 'Request rejected'
        : err.status === 400
          ? 'Bad request'
          : 'Server error',
    status: err.status || 500,
    message:
      process.env.NODE_ENV === 'production'
        ? 'Something went wrong on our side.'
        : err.message,
  });
});

/* ------------------------------- BOOTSTRAP -------------------------------- */
async function start() {
  // SQLite needs its storage directory to exist before Sequelize opens the file
  const storage = sequelize.options.storage;
  if (dialect === 'sqlite' && storage && !storage.startsWith('file:')) {
    fs.mkdirSync(path.dirname(storage), { recursive: true });
  }

  await sequelize.authenticate();
  console.log(`✔ Database connected (dialect: ${dialect})`);

  await sequelize.sync(); // creates / updates every table defined in models/
  console.log(
    `✔ Models synchronised (USERS, VENUES, EVENTS, REGISTRATIONS, ATTENDANCE, ` +
      `REGISTRATION_STATUS_CHANGES, AUDIT_LOGS, SESSIONS)`
  );
  if (sessionStore) {
    sessionStore.startCleanup();
    console.log('✔ Sessions persisted in the SESSIONS table');
  }

  return new Promise((resolve) => {
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`✔ Event Registration System running on http://localhost:${PORT}`);
      resolve(server);
    });
  });
}

if (require.main === module) {
  start().catch((err) => {
    console.error('✖ Failed to start:', err);
    process.exit(1);
  });
}

module.exports = { app, start, sessionStore };

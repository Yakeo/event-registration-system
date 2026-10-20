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
const { getNotificationWorker } = require('./services/notificationWorker');
const mailer = require('./services/mailer');
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

// Drains the NOTIFICATIONS outbox. MAIL_WORKER=off leaves rows queued, which is
// what the admin "retry" button and the tests use.
const notificationWorker = getNotificationWorker();

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
const format = require('./config/format');

/**
 * Venue display helper. `event.venue` is the associated VENUES row (or null if
 * a query did not include it); older call sites passed a plain string.
 * Shared with the e-mail templates so both render the same text.
 */
app.locals.venueName = format.venueName;

app.locals.money = format.money;
app.locals.fmtDate = format.fmtDate;
app.locals.fmtDateOnly = format.fmtDateOnly;
app.locals.fmtTimeOnly = format.fmtTimeOnly;
app.locals.formatDateTimeLocal = format.formatDateTimeLocal;

/* ------------------------------- HEALTHCHECK ------------------------------ */
// Registered before the routes so it never needs a session, a CSRF token or a
// database round-trip beyond a trivial query: that is what an uptime monitor
// and a load balancer need to answer "is this instance alive?".
app.get('/healthz', async (req, res) => {
  try {
    await sequelize.query('SELECT 1');
    return res.json({
      status: 'ok',
      dialect,
      notifications: process.env.MAIL_TRANSPORT || 'console',
      uptime: Math.round(process.uptime()),
    });
  } catch (err) {
    return res.status(503).json({ status: 'degraded', error: err.message });
  }
});

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

  if (notificationWorker) {
    notificationWorker.start();
    console.log(`✔ Notification worker started (transport: ${mailer.currentTransport()})`);
  }

  return new Promise((resolve) => {
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`✔ Event Registration System running on http://localhost:${PORT}`);
      resolve(server);
    });
  });
}

if (require.main === module) {
  start()
    .then((server) => {
      // Graceful shutdown: stop taking new connections, give in-flight
      // requests a moment to finish, then release the database pool. Without
      // this a Ctrl+C or a deploy can cut a registration transaction in half.
      const shutdown = async (signal) => {
        console.log(`\n${signal} received - shutting down`);
        if (notificationWorker) notificationWorker.stop();
        if (sessionStore) sessionStore.stopCleanup();
        server.close(async () => {
          try {
            await sequelize.close();
          } catch (err) {
            console.warn('Could not close the database pool:', err.message);
          }
          process.exit(0);
        });
        // Do not hang forever on a stuck socket.
        setTimeout(() => process.exit(1), 10000).unref();
      };

      process.on('SIGTERM', () => shutdown('SIGTERM'));
      process.on('SIGINT', () => shutdown('SIGINT'));
    })
    .catch((err) => {
      console.error('✖ Failed to start:', err);
      process.exit(1);
    });
}

module.exports = { app, start, sessionStore, notificationWorker };

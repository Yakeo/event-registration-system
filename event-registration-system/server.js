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

const { sequelize, dialect } = require('./models');
const { exposeUser } = require('./middlewares/auth');
const routes = require('./routes');

const app = express();
const PORT = process.env.PORT || 3000;

/* ------------------------------ VIEW ENGINE ------------------------------- */
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

/* ------------------------------- MIDDLEWARE ------------------------------- */
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(methodOverride('_method')); // lets HTML forms send PUT / DELETE
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'event-registration-dev-secret-key-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 8 },
  })
);
app.use(exposeUser);

/* ------------------------------- APP LOCALS ------------------------------- */
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
  const pad = (n) => String(n).padStart(2, '0');
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const h = pad(date.getHours());
  const min = pad(date.getMinutes());
  return `${y}-${m}-${day}T${h}:${min}`;
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
  console.error('\n[SERVER ERROR]', err.message);
  if (process.env.NODE_ENV !== 'production') console.error(err.stack);
  res.status(err.status || 500).render('error', {
    title: 'Server error',
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
  if (dialect === 'sqlite' && storage) fs.mkdirSync(path.dirname(storage), { recursive: true });

  await sequelize.authenticate();
  console.log(`✔ Database connected (dialect: ${dialect})`);

  await sequelize.sync(); // creates / updates USERS, EVENTS, REGISTRATIONS
  console.log('✔ Models synchronised (USERS, EVENTS, REGISTRATIONS)');

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

module.exports = { app, start };

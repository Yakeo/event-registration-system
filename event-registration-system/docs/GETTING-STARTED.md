# Getting started — how this project actually runs

Written for someone who inherited this codebase. Short version: **there is no
database server to install, and there is no migration step.** The app creates
its own database file the first time it starts.

---

## 1. The 30-second mental model

```
npm start ──► node server.js
                 │
                 ├─ connect to SQLite file: database/event_registration.sqlite
                 ├─ sequelize.sync()  ──► CREATE TABLE IF NOT EXISTS × 10
                 └─ listen on http://localhost:3000
```

* **Stack:** Node.js 18+ · Express · Sequelize (ORM) · EJS templates. MVC layout:
  `routes/` → `controllers/` → `models/` → `views/`.
* **Database:** SQLite by default — a single file at
  `database/event_registration.sqlite`. No MySQL/Postgres server, no Docker,
  no username/password.
* **Schema creation:** `sequelize.sync()` in `server.js` runs on every boot and
  creates any missing table. There are **no migration files** in this project —
  the models in `models/` are the source of truth.
* **Seed data:** the committed `.sqlite` file is **already seeded** (18 users,
  7 venues, 11 events, 77 registrations, 20 check-ins, status history, audit
  rows and outbox history). A fresh clone can just `npm start`. See
  [`DEMO-DATA.md`](./DEMO-DATA.md) for a map of which row demonstrates what.
* **E-mail:** an outbox table plus a background worker, not inline SMTP. The
  default `MAIL_TRANSPORT=console` writes `.eml` files to `tmp/outbox/`, so the
  whole notification flow works with no mail account. See
  [`NOTIFICATIONS.md`](./NOTIFICATIONS.md).

---

## 2. Run it (what I would do)

```bash
cd event-registration-system        # the folder with package.json
npm install                         # once
npm start                           # http://localhost:3000
```

Then log in with a seeded account:

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@eventreg.test` | `admin123` |
| Second admin / organiser | `organizer@eventreg.test` | `organizer123` |
| Participant | `maria@email.com` | `maria123` |
| Any other participant | `juan@email.com` … `ella@email.com` | `password123` |

`npm run dev` is the same thing with auto-restart on file changes.

> No `.env` is required — `config/database.js` falls back to SQLite and a dev
> session secret. Copy `.env.example` to `.env` only if you want to change
> something (port, secret, MySQL/Postgres).

---

## 3. Initialising the database from scratch

Three different things people mean by "initialise":

| Goal | Command | What it does |
|------|---------|--------------|
| **Start clean, with demo data** (recommended) | `npm run seed` | **Drops every table**, recreates them, inserts the 18 users / 7 venues / 11 events / 77 registrations / 20 check-ins / status history / audit rows. |
| **Start clean, empty** | `npm run reset` | Drops and recreates the tables with no rows. You then create the first admin yourself (see below). |
| **Just create missing tables** | `npm start` | `sync()` creates whatever is missing and leaves existing data alone. |

⚠️ **`npm run seed` is destructive** — it calls `sequelize.drop()`. Anything you
entered in the UI is gone. That is also why the seeder prints the demo logins at
the end.

To run with a throw-away database (so your real one is untouched):

```bash
DB_STORAGE=/tmp/scratch.sqlite npm run seed
DB_STORAGE=/tmp/scratch.sqlite npm start
```

### Creating the first admin on an empty database

There is no signup-for-admin screen (by design). Either run `npm run seed`, or:

Save this as `create-admin.js` in the project root and run `node create-admin.js`:

```js
// create-admin.js — creates the first administrator on an empty database.
// Do NOT hard-code DB_STORAGE here: let config/database.js read .env, so
// `DB_STORAGE=/tmp/scratch.sqlite node create-admin.js` targets the right file.
const { User, sequelize } = require('./models');

(async () => {
  await sequelize.sync();               // creates the tables if they are missing
  await User.create({
    full_name: 'System Administrator',
    email: 'admin@local.test',
    password: 'admin123',               // hashed by the model's beforeSave hook
    role: 'admin',
  });
  console.log('admin created — log in with admin@local.test / admin123');
  await sequelize.close();
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
```

Then change the password from `/change-password` after the first login, and
delete the script (or keep it out of git).

(The model's `beforeSave` hook bcrypt-hashes the password, so you pass plaintext.)

---

## 4. npm scripts

| Script | Command | Notes |
|--------|---------|-------|
| `npm start` | `node server.js` | Creates missing tables, starts on port 3000. |
| `npm run dev` | `node --watch server.js` | Auto-restart on save. |
| `npm run seed` | `node seeders/seed.js` | **Destructive** reset + demo data (incl. outbox history). |
| `npm run reset` | `node seeders/reset.js` | **Destructive** reset, no data. |
| `npm test` | `node --test test/system.test.js` | 38 tests on an **in-memory** DB — it never touches `database/` (or MySQL). |

---

## 5. Looking inside the database

It is a normal SQLite file, so any SQLite tool works:

```bash
sqlite3 database/event_registration.sqlite
.tables
.schema REGISTRATIONS
select email, role from USERS;
```

Or without the CLI:

```bash
node -e "
const s = require('./models').sequelize;
s.query('select email, role from USERS').then(([r]) => { console.log(r); return s.close(); });
"
```

The tables are `USERS`, `VENUES`, `EVENTS`, `REGISTRATIONS`, `ATTENDANCE`,
`REGISTRATION_STATUS_CHANGES`, `AUDIT_LOGS`, `SESSIONS`. Their relationships are
in `docs/ERD.svg` (image: `docs/ERD.png`) and the MySQL DDL is in
`docs/schema.sql`.

---

## 6. Switching to MySQL or PostgreSQL

Put this in `.env` (copy from `.env.example`) and restart — no code changes:

```ini
DB_DIALECT=mysql          # or postgres
DB_NAME=event_registration
DB_USER=root
DB_PASS=
DB_HOST=127.0.0.1
DB_PORT=3306
```

Create the empty database first (`CREATE DATABASE event_registration;`), then
run `npm run seed` once to build the tables and demo rows. The MySQL DDL in
`docs/schema.sql` is the same schema if you prefer to create it by hand.

---

## 6b. Health check

```bash
curl http://localhost:3000/healthz
# {"status":"ok","dialect":"sqlite","notifications":"console","uptime":12}
```

`503` means the database connection is down. Point an uptime monitor (or a
panel member's browser) at it.

---

## 7. Tour: what to click first

1. `/` — public listing with capacity bars; try the search.
2. `/events/5` — the full event → shows the waiting-list form instead of registration.
3. Log in as **maria** → `/my-registrations` → cancel one and watch the waitlist
   auto-promote (the promoted person is recorded in the status timeline).
4. Log in as **admin** → `/admin`: dashboard, then
   `/admin/events/5/attendance` (check-in / undo),
   `/admin/registrations/10/history` (status timeline),
   `/admin/audit` (every admin action),
   `/admin/venues`, `/admin/events/archived`.

---

## 8. When it goes wrong (the errors you will actually hit)

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Error: listen EADDRINUSE: address already in use 0.0.0.0:3000` | An old server is still running. | `pkill -f "node server.js"` (macOS/Linux) or `npx kill-port 3000`; or start on another port: `PORT=3001 npm start`. |
| `npm install` fails while building `sqlite3` (`node-gyp` / `gyp ERR!`) | No prebuilt binary for your Node version/OS, and no C++ toolchain. | Use Node 18/20 LTS (`nvm use 20`), or install build tools (`apt install build-essential python3`, macOS: `xcode-select --install`), then `npm rebuild sqlite3`. |
| `Your form session expired. Please reload the page and try again.` (HTTP 403) | CSRF token mismatch — the form was open before a restart, or the session expired. | Reload the page and resubmit. This is the CSRF guard working, not a bug. |
| Everyone is logged out after a restart | Only happens if `SESSION_STORE=memory`. | Sessions normally live in the `SESSIONS` table, so this should not occur; check `.env`. |
| "I entered data and it disappeared" | `npm run seed` / `npm run reset` were run — they drop the tables. | Don't seed a database you care about; use `DB_STORAGE=/tmp/...` for experiments. |
| `npm test` deleted my data | It can't any more — the suite forces `DB_STORAGE=:memory:`. | If you wrote your own script, point it at a scratch `DB_STORAGE`. |
| Login says "Too many failed login attempts…" (429) | Per-account lockout: 5 failures / 15 min. | Wait 15 minutes, or restart the server (counters are in memory). |
| Blank page / template error mentioning `csrfToken` or `flash` | A view rendered before the session middleware (e.g. a malformed request body). | Harmless defaults exist in `server.js`; check the console for the real error. |

---

## 9. Where the code lives (so you can navigate it)

```
server.js            Express app: middleware, sessions, CSRF, routes, 404/500
config/database.js   which database + how to connect
config/sessionStore.js  sessions stored in the SESSIONS table
models/              one file per table + models/index.js (associations)
controllers/         request handling and every business rule
routes/index.js      URL → controller map (+ rate limiters)
middlewares/         auth/CSRF, validation, rate limiting
views/               EJS templates (events/, admin/, auth/)
seeders/             demo data and destructive reset
test/                25-test suite (in-memory DB)
docs/                ERD, data dictionary, schema.sql, DATABASE-AUDIT.md
```

The audit report (`docs/DATABASE-AUDIT.md`) explains *why* the schema looks the
way it does, including what was broken in the original version.

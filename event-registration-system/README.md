# Event Registration System

A production-ready, academic-defense-approved **Online Event Registration System** built with the **MVC** architectural pattern using **Node.js + Express + Sequelize (ORM) + MySQL/PostgreSQL/SQLite** and **EJS** views. Organisers create events, the public browses events, and participants register online — featuring strict capacity limits, duplicate-prevention, automated waitlist promotion, cryptographic **Forgot & Reset Password**, admin account controls, printable attendance lists, and CSV export.

---

## 1. System Requirements

| # | Requirement | Version used | Purpose |
|---|-------------|--------------|---------|
| 1 | **Node.js** | 18+ (tested on 20 LTS) | JavaScript runtime for the server |
| 2 | **Express.js** | ^4.19 | HTTP server, routing, middleware pipeline |
| 3 | **Sequelize (ORM)** | ^6.37 | Models, associations, validations, migrations/sync |
| 4 | **MySQL / PostgreSQL / SQLite** | MySQL 8 / PostgreSQL 14+ / SQLite 3 | Relational database (SQLite default for zero-setup) |
| 5 | **Database driver** | `mysql2`, `pg` + `pg-hstore`, `sqlite3` | Sequelize dialect drivers |
| 6 | **EJS + HTML/CSS/JS** | EJS ^3.1 | Server-side rendered views |
| 7 | **Bcrypt & Crypto** | `bcryptjs` + Node `crypto` | Password hashing (salt rounds) & secure token generation |

> The project ships with SQLite as the **default** dialect so it runs anywhere with zero database server setup.
> Switch to MySQL or PostgreSQL by changing two lines in `.env` — no code changes are required.

---

## 2. Project Structure (MVC)

```
event-registration-system/
├── config/
│   └── database.js              # Sequelize connection factory (sqlite | mysql | postgres)
├── models/                      # ---------- MODEL ----------
│   ├── index.js                 # loads models + defines associations + capacity helpers
│   ├── User.js                  # USERS          (user_id, email, password, role, reset token)
│   ├── Event.js                 # EVENTS         (event_id, title, date, venue, capacity)
│   └── Registration.js          # REGISTRATIONS  (registration_id, user_id, event_id, status)
├── controllers/                 # --------- CONTROLLER --------
│   ├── eventController.js       # public listing, detail, admin CRUD, timezone-safe input
│   ├── registrationController.js# registration transaction, duplicate prevention, waitlist, cancel
│   ├── adminController.js       # dashboard, participants, attendance list + CSV, user management
│   └── authController.js        # register, login, logout, forgot-password, reset-password
├── routes/
│   └── index.js                 # URL → controller routing table + asyncHandler
├── middlewares/
│   ├── auth.js                  # session auth, admin role guard, flash messages, asyncHandler
│   └── validate.js              # email / required-field / event / password validators
├── views/                       # ------------ VIEW -----------
│   ├── partials/                # header, footer, inline errors & alerts
│   ├── events/                  # index, show, confirmation, full, duplicate
│   ├── admin/                   # dashboard, events, event-form, participants, attendance, users
│   ├── auth/                    # login, register, forgot-password, reset-password, change-password
│   ├── my-registrations.ejs
│   └── error.ejs                # 400 / 403 / 404 / 500 error pages
├── public/
│   ├── css/style.css            # responsive UI + print stylesheet
│   └── js/main.js               # client-side form validation
├── seeders/
│   ├── seed.js                  # demo users, events, registrations
│   └── reset.js                 # drop + recreate all tables
├── test/
│   └── system.test.js           # automated test suite (16 tests, runs on an in-memory DB)
├── docs/
│   ├── DEFENSE-GUIDE.md         # ★ comprehensive academic defense presentation manual
│   ├── SYSTEM-DOCS.html / .pdf  # ★ full documentation sheet (diagrams inlined)
│   ├── ERD.svg / ERD.png        # entity relationship diagram (crow's foot notation)
│   ├── FLOWCHART.svg / .png     # system flowchart
│   ├── MVC-ARCHITECTURE.svg     # architecture diagram
│   ├── DOCUMENTATION.md         # full system documentation
│   ├── DATABASE-AUDIT.md        # ★ normalisation audit, fixes, recommendations
│   ├── schema.sql               # MySQL DDL for the running schema + reporting queries
│   ├── schema-3nf.sql           # proposed normalised v2 schema (venue, attendance, tokens, audit)
│   ├── REGISTRATIONS-SAMPLE.json# sample request/response payloads
│   ├── generate-diagrams.py     # regenerates the diagrams
│   └── build-html.py            # builds the documentation sheet
├── server.js                    # app entry point
├── .env.example                 # copy to .env
└── package.json
```

---

## 3. Installation & Quick Start

```bash
# 1. install dependencies
npm install

# 2. create the environment file
cp .env.example .env          # Windows: copy .env.example .env

# 3. load demo data (creates tables + 5 realistic events + seed accounts)
npm run seed

# 4. run automated test suite (verifies all 16 business rules & security controls)
npm test

# 5. start the server
npm start                     # or: npm run dev   (auto-restart on change)
```

Open <http://localhost:3000> in your browser.

### Demo accounts (after `npm run seed`)

| Role | Email | Password | Purpose |
|------|-------|----------|---------|
| Admin / organiser | `admin@eventreg.test` | `admin123` | Full administrative control, event CRUD, user management, attendance reports |
| Participant | `maria@email.com` | `maria123` | Event browsing, online registration, registration cancellation, password change |

---

## 4. Key Features & Route Mapping

| Feature | HTTP Route | Controller Action | View Template |
|---------|------------|-------------------|---------------|
| Public event listing & search | `GET /` | `eventController.publicList` | `events/index.ejs` |
| Event detail + registration form | `GET /events/:id` | `eventController.show` | `events/show.ejs` |
| Online participant registration | `POST /events/:id/register` | `registrationController.store` | `events/confirmation.ejs` |
| Event full check (capacity limit) | — | transaction check in `store` | `events/full.ejs` |
| Prevent duplicate registration | — | DB unique constraint + app check | `events/duplicate.ejs` |
| Re-registration after cancellation | `POST /events/:id/register` | reactivates cancelled record | `events/confirmation.ejs` |
| Join waiting list when event full | `POST /events/:id/waitlist` | `registrationController.waitlist` | `events/confirmation.ejs` |
| Cancel registration + auto-promote waitlist | `POST /registrations/:id/cancel` | `registrationController.cancel` | `my-registrations.ejs` |
| **Forgot Password request** | `GET/POST /forgot-password` | `authController.forgotPassword` | `auth/forgot-password.ejs` |
| **Reset Password (token verification)**| `GET/POST /reset-password/:token`| `authController.resetPassword` | `auth/reset-password.ejs` |
| Authenticated Password Change | `GET/POST /change-password` | `authController.changePassword` | `auth/change-password.ejs` |
| Create event (Admin) | `GET/POST /admin/events/new` | `eventController.showCreateForm` / `.create` | `admin/event-form.ejs` |
| Edit event (Admin, timezone-safe) | `GET/PUT /admin/events/:id/edit`| `eventController.showEditForm` / `.update` | `admin/event-form.ejs` |
| Delete event (Admin) | `DELETE /admin/events/:id` | `eventController.destroy` | — |
| View registered participants | `GET /admin/events/:id/participants` | `adminController.participants` | `admin/participants.ejs` |
| Printable attendance sheet (A4) | `GET /admin/events/:id/attendance` | `adminController.attendance` | `admin/attendance.ejs` |
| Download attendance list (CSV) | `GET /admin/events/:id/attendance.csv` | `adminController.attendanceCsv` | — |
| **User Administration & Role Management** | `GET /admin/users` | `adminController.users` | `admin/users.ejs` |
| **Admin Password Reset for Users** | `POST /admin/users/:id/reset-password` | `adminController.adminResetPassword` | — |

---

## 5. Defense-Ready Engineering & Bug Fixes

1. **Re-Registration After Cancellation (Critical Fix):** Previously, when a participant cancelled an event and later tried to re-register, an unhandled `SequelizeUniqueConstraintError` crashed the flow due to the composite unique index `(event_id, user_id)`. The system now detects existing cancelled records and reactivates them atomically (`status = 'confirmed'`), preserving historical data and database integrity.
2. **PostgreSQL & Dialect Concurrency Locking:** Fixed aggregate locking error (`FOR UPDATE is not allowed with aggregate functions` in PostgreSQL) by row-locking the parent `Event` row inside the transaction.
3. **Timezone Offset Shift Bug in Event Editing:** Resolved datetime-local value shifting backwards by 8 hours on save by implementing a timezone-aware local date formatter (`formatDateTimeLocal`).
4. **Unhandled Async Rejection Prevention:** Wrapped all route handlers in `asyncHandler` middleware to guarantee that all runtime rejections route to Express error handling instead of terminating the Node process.
5. **Cryptographic Forgot Password & Reset Password:** Implemented 64-character SHA-256 / crypto hex tokens with 1-hour expiration timestamps stored in `USERS.reset_password_token` and `USERS.reset_password_expires`.
6. **Academic Defense Demonstration Mode:** The Forgot Password module features an instant interactive test link on the UI, enabling live presentation testing even without external SMTP connectivity.
7. **Past Event Guard:** Prevents invalid registrations for events whose scheduled dates have already concluded.
8. **Automated Test Suite:** Includes 16 automated unit and integration tests runnable with `npm test`.

---

## 6. Running the Automated Tests

```bash
npm test
```

Expected output:
```
✔ 1. User Model & Authentication Security (3 tests)
✔ 2. Forgot Password & Secure Token Generation (4 tests)
✔ 3. Event Management & Capacity Calculation (2 tests)
✔ 4. Duplicate Prevention & Re-registration (2 tests)
✔ 5. Waiting List & Automatic Promotion Flow (2 tests)
✔ 6. Input Validation Routines (3 tests)
All 16 tests passing
```

---

## 7. Academic Presentation & Defense Resources

* **`docs/DEFENSE-GUIDE.md`** — Step-by-step live demo script, architectural answers to panel questions, and defense rubric alignment.
* **`docs/SYSTEM-DOCS.html`** — Comprehensive printable system documentation with inlined vector diagrams.
* **`docs/schema.sql`** — Production MySQL DDL script with analytical queries.
* **`docs/ERD.svg`** · **`docs/FLOWCHART.svg`** · **`docs/MVC-ARCHITECTURE.svg`** — Complete visual documentation.

---

## 8. License

MIT License — Academic & Educational Use.

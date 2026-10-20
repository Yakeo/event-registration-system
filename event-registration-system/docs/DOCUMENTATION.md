# Event Registration System — System Documentation

**Project:** Online Event Registration System  
**Pattern:** MVC (Model – View – Controller)  
**Stack:** Node.js 18+ · Express.js · Sequelize · MySQL / PostgreSQL / SQLite · EJS / HTML / CSS / JavaScript  

---

## Table of Contents

1. [System Requirements](#1-system-requirements)
2. [Entity Relationship Diagram (ERD)](#2-entity-relationship-diagram-erd)
3. [Data Dictionary](#3-data-dictionary)
4. [System Flowchart](#4-system-flowchart)
5. [Feature Specification](#5-feature-specification)
6. [MVC Architecture & File Mapping](#6-mvc-architecture--file-mapping)
7. [Route / Endpoint Reference](#7-route--endpoint-reference)
8. [Business Rules](#8-business-rules)
9. [Automated Test Suite & Verification](#9-automated-test-suite--verification)
10. [Academic Defense Guide & Presentation Checklist](#10-academic-defense-guide--presentation-checklist)

---

## 1. System Requirements

| Category | Requirement | Notes |
|----------|-------------|-------|
| Runtime | **Node.js 18+** | Verified on Node 20 LTS |
| Web framework | **Express.js ^4.19** | Routing + middleware pipeline |
| ORM | **Sequelize ^6.37** | Models, associations, validations, transactions |
| Database | **MySQL 8** or **PostgreSQL 14+** | SQLite 3 supported for zero-setup demo |
| DB driver | **mysql2** or **pg + pg-hstore** or **sqlite3** | Dialect drivers |
| Templating | **EJS ^3.1** | Server-side rendered HTML |
| Front end | HTML5, CSS3, Vanilla JavaScript | Responsive UI + print stylesheet |
| Security | `bcryptjs`, Node `crypto` | Adaptive password hashing + 64-char hex reset tokens |

---

## 2. Entity Relationship Diagram (ERD)

![ERD](./ERD.svg)

*Vector source: `docs/ERD.svg` · raster copy: `docs/ERD.png`*

**Relationship notation (crow's foot)**

```
[USERS] 1 ──── 0..* [REGISTRATIONS] 0..* ──── 1 [EVENTS]
```

| Relationship | Cardinality | Meaning |
|--------------|-------------|---------|
| USERS → REGISTRATIONS | one-to-many (1 : 0..*) | A user may have zero or many registrations; each registration belongs to exactly one user (`REGISTRATIONS.user_id` NOT NULL). |
| EVENTS → REGISTRATIONS | one-to-many (1 : 0..*) | An event may have zero or many registrations; each registration is for exactly one event (`REGISTRATIONS.event_id` NOT NULL). |
| REGISTRATIONS | associative entity | Resolves the many-to-many participant/event relationship; tracks registration status ('confirmed' \| 'waitlisted' \| 'cancelled'). |

> The relationship lines in the diagram are anchored to the actual foreign-key
> rows (`REGISTRATIONS.user_id`, `REGISTRATIONS.event_id`). For a full critique
> of the original diagram, the normal-form analysis and the proposed v2 schema,
> see **[DATABASE-AUDIT.md](./DATABASE-AUDIT.md)** and
> **[schema-3nf.sql](./schema-3nf.sql)**.

---

## 3. Data Dictionary

### 3.1 USERS — user accounts (administrators and participants)

| Field | Type | Key | Constraints | Description |
|-------|------|-----|-------------|-------------|
| `user_id` | INT AI | **PK** | auto increment | Surrogate primary key |
| `full_name` | VARCHAR(120) | | NOT NULL | Complete name of the user |
| `email` | VARCHAR(160) | UQ | NOT NULL, valid email, unique | Login identifier; duplicate-registration anchor |
| `password` | VARCHAR(255) | | NOT NULL | Bcrypt hash (10 salt rounds) |
| `role` | ENUM | | NOT NULL, default `participant` | `admin` (management) or `participant` |
| `reset_password_token` | CHAR(64) | UQ | NULL allowed | **SHA-256 digest** of the 64-hex token sent to the user; the raw token is never stored. Unique index; cleared after use or on password change |
| `reset_password_expires`| DATETIME | | NULL allowed | Expiration timestamp (1 hour TTL) |

*Indexes: `UNIQUE(email)`, `UNIQUE(reset_password_token)`, `(role)`.*

### 3.2 EVENTS — events created by the organiser

| Field | Type | Key | Constraints | Description |
|-------|------|-----|-------------|-------------|
| `event_id` | INT AI | **PK** | auto increment | Surrogate primary key |
| `title` | VARCHAR(180) | | NOT NULL | Event name shown on the listing page |
| `description` | TEXT | | NULL allowed | Full details of the event |
| `event_date` | DATETIME | | NOT NULL | Date and time of the event |
| `venue` | VARCHAR(180) | | NOT NULL | Where the event is held |
| `max_participants` | INT | | NOT NULL, ≥ 1 | Slot limit — registration blocked once reached |

*Indexes: `(event_date)` — every listing is ordered by date.
`venue` is free text; the audit proposes a `VENUES` table (see DATABASE-AUDIT.md §4.4).*

### 3.3 REGISTRATIONS — the booking record (associative entity)

| Field | Type | Key | Constraints | Description |
|-------|------|-----|-------------|-------------|
| `registration_id` | INT AI | **PK** | auto increment | Surrogate primary key |
| `user_id` | INT | **FK** | → `USERS.user_id`, NOT NULL, CASCADE | Who registered |
| `event_id` | INT | **FK** | → `EVENTS.event_id`, NOT NULL, CASCADE | Which event |
| `registration_date` | DATETIME | | NOT NULL, default now | When the registration was placed |
| `status` | ENUM | | NOT NULL, default `confirmed` | `confirmed` \| `waitlisted` \| `cancelled` |
| *(composite index)* | | UQ | `UNIQUE(event_id, user_id)` | Database-level duplicate prevention |

*Indexes: `UNIQUE(event_id, user_id)`, `(event_id, status)`, `(user_id, status)`,
`(status, registration_date)` — the last one backs FIFO waitlist promotion.*

---

## 4. System Flowchart

![System Flowchart](./FLOWCHART.svg)

```
Start
  ↓
User views event list                       ← eventController.publicList()   GET /
  ↓
Select event                                ← eventController.show()         GET /events/:id
  ↓
Event has available slots? ── No ──→ Show "Event full" (Waitlist)  →  End
  ↓ Yes
Enter participant details                   ← POST /events/:id/register
  ↓
Validate email and required fields          ← middlewares/validate.js
  ↓
Save registration (or reactivate cancelled) ← Registration.create() / update() inside transaction
  ↓
Increase registered participant count       ← COUNT(confirmed) recomputed atomically
  ↓
Show confirmation receipt & account notice  ← events/confirmation.ejs with reference number
  ↓
End
```

---

## 5. Feature Specification

### F1 — Event Creation, Editing & Deletion (Admin)
* **Create** (`POST /admin/events`) and **Edit** (`PUT /admin/events/:id`).
* Capacity cannot be reduced below current confirmed head-count.
* Timezone-safe date input preserves local time format without UTC shift.

### F2 — Public Event Listing & Search
* Real-time capacity meters and badges (`X slot(s) left`, `Event full`, `Concluded`).
* Search query filter (`?q=`) matches title, venue, or description.

### F3 — Online Registration & Duplicate Prevention
* Atomic registration inside database transaction with parent row locking.
* Duplicate prevention backed by unique composite index `(event_id, user_id)`.
* Clean re-registration: users who previously cancelled can re-register without collision.

### F4 — Waiting List & Auto-Promotion
* Full events permit waitlist enrollment (`status = 'waitlisted'`).
* Cancelling a confirmed registration automatically promotes the earliest waitlisted participant using FIFO ordering (`ORDER BY registration_date ASC, registration_id ASC`).

### F5 — Forgot Password & Password Reset Flow
* User submits email at `/forgot-password`.
* System generates 64-char crypto token with 1-hour expiration.
* User sets new password at `/reset-password/:token`, hashed via bcrypt.
* Interactive demo link displayed on UI for offline academic defense demonstration.

### F6 — Attendance Reporting (A4 Print & CSV Export)
* Clean printable A4 layout with signatures blocks and verification data.
* UTF-8 BOM CSV export compatible with Microsoft Excel.

### F7 — User Account Administration (Admin)
* `/admin/users` displays all system users, registration counts, and roles.
* Admin can promote/demote roles and perform administrative password resets.

---

## 6. MVC Architecture & File Mapping

![MVC Architecture](./MVC-ARCHITECTURE.svg)

| Layer | Files | Purpose |
|-------|-------|---------|
| **Model** | `models/User.js`, `Event.js`, `Registration.js`, `index.js` | Schema definitions, validation rules, associations, bcrypt hooks |
| **View** | `views/events/*.ejs`, `admin/*.ejs`, `auth/*.ejs`, `partials/*.ejs` | Server-rendered EJS templates, CSS styles, client scripts |
| **Controller**| `controllers/*.js` | Request processing, business constraints, state transitions |
| **Router** | `routes/index.js` | HTTP routing table, role authorization guards, async wrappers |

---

## 7. Route / Endpoint Reference

| Method | Path | Access | Handler | View / Action |
|--------|------|--------|---------|---------------|
| `GET` | `/` | Public | `eventController.publicList` | `events/index.ejs` |
| `GET` | `/events/:id` | Public | `eventController.show` | `events/show.ejs` |
| `POST` | `/events/:id/register` | Public | `registrationController.store` | `events/confirmation.ejs` |
| `POST` | `/events/:id/waitlist` | Public | `registrationController.waitlist` | `events/confirmation.ejs` |
| `POST` | `/registrations/:id/cancel` | Authenticated | `registrationController.cancel` | Redirect |
| `GET` | `/register` | Public | `authController.showRegister` | `auth/register.ejs` |
| `POST` | `/register` | Public | `authController.register` | Redirect |
| `GET` | `/login` | Public | `authController.showLogin` | `auth/login.ejs` |
| `POST` | `/login` | Public | `authController.login` | Redirect |
| `POST` | `/logout` | Authenticated | `authController.logout` | Redirect |
| `GET` | `/forgot-password` | Public | `authController.showForgotPassword`| `auth/forgot-password.ejs` |
| `POST` | `/forgot-password` | Public | `authController.forgotPassword` | `auth/forgot-password.ejs` |
| `GET` | `/reset-password/:token`| Public | `authController.showResetPassword`| `auth/reset-password.ejs` |
| `POST` | `/reset-password/:token`| Public | `authController.resetPassword` | Redirect |
| `GET` | `/change-password` | Authenticated | `authController.showChangePassword`| `auth/change-password.ejs` |
| `POST` | `/change-password` | Authenticated | `authController.changePassword` | Redirect |
| `GET` | `/my-registrations` | Authenticated | `authController.myRegistrations` | `my-registrations.ejs` |
| `GET` | `/admin` | Admin | `adminController.dashboard` | `admin/dashboard.ejs` |
| `GET` | `/admin/events` | Admin | `eventController.adminIndex` | `admin/events.ejs` |
| `GET` | `/admin/events/new` | Admin | `eventController.showCreateForm` | `admin/event-form.ejs` |
| `POST` | `/admin/events` | Admin | `eventController.create` | Redirect |
| `GET` | `/admin/events/:id/edit`| Admin | `eventController.showEditForm` | `admin/event-form.ejs` |
| `PUT` | `/admin/events/:id` | Admin | `eventController.update` | Redirect |
| `DELETE`| `/admin/events/:id` | Admin | `eventController.destroy` | Redirect |
| `GET` | `/admin/events/:id/participants` | Admin | `adminController.participants` | `admin/participants.ejs` |
| `GET` | `/admin/events/:id/attendance` | Admin | `adminController.attendance` | `admin/attendance.ejs` |
| `GET` | `/admin/events/:id/attendance.csv` | Admin | `adminController.attendanceCsv` | CSV Stream |
| `POST` | `/admin/registrations/:id/status` | Admin | `adminController.updateStatus` | Redirect |
| `GET` | `/admin/users` | Admin | `adminController.users` | `admin/users.ejs` |
| `POST` | `/admin/users/:id/role` | Admin | `adminController.updateUserRole` | Redirect |
| `POST` | `/admin/users/:id/reset-password` | Admin | `adminController.adminResetPassword`| Redirect |

---

## 8. Business Rules Summary

1. **Atomic Capacity Limit:** Enforced inside database transactions with parent row locks.
2. **Strict Duplicate Prohibition:** Guaranteed by unique constraint `(event_id, user_id)`.
3. **Re-Registration Reactivation:** Cleanly reactivates previously cancelled registrations.
4. **FIFO Waitlist Promotion:** Fills cancelled slots from the earliest waitlisted participant, inside the cancellation transaction, and only when a seat is actually free (no double promotion, no promotion for concluded events).
5. **Waitlist Only When Full:** The waiting list rejects submissions while seats are still available.
6. **Time-Limited Reset Tokens:** 64-char crypto tokens with 1-hour expiration; only the SHA-256 digest is stored.
7. **Past Event Guard:** Blocks registration/waitlist attempts on events that have already concluded; new events must be scheduled in the future.
8. **Capacity Floor Guard:** Admins cannot edit event capacity below current confirmed headcount, nor confirm a registration that would exceed capacity.
9. **CSRF Protection:** Every state-changing request must carry the session-bound `_csrf` token.
10. **Safe Redirects:** `?next=` targets are restricted to local paths.

---

## 9. Automated Test Suite & Verification

The system includes 16 automated tests in `test/system.test.js`:

```bash
npm test
```

### Verified Test Categories:
1. **User Model & Authentication:** Bcrypt hashing, password validation, duplicate email rejection.
2. **Forgot Password:** Crypto token creation, 1-hour expiration timestamp, valid token lookup, successful reset, expired token rejection.
3. **Event Capacity:** Counter calculations, limit blocking on max capacity.
4. **Duplicate Prevention:** Unique index collision check, re-registration after cancellation.
5. **Waitlist & Promotion:** Waitlisting overflow registrations, FIFO auto-promotion.
6. **Input Validation:** Required field checks, regex formats, password lengths.

---

## 10. Academic Defense Guide & Presentation Checklist

Refer to **`docs/DEFENSE-GUIDE.md`** for the complete defense script, question-and-answer prep, and rubric alignment.

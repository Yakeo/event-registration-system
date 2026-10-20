# Academic Defense Guide & Presentation Manual
## Online Event Registration System (Node.js + Express + Sequelize + EJS)

---

## 1. Executive Summary for the Defense Panel

The **Online Event Registration System** is an enterprise-grade academic capstone project developed following the **Model-View-Controller (MVC)** architectural pattern. The system addresses critical logistical challenges in institutional event management, including:
- **Strict Capacity Control:** Preventing overbooking under concurrent traffic using ACID transactions and row locking.
- **Duplicate Prevention:** Enforcing single-registration policy per user per event via composite database constraints.
- **Automated Waitlist Promotion:** Ensuring zero wasted seats by automatically promoting waitlisted participants on cancellation.
- **Defensive Security & Authentication:** Implementing bcrypt password hashing, session-based state management, RBAC (Role-Based Access Control), and an academic-grade **Forgot Password & Password Reset** cryptographic token workflow.
- **Administrative Reporting:** Automated generation of A4 printable official attendance sheets and CSV data exports.

---

## 2. System Architecture & MVC Breakdown

The project strictly decouples presentation, business logic, and database operations:

```
event-registration-system/
├── config/database.js          # Database connection factory (SQLite / MySQL / PostgreSQL)
├── models/                     # MODEL LAYER (Sequelize ORM)
│   ├── User.js                 # USERS: authentication, roles, password reset tokens
│   ├── Event.js                # EVENTS: schedules, venue, capacity constraints
│   ├── Registration.js         # REGISTRATIONS: state machine ('confirmed'|'waitlisted'|'cancelled')
│   └── index.js                # Relational associations & capacity helpers
├── controllers/                # CONTROLLER LAYER (Business Logic)
│   ├── authController.js       # Register, Login, Forgot Password, Reset Password, Session
│   ├── eventController.js      # Public search, event details, admin CRUD
│   ├── registrationController.js# Registration transaction, waitlist, cancellation promotion
│   └── adminController.js      # Metrics, attendance list, CSV export, user administration
├── routes/index.js             # ROUTER (HTTP verb & URL mapping + Middleware pipeline)
├── middlewares/                # MIDDLEWARE LAYER
│   ├── auth.js                 # Session exposure, requireLogin, requireAdmin, asyncHandler
│   └── validate.js             # Input hygiene, email regex, date/capacity validators
├── views/                      # VIEW LAYER (Server-Side Rendered EJS)
│   ├── partials/               # Reusable header, footer, alert messages
│   ├── auth/                   # Login, register, forgot-password, reset-password
│   ├── events/                 # Event index, detail, confirmation, full, duplicate
│   └── admin/                  # Dashboard, event management, participants, attendance, users
└── public/                     # STATIC ASSETS (Responsive CSS, print stylesheets, client JS)
```

---

## 3. Database Design & Entity Relationships (ERD)

### Relational Schema (10 tables):
- **`VENUES` (1) ── (0..*) `EVENTS` (1) ── (0..*) `REGISTRATIONS` (0..*) ── (1) `USERS`**
- **`REGISTRATIONS` (1) ── (0..1) `ATTENDANCE`** · **`REGISTRATIONS` (1) ── (0..*) `REGISTRATION_STATUS_CHANGES`**
- **`USERS` (1) ── (0..*) `AUDIT_LOGS`** · **`SESSIONS`** (session store, no FK)
- **`USERS` (1) ── (0..*) `MANAGE_TOKENS`** (hashed `/r/:token` links) · **`REGISTRATIONS` (1) ── (0..*) `NOTIFICATIONS`** (e-mail outbox, nullable FKs)

| Entity | Primary Key | Foreign Keys | Key Attributes & Constraints |
|---|---|---|---|
| **`VENUES`** | `venue_id` (INT) | None | `name`, `address`, `city`, **`UNIQUE(name, city)`** |
| **`USERS`** | `user_id` (INT) | None | `email` (UNIQUE), `password` (bcrypt hash), `role` ('admin' \| 'participant'), `reset_password_token` (CHAR(64), SHA-256 digest, UNIQUE), `reset_password_expires` (DATETIME) |
| **`EVENTS`** | `event_id` (INT) | `venue_id` → `VENUES` | `title`, `event_date`, `max_participants` (INT >= 1), `deleted_at` (soft delete) |
| **`REGISTRATIONS`** | `registration_id` (INT) | `user_id` → `USERS`<br>`event_id` → `EVENTS` | `registration_date`, `status` ('confirmed' \| 'waitlisted' \| 'cancelled'), **`UNIQUE(event_id, user_id)`** |
| **`ATTENDANCE`** | `attendance_id` (INT) | `registration_id` → `REGISTRATIONS`<br>`checked_in_by` → `USERS` | `checked_in_at`, **`UNIQUE(registration_id)`** — a participant is checked in once |
| **`REGISTRATION_STATUS_CHANGES`** | `change_id` (INT) | `registration_id` → `REGISTRATIONS`<br>`changed_by` → `USERS` | `from_status`, `to_status`, `changed_at`, `reason` — `changed_by` NULL = automated promotion |
| **`AUDIT_LOGS`** | `log_id` (BIGINT) | `actor_id` → `USERS` | `action`, `entity`, `entity_id`, `detail` (JSON), `created_at` |
| **`SESSIONS`** | `sid` (VARCHAR 64) | None | `data` (session JSON), `expires_at` |
| **`NOTIFICATIONS`** | `notification_id` (INT) | `user_id` → `USERS` (NULL)<br>`registration_id` → `REGISTRATIONS` (NULL)<br>`event_id` → `EVENTS` (NULL) | Transactional outbox: `email` snapshot, `kind`, `payload` (JSON), `status` ('queued' \| 'sent' \| 'failed'), `attempts`, `last_error`, `sent_at` |
| **`MANAGE_TOKENS`** | `token_id` (INT) | `user_id` → `USERS`<br>`registration_id` → `REGISTRATIONS` (NULL) | `token_hash` (CHAR(64), SHA-256 of the URL token, **UNIQUE**), `expires_at` (7-day TTL), `used_at` — passwordless guest access |

### Normal form (panel question)
Every table is in 1NF, 2NF and 3NF. `MANAGE_TOKENS` stores only a derived digest
(never the token itself) and `NOTIFICATIONS.payload` is an opaque delivery
snapshot, not a fact that can drift. `VENUES` removes the transitive dependency
`event → venue → address`; `REGISTRATION_STATUS_CHANGES` keeps transition data
out of `REGISTRATIONS` (so no half-empty `cancelled_at`/`promoted_at` columns).
The one documented exception is the single-use reset token on `USERS`; the
stricter variant is in `docs/schema-3nf.sql`. Full proof: `docs/DATABASE-AUDIT.md`.

### Cascade Behavior:
- `ON DELETE CASCADE`: Deleting an event or a user safely cleans up associated registrations without leaving orphaned records.
- `ON UPDATE CASCADE`: Key modifications propagate to maintain referential consistency.

---

## 4. Key Business Rules & Technical Solutions

### Rule 1: Concurrency-Safe Capacity Enforcement
* **Problem:** If an event has 1 remaining seat and two users submit at the exact same millisecond, both could read `remaining = 1` and overbook the event.
* **Solution:** We wrap registration inside a database transaction (`sequelize.transaction`). In MySQL/PostgreSQL, the parent `Event` row is locked (`LOCK.UPDATE`), and confirmed seats are counted atomically inside the transaction. If `taken >= max_participants`, the transaction immediately rolls back and throws an `EVENT_FULL` error.

### Rule 2: Duplicate Prevention & Re-registration Support
* **Problem:** Users must not register twice for the same event, but users who cancelled an earlier registration must be allowed to change their mind and re-register.
* **Solution:** A composite database unique index `(event_id, user_id)` stops duplicate inserts at the database level. When an existing registration exists with `status = 'cancelled'`, the system cleanly reactivates that record (`status = 'confirmed'`, updated `registration_date`) rather than failing on unique constraint collision.

### Rule 3: Automated Waiting List Promotion
* **Problem:** Cancellations leave empty seats if other interested participants are already turned away.
* **Solution:** When a confirmed participant cancels their registration (or an admin cancels it), the system queries the earliest waitlisted participant using FIFO ordering (`ORDER BY registration_date ASC, registration_id ASC`) and automatically promotes them to `confirmed`.

### Rule 4: Cryptographic Password Reset
* **Problem:** Public registrants created during quick event registration need a secure mechanism to set/reset credentials.
* **Solution:** 
  1. User submits their registered email at `/forgot-password`.
  2. The system verifies the account and generates a 64-character cryptographic token (`crypto.randomBytes(32).toString('hex')`) with a 1-hour expiration timestamp (`Date.now() + 3600000`).
  3. The token is hashed/stored in `USERS.reset_password_token` and verified on `/reset-password/:token`.
  4. The user sets a new password with confirmation, which is hashed with bcrypt before storage, and the token is invalidated immediately to prevent replay attacks.
  5. **Academic Defense Feature:** The system displays an interactive defense demonstration notice with the direct test link, eliminating dependency on external SMTP servers that could fail during an offline defense.

---

## 5. Step-by-Step Live Demonstration Script

Follow this script during your live presentation to impress the panel:

### Phase 1: Automated Verification (`npm test`)
1. Open terminal and run:
   ```bash
   npm test
   ```
2. **What to say to the panel:**
   > *"Before walking through the user interface, we want to demonstrate our automated test suite. We have 16 unit and integration test cases covering bcrypt encryption, token generation and expiration, concurrency limits, duplicate protection, waitlist promotion, and input validation. As shown, all 16 tests pass with 0 errors."*

### Phase 2: Public Browsing & Search
1. Open `http://localhost:3000` in browser.
2. Demonstrate search bar: search for `"IT Convention"` or `"SMX"`.
3. Point out capacity progress bars (e.g. 5/5 full vs 0/120 open slots).
4. **What to say:**
   > *"The public landing page displays all scheduled events with real-time capacity meters. Concluded events are marked automatically and locked against invalid registrations."*

### Phase 3: Online Event Registration & Duplicate Check
1. Click on **"Annual IT Convention 2026"**.
2. Enter participant name: `Juan Dela Cruz`, email: `juan@email.com`. Click **Confirm registration**.
3. View the generated confirmation receipt with reference code `REG-00017`.
4. Navigate back to the same event and submit the same email `juan@email.com`.
5. **Observe:** The system politely displays **"You are already registered"** and shows their existing reference number.
6. **What to say:**
   > *"Duplicate registrations for the same event are blocked by both business logic and an underlying composite database constraint on `(event_id, user_id)`."*

### Phase 4: Event Full & Waiting List Flow
1. Navigate to **"Basic Photography Workshop"** (5 of 5 slots taken).
2. Point out that registration is closed and replaced with **"Join waiting list"**.
3. Submit a new name: `Carlos Tan`, email: `carlos@email.com`.
4. Observe confirmation receipt with status **`waitlisted`**.

### Phase 5: Forgot Password & Password Reset Demonstration
1. Click **Log in** in the top navigation, then click **"Forgot password?"**.
2. Enter `maria@email.com` and click **Generate Reset Link**.
3. **What to say:**
   > *"Here is our Password Reset module. In a production deployment, this generates a time-limited cryptographic token and dispatches an email. For our academic demonstration, the system generates a secure 64-hexadecimal token with a 1-hour expiration timestamp and displays a direct testing link."*
4. Click **Proceed to Reset Password**.
5. Enter a new password (e.g. `maria2026`) and confirm it. Click **Update Password**.
6. System displays success alert and redirects to login. Log in with `maria@email.com` and the new password `maria2026`!

### Phase 6: Cancellation & Auto-Promotion to Waiting List
1. While logged in as `maria@email.com`, navigate to **"My registrations"**.
2. Find one of her confirmed events and click **Cancel**.
3. Point out the flash notification:
   > *"Registration cancelled. The next person on the waiting list was automatically promoted to confirmed."*

### Phase 7: Administrative Dashboard & Attendance List
1. Log in with Administrator credentials:
   - Email: `admin@eventreg.test`
   - Password: `admin123`
2. View **Admin Dashboard**: metrics tiles for Total Events, Confirmed, Waitlisted, Total Slots, and Users.
3. Click **"Users"** in navigation:
   - Point out the user management panel showing roles, registration counts, and admin password reset tool.
4. Go to **"Manage events"** → click **"Attendance"** for any event.
5. Demonstrate the official printable sheet:
   - Click **"Print attendance sheet"** (opens browser print preview formatted for clean A4 printing with signature blocks).
   - Click **"Download CSV"** to demonstrate Microsoft Excel export with UTF-8 BOM encoding.

---

## 6. Anticipated Panel Questions & High-Scoring Answers

### Q1: "Why did you use Sequelize ORM instead of writing raw SQL queries?"
> **Answer:**
> *"Sequelize ORM provides several critical advantages:
> 1. **Security:** Automatic parameterization of queries prevents SQL injection vulnerabilities out of the box.
> 2. **Database Portability:** By changing two configuration variables in `.env`, our system seamlessly switches between SQLite, MySQL, and PostgreSQL without changing a single line of application code.
> 3. **Model Validations & Hooks:** It allows us to encapsulate business logic, such as automatic bcrypt password hashing in `beforeSave` hooks and referential cascades, keeping controllers lean and readable."*

### Q2: "How do you protect passwords, and why not use plain MD5 or SHA-256?"
> **Answer:**
> *"We use `bcryptjs` with a work factor of 10 salt rounds. Simple hash algorithms like MD5 and SHA-256 are fast cryptographic hashes vulnerable to rainbow table attacks and GPU-accelerated brute forcing. Bcrypt is an adaptive key derivation function based on Blowfish that incorporates a unique salt for every password and is deliberately computationally intensive, making offline brute-force attacks computationally infeasible."*

### Q3: "What prevents a user from tampering with admin URLs if they aren't logged in?"
> **Answer:**
> *"All administrative routes are protected by layered Express middleware:
> 1. `requireLogin` checks `req.session.user`. If unauthenticated, the user is redirected to the login page with the target URL preserved in query parameters (`next`).
> 2. `requireAdmin` checks `req.session.user.role === 'admin'`. If a logged-in participant tries to open `/admin/*`, the system returns an HTTP 403 Forbidden page and logs the unauthorized attempt."*

### Q4: "How does your system handle timezones and dates?"
> **Answer:**
> *"All timestamps in database storage are ISO UTC / standard DATETIME. For rendering in Philippine Standard Time (`UTC+8`), we use helper formatters configured with `timeZone: 'Asia/Manila'`. In addition, when editing events in the admin panel, our `formatDateTimeLocal()` helper guarantees that `<input type="datetime-local">` receives the exact local time rather than shifting by UTC offsets."*

### Q5: "What if the admin tries to lower an event's capacity below the number of people who already registered?"
> **Answer:**
> *"In `eventController.update`, before applying changes, the system compares the submitted `max_participants` against the current confirmed count (`capacity.taken`). If the admin enters a number lower than existing confirmed attendees, the system rejects the update with an explicit validation error: 'Maximum participants cannot be lower than the X confirmed registration(s)'."*

---

## 7. Demo Accounts Reference Sheet

| Role | Email | Password | Primary Capabilities |
|---|---|---|---|
| **System Administrator** | `admin@eventreg.test` | `admin123` | Create/edit/delete events, monitor dashboard, view participants, change attendee status, print attendance sheets, export CSV, manage user accounts & roles |
| **Registered Participant** | `maria@email.com` | `maria123` | Browse events, register online, view "My registrations", cancel personal registrations, change password, reset password |

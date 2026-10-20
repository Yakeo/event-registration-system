# Demo Data Reference

`npm run seed` (or `node seeders/seed.js`) loads a complete demo dataset so every
screen in the system has something to show — dashboard, public listing, event
detail, participation limits, waiting list, attendance sheet, status history,
audit log, venue page and archived events.

The committed `database/event_registration.sqlite` already contains this data, so
a fresh clone can run `npm start` and log in immediately.

> ⚠️ `npm run seed` calls `sequelize.drop()` — it **deletes every row** in every
> table first. To experiment without touching your demo database:
> `DB_STORAGE=/tmp/demo.sqlite npm run seed`

---

## 1. What gets created

| Table | Rows | Notes |
|---|---:|---|
| `VENUES` | 7 | SMX Pasay, University Gym, Lab 2, AVR, Innovation Hub, Multimedia Studio, Rooftop Hall |
| `USERS` | 18 | 2 administrators + 16 participants (bcrypt-hashed passwords) |
| `EVENTS` | 11 | 10 visible + 1 archived (soft-deleted); 3 already finished, 8 in the future |
| `REGISTRATIONS` | 77 | 69 confirmed · 6 waitlisted · 2 cancelled |
| `ATTENDANCE` | 20 | Check-ins for the 3 finished events only (one no-show each) |
| `REGISTRATION_STATUS_CHANGES` | 81 | One "birth" row per registration + every later transition |
| `AUDIT_LOGS` | 13 | Event creation, archiving, role change, check-in |

Event dates are computed **relative to today** (Asia/Manila), so the data never
goes stale: the finished events stay in the past and the upcoming ones stay in
the future no matter when you seed.

---

## 2. The events, and what each one demonstrates

| # | Event | Venue | When | Seats | Registrations | Demonstrates |
|---|---|---|---:|---:|---|---|
| 1 | Cybersecurity Awareness Seminar | Audio-Visual Room | −21 days | 8/60 | 8 confirmed, 1 cancelled | Attendance sheet with a no-show; cancelled row in history |
| 2 | Basic Photography Workshop | Multimedia Studio | −7 days | **5/5** | 5 confirmed, 2 waitlisted | "Event full" state on a past event; waiting list |
| 3 | Freshman Orientation 2026 | University Gymnasium | −3 days | 10/300 | 10 confirmed | Largest attendance sheet (9 check-ins + 1 late arrival) |
| 4 | Annual IT Convention 2026 | SMX Convention Center | +14 days | 12/120 | 12 confirmed, 2 waitlisted | Busy upcoming event, mixed statuses |
| 5 | Free Web Development Bootcamp | Computer Laboratory 2 | +7 days | 7/30 | 7 confirmed, 1 waitlisted, 1 cancelled | Confirmed → cancelled → **confirmed** reactivation timeline |
| 6 | Startup Pitch Night | Innovation Hub | +30 days | 4/80 | 4 confirmed | Evening event formatting |
| 7 | Research Colloquium: Computing & Society | Audio-Visual Room | +10 days | **0/40** | none | A first registration from an empty event (counter goes 0 → 1) |
| 8 | AI & Data Science Summit | SMX Convention Center | +45 days | 3/200 | 3 confirmed | Far-future event |
| 9 | Leadership Training Camp | Rooftop Garden Hall | +21 days | **15/15** | 15 confirmed, 1 waitlisted | Registration blocked at capacity; waitlist on an upcoming event |
| 10 | Community Outreach Day | University Gymnasium | +60 days | 2/100 | 2 confirmed | Second event at the same venue (venue page "in use" count) |
| 11 | Summer Coding Camp (cancelled) | Computer Laboratory 2 | archived | 3 registrations | 3 confirmed | `/admin/events/archived` + restore; history preserved after soft delete |

Notes:

* Events 2, 4, 9 are **at or past capacity**, so the public page shows
  *Event full* and offers the waiting list instead of a register button.
* Events 1–3 are **in the past**, so their detail pages show
  *Registration closed* and the attendance sheet is usable.
* Event 7 is deliberately **empty** — useful for demoing a first sign-up without
  disturbing an existing row.
* Event 11 is the only archived row: `EVENTS.deleted_at` is set, yet its
  registrations and status history are still in the database.

---

## 3. Login accounts

| Role | Email | Password |
|---|---|---|
| Administrator | `admin@eventreg.test` | `admin123` |
| Administrator / organiser | `organizer@eventreg.test` | `organizer123` |
| Participant | `maria@email.com` | `maria123` |
| Participant | `juan@email.com` | `password123` |
| Participants | `ana`, `carlo`, `liza`, `miguel`, `grace`, `paolo`, `nina`, `dante`, `ivan`, `rafa`, `sofia`, `troy`, `kim`, `ella` `@email.com` | `password123` |

All passwords are hashed with bcrypt by the `User` model hook — the plain text
above only exists in this document and in the seeder.

---

## 4. Data-integrity checks

The seeder respects the same rules as the application. After seeding:

```sql
-- no event is over capacity
SELECT e.event_id, e.title, COUNT(r.registration_id) AS confirmed
FROM EVENTS e
JOIN REGISTRATIONS r ON r.event_id = e.event_id AND r.status = 'confirmed'
GROUP BY e.event_id
HAVING COUNT(r.registration_id) > e.max_participants;      -- 0 rows

-- no duplicate registration for the same person and event
SELECT event_id, user_id, COUNT(*)
FROM REGISTRATIONS GROUP BY event_id, user_id
HAVING COUNT(*) > 1;                                       -- 0 rows

-- only confirmed registrations can be checked in
SELECT a.attendance_id
FROM ATTENDANCE a JOIN REGISTRATIONS r USING (registration_id)
WHERE r.status <> 'confirmed';                             -- 0 rows

-- every registration has at least one status-history row
SELECT r.registration_id
FROM REGISTRATIONS r
LEFT JOIN REGISTRATION_STATUS_CHANGES s USING (registration_id)
WHERE s.change_id IS NULL;                                 -- 0 rows
```

To run these against the SQLite file, paste them into any SQLite client
(`sqlite3 database/event_registration.sqlite`, DB Browser for SQLite, the
VS Code SQLite extension, …). Each query should return **0 rows**.

---

## 5. Screens that are populated

| URL | What you should see |
|---|---|
| `/` | 10 event cards (the archived one is hidden), with venue names |
| `/events/7` | Empty event — register form (0/40) |
| `/events/9` | Full event — *Event full* + waiting-list form (15/15) |
| `/events/1` | Past event — *Registration closed* |
| `/admin` (as admin) | Dashboard: 10 events, 69 confirmed, 6 on the waiting list, 66/950 slots filled, 20 check-ins, 18 users |
| `/admin/events/2/attendance` | 4 checked in, 1 still *Check in* (the no-show) |
| `/admin/events/2/attendance.csv` | Printable sheet / CSV export with names and times |
| `/admin/registrations/49/history` | Online registration → Cancelled → Re-registered |
| `/admin/audit` | 10 × `event.create`, `event.archive`, `user.role_change`, `attendance.check_in` |
| `/admin/events/archived` | Summer Coding Camp, restorable |
| `/admin/venues` | 7 venues, each showing how many events use it |

---

## 6. Resetting back to this state

```bash
npm run seed      # drops everything, rebuilds tables, reloads the demo data
```

Seed IDs are deterministic because the tables are recreated: users `1–18`,
venues `1–7`, events `1–11`, registrations `1–77`.

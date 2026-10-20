#!/usr/bin/env python3
"""
docs/build-html.py
Builds docs/SYSTEM-DOCS.html - a single, self-contained documentation page that
inlines the ERD, flowchart and MVC diagrams (so it previews without network
access) and prints cleanly to PDF.

Run: python3 docs/build-html.py
"""
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))


def inline_svg(filename, prefix, max_width=None):
    """Inline an SVG, namespacing its ids/classes so several can share a page."""
    with open(os.path.join(HERE, filename), encoding='utf-8') as fh:
        svg = fh.read()

    ids = re.findall(r'id="([^"]+)"', svg)
    classes = set()
    for block in re.findall(r'<style>(.*?)</style>', svg, re.S):
        classes.update(re.findall(r'\.([a-zA-Z][\w-]*)', block))

    for i in sorted(set(ids), key=len, reverse=True):
        svg = re.sub(rf'"{i}"', f'"{prefix}{i}"', svg)
        svg = re.sub(rf'url\(#{i}\)', f'url(#{prefix}{i})', svg)

    # namespaced selectors inside the <style> block
    for c in sorted(classes, key=len, reverse=True):
        svg = re.sub(rf'\.{c}\b', f'.{prefix}{c}', svg)

    # namespaced class attributes (every token in the attribute)
    svg = re.sub(
        r'class="([^"]*)"',
        lambda m: 'class="' + ' '.join(prefix + t for t in m.group(1).split()) + '"',
        svg,
    )

    # keep the original intrinsic size - the page stylesheet makes .diagram svg fluid
    return svg


def table(headers, rows):
    head = ''.join(f'<th>{h}</th>' for h in headers)
    body = ''
    for row in rows:
        cells = ''.join(
            f'<td>{c}</td>' if not str(c).startswith('<') else f'<td>{c}</td>' for c in row
        )
        body += f'<tr>{cells}</tr>'
    return f'<table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table>'


erd = inline_svg('ERD.svg', 'e_')
flow = inline_svg('FLOWCHART.svg', 'f_')
flow_a = inline_svg('FLOWCHART-A.svg', 'fa_')
flow_b = inline_svg('FLOWCHART-B.svg', 'fb_')
flow_c = inline_svg('FLOWCHART-C.svg', 'fc_')
mvc = inline_svg('MVC-ARCHITECTURE.svg', 'm_')

FLOW_TEXT = """Start
  |
User views event list                  ->  GET /                        (eventController.publicList)
  |
Select event                           ->  GET /events/:id              (eventController.show)
  |
Event has available slots? -- No --> Show "Event full" --> End
  |                                 (HTTP 409, views/events/full.ejs)
 Yes
  |
Enter participant details              ->  POST /events/:id/register
  |
Validate email and required fields     ->  middlewares/validate.js
  |
Save registration                      ->  Registration.create() in a transaction
  |
Increase registered participant count  ->  COUNT(status = 'confirmed') recomputed
  |
Show confirmation                      ->  views/events/confirmation.ejs (REG-00001)
  |
 End"""

requirements = [
    ('Node.js', '18 or later (tested on 20 LTS)', 'JavaScript runtime for the server'),
    ('Express.js', '^4.19', 'HTTP server, routing and middleware'),
    ('Sequelize', '^6.37', 'ORM: models, associations, validations, transactions'),
    ('MySQL or PostgreSQL', 'MySQL 8 / PostgreSQL 14+', 'Relational database management system'),
    ('Database driver', 'mysql2  or  pg + pg-hstore', 'Sequelize dialect driver'),
    ('EJS / HTML / CSS / JS', 'EJS ^3.1', 'Server-side templating and the browser UI'),
    ('Modern web browser', 'Chrome, Edge, Firefox, Safari', 'Client access'),
    ('Supporting packages', 'express-session, method-override, bcryptjs, dotenv', 'Sessions, PUT/DELETE from forms, hashing, config'),
]

files = [
    ('M', 'models/User.js', 'USERS model - user_id PK, unique email, bcrypt hook, role'),
    ('M', 'models/Event.js', 'EVENTS model - event_id PK, title, description, event_date, venue, max_participants'),
    ('M', 'models/Registration.js', 'REGISTRATIONS model - PK, user_id FK, event_id FK, registration_date, status, UNIQUE(event_id, user_id)'),
    ('M', 'models/index.js', 'Loads models, defines the 1:0..* associations, capacity helper'),
    ('V', 'views/events/index.ejs', 'Public event listing page with capacity bars and slot badges'),
    ('V', 'views/events/show.ejs', 'Event detail + online registration form'),
    ('V', 'views/events/confirmation.ejs', 'Confirmation page with reference number'),
    ('V', 'views/events/full.ejs', 'Show "Event full" page (flowchart No branch)'),
    ('V', 'views/events/duplicate.ejs', 'Duplicate-registration warning page'),
    ('V', 'views/admin/*.ejs', 'Dashboard, manage events, event form, participants, attendance sheet'),
    ('V', 'public/css/style.css', 'Responsive styling plus print stylesheet for the attendance list'),
    ('V', 'public/js/main.js', 'Client-side required-field and email validation'),
    ('C', 'controllers/eventController.js', 'Public listing, event detail, create / edit / delete events'),
    ('C', 'controllers/registrationController.js', 'Slot check, validation, duplicate check, save in transaction, waitlist, cancel'),
    ('C', 'controllers/adminController.js', 'Dashboard, participants per event, attendance list + CSV export'),
    ('C', 'controllers/authController.js', 'Sign up, log in, log out, my registrations'),
    ('-', 'routes/index.js', 'Routing table mapping URLs to controller actions'),
    ('-', 'middlewares/auth.js', 'Session auth, admin role guard, flash messages'),
    ('-', 'middlewares/validate.js', 'Required-field, email and event validators'),
    ('-', 'server.js', 'Express app bootstrap: views, session, routes, error pages, DB sync'),
    ('-', 'seeders/seed.js', 'Demo users, 11 events and registrations (npm run seed)'),
    ('-', 'services/notifications.js', 'Transactional outbox: queue + render e-mail'),
    ('-', 'services/notificationWorker.js', 'Background worker that drains the outbox'),
    ('-', 'models/Notification.js', 'NOTIFICATIONS - one row per e-mail owed'),
    ('-', 'models/Venue.js', 'VENUES - venue master data (name, address, city)'),
    ('-', 'models/Attendance.js', 'ATTENDANCE - physical check-in, UNIQUE(registration_id)'),
    ('-', 'models/RegistrationStatusChange.js', 'REGISTRATION_STATUS_CHANGES - status timeline'),
    ('-', 'models/AuditLog.js', 'AUDIT_LOGS - administrator action trail'),
    ('-', 'models/Session.js', 'SESSIONS - persistent express-session store'),
    ('-', 'middlewares/rateLimit.js', 'IP rate limiting and per-account login lockout'),
    ('-', 'docs/schema.sql', 'MySQL DDL (10 tables) with the constraints and reporting queries'),
    ('-', 'docs/DATABASE-AUDIT.md', 'Normalisation audit, fixes and remaining recommendations'),
]

routes = [
    ('GET', '/', 'public', 'eventController.publicList', 'Public event listing page (search ?q=)'),
    ('GET', '/events/:id', 'public', 'eventController.show', 'Event detail + registration form'),
    ('POST', '/events/:id/register', 'public', 'registrationController.store', 'Save an online registration'),
    ('POST', '/events/:id/waitlist', 'public', 'registrationController.waitlist', 'Join the waiting list when full'),
    ('POST', '/registrations/:id/cancel', 'user', 'registrationController.cancel', 'Cancel own registration'),
    ('GET/POST', '/register', 'public', 'authController', 'Create an account'),
    ('GET/POST', '/login', 'public', 'authController', 'Log in'),
    ('POST', '/logout', 'user', 'authController.logout', 'Log out'),
    ('GET', '/my-registrations', 'user', 'authController.myRegistrations', 'Registrations of the logged-in user'),
    ('GET', '/admin', 'admin', 'adminController.dashboard', 'Dashboard tiles + latest registrations'),
    ('GET', '/admin/events', 'admin', 'eventController.adminIndex', 'Manage-events table'),
    ('GET', '/admin/events/new', 'admin', 'eventController.showCreateForm', 'Create-event form'),
    ('POST', '/admin/events', 'admin', 'eventController.create', 'Save new event'),
    ('GET', '/admin/events/:id/edit', 'admin', 'eventController.showEditForm', 'Edit-event form'),
    ('PUT', '/admin/events/:id', 'admin', 'eventController.update', 'Save event changes'),
    ('DELETE', '/admin/events/:id', 'admin', 'eventController.destroy', 'Delete event + its registrations'),
    ('GET', '/admin/events/:id/participants', 'admin', 'adminController.participants', 'Registered participants per event'),
    ('POST', '/admin/registrations/:id/status', 'admin', 'adminController.updateStatus', 'Confirm / waitlist / cancel a registration'),
    ('GET', '/admin/events/:id/attendance', 'admin', 'adminController.attendance', 'Generate printable attendance list'),
    ('GET', '/admin/events/:id/attendance.csv', 'admin', 'adminController.attendanceCsv', 'Download attendance list (CSV)'),
    ('POST', '/admin/attendance/:registrationId', 'admin', 'adminController.toggleAttendance', 'Check in / undo a participant'),
    ('GET', '/admin/registrations/:id/history', 'admin', 'adminController.registrationHistory', 'Status timeline of one registration'),
    ('GET', '/admin/audit', 'admin', 'adminController.auditIndex', 'Audit trail browser (filter + paging)'),
    ('GET/POST', '/admin/venues', 'admin', 'adminController.venues / createVenue', 'Venue master data'),
    ('GET', '/admin/events/archived', 'admin', 'eventController.archivedIndex', 'Soft-deleted (archived) events'),
]

users_fields = [
    ('user_id', 'INT, auto increment', '<b>PK</b>', 'Surrogate primary key'),
    ('full_name', 'VARCHAR(120)', 'NOT NULL', 'Complete name of the user'),
    ('email', 'VARCHAR(160)', 'UNIQUE, NOT NULL', 'Login name; also the duplicate-registration key'),
    ('password', 'VARCHAR(255)', 'NOT NULL', 'Bcrypt hash - never stored in plain text'),
    ('role', 'ENUM(admin, participant)', 'default participant', 'Access level of the account'),
    ('reset_password_token', 'CHAR(64)', 'UNIQUE, NULL', 'SHA-256 digest of the password-reset token (raw token never stored)'),
    ('reset_password_expires', 'DATETIME', 'NULL', 'Reset-token expiration (1 hour TTL)'),
]
event_fields = [
    ('event_id', 'INT, auto increment', '<b>PK</b>', 'Surrogate primary key'),
    ('title', 'VARCHAR(180)', 'NOT NULL', 'Event name on the public listing'),
    ('description', 'TEXT', 'NULL', 'Full details of the event'),
    ('event_date', 'DATETIME', 'NOT NULL', 'Date and time of the event'),
    ('venue_id', 'INT', '<b>FK</b> -> VENUES', 'Where the event is held (normalised venue)'),
    ('deleted_at', 'DATETIME', 'NULL', 'Soft delete: archived events keep their history'),
    ('max_participants', 'INT', 'NOT NULL, >= 1', 'Slot limit; registration is blocked once reached'),
    ('(index)', 'INDEX(event_date)', 'index', 'Ordering of the public listing'),
]
reg_fields = [
    ('registration_id', 'INT, auto increment', '<b>PK</b>', 'Surrogate primary key'),
    ('user_id', 'INT', '<b>FK</b> -> USERS', 'Participant who registered'),
    ('event_id', 'INT', '<b>FK</b> -> EVENTS', 'Event being registered for'),
    ('registration_date', 'DATETIME', 'default now', 'Timestamp when the registration was saved'),
    ('status', 'ENUM(confirmed, waitlisted, cancelled)', 'default confirmed', 'Registration state'),
    ('(composite)', 'UNIQUE(event_id, user_id)', 'index', 'Database-level duplicate prevention'),
    ('(indexes)', 'INDEX(event_id,status) / (user_id,status) / (status,registration_date)', 'index', 'Capacity counts, participant filters, FIFO waitlist promotion'),
]

html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Event Registration System — System Documentation</title>
<style>
  * {{ box-sizing: border-box; }}
  body {{ margin:0; background:#eef1f7; color:#15203a;
         font-family:"Segoe UI",system-ui,-apple-system,Roboto,Helvetica,Arial,sans-serif;
         font-size:15px; line-height:1.6; }}
  .page {{ max-width:1200px; margin:0 auto; background:#fff; padding:0 0 60px;
           box-shadow:0 0 40px rgba(21,32,58,.10); }}
  .cover {{ background:linear-gradient(135deg,#15203a,#2f5bff); color:#fff; padding:56px 60px 48px; }}
  .cover .kicker {{ letter-spacing:.28em; font-size:11.5px; text-transform:uppercase; color:#b9c8f2; }}
  .cover h1 {{ margin:10px 0 8px; font-size:2.35rem; line-height:1.15; }}
  .cover p {{ color:#cdd8f5; margin:0; max-width:70ch; }}
  .meta {{ display:flex; flex-wrap:wrap; gap:10px; margin-top:24px; }}
  .meta span {{ background:rgba(255,255,255,.13); border:1px solid rgba(255,255,255,.25);
                padding:6px 13px; border-radius:999px; font-size:12.5px; }}
  main {{ padding:0 60px; }}
  h2 {{ font-size:1.5rem; margin:52px 0 6px; padding-bottom:10px; border-bottom:3px solid #eef1f7; }}
  h2 .num {{ color:#2f5bff; }}
  h3 {{ font-size:1.06rem; margin:30px 0 8px; }}
  h4 {{ margin:20px 0 6px; font-size:.95rem; color:#33406b; }}
  p, li {{ color:#2c3757; }}
  code {{ background:#eef1f7; padding:2px 6px; border-radius:6px; font-size:.86em;
          font-family:Consolas,"Courier New",monospace; color:#1c2a52; }}
  table {{ width:100%; border-collapse:collapse; margin:14px 0 24px; font-size:.9rem; }}
  th, td {{ border:1px solid #e3e8f2; padding:10px 12px; text-align:left; vertical-align:top; }}
  th {{ background:#f5f7fc; font-size:.78rem; text-transform:uppercase; letter-spacing:.05em; color:#5b678a; }}
  tbody tr:nth-child(even) {{ background:#fafbff; }}
  .diagram {{ border:1px solid #e3e8f2; border-radius:14px; padding:14px; margin:18px 0 8px;
              background:#fbfcff; overflow:hidden; }}
  .diagram svg {{ display:block; width:100%; height:auto; max-width:100%; }}
  .diagram.sheet svg {{ max-width:720px; margin:0 auto; }}
  .caption {{ color:#6b7691; font-size:.82rem; margin:6px 0 22px; }}
  pre {{ background:#15203a; color:#dbe4ff; padding:20px 22px; border-radius:12px;
         overflow:auto; font-size:.82rem; line-height:1.55;
         font-family:Consolas,"Courier New",monospace; }}
  .callout {{ border-left:4px solid #2f5bff; background:#f2f6ff; padding:14px 18px; border-radius:0 10px 10px 0;
              margin:18px 0; }}
  .callout.warn {{ border-color:#e79a12; background:#fdf8ee; }}
  .callout.ok {{ border-color:#10a36b; background:#eefaf4; }}
  .pill {{ display:inline-block; padding:2px 9px; border-radius:999px; font-size:.74rem; font-weight:700; }}
  .pill.m {{ background:#e8eeff; color:#2440a8; }}
  .pill.v {{ background:#f3ecff; color:#6d28d9; }}
  .pill.c {{ background:#e3f7ee; color:#0a7d52; }}
  .pill.o {{ background:#eef1f7; color:#5b678a; }}
  footer {{ margin-top:60px; padding:22px 60px; background:#15203a; color:#9fb0d8; font-size:.82rem; }}
  @media print {{
    body {{ background:#fff; }} .page {{ box-shadow:none; max-width:none; }}
    .cover {{ padding:30px; }} main {{ padding:0 26px; }}
    h2 {{ page-break-after:avoid; }} table, pre, .diagram {{ page-break-inside:avoid; }}
    footer {{ display:none; }}
  }}
</style>
</head>
<body>
<div class="page">

  <header class="cover">
    <div class="kicker">System Documentation</div>
    <h1>Event Registration System</h1>
    <p>A web-based system for creating events and allowing participants to register online,
       built on the MVC pattern with Node.js, Express.js, Sequelize and EJS over
       MySQL or PostgreSQL.</p>
    <div class="meta">
      <span>Entity Relationship Diagram</span>
      <span>System Flowchart</span>
      <span>Feature Specification</span>
      <span>System Requirements</span>
      <span>MVC Architecture</span>
    </div>
  </header>

  <main>

    <h2><span class="num">1.</span> System Requirements</h2>
    <table>
      <thead><tr><th style="width:22%">Requirement</th><th style="width:30%">Version</th><th>Purpose</th></tr></thead>
      <tbody>
        {''.join(f'<tr><td><b>{a}</b></td><td><code>{b}</code></td><td>{c}</td></tr>' for a, b, c in requirements)}
      </tbody>
    </table>
    <div class="callout">
      <b>Install &amp; run:</b> <code>npm install</code> &rarr; <code>cp .env.example .env</code> &rarr;
      <code>npm run seed</code> &rarr; <code>npm start</code>, then open
      <code>http://localhost:3000</code>. Default admin: <code>admin@eventreg.test / admin123</code>.
      SQLite is the default dialect so the app runs with no database server; switch to MySQL or
      PostgreSQL with two lines in <code>.env</code>.
    </div>

    <h2><span class="num">2.</span> Entity Relationship Diagram (ERD)</h2>
    <div class="diagram">{erd}</div>
    <p class="caption">Source: <code>docs/ERD.svg</code> · raster copy <code>docs/ERD.png</code> ·
       crow&#8217;s foot notation</p>

    <h3>2.1 Relationship notation</h3>
    <pre>[EVENTS] 1 ──── 0..* [REGISTRATIONS] 0..* ──── 1 [USERS]

• One EVENT has zero or many REGISTRATIONS; each REGISTRATION is for exactly one EVENT.
• One USER has zero or many REGISTRATIONS; each REGISTRATION belongs to exactly one USER.
• REGISTRATIONS is the associative entity that resolves the many-to-many
  relationship between participants and events.</pre>

    <h3>2.2 Data dictionary</h3>

    <h4>USERS</h4>
    {table(['Field', 'Type', 'Key / constraint', 'Description'], users_fields)}

    <h4>EVENTS</h4>
    {table(['Field', 'Type', 'Key / constraint', 'Description'], event_fields)}

    <h4>REGISTRATIONS</h4>
    {table(['Field', 'Type', 'Key / constraint', 'Description'], reg_fields)}

    <div class="callout ok">
      <b>Duplicate rule:</b> a composite UNIQUE index on <code>REGISTRATIONS(event_id, user_id)</code>
      blocks a second registration from the same email for the same event.<br>
      <b>Capacity rule:</b> confirmed registrations may never exceed
      <code>EVENTS.max_participants</code>.
    </div>

    <h2><span class="num">3.</span> System Flowchart</h2>
    <p>The flowchart uses the standard ISO&nbsp;5807 / ANSI symbol set: pills for
    start and end, rectangles for process, <b>parallelograms for input and output</b>,
    <b>cylinders for stored data</b> (every cylinder names the table and the statement it
    runs), diamonds for decisions, double-barred rectangles for named subroutines, and
    rectangles with a wavy base for documents. It is drawn as three A4 sheets &mdash;
    one per actor &mdash; joined by off-page connector circles, so it also prints
    cleanly on a hand-out.</p>
    <div class="diagram">{flow}</div>
    <p class="caption">All three sheets stacked · sources <code>docs/FLOWCHART.svg</code> and
    <code>docs/FLOWCHART.png</code></p>

    <h3>3.0 Sheet A — participant</h3>
    <div class="diagram sheet">{flow_a}</div>
    <p class="caption"><code>docs/FLOWCHART-A.svg</code> · browse, register, confirm, waiting list</p>

    <h3>3.0.1 Sheet B — administration</h3>
    <div class="diagram sheet">{flow_b}</div>
    <p class="caption"><code>docs/FLOWCHART-B.svg</code> · login, dashboard, event, attendance and
    status changes</p>

    <h3>3.0.2 Sheet C — notification worker and guest self-service</h3>
    <div class="diagram sheet">{flow_c}</div>
    <p class="caption"><code>docs/FLOWCHART-C.svg</code> · outbox delivery, retries and
    <code>/r/:token</code></p>

    <h3>3.1 Text form and code mapping</h3>
    <pre>{FLOW_TEXT}</pre>

    <h3>3.2 Exception paths</h3>
    {table(['Condition', 'System response'], [
        ('Email already registered for the event', 'HTTP 409 + <code>views/events/duplicate.ejs</code> &mdash; &ldquo;You are already registered&rdquo;'),
        ('Missing field or invalid email', 'HTTP 422 + form redisplayed with the error list'),
        ('Two participants submit the last slot at the same time', 'The second transaction re-counts inside a row lock and returns the &ldquo;Event full&rdquo; page &mdash; no overbooking'),
        ('A confirmed participant cancels', 'Slot is freed and the earliest <code>waitlisted</code> registration is promoted to <code>confirmed</code>'),
    ])}

    <h2><span class="num">4.</span> Feature Specification</h2>
    {table(['Feature', 'Route', 'Controller action', 'View / output'], [
        ('Create, edit and delete events', '<code>GET/POST /admin/events</code>, <code>PUT/DELETE /admin/events/:id</code>', 'eventController.create / update / destroy', 'admin/event-form.ejs, admin/events.ejs'),
        ('Public event listing page', '<code>GET /</code>', 'eventController.publicList', 'events/index.ejs with search and capacity bars'),
        ('Online participant registration', '<code>POST /events/:id/register</code>', 'registrationController.store', 'events/confirmation.ejs with reference no.'),
        ('Limit registrations (max participants)', 'checked on submit', 'capacity check inside a transaction', 'events/full.ejs &mdash; &ldquo;Event full&rdquo;'),
        ('Prevent duplicate registration (same email)', 'checked on submit', 'duplicate check + UNIQUE index', 'events/duplicate.ejs'),
        ('View registered participants per event', '<code>GET /admin/events/:id/participants</code>', 'adminController.participants', 'admin/participants.ejs with status filters'),
        ('Generate attendance list', '<code>GET /admin/events/:id/attendance</code> and <code>.../attendance.csv</code>', 'adminController.attendance / attendanceCsv', 'admin/attendance.ejs printable sheet + CSV'),
        ('Waiting list (extension of the &ldquo;full&rdquo; branch)', '<code>POST /events/:id/waitlist</code>', 'registrationController.waitlist', 'status <code>waitlisted</code>, auto-promoted on cancellation'),
        ('Accounts and sessions', '<code>/register</code>, <code>/login</code>, <code>/logout</code>, <code>/my-registrations</code>', 'authController', 'auth/*.ejs, my-registrations.ejs'),
    ])}

    <h2><span class="num">5.</span> MVC Architecture</h2>
    <div class="diagram">{mvc}</div>
    <p class="caption">Source: <code>docs/MVC-ARCHITECTURE.svg</code> · raster copy <code>docs/MVC-ARCHITECTURE.png</code></p>

    <div class="callout">
      <b>Request lifecycle:</b>
      Browser &rarr; Router &rarr; Controller &rarr; Model (Sequelize) &rarr; Database &rarr;
      Model &rarr; Controller &rarr; View (EJS) &rarr; Browser
    </div>

    <h3>5.1 File-to-layer mapping</h3>
    {table(['Layer', 'File', 'Responsibility'], [
        ('<span class="pill m">M</span>', f'<code>{f}</code>', d) for f, d in [(x[1], x[2]) for x in files if x[0] == 'M']
    ])}
    {table(['Layer', 'File', 'Responsibility'], [
        ('<span class="pill v">V</span>', f'<code>{f}</code>', d) for f, d in [(x[1], x[2]) for x in files if x[0] == 'V']
    ])}
    {table(['Layer', 'File', 'Responsibility'], [
        ('<span class="pill c">C</span>', f'<code>{f}</code>', d) for f, d in [(x[1], x[2]) for x in files if x[0] == 'C']
    ])}
    {table(['Layer', 'File', 'Responsibility'], [
        ('<span class="pill o">&#8212;</span>', f'<code>{f}</code>', d) for f, d in [(x[1], x[2]) for x in files if x[0] == '-']
    ])}

    <h2><span class="num">6.</span> Route / Endpoint Reference</h2>
    {table(['Method', 'Path', 'Access', 'Controller action', 'Purpose'],
           [(f'<code>{a}</code>', f'<code>{b}</code>', c, f'<code>{d}</code>', e) for a, b, c, d, e in routes])}

    <h2><span class="num">7.</span> Business Rules</h2>
    {table(['#', 'Rule', 'Enforcement'], [
        ('BR-1', 'Registration is only allowed while <code>confirmed &lt; max_participants</code>', 'Application check, re-counted inside a transaction with a row lock'),
        ('BR-2', 'One registration per email address per event', '<code>UNIQUE(event_id, user_id)</code> index + application check (HTTP 409)'),
        ('BR-3', 'Full name and a valid email are required', 'middlewares/validate.js (server) + public/js/main.js (client)'),
        ('BR-4', 'Passwords are hashed, never stored in plain text', 'bcrypt hook in models/User.js'),
        ('BR-5', 'Only admins may create, edit or delete events', 'requireAdmin middleware &rarr; HTTP 403'),
        ('BR-6', 'Capacity cannot drop below the confirmed head-count', 'eventController.update validation'),
        ('BR-7', 'Cancelling a confirmed slot promotes the earliest waitlisted person', 'registrationController.cancel and adminController.updateStatus'),
        ('BR-8', 'Attendance list contains confirmed registrations only', 'adminController.attendance (SQL filter on status)'),
    ])}

    <h2><span class="num">8.</span> Test Cases</h2>
    {table(['TC', 'Scenario', 'Input', 'Expected result'], [
        ('TC-01', 'View public listing', 'GET /', 'All events with slot badges and capacity bars'),
        ('TC-02', 'Open event detail', 'GET /events/2', 'Detail page with registration form'),
        ('TC-03', 'Valid registration', 'new name + email', 'HTTP 201, confirmation page with reference number'),
        ('TC-04', 'Duplicate email, same event', 'same email again', 'HTTP 409 &mdash; &ldquo;You are already registered&rdquo;'),
        ('TC-05', 'Invalid email', 'not-an-email', 'HTTP 422 with the error list'),
        ('TC-06', 'Missing required field', 'blank name', 'HTTP 422 &mdash; Participant name is required.'),
        ('TC-07', 'Register when full', 'event at capacity', 'HTTP 409 &mdash; &ldquo;Event full&rdquo;, limit not exceeded'),
        ('TC-08', 'Waitlist a full event', 'full event + new email', 'HTTP 201, status waitlisted'),
        ('TC-09', 'Cancel a confirmed registration', 'own registration', 'Slot freed, earliest waitlisted promoted'),
        ('TC-10', 'Create event (admin)', 'valid form', 'Event appears in the admin list (HTTP 302)'),
        ('TC-11', 'Edit event (admin)', '<code>_method=PUT</code>', 'Changes saved (HTTP 302)'),
        ('TC-12', 'Delete event (admin)', '<code>_method=DELETE</code>', 'Event and its registrations removed'),
        ('TC-13', 'View participants', '/admin/events/2/participants', 'Rows with name, email, date, status'),
        ('TC-14', 'Attendance list', '/admin/events/2/attendance', 'Printable sheet, confirmed rows only'),
        ('TC-15', 'Attendance CSV', '/admin/events/2/attendance.csv', 'CSV download with correct filename'),
        ('TC-16', 'Non-admin opens /admin', 'participant session', 'HTTP 403 access-denied page'),
        ('TC-17', 'Unknown event', 'GET /events/999', 'HTTP 404 page'),
        ('TC-18', 'Unknown route', 'GET /nope', 'HTTP 404 page'),
    ])}

  </main>

  <footer>
    Event Registration System &middot; Node.js &middot; Express.js &middot; Sequelize &middot;
    MySQL / PostgreSQL &middot; EJS &middot; MVC &mdash; diagrams regenerated with
    <code style="background:rgba(255,255,255,.12);color:#dbe4ff">python3 docs/generate-diagrams.py</code>
  </footer>
</div>
</body>
</html>
"""

out = os.path.join(HERE, 'SYSTEM-DOCS.html')
with open(out, 'w', encoding='utf-8') as fh:
    fh.write(html)
print('wrote', out, f'({len(html)/1024:.1f} KB)')

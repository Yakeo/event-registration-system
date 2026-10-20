# Defense pack — backups, and the questions that will raise eyebrows

Two things go wrong in a defense: the demo breaks, or a panelist finds the seam in the
design. This page covers both. It is written for Windows + XAMPP, on the presentation
laptop, and assumes the venue has no usable internet.

---

## 0. The 20-second version

1. **Copy the whole folder** (including `node_modules`) to a USB stick — `npm install` needs
   the internet, the venue usually does not have it.
2. **Run `npm run seed` on the presentation laptop**, then **copy the seeded `.sqlite` aside**
   so you can restore it in one command if the live demo goes sideways.
3. **Print the diagrams** and keep the PDFs on your phone. If the projector dies, the deck
   does not.
4. **Rehearse the three "eyebrow" answers** in §5: no participant passwords, no migrations,
   JSON in the outbox.

---

## 1. What is actually at risk

| Failure | What it costs | Countermeasure |
|---|---|---|
| Laptop dies / won't boot | the whole demo | screenshots + printed diagrams + phone copy |
| No internet at the venue | `npm install` fails | ship `node_modules` inside the pack |
| Live registration returns a 500 | looks like a broken system | **the shipped `database/event_registration.sqlite` is stale** — run `npm run seed` first (§3) |
| Projector / HDMI fails | nothing to show | printed A4 sheets, PDFs on the phone |
| MySQL refuses to start | no data | one-line switch to SQLite, already seeded in the pack |
| Port 3000 taken | `EADDRINUSE` | `set PORT=3001` |
| Someone asks about e-mail | "did it really send?" | `tmp\outbox\*.eml` open in Notepad, two files pre-saved in the pack |
| Panel opens `docs/SYSTEM-DOCS.pdf` | it is **older** than the current diagrams | print the HTML to PDF yourself (§4.6) |

---

## 2. Build the pack (the day before)

Run these in **Command Prompt**. Adjust the source path to wherever the project lives.

```bat
:: 1. a clean copy, including dependencies, without git or runtime noise
robocopy "C:\Users\jade raven quojial\Downloads\event-registration-system-main\event-registration-system" ^
         "C:\DefensePack\run" /E /XD .git tmp __pycache__ /XF *.log
```

```bat
:: 2. give it its own offline configuration (SQLite, e-mail to files)
cd /d "C:\DefensePack\run"
copy .env.example .env
```

Open `.env` and make sure these three lines are true — this is the "it cannot fail" profile:

```ini
DB_DIALECT=sqlite
DB_STORAGE=./database/event_registration.sqlite
MAIL_TRANSPORT=console
```

```bat
:: 3. rebuild the database from the current models, then keep a pristine copy
npm run seed
mkdir C:\DefensePack\backup
copy /Y database\event_registration.sqlite C:\DefensePack\backup\seeded.sqlite
```

```bat
:: 4. zip it for the USB stick and the phone
powershell -NoProfile -Command "Compress-Archive -Path 'C:\DefensePack\run' -DestinationPath 'C:\DefensePack\eventreg-run.zip' -Force"
```

### What goes in the pack

| Folder | Contents | Why |
|---|---|---|
| `run\` | the whole app + `node_modules` + a seeded database | it starts with no internet |
| `backup\seeded.sqlite` | pre-seeded database | one-command restore |
| `docs\` | `ERD`, `FLOWCHART-A/B/C`, `MVC-ARCHITECTURE` (svg + png), `schema.sql`, `SYSTEM-DOCS.html` | print / show on anything |
| `screens\` | PNG screenshots (§3) | if the app will not start |
| `mail\` | two `*.eml` files | proof the outbox works |
| `eventreg-run.zip` | everything above | phone, cloud, e-mail to yourself |

### The three copies

1. **USB stick** — the unzipped `run\` folder, ready to double-click.
2. **Phone** — `eventreg-run.zip` plus the PNG diagrams (Drive, or just e-mail them to yourself).
3. **Cloud** — the zip in Google Drive, so a replacement laptop can start from zero.

Two of those must work without the venue's Wi-Fi. A phone hotspot does not count as a plan.

---

## 3. T-minus-one-hour checklist

```bat
cd /d C:\DefensePack\run
npm run seed
npm start
```

Then, in the browser, tick these off **in this order**:

- [ ] `http://localhost:3000` loads, events visible with seats left
- [ ] log in `admin@eventreg.test` / `admin123` → dashboard counters are not zero
- [ ] `/admin/events/2/participants` → names and statuses
- [ ] `/admin/events/2/attendance` → printable sheet
- [ ] `/admin/notifications` → 7 outbox rows, none stuck in `failed`
- [ ] log out → register for an empty event with a throwaway address → confirmation page
- [ ] `tmp\outbox\` has a new `.eml`; open it and click the `/r/…` link **while logged out**
- [ ] the console printed the guest manage link at seed time — copy it somewhere visible
- [ ] `/admin/audit` → the registration you just made appears as an audit row
- [ ] stop the server, `npm start` again, reload `/admin` → still logged in (SESSIONS table)

### Screenshots to capture (`C:\DefensePack\screens\`)

Win + Shift + S, save as PNG, eight files:

`01-events` · `02-login` · `03-dashboard` · `04-participants` · `05-attendance` ·
`06-outbox` · `07-confirmation-with-link` · `08-manage-link-page`

Plus the two you hope nobody needs but should have: `09-event-full-409`, `10-forbidden-403`.

---

## 4. Recovery playbooks

**4.1 A registration returns 500.**
Almost always the stale database: the shipped `.sqlite` predates the guest-account change, so
it has `USERS.password NOT NULL` and no `claimed_at`, and `sequelize.sync()` only *creates*
missing tables — it never alters existing columns. Restore and restart:

```bat
copy /Y C:\DefensePack\backup\seeded.sqlite C:\DefensePack\run\database\event_registration.sqlite
npm start
```

**4.2 `npm install` fails / no network.** Do not install at the venue. The pack already has
`node_modules`. If the folder must be rebuilt, copy `node_modules` across rather than
reinstalling — the native `sqlite3` binary is built for the machine that installed it.

**4.3 `EADDRINUSE`.**

```bat
set PORT=3001
npm start
```
…and show `http://localhost:3001`.

**4.4 MySQL will not start.** Open `.env`, set `DB_DIALECT=sqlite`, run `npm run seed`, restart.
Say it out loud: *"the schema is dialect-neutral; SQLite is the fallback for the demo."*

**4.5 The laptop is gone.** Plug the USB into any machine with Node 18+, `cd run`, `npm start`.
If there is no Node either, present from the printed sheets and the screenshots.

**4.6 The PDF is out of date.** `docs/SYSTEM-DOCS.pdf` was rendered before the flowchart was
redrawn, so it shows the old diagram. Do not open it. Instead: open `docs/SYSTEM-DOCS.html` in
Chrome → **Ctrl+P** → *Save as PDF*. Same for any single diagram: open the `.svg` → print →
A4 portrait, margins *Default*, "Fit to page" on.

---

## 5. The eyebrows — what they will ask, what you say

Ten seconds each. The evidence column is what you put on screen.

| # | The question | The answer | Show |
|---|---|---|---|
| 1 | **"Participants have no password? That's insecure."** | A participant is identified by possession of their inbox, the same assumption every password-reset link makes. The link is 32 random bytes, stored only as a SHA-256 digest, expires in 7 days, is consumed inside the same transaction as the action, and is rate limited to 40 uses per 15 minutes. Invalid, expired and already-used links return the same page, so nothing leaks. Staff still authenticate with a password. | `services/manageTokens.js`, `MANAGE_TOKENS` in the ERD, the `/r/…` page |
| 2 | **"Why is `USERS.password` nullable?"** | A guest row is created on first registration so the booking has an owner; the password stays `NULL` until they claim the account, and `claimed_at` records when. `verifyPassword()` returns `false` for a `NULL` hash instead of letting bcrypt throw. Only a claimed account can log in. | `models/User.js`, the "Guest access" note on the ERD |
| 3 | **"Where are your migrations?"** | There are none — the models are the source of truth and `sequelize.sync()` creates missing tables on boot; `docs/schema.sql` is the DDL artefact. This is a known limitation: `sync()` never `ALTER`s an existing column, which is exactly why the seeder drops first. A production deployment would swap in Umzug. **Say the limitation before they find it.** | `server.js` (`sync`), `docs/schema.sql` |
| 4 | **"`NOTIFICATIONS.payload` is JSON — that's not 1NF."** | It is a delivery record, not a relational fact: it stores the values already rendered into one e-mail. Normalising it would mean a table with every possible merge field, mostly `NULL` — worse, not better. The address is also snapshotted on the row on purpose, because the user can change their e-mail later and the log must show where it was actually sent. | the `NOTIFICATIONS` box on the ERD |
| 5 | **"Status is an `ENUM`? Why not a lookup table?"** | ENUM is enforced by MySQL and mirrored by model validators so SQLite cannot take `status = 'banana'`. Lookup tables are the more flexible answer and are written out in `docs/schema-3nf.sql` as the migration target. Trade-off stated, path documented. | `models/Registration.js`, `schema-3nf.sql` |
| 6 | **"The reset token is inside `USERS` — that breaks 3NF."** | Correct, and it is the one documented exception; `docs/schema-3nf.sql` extracts `PASSWORD_RESET_TOKENS`. The guest links were already pulled out into their own table for the same reason. | §4.2 of `DATABASE-AUDIT.md` |
| 7 | **"Where is the reference number stored?"** | Nowhere — it is derived: an HMAC of the primary key with a server secret, e.g. `REG-00049-7F3A9C`. Nothing to backfill, no uniqueness constraint, and a guessed code fails to verify, so the codes cannot be enumerated. Verification uses a constant-time compare. | `models/Registration.js`, the confirmation page |
| 8 | **"`SESSIONS` has no foreign key."** | It is the express-session store: an opaque serialised payload keyed by session id, purged on expiry. It is infrastructure, not business data, so it deliberately has no relationships. | the ERD, `config/sessionStore.js` |
| 9 | **"If the mail server is down, is the booking lost?"** | No — that is why `NOTIFICATIONS` is an outbox. The row is written inside the same transaction as the booking, so a crash between commit and send cannot lose it. A worker drains it, retries three times, and a failure stays visible with its reason and a Requeue button. | `/admin/notifications`, sheet C |
| 10 | **"Two people, last seat. Who wins?"** | The capacity check is re-run inside a transaction with a row lock (`SELECT … FOR UPDATE` on MySQL), so the second one is refused rather than oversold. The unique index `(event_id, user_id)` blocks the duplicate path. | sheet A, `registrationController.js` |
| 11 | **"Isn't this just CRUD?"** | The hard parts are not the forms: capacity under concurrency, a fair FIFO waitlist with transactional promotion, an outbox so e-mail cannot be lost, and single-use links that cannot be replayed. That is the three-minute answer to the whole panel. | sheets A and C |
| 12 | **"What about security in general?"** | bcrypt hashes, CSRF token on every state change, session id rotated on login and on claim, `httpOnly` + `SameSite=Lax` cookies, `secure` in production, per-IP and per-account rate limits with lockout, CSP / `X-Frame-Options` / `nosniff` headers, `x-powered-by` disabled, parameterised queries through the ORM. | `server.js`, `middlewares/` |

### The three that get people

**No participant passwords.** Do not defend it as "passwords are annoying". Defend it as a
threat-model choice: the threat is *someone reading another person's booking*, and a link that
only exists in that person's inbox answers it. Then hand the trade-off back: *"the cost is that
whoever controls the inbox controls the booking — which is also true of every reset flow, and
the account can be claimed with a password at any time."* Show the four properties (hashed,
expiring, single-use, rate limited) and stop talking.

**No migrations.** Say it flatly: *"models are the source of truth, `sync()` creates missing
tables, the seeder rebuilds on schema change; a production deployment would need migrations
and I have written down where."* Panels forgive a documented limitation. They do not forgive
being caught.

**JSON in the outbox.** Normalisation questions are traps; the winning move is to show you know
the rule and can name the exception: *"it is a rendered delivery snapshot, not an entity — the
e-mail address is intentionally denormalised so the log keeps the address it was actually sent
to."*

---

## 6. What not to show

- **`docs/SYSTEM-DOCS.pdf`** — older than the current diagrams.
- **`.env`** — it is on screen-share; it holds the session secret.
- **`database/event_registration.sqlite` as shipped** — seed first, always.
- **A second MySQL and SQLite window at the same time** — pick one story.
- **Any promise about payments** — the system does not take money; say so before they ask.

---

## 7. Cheat card — print this one

```
START           cd C:\DefensePack\run   →   npm start   →   http://localhost:3000
RESTORE DB      copy /Y backup\seeded.sqlite database\event_registration.sqlite
RESET DATA      npm run seed                    (DESTRUCTIVE — rebuilds the 10 tables)
EMPTY ALL       npm run reset                   (no demo data)
PORT BUSY       set PORT=3001  &  npm start
NO MYSQL        .env: DB_DIALECT=sqlite  →  npm run seed  →  npm start
TESTS           npm test                        (49 passing, in-memory, never touches MySQL)
MAIL            tmp\outbox\*.eml

LOGINS          admin@eventreg.test / admin123
                organizer@eventreg.test / organizer123
                maria@email.com / maria123
                juan@email.com … ella@email.com / password123

URLS            /                     event list
                /events/:id            registration form
                /login  /my-registrations
                /admin                 dashboard
                /admin/events/:id/participants | /attendance | /attendance.csv
                /admin/notifications   outbox + Requeue
                /admin/audit           audit trail
                /r/:token              guest manage link (no login)
                /forgot-password

ONE-LINERS      "staff authenticate with passwords; participants are identified by
                 possession of their inbox, and a password is an optional upgrade."
                "the schema is 3NF except the reset token, documented, with the
                 stricter variant in schema-3nf.sql."
                "e-mail is a transactional outbox, so a dead mail server cannot
                 lose a booking."
                "capacity is re-checked under a row lock, so the last seat is
                 never sold twice."
```

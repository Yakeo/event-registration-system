# Running on MySQL (incl. XAMPP on Windows)

The app is dialect-aware: no code changes, only `.env`. SQLite stays the default
so a fresh clone still runs with zero setup.

---

## 1. Create the database

Start MySQL (XAMPP Control Panel → **Start** next to MySQL), then use phpMyAdmin
(`http://localhost/phpmyadmin`) or the CLI:

```sql
CREATE DATABASE event_registration
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

`utf8mb4` matters: the seeded descriptions contain em dashes and accented names.
A latin1 database fails on the first `INSERT` with
`Incorrect string value: '\xE2\x80\x94...'`.

Optional least-privilege account (recommended over using `root`):

```sql
CREATE USER 'eventreg'@'localhost' IDENTIFIED BY 'EventReg2026';
GRANT ALL PRIVILEGES ON event_registration.* TO 'eventreg'@'localhost';
FLUSH PRIVILEGES;
```

`ALL` is required — the seeder needs `DROP`, `CREATE`, `ALTER`, `INDEX` and
`REFERENCES`, not just `SELECT/INSERT`.

---

## 2. Point the app at it

`event-registration-system/.env`:

```ini
PORT=3000
DB_DIALECT=mysql
DB_NAME=event_registration
DB_USER=eventreg
DB_PASS=EventReg2026
DB_HOST=127.0.0.1
DB_PORT=3306
DB_TIMEZONE=+08:00
```

Notes:

- **Use `127.0.0.1`, not `localhost`.** On Windows `localhost` may resolve to
  `::1` while MySQL listens on IPv4 only → `ECONNREFUSED`.
- Quote any password containing `#` or spaces (`DB_PASS="p@ss#1"`), because an
  unquoted `#` starts a dotenv comment.
- `.env` is gitignored; `.env.example` documents every variable.

---

## 3. Create the tables and load the demo data

```bash
npm run seed
```

Expected output:

```
✔ Tables recreated (fresh auto-increment)
✔ Seed complete
  Users         : 18
  Venues        : 7
  Events        : 10 visible (1 archived)
  Registrations : 77  (confirmed 69, waitlisted 6, cancelled 2)
  Attendance    : 20 check-ins
  Status rows   : 81
  Audit rows    : 13
  Notifications : 7 (outbox history)
```

Because the tables are recreated, IDs restart at 1 — the demo pages that
reference specific IDs (`/admin/registrations/49/history`) keep working.

`npm start` then prints `✔ Database connected (dialect: mysql)`.

> **Schema note.** `sequelize.sync()` creates *missing* tables and never alters
> existing columns. That is why the seeder drops first. If you add a column to a
> model, run `npm run seed` (destructive) or write the `ALTER TABLE` yourself.

---

## 4. Verify

```sql
USE event_registration;
SHOW TABLES;                                  -- 10 tables
SELECT COUNT(*) FROM EVENTS;                  -- 11
SELECT COUNT(*) FROM REGISTRATIONS;           -- 77
SHOW CREATE TABLE REGISTRATIONS\G             -- InnoDB + unique index + FKs
```

---

## 5. ⚠️ `npm test` and your data

The suite creates its schema with `{ force: true }`. It pins `DB_DIALECT` and
`DB_STORAGE` at the top of `test/system.test.js`, so it always runs on an
in-memory SQLite database and **can never touch MySQL**, whatever `.env` says.

That line is load-bearing — do not remove it:

```js
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = process.env.TEST_DB_STORAGE || ':memory:';
```

---

## 6. Backups

```bash
# Windows (XAMPP)
"C:\xampp\mysql\bin\mysqldump.exe" -u root event_registration > backup.sql

# restore
"C:\xampp\mysql\bin\mysql.exe" -u root event_registration < backup.sql
```

---

## 7. Troubleshooting

| Error | Cause / fix |
|---|---|
| `ECONNREFUSED 127.0.0.1:3306` | MySQL not running, or a different port. Start it in XAMPP |
| `ER_ACCESS_DENIED_ERROR ... (using password: YES)` | Wrong password, or the account exists for `localhost` but you connect to `127.0.0.1` (they are different accounts in MySQL). Create both, or use `root` |
| `ER_BAD_DB_ERROR: Unknown database` | Sequelize never creates the database — run the `CREATE DATABASE` |
| `DROP command denied` | Grant `ALL` on `event_registration.*` |
| `Incorrect string value` | Database created as latin1 — recreate with `utf8mb4` |
| `EADDRINUSE :3000` | Old server still running: `pkill -f "node server.js"` / `npx kill-port 3000`, or set `PORT=3001` |
| MySQL service dies on start | Port 3306 already taken by another install: `netstat -ano | findstr :3306`. Either stop the other service or change XAMPP's port in `my.ini` **and** `DB_PORT` |

---

## 8. Switching back to SQLite

Comment out `DB_DIALECT=mysql` (or set `DB_DIALECT=sqlite`) and restart. The
committed `database/event_registration.sqlite` is untouched by any MySQL work,
so the zero-setup demo is always one env line away.

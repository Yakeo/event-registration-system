-- ============================================================================
--  Event Registration System — MySQL 8 schema (v2)
--  This file mirrors the Sequelize models in models/ and is the DDL that
--  database/event_registration.sqlite is generated from.
--
--  Relationships
--    VENUES 1 ---- 0..* EVENTS 1 ---- 0..* REGISTRATIONS 0..* ---- 1 USERS
--    REGISTRATIONS 1 ---- 0..1 ATTENDANCE
--    REGISTRATIONS 1 ---- 0..* REGISTRATION_STATUS_CHANGES
--    USERS 1 ---- 0..* AUDIT_LOGS / REGISTRATION_STATUS_CHANGES / ATTENDANCE
--    SESSIONS (standalone: express-session payload store)
--
--  Normal form: 1NF, 2NF and 3NF are satisfied for every table below.
--  The single-use reset token on USERS is the one documented exception —
--  see docs/DATABASE-AUDIT.md and docs/schema-3nf.sql for the stricter variant
--  (PASSWORD_RESET_TOKENS, lookup tables, NOTIFICATIONS).
-- ============================================================================
CREATE DATABASE IF NOT EXISTS event_registration
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE event_registration;

-- ------------------------------------------------------------------ USERS ---
CREATE TABLE IF NOT EXISTS USERS (
  user_id                INT AUTO_INCREMENT PRIMARY KEY,
  full_name              VARCHAR(120) NOT NULL,
  email                  VARCHAR(160) NOT NULL,                    -- login identifier, stored lower-case
  password               VARCHAR(255) NOT NULL,                    -- bcrypt hash (max 72 input bytes)
  role                   ENUM('admin','participant') NOT NULL DEFAULT 'participant',
  reset_password_token   CHAR(64) NULL DEFAULT NULL,               -- SHA-256 hex digest of the emailed token
  reset_password_expires DATETIME NULL DEFAULT NULL,               -- token expiration (1 hour TTL)
  CONSTRAINT uq_users_email UNIQUE (email),
  CONSTRAINT uq_users_reset_token UNIQUE (reset_password_token),   -- MySQL allows many NULLs
  CONSTRAINT chk_users_email CHECK (email LIKE '%@%.%')
) ENGINE=InnoDB;

CREATE INDEX idx_users_role ON USERS (role);

-- ---------------------------------------------------------------- VENUES ---
CREATE TABLE IF NOT EXISTS VENUES (
  venue_id INT AUTO_INCREMENT PRIMARY KEY,
  name     VARCHAR(180) NOT NULL,
  address  VARCHAR(255) NULL,
  city     VARCHAR(120) NOT NULL DEFAULT '',                        -- '' when unknown: keeps UNIQUE(name, city) usable
  CONSTRAINT uq_venues_name_city UNIQUE (name, city)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------- EVENTS ---
CREATE TABLE IF NOT EXISTS EVENTS (
  event_id         INT AUTO_INCREMENT PRIMARY KEY,
  title            VARCHAR(180) NOT NULL,
  description      TEXT NULL,
  event_date       DATETIME NOT NULL,                               -- stored in UTC, displayed in Asia/Manila
  venue_id         INT NOT NULL,
  max_participants INT NOT NULL DEFAULT 10,
  deleted_at       DATETIME NULL DEFAULT NULL,                      -- soft delete: NULL = active
  CONSTRAINT chk_events_max CHECK (max_participants >= 1),
  CONSTRAINT fk_events_venue FOREIGN KEY (venue_id) REFERENCES VENUES(venue_id)
      ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE INDEX idx_events_date   ON EVENTS (event_date);
CREATE INDEX idx_events_venue  ON EVENTS (venue_id);

-- ----------------------------------------------------------- REGISTRATIONS ---
CREATE TABLE IF NOT EXISTS REGISTRATIONS (
  registration_id   INT AUTO_INCREMENT PRIMARY KEY,
  user_id           INT NOT NULL,
  event_id          INT NOT NULL,
  registration_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status            ENUM('confirmed','waitlisted','cancelled') NOT NULL DEFAULT 'confirmed',
  CONSTRAINT fk_reg_user  FOREIGN KEY (user_id)  REFERENCES USERS(user_id)
      ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_reg_event FOREIGN KEY (event_id) REFERENCES EVENTS(event_id)
      ON DELETE CASCADE ON UPDATE CASCADE,
  -- business rule: one registration row per participant per event
  CONSTRAINT uq_registration_event_user UNIQUE (event_id, user_id)
) ENGINE=InnoDB;

CREATE INDEX idx_reg_event_status   ON REGISTRATIONS (event_id, status);          -- capacity count / participant filter
CREATE INDEX idx_reg_user_status    ON REGISTRATIONS (user_id, status);           -- "my registrations"
CREATE INDEX idx_reg_status_date    ON REGISTRATIONS (status, registration_date); -- waitlist FIFO promotion

-- -------------------------------------------------------- STATUS HISTORY ---
-- One row per transition: this is where "cancelled_at / promoted_at / by whom"
-- lives. Adding those as columns on REGISTRATIONS would leave most rows empty.
CREATE TABLE IF NOT EXISTS REGISTRATION_STATUS_CHANGES (
  change_id       INT AUTO_INCREMENT PRIMARY KEY,
  registration_id INT NOT NULL,
  from_status     ENUM('confirmed','waitlisted','cancelled') NULL,
  to_status       ENUM('confirmed','waitlisted','cancelled') NOT NULL,
  changed_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  changed_by      INT NULL,                                         -- NULL = automated (waitlist promotion)
  reason          VARCHAR(255) NULL,
  CONSTRAINT fk_rsc_registration FOREIGN KEY (registration_id) REFERENCES REGISTRATIONS(registration_id)
      ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_rsc_actor FOREIGN KEY (changed_by) REFERENCES USERS(user_id)
      ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE INDEX idx_rsc_registration ON REGISTRATION_STATUS_CHANGES (registration_id, changed_at);
CREATE INDEX idx_rsc_to_status    ON REGISTRATION_STATUS_CHANGES (to_status);

-- ------------------------------------------------------------- ATTENDANCE ---
-- Physical check-in is a different fact from registration (no-shows exist).
CREATE TABLE IF NOT EXISTS ATTENDANCE (
  attendance_id   INT AUTO_INCREMENT PRIMARY KEY,
  registration_id INT NOT NULL,
  checked_in_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  checked_in_by   INT NULL,
  remarks         VARCHAR(255) NULL,
  CONSTRAINT uq_attendance_registration UNIQUE (registration_id),
  CONSTRAINT fk_attendance_registration FOREIGN KEY (registration_id) REFERENCES REGISTRATIONS(registration_id)
      ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_attendance_actor FOREIGN KEY (checked_in_by) REFERENCES USERS(user_id)
      ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ------------------------------------------------------------- AUDIT LOGS ---
CREATE TABLE IF NOT EXISTS AUDIT_LOGS (
  log_id     BIGINT AUTO_INCREMENT PRIMARY KEY,
  actor_id   INT NULL,                                              -- NULL = anonymous/system action
  action     VARCHAR(60) NOT NULL,                                  -- 'event.archive', 'user.role_change', ...
  entity     VARCHAR(60) NOT NULL,
  entity_id  VARCHAR(60) NULL,
  detail     JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_id) REFERENCES USERS(user_id)
      ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE INDEX idx_audit_entity  ON AUDIT_LOGS (entity, entity_id);
CREATE INDEX idx_audit_created ON AUDIT_LOGS (created_at);

-- --------------------------------------------------------------- SESSIONS ---
CREATE TABLE IF NOT EXISTS SESSIONS (
  sid        VARCHAR(64) PRIMARY KEY,
  data       TEXT NOT NULL,
  expires_at DATETIME NOT NULL
) ENGINE=InnoDB;

CREATE INDEX idx_sessions_expires ON SESSIONS (expires_at);

-- ============================================================================
--  Application queries (kept in sync with the Sequelize controllers)
-- ============================================================================

-- 1) Public event listing with capacity counters.
--    Written as a correlated subquery so it also runs with MySQL's default
--    ONLY_FULL_GROUP_BY mode (the previous GROUP BY e.event_id + e.* form
--    fails on MySQL 8 because e.* is not functionally dependent on the
--    grouped column in all versions/forks).
SELECT e.event_id, e.title, e.event_date, e.max_participants,
       v.name AS venue, v.city,
       (SELECT COUNT(*) FROM REGISTRATIONS r
         WHERE r.event_id = e.event_id AND r.status = 'confirmed') AS taken,
       e.max_participants -
       (SELECT COUNT(*) FROM REGISTRATIONS r
         WHERE r.event_id = e.event_id AND r.status = 'confirmed') AS remaining
FROM EVENTS e
JOIN VENUES v ON v.venue_id = e.venue_id
WHERE e.deleted_at IS NULL                    -- archived events are hidden
ORDER BY e.event_date ASC;

-- 2) Registered participants of one event (participants page)
SELECT r.registration_id, u.full_name, u.email, r.registration_date, r.status
FROM REGISTRATIONS r
JOIN USERS u ON u.user_id = r.user_id
WHERE r.event_id = 1
ORDER BY r.registration_date ASC;

-- 3) Attendance list (confirmed participants only) with real check-in data
SELECT r.registration_id,
       u.full_name AS participant_name,
       u.email,
       r.registration_date,
       a.checked_in_at,
       cb.full_name AS checked_in_by
FROM REGISTRATIONS r
JOIN USERS u ON u.user_id = r.user_id
LEFT JOIN ATTENDANCE a ON a.registration_id = r.registration_id
LEFT JOIN USERS cb ON cb.user_id = a.checked_in_by
WHERE r.event_id = 1 AND r.status = 'confirmed'
ORDER BY r.registration_date ASC;

-- 4) Duplicate check before saving a registration (event + participant)
SELECT 1
FROM REGISTRATIONS r
JOIN USERS u ON u.user_id = r.user_id
WHERE r.event_id = 1 AND u.email = 'juan@email.com'
LIMIT 1;

-- 5) Remaining-slot check (same predicate the registration transaction uses)
SELECT e.max_participants - COUNT(r.registration_id) AS remaining
FROM EVENTS e
LEFT JOIN REGISTRATIONS r
       ON r.event_id = e.event_id AND r.status = 'confirmed'
WHERE e.event_id = 1
GROUP BY e.event_id, e.max_participants;

-- 6) Waitlist FIFO head (used when a confirmed slot frees up)
SELECT r.registration_id, u.full_name, u.email, r.registration_date
FROM REGISTRATIONS r
JOIN USERS u ON u.user_id = r.user_id
WHERE r.event_id = 1 AND r.status = 'waitlisted'
ORDER BY r.registration_date ASC, r.registration_id ASC
LIMIT 1;

-- 7) Status history of one registration (timeline page)
SELECT c.change_id, c.from_status, c.to_status, c.changed_at, c.reason,
       actor.full_name AS changed_by
FROM REGISTRATION_STATUS_CHANGES c
LEFT JOIN USERS actor ON actor.user_id = c.changed_by
WHERE c.registration_id = 1
ORDER BY c.changed_at ASC, c.change_id ASC;

-- 8) Who changed what (audit browser)
SELECT a.log_id, a.created_at, u.full_name AS actor, a.action, a.entity, a.entity_id, a.detail
FROM AUDIT_LOGS a
LEFT JOIN USERS u ON u.user_id = a.actor_id
ORDER BY a.created_at DESC
LIMIT 25;

-- 9) Forgot Password: token lookup.
--    The application stores SHA-256(token); substitute the digest, never the
--    raw token from the reset link.
SELECT user_id, email, full_name, reset_password_expires
FROM USERS
WHERE reset_password_token = SHA2('sample_raw_token_value', 256)
  AND reset_password_expires > UTC_TIMESTAMP()
LIMIT 1;

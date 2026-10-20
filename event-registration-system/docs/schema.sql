-- ============================================================================
--  Event Registration System — MySQL 8 schema
--  This file mirrors the Sequelize models in models/ and is the DDL that
--  database/event_registration.sqlite is generated from.
--
--  Relationships
--    USERS 1 ---- 0..* REGISTRATIONS 0..* ---- 1 EVENTS
--    (REGISTRATIONS is the associative entity of the participant/event M:N)
--
--  Normal form: 1NF, 2NF and 3NF are satisfied for the current tables.
--  The reset-token columns on USERS are the one deliberate exception —
--  see docs/DATABASE-AUDIT.md (section "Reset tokens and 3NF") and
--  docs/schema-3nf.sql for the stricter 3NF variant.
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

-- ----------------------------------------------------------------- EVENTS ---
CREATE TABLE IF NOT EXISTS EVENTS (
  event_id         INT AUTO_INCREMENT PRIMARY KEY,
  title            VARCHAR(180) NOT NULL,
  description      TEXT NULL,
  event_date       DATETIME NOT NULL,                               -- stored in UTC, displayed in Asia/Manila
  venue            VARCHAR(180) NOT NULL,
  max_participants INT NOT NULL DEFAULT 10,
  CONSTRAINT chk_events_max CHECK (max_participants >= 1)
) ENGINE=InnoDB;

CREATE INDEX idx_events_date ON EVENTS (event_date);

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

-- ============================================================================
--  Application queries (kept in sync with the Sequelize controllers)
-- ============================================================================

-- 1) Public event listing with capacity counters.
--    Written as a correlated subquery so it also runs with MySQL's default
--    ONLY_FULL_GROUP_BY mode (the previous GROUP BY e.event_id + e.* form
--    fails on MySQL 8 because e.* is not functionally dependent on the
--    grouped column in all versions/forks).
SELECT e.*,
       (SELECT COUNT(*) FROM REGISTRATIONS r
         WHERE r.event_id = e.event_id AND r.status = 'confirmed') AS taken,
       e.max_participants -
       (SELECT COUNT(*) FROM REGISTRATIONS r
         WHERE r.event_id = e.event_id AND r.status = 'confirmed') AS remaining
FROM EVENTS e
ORDER BY e.event_date ASC;

-- 2) Registered participants of one event (participants page)
SELECT r.registration_id, u.full_name, u.email, r.registration_date, r.status
FROM REGISTRATIONS r
JOIN USERS u ON u.user_id = r.user_id
WHERE r.event_id = 1
ORDER BY r.registration_date ASC;

-- 3) Attendance list (confirmed participants only)
SELECT r.registration_id, u.full_name AS participant_name, u.email, r.registration_date
FROM REGISTRATIONS r
JOIN USERS u ON u.user_id = r.user_id
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

-- 7) Forgot Password: token lookup.
--    The application stores SHA-256(token); substitute the digest, never the
--    raw token from the reset link.
SELECT user_id, email, full_name, reset_password_expires
FROM USERS
WHERE reset_password_token = SHA2('sample_raw_token_value', 256)
  AND reset_password_expires > UTC_TIMESTAMP()
LIMIT 1;

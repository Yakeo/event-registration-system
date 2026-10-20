-- ============================================================================
--  Event Registration System — PROPOSED NORMALISED SCHEMA (v2)
--  Strict 3NF/BCNF target for the Event Registration System.
--
--  This file is a design proposal, NOT the schema the app currently runs on.
--  The running schema is docs/schema.sql (USERS / EVENTS / REGISTRATIONS).
--  Migration notes live in docs/DATABASE-AUDIT.md (section 8).
--
--  What changes and why
--  --------------------
--   1. PASSWORD_RESET_TOKENS  — moves the single-use token out of USERS so a
--                               token is its own entity with its own key and
--                               lifetime (removes the partial dependency
--                               USERS -> token).
--   2. VENUES                 — removes the transitive dependency
--                               event -> venue -> venue address.
--   3. REGISTRATION_STATUSES  — replaces the ENUM with a reference table so
--                               status labels are data, not schema.
--   4. REGISTRATION_STATUS_CHANGES — audit trail for every status change
--                               (cancellation time, promotion time, actor).
--                               Replaces ad-hoc "date_confirmed" columns that
--                               would otherwise repeat for every transition.
--   5. ATTENDANCE             — 1:1 with REGISTRATIONS; records physical
--                               check-in instead of overloading `status`.
--   6. AUDIT_LOGS             — who changed what (admin actions, role
--                               changes, password resets).
--   7. EVENT_STAFF            — co-organisers per event (many-to-many).
--   8. NOTIFICATIONS          — outbox for confirmation / promotion messages
--                               (an e-mail provider can be plugged in later).
-- ============================================================================
CREATE DATABASE IF NOT EXISTS event_registration_v2
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE event_registration_v2;

-- ---------------------------------------------------------------- ROLES -----
-- Optional but recommended: role names become data instead of an ENUM, and
-- permissions can be attached to a role without an ALTER TABLE.
CREATE TABLE ROLES (
  role_code   VARCHAR(20) PRIMARY KEY,               -- 'admin' | 'participant'
  description VARCHAR(120) NOT NULL
);

INSERT INTO ROLES (role_code, description) VALUES
  ('admin', 'Manages events, participants and user accounts'),
  ('participant', 'Browses events and registers online');

-- ---------------------------------------------------------------- USERS -----
CREATE TABLE USERS (
  user_id       INT AUTO_INCREMENT PRIMARY KEY,
  full_name     VARCHAR(120) NOT NULL,
  email         VARCHAR(160) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,               -- bcrypt, 72 input bytes max
  role_code     VARCHAR(20) NOT NULL DEFAULT 'participant',
  email_verified_at DATETIME NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_users_email UNIQUE (email),
  CONSTRAINT fk_users_role FOREIGN KEY (role_code) REFERENCES ROLES(role_code)
      ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE INDEX idx_users_role ON USERS (role_code);

-- -------------------------------------------------------- PASSWORD TOKENS ----
-- Every reset request is a row. Only the SHA-256 digest is stored; the raw
-- token goes into the e-mail/reset link exactly once.
CREATE TABLE PASSWORD_RESET_TOKENS (
  token_id    INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  token_hash  CHAR(64) NOT NULL,
  expires_at  DATETIME NOT NULL,
  used_at     DATETIME NULL,                          -- NULL = still usable
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_prt_token UNIQUE (token_hash),
  CONSTRAINT fk_prt_user FOREIGN KEY (user_id) REFERENCES USERS(user_id)
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX idx_prt_user_expiry ON PASSWORD_RESET_TOKENS (user_id, expires_at);

-- --------------------------------------------------------------- VENUES -----
CREATE TABLE VENUES (
  venue_id INT AUTO_INCREMENT PRIMARY KEY,
  name     VARCHAR(180) NOT NULL,
  address  VARCHAR(255) NULL,
  city     VARCHAR(120) NULL,
  CONSTRAINT uq_venues_name_city UNIQUE (name, city)
);

-- ---------------------------------------------------------- EVENT STATUS ----
CREATE TABLE EVENT_STATUSES (
  status_code VARCHAR(20) PRIMARY KEY,               -- 'scheduled' | 'cancelled' | ...
  description VARCHAR(120) NOT NULL
);

INSERT INTO EVENT_STATUSES (status_code, description) VALUES
  ('scheduled', 'Event is scheduled and open for registration'),
  ('cancelled', 'Event was cancelled by the organiser');

-- --------------------------------------------------------------- EVENTS -----
CREATE TABLE EVENTS (
  event_id         INT AUTO_INCREMENT PRIMARY KEY,
  title            VARCHAR(180) NOT NULL,
  description      TEXT NULL,
  event_date       DATETIME NOT NULL,                 -- UTC
  venue_id         INT NULL,                          -- NULL = venue not recorded yet
  max_participants INT NOT NULL DEFAULT 10,
  status_code      VARCHAR(20) NOT NULL DEFAULT 'scheduled',
  created_by       INT NOT NULL,                      -- organiser (USERS.user_id)
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_events_max CHECK (max_participants >= 1),
  CONSTRAINT fk_events_venue FOREIGN KEY (venue_id) REFERENCES VENUES(venue_id)
      ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_events_status FOREIGN KEY (status_code) REFERENCES EVENT_STATUSES(status_code),
  CONSTRAINT fk_events_creator FOREIGN KEY (created_by) REFERENCES USERS(user_id)
);

CREATE INDEX idx_events_date   ON EVENTS (event_date);
CREATE INDEX idx_events_venue  ON EVENTS (venue_id);

-- ------------------------------------------------------------ EVENT STAFF ---
CREATE TABLE EVENT_STAFF (
  event_id     INT NOT NULL,
  user_id      INT NOT NULL,
  staff_role   VARCHAR(40) NOT NULL,                  -- 'organiser' | 'check-in' | 'assistant'
  PRIMARY KEY (event_id, user_id, staff_role),
  CONSTRAINT fk_staff_event FOREIGN KEY (event_id) REFERENCES EVENTS(event_id)
      ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_staff_user FOREIGN KEY (user_id) REFERENCES USERS(user_id)
      ON DELETE CASCADE ON UPDATE CASCADE
);

-- ------------------------------------------------- REGISTRATION STATUSES ----
CREATE TABLE REGISTRATION_STATUSES (
  status_code VARCHAR(20) PRIMARY KEY,                -- 'confirmed' | 'waitlisted' | 'cancelled'
  description VARCHAR(120) NOT NULL,
  is_active   TINYINT(1) NOT NULL DEFAULT 1           -- counts against capacity?
);

INSERT INTO REGISTRATION_STATUSES (status_code, description, is_active) VALUES
  ('confirmed',  'Seat reserved',                1),
  ('waitlisted', 'Waiting for a freed seat',     0),
  ('cancelled',  'Registration withdrawn',       0);

-- ---------------------------------------------------------- REGISTRATIONS ---
CREATE TABLE REGISTRATIONS (
  registration_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id         INT NOT NULL,
  event_id        INT NOT NULL,
  status_code     VARCHAR(20) NOT NULL DEFAULT 'confirmed',
  registered_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_registration_event_user UNIQUE (event_id, user_id),
  CONSTRAINT fk_reg_user   FOREIGN KEY (user_id)   REFERENCES USERS(user_id)
      ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_reg_event  FOREIGN KEY (event_id)  REFERENCES EVENTS(event_id)
      ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_reg_status FOREIGN KEY (status_code) REFERENCES REGISTRATION_STATUSES(status_code)
);

CREATE INDEX idx_reg_event_status ON REGISTRATIONS (event_id, status_code);
CREATE INDEX idx_reg_user_status  ON REGISTRATIONS (user_id, status_code);

-- -------------------------------------------------- REGISTRATION HISTORY ----
-- One row per transition. This is where "when was it cancelled / promoted"
-- belongs — it would be redundant (and 2NF-violating) as columns on
-- REGISTRATIONS.
CREATE TABLE REGISTRATION_STATUS_CHANGES (
  change_id        INT AUTO_INCREMENT PRIMARY KEY,
  registration_id  INT NOT NULL,
  from_status      VARCHAR(20) NULL,
  to_status        VARCHAR(20) NOT NULL,
  changed_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  changed_by       INT NULL,                          -- NULL = automated promotion
  reason           VARCHAR(255) NULL,
  CONSTRAINT fk_rsc_registration FOREIGN KEY (registration_id) REFERENCES REGISTRATIONS(registration_id)
      ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_rsc_status FOREIGN KEY (to_status) REFERENCES REGISTRATION_STATUSES(status_code),
  CONSTRAINT fk_rsc_actor  FOREIGN KEY (changed_by) REFERENCES USERS(user_id)
);

CREATE INDEX idx_rsc_registration ON REGISTRATION_STATUS_CHANGES (registration_id, changed_at);

-- ------------------------------------------------------------- ATTENDANCE ---
-- Physical check-in is a separate fact from registration; a participant can
-- be confirmed and still not show up. 1:1 with REGISTRATIONS.
CREATE TABLE ATTENDANCE (
  attendance_id   INT AUTO_INCREMENT PRIMARY KEY,
  registration_id INT NOT NULL,
  checked_in_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  checked_in_by   INT NULL,
  remarks         VARCHAR(255) NULL,
  CONSTRAINT uq_attendance_registration UNIQUE (registration_id),
  CONSTRAINT fk_attendance_registration FOREIGN KEY (registration_id)
      REFERENCES REGISTRATIONS(registration_id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_attendance_actor FOREIGN KEY (checked_in_by) REFERENCES USERS(user_id)
);

-- ------------------------------------------------------------ AUDIT LOGS ----
CREATE TABLE AUDIT_LOGS (
  log_id      BIGINT AUTO_INCREMENT PRIMARY KEY,
  actor_id    INT NULL,
  action      VARCHAR(60) NOT NULL,                   -- 'event.delete', 'user.role_change', ...
  entity      VARCHAR(60) NOT NULL,                   -- table or resource name
  entity_id   VARCHAR(60) NULL,
  detail      JSON NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_id) REFERENCES USERS(user_id)
      ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX idx_audit_entity ON AUDIT_LOGS (entity, entity_id);
CREATE INDEX idx_audit_created ON AUDIT_LOGS (created_at);

-- --------------------------------------------------------- NOTIFICATIONS ----
CREATE TABLE NOTIFICATIONS (
  notification_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id         INT NOT NULL,
  registration_id INT NULL,
  channel         VARCHAR(20) NOT NULL DEFAULT 'email',
  template        VARCHAR(60) NOT NULL,               -- 'registration.confirmed', 'waitlist.promoted'
  payload         JSON NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending',
  sent_at         DATETIME NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notification_user FOREIGN KEY (user_id) REFERENCES USERS(user_id)
      ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_notification_registration FOREIGN KEY (registration_id)
      REFERENCES REGISTRATIONS(registration_id) ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX idx_notification_pending ON NOTIFICATIONS (status, created_at);

-- ============================================================================
--  Reporting query used by the "participants / attendance" screens
-- ============================================================================
SELECT r.registration_id,
       u.full_name,
       u.email,
       r.status_code,
       r.registered_at,
       a.checked_in_at
FROM REGISTRATIONS r
JOIN USERS u       ON u.user_id = r.user_id
LEFT JOIN ATTENDANCE a ON a.registration_id = r.registration_id
WHERE r.event_id = 1
ORDER BY r.registered_at ASC;

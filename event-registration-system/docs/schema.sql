-- ============================================================================
--  Event Registration System — MySQL schema (Sequelize models mirror this file)
--  ERD: [EVENTS] 1 ---- 0..* [REGISTRATIONS] 0..* ---- 1 [USERS]
-- ============================================================================
CREATE DATABASE IF NOT EXISTS event_registration
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE event_registration;

-- ------------------------------------------------------------------ USERS ---
CREATE TABLE IF NOT EXISTS USERS (
  user_id                INT AUTO_INCREMENT PRIMARY KEY,
  full_name              VARCHAR(120) NOT NULL,
  email                  VARCHAR(160) NOT NULL,
  password               VARCHAR(255) NOT NULL,                    -- bcrypt hash
  role                   ENUM('admin','participant') NOT NULL DEFAULT 'participant',
  reset_password_token   VARCHAR(255) NULL DEFAULT NULL,           -- cryptographic token (64 hex chars)
  reset_password_expires DATETIME NULL DEFAULT NULL,               -- token expiration (1 hour TTL)
  CONSTRAINT uq_users_email UNIQUE (email)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------- EVENTS ---
CREATE TABLE IF NOT EXISTS EVENTS (
  event_id         INT AUTO_INCREMENT PRIMARY KEY,
  title            VARCHAR(180) NOT NULL,
  description      TEXT,
  event_date       DATETIME NOT NULL,
  venue            VARCHAR(180) NOT NULL,
  max_participants INT NOT NULL DEFAULT 10,
  CONSTRAINT chk_events_max CHECK (max_participants >= 1)
) ENGINE=InnoDB;

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
  -- business rule: one registration per participant per event
  CONSTRAINT uq_registration_event_user UNIQUE (event_id, user_id)
) ENGINE=InnoDB;

CREATE INDEX idx_reg_event_status ON REGISTRATIONS (event_id, status);
CREATE INDEX idx_reg_user         ON REGISTRATIONS (user_id);

-- ============================================================================
--  Sample queries used by the application
-- ============================================================================

-- 1) Public event listing with capacity counters
SELECT e.*,
       COALESCE(SUM(r.status = 'confirmed'), 0)                       AS taken,
       e.max_participants - COALESCE(SUM(r.status = 'confirmed'), 0)  AS remaining
FROM EVENTS e
LEFT JOIN REGISTRATIONS r ON r.event_id = e.event_id
GROUP BY e.event_id
ORDER BY e.event_date ASC;

-- 2) Registered participants of one event (participants page)
SELECT r.registration_id, u.full_name, u.email, r.registration_date, r.status
FROM REGISTRATIONS r
JOIN USERS u ON u.user_id = r.user_id
WHERE r.event_id = 1
ORDER BY r.registration_date ASC;

-- 3) Attendance list (confirmed participants only)
SELECT u.full_name AS participant_name, u.email, r.registration_date
FROM REGISTRATIONS r
JOIN USERS u ON u.user_id = r.user_id
WHERE r.event_id = 1 AND r.status = 'confirmed'
ORDER BY r.registration_date ASC;

-- 4) Duplicate check before saving a registration
SELECT 1
FROM REGISTRATIONS r
JOIN USERS u ON u.user_id = r.user_id
WHERE r.event_id = 1 AND u.email = 'juan@email.com'
LIMIT 1;

-- 5) Remaining-slot check
SELECT e.max_participants - COUNT(r.registration_id) AS remaining
FROM EVENTS e
LEFT JOIN REGISTRATIONS r ON r.event_id = e.event_id AND r.status = 'confirmed'
WHERE e.event_id = 1
GROUP BY e.event_id;

-- 6) Forgot Password: Token lookup with expiration check
SELECT user_id, email, full_name, reset_password_expires
FROM USERS
WHERE reset_password_token = 'sample_secure_token_string'
  AND reset_password_expires > NOW()
LIMIT 1;

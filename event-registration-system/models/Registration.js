/**
 * models/Registration.js  ->  table: REGISTRATIONS
 * - registration_id (PK)
 * - user_id (FK -> USERS.user_id)
 * - event_id (FK -> EVENTS.event_id)
 * - registration_date
 * - status ('confirmed' | 'waitlisted' | 'cancelled')
 *
 * A composite UNIQUE index on (event_id, user_id) is what enforces the
 * "no duplicate registration" business rule at the database level.
 */
const { DataTypes } = require('sequelize');
const crypto = require('crypto');

module.exports = (sequelize) => {
  const Registration = sequelize.define(
    'Registration',
    {
      registration_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'USERS', key: 'user_id' },
      },
      event_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'EVENTS', key: 'event_id' },
      },
      registration_date: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      status: {
        type: DataTypes.ENUM('confirmed', 'waitlisted', 'cancelled'),
        allowNull: false,
        defaultValue: 'confirmed',
        // SQLite stores ENUM as plain TEXT, so enforce the domain in the model
        // as well - otherwise any client could write status = 'banana'.
        validate: {
          isIn: {
            args: [['confirmed', 'waitlisted', 'cancelled']],
            msg: 'Status must be confirmed, waitlisted or cancelled.',
          },
        },
      },
    },
    {
      tableName: 'REGISTRATIONS',
      timestamps: false,
      indexes: [
        {
          name: 'uq_registration_event_user',
          unique: true,
          fields: ['event_id', 'user_id'],
        },
        // Capacity counts, participant filters and waitlist FIFO lookups.
        { name: 'idx_reg_event_status', fields: ['event_id', 'status'] },
        { name: 'idx_reg_user_status', fields: ['user_id', 'status'] },
        { name: 'idx_reg_status_date', fields: ['status', 'registration_date'] },
      ],
    }
  );

  /* ----------------------------- reference codes ---------------------------- */
  /**
   * Guest-facing reference, e.g. `REG-00049-7F3A9C`.
   *
   * The numeric part is the primary key, which on its own would let anyone
   * enumerate every booking by typing REG-00001, REG-00002, ... The six
   * hexadecimal characters are an HMAC of the id, so a code proves the holder
   * was given it (at the door, in an e-mail) without needing a column, a
   * backfill or a uniqueness constraint.
   */
  function referenceSecret() {
    return (
      process.env.REFERENCE_SECRET ||
      process.env.SESSION_SECRET ||
      'event-registration-dev-only-secret'
    );
  }

  Registration.referenceFor = function referenceFor(registrationId) {
    const id = Number(registrationId);
    if (!Number.isInteger(id) || id <= 0) return null;
    const digest = crypto
      .createHmac('sha256', referenceSecret())
      .update(`registration:${id}`)
      .digest('hex')
      .slice(0, 6)
      .toUpperCase();
    return `REG-${String(id).padStart(5, '0')}-${digest}`;
  };

  /**
   * Returns the registration_id a reference code belongs to, or null.
   * Used by the door check so a guessed code is rejected.
   */
  Registration.idFromReference = function idFromReference(code) {
    const match = /^REG-(\d{1,10})-([0-9A-F]{6})$/i.exec(String(code || '').trim());
    if (!match) return null;
    const id = Number(match[1]);
    const expected = Registration.referenceFor(id);
    if (!expected) return null;
    const supplied = String(code).trim().toUpperCase();
    // Length-safe constant-time comparison.
    const a = Buffer.from(expected);
    const b = Buffer.from(supplied);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    return id;
  };

  Registration.prototype.referenceCode = function referenceCode() {
    return Registration.referenceFor(this.registration_id);
  };

  return Registration;
};

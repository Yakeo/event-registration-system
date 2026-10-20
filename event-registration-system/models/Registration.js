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

  return Registration;
};

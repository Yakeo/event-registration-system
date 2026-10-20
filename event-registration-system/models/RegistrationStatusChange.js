/**
 * models/RegistrationStatusChange.js  ->  table: REGISTRATION_STATUS_CHANGES
 * - change_id (PK)
 * - registration_id (FK -> REGISTRATIONS)
 * - from_status (nullable = first status)
 * - to_status
 * - changed_at
 * - changed_by (FK -> USERS, NULL = automated)
 * - reason (nullable)
 *
 * One row per transition. This is where "when was it cancelled / promoted and
 * by whom" belongs - adding cancelled_at / promoted_at columns to
 * REGISTRATIONS would leave most of them empty and repeat per transition.
 */
const { DataTypes } = require('sequelize');

const STATUSES = ['confirmed', 'waitlisted', 'cancelled'];

module.exports = (sequelize) => {
  const RegistrationStatusChange = sequelize.define(
    'RegistrationStatusChange',
    {
      change_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      registration_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'REGISTRATIONS', key: 'registration_id' },
      },
      from_status: {
        type: DataTypes.STRING(20),
        allowNull: true,
        validate: { isIn: { args: [STATUSES], msg: 'Unknown from_status.' } },
      },
      to_status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        validate: {
          isIn: { args: [STATUSES], msg: 'Unknown to_status.' },
        },
      },
      changed_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      changed_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'USERS', key: 'user_id' },
      },
      reason: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
    },
    {
      tableName: 'REGISTRATION_STATUS_CHANGES',
      timestamps: false,
      indexes: [
        { name: 'idx_rsc_registration', fields: ['registration_id', 'changed_at'] },
        { name: 'idx_rsc_to_status', fields: ['to_status'] },
      ],
    }
  );

  RegistrationStatusChange.STATUSES = STATUSES;

  return RegistrationStatusChange;
};

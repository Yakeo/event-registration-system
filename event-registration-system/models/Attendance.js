/**
 * models/Attendance.js  ->  table: ATTENDANCE
 * - attendance_id (PK)
 * - registration_id (FK -> REGISTRATIONS, UNIQUE = 1:0..1)
 * - checked_in_at
 * - checked_in_by (FK -> USERS, nullable)
 * - remarks (nullable)
 *
 * Physical check-in is a different fact from registration: a confirmed
 * participant can be a no-show. Keeping it in its own table means the
 * attendance sheet reports reality instead of "has a confirmed seat", and a
 * participant can only be checked in once (UNIQUE registration_id).
 */
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Attendance = sequelize.define(
    'Attendance',
    {
      attendance_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      registration_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'REGISTRATIONS', key: 'registration_id' },
      },
      checked_in_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      checked_in_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'USERS', key: 'user_id' },
      },
      remarks: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
    },
    {
      tableName: 'ATTENDANCE',
      timestamps: false,
      indexes: [
        {
          name: 'uq_attendance_registration',
          unique: true,
          fields: ['registration_id'],
        },
      ],
    }
  );

  return Attendance;
};

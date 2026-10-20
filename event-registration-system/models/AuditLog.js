/**
 * models/AuditLog.js  ->  table: AUDIT_LOGS
 * - log_id (PK)
 * - actor_id (FK -> USERS, NULL for anonymous/system actions)
 * - action      e.g. 'event.delete', 'user.role_change', 'attendance.check_in'
 * - entity      the resource kind ('EVENT', 'USER', 'REGISTRATION', ...)
 * - entity_id   the resource id, as text so any PK type fits
 * - detail      JSON string with before/after values
 * - created_at
 *
 * Without this table an administrator could delete an event (and its whole
 * registration history) or change another user's role with no trace at all.
 */
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AuditLog = sequelize.define(
    'AuditLog',
    {
      log_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
      },
      actor_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'USERS', key: 'user_id' },
      },
      action: {
        type: DataTypes.STRING(60),
        allowNull: false,
      },
      entity: {
        type: DataTypes.STRING(60),
        allowNull: false,
      },
      entity_id: {
        type: DataTypes.STRING(60),
        allowNull: true,
      },
      detail: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: 'AUDIT_LOGS',
      timestamps: false,
      indexes: [
        { name: 'idx_audit_entity', fields: ['entity', 'entity_id'] },
        { name: 'idx_audit_created', fields: ['created_at'] },
      ],
    }
  );

  return AuditLog;
};

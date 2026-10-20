/**
 * models/Session.js  ->  table: SESSIONS
 * - sid (PK, the signed session id)
 * - data (serialised session JSON)
 * - expires_at
 *
 * Backing store for express-session. The default MemoryStore forgets every
 * session on restart and cannot be shared between processes, so the app now
 * persists sessions in the same database (see config/sessionStore.js).
 */
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Session = sequelize.define(
    'Session',
    {
      sid: {
        type: DataTypes.STRING(64),
        primaryKey: true,
      },
      data: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      expires_at: {
        type: DataTypes.DATE,
        allowNull: false,
      },
    },
    {
      tableName: 'SESSIONS',
      timestamps: false,
      indexes: [{ name: 'idx_sessions_expires', fields: ['expires_at'] }],
    }
  );

  return Session;
};

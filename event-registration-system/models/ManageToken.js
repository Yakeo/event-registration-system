/**
 * models/ManageToken.js  ->  table: MANAGE_TOKENS
 * - token_id (PK)
 * - token_hash  (SHA-256 of the token in the URL; the raw token is never stored)
 * - user_id     (FK -> USERS)         who the link belongs to
 * - registration_id (FK -> REGISTRATIONS, nullable)
 * - expires_at
 * - used_at     (nullable: set the moment a state-changing action consumes it)
 * - created_at
 *
 * Guest self-service. A participant who registered without an account receives
 * a `/r/:token` link by e-mail; possession of that link is the proof of identity,
 * so they can view, cancel or claim the registration without ever setting a
 * password. The row stores only a hash, so a leaked database cannot be replayed
 * (same reasoning as USERS.reset_password_token).
 *
 * Why a table and not a signed JWT: revocation. A token can be invalidated by
 * setting used_at, and every issued link is visible to the administrator.
 */
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ManageToken = sequelize.define(
    'ManageToken',
    {
      token_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      token_hash: {
        type: DataTypes.STRING(64),
        allowNull: false,
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'USERS', key: 'user_id' },
      },
      registration_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'REGISTRATIONS', key: 'registration_id' },
      },
      expires_at: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      used_at: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: 'MANAGE_TOKENS',
      timestamps: false,
      indexes: [
        { name: 'uq_manage_token_hash', unique: true, fields: ['token_hash'] },
        { name: 'idx_manage_token_user', fields: ['user_id'] },
      ],
    }
  );

  return ManageToken;
};

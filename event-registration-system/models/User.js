/**
 * models/User.js  ->  table: USERS
 * - user_id (PK)
 * - full_name
 * - email (unique)
 * - password (bcrypt hash)
 * - role ('admin' | 'participant')
 * - reset_password_token (string, nullable) - for secure forgot-password flows
 * - reset_password_expires (datetime, nullable) - token TTL (1 hour)
 */
const { DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

module.exports = (sequelize) => {
  const User = sequelize.define(
    'User',
    {
      user_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      full_name: {
        type: DataTypes.STRING(120),
        allowNull: false,
        validate: { notEmpty: { msg: 'Full name is required.' } },
      },
      email: {
        type: DataTypes.STRING(160),
        allowNull: false,
        unique: true,
        validate: {
          isEmail: { msg: 'Please enter a valid email address.' },
          notEmpty: { msg: 'Email is required.' },
        },
      },
      password: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      role: {
        type: DataTypes.ENUM('admin', 'participant'),
        allowNull: false,
        defaultValue: 'participant',
        validate: {
          isIn: {
            args: [['admin', 'participant']],
            msg: 'Role must be admin or participant.',
          },
        },
      },
      reset_password_token: {
        // SHA-256 hash of the token that was handed to the user. The raw
        // token is never stored, so a leaked database cannot be replayed.
        type: DataTypes.STRING(64),
        allowNull: true,
        defaultValue: null,
      },
      reset_password_expires: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null,
      },
    },
    {
      tableName: 'USERS',
      timestamps: false,
      indexes: [
        // NULLs are not compared by UNIQUE indexes, so users without a
        // pending reset are unaffected.
        { name: 'uq_users_reset_token', unique: true, fields: ['reset_password_token'] },
        { name: 'idx_users_role', fields: ['role'] },
      ],
      hooks: {
        beforeSave: async (user) => {
          if (user.changed('password')) {
            // Only hash if not already a bcrypt hash (starts with $2a$ or $2b$)
            const isHashed = typeof user.password === 'string' && /^\$2[abxy]\$\d{2}\$/.test(user.password);
            if (!isHashed) {
              user.password = await bcrypt.hash(user.password, 10);
            }
          }
        },
      },
    }
  );

  // instance helpers
  User.prototype.verifyPassword = function (plain) {
    return bcrypt.compare(plain, this.password);
  };

  User.prototype.isAdmin = function () {
    return this.role === 'admin';
  };

  /**
   * SHA-256 digest used to store reset tokens. 64 hex characters.
   */
  User.hashResetToken = function (rawToken) {
    return crypto.createHash('sha256').update(String(rawToken)).digest('hex');
  };

  /**
   * Generates a cryptographically strong reset token and sets 1-hour expiration.
   * Only the SHA-256 hash is persisted; the raw token is returned once so it
   * can be placed in the reset link.
   */
  User.prototype.generateResetToken = async function () {
    const rawToken = crypto.randomBytes(32).toString('hex');
    this.reset_password_token = User.hashResetToken(rawToken);
    this.reset_password_expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await this.save();
    return rawToken;
  };

  /**
   * Clears the password reset token fields.
   */
  User.prototype.clearResetToken = async function () {
    this.reset_password_token = null;
    this.reset_password_expires = null;
    await this.save();
  };

  return User;
};

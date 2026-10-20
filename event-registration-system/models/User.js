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
      },
      reset_password_token: {
        type: DataTypes.STRING(255),
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
   * Generates a cryptographically strong reset token and sets 1-hour expiration.
   */
  User.prototype.generateResetToken = async function () {
    const rawToken = crypto.randomBytes(32).toString('hex');
    this.reset_password_token = rawToken;
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

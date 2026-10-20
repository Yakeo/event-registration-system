require('dotenv').config();

/**
 * config/database.js
 * Single Sequelize connection factory.
 *
 * DB_DIALECT can be: sqlite | mysql | postgres
 *   - sqlite   -> zero-setup demo database (default)
 *   - mysql    -> set DB_NAME, DB_USER, DB_PASS, DB_HOST, DB_PORT
 *   - postgres -> same env vars, DB_DIALECT=postgres
 */
const { Sequelize } = require('sequelize');
const path = require('path');

const dialect = (process.env.DB_DIALECT || 'sqlite').toLowerCase();
const logging = process.env.DB_LOGGING === 'true' ? console.log : false;

// The same model defaults must apply to every dialect. Previously these were
// only set on MySQL/PostgreSQL, which silently gave the SQLite demo a
// different configuration from the documented one.
const sharedOptions = {
  logging,
  define: {
    // snake_case columns keep the DB identical to the ERD field names
    underscored: true,
    freezeTableName: true,
    timestamps: false,
  },
};

let sequelize;

if (dialect === 'sqlite') {
  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: process.env.DB_STORAGE || path.join(__dirname, '..', 'database', 'event_registration.sqlite'),
    ...sharedOptions,
  });
} else {
  sequelize = new Sequelize(
    process.env.DB_NAME || 'event_registration',
    process.env.DB_USER || 'root',
    process.env.DB_PASS || '',
    {
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT) || (dialect === 'postgres' ? 5432 : 3306),
      dialect,
      ...sharedOptions,
      pool: { max: 10, min: 0, acquire: 30000, idle: 10000 },
      timezone: process.env.DB_TIMEZONE || '+08:00',
    }
  );
}

module.exports = { sequelize, dialect };

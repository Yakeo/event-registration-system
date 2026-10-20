/**
 * seeders/reset.js
 * Drops all tables and recreates them empty (destructive).
 * Usage: npm run reset
 */
const { sequelize } = require('../models');

(async () => {
  await sequelize.drop();
  await sequelize.sync();
  console.log('✔ Database reset — all tables dropped and recreated.');
  await sequelize.close();
})().catch((err) => {
  console.error('✖ Reset failed:', err);
  process.exit(1);
});

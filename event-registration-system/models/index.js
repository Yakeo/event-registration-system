/**
 * models/index.js
 * Creates the Sequelize instance, loads every model and wires up the
 * associations described in the ERD:
 *
 *   [EVENTS] 1 ---- 0..* [REGISTRATIONS] 0..* ---- 1 [USERS]
 */
const { sequelize, dialect } = require('../config/database');

const User = require('./User')(sequelize);
const Event = require('./Event')(sequelize);
const Registration = require('./Registration')(sequelize);

/* ------------------------------- ASSOCIATIONS ------------------------------ */
// EVENTS (1) ---- (0..*) REGISTRATIONS
Event.hasMany(Registration, {
  foreignKey: 'event_id',
  as: 'registrations',
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE',
});
Registration.belongsTo(Event, {
  foreignKey: 'event_id',
  as: 'event',
});

// USERS (1) ---- (0..*) REGISTRATIONS
User.hasMany(Registration, {
  foreignKey: 'user_id',
  as: 'registrations',
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE',
});
Registration.belongsTo(User, {
  foreignKey: 'user_id',
  as: 'user',
});

/* -------------------------------- HELPERS --------------------------------- */
/**
 * Counts CONFIRMED registrations for an event and reports whether the
 * capacity limit (EVENTS.max_participants) has been reached.
 */
async function getEventCapacity(event, options = {}) {
  const taken = await Registration.count({
    where: { event_id: event.event_id, status: 'confirmed' },
    ...options,
  });
  const max = Number(event.max_participants) || 0;
  return {
    taken,
    max,
    remaining: Math.max(max - taken, 0),
    isFull: taken >= max,
  };
}

module.exports = {
  sequelize,
  dialect,
  User,
  Event,
  Registration,
  getEventCapacity,
};

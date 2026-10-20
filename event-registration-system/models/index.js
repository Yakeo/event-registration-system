/**
 * models/index.js
 * Creates the Sequelize instance, loads every model and wires up the
 * associations described in the ERD:
 *
 *   VENUES  1 ---- 0..* EVENTS 1 ---- 0..* REGISTRATIONS 0..* ---- 1 USERS
 *                                          |
 *                                          +-- 0..1 ATTENDANCE
 *                                          +-- 0..* REGISTRATION_STATUS_CHANGES
 *   USERS   1 ---- 0..* AUDIT_LOGS / REGISTRATION_STATUS_CHANGES / ATTENDANCE
 *   SESSIONS  (no FK - stores the serialised express-session payload)
 */
const { sequelize, dialect } = require('../config/database');

const User = require('./User')(sequelize);
const Venue = require('./Venue')(sequelize);
const Event = require('./Event')(sequelize);
const Registration = require('./Registration')(sequelize);
const Attendance = require('./Attendance')(sequelize);
const RegistrationStatusChange = require('./RegistrationStatusChange')(sequelize);
const AuditLog = require('./AuditLog')(sequelize);
const Session = require('./Session')(sequelize);
const Notification = require('./Notification')(sequelize);

/* ------------------------------- ASSOCIATIONS ------------------------------ */
// VENUES (1) ---- (0..*) EVENTS
Venue.hasMany(Event, {
  foreignKey: 'venue_id',
  as: 'events',
  onDelete: 'RESTRICT',
  onUpdate: 'CASCADE',
});
Event.belongsTo(Venue, {
  foreignKey: 'venue_id',
  as: 'venue',
});

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

// REGISTRATIONS (1) ---- (0..1) ATTENDANCE
Registration.hasOne(Attendance, {
  foreignKey: 'registration_id',
  as: 'attendance',
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE',
});
Attendance.belongsTo(Registration, {
  foreignKey: 'registration_id',
  as: 'registration',
});
Attendance.belongsTo(User, {
  foreignKey: 'checked_in_by',
  as: 'checkedInBy',
});

// REGISTRATIONS (1) ---- (0..*) REGISTRATION_STATUS_CHANGES
Registration.hasMany(RegistrationStatusChange, {
  foreignKey: 'registration_id',
  as: 'statusChanges',
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE',
});
RegistrationStatusChange.belongsTo(Registration, {
  foreignKey: 'registration_id',
  as: 'registration',
});
RegistrationStatusChange.belongsTo(User, {
  foreignKey: 'changed_by',
  as: 'changedBy',
});

// USERS (1) ---- (0..*) AUDIT_LOGS
User.hasMany(AuditLog, {
  foreignKey: 'actor_id',
  as: 'auditLogs',
  onDelete: 'SET NULL',
  onUpdate: 'CASCADE',
});
AuditLog.belongsTo(User, {
  foreignKey: 'actor_id',
  as: 'actor',
});

// USERS / REGISTRATIONS / EVENTS (0..*) ---- (0..*) NOTIFICATIONS
// The outbox: one row per e-mail that must be delivered, written inside the
// same transaction as the change it announces.
User.hasMany(Notification, {
  foreignKey: 'user_id',
  as: 'notifications',
  onDelete: 'SET NULL',
});
Notification.belongsTo(User, {
  foreignKey: 'user_id',
  as: 'user',
});
Registration.hasMany(Notification, {
  foreignKey: 'registration_id',
  as: 'notifications',
  onDelete: 'SET NULL',
});
Notification.belongsTo(Registration, {
  foreignKey: 'registration_id',
  as: 'registration',
});
Event.hasMany(Notification, {
  foreignKey: 'event_id',
  as: 'notifications',
  onDelete: 'SET NULL',
});
Notification.belongsTo(Event, {
  foreignKey: 'event_id',
  as: 'event',
});

/* -------------------------------- INCLUDES -------------------------------- */
/** Reusable include so every event shown in the UI carries its venue. */
const eventVenueInclude = {
  model: Venue,
  as: 'venue',
  attributes: ['venue_id', 'name', 'city', 'address'],
  required: false,
};

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

/**
 * Appends one row to REGISTRATION_STATUS_CHANGES.
 * Safe to call inside a transaction: pass `transaction` so the history row
 * rolls back together with the status it describes.
 */
async function logStatusChange({
  registrationId,
  from = null,
  to,
  actorId = null,
  reason = null,
  transaction = null,
}) {
  return RegistrationStatusChange.create(
    {
      registration_id: registrationId,
      from_status: from,
      to_status: to,
      changed_by: actorId,
      reason,
      changed_at: new Date(),
    },
    { transaction }
  );
}

/**
 * Writes an AUDIT_LOGS row. Never throws: an audit failure must not take down
 * the request that triggered it (it is logged to the console instead).
 */
async function logAudit({
  req = null,
  actorId = null,
  action,
  entity,
  entityId = null,
  detail = null,
  transaction = null,
}) {
  const actor = actorId || (req && req.session && req.session.user ? req.session.user.user_id : null);
  try {
    return await AuditLog.create(
      {
        actor_id: actor,
        action,
        entity,
        entity_id: entityId === null || entityId === undefined ? null : String(entityId),
        detail: detail ? JSON.stringify(detail) : null,
        created_at: new Date(),
      },
      { transaction }
    );
  } catch (err) {
    console.warn('[AUDIT] could not write audit log:', err.message);
    return null;
  }
}

module.exports = {
  sequelize,
  dialect,
  User,
  Venue,
  Event,
  Registration,
  Attendance,
  RegistrationStatusChange,
  AuditLog,
  Session,
  Notification,
  eventVenueInclude,
  getEventCapacity,
  logStatusChange,
  logAudit,
};

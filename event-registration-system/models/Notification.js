/**
 * models/Notification.js  ->  table: NOTIFICATIONS
 * - notification_id (PK)
 * - user_id         (FK -> USERS, nullable: the account may not exist yet)
 * - email           snapshot of the address at queue time
 * - kind            what happened
 * - registration_id (FK -> REGISTRATIONS, nullable)
 * - event_id        (FK -> EVENTS, nullable)
 * - payload         JSON string with the rendered values
 * - status          'queued' | 'sent' | 'failed'
 * - attempts        delivery attempts so far
 * - last_error      why the last attempt failed (nullable)
 * - created_at / sent_at
 *
 * This is a transactional OUTBOX, not a mail log. Rows are written inside the
 * same transaction as the state change they describe, so an e-mail can never
 * be "lost" by a crash between the commit and the send. A worker (see
 * services/notificationWorker.js) drains queued rows afterwards, retries
 * failures, and leaves a failed row visible in the admin UI instead of dying
 * quietly in a console log.
 *
 * `email` is stored on the row rather than only via user_id because the
 * address can change later; the notification records where it was actually
 * sent. Same reasoning as any invoice address snapshot.
 */
const { DataTypes } = require('sequelize');

const KINDS = [
  'registration_confirmed',
  'waitlisted',
  'promoted',
  'status_changed',
  'registration_cancelled',
  'event_cancelled',
  'password_reset',
  'account_claim',
];

const STATUSES = ['queued', 'sent', 'failed'];

module.exports = (sequelize) => {
  const Notification = sequelize.define(
    'Notification',
    {
      notification_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'USERS', key: 'user_id' },
      },
      email: {
        type: DataTypes.STRING(160),
        allowNull: false,
        validate: { isEmail: { msg: 'Notification e-mail must be a valid address.' } },
      },
      kind: {
        type: DataTypes.STRING(40),
        allowNull: false,
        validate: {
          isIn: { args: [KINDS], msg: 'Unknown notification kind.' },
        },
      },
      registration_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'REGISTRATIONS', key: 'registration_id' },
      },
      event_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'EVENTS', key: 'event_id' },
      },
      payload: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'queued',
        validate: { isIn: { args: [STATUSES], msg: 'Unknown notification status.' } },
      },
      attempts: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      last_error: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      sent_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      tableName: 'NOTIFICATIONS',
      timestamps: false,
      indexes: [
        { name: 'idx_notifications_status', fields: ['status', 'created_at'] },
        { name: 'idx_notifications_registration', fields: ['registration_id'] },
      ],
    }
  );

  /** Parsed payload, or an empty object when the row has none. */
  Notification.prototype.getPayload = function getPayload() {
    if (!this.payload) return {};
    try {
      return JSON.parse(this.payload);
    } catch (err) {
      return {};
    }
  };

  Notification.KINDS = KINDS;
  Notification.STATUSES = STATUSES;

  return Notification;
};

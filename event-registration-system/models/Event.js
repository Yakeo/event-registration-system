/**
 * models/Event.js  ->  table: EVENTS
 * - event_id (PK)
 * - title
 * - description
 * - event_date
 * - venue_id (FK -> VENUES.venue_id)
 * - max_participants
 * - deleted_at (soft delete: keeps registrations/attendance history)
 *
 * `venue` used to be a free-text column. It is now a foreign key: the venue
 * name/address belongs to the VENUES row, not to every event that uses it.
 */
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Event = sequelize.define(
    'Event',
    {
      event_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      title: {
        type: DataTypes.STRING(180),
        allowNull: false,
        validate: { notEmpty: { msg: 'Event title is required.' } },
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      event_date: {
        type: DataTypes.DATE,
        allowNull: false,
        validate: { notEmpty: { msg: 'Event date is required.' } },
      },
      venue_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'VENUES', key: 'venue_id' },
        validate: { notNull: { msg: 'Venue is required.' } },
      },
      max_participants: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 10,
        validate: {
          min: { args: [1], msg: 'Maximum participants must be at least 1.' },
          isInt: { msg: 'Maximum participants must be a whole number.' },
        },
      },
      deleted_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      tableName: 'EVENTS',
      // `paranoid` (soft delete) is only honoured by Sequelize when timestamps
      // are enabled, so enable the flag but switch the two timestamp columns
      // off - the table only needs `deleted_at`.
      // Soft delete keeps registrations, attendance and status history when an
      // event is removed instead of cascading them into oblivion.
      timestamps: true,
      createdAt: false,
      updatedAt: false,
      paranoid: true,
      deletedAt: 'deleted_at',
      indexes: [
        // Listing/search pages always ORDER BY event_date.
        { name: 'idx_events_date', fields: ['event_date'] },
        { name: 'idx_events_venue', fields: ['venue_id'] },
      ],
    }
  );

  Event.prototype.isPast = function () {
    return new Date(this.event_date) < new Date();
  };

  return Event;
};

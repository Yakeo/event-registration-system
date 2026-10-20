/**
 * models/Event.js  ->  table: EVENTS
 * - event_id (PK)
 * - title
 * - description
 * - event_date
 * - venue
 * - max_participants
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
      venue: {
        type: DataTypes.STRING(180),
        allowNull: false,
        validate: { notEmpty: { msg: 'Venue is required.' } },
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
    },
    {
      tableName: 'EVENTS',
      timestamps: false,
      scopes: {
        upcoming: { where: {}, order: [['event_date', 'ASC']] },
      },
    }
  );

  Event.prototype.isPast = function () {
    return new Date(this.event_date) < new Date();
  };

  return Event;
};

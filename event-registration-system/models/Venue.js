/**
 * models/Venue.js  ->  table: VENUES
 * - venue_id (PK)
 * - name
 * - address (nullable)
 * - city ('' when unknown so the unique key still applies)
 *
 * Why this table exists: EVENTS.venue used to be free text, so
 * "SMX Convention Center" could be typed five different ways and there was
 * nowhere to store the address. venue name/address is an attribute of the
 * VENUE, not of each event (removes the transitive dependency
 * event -> venue -> address, i.e. the one 3NF violation in EVENTS).
 */
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Venue = sequelize.define(
    'Venue',
    {
      venue_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      name: {
        type: DataTypes.STRING(180),
        allowNull: false,
        validate: {
          notEmpty: { msg: 'Venue name is required.' },
          len: { args: [2, 180], msg: 'Venue name must be 2 to 180 characters.' },
        },
      },
      address: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      city: {
        // NOT NULL with an empty-string default keeps UNIQUE(name, city)
        // enforceable on every dialect (NULLs are "distinct" in SQL).
        type: DataTypes.STRING(120),
        allowNull: false,
        defaultValue: '',
      },
    },
    {
      tableName: 'VENUES',
      timestamps: false,
      indexes: [
        { name: 'uq_venues_name_city', unique: true, fields: ['name', 'city'] },
      ],
    }
  );

  /** "Main Gym, Cagayan de Oro" - used by views/CSV exports. */
  Venue.prototype.displayName = function () {
    return this.city ? `${this.name}, ${this.city}` : this.name;
  };

  return Venue;
};

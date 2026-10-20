/**
 * seeders/seed.js
 * Creates tables (if needed) and inserts demo data:
 *   - 1 admin + 1 participant account
 *   - 5 sample events (one of them intentionally full)
 *   - confirmed / waitlisted registrations
 *
 * Usage: npm run seed
 */
const { sequelize, User, Event, Registration } = require('../models');

const day = 24 * 60 * 60 * 1000;
/**
 * Builds a timestamp at `hour:00` Asia/Manila (UTC+8) on the day that is
 * `daysFromNow` days ahead. Using the server's setHours() made the demo data
 * depend on the machine's timezone (an 8 AM event showed as 4 PM in Manila).
 */
const at = (daysFromNow, hour = 9) => {
  const base = new Date(Date.now() + daysFromNow * day);
  return new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), hour - 8, 0, 0, 0)
  );
};

async function seed() {
  // Drop + recreate so the demo data always uses the documented IDs (USERS 1-6,
  // EVENTS 1-5, REGISTRATIONS 1-16) instead of continuing the auto-increment.
  await sequelize.drop();
  await sequelize.sync();
  console.log('✔ Tables recreated (fresh auto-increment)');

  const admin = await User.create({
    full_name: 'System Administrator',
    email: 'admin@eventreg.test',
    password: 'admin123',
    role: 'admin',
  });

  const maria = await User.create({
    full_name: 'Maria Santos',
    email: 'maria@email.com',
    password: 'maria123',
    role: 'participant',
  });

  const events = await Event.bulkCreate(
    [
      {
        title: 'Annual IT Convention 2026',
        description:
          'A whole-day convention on software engineering, cloud computing and AI. Includes keynote talks, breakout sessions and a career fair with partner companies.',
        event_date: at(14, 8),
        venue: 'SMX Convention Center, Pasay City',
        max_participants: 120,
      },
      {
        title: 'Free Web Development Bootcamp',
        description:
          'Hands-on three-hour workshop covering HTML, CSS, JavaScript and the basics of building an Express + Sequelize CRUD application. Bring your own laptop.',
        event_date: at(7, 13),
        venue: 'Computer Laboratory 2, Main Campus',
        max_participants: 30,
      },
      {
        title: 'Cybersecurity Awareness Seminar',
        description:
          'Learn how phishing, social engineering and weak passwords put organisations at risk, and the practical controls that stop them.',
        event_date: at(21, 10),
        venue: 'Audio-Visual Room, Building A',
        max_participants: 60,
      },
      {
        title: 'Startup Pitch Night',
        description:
          'Six student teams pitch to a panel of investors and alumni founders. Open to the public — come and support your classmates.',
        event_date: at(30, 18),
        venue: 'Innovation Hub, 4th Floor',
        max_participants: 80,
      },
      {
        title: 'Basic Photography Workshop (FULL)',
        description:
          'Composition, lighting and editing fundamentals. This small-group session reached its maximum of 5 participants, so the system now blocks new registrations.',
        event_date: at(3, 9),
        venue: 'Multimedia Studio',
        max_participants: 5,
      },
    ],
    { returning: true }
  );

  const [convention, bootcamp, cyber, pitch, photo] = events;

  const names = [
    ['Juan Dela Cruz', 'juan@email.com'],
    ['Maria Santos', 'maria@email.com'],
    ['Ana Reyes', 'ana@email.com'],
    ['Carlo Mendoza', 'carlo@email.com'],
    ['Liza Bautista', 'liza@email.com'],
  ];

  // participants for the bootcamp (some confirmed, some waitlisted)
  const participants = [];
  for (const [full_name, email] of names) {
    const user =
      (await User.findOne({ where: { email } })) ||
      (await User.create({ full_name, email, password: 'password123', role: 'participant' }));
    participants.push(user);
  }

  const rows = [];
  participants.slice(0, 4).forEach((u, i) => {
    rows.push({
      user_id: u.user_id,
      event_id: bootcamp.event_id,
      registration_date: new Date(Date.now() - (4 - i) * day),
      status: i < 3 ? 'confirmed' : 'waitlisted',
    });
  });
  participants.slice(0, 5).forEach((u, i) => {
    rows.push({
      user_id: u.user_id,
      event_id: convention.event_id,
      registration_date: new Date(Date.now() - (5 - i) * day),
      status: 'confirmed',
    });
  });
  // the FULL workshop: 5 confirmed registrations == max_participants
  participants.forEach((u, i) => {
    rows.push({
      user_id: u.user_id,
      event_id: photo.event_id,
      registration_date: new Date(Date.now() - (3 - (i % 3)) * day),
      status: 'confirmed',
    });
  });
  participants.slice(0, 2).forEach((u, i) => {
    rows.push({
      user_id: u.user_id,
      event_id: cyber.event_id,
      registration_date: new Date(Date.now() - (2 - i) * day),
      status: 'confirmed',
    });
  });

  await Registration.bulkCreate(rows);

  console.log('✔ Seed complete');
  console.log('  Users:         %d', await User.count());
  console.log('  Events:        %d', await Event.count());
  console.log('  Registrations: %d', await Registration.count());
  console.log('\n  Admin login     -> admin@eventreg.test / admin123');
  console.log('  Participant     -> maria@email.com / maria123\n');

  await sequelize.close();
}

seed().catch((err) => {
  console.error('✖ Seed failed:', err);
  process.exit(1);
});

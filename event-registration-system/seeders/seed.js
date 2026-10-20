/**
 * seeders/seed.js
 * Full demo/dummy dataset for the Event Registration System.
 *
 *   - 7 venues
 *   - 2 administrators + 16 participants
 *   - 11 events: 3 already finished (one of them at capacity), 6 upcoming,
 *     1 deliberately empty, 1 at capacity and 1 archived (soft-deleted)
 *   - 77 registrations: confirmed / waitlisted / cancelled / reactivated
 *   - check-ins for the events that already happened (one no-show each)
 *   - a status-history row for every registration and every later transition
 *   - audit rows so the admin audit page is not empty
 *
 * Usage:  npm run seed                              (DESTRUCTIVE: drops all tables)
 *         DB_STORAGE=/tmp/demo.sqlite npm run seed  (throw-away database)
 */
const {
  sequelize,
  User,
  Venue,
  Event,
  Registration,
  Attendance,
  RegistrationStatusChange,
  AuditLog,
  Notification,
} = require('../models');
const manageTokens = require('../services/manageTokens');

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
const daysAgo = (n, hour = 10) => at(-n, hour);
const plusMinutes = (date, m) => new Date(date.getTime() + m * 60 * 1000);

async function seed() {
  // Drop + recreate so the demo data always uses the documented IDs instead of
  // continuing the auto-increment, and so a re-seed is idempotent.
  await sequelize.drop();
  await sequelize.sync();
  console.log('✔ Tables recreated (fresh auto-increment)');

  /* ------------------------------- VENUES -------------------------------- */
  const [smx, gym, lab2, avr, hub, studio, roof] = await Venue.bulkCreate(
    [
      { name: 'SMX Convention Center', city: 'Pasay City', address: 'Mall of Asia Complex' },
      { name: 'University Gymnasium', city: 'Cagayan de Oro', address: 'Main Campus' },
      { name: 'Computer Laboratory 2', city: 'Cagayan de Oro', address: 'Main Campus, Building B' },
      { name: 'Audio-Visual Room', city: 'Cagayan de Oro', address: 'Building A, 2nd Floor' },
      { name: 'Innovation Hub', city: 'Cagayan de Oro', address: '4th Floor, IT Park' },
      { name: 'Multimedia Studio', city: 'Cagayan de Oro', address: 'Arts Building' },
      { name: 'Rooftop Garden Hall', city: 'Cagayan de Oro', address: 'Hotel Centro, 6th Floor' },
    ],
    { returning: true }
  );

  /* -------------------------------- USERS -------------------------------- */
  const admin = await User.create({
    full_name: 'System Administrator',
    email: 'admin@eventreg.test',
    password: 'admin123',
    role: 'admin',
  });

  const organizer = await User.create({
    full_name: 'Bea Villanueva',
    email: 'organizer@eventreg.test',
    password: 'organizer123',
    role: 'admin',
  });

  const participantSpecs = [
    ['Maria Santos', 'maria@email.com', 'maria123'],
    ['Juan Dela Cruz', 'juan@email.com', null],
    ['Ana Reyes', 'ana@email.com', null],
    ['Carlo Mendoza', 'carlo@email.com', null],
    ['Liza Bautista', 'liza@email.com', null],
    ['Miguel Torres', 'miguel@email.com', null],
    ['Grace Lim', 'grace@email.com', null],
    ['Paolo Garcia', 'paolo@email.com', null],
    ['Nina Aquino', 'nina@email.com', null],
    ['Dante Ramos', 'dante@email.com', null],
    ['Ivan Castillo', 'ivan@email.com', null],
    ['Rafa Domingo', 'rafa@email.com', null],
    ['Sofia Navarro', 'sofia@email.com', null],
    ['Troy Salazar', 'troy@email.com', null],
    ['Kim Ferrer', 'kim@email.com', null],
    ['Ella Mercado', 'ella@email.com', null],
  ];

  const P = [];
  for (const [full_name, email, password] of participantSpecs) {
    P.push(
      await User.create({
        full_name,
        email,
        password: password || 'password123',
        role: 'participant',
      })
    );
  }

  /* -------------------------------- EVENTS ------------------------------- */
  // Dates are relative to "today", so the demo never goes stale: the first
  // three have already happened, the rest are still open for registration.
  const eventSpecs = [
    {
      key: 'cyber',
      title: 'Cybersecurity Awareness Seminar',
      description:
        'How phishing, social engineering and weak passwords put organisations at risk — and the practical controls that stop them. Includes a live phishing-simulation workshop.',
      venue: avr, days: -21, hour: 10, max: 60,
    },
    {
      key: 'photo',
      title: 'Basic Photography Workshop',
      description:
        'Composition, lighting and editing fundamentals. Small-group session limited to five participants with hands-on camera exercises.',
      venue: studio, days: -7, hour: 9, max: 5,
    },
    {
      key: 'orientation',
      title: 'Freshman Orientation 2026',
      description:
        'Welcome assembly for incoming first-year students: campus tour, org fair, and an introduction to student services and the online event system.',
      venue: gym, days: -3, hour: 8, max: 300,
    },
    {
      key: 'convention',
      title: 'Annual IT Convention 2026',
      description:
        'Whole-day convention on software engineering, cloud computing and AI. Keynote talks, breakout sessions and a career fair with partner companies.',
      venue: smx, days: 14, hour: 8, max: 120,
    },
    {
      key: 'bootcamp',
      title: 'Free Web Development Bootcamp',
      description:
        'Hands-on three-hour workshop covering HTML, CSS, JavaScript and the basics of building an Express + Sequelize CRUD application. Bring your own laptop.',
      venue: lab2, days: 7, hour: 13, max: 30,
    },
    {
      key: 'pitch',
      title: 'Startup Pitch Night',
      description:
        'Six student teams pitch to a panel of investors and alumni founders. Open to the public — come and support your classmates.',
      venue: hub, days: 30, hour: 18, max: 80,
    },
    {
      key: 'colloquium',
      title: 'Research Colloquium: Computing & Society',
      description:
        'Faculty and graduate students present ongoing research. Deliberately left without registrations so a first sign-up can be demonstrated.',
      venue: avr, days: 10, hour: 14, max: 40,
    },
    {
      key: 'summit',
      title: 'AI & Data Science Summit',
      description:
        'Industry practitioners discuss applied machine learning, MLOps and responsible AI. Includes a hands-on notebook session.',
      venue: smx, days: 45, hour: 9, max: 200,
    },
    {
      key: 'leadership',
      title: 'Leadership Training Camp',
      description:
        'Two-day camp for student organisation officers. Seeded at full capacity to demonstrate the waiting-list flow.',
      venue: roof, days: 21, hour: 7, max: 15,
    },
    {
      key: 'outreach',
      title: 'Community Outreach Day',
      description:
        'Coastal clean-up and feeding program with partner barangays. Transportation leaves the gymnasium at 6:00 AM sharp.',
      venue: gym, days: 60, hour: 6, max: 100,
    },
  ];

  const events = {};
  for (const spec of eventSpecs) {
    events[spec.key] = await Event.create({
      title: spec.title,
      description: spec.description,
      event_date: at(spec.days, spec.hour),
      venue_id: spec.venue.venue_id,
      max_participants: spec.max,
    });
  }

  // Archived (soft-deleted) event: hidden from the public/admin lists but its
  // registrations and history stay in the database, which is what the
  // "Archived events" page reports on.
  events.camp = await Event.create({
    title: 'Summer Coding Camp (cancelled)',
    description:
      'Cancelled by the organiser after the venue became unavailable. Archived instead of deleted, so its registrations and history are preserved.',
    event_date: at(35, 9),
    venue_id: lab2.venue_id,
    max_participants: 30,
  });
  await events.camp.destroy(); // soft delete → EVENTS.deleted_at

  /* ----------------------------- REGISTRATIONS --------------------------- */
  const regs = {};

  async function join(eventKey, pIdx, status, registeredDaysAgo, reason) {
    const participant = P[pIdx];
    const registration = await Registration.create({
      user_id: participant.user_id,
      event_id: events[eventKey].event_id,
      status,
      registration_date: daysAgo(registeredDaysAgo),
    });
    await RegistrationStatusChange.create({
      registration_id: registration.registration_id,
      from_status: null,
      to_status: status,
      changed_at: registration.registration_date,
      changed_by: status === 'confirmed' ? participant.user_id : null,
      reason:
        reason || (status === 'waitlisted' ? 'Joined the waiting list' : 'Online registration'),
    });
    regs[`${eventKey}|${pIdx}`] = registration;
    return registration;
  }

  // Past: Cybersecurity seminar — 8 confirmed, one later cancelled.
  for (let i = 0; i < 8; i += 1) await join('cyber', i, 'confirmed', 30 - i);
  const cyberCancel = await join('cyber', 8, 'confirmed', 22);
  await cyberCancel.update({ status: 'cancelled' });
  await RegistrationStatusChange.create({
    registration_id: cyberCancel.registration_id,
    from_status: 'confirmed',
    to_status: 'cancelled',
    changed_at: daysAgo(5),
    changed_by: P[8].user_id,
    reason: 'Participant cancelled — conflicting schedule',
  });

  // Past and FULL: Photography workshop — 5/5 confirmed, 2 waitlisted.
  for (let i = 0; i < 5; i += 1) await join('photo', i, 'confirmed', 20 - i);
  await join('photo', 5, 'waitlisted', 9);
  await join('photo', 6, 'waitlisted', 8);

  // Past: Freshman orientation — 10 confirmed.
  for (let i = 0; i < 10; i += 1) await join('orientation', i, 'confirmed', 12 - (i % 5));

  // Upcoming: IT convention — 12 confirmed, 2 waitlisted.
  for (let i = 2; i < 14; i += 1) await join('convention', i, 'confirmed', 10 - (i % 6));
  await join('convention', 14, 'waitlisted', 3);
  await join('convention', 15, 'waitlisted', 2);

  // Upcoming: Bootcamp — 6 confirmed, 1 waitlisted, 1 cancelled, 1 reactivated.
  for (const i of [0, 2, 4, 6, 8, 10]) await join('bootcamp', i, 'confirmed', 15);
  await join('bootcamp', 12, 'waitlisted', 11);

  const cancelled = await join('bootcamp', 14, 'confirmed', 14);
  await cancelled.update({ status: 'cancelled' });
  await RegistrationStatusChange.create({
    registration_id: cancelled.registration_id,
    from_status: 'confirmed',
    to_status: 'cancelled',
    changed_at: daysAgo(6),
    changed_by: P[14].user_id,
    reason: 'Cancelled by the participant',
  });

  // A participant who changed their mind: confirmed → cancelled → confirmed.
  const backAgain = await join('bootcamp', 1, 'confirmed', 16);
  await backAgain.update({ status: 'cancelled' });
  await RegistrationStatusChange.create({
    registration_id: backAgain.registration_id,
    from_status: 'confirmed',
    to_status: 'cancelled',
    changed_at: daysAgo(9),
    changed_by: P[1].user_id,
    reason: 'Cancelled by the participant',
  });
  await backAgain.update({ status: 'confirmed', registration_date: daysAgo(4) });
  await RegistrationStatusChange.create({
    registration_id: backAgain.registration_id,
    from_status: 'cancelled',
    to_status: 'confirmed',
    changed_at: daysAgo(4),
    changed_by: P[1].user_id,
    reason: 'Participant re-registered after cancelling',
  });

  // Upcoming: pitch night, AI summit, outreach.
  for (const i of [1, 3, 5, 9]) await join('pitch', i, 'confirmed', 5);
  for (const i of [0, 1, 2]) await join('summit', i, 'confirmed', 7);
  for (const i of [3, 4]) await join('outreach', i, 'confirmed', 2);

  // Deliberately FULL: 15 confirmed (capacity 15) + 1 waitlisted.
  for (let i = 0; i < 15; i += 1) await join('leadership', i, 'confirmed', 18 - (i % 7));
  await join('leadership', 15, 'waitlisted', 6);

  // The archived event keeps its 3 registrations.
  for (const i of [0, 1, 2]) await join('camp', i, 'confirmed', 25);

  /* ------------------------------ ATTENDANCE ----------------------------- */
  // Only for events that already happened. One confirmed participant per event
  // stays a no-show, so "registered ≠ attended" is actually visible.
  const attendancePlan = [
    ['cyber', [0, 1, 2, 3, 4, 5, 6], 'on time'],             // index 7 = no-show
    ['photo', [0, 1, 2, 3], null],                            // index 4 = no-show
    ['orientation', [0, 1, 2, 3, 4, 5, 6, 7, 8], 'on time'],  // index 9 = no-show
  ];
  for (const [eventKey, indexes, remark] of attendancePlan) {
    const eventDate = events[eventKey].event_date;
    for (const i of indexes) {
      await Attendance.create({
        registration_id: regs[`${eventKey}|${i}`].registration_id,
        checked_in_at: plusMinutes(eventDate, 5 + i * 3),
        checked_in_by: (i % 2 === 0 ? organizer : admin).user_id,
        remarks: remark,
      });
    }
  }
  await Attendance.update(
    { remarks: 'Late — arrived 25 minutes after the start' },
    { where: { registration_id: regs['orientation|3'].registration_id } }
  );

  /* ------------------------------- AUDIT LOG ----------------------------- */
  const auditRows = eventSpecs.map((spec) => ({
    actor_id: admin.user_id,
    action: 'event.create',
    entity: 'EVENT',
    entity_id: String(events[spec.key].event_id),
    detail: JSON.stringify({ title: spec.title, max_participants: spec.max, seeded: true }),
    created_at: daysAgo(40),
  }));

  auditRows.push(
    {
      actor_id: admin.user_id,
      action: 'event.archive',
      entity: 'EVENT',
      entity_id: String(events.camp.event_id),
      detail: JSON.stringify({ title: events.camp.title, reason: 'Venue unavailable', seeded: true }),
      created_at: daysAgo(4),
    },
    {
      actor_id: admin.user_id,
      action: 'user.role_change',
      entity: 'USER',
      entity_id: String(organizer.user_id),
      detail: JSON.stringify({ from: 'participant', to: 'admin', email: organizer.email, seeded: true }),
      created_at: daysAgo(12),
    },
    {
      actor_id: organizer.user_id,
      action: 'attendance.check_in',
      entity: 'REGISTRATION',
      entity_id: String(regs['cyber|0'].registration_id),
      detail: JSON.stringify({ event_id: events.cyber.event_id, seeded: true }),
      created_at: events.cyber.event_date,
    }
  );
  await AuditLog.bulkCreate(auditRows);

  /* ---------------------------- NOTIFICATIONS ---------------------------- */
  // History for the outbox page: these are the e-mails that "would have been
  // sent" for the registrations above, marked as delivered. New activity in
  // the running app appends to this list rather than replacing it.
  const venueByKey = Object.fromEntries(eventSpecs.map((spec) => [spec.key, spec.venue]));
  venueByKey.camp = lab2;

  const sentNotification = (kind, user, { reg = null, eventKey = null, extra = {} } = {}) => {
    const key = eventKey || (reg && reg.eventKey);
    const event = key ? events[key] : null;
    return {
      kind,
      email: user.email,
      user_id: user.user_id,
      registration_id: reg ? reg.registration_id : null,
      event_id: event ? event.event_id : null,
      payload: JSON.stringify({
        participant_name: user.full_name,
        email: user.email,
        event_title: event ? event.title : null,
        event_date: event ? new Date(event.event_date).toISOString() : null,
        venue_name: key ? `${venueByKey[key].name}, ${venueByKey[key].city}` : null,
        reference: reg ? Registration.referenceFor(reg.registration_id) : null,
        status: reg ? reg.status : null,
        ...extra,
      }),
      status: 'sent',
      attempts: 1,
      created_at: daysAgo(20),
      sent_at: daysAgo(20),
    };
  };

  const withKey = (key, idx) => {
    const reg = regs[`${key}|${idx}`];
    reg.eventKey = key;
    return reg;
  };

  await Notification.bulkCreate([
    sentNotification('registration_confirmed', P[0], { reg: withKey('cyber', 0) }),
    sentNotification('registration_confirmed', P[2], { reg: withKey('convention', 2) }),
    sentNotification('waitlisted', P[5], { reg: withKey('photo', 5), extra: { waitlist_position: 1 } }),
    sentNotification('promoted', P[0], {
      reg: withKey('leadership', 0),
      extra: { capacity_taken: 15, capacity_max: 15 },
    }),
    sentNotification('event_cancelled', P[0], { reg: withKey('camp', 0) }),
    sentNotification('password_reset', P[3], {
      extra: { reset_url: 'http://localhost:3000/reset-password/demo-token' },
    }),
    sentNotification('account_claim', P[6], {
      reg: withKey('bootcamp', 6),
      extra: { claim_url: 'http://localhost:3000/reset-password/demo-token' },
    }),
  ]);

  /* --------------------------- MANAGE LINK (DEMO) ------------------------ */
  // A ready-made guest link so the passwordless flow can be shown without
  // digging through tmp/outbox. Prints the URL below.
  const demoRawToken = await manageTokens.issue({
    userId: regs['bootcamp|1'].user_id,
    registrationId: regs['bootcamp|1'].registration_id,
  });

  /* ------------------------------- SUMMARY ------------------------------- */
  const [u, v, e, r, a, h, log, notifications] = await Promise.all([
    User.count(), Venue.count(), Event.count(), Registration.count(),
    Attendance.count(), RegistrationStatusChange.count(), AuditLog.count(),
    Notification.count(),
  ]);
  const allEvents = await Event.findAll({ paranoid: false, attributes: ['deleted_at'] });
  const archived = allEvents.filter((row) => row.deleted_at).length;
  const waitlisted = await Registration.count({ where: { status: 'waitlisted' } });
  const cancelledCount = await Registration.count({ where: { status: 'cancelled' } });

  console.log('✔ Seed complete');
  console.log(`  Users         : ${u}`);
  console.log(`  Venues        : ${v}`);
  console.log(`  Events        : ${e} visible (${archived} archived)`);
  console.log(`  Registrations : ${r}  (confirmed ${r - waitlisted - cancelledCount}, waitlisted ${waitlisted}, cancelled ${cancelledCount})`);
  console.log(`  Attendance    : ${a} check-ins`);
  console.log(`  Status rows   : ${h}`);
  console.log(`  Audit rows    : ${log}`);
  console.log(`  Notifications : ${notifications} (outbox history)`);
  console.log('\n  Admin        admin@eventreg.test / admin123');
  console.log('  Organiser    organizer@eventreg.test / organizer123');
  console.log('  Participant  maria@email.com / maria123');
  console.log('  Others       juan@email.com … ella@email.com / password123\n');
  console.log('  Guest manage link (no password needed):');
  console.log(`    /r/${demoRawToken}`);
  console.log('    -> open it on the running app to view or cancel that registration\n');

  await sequelize.close();
}

seed().catch((err) => {
  console.error('✖ Seed failed:', err);
  process.exit(1);
});

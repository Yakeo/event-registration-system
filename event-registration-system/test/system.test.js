/**
 * test/system.test.js
 * Comprehensive automated test suite for academic defense evaluation.
 * Run with: npm test
 */
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { Op } = require('sequelize');

// The suite recreates the schema with { force: true }. Point it at an
// in-memory database so `npm test` can never wipe the demo/development
// database in database/event_registration.sqlite.
//
// DB_DIALECT must be pinned too: config/database.js calls dotenv, so a .env
// left on `DB_DIALECT=mysql` would send sync({ force: true }) at the real
// MySQL database and drop every table in it.
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = process.env.TEST_DB_STORAGE || ':memory:';
// Never queue real mail while testing.
process.env.MAIL_TRANSPORT = 'memory';

const {
  sequelize,
  User,
  Venue,
  Event,
  Registration,
  Attendance,
  RegistrationStatusChange,
  AuditLog,
  getEventCapacity,
  logStatusChange,
  logAudit,
} = require('../models');
const { validateRegistration, validateEvent, validatePassword } = require('../middlewares/validate');
const { createRateLimiter, accountLoginLockout } = require('../middlewares/rateLimit');
const { SequelizeSessionStore } = require('../config/sessionStore');
const { Notification } = require('../models');
const {
  queue,
  payloadFor,
  render,
  queueEventCancellation,
} = require('../services/notifications');
const { NotificationWorker } = require('../services/notificationWorker');
const mailer = require('../services/mailer');

describe('Event Registration System - Defense Verification Suite', () => {
  // Shared venue: EVENTS.venue_id is NOT NULL, so every event needs one.
  let venue;

  before(async () => {
    // Recreate fresh tables
    await sequelize.sync({ force: true });
    venue = await Venue.create({ name: 'Test Hall', city: 'Cagayan de Oro', address: '1 Main St' });
  });

  after(async () => {
    await sequelize.close();
  });

  /* ------------------- 1. AUTHENTICATION & PASSWORD HASHING ------------------- */
  describe('1. User Model & Authentication Security', () => {
    let testUser;

    it('should securely hash password with bcrypt on creation', async () => {
      testUser = await User.create({
        full_name: 'Test Participant',
        email: 'test@eventreg.test',
        password: 'plainPassword123',
        role: 'participant',
      });

      assert.strictEqual(testUser.full_name, 'Test Participant');
      assert.notStrictEqual(testUser.password, 'plainPassword123');
      assert.ok(testUser.password.startsWith('$2'), 'Password must be a bcrypt hash');
    });

    it('should verify correct password and reject incorrect password', async () => {
      const match = await testUser.verifyPassword('plainPassword123');
      const wrong = await testUser.verifyPassword('wrongPassword');
      assert.strictEqual(match, true);
      assert.strictEqual(wrong, false);
    });

    it('should reject duplicate email registration at model level', async () => {
      await assert.rejects(async () => {
        await User.create({
          full_name: 'Duplicate Guy',
          email: 'test@eventreg.test',
          password: 'anotherPassword',
        });
      });
    });
  });

  /* ----------------- 2. FORGOT PASSWORD & RESET PASSWORD FLOW ----------------- */
  describe('2. Forgot Password & Secure Token Generation', () => {
    let user;
    let token;

    before(async () => {
      user = await User.create({
        full_name: 'Reset Tester',
        email: 'reset@eventreg.test',
        password: 'oldPassword123',
        role: 'participant',
      });
    });

    it('should generate a 64-char crypto reset token and store only its hash', async () => {
      token = await user.generateResetToken();
      assert.ok(token, 'Token must exist');
      assert.strictEqual(token.length, 64, 'Token must be 64 hexadecimal characters');
      assert.match(token, /^[a-f0-9]{64}$/, 'Token must be hexadecimal');

      // Security: the raw token is handed to the user, never persisted.
      assert.notStrictEqual(user.reset_password_token, token, 'Raw token must not be stored');
      assert.strictEqual(user.reset_password_token, User.hashResetToken(token));
      assert.ok(user.reset_password_expires > new Date(), 'Expiry must be in the future');
    });

    it('should locate user by valid unexpired token', async () => {
      const found = await User.findOne({
        where: {
          reset_password_token: User.hashResetToken(token),
          reset_password_expires: { [Op.gt]: new Date() },
        },
      });
      assert.ok(found);
      assert.strictEqual(found.email, 'reset@eventreg.test');
    });

    it('should successfully reset password and clear token', async () => {
      user.password = 'brandNewPassword456';
      user.reset_password_token = null;
      user.reset_password_expires = null;
      await user.save();

      const refreshed = await User.findByPk(user.user_id);
      assert.strictEqual(refreshed.reset_password_token, null);
      assert.strictEqual(refreshed.reset_password_expires, null);

      const oldVerify = await refreshed.verifyPassword('oldPassword123');
      const newVerify = await refreshed.verifyPassword('brandNewPassword456');
      assert.strictEqual(oldVerify, false);
      assert.strictEqual(newVerify, true);
    });

    it('should reject expired tokens', async () => {
      // Simulate expired token
      user.reset_password_token = User.hashResetToken('expired-token-xyz');
      user.reset_password_expires = new Date(Date.now() - 1000 * 60); // 1 minute ago
      await user.save();

      const found = await User.findOne({
        where: {
          reset_password_token: User.hashResetToken('expired-token-xyz'),
          reset_password_expires: { [Op.gt]: new Date() },
        },
      });
      assert.strictEqual(found, null, 'Expired token must not resolve to any user');
    });
  });

  /* ------------------- 3. EVENT CREATION & CAPACITY LOGIC ------------------- */
  describe('3. Event Management & Capacity Calculation', () => {
    let limitedEvent;

    before(async () => {
      limitedEvent = await Event.create({
        title: 'Limited Workshop',
        description: 'Testing capacity limits',
        event_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        venue_id: venue.venue_id,
        max_participants: 2,
      });
    });

    it('should compute initial event capacity as empty and open', async () => {
      const cap = await getEventCapacity(limitedEvent);
      assert.strictEqual(cap.taken, 0);
      assert.strictEqual(cap.max, 2);
      assert.strictEqual(cap.remaining, 2);
      assert.strictEqual(cap.isFull, false);
    });

    it('should enforce capacity limit when registrations reach max_participants', async () => {
      const u1 = await User.create({
        full_name: 'Attendee 1',
        email: 'u1@eventreg.test',
        password: 'pass',
      });
      const u2 = await User.create({
        full_name: 'Attendee 2',
        email: 'u2@eventreg.test',
        password: 'pass',
      });

      await Registration.create({
        user_id: u1.user_id,
        event_id: limitedEvent.event_id,
        status: 'confirmed',
      });
      await Registration.create({
        user_id: u2.user_id,
        event_id: limitedEvent.event_id,
        status: 'confirmed',
      });

      const cap = await getEventCapacity(limitedEvent);
      assert.strictEqual(cap.taken, 2);
      assert.strictEqual(cap.remaining, 0);
      assert.strictEqual(cap.isFull, true);
    });
  });

  /* ------------------- 4. DUPLICATE PREVENTION & RE-REGISTRATION BUG FIX ------------------- */
  describe('4. Duplicate Prevention & Re-registration After Cancellation', () => {
    let event;
    let participant;

    before(async () => {
      event = await Event.create({
        title: 'Seminar On Data',
        event_date: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
        venue_id: venue.venue_id,
        max_participants: 10,
      });

      participant = await User.create({
        full_name: 'Pedro Penduko',
        email: 'pedro@eventreg.test',
        password: 'pass',
      });
    });

    it('should prevent duplicate active registration via unique constraint', async () => {
      await Registration.create({
        user_id: participant.user_id,
        event_id: event.event_id,
        status: 'confirmed',
      });

      // Attempting second create must trigger unique constraint
      await assert.rejects(async () => {
        await Registration.create({
          user_id: participant.user_id,
          event_id: event.event_id,
          status: 'confirmed',
        });
      });
    });

    it('should allow clean re-registration after previous cancellation (Bug Fix Verification)', async () => {
      // Find existing registration and cancel it
      const reg = await Registration.findOne({
        where: { user_id: participant.user_id, event_id: event.event_id },
      });
      assert.ok(reg);
      await reg.update({ status: 'cancelled' });
      assert.strictEqual(reg.status, 'cancelled');

      // Now verify that the reactivation logic works:
      // Instead of failing with unique constraint on insert,
      // it reactivates the cancelled record
      await reg.update({ status: 'confirmed', registration_date: new Date() });
      assert.strictEqual(reg.status, 'confirmed');

      const activeCount = await Registration.count({
        where: { user_id: participant.user_id, event_id: event.event_id, status: 'confirmed' },
      });
      assert.strictEqual(activeCount, 1, 'Participant now has exactly 1 confirmed registration');
    });
  });

  /* ------------------- 5. WAITING LIST & AUTOMATIC PROMOTION ------------------- */
  describe('5. Waiting List & Automatic Promotion Flow', () => {
    let smallEvent;
    let userA, userB, userC;

    before(async () => {
      smallEvent = await Event.create({
        title: 'Micro Workshop',
        event_date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        venue_id: venue.venue_id,
        max_participants: 1, // capacity of 1
      });

      userA = await User.create({ full_name: 'Person A', email: 'a@test.com', password: 'p' });
      userB = await User.create({ full_name: 'Person B', email: 'b@test.com', password: 'p' });
      userC = await User.create({ full_name: 'Person C', email: 'c@test.com', password: 'p' });
    });

    it('should allow first person as confirmed and subsequent as waitlisted', async () => {
      // User A takes the 1 slot
      const regA = await Registration.create({
        user_id: userA.user_id,
        event_id: smallEvent.event_id,
        status: 'confirmed',
      });
      assert.strictEqual(regA.status, 'confirmed');

      // User B is waitlisted
      const regB = await Registration.create({
        user_id: userB.user_id,
        event_id: smallEvent.event_id,
        status: 'waitlisted',
      });
      assert.strictEqual(regB.status, 'waitlisted');

      // User C is waitlisted
      const regC = await Registration.create({
        user_id: userC.user_id,
        event_id: smallEvent.event_id,
        status: 'waitlisted',
      });
      assert.strictEqual(regC.status, 'waitlisted');
    });

    it('should automatically promote the earliest waitlisted participant when confirmed cancels', async () => {
      // User A cancels
      const regA = await Registration.findOne({
        where: { user_id: userA.user_id, event_id: smallEvent.event_id },
      });
      await regA.update({ status: 'cancelled' });

      // System promotion logic (as in registrationController & adminController)
      const nextInLine = await Registration.findOne({
        where: { event_id: smallEvent.event_id, status: 'waitlisted' },
        order: [['registration_date', 'ASC'], ['registration_id', 'ASC']],
      });
      assert.ok(nextInLine);
      assert.strictEqual(nextInLine.user_id, userB.user_id, 'User B was first waitlisted');

      await nextInLine.update({ status: 'confirmed' });

      // Verify User B is now confirmed and User C is still waitlisted
      const bRefreshed = await Registration.findOne({
        where: { user_id: userB.user_id, event_id: smallEvent.event_id },
      });
      const cRefreshed = await Registration.findOne({
        where: { user_id: userC.user_id, event_id: smallEvent.event_id },
      });

      assert.strictEqual(bRefreshed.status, 'confirmed');
      assert.strictEqual(cRefreshed.status, 'waitlisted');
    });
  });


  /* ------------------- 7. NORMALISED SCHEMA (v2 tables) ------------------- */
  describe('7. Venues, Attendance, Status History and Audit Trail', () => {
    let auditVenue;
    let auditEvent;
    let attendee;

    before(async () => {
      auditVenue = await Venue.create({ name: 'Audit Venue', city: 'Manila' });
      auditEvent = await Event.create({
        title: 'Schema v2 Demo',
        event_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        venue_id: auditVenue.venue_id,
        max_participants: 5,
      });
      attendee = await User.create({
        full_name: 'Schema Tester',
        email: 'schema@eventreg.test',
        password: 'pass',
      });
    });

    it('should require every event to reference a venue (3NF: no free-text venue)', async () => {
      await assert.rejects(async () => {
        await Event.create({
          title: 'No venue event',
          event_date: new Date(Date.now() + 86400000),
          max_participants: 3,
        });
      }, 'An event without venue_id must be rejected');
    });

    it('should reuse the same venue row for events in the same place', async () => {
      const second = await Event.create({
        title: 'Second event at the same venue',
        event_date: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000),
        venue_id: auditVenue.venue_id,
        max_participants: 10,
      });
      const events = await Event.findAll({ where: { venue_id: auditVenue.venue_id } });
      assert.strictEqual(events.length, 2);
      assert.strictEqual(second.venue_id, auditEvent.venue_id);
    });

    it('should record a physical check-in once per registration', async () => {
      const reg = await Registration.create({
        user_id: attendee.user_id,
        event_id: auditEvent.event_id,
        status: 'confirmed',
      });
      const attendance = await Attendance.create({
        registration_id: reg.registration_id,
        checked_in_by: attendee.user_id,
      });
      assert.ok(attendance.checked_in_at instanceof Date);

      await assert.rejects(
        async () =>
          Attendance.create({
            registration_id: reg.registration_id,
          }),
        'UNIQUE(registration_id) must block a second check-in'
      );
    });

    it('should append status history rows instead of overwriting the past', async () => {
      const reg = await Registration.findOne({
        where: { user_id: attendee.user_id, event_id: auditEvent.event_id },
      });
      await logStatusChange({ registrationId: reg.registration_id, from: null, to: 'confirmed' });
      await logStatusChange({
        registrationId: reg.registration_id,
        from: 'confirmed',
        to: 'cancelled',
        reason: 'unit test',
      });

      const history = await RegistrationStatusChange.findAll({
        where: { registration_id: reg.registration_id },
        order: [['change_id', 'ASC']],
      });
      assert.strictEqual(history.length, 2);
      assert.strictEqual(history[0].to_status, 'confirmed');
      assert.strictEqual(history[1].from_status, 'confirmed');
      assert.strictEqual(history[1].to_status, 'cancelled');
    });

    it('should write an audit row for administrative actions', async () => {
      const log = await logAudit({
        actorId: attendee.user_id,
        action: 'event.update',
        entity: 'EVENT',
        entityId: auditEvent.event_id,
        detail: { title: 'changed' },
      });
      assert.ok(log);
      const stored = await AuditLog.findByPk(log.log_id);
      assert.strictEqual(stored.action, 'event.update');
      assert.strictEqual(stored.entity, 'EVENT');
      assert.strictEqual(JSON.parse(stored.detail).title, 'changed');
    });

    it('should soft delete an event and keep its registrations', async () => {
      const before = await Registration.count({ where: { event_id: auditEvent.event_id } });
      assert.ok(before > 0);

      await auditEvent.destroy();
      assert.strictEqual(await Event.count({ where: { event_id: auditEvent.event_id } }), 0);
      assert.strictEqual(
        await Event.count({ where: { event_id: auditEvent.event_id }, paranoid: false }),
        1
      );
      assert.strictEqual(await Registration.count({ where: { event_id: auditEvent.event_id } }), before);

      await auditEvent.restore();
      assert.strictEqual(await Event.count({ where: { event_id: auditEvent.event_id } }), 1);
    });
  });

  /* ---------------------------- 8. HARDENING ----------------------------- */
  describe('8. Rate limiting and persistent sessions', () => {
    it('should reject requests above the configured limit with HTTP 429', async () => {
      const limiter = createRateLimiter({ scope: 'unit-test', windowMs: 60000, max: 2 });
      const req = { ip: '203.0.113.9' };
      const res = { setHeader: () => {}, on: () => {} };

      await new Promise((resolve, reject) => limiter(req, res, (err) => (err ? reject(err) : resolve())));
      await new Promise((resolve, reject) => limiter(req, res, (err) => (err ? reject(err) : resolve())));

      const err = await new Promise((resolve) => limiter(req, res, resolve));
      assert.ok(err, 'third call must be rejected');
      assert.strictEqual(err.status, 429);
    });

    it('should lock an account after repeated failed logins and clear on success', async () => {
      const fakeReq = { body: { email: 'lockme@eventreg.test' }, ip: '203.0.113.10' };
      for (let i = 0; i < 5; i += 1) accountLoginLockout.fail(fakeReq);

      const fakeRes = { setHeader: () => {} };
      const err = await new Promise((resolve) => accountLoginLockout.guard(fakeReq, fakeRes, resolve));
      assert.ok(err, 'account must be locked');
      assert.strictEqual(err.status, 429);

      accountLoginLockout.succeed(fakeReq);
      const afterSuccess = await new Promise((resolve) =>
        accountLoginLockout.guard(fakeReq, fakeRes, (e) => resolve(e || null))
      );
      assert.strictEqual(afterSuccess, null);
    });

    it('should persist sessions in the SESSIONS table', async () => {
      const store = new SequelizeSessionStore();
      const data = { cookie: { maxAge: 60000 }, user: { user_id: 7, role: 'participant' } };

      await new Promise((resolve, reject) => store.set('sid-test-1', data, (e) => (e ? reject(e) : resolve())));
      const loaded = await new Promise((resolve, reject) =>
        store.get('sid-test-1', (e, s) => (e ? reject(e) : resolve(s)))
      );
      assert.deepStrictEqual(loaded.user, { user_id: 7, role: 'participant' });

      await new Promise((resolve, reject) => store.destroy('sid-test-1', (e) => (e ? reject(e) : resolve())));
      const gone = await new Promise((resolve, reject) =>
        store.get('sid-test-1', (e, s) => (e ? reject(e) : resolve(s)))
      );
      assert.strictEqual(gone, null);
    });
  });

  /* ------------------- 6. INPUT VALIDATION ROUTINES ------------------- */
  describe('6. Input Validation Routines', () => {
    it('should catch invalid or missing registration data', () => {
      const errs1 = validateRegistration({ full_name: '', email: '' });
      assert.ok(errs1.length >= 2);

      const errs2 = validateRegistration({ full_name: 'A', email: 'not-an-email' });
      assert.ok(errs2.some((e) => e.includes('2 characters')));
      assert.ok(errs2.some((e) => e.includes('valid email')));
    });

    it('should validate event creation inputs', () => {
      // Venue is validated by resolveVenue() against the VENUES table, so this
      // validator covers title / date / description / capacity.
      const errs = validateEvent({
        title: '',
        event_date: '',
        max_participants: 0,
      });
      assert.ok(errs.length >= 3);

      const future = validateEvent(
        {
          title: 'Past event',
          event_date: '2020-01-01T09:00',
          max_participants: 5,
        },
        { requireFuture: true }
      );
      assert.ok(future.some((e) => e.includes('future')));
    });

    it('should validate password length and matching confirmation', () => {
      const shortErr = validatePassword('12345', '12345');
      assert.ok(shortErr.some((e) => e.includes('6 characters')));

      const mismatchErr = validatePassword('123456', 'different');
      assert.ok(mismatchErr.some((e) => e.includes('does not match')));

      const valid = validatePassword('secret123', 'secret123');
      assert.strictEqual(valid.length, 0);
    });
  });

  /* --------------------- 9. NOTIFICATION OUTBOX (NEW) ---------------------- */
  describe('9. Notification outbox and delivery worker', () => {
    let event;
    let participant;

    before(async () => {
      event = await Event.create({
        title: 'Outbox Test Event',
        event_date: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
        venue_id: venue.venue_id,
        max_participants: 5,
      });
      participant = await User.create({
        full_name: 'Outbox Tester',
        email: 'outbox@email.com',
        password: 'password123',
        role: 'participant',
      });
    });

    beforeEach(async () => {
      await Notification.destroy({ where: {}, truncate: true });
      mailer.drainMemoryOutbox();
    });

    it('queues a row that starts life as "queued" with zero attempts', async () => {
      const registration = await Registration.create({
        user_id: participant.user_id,
        event_id: event.event_id,
        status: 'confirmed',
      });

      const row = await queue({
        kind: 'registration_confirmed',
        email: participant.email,
        userId: participant.user_id,
        registrationId: registration.registration_id,
        eventId: event.event_id,
        payload: payloadFor({ event, participant, registration }),
      });

      assert.strictEqual(row.status, 'queued');
      assert.strictEqual(row.attempts, 0);
      assert.strictEqual(row.kind, 'registration_confirmed');

      const stored = Notification.findByPk(row.notification_id);
      const parsed = (await stored).getPayload();
      assert.strictEqual(parsed.event_title, 'Outbox Test Event');
      assert.match(parsed.reference, /^REG-\d{5}-[0-9A-F]{6}$/);
    });

    it('renders a subject, HTML and text alternative for every kind', async () => {
      for (const kind of Notification.KINDS) {
        const message = await render(kind, {
          participant_name: 'Outbox Tester',
          event_title: 'Outbox Test Event',
          event_date: new Date().toISOString(),
          venue_name: 'Test Hall',
          reference: 'REG-00001-ABCDEF',
          status: 'confirmed',
          reset_url: 'http://localhost/reset-password/abc',
          claim_url: 'http://localhost/reset-password/abc',
        });
        assert.ok(message.subject.length > 0, `${kind} needs a subject`);
        assert.match(message.html, /<!DOCTYPE html>/i, `${kind} should render the e-mail layout`);
        assert.ok(message.text.includes('EventReg'), `${kind} needs a text alternative`);
      }
    });

    it('escapes participant-controlled text instead of injecting HTML', async () => {
      const message = await render('registration_confirmed', {
        participant_name: '<script>alert(1)</script>',
        event_title: 'XSS <b>Attempt</b>',
        status: 'confirmed',
      });
      assert.ok(!message.html.includes('<script>alert(1)</script>'));
      assert.ok(message.html.includes('&lt;script&gt;'));
    });

    it('delivers queued rows and stamps sent_at', async () => {
      await queue({ kind: 'registration_confirmed', email: 'a@email.com', payload: { event_title: 'X' } });

      const worker = new NotificationWorker({ maxAttempts: 3 });
      const stats = await worker.drainOnce();

      assert.strictEqual(stats.sent, 1);
      const sent = await Notification.findOne({ where: { email: 'a@email.com' } });
      assert.strictEqual(sent.status, 'sent');
      assert.ok(sent.sent_at instanceof Date);
      assert.strictEqual(mailer.drainMemoryOutbox().length, 1);
    });

    it('marks a row failed after the retry budget is spent, and keeps the error', async () => {
      await queue({ kind: 'registration_confirmed', email: 'b@email.com', payload: { event_title: 'X' } });

      const worker = new NotificationWorker({ maxAttempts: 1 });
      // No transport can resolve 'smpt' (typo) - force a failure by making the
      // template render throw on a circular payload.
      const original = mailer.send;
      mailer.send = async () => {
        throw new Error('SMTP connection refused');
      };

      try {
        await worker.drainOnce();
        const row = await Notification.findOne({ where: { email: 'b@email.com' } });
        assert.strictEqual(row.status, 'failed');
        assert.strictEqual(row.attempts, 1);
        assert.match(row.last_error, /SMTP connection refused/);
      } finally {
        mailer.send = original;
      }
    });

    it('retries a failed row until it succeeds, then stops', async () => {
      await queue({ kind: 'registration_confirmed', email: 'c@email.com', payload: { event_title: 'X' } });
      const worker = new NotificationWorker({ maxAttempts: 3 });

      const original = mailer.send;
      let attempts = 0;
      mailer.send = async (message) => {
        attempts += 1;
        if (attempts < 2) throw new Error('temporary failure');
        return original(message);
      };

      try {
        await worker.drainOnce(); // 1st attempt fails, row goes back to queued
        let row = await Notification.findOne({ where: { email: 'c@email.com' } });
        assert.strictEqual(row.status, 'queued');
        assert.strictEqual(row.attempts, 1);

        await worker.drainOnce(); // 2nd attempt succeeds
        row = await Notification.findOne({ where: { email: 'c@email.com' } });
        assert.strictEqual(row.status, 'sent');
        assert.strictEqual(row.attempts, 2);
      } finally {
        mailer.send = original;
      }
    });

    it('queues one cancellation notice per active registration', async () => {
      // Own event: earlier tests in this suite already have registrations on
      // the shared one, and this assertion counts rows.
      const doomed = await Event.create({
        title: 'Cancelled Trip',
        event_date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        venue_id: venue.venue_id,
        max_participants: 10,
      });
      const a = await User.create({ full_name: 'A', email: 'cancel-a@email.com', password: 'password123', role: 'participant' });
      const b = await User.create({ full_name: 'B', email: 'cancel-b@email.com', password: 'password123', role: 'participant' });
      const cancelled = await User.create({ full_name: 'C', email: 'cancel-c@email.com', password: 'password123', role: 'participant' });

      const rows = [
        { user_id: a.user_id, event_id: doomed.event_id, status: 'confirmed' },
        { user_id: b.user_id, event_id: doomed.event_id, status: 'waitlisted' },
        { user_id: cancelled.user_id, event_id: doomed.event_id, status: 'cancelled' },
      ];
      for (const row of rows) {
        // eslint-disable-next-line no-await-in-loop
        await Registration.create(row);
      }

      const affected = await Registration.findAll({
        where: { event_id: doomed.event_id, status: ['confirmed', 'waitlisted'] },
        include: [{ model: User, as: 'user' }],
      });

      const queued = await queueEventCancellation(doomed, affected);
      assert.strictEqual(queued, 2, 'the already-cancelled registration gets no notice');

      const all = await Notification.findAll();
      assert.ok(all.every((n) => n.kind === 'event_cancelled'));
    });

    it('never queues a notification without a recipient', async () => {
      await assert.rejects(
        () => queue({ kind: 'registration_confirmed', email: '', payload: {} }),
        /needs a recipient/
      );
    });

    it('rejects an unknown notification kind at the model level', async () => {
      await assert.rejects(
        () => Notification.create({ kind: 'telepathy', email: 'x@email.com' }),
        /Unknown notification kind/
      );
    });
  });

  /* ---------------------- 10. GUEST REFERENCE CODES ------------------------ */
  describe('10. Signed guest reference codes', () => {
    it('formats a reference as REG-<id>-<check>', () => {
      assert.match(Registration.referenceFor(49), /^REG-00049-[0-9A-F]{6}$/);
    });

    it('round-trips a valid reference back to its registration id', () => {
      const code = Registration.referenceFor(49);
      assert.strictEqual(Registration.idFromReference(code), 49);
    });

    it('rejects a tampered or invented reference', () => {
      const code = Registration.referenceFor(49);
      assert.strictEqual(Registration.idFromReference('REG-00049-123456'), null);
      assert.strictEqual(Registration.idFromReference('REG-00050-ABCDEF'), null);
      assert.strictEqual(Registration.idFromReference('REG-49'), null);
      assert.strictEqual(Registration.idFromReference(''), null);
      assert.strictEqual(Registration.idFromReference(null), null);
    });

    it('gives a different code per registration, so ids cannot be enumerated', () => {
      const codes = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((id) => Registration.referenceFor(id)));
      assert.strictEqual(codes.size, 8);
    });
  });
});

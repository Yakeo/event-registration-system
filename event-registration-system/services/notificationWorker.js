/**
 * services/notificationWorker.js
 * Drains the NOTIFICATIONS outbox.
 *
 * Deliberately a timer inside the web process rather than a separate service:
 * one process, one database, nothing to deploy twice. `unref()` means the
 * timer never keeps the process alive on shutdown, and `stop()` is wired to
 * SIGTERM in server.js.
 *
 * Retry policy: a failed attempt increments `attempts` and puts the row back
 * into `queued` until maxAttempts is reached, at which point it becomes
 * `failed` and stays visible in /admin/notifications with the error message.
 * A row is therefore never silently lost - the worst case is a red badge.
 */
const { Op } = require('sequelize');

const { Notification } = require('../models');
const mailer = require('./mailer');
const { render } = require('./notifications');

const DEFAULTS = {
  intervalMs: 15000,
  batchSize: 20,
  maxAttempts: 3,
};

class NotificationWorker {
  constructor(options = {}) {
    this.intervalMs = Number(process.env.MAIL_INTERVAL_MS) || options.intervalMs || DEFAULTS.intervalMs;
    this.batchSize = options.batchSize || DEFAULTS.batchSize;
    this.maxAttempts = options.maxAttempts || DEFAULTS.maxAttempts;
    this.timer = null;
    this.running = false;
  }

  /**
   * Sends everything that is due, once.
   * @returns {Promise<{sent: number, failed: number, skipped: number}>}
   */
  async drainOnce() {
    if (this.running) return { sent: 0, failed: 0, skipped: 0 };
    this.running = true;

    const stats = { sent: 0, failed: 0, skipped: 0 };
    try {
      const pending = await Notification.findAll({
        where: {
          [Op.or]: [
            { status: 'queued' },
            { status: 'failed', attempts: { [Op.lt]: this.maxAttempts } },
          ],
        },
        order: [['created_at', 'ASC'], ['notification_id', 'ASC']],
        limit: this.batchSize,
      });

      for (const notification of pending) {
        // eslint-disable-next-line no-await-in-loop
        const outcome = await this.deliver(notification);
        stats[outcome] += 1;
      }
    } finally {
      this.running = false;
    }

    return stats;
  }

  /** Delivers one row and records the result. Returns 'sent' | 'failed'. */
  async deliver(notification) {
    const payload = notification.getPayload();

    try {
      const message = await render(notification.kind, payload);
      await mailer.send({
        to: notification.email,
        subject: message.subject,
        html: message.html,
        text: message.text,
      });

      await notification.update({
        status: 'sent',
        sent_at: new Date(),
        attempts: notification.attempts + 1,
        last_error: null,
      });
      return 'sent';
    } catch (err) {
      const attempts = notification.attempts + 1;
      await notification.update({
        status: attempts >= this.maxAttempts ? 'failed' : 'queued',
        attempts,
        last_error: String(err.message || err).slice(0, 255),
      });
      console.warn(`[MAIL] ${notification.kind} to ${notification.email} failed: ${err.message}`);
      return 'failed';
    }
  }

  start() {
    if (this.timer) return this.timer;

    // Do not block startup on the outbox: drain in the background.
    this.drainOnce().catch((err) => console.warn('[MAIL] initial drain failed:', err.message));

    this.timer = setInterval(() => {
      this.drainOnce().catch((err) => console.warn('[MAIL] drain failed:', err.message));
    }, this.intervalMs);
    if (typeof this.timer.unref === 'function') this.timer.unref();
    return this.timer;
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

/**
 * Shared instance, so server.js and the admin "retry" button operate on the
 * same worker. MAIL_WORKER=off disables delivery entirely (rows stay queued),
 * which is what the test suite and a manual-inspection demo want.
 */
let shared = null;
function getNotificationWorker() {
  if (process.env.MAIL_WORKER === 'off') return null;
  if (!shared) shared = new NotificationWorker();
  return shared;
}

module.exports = { NotificationWorker, DEFAULTS, getNotificationWorker };

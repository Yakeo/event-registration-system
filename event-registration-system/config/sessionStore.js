/**
 * config/sessionStore.js
 * express-session store backed by the SESSIONS table.
 *
 * The default MemoryStore logs everybody out on restart, leaks memory and
 * cannot be shared between processes. Storing sessions in the same database
 * keeps `npm start` working without Redis while still surviving restarts.
 *
 * Usage (server.js):
 *   store: process.env.SESSION_STORE === 'memory' ? undefined : new SequelizeSessionStore()
 */
const session = require('express-session');
const { Session } = require('../models');

const DEFAULT_TTL_MS = 1000 * 60 * 60 * 8; // matches cookie maxAge
const CLEANUP_INTERVAL_MS = 15 * 60 * 1000;

class SequelizeSessionStore extends session.Store {
  constructor(options = {}) {
    super();
    this.ttlMs = options.ttlMs || DEFAULT_TTL_MS;
    this.timer = null;
  }

  /** Reads and deserialises one session; expired rows are deleted lazily. */
  get(sid, callback) {
    Session.findByPk(sid)
      .then(async (row) => {
        if (!row) return callback(null, null);
        if (new Date(row.expires_at).getTime() <= Date.now()) {
          await row.destroy().catch(() => {});
          return callback(null, null);
        }
        let parsed;
        try {
          parsed = JSON.parse(row.data);
        } catch (err) {
          await row.destroy().catch(() => {});
          return callback(null, null);
        }
        return callback(null, parsed);
      })
      .catch((err) => callback(err));
  }

  set(sid, sess, callback = () => {}) {
    const expires = this.expiresFor(sess);
    const data = JSON.stringify(sess);
    Session.upsert({ sid, data, expires_at: expires })
      .then(() => callback(null))
      .catch((err) => callback(err));
  }

  touch(sid, sess, callback = () => {}) {
    Session.update({ expires_at: this.expiresFor(sess) }, { where: { sid } })
      .then(() => callback(null))
      .catch((err) => callback(err));
  }

  destroy(sid, callback = () => {}) {
    Session.destroy({ where: { sid } })
      .then(() => callback(null))
      .catch((err) => callback(err));
  }

  length(callback) {
    Session.count()
      .then((count) => callback(null, count))
      .catch((err) => callback(err));
  }

  clear(callback = () => {}) {
    Session.destroy({ where: {}, truncate: true })
      .then(() => callback(null))
      .catch((err) => callback(err));
  }

  all(callback = () => {}) {
    Session.findAll()
      .then((rows) => {
        const out = {};
        rows.forEach((row) => {
          try {
            out[row.sid] = JSON.parse(row.data);
          } catch (err) {
            /* skip unreadable rows */
          }
        });
        callback(null, out);
      })
      .catch((err) => callback(err));
  }

  expiresFor(sess) {
    const cookieExpiry = sess && sess.cookie && sess.cookie.expires;
    if (cookieExpiry) {
      const when = new Date(cookieExpiry).getTime();
      if (Number.isFinite(when)) return new Date(when);
    }
    return new Date(Date.now() + this.ttlMs);
  }

  /** Purge expired sessions immediately and then every 15 minutes. */
  startCleanup() {
    this.purgeExpired();
    if (this.timer) return this.timer;
    this.timer = setInterval(() => this.purgeExpired(), CLEANUP_INTERVAL_MS);
    if (typeof this.timer.unref === 'function') this.timer.unref();
    return this.timer;
  }

  stopCleanup() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  purgeExpired() {
    return Session.destroy({ where: { expires_at: { [require('sequelize').Op.lt]: new Date() } } }).catch(
      (err) => {
        console.warn('[SESSION STORE] could not purge expired sessions:', err.message);
        return 0;
      }
    );
  }
}

module.exports = { SequelizeSessionStore, DEFAULT_TTL_MS };

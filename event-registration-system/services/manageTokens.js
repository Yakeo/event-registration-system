/**
 * services/manageTokens.js
 * Issue, verify and consume the `/r/:token` guest self-service links.
 *
 * The raw token only ever exists in the e-mail that was sent; the database
 * stores its SHA-256 digest. Verification is a hash lookup, so a stolen
 * database dump yields nothing that can be replayed.
 *
 * Deliberately NOT single-use on read: opening the page must not burn the link
 * (people reload, forward it to themselves, lose the tab). It is consumed only
 * by a state-changing action - cancel or claim - via `consumeFor()`.
 */
const crypto = require('crypto');

const { ManageToken, Registration, User } = require('../models');

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function hash(rawToken) {
  return crypto.createHash('sha256').update(String(rawToken)).digest('hex');
}

/**
 * Issues a fresh token for a user (and optionally one registration).
 * Returns the RAW token, which the caller puts in the URL and then forgets.
 */
async function issue({ userId, registrationId = null, ttlMs = TTL_MS, transaction = null }) {
  const raw = crypto.randomBytes(32).toString('hex');

  await ManageToken.create(
    {
      token_hash: hash(raw),
      user_id: userId,
      registration_id: registrationId,
      expires_at: new Date(Date.now() + ttlMs),
      created_at: new Date(),
    },
    { transaction }
  );

  return raw;
}

/** Builds the absolute URL that goes into an e-mail. */
function url(rawToken) {
  const base = (process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
  return `${base}/r/${rawToken}`;
}

/**
 * Resolves a raw token to `{ token, user, registration, expired, used }`.
 * Returns null when the token does not exist at all (so the caller can answer
 * with a generic "invalid link" page rather than leaking which part failed).
 */
async function verify(rawToken) {
  if (!rawToken || typeof rawToken !== 'string' || rawToken.length < 16) return null;

  const token = await ManageToken.findOne({
    where: { token_hash: hash(rawToken) },
    include: [{ model: User, as: 'user' }],
  });
  if (!token) return null;

  const expired = new Date(token.expires_at) <= new Date();
  const used = Boolean(token.used_at);

  let registration = null;
  if (token.registration_id) {
    registration = await Registration.findByPk(token.registration_id);
  }

  return { token, user: token.user, registration, expired, used };
}

/**
 * Marks a token as used. Called inside the same transaction as the action it
 * authorises, so a crash cannot leave a consumed link reusable.
 */
async function consumeFor(token, transaction = null) {
  return token.update({ used_at: new Date() }, { transaction });
}

/** Deletes every token belonging to a user (e.g. after a password is set). */
async function revokeAllFor(userId) {
  return ManageToken.destroy({ where: { user_id: userId } });
}

/** Removes expired rows; safe to run periodically or on demand. */
async function purgeExpired() {
  const { Op } = require('sequelize');
  return ManageToken.destroy({ where: { expires_at: { [Op.lt]: new Date() } } });
}

module.exports = { issue, verify, consumeFor, revokeAllFor, purgeExpired, url, hash, TTL_MS };

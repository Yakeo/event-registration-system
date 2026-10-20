/**
 * middlewares/auth.js
 * Session based authentication + role guards + CSRF protection + async
 * error wrapper.
 */
const crypto = require('crypto');
const { User } = require('../models');

/**
 * Loads the signed-in user from the database on every request.
 * Re-reading the row (instead of trusting the session copy) means a role
 * change or a deleted account takes effect immediately, instead of at the
 * user's next login.
 */
async function exposeUser(req, res, next) {
  try {
    if (req.session && req.session.user && req.session.user.user_id) {
      const fresh = await User.findByPk(req.session.user.user_id, {
        attributes: ['user_id', 'full_name', 'email', 'role'],
      });
      req.session.user = fresh ? fresh.get({ plain: true }) : null;
    }
  } catch (err) {
    return next(err);
  }

  res.locals.currentUser = (req.session && req.session.user) || null;
  res.locals.flash = {
    success: req.session.flashSuccess || null,
    error: req.session.flashError || null,
    info: req.session.flashInfo || null,
  };
  req.session.flashSuccess = null;
  req.session.flashError = null;
  req.session.flashInfo = null;
  next();
}

function requireLogin(req, res, next) {
  if (req.session.user) return next();
  req.session.flashError = 'Please log in to continue.';
  return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
}

function requireAdmin(req, res, next) {
  if (req.session.user && req.session.user.role === 'admin') return next();
  return res.status(403).render('error', {
    title: 'Access denied',
    status: 403,
    message: 'Administrator access is required to open that page.',
  });
}

/**
 * Only allows redirects to local, absolute paths. Blocks `//evil.tld`,
 * `https://evil.tld`, `/\evil.tld` and CR/LF injection - the classic
 * "open redirect" used in phishing after a legitimate login.
 */
function safeRedirect(target, fallback = '/') {
  if (typeof target !== 'string') return fallback;
  const value = target.trim();
  if (!value.startsWith('/')) return fallback;
  if (value.startsWith('//') || value.startsWith('/\\')) return fallback;
  if (/[\r\n]/.test(value)) return fallback;
  return value;
}

/**
 * Double-submit CSRF protection for every state-changing request.
 * The token lives in the session and is rendered into each form as `_csrf`.
 * Requests that don't carry it are rejected with 403 before a controller runs.
 */
function csrfProtection(req, res, next) {
  if (!req.session) return next();

  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;

  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  const expected = req.session.csrfToken;
  const supplied =
    (req.body && req.body._csrf) || req.get('x-csrf-token') || '';
  const a = Buffer.from(String(supplied));
  const b = Buffer.from(expected);

  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    const err = new Error('Your form session expired. Please reload the page and try again.');
    err.status = 403;
    return next(err);
  }
  return next();
}

/**
 * Wraps async route handlers to automatically catch any rejected promises
 * and pass them to Express error middleware (prevents unhandled rejections).
 */
function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/** Promise wrapper around express-session's callback-style regenerate(). */
function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
}

module.exports = {
  exposeUser,
  requireLogin,
  requireAdmin,
  safeRedirect,
  csrfProtection,
  asyncHandler,
  regenerateSession,
};

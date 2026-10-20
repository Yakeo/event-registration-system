/**
 * middlewares/rateLimit.js
 * Dependency-free fixed-window rate limiting + per-account login lockout.
 *
 * Why: /login, /forgot-password, /reset-password/:token and the public
 * registration endpoints were unmetered, so passwords could be guessed without
 * limit and the e-mail lookup could be used to enumerate accounts.
 *
 * The counters live in process memory, which is enough for a single-node
 * deployment (and for the demo). Behind more than one process, swap
 * `buckets` for a Redis/DB store - the interface stays the same.
 */

const buckets = new Map(); // key -> { count, resetAt }
const MAX_KEYS = 10000; // hard cap so a spray of unique keys cannot exhaust RAM
let sweeper = null;

function sweep(now = Date.now()) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
  if (buckets.size > MAX_KEYS) {
    // Drop the oldest windows first.
    const sorted = [...buckets.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt);
    sorted.slice(0, buckets.size - MAX_KEYS).forEach(([key]) => buckets.delete(key));
  }
}

function startSweeper() {
  if (sweeper) return;
  sweeper = setInterval(() => sweep(), 60 * 1000);
  if (typeof sweeper.unref === 'function') sweeper.unref();
}

/** Client IP, honouring the reverse proxy configured in server.js. */
function clientIp(req) {
  return (req.ip || (req.connection && req.connection.remoteAddress) || 'unknown').replace(
    /^::ffff:/,
    ''
  );
}

function hit(key, windowMs) {
  startSweeper();
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  return bucket;
}

function peek(key) {
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= Date.now()) return { count: 0, resetAt: 0 };
  return bucket;
}

function reset(key) {
  buckets.delete(key);
}

/**
 * @param {object} options
 * @param {number} options.windowMs  window length
 * @param {number} options.max       requests allowed per window
 * @param {string} options.scope     prefix so limiters do not share counters
 * @param {(req:object)=>string} [options.keyGenerator]
 * @param {string} [options.message]
 * @param {boolean} [options.skipSuccessfulRequests]
 */
function createRateLimiter({
  windowMs,
  max,
  scope,
  keyGenerator = (req) => clientIp(req),
  message = 'Too many requests. Please wait a moment and try again.',
  skipSuccessfulRequests = false,
}) {
  return function rateLimiter(req, res, next) {
    const key = `${scope}:${keyGenerator(req)}`;
    const bucket = hit(key, windowMs);

    // Tell clients (and tests) how long the window has left.
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(max - bucket.count, 0)));

    if (bucket.count > max) {
      const retryAfter = Math.max(Math.ceil((bucket.resetAt - Date.now()) / 1000), 1);
      res.setHeader('Retry-After', String(retryAfter));
      const err = new Error(`${message} (retry in ${retryAfter}s)`);
      err.status = 429;
      return next(err);
    }

    if (skipSuccessfulRequests) {
      // Only count failures: successful logins must not lock anybody out.
      res.on('finish', () => {
        if (res.statusCode < 400) {
          const current = buckets.get(key);
          if (current && current.count > 0) current.count -= 1;
        }
      });
    }

    return next();
  };
}

/**
 * Per-account login lockout. Counts consecutive failures for an e-mail address
 * regardless of the IP used, which is what stops a distributed guessing attack
 * against one account. Cleared on a successful login.
 */
function loginLockout({ max = 5, windowMs = 15 * 60 * 1000 } = {}) {
  const keyFor = (req) =>
    `login-account:${String((req.body && req.body.email) || '').trim().toLowerCase()}`;

  return {
    /** Middleware: reject before the password is even checked. */
    guard: function loginLockoutGuard(req, res, next) {
      const key = keyFor(req);
      const bucket = peek(key);
      if (bucket.count >= max) {
        const retryAfter = Math.max(Math.ceil((bucket.resetAt - Date.now()) / 1000), 1);
        res.setHeader('Retry-After', String(retryAfter));
        const err = new Error(
          `Too many failed login attempts for this account. Try again in ${Math.ceil(
            retryAfter / 60
          )} minute(s) or use "Forgot password".`
        );
        err.status = 429;
        return next(err);
      }
      return next();
    },
    fail(req) {
      hit(keyFor(req), windowMs);
    },
    succeed(req) {
      reset(keyFor(req));
    },
  };
}

/**
 * Shared per-account lockout instance: routes/index.js installs `.guard`,
 * authController.js reports `.fail()` / `.succeed()` after checking the
 * password. One instance so both sides see the same counters.
 */
const accountLoginLockout = loginLockout({ max: 5, windowMs: 15 * 60 * 1000 });

module.exports = {
  createRateLimiter,
  loginLockout,
  accountLoginLockout,
  clientIp,
  // exported for tests
  _buckets: buckets,
  _reset: () => buckets.clear(),
};

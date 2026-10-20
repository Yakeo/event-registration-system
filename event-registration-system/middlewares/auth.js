/**
 * middlewares/auth.js
 * Session based authentication + role guards + async error wrapper.
 */

function exposeUser(req, res, next) {
  res.locals.currentUser = req.session.user || null;
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
  res.status(403).render('error', {
    title: 'Access denied',
    status: 403,
    message: 'Administrator access is required to open that page.',
  });
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

module.exports = { exposeUser, requireLogin, requireAdmin, asyncHandler };

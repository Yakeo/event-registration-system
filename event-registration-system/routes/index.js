/**
 * routes/index.js
 * URL map -> controller actions (classic MVC routing table).
 *
 * Public write endpoints are rate limited (see middlewares/rateLimit.js):
 * login gets an IP limiter plus a per-account lockout, password reset and
 * public registration get their own budgets so the endpoints cannot be used
 * to brute force passwords, enumerate accounts or mass-create users.
 */
const express = require('express');
const router = express.Router();

const { eventController } = require('../controllers/eventController');
const registrationController = require('../controllers/registrationController');
const authController = require('../controllers/authController');
const adminController = require('../controllers/adminController');
const { requireLogin, requireAdmin, asyncHandler } = require('../middlewares/auth');
const { createRateLimiter, accountLoginLockout } = require('../middlewares/rateLimit');

/* ------------------------------- LIMITERS -------------------------------- */
const loginIpLimiter = createRateLimiter({
  scope: 'login-ip',
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many login attempts from this address.',
  skipSuccessfulRequests: true,
});

const accountLockout = accountLoginLockout;

const passwordResetLimiter = createRateLimiter({
  scope: 'password-reset',
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'Too many password reset requests.',
});

const publicRegistrationLimiter = createRateLimiter({
  scope: 'public-registration',
  windowMs: 60 * 60 * 1000,
  max: 30,
  message: 'Too many registration submissions from this address.',
});

const signupLimiter = createRateLimiter({
  scope: 'signup',
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'Too many accounts created from this address.',
});

/* ------------------------------- PUBLIC ---------------------------------- */
router.get('/', asyncHandler(eventController.publicList));              // public event listing page
router.get('/events/:id', asyncHandler(eventController.show));          // event detail + registration form

/* --------------------------- REGISTRATION FLOW ---------------------------- */
router.post(
  '/events/:id/register',
  publicRegistrationLimiter,
  asyncHandler(registrationController.store)
); // online registration
router.post(
  '/events/:id/waitlist',
  publicRegistrationLimiter,
  asyncHandler(registrationController.waitlist)
); // join waiting list (event full)
router.post('/registrations/:id/cancel', requireLogin, asyncHandler(registrationController.cancel));

/* --------------------------------- AUTH ---------------------------------- */
router.get('/register', authController.showRegister);
router.post('/register', signupLimiter, asyncHandler(authController.register));
router.get('/login', authController.showLogin);
router.post('/login', loginIpLimiter, accountLockout.guard, asyncHandler(authController.login));
router.post('/logout', authController.logout);
router.get('/my-registrations', requireLogin, asyncHandler(authController.myRegistrations));

// Forgot & Reset Password
router.get('/forgot-password', authController.showForgotPassword);
router.post('/forgot-password', passwordResetLimiter, asyncHandler(authController.forgotPassword));
router.get('/reset-password/:token', asyncHandler(authController.showResetPassword));
router.post('/reset-password/:token', passwordResetLimiter, asyncHandler(authController.resetPassword));

// Change Password (authenticated user)
router.get('/change-password', requireLogin, authController.showChangePassword);
router.post('/change-password', requireLogin, asyncHandler(authController.changePassword));

/* ------------------------ ADMIN (create/edit/delete) ---------------------- */
router.get('/admin', requireLogin, requireAdmin, asyncHandler(adminController.dashboard));

router.get('/admin/events', requireLogin, requireAdmin, asyncHandler(eventController.adminIndex));
router.get('/admin/events/archived', requireLogin, requireAdmin, asyncHandler(eventController.archivedIndex));
router.get('/admin/events/new', requireLogin, requireAdmin, asyncHandler(eventController.showCreateForm));
router.post('/admin/events', requireLogin, requireAdmin, asyncHandler(eventController.create));
router.get('/admin/events/:id/edit', requireLogin, requireAdmin, asyncHandler(eventController.showEditForm));
router.put('/admin/events/:id', requireLogin, requireAdmin, asyncHandler(eventController.update));
router.delete('/admin/events/:id', requireLogin, requireAdmin, asyncHandler(eventController.destroy));
router.post('/admin/events/:id/restore', requireLogin, requireAdmin, asyncHandler(eventController.restore));
router.get('/admin/events/:id/participants', requireLogin, requireAdmin, asyncHandler(adminController.participants));
router.get('/admin/events/:id/attendance', requireLogin, requireAdmin, asyncHandler(adminController.attendance));
router.get('/admin/events/:id/attendance.csv', requireLogin, requireAdmin, asyncHandler(adminController.attendanceCsv));
router.post('/admin/registrations/:id/status', requireLogin, requireAdmin, asyncHandler(adminController.updateStatus));
router.get('/admin/registrations/:id/history', requireLogin, requireAdmin, asyncHandler(adminController.registrationHistory));

// Attendance check-in (physical attendance, separate from registration)
router.post('/admin/attendance/:registrationId', requireLogin, requireAdmin, asyncHandler(adminController.toggleAttendance));

// Audit trail
router.get('/admin/audit', requireLogin, requireAdmin, asyncHandler(adminController.auditIndex));

// Venue master data
router.get('/admin/venues', requireLogin, requireAdmin, asyncHandler(adminController.venues));
router.post('/admin/venues', requireLogin, requireAdmin, asyncHandler(adminController.createVenue));
router.post('/admin/venues/:id/delete', requireLogin, requireAdmin, asyncHandler(adminController.deleteVenue));

// Admin user management
router.get('/admin/users', requireLogin, requireAdmin, asyncHandler(adminController.users));
router.post('/admin/users/:id/role', requireLogin, requireAdmin, asyncHandler(adminController.updateUserRole));
router.post('/admin/users/:id/reset-password', requireLogin, requireAdmin, asyncHandler(adminController.adminResetPassword));

module.exports = router;

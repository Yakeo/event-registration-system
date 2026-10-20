/**
 * routes/index.js
 * URL map -> controller actions (classic MVC routing table).
 */
const express = require('express');
const router = express.Router();

const { eventController } = require('../controllers/eventController');
const registrationController = require('../controllers/registrationController');
const authController = require('../controllers/authController');
const adminController = require('../controllers/adminController');
const { requireLogin, requireAdmin, asyncHandler } = require('../middlewares/auth');

/* ------------------------------- PUBLIC ---------------------------------- */
router.get('/', asyncHandler(eventController.publicList));              // public event listing page
router.get('/events/:id', asyncHandler(eventController.show));          // event detail + registration form

/* --------------------------- REGISTRATION FLOW ---------------------------- */
router.post('/events/:id/register', asyncHandler(registrationController.store));      // online registration
router.post('/events/:id/waitlist', asyncHandler(registrationController.waitlist));   // join waiting list (event full)
router.post('/registrations/:id/cancel', requireLogin, asyncHandler(registrationController.cancel));

/* --------------------------------- AUTH ---------------------------------- */
router.get('/register', authController.showRegister);
router.post('/register', asyncHandler(authController.register));
router.get('/login', authController.showLogin);
router.post('/login', asyncHandler(authController.login));
router.post('/logout', authController.logout);
router.get('/my-registrations', requireLogin, asyncHandler(authController.myRegistrations));

// Forgot & Reset Password
router.get('/forgot-password', authController.showForgotPassword);
router.post('/forgot-password', asyncHandler(authController.forgotPassword));
router.get('/reset-password/:token', asyncHandler(authController.showResetPassword));
router.post('/reset-password/:token', asyncHandler(authController.resetPassword));

// Change Password (authenticated user)
router.get('/change-password', requireLogin, authController.showChangePassword);
router.post('/change-password', requireLogin, asyncHandler(authController.changePassword));

/* ------------------------ ADMIN (create/edit/delete) ---------------------- */
router.get('/admin', requireLogin, requireAdmin, asyncHandler(adminController.dashboard));

router.get('/admin/events', requireLogin, requireAdmin, asyncHandler(eventController.adminIndex));
router.get('/admin/events/new', requireLogin, requireAdmin, eventController.showCreateForm);
router.post('/admin/events', requireLogin, requireAdmin, asyncHandler(eventController.create));
router.get('/admin/events/:id/edit', requireLogin, requireAdmin, asyncHandler(eventController.showEditForm));
router.put('/admin/events/:id', requireLogin, requireAdmin, asyncHandler(eventController.update));
router.delete('/admin/events/:id', requireLogin, requireAdmin, asyncHandler(eventController.destroy));
router.get('/admin/events/:id/participants', requireLogin, requireAdmin, asyncHandler(adminController.participants));
router.get('/admin/events/:id/attendance', requireLogin, requireAdmin, asyncHandler(adminController.attendance));
router.get('/admin/events/:id/attendance.csv', requireLogin, requireAdmin, asyncHandler(adminController.attendanceCsv));
router.post('/admin/registrations/:id/status', requireLogin, requireAdmin, asyncHandler(adminController.updateStatus));

// Admin user management
router.get('/admin/users', requireLogin, requireAdmin, asyncHandler(adminController.users));
router.post('/admin/users/:id/role', requireLogin, requireAdmin, asyncHandler(adminController.updateUserRole));
router.post('/admin/users/:id/reset-password', requireLogin, requireAdmin, asyncHandler(adminController.adminResetPassword));

module.exports = router;

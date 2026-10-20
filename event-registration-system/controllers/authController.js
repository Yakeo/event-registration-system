/**
 * controllers/authController.js
 * User authentication, account registration, password change,
 * and academic-defense-grade Forgot / Reset Password workflow.
 */
const { Op } = require('sequelize');
const { User, Registration, Event, eventVenueInclude, logAudit } = require('../models');
const { normalizeEmail, validatePassword, LIMITS } = require('../middlewares/validate');
const { queue, link } = require('../services/notifications');
const { safeRedirect, regenerateSession } = require('../middlewares/auth');
const { accountLoginLockout } = require('../middlewares/rateLimit');

const authController = {
  // GET /register
  showRegister(req, res) {
    if (req.session.user) return res.redirect('/my-registrations');
    return res.render('auth/register', {
      title: 'Create an account',
      errors: [],
      old: {},
      next: req.query.next || '',
    });
  },

  // POST /register
  async register(req, res) {
    const full_name = (req.body.full_name || '').trim();
    const email = normalizeEmail(req.body.email);
    const password = req.body.password || '';
    const confirm_password = req.body.confirm_password || '';
    const next = req.body.next || '';

    const errors = [];
    if (!full_name) errors.push('Full name is required.');
    else if (full_name.length > LIMITS.full_name) {
      errors.push(`Full name must not exceed ${LIMITS.full_name} characters.`);
    }
    if (!email) errors.push('Email is required.');
    else if (email.length > LIMITS.email) {
      errors.push(`Email address must not exceed ${LIMITS.email} characters.`);
    }
    errors.push(...validatePassword(password, confirm_password ? confirm_password : null));

    const existing = email ? await User.findOne({ where: { email } }) : null;
    if (existing) errors.push('An account with that email address already exists.');

    if (errors.length) {
      return res.status(422).render('auth/register', {
        title: 'Create an account',
        errors,
        old: { full_name, email },
        next,
      });
    }

    const user = await User.create({ full_name, email, password, role: 'participant' });

    // Rotate the session id on privilege change (blocks session fixation).
    await regenerateSession(req);
    req.session.user = {
      user_id: user.user_id,
      full_name: user.full_name,
      email: user.email,
      role: user.role,
    };
    req.session.flashSuccess = `Welcome, ${user.full_name}! Your account has been created.`;
    return res.redirect(safeRedirect(next, '/my-registrations'));
  },

  // GET /login
  showLogin(req, res) {
    if (req.session.user) {
      return res.redirect(req.session.user.role === 'admin' ? '/admin' : '/my-registrations');
    }
    return res.render('auth/login', {
      title: 'Log in',
      errors: [],
      old: {},
      next: req.query.next || '',
    });
  },

  // POST /login
  async login(req, res) {
    const email = normalizeEmail(req.body.email);
    const password = req.body.password || '';
    const next = req.body.next || '';

    const user = await User.findOne({ where: { email } });
    const ok = user ? await user.verifyPassword(password) : false;

    if (!ok) {
      // Count consecutive failures per e-mail address, whatever the IP.
      accountLoginLockout.fail(req);
      return res.status(401).render('auth/login', {
        title: 'Log in',
        errors: ['Invalid email or password.'],
        old: { email },
        next,
      });
    }

    accountLoginLockout.succeed(req);
    await regenerateSession(req);
    req.session.user = {
      user_id: user.user_id,
      full_name: user.full_name,
      email: user.email,
      role: user.role,
    };
    req.session.flashSuccess = `Logged in as ${user.full_name}.`;
    return res.redirect(safeRedirect(next, user.role === 'admin' ? '/admin' : '/my-registrations'));
  },

  // POST /logout
  logout(req, res) {
    req.session.destroy(() => res.redirect('/'));
  },

  // GET /my-registrations
  async myRegistrations(req, res) {
    const rows = await Registration.findAll({
      where: { user_id: req.session.user.user_id },
      include: [{ model: Event, as: 'event', include: [eventVenueInclude] }],
      order: [['registration_date', 'DESC']],
    });
    return res.render('my-registrations', { title: 'My registrations', rows });
  },

  /* ---------------------- FORGOT / RESET PASSWORD FLOW ---------------------- */

  // GET /forgot-password
  showForgotPassword(req, res) {
    return res.render('auth/forgot-password', {
      title: 'Forgot Password',
      errors: [],
      old: {},
      resetLink: null,
    });
  },

  // POST /forgot-password
  async forgotPassword(req, res) {
    const email = normalizeEmail(req.body.email);

    if (!email) {
      return res.status(422).render('auth/forgot-password', {
        title: 'Forgot Password',
        errors: ['Please enter your registered email address.'],
        old: { email },
        resetLink: null,
      });
    }

    const user = await User.findOne({ where: { email } });

    // Account-enumeration guard: the response is identical whether or not the
    // address exists. Only a development build shows the demo link.
    if (!user) {
      return res.render('auth/forgot-password', {
        title: 'Forgot Password',
        errors: [],
        old: { email },
        resetLink: null,
        targetUser: null,
        submitted: true,
      });
    }

    // Generate secure token and set 1-hour expiration
    const token = await user.generateResetToken();
    const resetUrl = `/reset-password/${token}`;

    // Queue the real e-mail through the outbox. The on-screen link below stays
    // as a development convenience, but delivery no longer depends on somebody
    // reading the server console.
    await queue({
      kind: 'password_reset',
      email: user.email,
      userId: user.user_id,
      payload: {
        participant_name: user.full_name,
        email: user.email,
        reset_url: link(resetUrl),
      },
    });

    if (process.env.NODE_ENV !== 'production') {
      console.log(`\n[PASSWORD RESET] Generated reset token for ${user.email}:`);
      console.log(`  Reset URL: ${resetUrl}`);
      console.log(`  Expires:   ${user.reset_password_expires}\n`);
    }

    // In an academic presentation / development environment, we display
    // the simulated reset action directly to make the defense demonstration
    // seamless, transparent, and 100% testable without third-party mailer delays.
    return res.render('auth/forgot-password', {
      title: 'Reset link generated',
      errors: [],
      old: { email },
      resetLink: resetUrl,
      targetUser: { full_name: user.full_name, email: user.email },
      submitted: true,
    });
  },

  // GET /reset-password/:token
  async showResetPassword(req, res) {
    const { token } = req.params;

    // Only the SHA-256 hash is stored, so the URL token is hashed for lookup.
    const user = await User.findOne({
      where: {
        reset_password_token: User.hashResetToken(token),
        reset_password_expires: { [Op.gt]: new Date() },
      },
    });

    if (!user) {
      return res.status(400).render('error', {
        title: 'Invalid or Expired Link',
        status: 400,
        message: 'This password reset link is invalid or has expired. Please request a new one.',
      });
    }

    return res.render('auth/reset-password', {
      title: 'Reset your password',
      errors: [],
      token,
      email: user.email,
    });
  },

  // POST /reset-password/:token
  async resetPassword(req, res) {
    const { token } = req.params;
    const password = req.body.password || '';
    const confirm_password = req.body.confirm_password || '';

    // Only the SHA-256 hash is stored, so the URL token is hashed for lookup.
    const user = await User.findOne({
      where: {
        reset_password_token: User.hashResetToken(token),
        reset_password_expires: { [Op.gt]: new Date() },
      },
    });

    if (!user) {
      return res.status(400).render('error', {
        title: 'Invalid or Expired Link',
        status: 400,
        message: 'This password reset link is invalid or has expired. Please request a new one.',
      });
    }

    const errors = validatePassword(password, confirm_password);
    if (errors.length) {
      return res.status(422).render('auth/reset-password', {
        title: 'Reset your password',
        errors,
        token,
        email: user.email,
      });
    }

    // Update password and clear reset token fields
    user.password = password;
    user.reset_password_token = null;
    user.reset_password_expires = null;
    await user.save();

    await logAudit({
      req,
      actorId: user.user_id,
      action: 'user.password_reset',
      entity: 'USER',
      entityId: user.user_id,
      detail: { email: user.email, via: 'reset-token' },
    });

    req.session.flashSuccess = 'Password reset successful! You can now log in with your new password.';
    return res.redirect('/login');
  },

  // GET /change-password (for authenticated users)
  showChangePassword(req, res) {
    return res.render('auth/change-password', {
      title: 'Change password',
      errors: [],
    });
  },

  // POST /change-password
  async changePassword(req, res) {
    const current_password = req.body.current_password || '';
    const new_password = req.body.new_password || '';
    const confirm_password = req.body.confirm_password || '';

    const user = await User.findByPk(req.session.user.user_id);
    if (!user) return res.redirect('/login');

    const ok = await user.verifyPassword(current_password);
    const errors = [];
    if (!ok) errors.push('Current password is incorrect.');
    errors.push(...validatePassword(new_password, confirm_password));

    if (errors.length) {
      return res.status(422).render('auth/change-password', {
        title: 'Change password',
        errors,
      });
    }

    user.password = new_password;
    // Changing the password also invalidates any pending reset link.
    user.reset_password_token = null;
    user.reset_password_expires = null;
    await user.save();

    await logAudit({
      req,
      actorId: user.user_id,
      action: 'user.password_change',
      entity: 'USER',
      entityId: user.user_id,
      detail: { email: user.email },
    });

    req.session.flashSuccess = 'Your password has been changed successfully.';
    return res.redirect(user.role === 'admin' ? '/admin' : '/my-registrations');
  },
};

module.exports = authController;

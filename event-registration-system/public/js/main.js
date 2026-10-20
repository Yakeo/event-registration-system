/* public/js/main.js
 * Progressive enhancement only - the server is the source of truth.
 *
 * CSP note: this file exists so the pages can ship with
 * `script-src 'self'` (no inline <script>, no onclick/onsubmit attributes).
 *   data-confirm="question"   -> ask before submitting the form
 *   data-print                -> window.print()
 *   data-autosubmit           -> submit the form when this control changes
 */
(function () {
  'use strict';

  /* ------------------------------ confirm forms ---------------------------- */
  document.querySelectorAll('form[data-confirm]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      if (!window.confirm(form.getAttribute('data-confirm'))) {
        e.preventDefault();
      }
    });
  });

  /* --------------------------------- print -------------------------------- */
  document.querySelectorAll('[data-print]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      window.print();
    });
  });

  /* ------------------------------ auto-submit ----------------------------- */
  document.querySelectorAll('[data-autosubmit]').forEach(function (control) {
    control.addEventListener('change', function () {
      if (control.form) control.form.submit();
    });
  });

  /* --------------------------- registration form --------------------------- */
  var form = document.getElementById('registrationForm');
  if (!form) return;

  var emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  form.addEventListener('submit', function (e) {
    var name = document.getElementById('full_name');
    var email = document.getElementById('email');
    var problems = [];

    if (!name.value.trim()) problems.push('Participant name is required.');
    if (!email.value.trim()) {
      problems.push('Email address is required.');
    } else if (!emailRe.test(email.value.trim())) {
      problems.push('Please enter a valid email address.');
    }

    if (problems.length) {
      e.preventDefault();
      var box = form.querySelector('.client-errors');
      if (!box) {
        box = document.createElement('div');
        box.className = 'alert alert-error client-errors';
        form.prepend(box);
      }
      box.textContent = 'Please fix the following: ' + problems.join(' ');
      box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });
})();

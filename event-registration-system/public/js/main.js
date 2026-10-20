/* public/js/main.js - light client-side validation (progressive enhancement) */
(function () {
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
      box.innerHTML =
        '<strong>Please fix the following:</strong><ul>' +
        problems.map(function (p) { return '<li>' + p + '</li>'; }).join('') +
        '</ul>';
      box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });
})();

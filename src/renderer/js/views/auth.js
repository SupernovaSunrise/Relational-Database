(function () {
  'use strict';

  function renderLogin(container) {
    container.innerHTML =
      '<div class="auth-card">' +
        '<h2>DME Checkout Login</h2>' +
        '<form id="login-form" novalidate>' +
          '<div class="form-group">' +
            '<label for="login-username">Username</label>' +
            '<input type="text" id="login-username" autocomplete="username" required>' +
          '</div>' +
          '<div class="form-group">' +
            '<label for="login-password">Password</label>' +
            '<input type="password" id="login-password" autocomplete="current-password" required>' +
          '</div>' +
          '<button type="submit" class="btn btn-block">Log In</button>' +
        '</form>' +
      '</div>';

    var form = container.querySelector('#login-form');
    var usernameInput = container.querySelector('#login-username');
    var passwordInput = container.querySelector('#login-password');

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var username = usernameInput.value.trim();
      var password = passwordInput.value;
      if (!username || !password) {
        App.flash('Username and password are required.', 'error');
        return;
      }
      window.dme.authLogin(username, password).then(function (res) {
        if (res && res.ok) {
          return App.refreshSession().then(function () {
            App.flash('Logged in successfully.', 'success');
            App.navigate('master');
          });
        }
        App.flash((res && res.error) || 'Invalid username or password.', 'error');
        passwordInput.value = '';
        passwordInput.focus();
      });
    });

    usernameInput.focus();
  }

  function renderRegister(container) {
    container.innerHTML =
      '<div class="auth-card">' +
        '<h2>Create Admin Account</h2>' +
        '<p class="auth-subtitle">This is the first time the application is running. Create an administrator account to get started.</p>' +
        '<form id="register-form" novalidate>' +
          '<div class="form-group">' +
            '<label for="register-username">Username</label>' +
            '<input type="text" id="register-username" autocomplete="username" required>' +
          '</div>' +
          '<div class="form-group">' +
            '<label for="register-password">Password</label>' +
            '<input type="password" id="register-password" autocomplete="new-password" required>' +
            '<small>Minimum 8 characters</small>' +
          '</div>' +
          '<div class="form-group">' +
            '<label for="register-confirm">Confirm Password</label>' +
            '<input type="password" id="register-confirm" autocomplete="new-password" required>' +
            '<small id="register-confirm-error" class="error-text" hidden>Passwords do not match</small>' +
          '</div>' +
          '<button type="submit" class="btn btn-block">Create Account</button>' +
        '</form>' +
      '</div>';

    var form = container.querySelector('#register-form');
    var usernameInput = container.querySelector('#register-username');
    var passwordInput = container.querySelector('#register-password');
    var confirmInput = container.querySelector('#register-confirm');
    var confirmError = container.querySelector('#register-confirm-error');

    function checkPasswordMatch() {
      var pw = passwordInput.value;
      var cf = confirmInput.value;
      if (cf && pw !== cf) {
        confirmError.hidden = false;
      } else {
        confirmError.hidden = true;
      }
    }
    passwordInput.addEventListener('input', checkPasswordMatch);
    confirmInput.addEventListener('input', checkPasswordMatch);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var username = usernameInput.value.trim();
      var password = passwordInput.value;
      var confirm = confirmInput.value;
      if (username.length < 3) {
        App.flash('Username must be at least 3 characters.', 'error');
        return;
      }
      if (password.length < 8) {
        App.flash('Password must be at least 8 characters.', 'error');
        return;
      }
      if (password !== confirm) {
        App.flash('Passwords do not match.', 'error');
        return;
      }
      window.dme.authRegister(username, password).then(function (res) {
        if (res && res.ok) {
          App.flash(res.message || 'Account created successfully.', 'success');
          return window.dme.authLogin(username, password).then(function (loginRes) {
            if (loginRes && loginRes.ok) {
              return App.refreshSession().then(function () {
                App.navigate('master');
              });
            }
            App.navigate('login');
          });
        }
        App.flash((res && res.error) || 'Failed to create account.', 'error');
      });
    });

    usernameInput.focus();
  }

  function init(container, params) {
    if ((params.mode || 'login') === 'register' || App.isFirstRun()) {
      renderRegister(container);
    } else {
      renderLogin(container);
    }
  }

  window.AppViews = window.AppViews || {};
  window.AppViews.login = { init: init };
  window.AppViews.register = { init: init };
})();

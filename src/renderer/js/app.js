(function () {
  'use strict';

  var state = { user: null, isFirstRun: false };

  var nav = document.getElementById('app-nav');
  var navUser = document.getElementById('nav-user');
  var logoutBtn = document.getElementById('logout-btn');
  var flashContainer = document.getElementById('flash-container');
  var viewContainer = document.getElementById('view-container');

  function todayIso() {
    var now = new Date();
    var y = now.getFullYear();
    var m = String(now.getMonth() + 1).padStart(2, '0');
    var d = String(now.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }

  function normalizePhone(value) {
    return String(value == null ? '' : value).replace(/\D/g, '');
  }

  function formatPhone(value) {
    var digits = normalizePhone(value);
    if (digits.length === 11 && digits.charAt(0) === '1') digits = digits.slice(1);
    if (digits.length !== 10) return String(value == null ? '' : value);
    return '(' + digits.slice(0, 3) + ') ' + digits.slice(3, 6) + '-' + digits.slice(6);
  }

  function escapeHtml(text) {
    return String(text == null ? '' : text).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function flash(message, type) {
    if (!message) return;
    var div = document.createElement('div');
    div.className = 'alert ' + (type === 'error' ? 'alert-error' : 'alert-success');
    div.textContent = message;
    flashContainer.appendChild(div);
    setTimeout(function () {
      if (div.parentNode) div.parentNode.removeChild(div);
    }, 8000);
  }

  var currentTeardown = null;

  function showView(name, params) {
    if (currentTeardown) {
      var teardown = currentTeardown;
      currentTeardown = null;
      try {
        teardown();
      } catch (err) {
        console.error('View teardown error:', err);
      }
    }
    var view = window.AppViews && window.AppViews[name];
    viewContainer.innerHTML = '';
    if (!view) {
      viewContainer.innerHTML = '<p>Unknown view.</p>';
      return;
    }
    try {
      view.init(viewContainer, params || {});
    } catch (err) {
      console.error('View render error:', err);
      viewContainer.innerHTML = '<p>Failed to render view.</p>';
    }
  }

  function parseHash() {
    var raw = window.location.hash.replace(/^#\/?/, '');
    var qIndex = raw.indexOf('?');
    var path = qIndex === -1 ? raw : raw.slice(0, qIndex);
    var params = {};
    if (qIndex !== -1) {
      new URLSearchParams(raw.slice(qIndex + 1)).forEach(function (value, key) {
        params[key] = value;
      });
    }
    return { view: path, params: params };
  }

  function applyRoute() {
    var parsed = parseHash();
    var view = parsed.view;
    var params = parsed.params;
    if (!view) view = state.isFirstRun ? 'register' : state.user ? 'master' : 'login';
    if (state.isFirstRun && view !== 'register') view = 'register';
    else if (!state.isFirstRun && !state.user && view !== 'login') view = 'login';
    else if (state.user && (view === 'login' || view === 'register')) view = 'master';
    if (view !== parseHash().view) {
      window.location.hash = '#/' + view;
      return;
    }
    showView(view, params);
  }

  function navigate(view, params) {
    var hash = '#/' + view;
    if (params) {
      var keys = Object.keys(params).filter(function (k) {
        return params[k] !== undefined && params[k] !== null && params[k] !== '';
      });
      if (keys.length) {
        hash += '?' + keys.map(function (k) {
          return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
        }).join('&');
      }
    }
    window.location.hash = hash;
  }

  function updateNav() {
    var hasUser = !!state.user;
    if (nav) nav.hidden = !hasUser;
    if (navUser) navUser.textContent = hasUser ? state.user.username : '';
  }

  function refreshSession() {
    return window.dme.appGetStatus().then(function (res) {
      if (res && res.ok) {
        state.isFirstRun = !!res.isFirstRun;
        state.user = res.user || null;
      }
      updateNav();
      return res;
    });
  }

  function logout() {
    return window.dme.authLogout().then(function (res) {
      if (res && res.ok) flash('You have been logged out.', 'success');
      else if (res && !res.ok && res.error && res.error !== 'Not authenticated.') flash(res.error, 'error');
      return refreshSession();
    }).then(function () {
      navigate('login');
    });
  }

  function initInlineEditing(root, onSave) {
    root.addEventListener('focus', function (e) {
      var cell = e.target && e.target.closest ? e.target.closest('td[contenteditable="true"]') : null;
      if (cell) cell.dataset.originalValue = cell.textContent.trim();
    }, true);

    root.addEventListener('keydown', function (e) {
      var cell = e.target && e.target.closest ? e.target.closest('td[contenteditable="true"]') : null;
      if (cell && e.key === 'Enter') {
        e.preventDefault();
        cell.blur();
      }
    }, true);

    root.addEventListener('blur', function (e) {
      var cell = e.target && e.target.closest ? e.target.closest('td[contenteditable="true"]') : null;
      if (!cell) return;
      var original = cell.dataset.originalValue || '';
      var value = cell.textContent.trim();
      if (cell.dataset.field === 'phone') {
        value = formatPhone(value);
        cell.textContent = value;
      }
      if (value === original) return;
      var table = cell.dataset.table;
      var field = cell.dataset.field;
      var rowId = cell.dataset.rowId;
      var promise;
      if (table === 'equipment') {
        promise = window.dme.equipmentInlineUpdate(rowId, field, value);
      } else if (table === 'customers') {
        promise = window.dme.customersInlineUpdate(Number(rowId), field, value);
      } else if (table === 'loans') {
        promise = window.dme.loansInlineUpdate(Number(rowId), field, value);
      } else {
        return;
      }
      promise.then(function (res) {
        if (res && res.ok) {
          if (onSave) onSave();
        } else {
          cell.textContent = original;
          flash((res && res.error) || 'Update failed.', 'error');
        }
      });
    }, true);
  }

  document.addEventListener('focusout', function (e) {
    var el = e.target;
    if (el && el.matches && el.matches('input[data-phone]')) el.value = formatPhone(el.value);
  });

  function boot() {
    if (!window.dme) {
      viewContainer.innerHTML = '<p>Renderer bridge unavailable.</p>';
      return;
    }
    refreshSession().then(function () {
      window.addEventListener('hashchange', applyRoute);
      if (logoutBtn) logoutBtn.addEventListener('click', logout);
      applyRoute();
    });
  }

  window.App = {
    getUser: function () { return state.user; },
    isAdmin: function () { return !!(state.user && (state.user.isAdmin === true || state.user.isAdmin === 1)); },
    isFirstRun: function () { return state.isFirstRun; },
    refreshSession: refreshSession,
    flash: flash,
    todayIso: todayIso,
    normalizePhone: normalizePhone,
    formatPhone: formatPhone,
    escapeHtml: escapeHtml,
    navigate: navigate,
    logout: logout,
    initInlineEditing: initInlineEditing,
    setTeardown: function (fn) { currentTeardown = fn; },
  };

  document.addEventListener('DOMContentLoaded', boot);
})();

(function () {
  'use strict';

  var Shared = window.AgreementShared || {};
  var TERMS = Shared.TERMS || '';
  var container = document.getElementById('sign-container');
  var flashContainer = document.getElementById('sign-flash');
  var pad = null;
  var submitted = false;

  function esc(text) {
    if (Shared.escapeHtml) return Shared.escapeHtml(text);
    return String(text == null ? '' : text).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function todayIso() {
    if (Shared.todayIso) return Shared.todayIso();
    var now = new Date();
    var y = now.getFullYear();
    var m = String(now.getMonth() + 1).padStart(2, '0');
    var d = String(now.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }

  function flash(message, type) {
    if (!message || !flashContainer) return;
    var div = document.createElement('div');
    div.className = 'sign-alert ' + (type === 'error' ? 'sign-alert-error' : 'sign-alert-ok');
    div.textContent = message;
    flashContainer.appendChild(div);
    setTimeout(function () {
      if (div.parentNode) div.parentNode.removeChild(div);
    }, type === 'error' ? 12000 : 6000);
  }

  function renderAgreement(context) {
    var customer = context.customer || {};
    var items = context.items || [];
    var rows = items.map(function (item) {
      return '<tr>' +
        '<td>' + esc(item.equipment_id) + (item.item_name ? ' — ' + esc(item.item_name) : '') + '</td>' +
        '<td>' + esc(item.due_date || context.returnBy || '') + '</td>' +
      '</tr>';
    }).join('');

    container.innerHTML =
      '<div class="card" id="agreement-card"><div class="card-body">' +
        '<p><strong>Customer:</strong> ' + esc(customer.name) + (customer.phone ? ' (' + esc(customer.phone) + ')' : '') + '</p>' +
        '<p><strong>Zip:</strong> ' + esc(customer.zip_code || '') + '</p>' +
        '<p><strong>Checked Out:</strong> ' + esc(context.checkoutDate || todayIso()) + '</p>' +
        '<p><strong>Return By:</strong> ' + esc(context.returnBy || '') + ' <span class="sign-hint">(' + esc(context.checkoutPeriodDays || 120) + ' days)</span></p>' +
        (context.witnessName ? '<p><strong>Witnessed By:</strong> ' + esc(context.witnessName) + '</p>' : '') +
        '<h2>Equipment on This Agreement</h2>' +
        '<table class="equip-table sign-equip-table">' +
          '<thead><tr><th>Equipment</th><th>Return By</th></tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table>' +
        '<h2>General Terms of Use and Loan Agreement</h2>' +
        '<div class="terms-text sign-terms">' + TERMS + '</div>' +
        '<form id="sign-form" novalidate>' +
          '<div class="sign-check">' +
            '<input class="sign-check-input" type="checkbox" id="waiver_agreed">' +
            '<label class="sign-check-label" for="waiver_agreed">I agree to the General Terms of Use and Loan Agreement</label>' +
          '</div>' +
          '<div>' +
            '<h3>Signature (optional)</h3>' +
            '<div class="sig-box sign-sig-box">' +
              '<canvas id="sigCanvas" width="900" height="300" aria-label="Signature pad"></canvas>' +
            '</div>' +
            '<button type="button" class="btn btn-secondary" id="sig-clear-btn">Clear Signature</button>' +
          '</div>' +
          '<div class="sign-actions">' +
            '<button type="submit" class="btn btn-primary" id="sign-submit-btn">Submit Agreement</button>' +
          '</div>' +
        '</form>' +
      '</div></div>';

    var canvas = container.querySelector('#sigCanvas');
    pad = Shared.initSignaturePad ? Shared.initSignaturePad(canvas) : null;
    if (!pad) {
      var sigBox = container.querySelector('.sign-sig-box');
      if (sigBox) sigBox.classList.add('sign-sig-unavailable');
    }

    container.querySelector('#sig-clear-btn').addEventListener('click', function () {
      if (pad) pad.clear();
    });

    container.querySelector('#sign-form').addEventListener('submit', onSubmit);
  }

  function onSubmit(e) {
    e.preventDefault();
    if (submitted) return;
    var checkbox = container.querySelector('#waiver_agreed');
    var submitBtn = container.querySelector('#sign-submit-btn');
    if (!checkbox || !checkbox.checked) {
      flash('Please check the box to agree to the General Terms of Use and Loan Agreement.', 'error');
      return;
    }
    submitted = true;
    if (submitBtn) submitBtn.disabled = true;
    var signatureData = pad && pad.hasSignature() ? pad.toDataURL() : '';
    window.dme.signingSubmit(true, signatureData).then(function (res) {
      if (res && res.ok) {
        flash('Thank you. Your agreement has been recorded.', 'success');
        return;
      }
      submitted = false;
      if (submitBtn) submitBtn.disabled = false;
      flash((res && res.error) || 'Failed to save agreement. Please ask for assistance.', 'error');
    }).catch(function () {
      submitted = false;
      if (submitBtn) submitBtn.disabled = false;
      flash('Failed to save agreement. Please ask for assistance.', 'error');
    });
  }

  function renderFatal(message) {
    container.innerHTML =
      '<div class="card"><div class="card-body">' +
        '<h2>Unable to Load Agreement</h2>' +
        '<p>' + esc(message || 'Please ask staff for assistance.') + '</p>' +
      '</div></div>';
  }

  function boot() {
    if (!window.dme) {
      renderFatal('Signing is unavailable. Please ask staff for assistance.');
      return;
    }
    window.dme.signingGetContext().then(function (res) {
      if (!res || !res.ok) {
        renderFatal((res && res.error) || 'This signing session is no longer active.');
        return;
      }
      renderAgreement(res);
    }).catch(function () {
      renderFatal('Unable to load the agreement. Please ask staff for assistance.');
    });
  }

  boot();
})();
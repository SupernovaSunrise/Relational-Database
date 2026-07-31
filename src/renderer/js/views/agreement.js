(function () {
  'use strict';

  var TERMS =
    '<p>The terms and conditions described below are a contractual agreement between you and the NW MT Veterans Stand Down and Food Pantry DME Loan Program. I understand and agree that the agreement unless special arrangements are made prior to such date. I accept responsibility for equipment loaned to me. I understand that the use of any equipment is at the recipient\'s own risk. In no event will NW Montana Veterans Stand Down and Food Pantry, be liable to any direct, indirect, or other consequential damages, or injuries from the use of the DME Loan Program. I understand that I am completely responsible for the proper and safe use of all equipment loaned to me by the DME Loan Program.</p>' +
    '<p>I understand that if I am an Occupational Therapist/Physical Therapist, I am also responsible for the equipment out on loan. In either getting the equipment returned or paid for by the due date.</p>';

  function isoFromDate(date) {
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, '0');
    var d = String(date.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }

  function formatDateInput(input) {
    if (!input) return '';
    var value = input.value.trim();
    if (!value) {
      input.value = App.todayIso();
      return input.value;
    }
    var isoMatch = value.match(/^\d{4}-\d{2}-\d{2}$/);
    if (isoMatch) {
      input.value = value;
      return input.value;
    }
    var slashMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slashMatch) {
      var month = Number(slashMatch[1]);
      var day = Number(slashMatch[2]);
      var year = Number(slashMatch[3]);
      var date = new Date(year, month - 1, day);
      if (!isNaN(date.getTime())) {
        var normalized = isoFromDate(date);
        input.value = normalized;
        return normalized;
      }
    }
    return value;
  }

  function initSignaturePad(canvas) {
    var ctx = canvas.getContext('2d');
    var drawing = false;

    function getX(e) {
      return (e.touches ? e.touches[0].clientX : e.clientX) - canvas.getBoundingClientRect().left;
    }

    function getY(e) {
      return (e.touches ? e.touches[0].clientY : e.clientY) - canvas.getBoundingClientRect().top;
    }

    function pointerDown(e) {
      drawing = true;
      ctx.beginPath();
      ctx.moveTo(getX(e), getY(e));
    }

    function pointerUp() {
      drawing = false;
    }

    function pointerMove(e) {
      if (!drawing) return;
      ctx.lineTo(getX(e), getY(e));
      ctx.stroke();
    }

    canvas.addEventListener('mousedown', pointerDown);
    canvas.addEventListener('mouseup', pointerUp);
    canvas.addEventListener('mouseout', pointerUp);
    canvas.addEventListener('mousemove', pointerMove);
    canvas.addEventListener('touchstart', pointerDown);
    canvas.addEventListener('touchend', pointerUp);
    canvas.addEventListener('touchcancel', pointerUp);
    canvas.addEventListener('touchmove', function (e) {
      e.preventDefault();
      pointerMove(e);
    });

    return {
      clear: function () {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      },
      hasSignature: function () {
        var data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        for (var i = 3; i < data.length; i += 4) {
          if (data[i] !== 0) return true;
        }
        return false;
      },
      toDataURL: function () {
        return canvas.toDataURL('image/png');
      },
    };
  }

  function initSign(container, params) {
    var loanIds = String(params.loanIds || '').split(',').map(Number).filter(function (n) { return n > 0; });
    var customerId = Number(params.customerId);
    if (!loanIds.length || !customerId) {
      App.flash('Missing agreement details.', 'error');
      App.navigate('master');
      return;
    }

    container.innerHTML =
      '<h2>Customer Agreement</h2>' +
      '<div class="card" id="agreement-card"><div class="card-body"><p class="loading">Loading agreement...</p></div></div>';

    var cardBody = container.querySelector('.card-body');

    Promise.all(loanIds.map(function (id) {
      return window.dme.agreementsGetLoan(id);
    })).then(function (results) {
      var okResults = results.filter(function (r) { return r && r.ok; });
      if (!okResults.length) {
        App.flash((results[0] && results[0].error) || 'Loan not found.', 'error');
        App.navigate('master');
        return;
      }
      var first = okResults[0];
      var customer = first.customer || {};
      var items = okResults.map(function (r) { return r.item; }).filter(Boolean);
      var checkoutPeriodDays = first.checkoutPeriodDays || 120;
      var esc = App.escapeHtml;

      cardBody.innerHTML =
        '<p><strong>Customer:</strong> ' + esc(customer.name) + (customer.phone ? ' (' + esc(customer.phone) + ')' : '') + '</p>' +
        '<p><strong>Zip:</strong> ' + esc(customer.zip_code || '') + '</p>' +
        '<p class="no-print"><strong>Checkout Date:</strong> <input class="customer-info-field" type="text" id="checkout_date" value="' + esc(params.checkoutDate || first.checkoutDate || App.todayIso()) + '" placeholder="YYYY-MM-DD" autocomplete="off"></p>' +
        '<p><strong>Return By:</strong> <span id="return_by_display">' + esc(params.dueDate || first.dueDate || '') + ' (' + checkoutPeriodDays + ' days)</span></p>' +
        '<p><strong>Equipment:</strong></p>' +
        '<ul>' + items.map(function (item) {
          return '<li>' + esc(item.equipment_id) + (item.item_name ? ' — ' + esc(item.item_name) : '') + '</li>';
        }).join('') + '</ul>' +
        '<h4>General Terms of Use and Loan Agreement</h4>' +
        TERMS +
        '<form id="agreement-form" novalidate>' +
          '<div class="form-check">' +
            '<input class="form-check-input" type="checkbox" id="waiver_agreed">' +
            '<label class="form-check-label" for="waiver_agreed">I agree to the General Terms of Use and Loan Agreement</label>' +
          '</div>' +
          '<div class="form-check">' +
            '<input class="form-check-input" type="checkbox" id="signature_agreed">' +
            '<label class="form-check-label" for="signature_agreed">I acknowledge this digital signature</label>' +
          '</div>' +
          '<div>' +
            '<label>Signature:</label>' +
            '<div class="sig-box">' +
              '<canvas id="sigCanvas" width="600" height="200" aria-label="Signature pad"></canvas>' +
            '</div>' +
            '<div><button type="button" class="btn btn-secondary" id="sig-clear-btn">Clear</button></div>' +
          '</div>' +
          '<div class="agreement-actions no-print">' +
            '<button type="submit" class="btn">Save Agreement</button>' +
            '<button type="button" class="btn btn-secondary" id="agreement-cancel-btn">Cancel</button>' +
            '<button type="button" class="btn" id="agreement-print-btn">Print</button>' +
          '</div>' +
        '</form>';

      var canvas = cardBody.querySelector('#sigCanvas');
      var pad = initSignaturePad(canvas);
      var checkoutInput = cardBody.querySelector('#checkout_date');
      var returnByDisplay = cardBody.querySelector('#return_by_display');

      function updateReturnByDate() {
        if (!checkoutInput || !returnByDisplay) return;
        var raw = checkoutInput.value.trim();
        if (!raw) {
          returnByDisplay.textContent = '';
          return;
        }
        var normalized = formatDateInput(checkoutInput);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
          returnByDisplay.textContent = '';
          return;
        }
        var date = new Date(normalized + 'T00:00:00');
        if (isNaN(date.getTime())) {
          returnByDisplay.textContent = '';
          return;
        }
        date.setDate(date.getDate() + checkoutPeriodDays);
        returnByDisplay.textContent = isoFromDate(date) + ' (' + checkoutPeriodDays + ' days)';
      }

      checkoutInput.addEventListener('input', updateReturnByDate);
      checkoutInput.addEventListener('blur', updateReturnByDate);
      updateReturnByDate();

      cardBody.querySelector('#sig-clear-btn').addEventListener('click', function () {
        pad.clear();
      });

      cardBody.querySelector('#agreement-print-btn').addEventListener('click', function () {
        window.print();
      });

      cardBody.querySelector('#agreement-cancel-btn').addEventListener('click', function () {
        window.dme.loansCancelPending(loanIds).then(function (res) {
          App.flash((res && (res.message || (res.ok ? 'Checkout cancelled and pending items removed.' : res.error))) || 'Failed to cancel checkout.', res && res.ok ? 'success' : 'error');
          App.navigate('master');
        });
      });

      cardBody.querySelector('#agreement-form').addEventListener('submit', function (e) {
        e.preventDefault();
        var waiverAgreed = cardBody.querySelector('#waiver_agreed').checked;
        var signatureAgreed = cardBody.querySelector('#signature_agreed').checked;
        if (!waiverAgreed || !signatureAgreed) {
          App.flash('You must agree to both the waiver and digital signature acknowledgement.', 'error');
          return;
        }
        if (!pad.hasSignature()) {
          App.flash('Please provide a digital signature.', 'error');
          return;
        }
        var checkoutDate = formatDateInput(checkoutInput) || App.todayIso();
        var payload = {
          customerId: customerId,
          loanIds: loanIds,
          checkoutDate: checkoutDate,
          agreementDate: App.todayIso(),
          waiverAgreed: waiverAgreed,
          signatureAgreed: signatureAgreed,
          signatureData: pad.toDataURL(),
        };
        window.dme.agreementsSubmit(payload).then(function (res) {
          if (res && res.ok) {
            App.flash(res.message || 'Customer agreement recorded successfully.', 'success');
            App.navigate('master');
          } else {
            App.flash((res && res.error) || 'Failed to save agreement.', 'error');
          }
        });
      });
    });
  }

  function initView(container, params) {
    var customerId = Number(params.customerId);
    if (!customerId) {
      App.flash('Missing customer id.', 'error');
      App.navigate('master');
      return;
    }

    container.innerHTML =
      '<h2>Signed Customer Agreement</h2>' +
      '<div class="card" id="agreement-card"><div class="card-body"><p class="loading">Loading agreement...</p></div></div>';

    var cardBody = container.querySelector('.card-body');

    window.dme.agreementsGetCustomer(customerId).then(function (res) {
      if (!container) return;
      if (!res || !res.ok) {
        App.flash((res && res.error) || 'No signed active agreement found for this customer.', 'error');
        App.navigate('master');
        return;
      }
      var esc = App.escapeHtml;
      cardBody.innerHTML =
        '<p><strong>Customer:</strong> ' + esc(res.customer.name) + '</p>' +
        '<p><strong>Phone:</strong> ' + esc(res.customer.phone || '') + '</p>' +
        '<p><strong>Zip:</strong> ' + esc(res.customer.zip_code || '') + '</p>' +
        '<p><strong>Most Recent Agreement Date:</strong> ' + esc(res.agreementDate || 'Not recorded') + '</p>' +
        '<h4>Equipment on This Agreement</h4>' +
        '<table>' +
          '<thead><tr><th>Equipment</th><th>Checkout Date</th><th>Return By</th></tr></thead>' +
          '<tbody>' +
          (res.items || []).map(function (item) {
            return '<tr>' +
              '<td>' + esc(item.equipment_id) + (item.item_name ? ' - ' + esc(item.item_name) : '') + '</td>' +
              '<td>' + esc(item.checked_out_date || '') + '</td>' +
              '<td>' + esc(item.due_date || '') + '</td>' +
            '</tr>';
          }).join('') +
          '</tbody>' +
        '</table>' +
        '<h4>General Terms of Use and Loan Agreement</h4>' +
        TERMS +
        '<h4>Digital Signature</h4>' +
        (res.signatureData
          ? '<img class="sig-img" src="' + esc(res.signatureData) + '" alt="Customer signature">'
          : '<p>No signature saved.</p>') +
        '<div class="agreement-actions no-print">' +
          '<button type="button" class="btn" id="agreement-print-btn">Print</button>' +
          '<a class="btn" href="#/master">Back to Home</a>' +
        '</div>';

      var printBtn = cardBody.querySelector('#agreement-print-btn');
      if (printBtn) {
        printBtn.addEventListener('click', function () {
          window.print();
        });
      }
    });
  }

  function init(container, params) {
    if ((params.mode || 'sign') === 'view') {
      initView(container, params);
    } else {
      initSign(container, params);
    }
  }

  window.AppViews = window.AppViews || {};
  window.AppViews.agreement = { init: init };
})();

(function () {
  'use strict';

  var module = {
    reportType: 'analytics',
    yearFilter: '',
    monthFilter: '',
    dateFrom: '',
    dateTo: '',
  };
  var container = null;
  var renderToken = 0;

  function load() {
    if (!container) return;
    var results = container.querySelector('#report-results');
    var token = renderToken;
    var payload = {
      reportType: module.reportType,
      yearFilter: module.yearFilter,
      monthFilter: module.monthFilter,
      dateFrom: module.dateFrom,
      dateTo: module.dateTo,
    };
    window.dme.reportsGetData(payload).then(function (res) {
      if (!container || token !== renderToken) return;
      if (!res || !res.ok) {
        results.innerHTML = '<p class="error-text">Failed to load report.</p>';
        App.flash((res && res.error) || 'Failed to load report.', 'error');
        return;
      }
      module.monthFilter = res.monthFilter || '';
      renderYears(res.years || []);
      renderResults(res);
    });
  }

  function renderYears(years) {
    var select = container.querySelector('#report-year');
    var current = module.yearFilter;
    var options = '<option value="">All Years</option>';
    (years || []).forEach(function (year) {
      options += '<option value="' + App.escapeHtml(year) + '"' + (String(year) === String(current) ? ' selected' : '') + '>' + App.escapeHtml(year) + '</option>';
    });
    select.innerHTML = options;
  }

  function renderResults(res) {
    var results = container.querySelector('#report-results');
    var esc = App.escapeHtml;
    var yearSuffix = module.yearFilter ? ' - ' + module.yearFilter : '';
    var html = '<h2>' + esc(res.reportTitle || '') + yearSuffix + '</h2>';

    if (module.reportType === 'analytics') {
      if (res.analyticsSummary) {
        var summary = res.analyticsSummary;
        html +=
          '<div class="analytics-box">' +
            '<h3>Checkout Summary</h3>' +
            '<div class="analytics-grid">' +
              '<div class="analytics-stat"><div class="analytics-stat-value">' + summary.total_checkouts + '</div><div class="analytics-stat-label">Total Checkouts</div></div>' +
              '<div class="analytics-stat"><div class="analytics-stat-value">' + summary.unique_guests + '</div><div class="analytics-stat-label">Unique Guests</div></div>' +
              '<div class="analytics-stat"><div class="analytics-stat-value">' + Number(summary.avg_per_day || 0).toFixed(1) + '</div><div class="analytics-stat-label">Avg Checkouts/Day</div></div>' +
            '</div>' +
          '</div>';
      }

      var months = res.analyticsMonths || [];
      html += '<div class="analytics-box">';
      html += '<h3>Guests Per Day</h3>';
      if (months.length) {
        html +=
          '<div class="month-filter-row">' +
            '<label for="report-month"><strong>Month:</strong></label>' +
            '<select id="report-month">' +
            months.map(function (month) {
              return '<option value="' + esc(month) + '"' + (month === module.monthFilter ? ' selected' : '') + '>' + esc(month) + '</option>';
            }).join('') +
            '</select>' +
          '</div>';
      }
      var daily = res.dailyGuests || [];
      if (daily.length) {
        html +=
          '<table>' +
            '<thead><tr><th>Date</th><th>Guest Count</th><th>Items Checked Out</th></tr></thead>' +
            '<tbody>' +
            daily.map(function (day) {
              return '<tr><td>' + esc(day.date) + '</td><td><strong>' + day.guest_count + '</strong></td><td>' + day.item_count + '</td></tr>';
            }).join('') +
            '</tbody>' +
          '</table>';
      } else {
        html += '<p>No checkout data available for analytics.</p>';
      }
      html += '</div>';

      var monthly = res.monthlyStats || [];
      if (monthly.length) {
        html +=
          '<div class="analytics-box">' +
            '<h3>Monthly Averages</h3>' +
            '<table>' +
              '<thead><tr><th>Month</th><th>Total Guests</th><th>Total Items</th><th>Avg Guests/Day</th><th>Avg Items/Day</th></tr></thead>' +
              '<tbody>' +
              monthly.map(function (m) {
                return '<tr>' +
                  '<td>' + esc(m.month_year) + '</td>' +
                  '<td>' + m.total_guests + '</td>' +
                  '<td>' + m.total_items + '</td>' +
                  '<td>' + Number(m.avg_guests_per_day || 0).toFixed(1) + '</td>' +
                  '<td>' + Number(m.avg_items_per_day || 0).toFixed(1) + '</td>' +
                '</tr>';
              }).join('') +
              '</tbody>' +
            '</table>' +
          '</div>';
      }
    } else {
      var reportData = res.reportData || [];
      if (reportData.length) {
        var isCheckout = module.reportType === 'checkout';
        var isAdmin = App.isAdmin();
        html += '<table><thead><tr>';
        if (isCheckout) {
          html += '<th>Checkout Date</th><th>Equipment ID</th><th>Item Name</th><th>Customer ZIP Code</th><th class="col-actions">Actions</th>';
        } else {
          html += '<th>Deletion Date</th><th>Equipment ID</th><th>Item Name</th><th class="col-actions">Actions</th>';
        }
        html += '</tr></thead><tbody>';
        reportData.forEach(function (item) {
          if (isCheckout) {
            html += '<tr>' +
              '<td>' + esc(item.checkout_date) + '</td>' +
              '<td>' + esc(item.equipment_id) + '</td>' +
              '<td>' + esc(item.item_name) + '</td>' +
              '<td>' + esc(item.customer_zip_code || '') + '</td>' +
              '<td class="col-actions">' +
                (isAdmin ? '<button type="button" class="btn btn-danger" data-action="delete-checkout" data-id="' + item.id + '">Delete</button>' : '') +
              '</td>' +
            '</tr>';
          } else {
            html += '<tr>' +
              '<td>' + esc(item.deletion_date) + '</td>' +
              '<td>' + esc(item.equipment_id) + '</td>' +
              '<td>' + esc(item.item_name) + '</td>' +
              '<td class="col-actions">' +
                (isAdmin ? '<button type="button" class="btn btn-danger" data-action="delete-item-sale" data-id="' + item.id + '">Delete</button>' : '') +
              '</td>' +
            '</tr>';
          }
        });
        html += '</tbody></table>';
        html += '<p><strong>Total Records: ' + reportData.length + '</strong></p>';
      } else {
        html += '<p>No records found for the selected filters.</p>';
      }
    }

    results.innerHTML = html;

    var monthSelect = results.querySelector('#report-month');
    if (monthSelect) {
      monthSelect.addEventListener('change', function () {
        module.monthFilter = monthSelect.value;
        load();
      });
    }
  }

  function onContainerClick(e) {
    var btn = e.target.closest ? e.target.closest('[data-action]') : null;
    if (!btn) return;
    var action = btn.getAttribute('data-action');
    var id = Number(btn.getAttribute('data-id'));

    if (action === 'delete-checkout') {
      if (!window.confirm('Delete this checkout log entry?')) return;
      window.dme.reportsDeleteCheckout(id).then(function (res) {
        if (res && res.ok) {
          App.flash(res.message || 'Checkout log entry removed successfully.', 'success');
        } else {
          App.flash((res && res.error) || 'Failed to delete checkout log entry.', 'error');
        }
        load();
      });
    } else if (action === 'delete-item-sale') {
      if (!window.confirm('Delete this item sale log entry?')) return;
      window.dme.reportsDeleteItemSale(id).then(function (res) {
        if (res && res.ok) {
          App.flash(res.message || 'Item sale log entry removed successfully.', 'success');
        } else {
          App.flash((res && res.error) || 'Failed to delete item sale log entry.', 'error');
        }
        load();
      });
    }
  }

  function init(containerEl) {
    container = containerEl;
    renderToken++;
    var token = renderToken;
    module.reportType = 'analytics';
    module.yearFilter = '';
    module.monthFilter = '';
    module.dateFrom = '';
    module.dateTo = '';

    container.innerHTML =
      '<h1>Reports</h1>' +
      '<div class="tab-bar" id="report-tabs">' +
        '<button type="button" class="tab-btn active" data-tab="analytics">Analytics</button>' +
        '<button type="button" class="tab-btn" data-tab="checkout">Checkout Log</button>' +
        '<button type="button" class="tab-btn" data-tab="item_sales">Item Sales Log</button>' +
      '</div>' +
      '<div class="report-filters">' +
        '<div class="form-group">' +
          '<label for="report-year"><strong>Filter by Year:</strong></label>' +
          '<select id="report-year"></select>' +
        '</div>' +
        '<div class="form-group" id="date-from-group" hidden>' +
          '<label for="report-date-from"><strong>From:</strong></label>' +
          '<input type="date" id="report-date-from">' +
        '</div>' +
        '<div class="form-group" id="date-to-group" hidden>' +
          '<label for="report-date-to"><strong>To:</strong></label>' +
          '<input type="date" id="report-date-to">' +
        '</div>' +
        '<button type="button" class="btn" id="report-filter-btn">Filter</button>' +
        '<button type="button" class="btn print-button" id="report-print-btn">Print Report</button>' +
      '</div>' +
      '<div id="report-results"></div>';

    var tabs = container.querySelectorAll('#report-tabs .tab-btn');
    Array.prototype.forEach.call(tabs, function (tab) {
      tab.addEventListener('click', function () {
        module.reportType = tab.getAttribute('data-tab');
        module.monthFilter = '';
        module.dateFrom = '';
        module.dateTo = '';
        Array.prototype.forEach.call(tabs, function (b) { b.classList.remove('active'); });
        tab.classList.add('active');
        var dateFromInput = container.querySelector('#report-date-from');
        var dateToInput = container.querySelector('#report-date-to');
        var fromGroup = container.querySelector('#date-from-group');
        var toGroup = container.querySelector('#date-to-group');
        var showDates = module.reportType !== 'analytics';
        fromGroup.hidden = !showDates;
        toGroup.hidden = !showDates;
        if (dateFromInput) dateFromInput.value = '';
        if (dateToInput) dateToInput.value = '';
        load();
      });
    });

    var yearSelect = container.querySelector('#report-year');
    yearSelect.addEventListener('change', function () {
      module.yearFilter = yearSelect.value;
      module.monthFilter = '';
      load();
    });

    var dateFromInput = container.querySelector('#report-date-from');
    var dateToInput = container.querySelector('#report-date-to');
    container.querySelector('#report-filter-btn').addEventListener('click', function () {
      module.dateFrom = dateFromInput.value || '';
      module.dateTo = dateToInput.value || '';
      load();
    });

    container.querySelector('#report-print-btn').addEventListener('click', function () {
      window.print();
    });

    container.addEventListener('click', onContainerClick);

    window.dme.reportsGetYears().then(function (res) {
      if (!container || token !== renderToken) return;
      if (res && res.ok) renderYears(res.years || []);
    });

    load();
  }

  window.AppViews = window.AppViews || {};
  window.AppViews.reports = { init: init };
})();

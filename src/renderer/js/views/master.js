(function () {
  'use strict';

  var module = {
    rows: [],
    todayStr: '',
    search: '',
    activeTab: 'all',
    sortBy: 'equipmentId',
    sortDir: 'asc',
    dateFrom: '',
    dateTo: '',
    candidates: null,
    pendingEquipmentIds: [],
    pendingCustomerReference: null,
    container: null,
    renderToken: 0,
  };

  function getStatus(item) {
    if (item.loan_id) {
      return item.due_date && item.due_date < module.todayStr ? 'overdue' : 'checked_out';
    }
    return 'available';
  }

  function loadData() {
    return window.dme.loansGetMasterData().then(function (masterRes) {
      if (!masterRes || !masterRes.ok) {
        App.flash((masterRes && masterRes.error) || 'Failed to load equipment.', 'error');
        return false;
      }
      module.rows = masterRes.rows || [];
      module.todayStr = masterRes.todayStr || App.todayIso();
      return true;
    });
  }

  function loadAndRender() {
    var token = module.renderToken;
    return loadData().then(function (ok) {
      if (ok && token === module.renderToken) render();
    });
  }

  function renderCandidates() {
    var section = module.container.querySelector('#candidate-section');
    if (!section) return;
    if (!module.candidates || !module.candidates.length) {
      section.hidden = true;
      section.innerHTML = '';
      return;
    }
    section.hidden = false;
    section.innerHTML =
      '<h2>Confirm Customer Selection</h2>' +
      '<p>Multiple customers match "<strong>' + App.escapeHtml(module.pendingCustomerReference || '') + '</strong>". Select the correct customer for the selected equipment:</p>' +
      '<table>' +
        '<thead><tr><th>ID</th><th>Name</th><th>Phone</th><th>ZIP</th><th>Action</th></tr></thead>' +
        '<tbody>' +
        module.candidates.map(function (c) {
          return '<tr>' +
            '<td>' + c.id + '</td>' +
            '<td>' + App.escapeHtml(c.name) + '</td>' +
            '<td>' + App.escapeHtml(c.phone || '') + '</td>' +
            '<td>' + App.escapeHtml(c.zip_code || '') + '</td>' +
            '<td><button type="button" class="btn" data-action="candidate-select" data-customer-id="' + c.id + '">Select</button></td>' +
          '</tr>';
        }).join('') +
        '</tbody>' +
      '</table>';
  }

  function renderTabs() {
    var counts = { all: 0, checked_out: 0, available: 0, overdue: 0 };
    module.rows.forEach(function (r) {
      counts.all++;
      counts[getStatus(r)]++;
    });
    var labels = { all: 'All', checked_out: 'Checked Out', available: 'Available', overdue: 'Overdue' };
    var tabBar = module.container.querySelector('#master-tabs');
    tabBar.innerHTML = Object.keys(labels).map(function (key) {
      return '<button type="button" class="tab-btn' + (module.activeTab === key ? ' active' : '') + '" data-tab="' + key + '">' + labels[key] + ' (' + counts[key] + ')</button>';
    }).join('');
  }

  function buildRowHtml(item) {
    var status = getStatus(item);
    var esc = App.escapeHtml;
    var searchText = (
      (item.equipment_id || '') + ' ' +
      (item.item_name || '') + ' ' +
      (item.customer_name || '') + ' ' +
      (item.customer_phone || '') + ' ' +
      App.normalizePhone(item.customer_phone || '')
    ).toLowerCase();

    var actionHtml;
    if (status === 'available') {
      actionHtml = '<label class="checkbox-label"><input type="checkbox" data-action="checkout-pick" data-equipment-id="' + esc(item.equipment_id) + '" value="' + esc(item.equipment_id) + '"><span>Select</span></label>';
    } else {
      actionHtml = '';
      if (item.agreement_data) {
        actionHtml += '<button type="button" class="btn" data-action="view-agreement" data-customer-id="' + item.customer_id + '">View Agreement</button> ';
      }
      actionHtml += '<button type="button" class="btn btn-danger" data-action="return" data-loan-id="' + item.loan_id + '">Return</button>';
    }

    var customerNameCell = item.customer_name
      ? '<td contenteditable="true" data-table="customers" data-row-id="' + item.customer_id + '" data-field="name">' + esc(item.customer_name) + '</td>'
      : '<td></td>';
    var customerPhoneCell = item.customer_phone
      ? '<td contenteditable="true" data-table="customers" data-row-id="' + item.customer_id + '" data-field="phone">' + esc(item.customer_phone) + '</td>'
      : '<td></td>';
    var checkedOutCell = item.loan_id
      ? '<td contenteditable="true" data-table="loans" data-row-id="' + item.loan_id + '" data-field="checked_out_date">' + esc(item.checked_out_date || '') + '</td>'
      : '<td>' + esc(item.checked_out_date || '') + '</td>';
    var dueDateCell = item.loan_id
      ? '<td contenteditable="true" data-table="loans" data-row-id="' + item.loan_id + '" data-field="due_date">' + esc(item.due_date || '') + '</td>'
      : '<td>' + esc(item.due_date || '') + '</td>';

    return '<tr class="master-row' + (status === 'overdue' ? ' overdue-row' : '') + '"' +
      ' data-status="' + status + '"' +
      ' data-search-text="' + esc(searchText) + '"' +
      ' data-equipment-id="' + esc(item.equipment_id || '') + '"' +
      ' data-item-name="' + esc(item.item_name || '') + '"' +
      ' data-customer-name="' + esc(item.customer_name || '') + '"' +
      ' data-customer-phone="' + esc(item.customer_phone || '') + '"' +
      ' data-checked-out-date="' + esc(item.checked_out_date || '') + '"' +
      ' data-due-date="' + esc(item.due_date || '') + '">' +
      '<td class="col-actions">' + actionHtml + '</td>' +
      '<td contenteditable="true" data-table="equipment" data-row-id="' + esc(item.equipment_id) + '" data-field="equipment_id">' + esc(item.equipment_id) + '</td>' +
      '<td contenteditable="true" data-table="equipment" data-row-id="' + esc(item.equipment_id) + '" data-field="item_name">' + esc(item.item_name) + '</td>' +
      customerNameCell +
      customerPhoneCell +
      checkedOutCell +
      dueDateCell +
      '</tr>';
  }

  function renderTable() {
    var tbody = module.container.querySelector('#master-tbody');
    if (!module.rows.length) {
      tbody.innerHTML = '<tr><td colspan="7">No equipment registered yet.</td></tr>';
    } else {
      tbody.innerHTML = module.rows.map(buildRowHtml).join('');
    }
    var noResults = module.container.querySelector('#master-no-results');
    if (noResults) noResults.hidden = true;
  }

  function applyFilters() {
    var query = module.search.toLowerCase().trim();
    var visible = 0;
    var rows = module.container.querySelectorAll('.master-row');
    Array.prototype.forEach.call(rows, function (tr) {
      var show = module.activeTab === 'all' || tr.getAttribute('data-status') === module.activeTab;
      if (show && query) show = (tr.getAttribute('data-search-text') || '').indexOf(query) !== -1;
      if (show && module.dateFrom) show = !tr.getAttribute('data-checked-out-date') || tr.getAttribute('data-checked-out-date') >= module.dateFrom;
      if (show && module.dateTo) show = !tr.getAttribute('data-checked-out-date') || tr.getAttribute('data-checked-out-date') <= module.dateTo;
      tr.style.display = show ? '' : 'none';
      if (show) visible++;
    });
    var noResults = module.container.querySelector('#master-no-results');
    if (noResults) noResults.hidden = visible !== 0;
  }

  function applySort() {
    var tbody = module.container.querySelector('#master-tbody');
    var rows = Array.prototype.slice.call(tbody.querySelectorAll('.master-row'));
    var dir = module.sortDir === 'asc' ? 1 : -1;
    var attrMap = {
      equipmentId: 'data-equipment-id',
      itemName: 'data-item-name',
      customerName: 'data-customer-name',
      customerPhone: 'data-customer-phone',
      checkedOutDate: 'data-checked-out-date',
      dueDate: 'data-due-date',
    };
    rows.sort(function (a, b) {
      var aVal = (a.getAttribute(attrMap[module.sortBy]) || '').toLowerCase();
      var bVal = (b.getAttribute(attrMap[module.sortBy]) || '').toLowerCase();
      return aVal < bVal ? -dir : aVal > bVal ? dir : 0;
    });
    rows.forEach(function (r) { tbody.appendChild(r); });
    var links = module.container.querySelectorAll('.sort-link');
    Array.prototype.forEach.call(links, function (link) {
      var ind = link.querySelector('.sort-indicator');
      if (ind) ind.textContent = link.getAttribute('data-sort') === module.sortBy ? (module.sortDir === 'asc' ? '▲' : '▼') : '';
    });
  }

  function render() {
    if (!module.container) return;
    renderCandidates();
    renderTabs();
    renderTable();
    applySort();
    applyFilters();
  }

  function doCheckout(customerId, equipmentIds) {
    var checkoutDateInput = module.container.querySelector('#checkout-date');
    var checkoutDate = checkoutDateInput ? checkoutDateInput.value : '';
    return window.dme.loansCheckout(customerId, equipmentIds, checkoutDate || '').then(function (res) {
      if (!res || !res.ok) {
        App.flash((res && res.error) || 'Checkout failed.', 'error');
        return;
      }
      var loanIdsCsv = res.loanIdsCsv || (res.loanIds || []).join(',');
      App.navigate('agreement', {
        mode: 'sign',
        customerId: res.customerId,
        loanIds: loanIdsCsv,
        checkoutDate: res.checkoutDate,
        dueDate: res.dueDate,
      });
    });
  }

  function checkoutFlow() {
    var selected = [];
    var checkboxes = module.container.querySelectorAll('input[data-action="checkout-pick"]:checked');
    Array.prototype.forEach.call(checkboxes, function (cb) { selected.push(cb.value); });
    if (!selected.length) {
      App.flash('Please select at least one piece of equipment.', 'error');
      return;
    }
    var reference = module.container.querySelector('#checkout-customer').value.trim();
    if (!reference) {
      App.flash('Please enter a customer ID, name, phone, or ZIP.', 'error');
      return;
    }
    window.dme.customersSearch(reference).then(function (res) {
      if (!res || !res.ok) {
        App.flash((res && res.error) || 'Customer not found. Use an existing ID, name, phone, or ZIP.', 'error');
        return;
      }
      var matches = res.items || [];
      if (!matches.length) {
        App.flash('Customer not found. Use an existing ID, name, phone, or ZIP.', 'error');
        return;
      }
      if (matches.length === 1) {
        doCheckout(matches[0].id, selected);
        return;
      }
      module.candidates = matches;
      module.pendingEquipmentIds = selected;
      module.pendingCustomerReference = reference;
      renderCandidates();
    });
  }

  function returnLoan(loanId) {
    window.dme.loansReturn(Number(loanId)).then(function (res) {
      if (res && res.ok) {
        App.flash(res.message || 'Equipment returned successfully.', 'success');
      } else {
        App.flash((res && res.error) || 'Failed to return equipment.', 'error');
      }
      loadAndRender();
    });
  }

  function onContainerClick(e) {
    var tab = e.target.closest ? e.target.closest('.tab-btn') : null;
    if (tab) {
      module.activeTab = tab.getAttribute('data-tab');
      var tabs = module.container.querySelectorAll('.tab-btn');
      Array.prototype.forEach.call(tabs, function (b) { b.classList.remove('active'); });
      tab.classList.add('active');
      applyFilters();
      return;
    }

    var btn = e.target.closest ? e.target.closest('[data-action]') : null;
    if (!btn) return;
    var action = btn.getAttribute('data-action');

    if (action === 'return') {
      returnLoan(btn.getAttribute('data-loan-id'));
    } else if (action === 'view-agreement') {
      App.navigate('agreement', { mode: 'view', customerId: btn.getAttribute('data-customer-id') });
    } else if (action === 'candidate-select') {
      doCheckout(Number(btn.getAttribute('data-customer-id')), module.pendingEquipmentIds);
    }
  }

  function submitAddCustomer(form) {
    var name = form.querySelector('#master-customer-name').value.trim();
    var phone = form.querySelector('#master-customer-phone').value.trim();
    var zip = form.querySelector('#master-customer-zip').value.trim();
    if (!name || !phone || !zip) {
      App.flash('All fields are required.', 'error');
      return;
    }
    if (App.normalizePhone(phone).length < 10) {
      App.flash('Phone number must have at least 10 digits.', 'error');
      return;
    }
    if (!/^\d{5}$/.test(zip)) {
      App.flash('Zip code must be 5 digits.', 'error');
      return;
    }
    window.dme.customersAdd(name, phone, zip).then(function (res) {
      if (res && res.ok) {
        App.flash(res.message || 'Customer added successfully.', 'success');
        form.reset();
      } else {
        App.flash((res && res.error) || 'Error adding customer.', 'error');
      }
    });
  }

  function submitAddEquipment(form) {
    var equipmentId = form.querySelector('#master-equipment-id').value.trim().toUpperCase();
    var itemName = form.querySelector('#master-item-name').value.trim();
    if (!equipmentId || !itemName) {
      App.flash('All equipment fields are required.', 'error');
      return;
    }
    if (!/^[A-Z]{2}-\d{4}$/.test(equipmentId)) {
      App.flash('Equipment ID must be in format AA-0000.', 'error');
      return;
    }
    window.dme.equipmentAdd(equipmentId, itemName).then(function (res) {
      if (res && res.ok) {
        App.flash(res.message || 'Equipment added successfully.', 'success');
        form.reset();
        loadAndRender();
      } else {
        App.flash((res && res.error) || 'Equipment ID already exists.', 'error');
      }
    });
  }

  function init(container) {
    module.container = container;
    module.renderToken++;
    var token = module.renderToken;
    module.search = '';
    module.activeTab = 'all';
    module.dateFrom = '';
    module.dateTo = '';
    module.candidates = null;
    module.pendingEquipmentIds = [];
    module.pendingCustomerReference = null;

    container.innerHTML =
      '<h1>Veteran\'s DME</h1>' +
      '<p>Manage customers, equipment, checkouts, and returns from one central page.</p>' +

      '<div class="form-grid">' +
        '<section class="control-section">' +
          '<h2>Add Customer</h2>' +
          '<form id="master-add-customer" novalidate>' +
            '<div class="form-group">' +
              '<label for="master-customer-name">Name</label>' +
              '<input type="text" id="master-customer-name" required>' +
            '</div>' +
            '<div class="form-group">' +
              '<label for="master-customer-phone">Phone</label>' +
              '<input type="tel" id="master-customer-phone" data-phone placeholder="(555) 123-4567" required>' +
            '</div>' +
            '<div class="form-group">' +
              '<label for="master-customer-zip">ZIP Code</label>' +
              '<input type="text" id="master-customer-zip" placeholder="12345" required>' +
            '</div>' +
            '<button type="submit" class="btn">Add Customer</button>' +
          '</form>' +
        '</section>' +
        '<section class="control-section">' +
          '<h2>Add Equipment</h2>' +
          '<form id="master-add-equipment" novalidate>' +
            '<div class="form-group">' +
              '<label for="master-equipment-id">Equipment ID</label>' +
              '<input type="text" id="master-equipment-id" placeholder="AA-1234" required>' +
            '</div>' +
            '<div class="form-group">' +
              '<label for="master-item-name">Item Name</label>' +
              '<input type="text" id="master-item-name" required>' +
            '</div>' +
            '<button type="submit" class="btn">Add Equipment</button>' +
          '</form>' +
        '</section>' +
      '</div>' +

      '<section class="control-section">' +
        '<h2>Checkout</h2>' +
        '<div class="checkout-bar">' +
          '<div class="form-group">' +
            '<label for="checkout-customer">Customer (ID, name, phone, or ZIP)</label>' +
            '<input type="text" id="checkout-customer" placeholder="Customer ID, Name, Phone, or ZIP" autocomplete="off">' +
          '</div>' +
          '<div class="form-group form-group-date">' +
            '<label for="checkout-date">Checkout Date</label>' +
            '<input type="date" id="checkout-date" value="' + App.todayIso() + '">' +
          '</div>' +
          '<button type="button" class="btn" id="checkout-btn">Checkout Selected</button>' +
        '</div>' +
        '<p class="hint">Select one or more available items below, then choose a customer and check them out.</p>' +
      '</section>' +

      '<section class="candidate-section" id="candidate-section" hidden></section>' +

      '<div class="filter-row">' +
        '<div class="form-group">' +
          '<label for="master-search">Search equipment or customer</label>' +
          '<input type="search" id="master-search" placeholder="Equipment ID, item name, customer, or phone" autocomplete="off">' +
        '</div>' +
        '<div class="form-group form-group-fixed">' +
          '<label for="master-date-from">Checked Out From</label>' +
          '<input type="date" id="master-date-from">' +
        '</div>' +
        '<div class="form-group form-group-fixed">' +
          '<label for="master-date-to">Checked Out To</label>' +
          '<input type="date" id="master-date-to">' +
        '</div>' +
      '</div>' +

      '<div class="tab-bar" id="master-tabs"></div>' +

      '<table id="master-table">' +
        '<thead>' +
          '<tr>' +
            '<th class="col-actions">Action</th>' +
            '<th><button type="button" class="sort-link" data-sort="equipmentId">Equipment ID <span class="sort-indicator"></span></button></th>' +
            '<th><button type="button" class="sort-link" data-sort="itemName">Equipment Name <span class="sort-indicator"></span></button></th>' +
            '<th><button type="button" class="sort-link" data-sort="customerName">Customer Name <span class="sort-indicator"></span></button></th>' +
            '<th><button type="button" class="sort-link" data-sort="customerPhone">Customer Phone # <span class="sort-indicator"></span></button></th>' +
            '<th><button type="button" class="sort-link" data-sort="checkedOutDate">Date Checked Out <span class="sort-indicator"></span></button></th>' +
            '<th><button type="button" class="sort-link" data-sort="dueDate">Return Date <span class="sort-indicator"></span></button></th>' +
          '</tr>' +
        '</thead>' +
        '<tbody id="master-tbody"></tbody>' +
      '</table>' +
      '<p id="master-no-results" class="no-results" hidden>No equipment matches your search.</p>';

    container.querySelector('#checkout-btn').addEventListener('click', checkoutFlow);

    container.querySelector('#checkout-customer').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        checkoutFlow();
      }
    });

    var searchInput = container.querySelector('#master-search');
    var rafPending = false;
    searchInput.addEventListener('input', function () {
      if (!rafPending) {
        rafPending = true;
        requestAnimationFrame(function () {
          rafPending = false;
          module.search = searchInput.value;
          applyFilters();
        });
      }
    });

    var dateFromInput = container.querySelector('#master-date-from');
    var dateToInput = container.querySelector('#master-date-to');
    dateFromInput.addEventListener('change', function () {
      module.dateFrom = dateFromInput.value;
      applyFilters();
    });
    dateToInput.addEventListener('change', function () {
      module.dateTo = dateToInput.value;
      applyFilters();
    });

    var sortLinks = container.querySelectorAll('.sort-link');
    Array.prototype.forEach.call(sortLinks, function (link) {
      link.addEventListener('click', function () {
        var col = link.getAttribute('data-sort');
        if (module.sortBy === col && module.sortDir === 'asc') {
          module.sortDir = 'desc';
        } else {
          module.sortDir = 'asc';
        }
        module.sortBy = col;
        applySort();
      });
    });

    container.querySelector('#master-add-customer').addEventListener('submit', function (e) {
      e.preventDefault();
      submitAddCustomer(e.target);
    });

    container.querySelector('#master-add-equipment').addEventListener('submit', function (e) {
      e.preventDefault();
      submitAddEquipment(e.target);
    });

    container.addEventListener('click', onContainerClick);
    App.initInlineEditing(container, function () {
      loadAndRender();
    });

    App.setTeardown(function () {
      module.container = null;
    });

    loadAndRender();
  }

  window.AppViews = window.AppViews || {};
  window.AppViews.master = { init: init };
})();

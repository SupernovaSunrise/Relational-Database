(function () {
  'use strict';

  var module = { search: '' };
  var container = null;
  var debounceTimer = null;

  function load() {
    if (!container) return;
    var wrap = container.querySelector('#customers-table-wrap');
    window.dme.customersList(module.search).then(function (res) {
      if (!container) return;
      if (!res || !res.ok) {
        wrap.innerHTML = '<p class="error-text">Failed to load customers.</p>';
        App.flash((res && res.error) || 'Failed to load customers.', 'error');
        return;
      }
      renderTable(res.items || []);
    });
  }

  function renderTable(items) {
    var wrap = container.querySelector('#customers-table-wrap');
    var noResults = container.querySelector('#noResults');
    if (!items.length) {
      wrap.innerHTML = '<p>' + (module.search ? 'No customers match your search.' : 'No customers registered yet.') + '</p>';
      if (noResults) noResults.hidden = true;
      return;
    }
    var esc = App.escapeHtml;
    var isAdmin = App.isAdmin();
    var rowsHtml = items.map(function (c) {
      var searchText = (
        (c.name || '') + ' ' +
        (c.phone || '') + ' ' +
        (c.zip_code || '') + ' ' +
        App.normalizePhone(c.phone || '')
      ).toLowerCase();
      var actions = '';
      if (c.has_agreement) {
        actions += '<button type="button" class="btn" data-action="view-agreement" data-customer-id="' + c.id + '">View Agreement</button> ';
      }
      if (isAdmin) {
        actions += '<button type="button" class="btn btn-danger" data-action="delete-customer" data-customer-id="' + c.id + '" data-customer-name="' + esc(c.name) + '">Delete</button>';
      }
      return '<tr class="customer-row" data-search-text="' + esc(searchText) + '">' +
        '<td>' + c.id + '</td>' +
        '<td contenteditable="true" data-table="customers" data-row-id="' + c.id + '" data-field="name">' + esc(c.name) + '</td>' +
        '<td contenteditable="true" data-table="customers" data-row-id="' + c.id + '" data-field="phone">' + esc(c.phone || '') + '</td>' +
        '<td contenteditable="true" data-table="customers" data-row-id="' + c.id + '" data-field="zip_code">' + esc(c.zip_code || '') + '</td>' +
        '<td>' + esc(c.date_added || '') + '</td>' +
        '<td>' + actions + '</td>' +
      '</tr>';
    }).join('');

    wrap.innerHTML =
      '<table>' +
        '<thead>' +
          '<tr><th>ID</th><th>Name</th><th>Phone</th><th>Zip Code</th><th>Date Added</th><th>Action</th></tr>' +
        '</thead>' +
        '<tbody>' + rowsHtml + '</tbody>' +
      '</table>';
    if (noResults) noResults.hidden = true;
  }

  function onContainerClick(e) {
    var btn = e.target.closest ? e.target.closest('[data-action]') : null;
    if (!btn) return;
    var action = btn.getAttribute('data-action');

    if (action === 'view-agreement') {
      App.navigate('agreement', { mode: 'view', customerId: btn.getAttribute('data-customer-id') });
    } else if (action === 'delete-customer') {
      var id = Number(btn.getAttribute('data-customer-id'));
      var name = btn.getAttribute('data-customer-name') || '';
      if (!window.confirm('Delete customer ' + name + '?')) return;
      window.dme.customersDelete(id).then(function (res) {
        if (res && res.ok) {
          App.flash(res.message || 'Customer deleted successfully.', 'success');
        } else {
          App.flash((res && res.error) || 'Error deleting customer.', 'error');
        }
        load();
      });
    }
  }

  function submitAdd(form) {
    var name = form.querySelector('#add-customer-name').value.trim();
    var phone = form.querySelector('#add-customer-phone').value.trim();
    var zip = form.querySelector('#add-customer-zip').value.trim();
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
        load();
      } else {
        App.flash((res && res.error) || 'Error adding customer.', 'error');
      }
    });
  }

  function init(containerEl) {
    container = containerEl;
    module.search = '';

    container.innerHTML =
      '<h1>Customers</h1>' +
      '<div class="filter-row">' +
        '<div class="form-group">' +
          '<label for="customer-search">Search customers</label>' +
          '<input type="search" id="customer-search" placeholder="Name, phone, or zip" autocomplete="off">' +
        '</div>' +
      '</div>' +
      '<section class="control-section">' +
        '<h2>Add New Customer</h2>' +
        '<form id="add-customer-form" novalidate>' +
          '<div class="form-group">' +
            '<label for="add-customer-name">Customer Name:</label>' +
            '<input type="text" id="add-customer-name" required>' +
          '</div>' +
          '<div class="form-group">' +
            '<label for="add-customer-phone">Phone Number:</label>' +
            '<input type="tel" id="add-customer-phone" data-phone placeholder="e.g., (555) 123-4567" required>' +
          '</div>' +
          '<div class="form-group">' +
            '<label for="add-customer-zip">Zip Code:</label>' +
            '<input type="text" id="add-customer-zip" placeholder="12345" required>' +
          '</div>' +
          '<button type="submit" class="btn">Add Customer</button>' +
        '</form>' +
      '</section>' +
      '<div id="customers-table-wrap"></div>' +
      '<p id="noResults" class="no-results" hidden>No customers match your search.</p>';

    var searchInput = container.querySelector('#customer-search');
    searchInput.addEventListener('input', function () {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () {
        module.search = searchInput.value;
        load();
      }, 250);
    });

    container.querySelector('#add-customer-form').addEventListener('submit', function (e) {
      e.preventDefault();
      submitAdd(e.target);
    });

    container.addEventListener('click', onContainerClick);
    App.initInlineEditing(container, load);
    App.setTeardown(function () {
      container = null;
    });

    load();
  }

  window.AppViews = window.AppViews || {};
  window.AppViews.customers = { init: init };
})();

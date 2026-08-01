(function () {
  'use strict';

  var module = { search: '' };
  var container = null;
  var debounceTimer = null;

  function load() {
    if (!container) return;
    var wrap = container.querySelector('#equipment-table-wrap');
    window.dme.equipmentList(module.search).then(function (res) {
      if (!container) return;
      if (!res || !res.ok) {
        wrap.innerHTML = '<p class="error-text">Failed to load equipment.</p>';
        App.flash((res && res.error) || 'Failed to load equipment.', 'error');
        return;
      }
      renderTable(res.items || []);
    });
  }

  function renderTable(items) {
    var wrap = container.querySelector('#equipment-table-wrap');
    var noResults = container.querySelector('#noResults');
    if (!items.length) {
      wrap.innerHTML = '<p>' + (module.search ? 'No equipment matches your search.' : 'No equipment registered yet.') + '</p>';
      if (noResults) noResults.hidden = true;
      return;
    }
    var esc = App.escapeHtml;
    var isAdmin = App.isAdmin();
    var rowsHtml = items.map(function (item) {
      var searchText = (
        (item.equipment_id || '') + ' ' +
        (item.item_name || '') + ' ' +
        (item.customer_name || '')
      ).toLowerCase();
      var status = item.loan_id
        ? 'Checked out to ' + esc(item.customer_name || '') + ' until ' + esc(item.due_date || '')
        : 'Available';
      var actions = '';
      if (isAdmin) {
        if (!item.loan_id) {
          actions += '<button type="button" class="btn" data-action="sell-equipment" data-equipment-id="' + esc(item.equipment_id) + '">Sold</button> ';
        }
        actions += '<button type="button" class="btn btn-danger" data-action="delete-equipment" data-equipment-id="' + esc(item.equipment_id) + '">Delete</button>';
      }
      return '<tr class="equipment-row" data-search-text="' + esc(searchText) + '">' +
        '<td contenteditable="true" data-table="equipment" data-row-id="' + esc(item.equipment_id) + '" data-field="equipment_id">' + esc(item.equipment_id) + '</td>' +
        '<td contenteditable="true" data-table="equipment" data-row-id="' + esc(item.equipment_id) + '" data-field="item_name">' + esc(item.item_name) + '</td>' +
        '<td contenteditable="true" data-table="equipment" data-row-id="' + esc(item.equipment_id) + '" data-field="date_verified">' + esc(item.date_verified || '') + '</td>' +
        '<td>' + status + '</td>' +
        '<td>' + actions + '</td>' +
      '</tr>';
    }).join('');

    wrap.innerHTML =
      '<table>' +
        '<thead>' +
          '<tr><th>Equipment ID</th><th>Item Name</th><th>Date Verified</th><th>Status</th><th>Action</th></tr>' +
        '</thead>' +
        '<tbody>' + rowsHtml + '</tbody>' +
      '</table>';
    if (noResults) noResults.hidden = true;
  }

  function onContainerClick(e) {
    var btn = e.target.closest ? e.target.closest('[data-action]') : null;
    if (!btn) return;
    var action = btn.getAttribute('data-action');

    if (action === 'sell-equipment') {
      var equipmentId = btn.getAttribute('data-equipment-id');
      var priceInput = window.prompt('Enter sale price for ' + equipmentId + ' (e.g., 25.00):');
      if (priceInput === null || priceInput.trim() === '') return;
      window.dme.equipmentSell(equipmentId, priceInput.trim()).then(function (res) {
        if (res && res.ok) {
          App.flash(res.message || 'Equipment sold successfully.', 'success');
        } else {
          App.flash((res && res.error) || 'Error selling equipment.', 'error');
        }
        load();
      });
    } else if (action === 'delete-equipment') {
      var equipmentId = btn.getAttribute('data-equipment-id');
      if (!window.confirm('Delete equipment ' + equipmentId + '?')) return;
      window.dme.equipmentDelete(equipmentId).then(function (res) {
        if (res && res.ok) {
          App.flash(res.message || 'Equipment deleted successfully.', 'success');
        } else {
          App.flash((res && res.error) || 'Error deleting equipment.', 'error');
        }
        load();
      });
    }
  }

  function submitAdd(form) {
    var equipmentId = form.querySelector('#add-equipment-id').value.trim().toUpperCase();
    var itemName = form.querySelector('#add-item-name').value.trim();
    if (!equipmentId || !itemName) {
      App.flash('All fields are required.', 'error');
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
        load();
      } else {
        App.flash((res && res.error) || 'Equipment ID already exists.', 'error');
      }
    });
  }

  function init(containerEl) {
    container = containerEl;
    module.search = '';

    container.innerHTML =
      '<h1>Equipment</h1>' +
      '<div class="filter-row">' +
        '<div class="form-group">' +
          '<label for="equipment-search">Search equipment</label>' +
          '<input type="search" id="equipment-search" placeholder="Equipment ID, item, or customer" autocomplete="off">' +
        '</div>' +
      '</div>' +
      '<section class="control-section">' +
        '<h2>Add New Equipment</h2>' +
        '<form id="add-equipment-form" novalidate>' +
          '<div class="form-group">' +
            '<label for="add-equipment-id">Equipment ID (AA-0000 format):</label>' +
            '<input type="text" id="add-equipment-id" placeholder="e.g., AB-1234" required>' +
          '</div>' +
          '<div class="form-group">' +
            '<label for="add-item-name">Item Name:</label>' +
            '<input type="text" id="add-item-name" placeholder="e.g., Wheelchair" required>' +
          '</div>' +
          '<button type="submit" class="btn">Add Equipment</button>' +
        '</form>' +
      '</section>' +
      '<div id="equipment-table-wrap"></div>' +
      '<p id="noResults" class="no-results" hidden>No equipment matches your search.</p>';

    var searchInput = container.querySelector('#equipment-search');
    searchInput.addEventListener('input', function () {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () {
        module.search = searchInput.value;
        load();
      }, 250);
    });

    container.querySelector('#add-equipment-form').addEventListener('submit', function (e) {
      e.preventDefault();
      submitAdd(e.target);
    });

    container.addEventListener('click', onContainerClick);
    App.initInlineEditing(container, load);

    load();
  }

  window.AppViews = window.AppViews || {};
  window.AppViews.equipment = { init: init };
})();

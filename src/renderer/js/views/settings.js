(function () {
  'use strict';

  function submitChangePassword(form) {
    var currentInput = form.querySelector('#current-password');
    var newInput = form.querySelector('#new-password');
    var confirmInput = form.querySelector('#confirm-password');
    var current = currentInput.value;
    var next = newInput.value;
    var confirm = confirmInput.value;

    if (!current || !next) {
      App.flash('All fields are required.', 'error');
      return;
    }
    if (next !== confirm) {
      App.flash('New passwords do not match.', 'error');
      return;
    }
    if (next.length < 8) {
      App.flash('New password must be at least 8 characters.', 'error');
      return;
    }
    window.dme.authChangePassword(current, next).then(function (res) {
      if (res && res.ok) {
        App.flash(res.message || 'Password changed successfully.', 'success');
        form.reset();
        App.logout();
      } else {
        App.flash((res && res.error) || 'Failed to change password.', 'error');
      }
    });
  }

  function doExport(method, format) {
    window.dme[method](format).then(function (res) {
      if (res && res.ok) {
        App.flash('Export saved to ' + res.path, 'success');
      } else {
        App.flash((res && res.error) || 'Export failed.', 'error');
      }
    });
  }

  function doImport(method) {
    window.dme[method]('').then(function (res) {
      if (res && res.ok) {
        App.flash(res.message || 'Import completed successfully.', 'success');
      } else {
        App.flash((res && res.error) || 'An error occurred while importing the file. Please check the format and try again.', 'error');
      }
    });
  }

  function onContainerClick(e) {
    var btn = e.target.closest ? e.target.closest('[data-action]') : null;
    if (!btn) return;
    var action = btn.getAttribute('data-action');

    if (action === 'export-customers') {
      doExport('importExportExportCustomers', btn.dataset.format);
    } else if (action === 'export-equipment') {
      doExport('importExportExportEquipment', btn.dataset.format);
    } else if (action === 'export-checkout-log') {
      doExport('importExportExportCheckoutLog', btn.dataset.format);
    } else if (action === 'export-equipment-list') {
      doExport('importExportExportMaster', btn.dataset.format);
    } else if (action === 'import-customers') {
      doImport('importExportImportCustomers');
    } else if (action === 'import-equipment') {
      doImport('importExportImportEquipment');
    } else if (action === 'shutdown') {
      if (!window.confirm('Shut down the application?')) return;
      window.dme.appShutdown().then(function (res) {
        if (res && res.ok) {
          App.flash('Shutting down...', 'success');
        } else {
          App.flash((res && res.error) || 'Shutdown failed.', 'error');
        }
      });
    } else if (action === 'logout') {
      App.logout();
    }
  }

  function init(container) {
    var user = App.getUser();
    var isAdmin = App.isAdmin();
    var esc = App.escapeHtml;

    var html =
      '<h1>Settings</h1>' +
      '<div class="settings-grid">' +
        '<section class="control-section">' +
          '<h2>Account</h2>' +
          '<p><strong>Username:</strong> ' + esc(user ? user.username : '') + '</p>' +
          '<h3 class="section-subtitle">Change Password</h3>' +
          '<form id="change-password-form" novalidate>' +
            '<div class="form-group">' +
              '<label for="current-password">Current Password</label>' +
              '<input type="password" id="current-password" autocomplete="current-password" required>' +
            '</div>' +
            '<div class="form-group">' +
              '<label for="new-password">New Password</label>' +
              '<input type="password" id="new-password" autocomplete="new-password" required>' +
              '<small>Minimum 8 characters</small>' +
            '</div>' +
            '<div class="form-group">' +
              '<label for="confirm-password">Confirm New Password</label>' +
              '<input type="password" id="confirm-password" autocomplete="new-password" required>' +
            '</div>' +
            '<button type="submit" class="btn btn-block">Update Password</button>' +
          '</form>' +
          '<div class="settings-actions">' +
            '<button type="button" class="btn" data-action="logout">Logout</button>' +
            (isAdmin ? '<button type="button" class="btn btn-danger" data-action="shutdown">Shutdown</button>' : '') +
          '</div>' +
        '</section>';

    if (isAdmin) {
      html +=
        '<section class="control-section">' +
          '<h2>Export Data</h2>' +
          '<p>Download your data as Excel or CSV files for backup or analysis.</p>' +
          '<div class="export-actions">' +
            '<span class="export-label">Customers</span>' +
            '<select data-format-for="export-customers"><option value="xlsx">.xlsx</option><option value="csv">.csv</option></select>' +
            '<button type="button" class="btn" data-action="export-customers" data-format-for="export-customers">Export Customers</button>' +
          '</div>' +
          '<div class="export-actions">' +
            '<span class="export-label">Equipment</span>' +
            '<select data-format-for="export-equipment"><option value="xlsx">.xlsx</option><option value="csv">.csv</option></select>' +
            '<button type="button" class="btn" data-action="export-equipment" data-format-for="export-equipment">Export Equipment</button>' +
          '</div>' +
          '<div class="export-actions">' +
            '<span class="export-label">Checkout Log</span>' +
            '<select data-format-for="export-checkout-log"><option value="xlsx">.xlsx</option><option value="csv">.csv</option></select>' +
            '<button type="button" class="btn" data-action="export-checkout-log" data-format-for="export-checkout-log">Export Checkout Log</button>' +
          '</div>' +
          '<div class="export-actions">' +
            '<span class="export-label">Equipment List</span>' +
            '<select data-format-for="export-equipment-list"><option value="xlsx">.xlsx</option><option value="csv">.csv</option></select>' +
            '<button type="button" class="btn" data-action="export-equipment-list" data-format-for="export-equipment-list">Export Equipment List</button>' +
          '</div>' +
        '</section>' +
        '<section class="control-section">' +
          '<h2>Import Data</h2>' +
          '<p>Import customers or equipment from Excel files (.xlsx) or CSV files (.csv).</p>' +
          '<div class="settings-actions">' +
            '<button type="button" class="btn" data-action="import-customers">Import Customers</button>' +
            '<button type="button" class="btn" data-action="import-equipment">Import Equipment</button>' +
          '</div>' +
        '</section>';
    }

    html +=
      '</div>' +
      '<section class="control-section">' +
        '<h2>Import/Export Instructions</h2>' +
        '<p><strong>Customers:</strong> Columns: Name, Phone, ZipCode (starting from row 2).</p>' +
        '<p><strong>Equipment:</strong> Columns: EquipmentID (format: AA-0000), ItemName (starting from row 2).</p>' +
        '<p><strong>Checkout Log:</strong> Exports all checkout history with: Equipment ID, Item Name, Customer Name, Customer Phone, Date Checked Out, Due Date, Date Returned, Agreement Date.</p>' +
        '<p><strong>Equipment List:</strong> Exports the current equipment list with: Equipment ID, Item Name, Customer Name, Customer Phone, Date Checked Out, Return Date, Status.</p>' +
      '</section>';

    container.innerHTML = html;

    container.querySelector('#change-password-form').addEventListener('submit', function (e) {
      e.preventDefault();
      submitChangePassword(e.target);
    });

    container.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('[data-action]') : null;
      if (!btn) return;
      var action = btn.getAttribute('data-action');
      if (action.indexOf('export-') === 0) {
        var select = container.querySelector('select[data-format-for="' + action + '"]');
        btn.dataset.format = select ? select.value : 'xlsx';
      }
      onContainerClick(e);
    });
  }

  window.AppViews = window.AppViews || {};
  window.AppViews.settings = { init: init };
})();

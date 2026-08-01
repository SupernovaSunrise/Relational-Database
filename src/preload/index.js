const { contextBridge, ipcRenderer } = require('electron');

function invoke(channel, payload) {
  return ipcRenderer.invoke(channel, payload);
}

const api = {
  appGetStatus: () => invoke('app:getStatus'),
  appShutdown: () => invoke('app:shutdown'),

  authRegister: (username, password) => invoke('auth:register', { username, password }),
  authLogin: (username, password) => invoke('auth:login', { username, password }),
  authLogout: () => invoke('auth:logout'),
  authGetSession: () => invoke('auth:getSession'),
  authChangePassword: (currentPassword, newPassword) => invoke('auth:changePassword', { currentPassword, newPassword }),

  customersList: (search) => invoke('customers:list', { search }),
  customersSearch: (query) => invoke('customers:search', { query }),
  customersGet: (id) => invoke('customers:get', { id }),
  customersAdd: (name, phone, zipCode) => invoke('customers:add', { name, phone, zipCode }),
  customersDelete: (id) => invoke('customers:delete', { id }),
  customersInlineUpdate: (id, field, value) => invoke('customers:inlineUpdate', { id, field, value }),

  equipmentList: (search) => invoke('equipment:list', { search }),
  equipmentAdd: (equipmentId, itemName) => invoke('equipment:add', { equipmentId, itemName }),
  equipmentDelete: (equipmentId) => invoke('equipment:delete', { equipmentId }),
  equipmentSell: (equipmentId, salePrice) => invoke('equipment:sell', { equipmentId, salePrice }),
  equipmentInlineUpdate: (equipmentId, field, value) => invoke('equipment:inlineUpdate', { equipmentId, field, value }),

  loansGetMasterData: () => invoke('loans:getMasterData'),
  loansCheckout: (customerId, equipmentIds, checkoutDate) => invoke('loans:checkout', { customerId, equipmentIds, checkoutDate }),
  loansReturn: (loanId) => invoke('loans:return', { loanId }),
  loansGetByCustomer: (customerId) => invoke('loans:getByCustomer', { customerId }),
  loansGetPending: () => invoke('loans:getPending'),
  loansCancelPending: (loanIds) => invoke('loans:cancelPending', { loanIds }),
  loansInlineUpdate: (loanId, field, value) => invoke('loans:inlineUpdate', { loanId, field, value }),

  agreementsGetLoan: (loanId) => invoke('agreements:getLoan', { loanId }),
  agreementsGetCustomer: (customerId) => invoke('agreements:getCustomer', { customerId }),
  agreementsSubmit: (payload) => invoke('agreements:submit', payload),

  reportsGetYears: () => invoke('reports:getYears'),
  reportsGetData: (payload) => invoke('reports:getData', payload),
  reportsDeleteCheckout: (id) => invoke('reports:deleteCheckout', { id }),
  reportsDeleteItemSale: (id) => invoke('reports:deleteItemSale', { id }),

  importExportExportCustomers: (format) => invoke('importExport:exportCustomers', { format }),
  importExportExportEquipment: (format) => invoke('importExport:exportEquipment', { format }),
  importExportExportCheckoutLog: (format) => invoke('importExport:exportCheckoutLog', { format }),
  importExportImportCustomers: (path) => invoke('importExport:importCustomers', { path }),
  importExportImportEquipment: (path) => invoke('importExport:importEquipment', { path }),
};

contextBridge.exposeInMainWorld('dme', Object.freeze(api));

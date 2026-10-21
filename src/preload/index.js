const { contextBridge, ipcRenderer } = require('electron');

function invoke(channel, payload) {
  return ipcRenderer.invoke(channel, payload);
}

const SUBSCRIBABLE_EVENTS = Object.freeze(['signing:event']);

function on(channel, listener) {
  if (SUBSCRIBABLE_EVENTS.indexOf(channel) === -1) return () => {};
  if (typeof listener !== 'function') return () => {};
  const wrapped = (_event, payload) => listener(payload);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

const api = {
  appGetStatus: () => invoke('app:getStatus'),
  appShutdown: () => invoke('app:shutdown'),
  appPrint: (html) => invoke('app:print', { html }),
  appConfirm: (message) => invoke('app:confirm', { message }),

  authRegister: (username, password) => invoke('auth:register', { username, password }),
  authLogin: (username, password) => invoke('auth:login', { username, password }),
  authLogout: () => invoke('auth:logout'),
  authChangePassword: (currentPassword, newPassword) => invoke('auth:changePassword', { currentPassword, newPassword }),

  customersList: (search) => invoke('customers:list', { search }),
  customersSearch: (query) => invoke('customers:search', { query }),
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
  loansExtend: (loanId) => invoke('loans:extend', { loanId }),
  loansCancelPending: (loanIds) => invoke('loans:cancelPending', { loanIds }),
  loansInlineUpdate: (loanId, field, value) => invoke('loans:inlineUpdate', { loanId, field, value }),

  agreementsGetLoan: (loanId) => invoke('agreements:getLoan', { loanId }),
  agreementsGetCustomer: (customerId) => invoke('agreements:getCustomer', { customerId }),
  agreementsSubmit: (payload) => invoke('agreements:submit', payload),

  signingStart: (payload) => invoke('signing:start', payload),
  signingGetStatus: () => invoke('signing:getStatus'),
  signingSetEnabled: (enabled) => invoke('signing:setEnabled', { enabled }),
  signingSetWitness: (witnessName) => invoke('signing:setWitness', { witnessName }),
  signingGetContext: () => invoke('signing:getContext'),
  signingSubmit: (waiverAgreed, signatureData) => invoke('signing:submit', { waiverAgreed, signatureData }),
  signingCancel: () => invoke('signing:cancel'),
  signingAbandon: () => invoke('signing:abandon'),
  onSigningEvent: (listener) => on('signing:event', listener),

  reportsGetYears: () => invoke('reports:getYears'),
  reportsGetData: (payload) => invoke('reports:getData', payload),
  reportsDeleteCheckout: (id) => invoke('reports:deleteCheckout', { id }),
  reportsDeleteItemSale: (id) => invoke('reports:deleteItemSale', { id }),

  importExportExportCustomers: (format) => invoke('importExport:exportCustomers', { format }),
  importExportExportEquipment: (format) => invoke('importExport:exportEquipment', { format }),
  importExportExportCheckoutLog: (format) => invoke('importExport:exportCheckoutLog', { format }),
  importExportExportMaster: (format) => invoke('importExport:exportMaster', { format }),
  importExportImportCustomers: (path) => invoke('importExport:importCustomers', { path }),
  importExportImportEquipment: (path) => invoke('importExport:importEquipment', { path }),
};

contextBridge.exposeInMainWorld('dme', Object.freeze(api));

const CHANNELS = Object.freeze({
  APP_GET_STATUS: 'app:getStatus',
  APP_SHUTDOWN: 'app:shutdown',
  APP_PRINT: 'app:print',

  AUTH_REGISTER: 'auth:register',
  AUTH_LOGIN: 'auth:login',
  AUTH_LOGOUT: 'auth:logout',
  AUTH_CHANGE_PASSWORD: 'auth:changePassword',

  CUSTOMERS_LIST: 'customers:list',
  CUSTOMERS_SEARCH: 'customers:search',
  CUSTOMERS_ADD: 'customers:add',
  CUSTOMERS_DELETE: 'customers:delete',
  CUSTOMERS_INLINE_UPDATE: 'customers:inlineUpdate',

  EQUIPMENT_LIST: 'equipment:list',
  EQUIPMENT_ADD: 'equipment:add',
  EQUIPMENT_DELETE: 'equipment:delete',
  EQUIPMENT_SELL: 'equipment:sell',
  EQUIPMENT_INLINE_UPDATE: 'equipment:inlineUpdate',

  LOANS_GET_MASTER_DATA: 'loans:getMasterData',
  LOANS_CHECKOUT: 'loans:checkout',
  LOANS_RETURN: 'loans:return',
  LOANS_EXTEND: 'loans:extend',
  LOANS_CANCEL_PENDING: 'loans:cancelPending',
  LOANS_INLINE_UPDATE: 'loans:inlineUpdate',

  AGREEMENTS_GET_LOAN: 'agreements:getLoan',
  AGREEMENTS_GET_CUSTOMER: 'agreements:getCustomer',
  AGREEMENTS_SUBMIT: 'agreements:submit',

  REPORTS_GET_YEARS: 'reports:getYears',
  REPORTS_GET_DATA: 'reports:getData',
  REPORTS_DELETE_CHECKOUT: 'reports:deleteCheckout',
  REPORTS_DELETE_ITEM_SALE: 'reports:deleteItemSale',

  IMPORT_EXPORT_EXPORT_CUSTOMERS: 'importExport:exportCustomers',
  IMPORT_EXPORT_EXPORT_EQUIPMENT: 'importExport:exportEquipment',
  IMPORT_EXPORT_EXPORT_CHECKOUT_LOG: 'importExport:exportCheckoutLog',
  IMPORT_EXPORT_EXPORT_MASTER: 'importExport:exportMaster',
  IMPORT_EXPORT_IMPORT_CUSTOMERS: 'importExport:importCustomers',
  IMPORT_EXPORT_IMPORT_EQUIPMENT: 'importExport:importEquipment',
});

const PAYLOADS = Object.freeze({
  [CHANNELS.APP_GET_STATUS]: {},
  [CHANNELS.APP_SHUTDOWN]: {},
  [CHANNELS.APP_PRINT]: { html: 'string:524288' },
  [CHANNELS.AUTH_REGISTER]: { username: 'string:64', password: 'string:4096' },
  [CHANNELS.AUTH_LOGIN]: { username: 'string:64', password: 'string:4096' },
  [CHANNELS.AUTH_LOGOUT]: {},
  [CHANNELS.AUTH_CHANGE_PASSWORD]: { currentPassword: 'string:4096', newPassword: 'string:4096' },
  [CHANNELS.CUSTOMERS_LIST]: { search: 'string:255?' },
  [CHANNELS.CUSTOMERS_SEARCH]: { query: 'string:255' },
  [CHANNELS.CUSTOMERS_ADD]: { name: 'string:255', phone: 'string:32', zipCode: 'string:16' },
  [CHANNELS.CUSTOMERS_DELETE]: { id: 'number' },
  [CHANNELS.CUSTOMERS_INLINE_UPDATE]: { id: 'number', field: 'string:64', value: 'string:255' },
  [CHANNELS.EQUIPMENT_LIST]: { search: 'string:255?' },
  [CHANNELS.EQUIPMENT_ADD]: { equipmentId: 'string:16', itemName: 'string:255' },
  [CHANNELS.EQUIPMENT_DELETE]: { equipmentId: 'string:16' },
  [CHANNELS.EQUIPMENT_SELL]: { equipmentId: 'string:16', salePrice: 'string:32' },
  [CHANNELS.EQUIPMENT_INLINE_UPDATE]: { equipmentId: 'string:16', field: 'string:64', value: 'string:255' },
  [CHANNELS.LOANS_GET_MASTER_DATA]: {},
  [CHANNELS.LOANS_CHECKOUT]: { customerId: 'number', equipmentIds: 'string[]:50', checkoutDate: 'string:32?' },
  [CHANNELS.LOANS_RETURN]: { loanId: 'number' },
  [CHANNELS.LOANS_EXTEND]: { loanId: 'number' },
  [CHANNELS.LOANS_CANCEL_PENDING]: { loanIds: 'number[]:50' },
  [CHANNELS.LOANS_INLINE_UPDATE]: { loanId: 'number', field: 'string:64', value: 'string:32' },
  [CHANNELS.AGREEMENTS_GET_LOAN]: { loanId: 'number' },
  [CHANNELS.AGREEMENTS_GET_CUSTOMER]: { customerId: 'number' },
  [CHANNELS.AGREEMENTS_SUBMIT]: {
    customerId: 'number',
    loanIds: 'number[]:50',
    checkoutDate: 'string:32',
    returnBy: 'string:32?',
    agreementDate: 'string:32',
    waiverAgreed: 'boolean',
    signatureAgreed: 'boolean',
    signatureData: 'string:900000',
  },
  [CHANNELS.REPORTS_GET_YEARS]: {},
  [CHANNELS.REPORTS_GET_DATA]: {
    reportType: 'string:32',
    yearFilter: 'string:16?',
    monthFilter: 'string:16?',
    dateFrom: 'string:32?',
    dateTo: 'string:32?',
  },
  [CHANNELS.REPORTS_DELETE_CHECKOUT]: { id: 'number' },
  [CHANNELS.REPORTS_DELETE_ITEM_SALE]: { id: 'number' },
  [CHANNELS.IMPORT_EXPORT_EXPORT_CUSTOMERS]: { format: 'string:16' },
  [CHANNELS.IMPORT_EXPORT_EXPORT_EQUIPMENT]: { format: 'string:16' },
  [CHANNELS.IMPORT_EXPORT_EXPORT_CHECKOUT_LOG]: { format: 'string:16' },
  [CHANNELS.IMPORT_EXPORT_EXPORT_MASTER]: { format: 'string:16' },
  [CHANNELS.IMPORT_EXPORT_IMPORT_CUSTOMERS]: { path: 'string:1024' },
  [CHANNELS.IMPORT_EXPORT_IMPORT_EQUIPMENT]: { path: 'string:1024' },
});

const MAX_PAYLOAD_BYTES = 1024 * 1024;

const REQUIRED_AUTH = Object.freeze(new Set([
  CHANNELS.AUTH_REGISTER,
  CHANNELS.AUTH_LOGIN,
  CHANNELS.APP_GET_STATUS,
]));

const REQUIRED_ADMIN = Object.freeze(new Set([
  CHANNELS.APP_SHUTDOWN,
  CHANNELS.CUSTOMERS_DELETE,
  CHANNELS.EQUIPMENT_DELETE,
  CHANNELS.EQUIPMENT_SELL,
  CHANNELS.REPORTS_DELETE_CHECKOUT,
  CHANNELS.REPORTS_DELETE_ITEM_SALE,
  CHANNELS.IMPORT_EXPORT_EXPORT_CUSTOMERS,
  CHANNELS.IMPORT_EXPORT_EXPORT_EQUIPMENT,
  CHANNELS.IMPORT_EXPORT_EXPORT_CHECKOUT_LOG,
  CHANNELS.IMPORT_EXPORT_EXPORT_MASTER,
  CHANNELS.IMPORT_EXPORT_IMPORT_CUSTOMERS,
  CHANNELS.IMPORT_EXPORT_IMPORT_EQUIPMENT,
]));

module.exports = { CHANNELS, PAYLOADS, REQUIRED_AUTH, REQUIRED_ADMIN, MAX_PAYLOAD_BYTES };

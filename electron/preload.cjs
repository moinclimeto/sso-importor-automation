try {
  require('@sentry/electron/preload');
} catch {
  /* Sentry optional until DSN is configured */
}

const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('pwp', {
  // webUtils
  webUtils: {
    getPathForFile: (file) => webUtils.getPathForFile(file),
  },
  // FS
  fs: {
    readFileBase64: (filePath) => ipcRenderer.invoke('fs:readFileBase64', filePath),
    readLocalFileBase64: (filePath) => ipcRenderer.invoke('fs:readLocalFileBase64', filePath),
    copyRegistrationFile: (filePath) => ipcRenderer.invoke('fs:copyRegistrationFile', filePath),
    saveRegistrationFile: (fileName, base64) => ipcRenderer.invoke('fs:saveRegistrationFile', fileName, base64),
  },
  files: {
    storeUpload: (payload) => ipcRenderer.invoke('files:store-upload', payload),
  },
  letters: {
    preview: (payload) => ipcRenderer.invoke('letters:preview', payload),
    save: (payload) => ipcRenderer.invoke('letters:save', payload),
    saveAll: (payload) => ipcRenderer.invoke('letters:saveAll', payload),
  },
  companies: {
    getAll: () => ipcRenderer.invoke('companies:getAll'),
    add: (data) => ipcRenderer.invoke('companies:add', data),
    update: (data) => ipcRenderer.invoke('companies:update', data),
    delete: (id) => ipcRenderer.invoke('companies:delete', id),
  },
  // Documents
  documents: {
    getAll: () => ipcRenderer.invoke('documents:getAll'),
    add: (data) => ipcRenderer.invoke('documents:add', data),
    delete: (id) => ipcRenderer.invoke('documents:delete', id),
    getStats: () => ipcRenderer.invoke('documents:getStats'),
  },
  // Invoices Export
  invoices: {
    exportZip: (payload) => ipcRenderer.invoke('invoices:exportZip', payload),
  },
  // Purchases
  purchases: {
    getAll: (filters) => ipcRenderer.invoke('purchases:getAll', filters),
    add: (data) => ipcRenderer.invoke('purchases:add', data),
    update: (data) => ipcRenderer.invoke('purchases:update', data),
    updateStatus: (payload) => ipcRenderer.invoke('purchases:updateStatus', payload),
    delete: (id) => ipcRenderer.invoke('purchases:delete', id),
    getSummary: (filters) => ipcRenderer.invoke('purchases:getSummary', filters),
  },
  // Sales
  sales: {
    getAll: (filters) => ipcRenderer.invoke('sales:getAll', filters),
    add: (data) => ipcRenderer.invoke('sales:add', data),
    update: (data) => ipcRenderer.invoke('sales:update', data),
    updateStatus: (payload) => ipcRenderer.invoke('sales:updateStatus', payload),
    delete: (id) => ipcRenderer.invoke('sales:delete', id),
    getSummary: (filters) => ipcRenderer.invoke('sales:getSummary', filters),
    applyBankDetailsToAll: (bankDetails) => ipcRenderer.invoke('sales:applyBankDetailsToAll', bankDetails),
  },
  // Dashboard
  dashboard: {
    getStats: () => ipcRenderer.invoke('dashboard:getStats'),
  },
  // Settings
  settings: {
    get: (key) => ipcRenderer.invoke('settings:get', key),
    set: (key, value) => ipcRenderer.invoke('settings:set', key, value),
  },
  auth: {
    login: (payload) => ipcRenderer.invoke('auth:login', payload),
    logout: () => ipcRenderer.invoke('auth:logout'),
    getSession: () => ipcRenderer.invoke('auth:getSession'),
    syncToken: (token) => ipcRenderer.invoke('auth:syncToken', token),
  },
  // Extractor
  extractor: {
    saveData: (data) => ipcRenderer.invoke('extractor:saveData', data),
    getData: () => ipcRenderer.invoke('extractor:getData'),
  },
  // Registration
  registration: {
    save: (data) => ipcRenderer.invoke('registration:save', data),
    get: () => ipcRenderer.invoke('registration:get'),
  },
  importerEpr: {
    compute3aDraft: (payload) => ipcRenderer.invoke('importerEpr:compute3aDraft', payload),
    finalize3a: (payload) => ipcRenderer.invoke('importerEpr:finalize3a', payload),
    generate3bPdf: (payload) => ipcRenderer.invoke('importerEpr:generate3bPdf', payload),
  },
  // OCR (Gemini)
  ocr: {
    selectFiles: () => ipcRenderer.invoke('ocr:select-files'),
    selectFolder: () => ipcRenderer.invoke('ocr:select-folder'),
    selectUploads: () => ipcRenderer.invoke('ocr:select-uploads'),
    resolveUploads: (filePaths) => ipcRenderer.invoke('ocr:resolve-uploads', filePaths),
    inspectPaths: (filePaths) => ipcRenderer.invoke('ocr:inspect-paths', filePaths),
    extract: (payload) => ipcRenderer.invoke('ocr:extract', payload),
    extractBatch: (payload) => ipcRenderer.invoke('ocr:extract-batch', payload),
    onProgress: (callback) => {
      const handler = (_event, data) => callback(data);
      ipcRenderer.on('ocr:progress', handler);
      return () => ipcRenderer.removeListener('ocr:progress', handler);
    },
  },
  gstVerify: {
    probePartiesFromFiles: (payload) => ipcRenderer.invoke('gst:probe-parties', payload),
    verifyComplete: (payload) => ipcRenderer.invoke('gst:verify-complete', payload),
  },
  entityVerify: {
    lookupByGst: (payload) => ipcRenderer.invoke('entityVerify:lookupByGst', payload),
  },
  pibo: {
    search: (payload) => ipcRenderer.invoke('pibo:search', payload),
  },
  // Scraper
  scraper: {
    startRegistrationFlow: (payload) => ipcRenderer.invoke('scraper:startRegistrationFlow', payload),
    submitEmailOtp: (payload) => ipcRenderer.invoke('scraper:submitEmailOtp', payload),
    resendEmailOtp: () => ipcRenderer.invoke('scraper:resendEmailOtp'),
    submitMobileOtp: (payload) => ipcRenderer.invoke('scraper:submitMobileOtp', payload),
    resendMobileOtp: () => ipcRenderer.invoke('scraper:resendMobileOtp'),
    submitRegistrationCaptcha: (payload) => ipcRenderer.invoke('scraper:submitRegistrationCaptcha', payload),
    refreshRegistrationCaptcha: () => ipcRenderer.invoke('scraper:refreshRegistrationCaptcha'),
    startLoginFlow: (payload) => ipcRenderer.invoke('scraper:startLoginFlow', payload),
    submitLoginCaptcha: (payload) => ipcRenderer.invoke('scraper:submitLoginCaptcha', payload),
    refreshLoginCaptcha: () => ipcRenderer.invoke('scraper:refreshLoginCaptcha'),
    submitLoginOtp: (payload) => ipcRenderer.invoke('scraper:submitLoginOtp', payload),
    runApplicationOnboardingAfterLogin: (payload) => ipcRenderer.invoke('scraper:runApplicationOnboardingAfterLogin', payload),
    resendLoginOtp: () => ipcRenderer.invoke('scraper:resendLoginOtp'),
    answerPaymentBypass: (payload) => ipcRenderer.invoke('scraper:answerPaymentBypass', payload),
    onPaymentBypassPrompt: (callback) => {
      const handler = () => callback?.();
      ipcRenderer.on('scraper:payment-bypass-prompt', handler);
      return () => ipcRenderer.removeListener('scraper:payment-bypass-prompt', handler);
    },
    closeRegistrationSession: () => ipcRenderer.invoke('scraper:closeRegistrationSession'),
    runEpr: () => ipcRenderer.invoke('scraper:runEpr'),
    getProfile: () => ipcRenderer.invoke('scraper:getProfile'),
    getDashboardCards: () => ipcRenderer.invoke('scraper:getDashboardCards'),
    getPayments: () => ipcRenderer.invoke('scraper:getPayments'),
    getWallet: () => ipcRenderer.invoke('scraper:getWallet'),
    getWalletHistory: () => ipcRenderer.invoke('scraper:getWalletHistory'),
    getProcurement: (year) => ipcRenderer.invoke('scraper:getProcurement', year),
    getSales: (year) => ipcRenderer.invoke('scraper:getSales', year),
    getProduction: (year) => ipcRenderer.invoke('scraper:getProduction', year),
    getInventory: () => ipcRenderer.invoke('scraper:getInventory'),
    openCpcbPortal: (payload) => ipcRenderer.invoke('scraper:openCpcbPortal', payload),
    checkCpcbSession: (payload) => ipcRenderer.invoke('scraper:checkCpcbSession', payload),
    waitCpcbLogin: () => ipcRenderer.invoke('scraper:waitCpcbLogin'),
    fillProcurementBulk: (payload) => ipcRenderer.invoke('scraper:fillProcurementBulk', payload),
    fillSalesBulk: (payload) => ipcRenderer.invoke('scraper:fillSalesBulk', payload),
    prepareCpcbData: (payload) => ipcRenderer.invoke('scraper:prepareCpcbData', payload),
    startCpcbKeepAlive: () => ipcRenderer.invoke('scraper:startCpcbKeepAlive'),
    stopCpcbKeepAlive: () => ipcRenderer.invoke('scraper:stopCpcbKeepAlive'),
    pingCpcbSession: () => ipcRenderer.invoke('scraper:pingCpcbSession'),
    onPrepareProgress: (callback) => {
      const handler = (_event, payload) => callback?.(payload);
      ipcRenderer.on('scraper:prepare-progress', handler);
      return () => ipcRenderer.removeListener('scraper:prepare-progress', handler);
    },
    onLog: (callback) => {
      const handler = (_event, payload) => callback?.(payload);
      ipcRenderer.on('scraper:log', handler);
      return () => ipcRenderer.removeListener('scraper:log', handler);
    },
    onPortalToast: (callback) => {
      const handler = (_event, payload) => callback?.(payload);
      ipcRenderer.on('cpcb:portal-toast', handler);
      return () => ipcRenderer.removeListener('cpcb:portal-toast', handler);
    },
  },
  // EPR Scraped Data (SQLite)
  eprData: {
    getProcurement: () => ipcRenderer.invoke('eprData:getProcurement'),
    getSales: () => ipcRenderer.invoke('eprData:getSales'),
    getProduction: () => ipcRenderer.invoke('eprData:getProduction'),
    getInventory: () => ipcRenderer.invoke('eprData:getInventory'),
    getConversionFactor: () => ipcRenderer.invoke('eprData:getConversionFactor'),
    getNewApplicationData: () => ipcRenderer.invoke('eprData:getNewApplicationData'),
    openDocument: (filename) => ipcRenderer.invoke('eprData:openDocument', filename),
  },
  // Local Production (User Entries)
  localProduction: {
    getAll: (filters) => ipcRenderer.invoke('localProduction:getAll', filters),
    add: (data) => ipcRenderer.invoke('localProduction:add', data),
    bulkAdd: (rows) => ipcRenderer.invoke('localProduction:bulkAdd', rows),
    update: (data) => ipcRenderer.invoke('localProduction:update', data),
    delete: (id) => ipcRenderer.invoke('localProduction:delete', id),
    updateQualifyingFeed: (data) => ipcRenderer.invoke('localProduction:updateQualifyingFeed', data),
  },
  // Credit Calculations
  creditCalculations: {
    getAll: () => ipcRenderer.invoke('creditCalculations:getAll'),
    add: (data) => ipcRenderer.invoke('creditCalculations:add', data),
    update: (data) => ipcRenderer.invoke('creditCalculations:update', data),
    delete: (id) => ipcRenderer.invoke('creditCalculations:delete', id),
  },
  // Supplier Master
  supplierMaster: {
    getAll: (filters) => ipcRenderer.invoke('supplierMaster:getAll', filters),
    add: (data) => ipcRenderer.invoke('supplierMaster:add', data),
    update: (data) => ipcRenderer.invoke('supplierMaster:update', data),
    bulkUpsert: (payload) => ipcRenderer.invoke('supplierMaster:bulkUpsert', payload),
    delete: (id) => ipcRenderer.invoke('supplierMaster:delete', id),
  },
  // Packaging Master
  packagingMaster: {
    getAll: (filters) => ipcRenderer.invoke('packagingMaster:getAll', filters),
    lookup: (payload) => ipcRenderer.invoke('packagingMaster:lookup', payload),
    add: (data) => ipcRenderer.invoke('packagingMaster:add', data),
    update: (data) => ipcRenderer.invoke('packagingMaster:update', data),
    updateMany: (payload) => ipcRenderer.invoke('packagingMaster:updateMany', payload),
    delete: (id) => ipcRenderer.invoke('packagingMaster:delete', id),
    deleteMany: (ids) => ipcRenderer.invoke('packagingMaster:deleteMany', ids),
    bulkUpsert: (payload) => ipcRenderer.invoke('packagingMaster:bulkUpsert', payload),
    repair: (payload) => ipcRenderer.invoke('packagingMaster:repair', payload),
  },
  monitoring: {
    getConfig: () => ipcRenderer.invoke('monitoring:getConfig'),
    getDiagnostics: () => ipcRenderer.invoke('monitoring:getDiagnostics'),
    reportError: (payload) => ipcRenderer.invoke('monitoring:reportError', payload),
    setUser: (user) => ipcRenderer.invoke('monitoring:setUser', user),
    flush: () => ipcRenderer.invoke('monitoring:flush'),
    copyDiagnostics: () => ipcRenderer.invoke('monitoring:copyDiagnostics'),
    sendTest: () => ipcRenderer.invoke('monitoring:sendTest'),
  },
});

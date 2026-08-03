import { contextBridge, ipcRenderer, webUtils } from 'electron';

contextBridge.exposeInMainWorld('pwp', {
  // webUtils
  webUtils: {
    getPathForFile: (file) => webUtils.getPathForFile(file),
  },
  // FS
  fs: {
    readFileBase64: (filePath) => ipcRenderer.invoke('fs:readFileBase64', filePath),
  },
  // Companies
  companies: {
    getAll: () => ipcRenderer.invoke('companies:getAll'),
    add: (data) => ipcRenderer.invoke('companies:add', data),
    update: (data) => ipcRenderer.invoke('companies:update', data),
    delete: (id) => ipcRenderer.invoke('companies:delete', id),
  },
  // Purchases
  purchases: {
    getAll: (filters) => ipcRenderer.invoke('purchases:getAll', filters),
    add: (data) => ipcRenderer.invoke('purchases:add', data),
    update: (data) => ipcRenderer.invoke('purchases:update', data),
    delete: (id) => ipcRenderer.invoke('purchases:delete', id),
    getSummary: (filters) => ipcRenderer.invoke('purchases:getSummary', filters),
  },
  // EPR Scraped Data (SQLite)
  eprData: {
    getProcurement: () => ipcRenderer.invoke('eprData:getProcurement'),
    getSales: () => ipcRenderer.invoke('eprData:getSales'),
    getProduction: () => ipcRenderer.invoke('eprData:getProduction'),
  },

  // Sales
  sales: {
    getAll: (filters) => ipcRenderer.invoke('sales:getAll', filters),
    add: (data) => ipcRenderer.invoke('sales:add', data),
    update: (data) => ipcRenderer.invoke('sales:update', data),
    delete: (id) => ipcRenderer.invoke('sales:delete', id),
    getSummary: (filters) => ipcRenderer.invoke('sales:getSummary', filters),
  },
  // Dashboard
  dashboard: {
    getStats: () => ipcRenderer.invoke('dashboard:getStats'),
  },
  // OCR (Gemini + local QR)
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
  // Scraper
  scraper: {
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
    startCpcbKeepAlive: () => ipcRenderer.invoke('scraper:startCpcbKeepAlive'),
    stopCpcbKeepAlive: () => ipcRenderer.invoke('scraper:stopCpcbKeepAlive'),
    pingCpcbSession: () => ipcRenderer.invoke('scraper:pingCpcbSession'),
    onLog: (callback) => {
      const handler = (_event, payload) => callback?.(payload);
      ipcRenderer.on('scraper:log', handler);
      return () => ipcRenderer.removeListener('scraper:log', handler);
    },
  },
});

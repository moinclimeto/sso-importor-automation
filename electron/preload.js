import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('pwp', {
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
  // OCR (Gemini)
  ocr: {
    selectFiles: () => ipcRenderer.invoke('ocr:select-files'),
    selectFolder: () => ipcRenderer.invoke('ocr:select-folder'),
    extract: (payload) => ipcRenderer.invoke('ocr:extract', payload),
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
  },
});

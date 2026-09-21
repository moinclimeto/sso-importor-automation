# Climeto PWP — Full Technical Documentation

**Project:** `sso-importor-automation`  
**Product name:** Climeto PWP (PIBO Importer)  
**Version:** 1.0.0  
**Type:** Windows Desktop Application (Electron + React)  
**Purpose:** CPCB EPR registration, invoice/document OCR, procurement/sales management, and CPCB portal automation for plastic waste processors (PIBO/Importer).

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Architecture](#2-system-architecture)
3. [Technology Stack](#3-technology-stack)
4. [Project Structure](#4-project-structure)
5. [Electron Main Process (Backend)](#5-electron-main-process-backend)
6. [React Frontend](#6-react-frontend)
7. [Shared Business Logic](#7-shared-business-logic)
8. [Database (SQLite)](#8-database-sqlite)
9. [IPC Communication Layer](#9-ipc-communication-layer)
10. [External Systems & Server Side](#10-external-systems--server-side)
11. [Module Reference (Detailed)](#11-module-reference-detailed)
12. [Build, Release & Deployment](#12-build-release--deployment)
13. [Security Model](#13-security-model)
14. [Monitoring, Telemetry & Updates](#14-monitoring-telemetry--updates)
15. [Environment Variables](#15-environment-variables)
16. [Data Flow Diagrams](#16-data-flow-diagrams)
17. [Testing](#17-testing)
18. [System Requirements](#18-system-requirements)
19. [Troubleshooting](#19-troubleshooting)

---

## 1. Executive Summary

Climeto PWP is a **desktop-first** application. Each user runs their own instance on Windows. There is **no embedded HTTP server** in the app — business logic runs in the Electron **main process**, UI in the **renderer**, and data is stored locally in **SQLite**.

| Layer | Technology | Location |
|-------|------------|----------|
| Desktop shell | Electron 39 | `electron/main.js` |
| UI | React 19 + Vite + Tailwind | `src/` |
| Local database | SQLite (WAL mode) | `%APPDATA%\sso-importor-automation\` |
| Portal automation | Playwright Chromium | `electron/automation/` |
| Invoice OCR | Google Gemini API | `electron/ocr_captcha/` |
| Remote auth/API | Climeto Backend | `https://api.climeto.in/api` |
| Auto-update | electron-updater | `https://api.climeto.in/desktop/stable` |
| Error tracking | Sentry | Main + Renderer |

**Important:** This is not a web app with a separate Node backend repo inside the project. The "backend" for desktop users **is the Electron main process**. The Climeto API on VPS is the **remote server**.

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         USER WINDOWS PC                                 │
│                                                                         │
│  ┌──────────────────────┐         IPC (invoke/on)    ┌────────────────┐ │
│  │   React Renderer     │ ◄────────────────────────► │ Electron Main  │ │
│  │   (src/)             │                          │ (electron/)    │ │
│  │   HashRouter UI      │                          │                │ │
│  └──────────────────────┘                          │  ├─ SQLite     │ │
│         ▲ preload.cjs (window.pwp)                 │  ├─ Playwright │ │
│         │ contextBridge                            │  ├─ Gemini OCR │ │
│         │                                          │  ├─ IPC 133 ch │ │
│  ┌──────┴───────┐                                   │  └─ Monitoring │ │
│  │ index.html   │                                   └───────┬────────┘ │
│  │ dist/ (prod) │                                           │          │
│  │ Vite :5180   │                                           │          │
│  └──────────────┘                                           │          │
└─────────────────────────────────────────────────────────────┼──────────┘
                                                              │
                    ┌─────────────────────────────────────────┼──────────┐
                    │              INTERNET                     │          │
                    │                                         ▼          │
                    │   https://api.climeto.in/api  ◄── Auth, GST, PIBO  │
                    │   https://api.climeto.in/desktop/stable ◄ Updates  │
                    │   https://epr.cpcb.gov.in ◄── Playwright portal  │
                    │   Google Gemini API ◄── Invoice OCR                │
                    │   Sentry ◄── Crash reports                         │
                    └────────────────────────────────────────────────────┘
```

### Process Model

| Process | Role |
|---------|------|
| **Main** | Database, file I/O, Playwright, OCR, auth, IPC handlers |
| **Renderer** | React UI only — no direct Node/file access |
| **Preload** | Secure bridge: exposes `window.pwp` API |
| **Playwright Chromium** | Separate browser process for CPCB portal |
| **Optional worker** | BullMQ + Redis Gemini worker (`worker/`, Docker) |

### Single-User Constraints

| Mechanism | File | Purpose |
|-----------|------|---------|
| Single app instance | `electron/platform/singleInstance.js` | Prevents two apps corrupting SQLite |
| Single CPCB browser | `electron/ipc/ipcHandlers.js` | One Playwright context per machine |
| Climeto session conflict | `electron/authService.js` | API 409 if logged in elsewhere |
| OCR concurrency | `electron/ocr_captcha/extractQueue.js` | `p-limit` (default 20 parallel jobs) |

---

## 3. Technology Stack

### Core

| Package | Version | Purpose |
|---------|---------|---------|
| electron | ^39.2 | Desktop runtime |
| react | ^19.1 | UI framework |
| vite | ^7.1 | Frontend bundler |
| react-router-dom | ^7.9 | Client routing (HashRouter) |
| tailwindcss | ^3.4 | Styling |
| sqlite3 / sqlite | ^6 / ^5 | Local database |

### Automation & Documents

| Package | Purpose |
|---------|---------|
| playwright | CPCB portal browser automation |
| @google/generative-ai | Gemini invoice OCR |
| pdf-lib, pdf-to-img, pdfjs-dist | PDF processing |
| sharp, @napi-rs/canvas | Image rendering |
| tesseract.js, @undecaf/zbar-wasm | Captcha/QR fallback |
| exceljs, xlsx | Excel import/export |
| Ghostscript (bundled) | PDF compression for CPCB upload |

### Infrastructure

| Package | Purpose |
|---------|---------|
| @sentry/electron | Error/crash monitoring |
| electron-updater | Auto-update from VPS |
| axios | HTTP to Climeto API |
| bullmq, ioredis | Optional distributed OCR (not in installer) |
| electron-builder | NSIS Windows installer |

---

## 4. Project Structure

```
sso-importor-automation/
├── electron/                 # Main process (desktop "backend")
│   ├── main.js               # App entry point
│   ├── preload.cjs           # IPC bridge → window.pwp
│   ├── ipc/ipcHandlers.js    # 105 domain IPC handlers
│   ├── automation/           # Playwright CPCB flows (16 files)
│   ├── ocr_captcha/          # OCR, QR, captcha (9 files)
│   ├── db/                   # SQLite + 26 migrations
│   ├── monitoring/           # Sentry, crash store (8 files)
│   ├── telemetry/            # Usage events to Climeto API
│   ├── updater/              # electron-updater
│   ├── platform/             # singleInstance lock
│   ├── reports/              # Importer EPR PDF reports
│   ├── utils/                # PDF, hash, letters, logger
│   └── ghostscript/          # Bundled at build time (gitignored)
│
├── src/                      # React frontend
│   ├── pages/                # 28 route pages
│   ├── components/           # 37+ UI components
│   ├── routes/AppRoutes.jsx  # HashRouter routes
│   ├── context/              # Auth, PageHeader
│   ├── config/               # API endpoints, axios
│   ├── utils/                # Mappers, Excel, registration helpers
│   ├── extractors/epr/       # CPCB scraper scripts (.cjs)
│   └── monitoring/           # Renderer Sentry init
│
├── shared/                   # Isomorphic business logic + tests
├── scripts/                  # Build, publish, setup utilities
├── worker/                   # Optional BullMQ Gemini worker
├── deploy/                   # VPS nginx + setup scripts
├── docs/                     # Documentation
├── vendor/                   # Playwright browsers, VC++ (build time)
├── assets/                   # Icons
├── build/                    # NSIS installer hooks
├── release/                  # electron-builder output
└── dist/                     # Vite production build
```

---

## 5. Electron Main Process (Backend)

The main process is the **local backend** for the desktop app. All privileged operations happen here.

### 5.1 Bootstrap Sequence (`electron/main.js`)

```
1. initMainMonitoring()     → Sentry + crash handlers
2. loadEnvFile()            → .env from project / APPDATA / installer bundle
3. enforceSingleInstance()  → Block second app instance
4. register IPC handlers  → monitoring, updater, telemetry
5. createWindow()           → BrowserWindow + preload
6. initDatabase()           → SQLite + migrations
7. startTelemetry()         → Usage event queue
8. initAutoUpdater()        → Check VPS for updates (packaged only)
9. registerAuthHandlers()   → Climeto login IPC
10. registerIpcHandlers()   → All domain IPC (lazy import)
```

### 5.2 Key Main Modules

| Module | Path | Responsibility |
|--------|------|----------------|
| **App paths** | `appPaths.js` | DB path, logs, renderer HTML, startup.log |
| **Env loader** | `loadEnv.js` | Multi-source .env loading |
| **API config** | `climetoApiConfig.js` | Climeto base URL, JWT token resolution |
| **Auth** | `authService.js`, `authHandlers.js` | Login/logout, session in SQLite |
| **GST verify** | `gstVerifyService.js`, `gstVerifyHandlers.js` | Party GST validation |
| **PIBO search** | `piboEntitiesService.js` | Entity lookup via Climeto API |
| **Supplier master** | `supplierMasterService.js` | Supplier CRUD + bulk upsert |
| **Packaging master** | `packagingMasterService.js` | GPL/packaging data |
| **Duplicate check** | `invoiceDuplicateCheck.js` | SHA256 file hash dedup |
| **Importer EPR** | `reports/importerEprService.js` | Section 3a/3b report generation |

### 5.3 Automation Module (`electron/automation/`)

Playwright-based CPCB portal automation.

| File | Function |
|------|----------|
| `playwrightRuntime.js` | Chromium launch with bundled browser path |
| `playwrightEnv.js` | Resolves `vendor/playwright-browsers/` |
| `cpcbBrowserLaunch.js` | Persistent browser context options |
| `cpcbLogin.js` | CPCB login, OTP, captcha |
| `cpcbRegistration.js` | Full registration flow (email/mobile OTP) |
| `fillRegistrationForms.js` | Part A/B/C form automation |
| `cpcbEprScraper.js` | Scrape EPR dashboard data |
| `cpcbProcurementBulk.js` | Bulk fill procurement on portal |
| `cpcbSalesBulk.js` | Bulk fill sales on portal |
| `portalPartBSection4.js` | Part B Section 4 automation |
| `portalPartBSection5.js` | Part B Section 5 automation |
| `portalPlasticConsumed.js` | Plastic consumed 3c automation |
| `portalToastWatcher.js` | Watch CPCB toast messages → IPC event |
| `portalErrorGuard.js` | Detect portal errors |
| `paymentBypassBridge.js` | Payment bypass user prompt |
| `registrationPartBData.js` | Part B data mapping for portal |

**Browser session:** Persistent context stored at `%APPDATA%\sso-importor-automation\cpcb-browser-session`

### 5.4 OCR Module (`electron/ocr_captcha/`)

| File | Function |
|------|----------|
| `ocrHandlers.js` | IPC: file select, batch extract |
| `ocrExtract.js` | Gemini API invoice field extraction |
| `extractQueue.js` | Parallel batch queue (`p-limit`, default 20) |
| `qrScan.js` | QR from PDF (Docker/Python/ZBar/BarcodeDetector) |
| `qrScanBrowser.js` | In-renderer QR fallback |
| `captchaPortal.js` | CPCB captcha image preprocessing + Tesseract |
| `captchaSolver.js` | Captcha solving orchestration |
| `captchaGoogleVision.js` | Optional Vision API captcha |

**OCR pipeline:**
```
PDF/Image → page split → QR scan (invoice JWT) → Gemini OCR (line items)
         → GST party probe → entity verify → save to purchases/sales SQLite
```

### 5.5 Database Module (`electron/db/`)

| File | Function |
|------|----------|
| `database.js` | Connection, WAL, migration runner, scraper table bootstrap |
| `registrationDb.js` | Registration details CRUD |
| `dataMigration.js` | Legacy `db.json` → SQLite one-time import |
| `migrations/*.js` | 26 versioned schema migrations |

**DB file locations:**
- **Production:** `%APPDATA%\sso-importor-automation\sso_importer.db`
- **Development:** `{projectRoot}/sso_importer.db`

---

## 6. React Frontend

### 6.1 Entry & Routing

| File | Role |
|------|------|
| `src/main.jsx` | React root + renderer monitoring init |
| `src/App.jsx` | AuthProvider + ErrorBoundary + UpdateBanner |
| `src/routes/AppRoutes.jsx` | HashRouter, protected routes |

**Default route:** `/` → `/cpcb-dashboard`

### 6.2 Active Navigation (Sidebar)

From `src/components/MainLayout.jsx`:

| Nav Item | Route | Page |
|----------|-------|------|
| CPCB Dashboard | `/cpcb-dashboard` | Scraped EPR data overview |
| Doc Processor | `/doc-processor` | Invoice upload + OCR |
| Master Data | `/master-data` | Company, supplier, packaging, MT reports |
| Diagnostics | `/diagnostics` | System info, Sentry, updates |

### 6.3 All Routes

| Route | Component | Description |
|-------|-----------|-------------|
| `/login` | `Login.jsx` | Climeto dashboard login |
| `/cpcb-dashboard` | `CpcbDashboard.jsx` | EPR scraped data cards |
| `/dashboard` | `Dashboard.jsx` | Purchase/sale overview |
| `/master-data` | `MasterDataPage.jsx` | Tabbed master data hub |
| `/doc-processor` | `DocProcessor.jsx` | Document processing hub |
| `/doc-upload` | `DocUpload.jsx` | Batch PDF upload |
| `/doc-table` | `DocTable.jsx` | Processed document table |
| `/purchases` | `Purchases.jsx` | Procurement list |
| `/sales` | `Sales.jsx` | Sales list |
| `/summary` | `Summary.jsx` | Summary stats |
| `/procurement-review/:id` | `ProcurementReview.jsx` | Single purchase review/edit |
| `/sales-review/:id` | `SalesReview.jsx` | Single sale review/edit |
| `/production-entry` | `ProductionEntryPage.jsx` | Local production data |
| `/credit-calculations` | `CreditCalculations.jsx` | EPR credit calculations |
| `/cpcb-registration` | `CpcbRegistrationPage.jsx` | CPCB portal registration wizard |
| `/new-application` | `NewApplicationPage.jsx` | New EPR application |
| `/diagnostics` | `DiagnosticsPage.jsx` | Monitoring + update check |
| `/epr-*` | Various | Scraped EPR data views |

### 6.4 Key Components

| Component | Purpose |
|-----------|---------|
| `RegistrationPartA/B/C.jsx` | CPCB registration form sections |
| `RegistrationDocUpload.jsx` | Company document uploads |
| `RegistrationAutomationModal.jsx` | Playwright automation UI + logs |
| `ImporterEprWorkbench.jsx` | Importer EPR Section 3a/3b/3c |
| `RegisteredEntityVerify.jsx` | GST entity verification UI |
| `PiboMasterListPicker.jsx` | PIBO entity search picker |
| `UpdateBanner.jsx` | Real-time auto-update notifications |
| `ErrorBoundary.jsx` | React error → Sentry |
| `MainLayout.jsx` | Sidebar, header, toast, page context |

### 6.5 State Management

| Mechanism | Usage |
|-----------|-------|
| `AuthContext` | Login session, token, user profile |
| `PageHeaderContext` | Dynamic page title/subtitle/actions |
| `localStorage` | Token mirror, currentUser |
| `window.pwp.*` | All data operations via IPC |
| IPC events | Real-time OCR progress, scraper logs, updates |

**No Redux/Zustand** — data fetched via IPC invoke, refreshed after operations.

### 6.6 Renderer API Access

All backend calls go through `window.pwp` defined in `electron/preload.cjs`:

```javascript
// Examples
await window.pwp.auth.login({ email, password });
await window.pwp.purchases.getAll({ company_id: 1 });
await window.pwp.ocr.extractBatch({ filePaths, type: 'purchase' });
await window.pwp.scraper.startRegistrationFlow(payload);

// Real-time listeners
window.pwp.ocr.onProgress((data) => { /* update UI */ });
window.pwp.scraper.onLog((msg) => { /* append log */ });
window.pwp.app.onUpdateEvent('app:update-available', (info) => { /* banner */ });
```

---

## 7. Shared Business Logic

`shared/` contains pure JavaScript used by both main process and tests.

| File | Purpose |
|------|---------|
| `importerSection3a.js` | Importer EPR 3a calculations |
| `packagingMasterSync.js` | Sync packaging from sales/purchases |
| `plasticConsumed3c.js` | Section 3c plastic consumed logic |
| `partBSection4.js` | Part B Section 4 field mapping |
| `cpcbPortalFileName.js` | CPCB upload filename validation |
| `companyDocNormalize.js` | Company document normalization |
| `gstStateCodes.js` | GST state code mapping |
| `hsnUtils.js` | HSN code utilities |
| `invoiceDuplicate.js` | Duplicate detection helpers |
| `reviewEnrichment.js` | Review screen data enrichment |
| `piboEntityMasterData.js` | PIBO entity master mapping |

**Tests:** `shared/*.test.js` (5 files, 23 test cases)

---

## 8. Database (SQLite)

### 8.1 Engine Configuration

- **Mode:** WAL (Write-Ahead Logging)
- **Foreign keys:** Enabled
- **Migrations:** Sequential via `_migrations` table
- **Legacy import:** `db.json` → SQLite on first run

### 8.2 Core Tables

| Table | Purpose |
|-------|---------|
| `companies` | Company profiles, bank details, GSTIN |
| `purchases` | Procurement invoices (OCR + manual) |
| `sales` | Sales invoices |
| `file_hashes` | SHA256 dedup for uploaded files |
| `company_documents` | GST cert, PAN, Udyam, CTO, electricity bills |
| `registration_details` | CPCB registration form state (JSON blobs) |
| `supplier_master` | Supplier GST, legal name, PIBO fields |
| `packaging_master` | Product GPL, category, conversion factor |
| `local_productions` | User-entered production data |
| `credit_calculations` | EPR credit calculation records |
| `app_settings` | Key-value (Climeto session, config) |

### 8.3 Scraped EPR Tables (from CPCB portal)

| Table | Data |
|-------|------|
| `scraped_procurement_fy` | Procurement by financial year |
| `scraped_sales_fy` | Sales by financial year |
| `scraped_new_application` | New application scraped data |
| `scraped_plastic_consumed` | Plastic consumed 3c |
| `scraped_wallet_transactions` | EPR wallet transactions |
| `scraped_road_making` | Road making data |
| `epr_dashboard`, `epr_profile`, `epr_payment` | Dashboard cards |
| `procurement_details`, `sales_details`, `production_details` | Legacy scraped JSON |
| `conversion_factor`, `new_application` | Portal reference data |

### 8.4 Migration History (26 files)

```
001_initial_schema          → companies, purchases, sales
002_create_file_hashes      → duplicate detection
003_add_bank_details        → company bank fields
003_create_local_productions
004_create_app_settings
004_create_credit_calculations
005-006                     → production calc fields
007-008                     → company_documents
009-013                     → udyam, CTO, electricity, registration
014                         → master tables + file_hash on docs
015-018                     → purchase/sales review columns
019                         → normalized scraped data tables
020-021                     → supplier PIBO + importer EPR fields
```

---

## 9. IPC Communication Layer

**Total handlers:** 133 (`ipcMain.handle`)  
**Bridge:** `electron/preload.cjs` → `window.pwp`

### 9.1 Auth (4 channels)

```
auth:login, auth:logout, auth:getSession, auth:syncToken
```

### 9.2 OCR (7 channels)

```
ocr:select-files, ocr:select-folder, ocr:select-uploads
ocr:resolve-uploads, ocr:inspect-paths, ocr:extract, ocr:extract-batch
```

### 9.3 GST / Entity / PIBO (5 channels)

```
gst:probe-parties, gst:verify-complete
entityVerify:lookupByGst, entityVerify:applySelection
pibo:search
```

### 9.4 Scraper / CPCB Portal (28 channels)

```
scraper:startRegistrationFlow, scraper:submitEmailOtp, scraper:resendEmailOtp
scraper:submitMobileOtp, scraper:resendMobileOtp
scraper:submitRegistrationCaptcha, scraper:refreshRegistrationCaptcha
scraper:startLoginFlow, scraper:submitLoginCaptcha, scraper:refreshLoginCaptcha
scraper:submitLoginOtp, scraper:resendLoginOtp
scraper:runApplicationOnboardingAfterLogin
scraper:answerPaymentBypass, scraper:closeRegistrationSession
scraper:runEpr, scraper:getProfile, scraper:getDashboardCards
scraper:getPayments, scraper:getWallet, scraper:getWalletHistory
scraper:getProcurement, scraper:getSales, scraper:getProduction, scraper:getInventory
scraper:openCpcbPortal, scraper:checkCpcbSession, scraper:waitCpcbLogin
scraper:fillProcurementBulk, scraper:fillSalesBulk, scraper:prepareCpcbData
scraper:startCpcbKeepAlive, scraper:stopCpcbKeepAlive, scraper:pingCpcbSession
```

### 9.5 Business Data (remaining ~80 channels)

Companies, documents, purchases, sales, dashboard, settings, filesystem,  
local production, credit calculations, supplier/packaging master, letters,  
importer EPR, EPR scraped data, invoices export, registration, extractor.

### 9.6 Push Events (Main → Renderer)

| Event | Trigger |
|-------|---------|
| `ocr:progress` | OCR batch progress % |
| `scraper:log` | Automation log line |
| `scraper:prepare-progress` | CPCB bulk prep progress |
| `scraper:payment-bypass-prompt` | User decision needed |
| `cpcb:portal-toast` | Portal toast notification |
| `app:update-*` | Auto-update lifecycle |

---

## 10. External Systems & Server Side

### 10.1 Climeto API (VPS — `api.climeto.in`)

**Host:** Hostinger VPS (`147.79.67.71`)  
**Backend:** Node.js on `127.0.0.1:5000` (PM2/Docker)  
**Nginx:** Reverse proxy + SSL (Certbot)

| Endpoint | Method | Used For |
|----------|--------|----------|
| `/api/auth/login` | POST | User authentication |
| `/api/gst/verify/complete` | POST | GST party verification |
| `/api/pibo-entities/search` | GET | PIBO entity lookup |
| `/api/pwp/telemetry` | POST | Desktop usage events |
| `/api/desktop/crash-reports` | POST | Optional crash webhook |

**Session:** JWT stored in SQLite `app_settings` key `climeto_user_session`

### 10.2 Auto-Update Feed (Same VPS)

| URL | File |
|-----|------|
| `https://api.climeto.in/desktop/stable/latest.yml` | Version metadata |
| `https://api.climeto.in/desktop/stable/Climeto PWP Setup X.Y.Z.exe` | NSIS installer |

**VPS folder:** `/var/www/downloads/desktop/stable/`  
**Nginx block:** Already in `api.climeto.in` config (`location ^~ /desktop/stable/`)

**Publish command:** `npm run electron:release`

### 10.3 CPCB Portal (`epr.cpcb.gov.in`)

Accessed only via Playwright automation — not direct API from renderer.

| Operation | Module |
|-----------|--------|
| Registration + OTP | `cpcbRegistration.js` |
| Login + captcha | `cpcbLogin.js` |
| EPR data scrape | `cpcbEprScraper.js` + `src/extractors/epr/` |
| Bulk form fill | `cpcbProcurementBulk.js`, `cpcbSalesBulk.js` |
| Part B sections | `portalPartBSection4.js`, `portalPartBSection5.js` |

### 10.4 Google Gemini API

| Use | Config |
|-----|--------|
| Invoice OCR text extraction | `GEMINI_API_KEY`, `GEMINI_API_KEY1+` (rotation) |
| Model | `GEMINI_MODEL` (default: gemini-flash-lite-latest) |
| Concurrency | `GEMINI_MAX_CONCURRENT` (default: 20) |

### 10.5 Sentry

| Process | Init File |
|---------|-----------|
| Main | `electron/monitoring/init.js` |
| Renderer | `src/monitoring/initRenderer.js` |
| Preload | `@sentry/electron/preload` |

---

## 11. Module Reference (Detailed)

### Module 1: Doc Processor (Invoice OCR)

**UI:** `src/pages/DocUpload.jsx`, `DocProcessor.jsx`, `DocTable.jsx`  
**Backend:** `ocrHandlers.js` → `ocrExtract.js` → `extractQueue.js`

**Flow:**
1. User selects PDF folder/files
2. PDF split into pages (`pdfPages.js`)
3. Each page → Gemini OCR → structured invoice JSON
4. QR scan for e-invoice JWT (optional)
5. GST party probe → entity verify via Climeto API
6. Duplicate check via `file_hashes`
7. Save to `purchases` or `sales` table
8. Sync packaging master (`packagingMasterSync.js`)

### Module 2: Master Data

**UI:** `src/pages/MasterDataPage.jsx` (tabs)  
**Sub-pages:** Companies, SupplierMaster, PackagingMaster, PlasticMtReports

| Tab | IPC | Table |
|-----|-----|-------|
| Company | `companies:*`, `documents:*` | companies, company_documents |
| Supplier | `supplierMaster:*` | supplier_master |
| Packaging | `packagingMaster:*` | packaging_master |
| MT Reports | `importerEpr:*` | computed from purchases/sales |

### Module 3: CPCB Registration

**UI:** `CpcbRegistrationPage.jsx`  
**Backend:** `cpcbRegistration.js`, `fillRegistrationForms.js`, `registrationDb.js`

**Steps:**
1. Part A — Company profile + document uploads
2. Part B — Production, procurement, sales declarations
3. Part C — EPR targets, letter generation
4. Playwright automates portal form fill + OTP/captcha bridges

### Module 4: New Application

**UI:** `NewApplicationPage.jsx`  
**Backend:** Scraper + `scraped_new_application` table

### Module 5: CPCB Dashboard

**UI:** `CpcbDashboard.jsx`, `ScrapedDashboard.jsx`  
**Backend:** `cpcbEprScraper.js`, `eprData:*` IPC

Displays scraped procurement, sales, production, wallet data from CPCB portal.

### Module 6: Bulk Portal Upload

**UI:** Purchases/Sales pages → "Upload to CPCB" actions  
**Backend:** `cpcbProcurementBulk.js`, `cpcbSalesBulk.js`

Prepares local SQLite records → fills CPCB portal forms via Playwright.

### Module 7: Importer EPR Reports

**UI:** `ImporterEprWorkbench.jsx`, Section 3a/3b/3c panels  
**Backend:** `importerEprService.js`, `shared/importerSection3a.js`

Generates EPR compliance reports and PDF exports for importer obligations.

### Module 8: Diagnostics & Monitoring

**UI:** `DiagnosticsPage.jsx`  
**Backend:** `monitoring/*`, `updater/*`, `telemetry/*`

Shows OS info, RAM, Sentry status, pending crash uploads, manual update check.

---

## 12. Build, Release & Deployment

### 12.1 Development

```bash
npm install
npm run electron:dev
# → Vite on http://127.0.0.1:5180 + Electron window
```

### 12.2 Production Build

```bash
npm run electron:build
```

**Pre-build (`prepare-installer.mjs`):**
1. Download Ghostscript → `electron/ghostscript/`
2. Download Playwright Chromium → `vendor/playwright-browsers/`
3. Download VC++ redist → `vendor/vcredist/`
4. Copy `.env` → `vendor/app-env/`

**Output:** `release/Climeto PWP Setup X.Y.Z.exe` + `latest.yml`

### 12.3 Release Publish

```bash
# Bump version in package.json first
npm run electron:release
# = electron:build + publish:release (SCP to VPS)
```

### 12.4 CI

`.github/workflows/ci.yml` — runs `npm run test:ci` on push/PR (Node 20)

### 12.5 Optional Docker Worker

```bash
docker-compose up   # Redis + gemini-worker
```

Used for distributed OCR — **not bundled in desktop installer**.

---

## 13. Security Model

| Area | Implementation |
|------|----------------|
| Renderer isolation | `contextIsolation: true`, `nodeIntegration: false` |
| IPC surface | Whitelisted channels in preload only |
| Auth token | JWT in SQLite + localStorage mirror |
| API keys | `.env` / `%APPDATA%\.env` — not in git |
| Secrets in installer | `vendor/app-env/.env` at build time |
| Crash reports | PII sanitized via `monitoring/sanitize.js` |
| Sentry | `sendDefaultPii: false` |
| Single instance | Prevents SQLite corruption |
| Session conflict | Climeto API 409 on duplicate login |

**Recommendations (future):**
- OS keychain for JWT (`safeStorage`)
- Server-side Gemini proxy (hide API keys from installer)
- Code signing for Windows SmartScreen

---

## 14. Monitoring, Telemetry & Updates

### 14.1 Error Monitoring (Sentry)

| Feature | Details |
|---------|---------|
| Uncaught exceptions | Main + renderer |
| Window crashes | render-process-gone, did-fail-load |
| React errors | ErrorBoundary → reportError IPC |
| Old Windows detection | GPU workaround auto-applied |
| Diagnostics UI | Copy report, send test, flush queue |

### 14.2 Usage Telemetry

| Event | When |
|-------|------|
| `app_session_start` | App launch |
| `app_session_end` | App quit |
| `user_login` / `user_logout` | Auth events |
| `update_available` / `update_downloaded` | Auto-update |
| Custom | `window.pwp.telemetry.track(name, props)` |

**Endpoint:** `POST /api/pwp/telemetry` (batched, every 30s)

### 14.3 Auto-Update

| Setting | Default |
|---------|---------|
| Feed URL | `https://api.climeto.in/desktop/stable` |
| Check on startup | 15 seconds after launch |
| Periodic check | Every 4 hours |
| Auto-download | Enabled |
| UI | `UpdateBanner.jsx` (real-time IPC events) |

---

## 15. Environment Variables

See `.env.example` for full list. Key groups:

| Group | Variables |
|-------|-----------|
| Gemini OCR | `GEMINI_API_KEY`, `GEMINI_API_KEY1+`, `GEMINI_MODEL`, `GEMINI_MAX_CONCURRENT` |
| Climeto API | `Climeto_Api_BASE_URL`, `Climeto_Api_TOKEN` |
| QR Scanning | `QR_SCAN_MODE`, `QR_DOCKER_IMAGE`, `QR_SCAN_DPI` |
| Sentry | `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `CRASH_REPORT_URL` |
| Auto-update | `UPDATE_FEED_URL`, `UPDATE_AUTO_DOWNLOAD`, `UPDATE_CHECK_INTERVAL_MS` |
| VPS Publish | `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY_PATH`, `VPS_RELEASE_PATH` |
| Telemetry | `TELEMETRY_URL`, `TELEMETRY_DISABLED` |
| GPU | `PWP_DISABLE_GPU`, `PWP_FORCE_GPU` |

**Load order:**
1. Project root `.env`
2. `%APPDATA%\sso-importor-automation\.env`
3. Bundled `resources/app-env/.env` (installed app)

---

## 16. Data Flow Diagrams

### Login Flow

```
Login.jsx
  → AuthContext.login()
  → window.pwp.auth.login({ email, password })
  → authHandlers → authService
  → POST https://api.climeto.in/api/auth/login
  → SQLite app_settings (JWT + user)
  → localStorage token
  → ProtectedRoute allows access
```

### Invoice Upload Flow

```
DocUpload.jsx
  → ocr:select-folder / select-files
  → ocr:extract-batch { filePaths, type: 'purchase'|'sales' }
  → extractQueue.runExtractQueue()
       ├─ expandFilesToPageJobs() — PDF → pages
       ├─ p-limit(20) parallel Gemini calls
       ├─ gst:probe-parties — party GST extraction
       └─ purchases:add / sales:add
  → ocr:progress events → UI progress bar
  → packagingMaster.bulkUpsert — auto-sync GPL
```

### CPCB Automation Flow

```
CpcbRegistrationPage.jsx
  → scraper:startRegistrationFlow(payload)
  → cpcbRegistration.js
       ├─ chromium.launchPersistentContext()
       ├─ Navigate epr.cpcb.gov.in
       ├─ Fill forms (Part A/B/C)
       ├─ OTP bridges: scraper:submitEmailOtp (IPC wait)
       ├─ Captcha: captchaPortal.js → Tesseract
       └─ scraper:log events → UI log panel
  → registration:save — persist state to SQLite
```

### Auto-Update Flow

```
initAutoUpdater() [packaged app only]
  → GET https://api.climeto.in/desktop/stable/latest.yml
  → Compare semver with app.getVersion()
  → update-available → UpdateBanner
  → autoDownload → update-download-progress
  → update-downloaded → "Restart & install"
  → quitAndInstall()
```

---

## 17. Testing

| Command | Scope |
|---------|-------|
| `npm test` | All shared unit tests |
| `npm run test:importer-3a` | Importer Section 3a logic |
| `npm run test:packaging-master` | Packaging master sync |
| `npm run test:ci` | CI pipeline tests |

**Test files:** `shared/*.test.js` (23 tests)

**Not covered (gaps):**
- Electron IPC integration tests
- Playwright E2E for CPCB flows
- Gemini OCR mocking tests

---

## 18. System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| OS | Windows 10 1809+ (64-bit) | Windows 11 |
| RAM | 8 GB | 16 GB |
| CPU | 4-core i3/Ryzen 3 | i5 8th gen+ / Ryzen 5 |
| Storage | 15 GB free SSD | 30 GB+ SSD |
| Network | 5 Mbps | 10 Mbps+ stable |
| Display | 1280×800 | 1920×1080 |

**8 GB RAM tuning:** Set `GEMINI_MAX_CONCURRENT=8` in `.env`

---

## 19. Troubleshooting

| Issue | Solution |
|-------|----------|
| App won't start second time | Single instance lock — focus existing window |
| OCR slow / hang | Reduce `GEMINI_MAX_CONCURRENT` |
| Playwright browser missing | `npm run setup:playwright` |
| Ghostscript compress fail | `npm run setup:ghostscript` |
| Login 409 conflict | Force login or logout other device |
| Auto-update not in dev | Normal — only works in installed `.exe` |
| Sentry not sending | Check `SENTRY_DSN` in `.env` |
| CPCB session expired | `scraper:openCpcbPortal` → re-login |
| SQLite locked | Close duplicate app instances |
| Publish SSH fail | Check `VPS_SSH_KEY_PATH`, run `ssh -i key root@host` |

---

## Appendix A: File Count Summary

| Area | Files |
|------|-------|
| electron/ | ~318 |
| src/ | ~112 |
| shared/ | ~27 |
| scripts/ | ~30 |
| DB migrations | 26 |
| IPC handlers | 133 |
| Frontend pages | 28 |
| Frontend components | 37+ |
| Unit tests | 23 |

## Appendix B: Related Docs

| Document | Path |
|----------|------|
| Release & auto-update | `docs/RELEASE_UPDATES.md` |
| VPS hosting guide | `docs/VPS_RELEASE_HOSTING.md` |
| Environment template | `.env.example` |
| Nginx snippet | `deploy/nginx-api-climeto-snippet.conf` |
| VPS folder setup | `deploy/vps-setup.sh` |

---

*Last updated: September 2026 — Climeto PWP v1.0.0*
  
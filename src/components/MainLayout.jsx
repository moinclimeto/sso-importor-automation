import { useState, useEffect } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import {
  Building2, LogOut, Menu, X, FileScan, LayoutGrid, Upload, Database, LayoutDashboard, ChevronDown, ChevronRight, Loader2, ArrowLeft, FileSpreadsheet
} from 'lucide-react';
import logo from '../assets/ClimetoTransparentLogo.png';
import { getApi } from '../utils/pwpApi.js';
import { Toast, useToast } from '../components/Toast.jsx';
import { RefreshCw } from 'lucide-react';
import { PageHeaderProvider, usePageHeader } from '../context/PageHeaderContext.jsx';

const navLinks = [
  /*
  {
    icon: LayoutDashboard,
    label: 'Overview',
    subLinks: [
      { to: '/cpcb-dashboard', label: 'CPCB Dashboard' }
    ]
  },
  */
  /*
  {
    icon: Database,
    label: 'EPR Data',
    subLinks: [
      { to: '/epr-sales', label: 'Sales Data' },
      { to: '/epr-procurement', label: 'Procurement Data' },
      { to: '/epr-inventory', label: 'Inventory Data' },
      { to: '/credit-calculations', label: 'Credit Calculations' },
      { to: '/epr-conversion-factor', label: 'Conversion Factor' },
    ]
  },
  */
  // { to: '/production-entry', icon: FileSpreadsheet, label: 'Packaging Declaration' },
  { to: '/doc-processor', icon: FileScan, label: 'Doc Processor' },
  { to: '/master-data', icon: Database, label: 'Master Data' },
  { to: '/registration-form', icon: FileScan, label: 'Registration' },
];

const pageHeaders = {
  '/cpcb-dashboard': { title: 'CPCB EPR Dashboard', subtitle: 'Automated scraped data from Central Pollution Control Board', showSync: true },
  '/master-data': { title: 'Master Data', subtitle: 'Company, supplier, packaging & MT reports' },
  '/epr-data': { title: 'EPR Scraped Data', subtitle: 'Data synced from CPCB portal', showEprRefresh: true },
  '/epr-inventory': { title: 'EPR Inventory Data', subtitle: 'Data synced from CPCB portal', showEprRefresh: true },
  '/epr-production': { title: 'EPR Production Data', subtitle: 'Data synced from CPCB portal', showEprRefresh: true },
  '/epr-sales': { title: 'EPR Sales Data', subtitle: 'Data synced from CPCB portal', showEprRefresh: true },
  '/epr-procurement': { title: 'EPR Procurement Data', subtitle: 'Data synced from CPCB portal', showEprRefresh: true },
  '/epr-conversion-factor': { title: 'Conversion Factor', subtitle: 'Data synced from CPCB portal', showEprRefresh: true },
  '/epr-new-application': { title: 'New Application Data', subtitle: 'Data synced from CPCB portal', showEprRefresh: true },
  '/registration-form': { title: 'Registration', subtitle: 'SSO Importer Registration' },
  '/doc-processor': {
    title: 'Doc Processor',
    subtitle: 'Upload and track documents by category',
    showUpload: true,
  },
  '/doc-upload': {
    title: 'Doc Processor',
    subtitle: 'Upload and track documents by category',
    showUpload: true,
  },
  '/doc-table': {
    title: 'Doc Processor',
    subtitle: 'Upload and track documents by category',
    showUpload: true,
  },
  '/production-entry': {
    title: 'Production Data',
    subtitle: 'Manage production entries',
  },
};

const NavItem = ({ item, sidebarOpen }) => {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(
    item.subLinks?.some(sub => location.pathname.startsWith(sub.to)) || false
  );

  const isDocSection =
    location.pathname.startsWith('/doc-processor') ||
    location.pathname.startsWith('/doc-upload') ||
    location.pathname.startsWith('/doc-table');

  const Icon = item.icon;

  if (item.subLinks) {
    const isChildActive = item.subLinks.some(sub => location.pathname.startsWith(sub.to));
    return (
      <div className="mb-0.5">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors text-sm font-medium ${isChildActive ? 'bg-green-50 text-green-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
        >
          <div className="flex items-center gap-3">
            {Icon && <Icon size={18} className="flex-shrink-0" />}
            {sidebarOpen && <span>{item.label}</span>}
          </div>
          {sidebarOpen && (
            isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />
          )}
        </button>
        {sidebarOpen && isOpen && (
          <div className="mt-1 ml-9 flex flex-col gap-1">
            {item.subLinks.map(sub => (
              <NavLink
                key={sub.to}
                to={sub.to}
                className={({ isActive }) => `px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-green-50 text-green-700' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`}
              >
                {sub.label}
              </NavLink>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <NavLink
      to={item.to}
      className={({ isActive }) => {
        const active = isActive || (item.to === '/doc-processor' && isDocSection);
        return `flex items-center gap-3 px-3 py-2.5 rounded-lg mb-0.5 transition-colors text-sm font-medium
        ${active
            ? 'bg-green-50 text-green-700'
            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
          }`;
      }}
    >
      {Icon && <Icon size={18} className="flex-shrink-0" />}
      {sidebarOpen && <span>{item.label}</span>}
    </NavLink>
  );
};

export default function MainLayout() {
  return (
    <PageHeaderProvider>
      <MainLayoutInner />
    </PageHeaderProvider>
  );
}

function MainLayoutInner() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { pageHeader } = usePageHeader();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [syncingEpr, setSyncingEpr] = useState(false);
  const [myCompany, setMyCompany] = useState(null);
  const { toast, showToast, hideToast } = useToast();
  const [showRegistrationModal, setShowRegistrationModal] = useState(false);

  const handleRegistrationConfirm = async () => {
    try {
      const res = await window.pwp.registration.save({ 
        applicant_type: 'PWP', 
        sub_applicant_type: 'Cement Co-processing' 
      });
      if (res.success) {
        if (res.inserted) {
          showToast('Registration details saved successfully!', 'success');
        }
        navigate('/registration-form');
      } else {
        showToast('Failed to save registration: ' + res.error, 'error');
      }
    } catch (err) {
      showToast('Error saving registration: ' + err.message, 'error');
    } finally {
      setShowRegistrationModal(false);
    }
  };

    useEffect(() => {
      const loadCompany = async () => {
        if (!window.pwp?.companies) return;
        try {
          const companies = await window.pwp.companies.getAll();
          if (companies?.length) {
            setMyCompany(companies[0]);
          }
        } catch (err) {
          console.error('Failed to load company profile', err);
        }
      };
      loadCompany();
    }, []);

  const handleSyncEpr = async () => {
    setSyncingEpr(true);
    showToast('Starting EPR Scraper... Please wait.', 'info');
    try {
      const api = getApi();
      const res = await api.scraper.runEpr();
      if (res.success) {
        showToast('EPR Portal successfully synced!', 'success');
        setTimeout(() => window.location.reload(), 1500);
      } else {
        showToast('EPR Sync failed: ' + res.error, 'error');
      }
    } catch (err) {
      showToast('EPR Sync failed: ' + err.message, 'error');
    } finally {
      setSyncingEpr(false);
    }
  };

  const isDocSection =
    location.pathname.startsWith('/doc-processor') ||
    location.pathname.startsWith('/doc-upload') ||
    location.pathname.startsWith('/doc-table');

  const baseHeader = pageHeaders[location.pathname] || {
    title: 'SSO Importer',
    subtitle: 'Registration Management',
  };

  const headerTitle = pageHeader?.title
    || (pageHeader?.sectionTitle
      ? `${baseHeader.title} / ${pageHeader.sectionTitle}`
      : baseHeader.title);
  const headerSubtitle = pageHeader?.subtitle ?? baseHeader.subtitle;

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const showRegistrationBtn = !isDocSection && location.pathname !== '/registration-form';

  return (
    <div className="flex h-screen bg-[#f7f8fa] overflow-hidden">
      <aside
        className={`${sidebarOpen ? 'w-56' : 'w-16'} bg-white border-r border-slate-200 flex flex-col transition-all duration-300 flex-shrink-0`}
      >
        <div className="flex items-center justify-between px-4 py-4 border-b border-slate-100">
          {sidebarOpen && (
            <img src={logo} alt="Climeto" className="h-8 w-auto max-w-[8rem] object-contain" />
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors ml-auto"
          >
            {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>

        <nav className="flex-1 py-3 overflow-y-auto px-2">
          {navLinks.map((item) => (
            <NavItem key={item.label} item={item} sidebarOpen={sidebarOpen} />
          ))}
        </nav>

        <div className="border-t border-slate-100 p-3">
          {sidebarOpen && (
            <div className="mb-2 px-2">
              <p className="text-xs text-slate-400">Logged in as</p>
              <p className="text-sm font-medium text-slate-700 truncate">{user?.email || 'User'}</p>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-2 py-2 rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors text-sm"
          >
            <LogOut size={18} className="flex-shrink-0" />
            {sidebarOpen && <span>Logout</span>}
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="relative z-30 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between gap-4 flex-shrink-0 overflow-visible">
          <div className="flex items-start gap-3 min-w-0">
            {pageHeader?.onBack && (
              <button
                type="button"
                onClick={pageHeader.onBack}
                className="mt-0.5 p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 flex-shrink-0"
                title="Back"
              >
                <ArrowLeft size={18} />
              </button>
            )}
            {isDocSection && (
              <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-green-600 flex-shrink-0">
                <LayoutGrid size={20} />
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight truncate">
                  {headerTitle}
                </h1>
                {myCompany && (
                  <div className="hidden sm:inline-flex items-center gap-2 bg-indigo-50 border border-indigo-100 px-3 py-1 rounded-md">
                    <Building2 size={14} className="text-indigo-600" />
                    <span className="text-xs font-medium text-indigo-900">{myCompany.name}</span>
                    <span className="text-[10px] text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-full font-mono border border-indigo-200">GST: {myCompany.gstin}</span>
                  </div>
                )}
              </div>
              {headerSubtitle && (
                <p className="text-sm text-slate-500 mt-0.5 truncate">{headerSubtitle}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end flex-shrink-0">
            {pageHeader?.actions}

            {showRegistrationBtn && (
              <button
                type="button"
                onClick={() => setShowRegistrationModal(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-green-200 bg-white hover:bg-green-50 text-green-700 text-sm font-medium px-4 py-2.5 shadow-sm transition-colors flex-shrink-0"
              >
                Registration
              </button>
            )}

            {baseHeader.showUpload && (
              <button
                type="button"
                onClick={() => navigate('/doc-upload', pageHeader?.uploadState ? { state: pageHeader.uploadState } : undefined)}
                className="inline-flex items-center gap-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2.5 shadow-sm transition-colors flex-shrink-0"
              >
                <Upload size={16} />
                Upload
              </button>
            )}

            {baseHeader.showEprRefresh && (
              <button
                type="button"
                onClick={() => window.dispatchEvent(new Event('refresh-epr-data'))}
                className="flex items-center gap-2 border border-teal-200 text-teal-700 bg-teal-50 hover:bg-teal-100 px-4 py-2 rounded-lg font-medium transition-colors shadow-sm flex-shrink-0"
              >
                <RefreshCw size={18} />
                Refresh
              </button>
            )}

            {baseHeader.showSync && (
              <button
                type="button"
                onClick={handleSyncEpr}
                disabled={syncingEpr}
                className="flex items-center gap-2 border border-green-200 text-green-700 bg-white hover:bg-green-50 px-4 py-2 rounded-lg font-medium transition-colors shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {syncingEpr ? <Loader2 size={18} className="animate-spin" /> : <Building2 size={18} />}
                {syncingEpr ? 'Syncing...' : 'Sync EPR Portal'}
              </button>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-6 pb-6 pt-4 relative">
          <Toast toast={toast} onClose={hideToast} />
          <Outlet />
        </div>

        {showRegistrationModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <h3 className="text-lg font-semibold text-slate-800">Confirm Registration</h3>
                <button onClick={() => setShowRegistrationModal(false)} className="text-slate-400 hover:text-slate-600">
                  <X size={20} />
                </button>
              </div>
              <div className="p-6">
                <p className="text-slate-600">
                  registration for your applicant type PWP and Cement Co-processing
                </p>
              </div>
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                <button
                  onClick={() => setShowRegistrationModal(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRegistrationConfirm}
                  className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

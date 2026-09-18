import { useState, useEffect } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import {
  Building2, LogOut, Menu, X, FileScan, LayoutGrid, Upload, Database, LayoutDashboard, ChevronDown, ChevronRight, Loader2, ArrowLeft, FileSpreadsheet, Activity, Moon, Bell, ChevronLeft
} from 'lucide-react';
import logo from '../assets/ClimetoTransparentLogo.png';
import sidebarBg from '../../assets/sidebar.png';
import { getApi } from '../utils/pwpApi.js';
import { Toast, useToast } from '../components/Toast.jsx';
import { RefreshCw } from 'lucide-react';
import { PageHeaderProvider, usePageHeader } from '../context/PageHeaderContext.jsx';
import ReadinessGuidelinesModal from './ReadinessGuidelinesModal.jsx';

const navLinks = [
  // {
  //   icon: LayoutDashboard,
  //   label: 'Overview',
  //   subLinks: [
  //     // { to: '/dashboard', label: 'Dashboard' },
  //     { to: '/cpcb-dashboard', label: 'CPCB Dashboard' }
  //   ]
  // },
  { to: '/cpcb-dashboard', icon: LayoutDashboard, label: 'CPCB Dashboard' },/*  */
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
  { to: '/doc-processor', icon: FileScan, label: 'Doc Processor' },
  { to: '/master-data', icon: Database, label: 'Master Data' },
  { to: '/diagnostics', icon: Activity, label: 'Diagnostics' },
];

const pageHeaders = {
  '/dashboard': { title: 'Dashboard', subtitle: 'Overview, bank details & purchase/sale activity' },
  '/cpcb-dashboard': { title: 'CPCB EPR Dashboard', subtitle: 'Automated scraped data from Central Pollution Control Board', showSync: true },
  '/master-data': { title: 'Master Data', subtitle: 'Company, supplier, packaging & MT reports' },
  '/companies': { title: 'Company Profile', subtitle: 'Manage company details' },
  '/epr-data': { title: 'EPR Scraped Data', subtitle: 'Data synced from CPCB portal', showEprRefresh: true },
  '/epr-inventory': { title: 'EPR Inventory Data', subtitle: 'Data synced from CPCB portal', showEprRefresh: true },
  '/epr-production': { title: 'EPR Production Data', subtitle: 'Data synced from CPCB portal', showEprRefresh: true },
  '/epr-sales': { title: 'EPR Sales Data', subtitle: 'Data synced from CPCB portal', showEprRefresh: true },
  '/epr-procurement': { title: 'EPR Procurement Data', subtitle: 'Data synced from CPCB portal', showEprRefresh: true },
  '/epr-conversion-factor': { title: 'Conversion Factor', subtitle: 'Data synced from CPCB portal', showEprRefresh: true },
  '/epr-new-application': { title: 'New Application Data', subtitle: 'Data synced from CPCB portal', showEprRefresh: true },
  '/cpcb-registration': { title: 'CPCB Registration', subtitle: 'Step 1: CPCB Portal Registration' },
  '/new-application': { title: 'New Application', subtitle: 'Step 2: Submit EPR Application' },
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
  '/diagnostics': { title: 'Diagnostics', subtitle: 'Crash reports, Windows compatibility and error monitoring' },
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
          className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors text-[15px] font-bold ${isChildActive ? 'bg-green-50 text-green-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
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
                className={({ isActive }) => `px-3 py-2 rounded-lg text-[14px] font-semibold transition-colors ${isActive ? 'bg-green-50 text-green-700' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`}
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
        return `flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 transition-colors text-[15px] font-bold
        ${active
            ? 'bg-emerald-50 text-emerald-800'
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
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showCpcbGuidelines, setShowCpcbGuidelines] = useState(false);
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
        navigate('/cpcb-registration');
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

  const showRegistrationBtn = !isDocSection && location.pathname !== '/cpcb-registration' && location.pathname !== '/new-application';

  return (
    <div className="flex h-screen bg-[#f7f8fa] overflow-hidden">
      <aside
        className={`${sidebarOpen ? 'w-56' : 'w-16'} bg-white border-r border-slate-200 flex flex-col transition-all duration-300 flex-shrink-0 relative overflow-hidden`}
        style={{ backgroundImage: `linear-gradient(rgba(255, 255, 255, 0.65), rgba(255, 255, 255, 0.65)), url(${sidebarBg})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }}
      >
        <div className="flex flex-col px-4 py-4 border-b border-slate-100">
          <div className="flex items-center justify-between mb-1">
            {sidebarOpen && (
              <img src={logo} alt="Climeto" className="h-7 w-auto max-w-[8rem] object-contain" />
            )}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1 rounded-md hover:bg-slate-100 text-slate-500 transition-colors ml-auto"
            >
              {sidebarOpen ? <X size={16} /> : <Menu size={16} />}
            </button>
          </div>
          {sidebarOpen && (
            <p className="text-[12px] font-bold text-slate-600 tracking-tight">Compliance. Simpler. Together.</p>
          )}
        </div>

        <nav className="flex-1 py-3 overflow-y-auto px-2">
          {navLinks.map((item) => (
            <NavItem key={item.label} item={item} sidebarOpen={sidebarOpen} />
          ))}
        </nav>

        <div className="border-t border-slate-100 p-3 flex flex-col gap-3">
          {sidebarOpen && (
            <div className="bg-[#ebf5f0]/80 rounded-2xl p-4 border border-emerald-100/50 text-center shadow-sm backdrop-blur-sm">
              <div className="mx-auto bg-emerald-800 text-white w-8 h-8 rounded-full flex items-center justify-center mb-3 shadow-md">
                <span className="font-bold text-[15px]">?</span>
              </div>
              <h5 className="text-[16px] font-bold text-emerald-950 tracking-tight">Need Help?</h5>
              <p className="text-[12px] text-emerald-800/80 mt-1 mb-4 leading-relaxed font-medium">Check our guide or contact support</p>
              <button className="w-full bg-white text-emerald-700 border border-emerald-200/80 text-[13px] font-bold py-2 rounded-xl shadow-sm hover:bg-emerald-50 transition-colors flex items-center justify-center gap-1.5">
                View Help Center &rarr;
              </button>
            </div>
          )}
          <div className="flex items-center justify-between px-1">
            {sidebarOpen && (
              <div className="flex items-center gap-2 overflow-hidden">
                <div className="w-7 h-7 bg-emerald-800 text-white rounded-full flex flex-shrink-0 items-center justify-center text-[11px] font-bold shadow-sm">U</div>
                <div className="min-w-0">
                  <p className="text-[11px] text-slate-500 font-medium leading-tight">Logged in as</p>
                  <p className="text-[13px] font-bold text-slate-700 truncate leading-tight">{user?.email || 'user2@test.com'}</p>
                </div>
              </div>
            )}
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors flex-shrink-0 flex items-center justify-center gap-2"
              title="Logout"
            >
              <LogOut size={16} />
              {!sidebarOpen && <span className="sr-only">Logout</span>}
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="relative z-30 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between gap-4 flex-shrink-0 overflow-visible shadow-sm">
          <div className="flex items-center gap-3 min-w-0">
            {pageHeader?.onBack && (
              <button
                type="button"
                onClick={pageHeader.onBack}
                className="w-8 h-8 rounded-full border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 flex flex-shrink-0 items-center justify-center shadow-sm"
                title="Back"
              >
                <ChevronLeft size={18} strokeWidth={2.5} className="ml-[-1px]" />
              </button>
            )}
            {isDocSection && (
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-green-600 flex-shrink-0">
                <LayoutGrid size={20} />
              </div>
            )}
            <div className="min-w-0 flex items-center gap-4">
              <div>
                <h1 className="text-[22px] font-bold text-slate-900 tracking-tight leading-tight truncate">
                  {headerTitle}
                </h1>
                {headerSubtitle && (
                  <p className="text-[13px] font-medium text-slate-500 mt-0.5 truncate leading-tight">{headerSubtitle}</p>
                )}
              </div>
              {myCompany && (
                <div className="hidden sm:inline-flex items-center gap-2 bg-emerald-50 border border-emerald-100/60 px-3 py-1.5 rounded-md ml-2 shadow-sm">
                  <Building2 size={14} className="text-emerald-600" />
                  <span className="text-xs font-bold text-emerald-900 tracking-tight uppercase">{myCompany.name}</span>
                  <span className="text-[10px] text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full font-mono border border-emerald-200/50 font-semibold tracking-wider">GST : {myCompany.gstin}</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4 flex-shrink-0">
            {pageHeader?.actions}
            {showRegistrationBtn && (
              <>
                <button
                  type="button"
                  onClick={() => setShowCpcbGuidelines(true)}
                  className="inline-flex items-center gap-2 rounded-lg border border-green-200 bg-white hover:bg-green-50 text-green-700 text-sm font-medium px-4 py-2.5 shadow-sm transition-colors flex-shrink-0"
                >
                  CPCB Registration
                </button>
              </>
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

            <div className="flex items-center gap-4 pl-4 border-l border-slate-200">
              <button className="text-slate-400 hover:text-slate-600 transition-colors">
                <Moon size={20} />
              </button>
              <button className="text-slate-400 hover:text-slate-600 transition-colors relative">
                <Bell size={20} />
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 rounded-full border-2 border-white text-[9px] font-bold text-white flex items-center justify-center flex-shrink-0">
                  <span className="sr-only">Notifications</span>
                </span>
              </button>
              <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center justify-center text-sm font-bold shadow-sm">
                U
              </div>
            </div>

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

        <div className="flex-1 overflow-auto bg-slate-50/50 p-6 relative">
          <ReadinessGuidelinesModal
            isOpen={showCpcbGuidelines}
            onClose={() => {
              setShowCpcbGuidelines(false);
              navigate('/cpcb-registration');
            }}
          />
          <div className="w-full space-y-6">
            <Toast toast={toast} onClose={hideToast} />
            <Outlet />
          </div>
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

import { useState } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import {
  Building2, LogOut, Menu, X, FileScan, LayoutGrid, Upload, Database, LayoutDashboard
} from 'lucide-react';
import logo from '../assets/ClimetoTransparentLogo.png';

const navLinks = [
  { to: '/cpcb-dashboard', icon: LayoutDashboard, label: 'CPCB Dashboard' },
  { to: '/epr-sales', icon: Database, label: 'EPR Sales Data' },
  { to: '/epr-procurement', icon: Database, label: 'EPR Procurement Data' },
  { to: '/companies', icon: Building2, label: 'Company Profile' },
  { to: '/doc-processor', icon: FileScan, label: 'Doc Processor' },
];

const pageHeaders = {
  '/dashboard': { title: 'Dashboard', subtitle: 'Overview of your purchase & sale activity' },
  '/cpcb-dashboard': { title: 'CPCB Dashboard', subtitle: 'Dashboard stats from the CPCB portal' },
  '/companies': { title: 'Company Profile', subtitle: 'Manage company details' },
  '/epr-data': { title: 'EPR Scraped Data', subtitle: 'Data synced from CPCB portal' },
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
};

export default function MainLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const isDocSection =
    location.pathname.startsWith('/doc-processor') ||
    location.pathname.startsWith('/doc-upload') ||
    location.pathname.startsWith('/doc-table');

  const header = pageHeaders[location.pathname] || {
    title: 'PWP',
    subtitle: 'Purchase & Sale Manager',
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

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
          {navLinks.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => {
                const active =
                  isActive ||
                  (to === '/doc-processor' && isDocSection);
                return `flex items-center gap-3 px-3 py-2.5 rounded-lg mb-0.5 transition-colors text-sm font-medium
                ${active
                  ? 'bg-green-50 text-green-700'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`;
              }}
            >
              <Icon size={18} className="flex-shrink-0" />
              {sidebarOpen && <span>{label}</span>}
            </NavLink>
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
        <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between gap-4 flex-shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            {isDocSection && (
              <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-green-600 flex-shrink-0">
                <LayoutGrid size={20} />
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight truncate">
                {header.title}
              </h1>
              {header.subtitle && (
                <p className="text-sm text-slate-500 mt-0.5 truncate">{header.subtitle}</p>
              )}
            </div>
          </div>

          {header.showUpload && (
            <button
              type="button"
              onClick={() => navigate('/doc-upload')}
              className="inline-flex items-center gap-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2.5 shadow-sm transition-colors flex-shrink-0"
            >
              <Upload size={16} />
              Upload
            </button>
          )}
        </header>

        <div className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

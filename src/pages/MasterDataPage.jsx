import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Building2, Users, Package, BarChart3 } from 'lucide-react';
import { usePageHeader } from '../context/PageHeaderContext.jsx';
import Companies from './Companies.jsx';
import SupplierMasterPage from './SupplierMasterPage.jsx';
import PackagingMasterPage from './PackagingMasterPage.jsx';
import PlasticMtReports from './PlasticMtReports.jsx';

const TABS = [
  { id: 'company', label: 'Company Master', icon: Building2 },
  { id: 'supplier', label: 'Supplier/Customer Master', icon: Users },
  { id: 'packaging', label: 'Packaging Master', icon: Package },
  { id: 'reports', label: 'MT Reports', icon: BarChart3 },
];

const TAB_HEADERS = {
  company: {
    title: 'Company Master',
    subtitle: 'Manage company details',
  },
  supplier: {
    title: 'Supplier/Customer Master',
    subtitle: 'Manage suppliers and customers across companies',
  },
  packaging: {
    title: 'Packaging Master',
    subtitle: 'Manage packaging materials and conversion factors',
  },
  reports: {
    title: 'MT Reports',
    subtitle: 'Category-wise MT by FY and State (Cat-I to Cat-IV)',
  },
};

function resolveTab(tabParam) {
  return TABS.some((tab) => tab.id === tabParam) ? tabParam : 'company';
}

export default function MasterDataPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = resolveTab(searchParams.get('tab'));
  const { setPageHeader, clearPageHeader } = usePageHeader();

  useEffect(() => {
    const header = TAB_HEADERS[tab];
    setPageHeader({
      title: header.title,
      subtitle: header.subtitle,
    });
    return clearPageHeader;
  }, [tab, setPageHeader, clearPageHeader]);

  const setTab = (id) => {
    setSearchParams({ tab: id }, { replace: true });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 p-1 bg-slate-100 rounded-lg w-fit">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === id
                ? 'bg-white text-green-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {tab === 'company' && <Companies />}
      {tab === 'supplier' && <SupplierMasterPage embedded />}
      {tab === 'packaging' && <PackagingMasterPage embedded />}
      {tab === 'reports' && <PlasticMtReports embedded />}
    </div>
  );
}

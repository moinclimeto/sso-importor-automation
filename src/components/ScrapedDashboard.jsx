import { useState, useEffect } from 'react';
import { ArrowLeft, Wallet, TrendingUp, Package, History, ArrowDownRight, IndianRupee, Calendar, FileText, AlertCircle, RefreshCw, Scale, CreditCard, Edit2, Check, X, ShieldCheck } from 'lucide-react';
import { getApi } from '../utils/pwpApi.js';
import { useToast, Toast } from '../components/Toast.jsx';

export default function ScrapedDashboard({ company, onBack }) {
  const [profile, setProfile] = useState(null);
  const [wallet, setWallet] = useState([]);
  const [history, setHistory] = useState([]);
  const [procurement, setProcurement] = useState([]);
  const [sales, setSales] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('procurement');
  const [selectedYear, setSelectedYear] = useState(2025);
  const [dashboardCards, setDashboardCards] = useState(null);
  const [bankDetails, setBankDetails] = useState({ account_number: '', ifsc_code: '' });
  const [isEditingBank, setIsEditingBank] = useState(false);
  const [editBankDetails, setEditBankDetails] = useState({ account_number: '', ifsc_code: '' });
  const { toast, showToast, hideToast } = useToast();

  useEffect(() => {
    window.pwp?.settings?.get('global_bank_details').then((data) => {
      if (data) {
        setBankDetails(data);
      }
    });
    async function fetchStaticData() {
      try {
        const api = getApi();
        const p = await api.scraper.getProfile();
        setProfile(p);
        
        const d = await api.scraper.getDashboardCards();
        setDashboardCards(d);

        const pay = await api.scraper.getPayments();
        setPayments(pay);

        const w = await api.scraper.getWallet();
        setWallet(w);
        
        const h = await api.scraper.getWalletHistory();
        setHistory(h);
      } catch (err) {
        console.error("Failed to load static scraped data", err);
      } finally {
        setLoading(false);
      }
    }
    fetchStaticData();
  }, []);

  useEffect(() => {
    async function fetchYearlyData() {
      try {
        const api = getApi();
        const proc = await api.scraper.getProcurement(selectedYear);
        setProcurement(proc);
        
        const sal = await api.scraper.getSales(selectedYear);
        setSales(sal);
      } catch (err) {
        console.error("Failed to load yearly scraped data", err);
      }
    }
    fetchYearlyData();
  }, [selectedYear]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="w-10 h-10 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  const handleSaveBankDetails = async () => {
    try {
      if (!window.pwp?.settings) {
        showToast('Settings API not available — is the app running in Electron?', 'error');
        return;
      }
      await window.pwp.settings.set('global_bank_details', editBankDetails);
      let updatedCount = 0;
      if (window.pwp?.sales?.applyBankDetailsToAll) {
        const applyResult = await window.pwp.sales.applyBankDetailsToAll(editBankDetails);
        if (applyResult?.success) {
          updatedCount = applyResult.updated || 0;
        }
      }
      setBankDetails(editBankDetails);
      setIsEditingBank(false);

      if (updatedCount > 0) {
        showToast(`Bank details saved & auto-applied to ${updatedCount} sale record${updatedCount > 1 ? 's' : ''}`, 'success');
      } else {
        showToast('Bank details saved successfully', 'success');
      }
    } catch (err) {
      showToast('Failed to save bank details: ' + err.message, 'error');
    }
  };

  const totalProc = procurement.reduce((sum, item) => sum + (Number(item.qty_plastic_waste_mt) || 0), 0);
  const totalSale = sales.reduce((sum, item) => sum + (Number(item.qtyClinkerSold) || 0), 0);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 w-full pb-10">
      
      {/* Top Banner for Bank Details */}
      <div className="relative overflow-hidden bg-gradient-to-r from-slate-900 to-indigo-950 rounded-3xl p-6 shadow-xl shadow-indigo-900/10">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 rounded-full bg-indigo-500/10 blur-3xl mix-blend-screen pointer-events-none" />
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-64 h-64 rounded-full bg-blue-500/10 blur-3xl mix-blend-screen pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="p-3.5 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/10 shadow-inner">
              <ShieldCheck size={26} className="text-indigo-200" />
            </div>
            <div>
              <p className="text-indigo-200 text-xs font-semibold tracking-wider uppercase mb-1">Global Configuration</p>
              <h2 className="text-xl font-bold text-white tracking-tight">Sale Auto-Apply Bank Details</h2>
            </div>
          </div>
          
          <div className="flex-1 max-w-xl w-full bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between gap-4">
              {isEditingBank ? (
                <div className="flex items-center gap-3 w-full">
                  <div className="flex-1">
                    <label className="text-[10px] uppercase text-indigo-200 font-semibold mb-1 block">Account Number</label>
                    <input
                      type="text"
                      placeholder="e.g. 1234567890"
                      value={editBankDetails.account_number}
                      onChange={(e) => setEditBankDetails({ ...editBankDetails, account_number: e.target.value })}
                      className="w-full bg-slate-900/50 border border-indigo-500/30 text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition-all placeholder:text-slate-500"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] uppercase text-indigo-200 font-semibold mb-1 block">IFSC Code</label>
                    <input
                      type="text"
                      placeholder="e.g. SBIN0001234"
                      value={editBankDetails.ifsc_code}
                      onChange={(e) => setEditBankDetails({ ...editBankDetails, ifsc_code: e.target.value })}
                      className="w-full bg-slate-900/50 border border-indigo-500/30 text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition-all placeholder:text-slate-500"
                    />
                  </div>
                  <div className="flex items-end pb-1 gap-2">
                    <button onClick={handleSaveBankDetails} className="p-2.5 bg-indigo-500 hover:bg-indigo-400 text-white rounded-lg transition-colors shadow-lg shadow-indigo-500/20" title="Save">
                      <Check size={16} strokeWidth={3} />
                    </button>
                    <button onClick={() => setIsEditingBank(false)} className="p-2.5 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors" title="Cancel">
                      <X size={16} strokeWidth={3} />
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-8">
                    <div>
                      <p className="text-[10px] uppercase text-indigo-200/70 font-semibold mb-1">Account Number</p>
                      <p className="text-base font-semibold text-white tracking-wide">
                        {bankDetails.account_number || <span className="text-slate-500 italic">Not Configured</span>}
                      </p>
                    </div>
                    <div className="w-px h-8 bg-white/10"></div>
                    <div>
                      <p className="text-[10px] uppercase text-indigo-200/70 font-semibold mb-1">IFSC Code</p>
                      <p className="text-base font-semibold text-white tracking-wide">
                        {bankDetails.ifsc_code || <span className="text-slate-500 italic">Not Configured</span>}
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      setEditBankDetails(bankDetails);
                      setIsEditingBank(true);
                    }} 
                    className="p-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all hover:scale-105 active:scale-95"
                    title="Edit Bank Details"
                  >
                    <Edit2 size={16} />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* EPR Dashboard Structured Cards */}
      {dashboardCards && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5">
          {/* Annual Filings */}
          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl hover:shadow-purple-500/5 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full -mr-10 -mt-10 blur-2xl group-hover:bg-purple-500/10 transition-colors" />
            <div className="flex items-center gap-4 mb-5 relative z-10">
              <div className="p-3 bg-gradient-to-br from-purple-500 to-fuchsia-500 text-white rounded-2xl shadow-lg shadow-purple-500/20">
                <FileText size={20} strokeWidth={2.5} />
              </div>
              <h3 className="font-bold text-slate-800 tracking-tight">Annual Filings</h3>
            </div>
            <div className="space-y-4 relative z-10">
              <div>
                <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-1">Window Status</p>
                <p className="font-semibold text-slate-800">{dashboardCards.ar_window_status || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-1">Due Date</p>
                <p className="font-semibold text-slate-800">{dashboardCards.ar_due_date || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-1">Filing Status</p>
                <p className={`font-bold inline-flex items-center px-2.5 py-0.5 rounded-full text-xs ${dashboardCards.ar_filing_status === 'Submitted' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                  {dashboardCards.ar_filing_status || 'N/A'}
                </p>
              </div>
            </div>
          </div>

          {/* Wallet */}
          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl hover:shadow-emerald-500/5 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full -mr-10 -mt-10 blur-2xl group-hover:bg-emerald-500/10 transition-colors" />
            <div className="flex items-center gap-4 mb-5 relative z-10">
              <div className="p-3 bg-gradient-to-br from-emerald-400 to-teal-500 text-white rounded-2xl shadow-lg shadow-emerald-500/20">
                <Wallet size={20} strokeWidth={2.5} />
              </div>
              <h3 className="font-bold text-slate-800 tracking-tight">Wallet</h3>
            </div>
            <div className="space-y-4 relative z-10">
              <div>
                <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-1">Available Potential</p>
                <p className="font-bold text-slate-800 text-lg">{dashboardCards.wallet_available_potential_mt || 0} <span className="text-sm font-medium text-slate-400">MT</span></p>
              </div>
              <div>
                <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-1">Consolidated Certs</p>
                <p className="font-bold text-slate-800 text-lg">{dashboardCards.wallet_consolidated_certificates_mt || 0} <span className="text-sm font-medium text-slate-400">MT</span></p>
              </div>
            </div>
          </div>

          {/* Trade */}
          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl hover:shadow-blue-500/5 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full -mr-10 -mt-10 blur-2xl group-hover:bg-blue-500/10 transition-colors" />
            <div className="flex items-center gap-4 mb-5 relative z-10">
              <div className="p-3 bg-gradient-to-br from-blue-500 to-indigo-500 text-white rounded-2xl shadow-lg shadow-blue-500/20">
                <RefreshCw size={20} strokeWidth={2.5} />
              </div>
              <h3 className="font-bold text-slate-800 tracking-tight">Trading</h3>
            </div>
            <div className="space-y-4 relative z-10">
              <div>
                <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-1">Available to Trade</p>
                <p className="font-bold text-slate-800 text-lg">{dashboardCards.trade_available_certificates || 0}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-1">Hold Value</p>
                <p className="font-bold text-slate-800 text-lg">{dashboardCards.trade_hold_certificates_mt || 0} <span className="text-sm font-medium text-slate-400">MT</span></p>
              </div>
            </div>
          </div>

          {/* Environment Compensation */}
          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl hover:shadow-red-500/5 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 rounded-full -mr-10 -mt-10 blur-2xl group-hover:bg-red-500/10 transition-colors" />
            <div className="flex items-center gap-4 mb-5 relative z-10">
              <div className="p-3 bg-gradient-to-br from-red-500 to-rose-500 text-white rounded-2xl shadow-lg shadow-red-500/20">
                <AlertCircle size={20} strokeWidth={2.5} />
              </div>
              <h3 className="font-bold text-slate-800 tracking-tight leading-tight">Env. Comp.</h3>
            </div>
            <div className="space-y-4 relative z-10">
              <div>
                <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-1">Levied</p>
                <p className="font-semibold text-slate-800">{dashboardCards.ec_levied || 'NA'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-1">Paid</p>
                <p className="font-semibold text-emerald-600">{dashboardCards.ec_paid || 'NA'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-1">Pending</p>
                <p className="font-semibold text-red-600">{dashboardCards.ec_pending || 'NA'}</p>
              </div>
            </div>
          </div>

          {/* Grievances */}
          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl hover:shadow-orange-500/5 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/5 rounded-full -mr-10 -mt-10 blur-2xl group-hover:bg-orange-500/10 transition-colors" />
            <div className="flex items-center gap-4 mb-5 relative z-10">
              <div className="p-3 bg-gradient-to-br from-orange-400 to-amber-500 text-white rounded-2xl shadow-lg shadow-orange-500/20">
                <Scale size={20} strokeWidth={2.5} />
              </div>
              <h3 className="font-bold text-slate-800 tracking-tight">Grievances</h3>
            </div>
            <div className="space-y-4 relative z-10">
              <div>
                <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-1">Total Raised</p>
                <p className="font-bold text-slate-800 text-lg">{dashboardCards.grievance_raised || 0}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-1">Resolved</p>
                <p className="font-bold text-emerald-600 text-lg">{dashboardCards.grievance_resolved || 0}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-1">Pending</p>
                <p className="font-bold text-amber-500 text-lg">{dashboardCards.grievance_pending || 0}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* EPR Potential Table */}
      {dashboardCards && dashboardCards.tables_dump && dashboardCards.tables_dump.length > 0 && (
        <div className="bg-white border border-slate-100 rounded-3xl shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-4">
             <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
               <TrendingUp size={22} strokeWidth={2.5} />
             </div>
             <div>
               <h3 className="text-lg font-bold text-slate-800 tracking-tight">Category Potentials</h3>
               <p className="text-xs font-medium text-slate-400 tracking-wide uppercase mt-0.5">Metrics in Metric Tons (MT)</p>
             </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50/50">
                <tr>
                  {dashboardCards.tables_dump[0][0]?.map((header, i) => (
                    <th key={i} className="px-6 py-4 font-semibold text-slate-500 text-xs uppercase tracking-wider border-b border-slate-100">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {dashboardCards.tables_dump[0].slice(1).map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50/80 transition-colors">
                    {row.map((cell, j) => (
                      <td key={j} className={`px-6 py-4 ${j === 0 ? "font-semibold text-slate-800" : "font-medium text-slate-600"}`}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm relative overflow-hidden group hover:shadow-lg transition-all duration-300">
          <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:scale-110 group-hover:-rotate-12 transition-transform duration-500">
            <Wallet size={120} strokeWidth={1} className="text-blue-600" />
          </div>
          <div className="relative z-10 flex flex-col h-full justify-between">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl"><Wallet size={24} strokeWidth={2.5} /></div>
              <h3 className="font-bold text-slate-700 tracking-tight">Wallet Balance</h3>
            </div>
            <div>
              <p className="text-4xl font-black text-slate-900 tracking-tight">
                {wallet.length > 0 ? wallet[0].value : 0}
              </p>
              <p className="text-sm font-semibold text-slate-400 tracking-wide uppercase mt-1">Credits Available</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm relative overflow-hidden group hover:shadow-lg transition-all duration-300">
          <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:scale-110 group-hover:-rotate-12 transition-transform duration-500">
            <Package size={120} strokeWidth={1} className="text-emerald-600" />
          </div>
          <div className="relative z-10 flex flex-col h-full justify-between">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl"><ArrowDownRight size={24} strokeWidth={2.5} /></div>
              <h3 className="font-bold text-slate-700 tracking-tight">Total Procurement</h3>
            </div>
            <div>
              <p className="text-4xl font-black text-slate-900 tracking-tight">
                {totalProc.toFixed(2)}
              </p>
              <p className="text-sm font-semibold text-slate-400 tracking-wide uppercase mt-1">Metric Tons</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm relative overflow-hidden group hover:shadow-lg transition-all duration-300">
          <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:scale-110 group-hover:-rotate-12 transition-transform duration-500">
            <TrendingUp size={120} strokeWidth={1} className="text-purple-600" />
          </div>
          <div className="relative z-10 flex flex-col h-full justify-between">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-purple-50 text-purple-600 rounded-2xl"><TrendingUp size={24} strokeWidth={2.5} /></div>
              <h3 className="font-bold text-slate-700 tracking-tight">Total Sales</h3>
            </div>
            <div>
              <p className="text-4xl font-black text-slate-900 tracking-tight">
                {totalSale.toFixed(2)}
              </p>
              <p className="text-sm font-semibold text-slate-400 tracking-wide uppercase mt-1">Metric Tons</p>
            </div>
          </div>
        </div>
      </div>
      <Toast toast={toast} onClose={hideToast} />
    </div>
  );
}

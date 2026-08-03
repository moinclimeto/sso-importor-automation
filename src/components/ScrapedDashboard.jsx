import { useState, useEffect } from 'react';
import { ArrowLeft, Wallet, TrendingUp, Package, History, ArrowDownRight, IndianRupee, Calendar, FileText, AlertCircle, RefreshCw, Scale, CreditCard, Edit2, Check, X } from 'lucide-react';
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
        <div className="w-10 h-10 border-4 border-green-500/30 border-t-green-500 rounded-full animate-spin" />
      </div>
    );
  }

  const handleSaveBankDetails = async () => {
    console.log('[Bank] Save clicked. editBankDetails:', editBankDetails);
    console.log('[Bank] window.pwp available:', !!window.pwp);
    console.log('[Bank] window.pwp.settings available:', !!window.pwp?.settings);

    try {
      if (!window.pwp?.settings) {
        console.error('[Bank] CRITICAL: window.pwp.settings is not available. Running outside Electron?');
        showToast('Settings API not available — is the app running in Electron?', 'error');
        return;
      }

      console.log('[Bank] Calling settings.set...');
      const result = await window.pwp.settings.set('global_bank_details', editBankDetails);
      console.log('[Bank] settings.set result:', result);

      // Auto-apply bank details to all sales records that have no account/IFSC yet
      let updatedCount = 0;
      if (window.pwp?.sales?.applyBankDetailsToAll) {
        const applyResult = await window.pwp.sales.applyBankDetailsToAll(editBankDetails);
        console.log('[Bank] applyBankDetailsToAll result:', applyResult);
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
      console.log('[Bank] Save complete!');
    } catch (err) {
      console.error('[Bank] Exception during save:', err);
      showToast('Failed to save bank details: ' + err.message, 'error');
    }
  };

  // Calculate some dummy or real metrics if possible
  const totalProc = procurement.reduce((sum, item) => sum + (Number(item.qty_plastic_waste_mt) || 0), 0);
  const totalSale = sales.reduce((sum, item) => sum + (Number(item.productionid_qty) || 0), 0);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {company.name !== 'Your Company' && (
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="text-2xl font-bold text-slate-800">{company.name}</h2>
            <p className="text-slate-500 text-sm">Automated scraped data from Central Pollution Control Board</p>
          </div>
        </div>
      )}

      {/* Global Bank Details Card */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-lg bg-indigo-500">
            <CreditCard size={22} className="text-white" />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Sale Auto-Apply Bank Details</p>
            {isEditingBank ? (
              <div className="flex items-center gap-3 mt-1">
                <input
                  type="text"
                  placeholder="Account Number"
                  value={editBankDetails.account_number}
                  onChange={(e) => setEditBankDetails({ ...editBankDetails, account_number: e.target.value })}
                  className="border border-slate-200 rounded-md px-2 py-1 text-sm outline-none focus:border-indigo-500 w-40"
                />
                <input
                  type="text"
                  placeholder="IFSC Code"
                  value={editBankDetails.ifsc_code}
                  onChange={(e) => setEditBankDetails({ ...editBankDetails, ifsc_code: e.target.value })}
                  className="border border-slate-200 rounded-md px-2 py-1 text-sm outline-none focus:border-indigo-500 w-32"
                />
              </div>
            ) : (
              <p className="text-sm font-semibold text-slate-800 mt-0.5">
                {bankDetails.account_number || 'Not Added'} <span className="text-slate-400 mx-1">|</span> {bankDetails.ifsc_code || 'Not Added'}
              </p>
            )}
          </div>
        </div>
        <div>
          {isEditingBank ? (
            <div className="flex items-center gap-2">
              <button onClick={handleSaveBankDetails} className="p-1.5 bg-green-50 text-green-600 rounded-md hover:bg-green-100 transition">
                <Check size={16} />
              </button>
              <button onClick={() => setIsEditingBank(false)} className="p-1.5 bg-red-50 text-red-600 rounded-md hover:bg-red-100 transition">
                <X size={16} />
              </button>
            </div>
          ) : (
            <button 
              onClick={() => {
                setEditBankDetails(bankDetails);
                setIsEditingBank(true);
              }} 
              className="p-1.5 bg-slate-50 text-slate-600 rounded-md hover:bg-slate-100 transition"
              title="Edit Bank Details"
            >
              <Edit2 size={16} />
            </button>
          )}
        </div>
      </div>

      {/* EPR Dashboard Structured Cards */}
      {dashboardCards && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Annual Filings */}
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-purple-50 text-purple-600 rounded-xl"><FileText size={20} /></div>
              <h3 className="font-semibold text-slate-700">Annual Filings</h3>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Window Status</span>
                <span className="font-medium text-slate-800 px-2 py-1 bg-slate-100 rounded-md">{dashboardCards.ar_window_status || 'N/A'}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Due Date</span>
                <span className="font-medium text-slate-800">{dashboardCards.ar_due_date || 'N/A'}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Filing Status</span>
                <span className={`font-medium ${dashboardCards.ar_filing_status === 'Submitted' ? 'text-green-600' : 'text-amber-600'}`}>{dashboardCards.ar_filing_status || 'N/A'}</span>
              </div>
            </div>
          </div>

          {/* Wallet */}
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl"><Wallet size={20} /></div>
              <h3 className="font-semibold text-slate-700">Wallet</h3>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Available Potential</span>
                <span className="font-medium text-slate-800">{dashboardCards.wallet_available_potential_mt || 0} MT</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Consolidated Certs</span>
                <span className="font-medium text-slate-800">{dashboardCards.wallet_consolidated_certificates_mt || 0} MT</span>
              </div>
            </div>
          </div>

          {/* Trade */}
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-blue-50 text-blue-600 rounded-xl"><RefreshCw size={20} /></div>
              <h3 className="font-semibold text-slate-700">Trading</h3>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Available to Trade</span>
                <span className="font-medium text-slate-800">{dashboardCards.trade_available_certificates || 0}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Hold Value (MT)</span>
                <span className="font-medium text-slate-800">{dashboardCards.trade_hold_certificates_mt || 0} MT</span>
              </div>
            </div>
          </div>

          {/* Environment Compensation */}
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-50 text-red-600 rounded-xl"><AlertCircle size={20} /></div>
              <h3 className="font-semibold text-slate-700">Environment Comp.</h3>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Levied</span>
                <span className="font-medium text-slate-800">{dashboardCards.ec_levied || 'NA'}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Paid</span>
                <span className="font-medium text-green-600">{dashboardCards.ec_paid || 'NA'}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Pending</span>
                <span className="font-medium text-red-600">{dashboardCards.ec_pending || 'NA'}</span>
              </div>
            </div>
          </div>

          {/* Grievances */}
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-orange-50 text-orange-600 rounded-xl"><Scale size={20} /></div>
              <h3 className="font-semibold text-slate-700">Grievances</h3>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Total Raised</span>
                <span className="font-medium text-slate-800">{dashboardCards.grievance_raised || 0}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Resolved</span>
                <span className="font-medium text-green-600">{dashboardCards.grievance_resolved || 0}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Pending</span>
                <span className="font-medium text-orange-600">{dashboardCards.grievance_pending || 0}</span>
              </div>
            </div>
          </div>
        </div>
      )}



      {/* EPR Potential Table */}
      {dashboardCards && dashboardCards.tables_dump && dashboardCards.tables_dump.length > 0 && (
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden mt-6">
          <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center gap-3">
             <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl"><TrendingUp size={20} /></div>
             <h3 className="font-semibold text-slate-700">Category Potentials (MT)</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100 text-left text-slate-500">
                <tr>
                  {dashboardCards.tables_dump[0][0]?.map((header, i) => (
                    <th key={i} className="p-4 font-medium">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dashboardCards.tables_dump[0].slice(1).map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50 transition-colors">
                    {row.map((cell, j) => (
                      <td key={j} className={j === 0 ? "p-4 font-medium text-slate-800" : "p-4 font-semibold text-slate-700"}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl"><Wallet size={20} /></div>
            <h3 className="font-semibold text-slate-700">Wallet Balance</h3>
          </div>
          <p className="text-2xl font-bold text-slate-900">{wallet.length > 0 ? wallet[0].value : 0} Credits</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-green-50 text-green-600 rounded-xl"><ArrowDownRight size={20} /></div>
            <h3 className="font-semibold text-slate-700">Total Procurement</h3>
          </div>
          <p className="text-2xl font-bold text-slate-900">{totalProc.toFixed(2)} MT</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-purple-50 text-purple-600 rounded-xl"><TrendingUp size={20} /></div>
            <h3 className="font-semibold text-slate-700">Total Sales</h3>
          </div>
          <p className="text-2xl font-bold text-slate-900">{totalSale.toFixed(2)} MT</p>
        </div>
      </div>
      <Toast toast={toast} onClose={hideToast} />
    </div>
  );
}

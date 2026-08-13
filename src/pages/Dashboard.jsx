import { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { Play, ShoppingCart, TrendingUp, Building2, TrendingDown, IndianRupee, CreditCard, Edit2, Check, X } from 'lucide-react';

const fmt = (n) =>
  new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n || 0);

function StatCard({ label, value, icon: Icon, color, sub }) {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100 flex items-start gap-4">
      <div className={`p-3 rounded-lg ${color}`}>
        <Icon size={22} className="text-white" />
      </div>
      <div>
        <p className="text-sm text-slate-500">{label}</p>
        <p className="text-2xl font-bold text-slate-800">₹{fmt(value)}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [bankDetails, setBankDetails] = useState({ account_number: '', ifsc_code: '' });
  const [isEditingBank, setIsEditingBank] = useState(false);
  const [editBankDetails, setEditBankDetails] = useState({ account_number: '', ifsc_code: '' });

  useEffect(() => {
    if (window.pwp) {
      window.pwp.dashboard.getStats().then((data) => {
        setStats(data);
        setLoading(false);
      });
      window.pwp.settings?.get('global_bank_details').then((data) => {
        if (data) {
          setBankDetails(data);
        }
      });
    } else {
      setStats({
        purchaseTotal: 0, saleTotal: 0, purchaseCount: 0,
        saleCount: 0, companyCount: 0, profit: 0,
        monthlyPurchase: [], monthlySale: []
      });
      setLoading(false);
    }
  }, []);

  const chartData = (() => {
    if (!stats) return [];
    const months = {};
    (stats.monthlyPurchase || []).forEach(({ month, total }) => {
      months[month] = { month, purchase: total, sale: 0 };
    });
    (stats.monthlySale || []).forEach(({ month, total }) => {
      if (months[month]) months[month].sale = total;
      else months[month] = { month, purchase: 0, sale: total };
    });
    return Object.values(months).sort((a, b) => a.month.localeCompare(b.month));
  })();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  const handleSaveBankDetails = async () => {
    if (window.pwp?.settings) {
      await window.pwp.settings.set('global_bank_details', editBankDetails);
      setBankDetails(editBankDetails);
      setIsEditingBank(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
          <p className="text-slate-500 text-sm">Overview of your purchase & sale activity</p>
          {stats?.myCompany && (
            <div className="mt-2 inline-flex items-center gap-2 bg-indigo-50 border border-indigo-100 px-3 py-1.5 rounded-md">
              <Building2 size={16} className="text-indigo-600" />
              <span className="text-sm font-medium text-indigo-900">{stats.myCompany.name}</span>
              <span className="text-xs text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-full font-mono border border-indigo-200">GST: {stats.myCompany.gstin}</span>
            </div>
          )}
        </div>
        <button 
          onClick={async () => {
            if (window.pwp?.scraper) {
              const res = await window.pwp.scraper.runEpr();
              console.log("Scraper result:", res);
              alert(res.success ? "Scraping completed!" : "Scraping failed: " + res.error);
            } else {
              alert("Scraper API not available. Are you running in Electron?");
            }
          }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg shadow-sm hover:bg-blue-700 transition"
        >
          <Play size={18} />
          Run EPR Scraper
        </button>
      </div>

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

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <StatCard label="Total Purchase" value={stats.purchaseTotal} icon={ShoppingCart} color="bg-blue-500" sub={`${stats.purchaseCount} records`} />
        <StatCard label="Total Sale" value={stats.saleTotal} icon={TrendingUp} color="bg-green-500" sub={`${stats.saleCount} records`} />
        <StatCard
          label="Profit / Loss"
          value={Math.abs(stats.profit)}
          icon={stats.profit >= 0 ? TrendingUp : TrendingDown}
          color={stats.profit >= 0 ? 'bg-emerald-500' : 'bg-red-500'}
          sub={stats.profit >= 0 ? 'Profit' : 'Loss'}
        />
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100 flex items-start gap-4">
          <div className="p-3 rounded-lg bg-purple-500">
            <Building2 size={22} className="text-white" />
          </div>
          <div>
            <p className="text-sm text-slate-500">Companies</p>
            <p className="text-2xl font-bold text-slate-800">{stats.companyCount}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100 flex items-start gap-4">
          <div className="p-3 rounded-lg bg-orange-500">
            <IndianRupee size={22} className="text-white" />
          </div>
          <div>
            <p className="text-sm text-slate-500">Total Transactions</p>
            <p className="text-2xl font-bold text-slate-800">{stats.purchaseCount + stats.saleCount}</p>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-100">
        <h2 className="text-base font-semibold text-slate-800 mb-4">Monthly Purchase vs Sale</h2>
        {chartData.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-slate-400 text-sm">
            No data yet. Add purchases and sales to see chart.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => `₹${fmt(v)}`} />
              <Legend />
              <Bar dataKey="purchase" name="Purchase" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="sale" name="Sale" fill="#22c55e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Factory } from 'lucide-react';

export default function EprConversionFactorData() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  const [errorMsg, setErrorMsg] = useState(null);

  const loadData = async () => {
    if (!window.pwp || !window.pwp.eprData) {
      setErrorMsg("Window PWP object is missing. Are you running in browser instead of Electron?");
      setLoading(false);
      return;
    }
    if (!window.pwp.eprData.getConversionFactor) {
      setErrorMsg("getConversionFactor function is missing! Please restart the Electron App.");
      setLoading(false);
      return;
    }
    
    setLoading(true);
    try {
      const data = await window.pwp.eprData.getConversionFactor();
      setRecords(data || []);
    } catch (e) {
      console.error("Failed to fetch Conversion Factor Data:", e);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
    
    const handleRefresh = () => loadData();
    window.addEventListener('refresh-epr-data', handleRefresh);
    return () => window.removeEventListener('refresh-epr-data', handleRefresh);
  }, []);

  const portalContainer = document.getElementById('header-actions-portal');

  return (
    <div className="space-y-5">
      {portalContainer && createPortal(
        <p className="text-slate-500 text-sm font-medium mr-2">{records.length} records scraped</p>,
        portalContainer
      )}

      {errorMsg ? (
        <div className="bg-red-50 text-red-600 rounded-xl p-6 text-center border border-red-200">
          <p className="font-semibold">{errorMsg}</p>
        </div>
      ) : loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
        </div>
      ) : records.length === 0 ? (
        <div className="bg-white rounded-xl p-16 text-center shadow-sm border border-slate-100">
          <Factory size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500">No Conversion Factor records found.</p>
          <p className="text-slate-400 text-sm mt-1">Make sure you have run the scraper to fetch Conversion Factor.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="th w-24">Sr. No.</th>
                  <th className="th">Conversion Factor</th>
                  <th className="th">Last Updated</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r, i) => (
                  <tr key={i} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="td text-slate-500 font-medium">{r.sr_no || r._internal_id || i + 1}</td>
                    <td className="td font-semibold text-slate-800">{r.conversion_factor || 'N/A'}</td>
                    <td className="td text-slate-600">{r.last_updated || 'N/A'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

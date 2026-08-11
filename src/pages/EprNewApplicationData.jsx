import React, { useEffect, useState } from 'react';
import { FileText, Building2, Wrench, Factory, RefreshCw } from 'lucide-react';

export default function EprNewApplicationData() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const [debugMsg, setDebugMsg] = useState("");

  const loadData = async () => {
    if (!window.pwp) {
      setDebugMsg("window.pwp is missing. Context bridge failed.");
      setLoading(false);
      return;
    }
    if (!window.pwp.eprData) {
      setDebugMsg("window.pwp.eprData is missing.");
      setLoading(false);
      return;
    }
    if (!window.pwp.eprData.getNewApplicationData) {
      setDebugMsg("Backend function 'getNewApplicationData' is missing!\n\nACTION REQUIRED: You MUST completely close the app terminal (Ctrl+C) and restart it (npm run electron:dev). The backend changes will not take effect until you restart the app!");
      setLoading(false);
      return;
    }
    
    setLoading(true);
    setDebugMsg("");
    try {
      const result = await window.pwp.eprData.getNewApplicationData();
      if (!result || Object.keys(result).length === 0) {
        setDebugMsg("Database query succeeded, but no tables starting with 'new_app' were found in pwp.db.");
      }
      setData(result);
    } catch (e) {
      console.error("Failed to fetch EPR New Application Data:", e);
      setDebugMsg("Error fetching data: " + e.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
    const handleRefresh = () => loadData();
    window.addEventListener('refresh-epr-data', handleRefresh);
    return () => window.removeEventListener('refresh-epr-data', handleRefresh);
  }, []);

  const handleOpenFile = async (filename) => {
    if (!window.pwp || !window.pwp.eprData || !window.pwp.eprData.openDocument) {
      alert('File opener not ready. Please restart the app if you just updated it.');
      return;
    }
    const res = await window.pwp.eprData.openDocument(filename);
    if (!res.success) {
      alert(`Could not open file: ${res.error}`);
    }
  };

  const renderValue = (val) => {
    if (!val) return <span className="text-gray-400 italic">Not available</span>;
    const textVal = String(val);
    const hasExt = textVal.toLowerCase().match(/\.(pdf|jpg|jpeg|png)$/);
    
    if (hasExt) {
      return (
        <div className="flex items-center justify-between w-full">
          <span className="text-gray-800 truncate pr-2" title={textVal}>{textVal}</span>
          <button 
            onClick={() => handleOpenFile(textVal)}
            className="px-3 py-1 bg-[#17a2b8] hover:bg-[#138496] text-white text-xs font-bold rounded shadow-sm flex-shrink-0"
          >
            View
          </button>
        </div>
      );
    }
    
    return textVal;
  };

  const renderField = (label, value) => {
    return (
      <div className="mb-4">
        <label className="block text-[13px] font-bold text-[#495057] mb-1">{label}</label>
        <div className="w-full bg-[#e9ecef] border border-[#ced4da] rounded px-3 py-1.5 text-[#495057] text-sm min-h-[38px] flex items-center">
          {renderValue(value)}
        </div>
      </div>
    );
  };

  const renderTable = (tableData, title) => {
    if (!tableData || tableData.length === 0) return null;
    
    const headers = Object.keys(tableData[0]).filter(k => k !== 'id' && k !== 'created_at' && k !== 'updated_at');
    
    return (
      <div className="mt-8 mb-6 bg-white border border-[#dee2e6] rounded-sm shadow-sm overflow-hidden">
        <div className="bg-[#f8f9fa] border-b border-[#dee2e6] px-4 py-2.5">
          <h3 className="text-base font-bold text-[#343a40] uppercase">{title}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#343a40] text-white text-[13px]">
                {headers.map(h => (
                  <th key={h} className="px-4 py-2 font-bold uppercase border border-[#454d55]">
                    {h.replace(/_/g, ' ')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="text-[13px] text-[#212529]">
              {tableData.map((row, i) => (
                <tr key={i} className="border-b border-[#dee2e6] even:bg-[#f2f2f2] hover:bg-[#e9ecef]">
                  {headers.map(h => (
                    <td key={h} className="px-4 py-2 border-r border-[#dee2e6] last:border-r-0 min-w-[200px]">
                      {renderValue(row[h])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  if (!data || Object.keys(data).length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-gray-50 p-8 text-center">
        <FileText size={64} className="text-gray-300 mb-4" />
        <h2 className="text-2xl font-semibold text-gray-700 mb-2">No Application Data Found</h2>
        
        {debugMsg ? (
          <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-lg text-left max-w-2xl mb-6 shadow-sm">
            <h3 className="font-bold mb-2">Error Details:</h3>
            <p className="whitespace-pre-wrap">{debugMsg}</p>
          </div>
        ) : (
          <p className="text-gray-500 max-w-md mb-6">
            The database tables for the New Application were not found. Please run the scraper to extract and sync this data.
          </p>
        )}

        <button 
          onClick={loadData}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-lg shadow-sm transition-colors"
        >
          <RefreshCw size={18} />
          <span>Refresh Data</span>
        </button>
      </div>
    );
  }

  const partA = data.new_application_part_a;
  const partB = data.new_application_part_b;
  
  // Find dynamic tables
  const tables = Object.keys(data).filter(k => k.startsWith('new_app_part_'));

  return (
    <div className="w-full mt-8 font-sans">

      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* PART A */}
        {partA && (
          <section className="bg-white rounded border border-[#28a745] shadow-sm overflow-hidden">
            <div className="bg-[#28a745] text-white px-4 py-2">
              <h2 className="text-[15px] font-bold m-0">Part A: Company & Registration Details</h2>
            </div>
            
            <div className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2">
                {Object.entries(partA)
                  .filter(([k]) => !['id', 'created_at', 'updated_at'].includes(k))
                  .map(([key, value]) => (
                    <React.Fragment key={key}>
                      {renderField(key.replace(/_/g, ' '), value)}
                    </React.Fragment>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* PART B */}
        {partB && (
          <section className="bg-white rounded border border-[#28a745] shadow-sm overflow-hidden mt-6">
            <div className="bg-[#28a745] text-white px-4 py-2">
              <h2 className="text-[15px] font-bold m-0">Part B: Consent & Plant Machinery Details</h2>
            </div>
            
            <div className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2">
                {Object.entries(partB)
                  .filter(([k]) => !['id', 'created_at', 'updated_at'].includes(k))
                  .map(([key, value]) => (
                    <React.Fragment key={key}>
                      {renderField(key.replace(/_/g, ' '), value)}
                    </React.Fragment>
                ))}
              </div>
              
              {/* Nested Tables */}
              <div className="mt-8 space-y-8">
                {tables.map(tableName => {
                  if (data[tableName] && data[tableName].length > 0) {
                    const title = tableName.replace('new_app_', '').replace(/_/g, ' ').toUpperCase();
                    return (
                      <React.Fragment key={tableName}>
                        {renderTable(data[tableName], title)}
                      </React.Fragment>
                    );
                  }
                  return null;
                })}
              </div>
            </div>
          </section>
        )}

      </div>
    </div>
  );
}

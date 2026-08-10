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
  }, []);

  const renderField = (label, value) => {
    return (
      <div className="mb-4">
        <label className="block text-sm font-semibold text-gray-700 mb-1">{label}</label>
        <div className="w-full bg-gray-100 border border-gray-300 rounded-md px-3 py-2 text-gray-600 font-medium">
          {value || <span className="text-gray-400 italic">Not available</span>}
        </div>
      </div>
    );
  };

  const renderTable = (tableData, title) => {
    if (!tableData || tableData.length === 0) return null;
    
    const headers = Object.keys(tableData[0]).filter(k => k !== 'id' && k !== 'created_at' && k !== 'updated_at');
    
    return (
      <div className="mt-8 mb-6 bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
        <div className="bg-gray-50 border-b border-gray-200 px-4 py-3">
          <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-100 text-gray-700 text-sm border-b">
                {headers.map(h => (
                  <th key={h} className="px-4 py-3 font-semibold uppercase tracking-wider">
                    {h.replace(/_/g, ' ')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="text-sm text-gray-700">
              {tableData.map((row, i) => (
                <tr key={i} className="border-b hover:bg-blue-50 transition-colors">
                  {headers.map(h => (
                    <td key={h} className="px-4 py-3 border-r last:border-r-0 border-gray-100">
                      {row[h] || '-'}
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
    <div className="h-full bg-gray-50 p-6 overflow-y-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
          <FileText className="text-emerald-600" size={32} />
          New Application Data
        </h1>
        <button 
          onClick={loadData}
          className="flex items-center gap-2 text-sm bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg shadow-sm transition-colors"
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* PART A */}
        {partA && (
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="bg-emerald-50 border-b border-emerald-100 px-6 py-4 flex items-center gap-3">
              <Building2 className="text-emerald-600" size={24} />
              <h2 className="text-xl font-bold text-emerald-900">Part A: Company & Registration Details</h2>
            </div>
            
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-2">
                {Object.entries(partA)
                  .filter(([k]) => !['id', 'created_at', 'updated_at'].includes(k))
                  .map(([key, value]) => (
                    <React.Fragment key={key}>
                      {renderField(key.replace(/_/g, ' ').toUpperCase(), value)}
                    </React.Fragment>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* PART B */}
        {partB && (
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="bg-blue-50 border-b border-blue-100 px-6 py-4 flex items-center gap-3">
              <Wrench className="text-blue-600" size={24} />
              <h2 className="text-xl font-bold text-blue-900">Part B: Consent & Plant Machinery Details</h2>
            </div>
            
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-2">
                {Object.entries(partB)
                  .filter(([k]) => !['id', 'created_at', 'updated_at'].includes(k))
                  .map(([key, value]) => (
                    <React.Fragment key={key}>
                      {renderField(key.replace(/_/g, ' ').toUpperCase(), value)}
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

import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, Calculator, CheckCircle2, ChevronRight, Loader2, Pencil } from 'lucide-react';
import { usePageHeader } from '../context/PageHeaderContext.jsx';
import { useToast, Toast } from '../components/Toast.jsx';

const MONTHS = [
  'April', 'May', 'June', 'July', 'August', 'September', 
  'October', 'November', 'December', 'January', 'February', 'March'
];

export default function CreditCalculations() {
  const { setPageHeader, clearPageHeader } = usePageHeader();
  const { toast, showToast, hideToast } = useToast();
  
  const [records, setRecords] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  
  // Modal Form State
  const [formMonth, setFormMonth] = useState('April');
  const [formYear, setFormYear] = useState(new Date().getFullYear().toString());
  
  // Production data (editable, can be auto-filled)
  const [clinkerProduction, setClinkerProduction] = useState('');
  const [energyPercentage, setEnergyPercentage] = useState('');
  const [dataSource, setDataSource] = useState('manual');
  
  // User inputs
  const [energyConsumption, setEnergyConsumption] = useState('');
  const [fetchedConversionFactor, setFetchedConversionFactor] = useState('');
  const [calorificValue, setCalorificValue] = useState('');
  const [calorificUnit, setCalorificUnit] = useState('KJ/Kg');
  const [plasticPercent, setPlasticPercent] = useState('');

  // Live calculated values
  const calculated = useMemo(() => {
    const clinkerVal = parseFloat(clinkerProduction) || 0;
    const energyPct = parseFloat(energyPercentage) || 0;
    const energyConsMJ = parseFloat(energyConsumption) || 0;
    const calInput = parseFloat(calorificValue) || 0;
    const plasticPct = parseFloat(plasticPercent) || 0;

    let calValueKJ = calInput;
    if (calorificUnit === 'Kcal/Kg') {
      calValueKJ = calInput * 4.184;
    }

    const energyContributionMJ = (energyPct / 100) * energyConsMJ * clinkerVal;
    const rdfBurntTons = calValueKJ > 0 ? energyContributionMJ / calValueKJ : 0;
    const potentialTons = rdfBurntTons * (plasticPct / 100);

    return { calValueKJ, energyContributionMJ, rdfBurntTons, potentialTons };
  }, [clinkerProduction, energyPercentage, energyConsumption, calorificValue, calorificUnit, plasticPercent]);

  const resetForm = () => {
    setEditingId(null);
    setFormMonth('April');
    setFormYear(new Date().getFullYear().toString());
    setClinkerProduction('');
    setEnergyPercentage('');
    setDataSource('manual');
    setEnergyConsumption(fetchedConversionFactor);
    setCalorificValue('');
    setCalorificUnit('KJ/Kg');
    setPlasticPercent('');
  };

  const loadRecords = async () => {
    try {
      if (window.pwp?.creditCalculations) {
        const data = await window.pwp.creditCalculations.getAll();
        setRecords(data || []);
      }
      if (window.pwp?.eprData?.getConversionFactor) {
        const cfData = await window.pwp.eprData.getConversionFactor();
        if (cfData && cfData.length > 0) {
          const topValue = cfData[0].conversion_factor;
          if (topValue) {
            setFetchedConversionFactor(topValue.toString());
            setEnergyConsumption(prev => prev || topValue.toString());
          }
        }
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to load calculations', 'error');
    }
  };

  useEffect(() => { loadRecords(); }, []);

  useEffect(() => {
    const id = setPageHeader({
      title: 'Credit Calculations',
      subtitle: 'Calculate potential credits based on production data',
      actions: (
        <button
          onClick={() => {
            setEditingId(null);
            setFormMonth('April');
            setFormYear(new Date().getFullYear().toString());
            setClinkerProduction('');
            setEnergyPercentage('');
            setDataSource('manual');
            setEnergyConsumption(fetchedConversionFactor);
            setCalorificValue('');
            setCalorificUnit('KJ/Kg');
            setPlasticPercent('');
            setShowModal(true);
          }}
          className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 shadow-sm transition-colors"
        >
          <Calculator size={16} /> Check credits
        </button>
      )
    });
    return () => clearPageHeader(id);
  }, [setPageHeader, clearPageHeader, fetchedConversionFactor]);

  const getMonthYear = () => {
    const monthIndex = MONTHS.indexOf(formMonth);
    const isNextYear = monthIndex >= 9;
    const actualYear = isNextYear ? parseInt(formYear) + 1 : parseInt(formYear);
    const m = monthIndex > 8 ? monthIndex - 9 : monthIndex + 3;
    return { m, y: actualYear };
  };

  const handleFetchProductionData = async () => {
    try {
      const { m, y } = getMonthYear();
      const allProdData = await window.pwp.localProduction.getAll();
      const prodData = allProdData.filter(p => {
        if (!p.to_date) return false;
        const d = new Date(p.to_date);
        return d.getMonth() === m && d.getFullYear() === y;
      });
      
      if (!prodData || prodData.length === 0) {
        showToast(`No production data found for ${formMonth}. You can enter values manually.`, 'warning');
        setDataSource('manual');
        return;
      }
      
      let totalClinker = 0, totalEnergyPercentage = 0;
      prodData.forEach(p => {
        totalClinker += p.clinker_production || 0;
        totalEnergyPercentage += p.energy_percentage || 0;
      });
      const avgEnergy = prodData.length > 0 ? totalEnergyPercentage / prodData.length : 0;
      
      setClinkerProduction(totalClinker.toString());
      setEnergyPercentage(avgEnergy.toString());
      setDataSource('fetched');
      showToast(`Data loaded for ${formMonth}`, 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to fetch. You can enter values manually.', 'error');
    }
  };

  const handleCalculateAndSave = async () => {
    const clinkerVal = parseFloat(clinkerProduction);
    const energyPct = parseFloat(energyPercentage);
    const energyConsMJ = parseFloat(energyConsumption);
    const calInput = parseFloat(calorificValue);
    const plasticPct = parseFloat(plasticPercent);
    
    if (isNaN(clinkerVal) || isNaN(energyPct)) {
      showToast('Please provide Clinker Production and Energy Contribution %', 'error');
      return;
    }
    if (isNaN(energyConsMJ) || isNaN(calInput) || isNaN(plasticPct)) {
      showToast('Please fill all fields with valid numbers', 'error');
      return;
    }

    const { m, y } = getMonthYear();
    const monthStr = `${formMonth} ${y}`;

    const dataToSave = {
      month: monthStr,
      energy_contribution_percent: energyPct,
      energy_consumption_mj: energyConsMJ,
      calorific_value_unit: calorificUnit,
      calorific_value_input: calInput,
      calorific_value_kj: calculated.calValueKJ,
      clinker_produced_tons: clinkerVal,
      energy_contribution_mj: calculated.energyContributionMJ,
      rdf_burnt_tons: calculated.rdfBurntTons,
      plastic_percent: plasticPct,
      potential_tons: calculated.potentialTons
    };

    try {
      let res;
      if (editingId) {
        res = await window.pwp.creditCalculations.update({ id: editingId, ...dataToSave });
      } else {
        res = await window.pwp.creditCalculations.add(dataToSave);
      }
      
      if (res.success) {
        // Push RDF burnt back to Production Data as Qualifying Feed
        try {
          await window.pwp.localProduction.updateQualifyingFeed({
            month: m, year: y, qualifying_feed_mt: calculated.rdfBurntTons
          });
        } catch (e) { console.warn('Could not update qualifying feed:', e); }
        
        showToast(editingId ? 'Calculation updated' : 'Calculation saved', 'success');
        setShowModal(false);
        resetForm();
        loadRecords();
      } else {
        showToast(res.error || 'Failed to save', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Error saving calculation', 'error');
    }
  };

  const handleEdit = (record) => {
    setEditingId(record.id);
    const parts = record.month.split(' ');
    setFormMonth(parts[0]);
    if (parts[1]) {
      const monthIndex = MONTHS.indexOf(parts[0]);
      const isNextYear = monthIndex >= 9;
      let displayYear = parseInt(parts[1]);
      let fYear = isNextYear ? displayYear - 1 : displayYear;
      setFormYear(fYear.toString());
    }
    setClinkerProduction((record.clinker_produced_tons || 0).toString());
    setEnergyPercentage((record.energy_contribution_percent || 0).toString());
    setDataSource('fetched');
    setEnergyConsumption((record.energy_consumption_mj || fetchedConversionFactor).toString());
    setCalorificValue((record.calorific_value_input || 0).toString());
    setCalorificUnit(record.calorific_value_unit || 'KJ/Kg');
    setPlasticPercent((record.plastic_percent || 0).toString());
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this calculation?')) return;
    try {
      const res = await window.pwp.creditCalculations.delete(id);
      if (res.success) { showToast('Deleted', 'success'); loadRecords(); }
    } catch (err) { showToast('Error deleting', 'error'); }
  };

  const hasInputData = clinkerProduction !== '' && energyPercentage !== '';

  // Format number for display
  const fmt = (v, d = 2) => v != null ? Number(v).toFixed(d) : '0';

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-teal-700 text-white text-[13px]">
              <tr>
                <th className="px-4 py-3 font-medium text-center border-r border-teal-600 whitespace-nowrap">Year</th>
                <th className="px-4 py-3 font-medium text-center border-r border-teal-600 whitespace-nowrap">Month</th>
                <th className="px-4 py-3 font-medium text-center border-r border-teal-600 whitespace-nowrap">
                  <div className="flex flex-col items-center"><span>Energy contribution</span><span className="text-xs text-teal-200 font-normal">%</span></div>
                </th>
                <th className="px-4 py-3 font-medium text-center border-r border-teal-600 whitespace-nowrap">
                  <div className="flex flex-col items-center"><span>Energy cons./ton</span><span className="text-xs text-teal-200 font-normal">MJ</span></div>
                </th>
                <th className="px-4 py-3 font-medium text-center border-r border-teal-600 whitespace-nowrap">
                  <div className="flex flex-col items-center"><span>Calorific value</span><span className="text-xs text-teal-200 font-normal">KJ/Kg</span></div>
                </th>
                <th className="px-4 py-3 font-medium text-center border-r border-teal-600 whitespace-nowrap">
                  <div className="flex flex-col items-center"><span>Clinker produced</span><span className="text-xs text-teal-200 font-normal">Tons</span></div>
                </th>
                <th className="px-4 py-3 font-medium text-center border-r border-teal-600 whitespace-nowrap">
                  <div className="flex flex-col items-center"><span>Energy from RDF</span><span className="text-xs text-teal-200 font-normal">MJ</span></div>
                </th>
                <th className="px-4 py-3 font-medium text-center border-r border-teal-600 whitespace-nowrap">
                  <div className="flex flex-col items-center"><span>RDF burnt</span><span className="text-xs text-teal-200 font-normal">Tons</span></div>
                </th>
                <th className="px-4 py-3 font-medium text-center border-r border-teal-600 whitespace-nowrap">
                  <div className="flex flex-col items-center"><span>Plastic</span><span className="text-xs text-teal-200 font-normal">%</span></div>
                </th>
                <th className="px-4 py-3 font-medium text-center border-r border-teal-600 whitespace-nowrap">
                  <div className="flex flex-col items-center text-teal-100"><span>Potential</span><span className="text-xs text-teal-200 font-normal">Tons</span></div>
                </th>
                <th className="px-4 py-3 font-medium text-center whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.length === 0 ? (
                <tr>
                  <td colSpan="11" className="px-4 py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center">
                      <Calculator size={48} className="text-slate-200 mb-3" />
                      <p className="text-base font-medium text-slate-600">No Credit Calculations</p>
                      <p className="text-sm mt-1">Click "Check credits" to calculate credits for a month.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                records.map(record => {
                  const parts = (record.month || '').split(' ');
                  const monthName = parts[0] || '';
                  const yearStr = parts[1] || '';
                  return (
                    <tr key={record.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3 border-r border-slate-100 text-center text-slate-500 text-xs">{yearStr}</td>
                      <td className="px-4 py-3 border-r border-slate-100 font-medium text-slate-700 text-center">{monthName}</td>
                      <td className="px-4 py-3 border-r border-slate-100 text-center">{fmt(record.energy_contribution_percent)}%</td>
                      <td className="px-4 py-3 border-r border-slate-100 text-center">{fmt(record.energy_consumption_mj)}</td>
                      <td className="px-4 py-3 border-r border-slate-100 text-center">{fmt(record.calorific_value_kj)}</td>
                      <td className="px-4 py-3 border-r border-slate-100 text-center">{fmt(record.clinker_produced_tons, 0)}</td>
                      <td className="px-4 py-3 border-r border-slate-100 text-center">{fmt(record.energy_contribution_mj)}</td>
                      <td className="px-4 py-3 border-r border-slate-100 text-center">{fmt(record.rdf_burnt_tons, 6)}</td>
                      <td className="px-4 py-3 border-r border-slate-100 text-center">{fmt(record.plastic_percent, 0)}</td>
                      <td className="px-4 py-3 border-r border-slate-100 text-center bg-green-50/30 font-semibold text-green-700">{fmt(record.potential_tons, 6)}</td>
                      <td className="px-4 py-3 text-center flex items-center justify-center gap-1">
                        <button onClick={() => handleEdit(record)} className="p-1.5 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded transition-colors"><Pencil size={16} /></button>
                        <button onClick={() => handleDelete(record.id)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"><Trash2 size={16} /></button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h2 className="text-lg font-semibold text-slate-800">{editingId ? 'Edit Credits' : 'Check Credits'}</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <span className="text-xl leading-none">&times;</span>
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto">
              <div className="space-y-5">
                
                {/* Step 1: Select Month */}
                <div className="space-y-3 border border-slate-200 rounded-xl p-4 bg-slate-50/50">
                  <h3 className="font-medium text-slate-800 text-sm flex items-center gap-2">
                    <span className="bg-slate-200 text-slate-600 w-5 h-5 rounded-full flex items-center justify-center text-xs">1</span> 
                    Select Month & Year
                  </h3>
                  <div className="flex gap-3">
                    <select value={formMonth} onChange={e => { setFormMonth(e.target.value); setDataSource('manual'); }}
                      className="flex-1 rounded-lg border-slate-300 border px-3 py-2 text-sm focus:ring-teal-500 focus:border-teal-500">
                      {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <select value={formYear} onChange={e => { setFormYear(e.target.value); setDataSource('manual'); }}
                      className="w-32 rounded-lg border-slate-300 border px-3 py-2 text-sm focus:ring-teal-500 focus:border-teal-500">
                      <option value="2024">2024-25</option>
                      <option value="2025">2025-26</option>
                      <option value="2026">2026-27</option>
                    </select>
                  </div>
                  <button onClick={handleFetchProductionData}
                    className="w-full bg-slate-800 text-white rounded-lg py-2 text-sm font-medium hover:bg-slate-700 transition-colors">
                    Fetch Production Data
                  </button>
                  <p className="text-xs text-slate-400 text-center">Optional — you can also enter values manually below</p>
                </div>

                {/* Step 2: Production Data (always editable) */}
                <div className="space-y-3 border border-slate-200 rounded-xl p-4">
                  <h3 className="font-medium text-slate-800 text-sm flex items-center gap-2">
                    <span className="bg-slate-200 text-slate-600 w-5 h-5 rounded-full flex items-center justify-center text-xs">2</span> 
                    Production Data
                    {dataSource === 'fetched' && (
                      <span className="ml-auto text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <CheckCircle2 size={12} /> Auto-filled
                      </span>
                    )}
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Clinker Produced (Tons)</label>
                      <input type="number" step="any" value={clinkerProduction} onChange={e => setClinkerProduction(e.target.value)}
                        placeholder="e.g. 221329" className="w-full rounded-lg border-slate-300 border px-3 py-2 text-sm focus:ring-teal-500 focus:border-teal-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Energy Contribution (%)</label>
                      <input type="number" step="any" value={energyPercentage} onChange={e => setEnergyPercentage(e.target.value)}
                        placeholder="e.g. 4.76" className="w-full rounded-lg border-slate-300 border px-3 py-2 text-sm focus:ring-teal-500 focus:border-teal-500" />
                    </div>
                  </div>
                </div>

                {/* Step 3: User Inputs */}
                <div className="space-y-3 border border-slate-200 rounded-xl p-4">
                  <h3 className="font-medium text-slate-800 text-sm flex items-center gap-2">
                    <span className="bg-slate-200 text-slate-600 w-5 h-5 rounded-full flex items-center justify-center text-xs">3</span> 
                    Provide Inputs
                  </h3>
                  
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Energy consumption per ton of clinker (MJ)</label>
                    <input type="number" step="any" value={energyConsumption} onChange={e => setEnergyConsumption(e.target.value)}
                      disabled
                      placeholder="e.g. 3071.05" className="w-full rounded-lg border-slate-300 border px-3 py-2 text-sm bg-slate-100 text-slate-500 cursor-not-allowed focus:ring-0" />
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Calorific value of RDF (Average NCV)</label>
                    <div className="flex gap-2">
                      <input type="number" step="any" value={calorificValue} onChange={e => setCalorificValue(e.target.value)}
                        placeholder="e.g. 2345" className="flex-1 rounded-lg border-slate-300 border px-3 py-2 text-sm focus:ring-teal-500 focus:border-teal-500" />
                      <select value={calorificUnit} onChange={e => setCalorificUnit(e.target.value)}
                        className="w-28 rounded-lg border-slate-300 border px-3 py-2 text-sm bg-slate-50 focus:ring-teal-500 focus:border-teal-500">
                        <option value="KJ/Kg">KJ/Kg</option>
                        <option value="Kcal/Kg">Kcal/Kg</option>
                      </select>
                    </div>
                    {calorificUnit === 'Kcal/Kg' && (
                      <p className="text-xs text-slate-500 mt-1">Converted: {calculated.calValueKJ.toFixed(2)} KJ/Kg (× 4.184)</p>
                    )}
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Plastic %</label>
                    <div className="relative">
                      <input type="number" step="any" value={plasticPercent} onChange={e => setPlasticPercent(e.target.value)}
                        placeholder="e.g. 65" className="w-full rounded-lg border-slate-300 border px-3 py-2 pr-8 text-sm focus:ring-teal-500 focus:border-teal-500" />
                      <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                        <span className="text-slate-400 text-sm">%</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Step 4: Calculated Results (live, disabled) */}
                {hasInputData && energyConsumption && calorificValue && (
                  <div className="space-y-3 border border-teal-200 rounded-xl p-4 bg-teal-50/30">
                    <h3 className="font-medium text-teal-800 text-sm flex items-center gap-2">
                      <Calculator size={16} className="text-teal-600" />
                      Calculated Results
                    </h3>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-white rounded-lg p-3 border border-teal-100">
                        <label className="block text-[10px] uppercase tracking-wide font-semibold text-slate-400 mb-1">Energy from RDF</label>
                        <p className="text-sm font-bold text-slate-800">{calculated.energyContributionMJ.toFixed(2)} <span className="text-xs font-normal text-slate-400">MJ</span></p>
                      </div>
                      <div className="bg-white rounded-lg p-3 border border-teal-100">
                        <label className="block text-[10px] uppercase tracking-wide font-semibold text-slate-400 mb-1">RDF Burnt</label>
                        <p className="text-sm font-bold text-slate-800">{calculated.rdfBurntTons.toFixed(4)} <span className="text-xs font-normal text-slate-400">Tons</span></p>
                      </div>
                      <div className="bg-white rounded-lg p-3 border border-green-200 bg-green-50">
                        <label className="block text-[10px] uppercase tracking-wide font-semibold text-green-600 mb-1">Potential</label>
                        <p className="text-sm font-bold text-green-700">{calculated.potentialTons.toFixed(4)} <span className="text-xs font-normal text-green-500">Tons</span></p>
                      </div>
                    </div>
                  </div>
                )}
                
              </div>
            </div>
            
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
              <button onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-200/50 rounded-lg transition-colors">
                Cancel
              </button>
              <button onClick={handleCalculateAndSave} disabled={!hasInputData}
                className="px-4 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2">
                {editingId ? 'Update & Save' : 'Calculate & Save'}
              </button>
            </div>
          </div>
        </div>
      )}
      <Toast toast={toast} onClose={hideToast} />
    </div>
  );
}

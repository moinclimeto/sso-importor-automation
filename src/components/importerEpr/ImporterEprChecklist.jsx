import { CheckCircle2, Circle, AlertCircle } from 'lucide-react';

function CheckItem({ done, label, action, onAction }) {
  return (
    <li className="flex items-start gap-2 py-1.5">
      {done ? (
        <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
      ) : (
        <Circle size={16} className="text-slate-300 shrink-0 mt-0.5" />
      )}
      <div className="flex-1 min-w-0">
        <span className={done ? 'text-slate-700' : 'text-slate-800 font-medium'}>{label}</span>
        {!done && action && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="block mt-0.5 text-[11px] font-medium text-teal-700 hover:text-teal-900 underline"
          >
            {action}
          </button>
        ) : null}
      </div>
    </li>
  );
}

export default function ImporterEprChecklist({
  draft = null,
  importer3aStatus = '',
  detailsOfProductsPath = '',
  representativePicturePath = '',
  plasticConsumedConfirmed = false,
  onNavigatePurchases,
  onNavigateSales,
  onNavigateWorkbench,
  onNavigate3b,
}) {
  const stats = draft?.stats || {};
  const issues = draft?.issues || [];

  const unclassified = issues.filter((i) => i.type === 'unclassified_procurement').length
    || stats.unclassifiedProcurementCount
    || 0;
  const unmatched = stats.unmatchedSaleCount ?? draft?.unmatchedSales?.length ?? 0;
  const missingCategory = issues.filter((i) => i.type === 'missing_category').length;
  const missingCf = issues.filter((i) => i.type === 'missing_mt').length;

  const purchasesClassified = unclassified === 0;
  const salesMatched = unmatched === 0 && (stats.saleLineCount ?? 0) === 0
    ? true
    : unmatched === 0 && (stats.detailRowCount ?? 0) > 0;
  const hasCategory = missingCategory === 0;
  const hasCf = missingCf === 0;
  const finalized3a = importer3aStatus === 'finalized' || importer3aStatus === 'nil';
  const pdf3a = Boolean(detailsOfProductsPath);
  const pdf3b = Boolean(representativePicturePath);
  const has3c = finalized3a && (importer3aStatus === 'nil' || plasticConsumedConfirmed);

  const allDone = purchasesClassified && salesMatched && hasCategory && hasCf
    && finalized3a && pdf3a && pdf3b && has3c;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-slate-800">Importer CPCB Readiness Checklist</h4>
        {allDone ? (
          <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">Ready</span>
        ) : (
          <span className="text-[11px] font-medium text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full">Incomplete</span>
        )}
      </div>
      {!allDone && (
        <p className="text-xs text-slate-500 flex items-start gap-1.5">
          <AlertCircle size={14} className="text-amber-600 shrink-0 mt-0.5" />
          Complete each step below before CPCB submission.
        </p>
      )}
      <ul className="text-xs">
        <CheckItem
          done={purchasesClassified}
          label="Import purchases classified (Import or Domestic)"
          action="Review purchases"
          onAction={onNavigatePurchases}
        />
        <CheckItem
          done={salesMatched || (stats.saleLineCount ?? 0) === 0}
          label="Domestic sales matched to imports (or NIL if no sales)"
          action="Open 3a workbench"
          onAction={onNavigateWorkbench}
        />
        <CheckItem
          done={hasCategory || (stats.saleLineCount ?? 0) === 0}
          label="Plastic category available on sale lines"
          action="Review sales"
          onAction={onNavigateSales}
        />
        <CheckItem
          done={hasCf || (stats.saleLineCount ?? 0) === 0}
          label="Packaging conversion factor available"
          action="Update packaging details"
          onAction={onNavigateSales}
        />
        <CheckItem
          done={finalized3a}
          label="Section 3a finalized"
          action="Finalize in workbench"
          onAction={onNavigateWorkbench}
        />
        <CheckItem
          done={pdf3a}
          label="Section 3a PDF generated"
          action="Finalize 3a & generate PDF"
          onAction={onNavigateWorkbench}
        />
        <CheckItem
          done={pdf3b}
          label="Section 3b PDF generated"
          action="Generate 3b PDF"
          onAction={onNavigate3b}
        />
        <CheckItem
          done={has3c}
          label="Section 3c values confirmed"
          action="Confirm 3c below"
          onAction={onNavigateWorkbench}
        />
      </ul>
    </div>
  );
}

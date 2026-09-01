import { Info } from 'lucide-react';

export default function PlasticThicknessMinInfoIcon() {
  return (
    <span className="relative inline-flex group/thickness-info align-middle ml-1">
      <button
        type="button"
        tabIndex={0}
        aria-label="Approved minimum thickness guidelines"
        className="inline-flex text-slate-400 hover:text-slate-600 focus:text-teal-700 focus:outline-none"
      >
        <Info size={15} />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none invisible opacity-0 group-hover/thickness-info:visible group-hover/thickness-info:opacity-100 group-focus-within/thickness-info:visible group-focus-within/thickness-info:opacity-100 transition-opacity absolute z-30 left-0 top-full mt-1.5 w-72 rounded-md bg-slate-800 px-3 py-2.5 text-xs font-normal text-white shadow-lg whitespace-normal"
      >
        <strong className="block mb-1.5">Approved Minimum Thickness:</strong>
        <ul className="list-disc pl-4 space-y-1">
          <li><strong>Cat-II (Plastic carry bag):</strong> Minimum 120 Micron</li>
          <li><strong>Cat-II (Plastic sheet/cover):</strong> Minimum 50 Micron</li>
          <li><strong>Cat IV (Compostable plastic bags):</strong> No Minimum Limit (subject to IS 17088 and CPCB certificate)</li>
        </ul>
      </span>
    </span>
  );
}

const fs = require('fs');
let code = fs.readFileSync('src/components/SingleRecordModal.jsx', 'utf8');

// 1. Signature
code = code.replace(
  "export default function SingleRecordModal({ type, initialData, onClose, onSaved }) {",
  "export default function SingleRecordModal({ type, initialData, onClose, onSaved, hasNext, onSaveAndNext }) {"
);

// 2. Form submission wrapper
code = code.replace(
  "const handleSubmit = async (e) => {",
  "const handleSubmit = async (e, isSaveAndNext = false) => {"
);

// 3. Purchase case submit block
let purchaseTarget = `        if (isEdit) {
          payload.id = initialData.id;
          await getApi().purchases.update(payload);
        } else {
          await getApi().purchases.add(payload);
        }
        onSaved?.();
        onClose();`;

let purchaseReplacement = `        if (isEdit) {
          payload.id = initialData.id;
          await getApi().purchases.update(payload);
        } else {
          await getApi().purchases.add(payload);
        }
        onSaved?.();
        if (isSaveAndNext && onSaveAndNext) {
          onSaveAndNext();
        } else {
          onClose();
        }`;
code = code.replace(purchaseTarget, purchaseReplacement);

// 4. Sale case submit block
let saleTarget = `      if (isEdit) {
        payload.id = initialData.id;
        await getApi().sales.update(payload);
      } else {
        await getApi().sales.add(payload);
      }
      onSaved?.();
      onClose();`;

let saleReplacement = `      if (isEdit) {
        payload.id = initialData.id;
        await getApi().sales.update(payload);
      } else {
        await getApi().sales.add(payload);
      }
      onSaved?.();
      if (isSaveAndNext && onSaveAndNext) {
        onSaveAndNext();
      } else {
        onClose();
      }`;
code = code.replace(saleTarget, saleReplacement);

// 5. Form tag
code = code.replace(
  `<form onSubmit={handleSubmit} className={\`overflow-y-auto p-5 space-y-4 \${previewUrl ? 'lg:w-[var(--form-width)]' : 'w-full'}\`}>`,
  `<form onSubmit={(e) => handleSubmit(e, false)} className={\`overflow-y-auto p-5 space-y-4 \${previewUrl ? 'lg:w-[var(--form-width)]' : 'w-full'}\`}>`
);

// 6. Footer buttons
let footerTarget = `        <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2 flex-shrink-0">
          <button type="button" onClick={onClose} disabled={saving} className="btn-secondary">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="btn-primary inline-flex items-center gap-2"
          >
            {saving && <Loader2 size={16} className="animate-spin" />}
            {isPurchase ? 'Preview / Save' : 'Save'}
          </button>
        </div>`;

let footerReplacement = `        <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2 flex-shrink-0">
          <button type="button" onClick={onClose} disabled={saving} className="btn-secondary">
            Cancel
          </button>
          <button
            type="button"
            onClick={(e) => handleSubmit(e, false)}
            disabled={saving}
            className="btn-primary inline-flex items-center gap-2"
          >
            {saving && <Loader2 size={16} className="animate-spin" />}
            {isPurchase ? 'Preview / Save' : 'Save'}
          </button>
          {isEdit && hasNext && (
            <button
              type="button"
              onClick={(e) => handleSubmit(e, true)}
              disabled={saving}
              className="btn-primary inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700"
            >
              {saving && <Loader2 size={16} className="animate-spin" />}
              Save & Next
            </button>
          )}
        </div>`;
code = code.replace(footerTarget, footerReplacement);

fs.writeFileSync('src/components/SingleRecordModal.jsx', code, 'utf8');

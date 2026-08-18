const fs = require('fs');
let code = fs.readFileSync('src/components/SingleRecordModal.jsx', 'utf8');

// Update emptyPurchase
code = code.replace(
  "  category_of_plastic: '',",
  "  category_of_plastic: 'Cat-II',"
);

// Update emptySale (second occurrence of category_of_plastic: '', which is in emptySale)
code = code.replace(
  "  category_of_plastic: '',",
  "  category_of_plastic: 'Cat-II',"
);

// Update useEffect for purchase
code = code.replace(
  "          invoice_filename: initialData.invoice_filename || initialData.invoice_file_name || '',",
  "          category_of_plastic: 'Cat-II',\n          invoice_filename: initialData.invoice_filename || initialData.invoice_file_name || '',"
);

// Update useEffect for sale
code = code.replace(
  "          ...initialData,\n        });",
  "          ...initialData,\n          category_of_plastic: 'Cat-II',\n        });"
);

// Update select in Purchase
let purchaseSelectTarget = `                  <select
                    className={errCls('category_of_plastic')}
                    value={form.category_of_plastic}
                    onChange={(e) => set('category_of_plastic', e.target.value)}
                  >`;
let purchaseSelectReplacement = `                  <select
                    className={errCls('category_of_plastic') + ' bg-slate-100 text-slate-600'}
                    value={form.category_of_plastic || 'Cat-II'}
                    disabled
                  >`;
code = code.replace(purchaseSelectTarget, purchaseSelectReplacement);

// Update select in Sale
let saleSelectTarget = `<select className="input" value={form.category_of_plastic} onChange={(e) => set('category_of_plastic', e.target.value)}>`;
let saleSelectReplacement = `<select className="input bg-slate-100 text-slate-600" value={form.category_of_plastic || 'Cat-II'} disabled>`;
code = code.replace(saleSelectTarget, saleSelectReplacement);

fs.writeFileSync('src/components/SingleRecordModal.jsx', code, 'utf8');

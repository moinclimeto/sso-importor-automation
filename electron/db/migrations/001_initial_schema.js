export const up = `
  CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    gstin TEXT,
    pan TEXT,
    entity_type TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER,
    record_type TEXT NOT NULL,
    category_of_plastic TEXT,
    supplier_name TEXT,
    address_line_1 TEXT,
    address_line_2 TEXT,
    state TEXT,
    city TEXT,
    pin_code TEXT,
    buyer_gst TEXT,
    is_supplier_gst_available TEXT,
    supplier_gst_number TEXT,
    supplier_mobile_number TEXT,
    procurement_date TEXT,
    quantity_mt REAL,
    invoice_number TEXT,
    hsn_code TEXT,
    invoice_filename TEXT,
    vendor_name TEXT,
    vendor_gstin TEXT,
    invoice_no TEXT,
    invoice_date TEXT,
    item_name TEXT,
    quantity REAL,
    unit TEXT,
    total_amount REAL,
    line_items TEXT, -- Storing as JSON string
    extraction TEXT, -- Storing as JSON string
    _source_fields TEXT, -- Storing as JSON string
    _routing TEXT, -- Storing as JSON string
    file_hash TEXT UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER,
    record_type TEXT NOT NULL,
    s_no TEXT,
    category_of_plastic TEXT,
    process_code TEXT,
    plastic_type TEXT,
    product_type TEXT,
    recycled_plastic_percent REAL,
    conversion_factor REAL,
    available_quantity_mt REAL,
    quantity_sold_mt REAL,
    registration_type TEXT,
    entity_name TEXT,
    address TEXT,
    state TEXT,
    district TEXT,
    account_number TEXT,
    ifsc_code TEXT,
    gst_other_charges REAL,
    invoice_file_name TEXT,
    application_number TEXT,
    customer_name TEXT,
    customer_gstin TEXT,
    invoice_no TEXT,
    invoice_date TEXT,
    item_name TEXT,
    quantity REAL,
    unit TEXT,
    total_amount REAL,
    line_items TEXT, -- Storing as JSON string
    extraction TEXT, -- Storing as JSON string
    _source_fields TEXT, -- Storing as JSON string
    _routing TEXT, -- Storing as JSON string
    file_hash TEXT UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE SET NULL
  );
`;

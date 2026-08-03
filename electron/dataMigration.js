import fs from 'fs';
import path from 'path';

export async function migrateFromJsonToSqlite(db, oldDbJsonPath) {
  if (!fs.existsSync(oldDbJsonPath)) {
    console.log('db.json not found, skipping migration.');
    return;
  }

  // Check if SQLite tables are empty
  const companyCount = (await db.get('SELECT COUNT(*) as count FROM companies')).count;
  const purchaseCount = (await db.get('SELECT COUNT(*) as count FROM purchases')).count;
  const saleCount = (await db.get('SELECT COUNT(*) as count FROM sales')).count;
  const fileHashCount = (await db.get('SELECT COUNT(*) as count FROM file_hashes')).count;

  if (companyCount > 0 || purchaseCount > 0 || saleCount > 0 || fileHashCount > 0) {
    console.log('SQLite tables already contain data, skipping migration from db.json.');
    // Optionally delete db.json if data exists in SQLite to prevent re-migration attempts
    // fs.unlinkSync(oldDbJsonPath);
    return;
  }

  console.log('Migrating data from db.json to SQLite...');

  let oldDbData;
  try {
    const raw = fs.readFileSync(oldDbJsonPath, 'utf8').replace(/^\uFEFF/, '');
    oldDbData = JSON.parse(raw);
  } catch (e) {
    console.error('Failed to read or parse db.json:', e);
    return;
  }

  // Migrate Companies
  if (Array.isArray(oldDbData.companies) && oldDbData.companies.length > 0) {
    for (const company of oldDbData.companies) {
      await db.run(
        'INSERT INTO companies (id, name, gstin, pan, entity_type, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        company.id, company.name, company.gstin, company.pan, company.entity_type, company.created_at
      );
    }
    console.log(`Migrated ${oldDbData.companies.length} companies.`);
  }

  // Migrate Purchases
  if (Array.isArray(oldDbData.purchases) && oldDbData.purchases.length > 0) {
    for (const purchase of oldDbData.purchases) {
      // Ensure fileHash is migrated if it exists
      if (purchase.fileHash) {
        await db.run('INSERT OR IGNORE INTO file_hashes (hash) VALUES (?)', purchase.fileHash);
      }

      await db.run(
        `INSERT INTO purchases (
          id, company_id, record_type, category_of_plastic, supplier_name, address_line_1,
          address_line_2, state, city, pin_code, buyer_gst, is_supplier_gst_available,
          supplier_gst_number, supplier_mobile_number, procurement_date, quantity_mt,
          invoice_number, hsn_code, invoice_filename, vendor_name, vendor_gstin, invoice_no,
          invoice_date, item_name, quantity, unit, total_amount, line_items, extraction,
          _source_fields, _routing, file_hash, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        purchase.id,
        purchase.company_id,
        purchase.record_type,
        purchase.category_of_plastic,
        purchase.supplier_name,
        purchase.address_line_1,
        purchase.address_line_2,
        purchase.state,
        purchase.city,
        purchase.pin_code,
        purchase.buyer_gst,
        purchase.is_supplier_gst_available,
        purchase.supplier_gst_number,
        purchase.supplier_mobile_number,
        purchase.procurement_date,
        purchase.quantity_mt,
        purchase.invoice_number,
        purchase.hsn_code,
        purchase.invoice_filename,
        purchase.vendor_name,
        purchase.vendor_gstin,
        purchase.invoice_no,
        purchase.invoice_date,
        purchase.item_name,
        purchase.quantity,
        purchase.unit,
        purchase.total_amount,
        purchase.lineItems ? JSON.stringify(purchase.lineItems) : null, // old db.json might have lineItems
        purchase.extraction ? JSON.stringify(purchase.extraction) : null,
        purchase._source_fields ? JSON.stringify(purchase._source_fields) : null,
        purchase._routing ? JSON.stringify(purchase._routing) : null,
        purchase.fileHash || null,
        purchase.created_at
      );
    }
    console.log(`Migrated ${oldDbData.purchases.length} purchases.`);
  }

  // Migrate Sales
  if (Array.isArray(oldDbData.sales) && oldDbData.sales.length > 0) {
    for (const sale of oldDbData.sales) {
      // Ensure fileHash is migrated if it exists
      if (sale.fileHash) {
        await db.run('INSERT OR IGNORE INTO file_hashes (hash) VALUES (?)', sale.fileHash);
      }

      await db.run(
        `INSERT INTO sales (
          id, company_id, record_type, s_no, category_of_plastic, process_code,
          plastic_type, product_type, recycled_plastic_percent, conversion_factor,
          available_quantity_mt, quantity_sold_mt, registration_type, entity_name,
          address, state, district, account_number, ifsc_code, gst_other_charges,
          invoice_file_name, application_number, customer_name, customer_gstin, invoice_no,
          invoice_date, item_name, quantity, unit, total_amount, line_items, extraction,
          _source_fields, _routing, file_hash, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        sale.id,
        sale.company_id,
        sale.record_type,
        sale.s_no,
        sale.category_of_plastic,
        sale.process_code,
        sale.plastic_type,
        sale.product_type,
        sale.recycled_plastic_percent,
        sale.conversion_factor,
        sale.available_quantity_mt,
        sale.quantity_sold_mt,
        sale.registration_type,
        sale.entity_name,
        sale.address,
        sale.state,
        sale.district,
        sale.account_number,
        sale.ifsc_code,
        sale.gst_other_charges,
        sale.invoice_file_name,
        sale.application_number,
        sale.customer_name,
        sale.customer_gstin,
        sale.invoice_no,
        sale.invoice_date,
        sale.item_name,
        sale.quantity,
        sale.unit,
        sale.total_amount,
        sale.lineItems ? JSON.stringify(sale.lineItems) : null, // old db.json might have lineItems
        sale.extraction ? JSON.stringify(sale.extraction) : null,
        sale._source_fields ? JSON.stringify(sale._source_fields) : null,
        sale._routing ? JSON.stringify(sale._routing) : null,
        sale.fileHash || null,
        sale.created_at
      );
    }
    console.log(`Migrated ${oldDbData.sales.length} sales.`);
  }

  // Migrate fileHashes (if any existed outside of purchases/sales)
  if (Array.isArray(oldDbData.fileHashes) && oldDbData.fileHashes.length > 0) {
    for (const hash of oldDbData.fileHashes) {
      await db.run('INSERT OR IGNORE INTO file_hashes (hash) VALUES (?)', hash);
    }
    console.log(`Migrated ${oldDbData.fileHashes.length} file hashes.`);
  }

  // Update nextId in SQLite sequence tables if needed (to ensure new IDs don't clash)
  // This is a bit complex for sqlite_sequence table directly, but for AUTOINCREMENT,
  // if we insert with existing IDs, sqlite will continue from MAX(id) + 1 automatically.
  // We just need to ensure old nextId doesn't cause issues. If oldId > MAX(current_id), it will take over.

  console.log('Data migration to SQLite complete. Removing db.json...');
  fs.unlinkSync(oldDbJsonPath); // Delete old db.json after successful migration
}

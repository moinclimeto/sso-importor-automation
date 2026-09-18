import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {
  validateSimpRawMaterialSupplyAgainstImport,
  generateSimpImportDetailsExcelBuffer,
  generateSimpSupplyDetailsExcelBuffer,
  parseSimpImportDetailsExcelBuffer,
  parseSimpSupplyDetailsExcelBuffer,
  SIMP_IMPORT_DETAILS_COLUMNS,
  SIMP_SUPPLY_DETAILS_COLUMNS,
  SIMP_IMPORT_EXCEL_SHEET_NAME,
  SIMP_SUPPLY_EXCEL_SHEET_NAME,
  emptySimpImportRow,
  emptySimpSupplyRow,
  validateSimpImportCoveringRequiredYears,
  buildSimpImportRowsFromPurchases,
  buildSimpSupplyRowsFromSales,
  formatSimpImportDate,
  mapToSimpPlasticType,
} from './simpRawMaterialPartB.js';

test('validateSimpRawMaterialSupplyAgainstImport passes when supplied <= imported', () => {
  const imports = [
    { financialYear: '2024-25', plasticType: 'HDPE', quantityTpa: 50 },
    { financialYear: '2024-25', plasticType: 'HDPE', quantityTpa: 30 },
    { financialYear: '2024-25', plasticType: 'LDPE', quantityTpa: 40 },
    { financialYear: '2025-26', plasticType: 'PET', quantityTpa: 100 },
  ];

  const supplies = [
    { financialYear: '2024-25', plasticType: 'HDPE', quantityTpa: 70 },
    { financialYear: '2024-25', plasticType: 'LDPE', quantityTpa: 40 },
    { financialYear: '2025-26', plasticType: 'PET', quantityTpa: 95.5 },
  ];

  const issues = validateSimpRawMaterialSupplyAgainstImport(imports, supplies);
  assert.equal(issues.length, 0);
});

test('validateSimpRawMaterialSupplyAgainstImport blocks when supplied > imported and computes diff', () => {
  const imports = [
    { financialYear: '2024-25', plasticType: 'HDPE', quantityTpa: 50 },
    { financialYear: '2025-26', plasticType: 'PP', quantityTpa: 20 },
  ];

  const supplies = [
    { financialYear: '2024-25', plasticType: 'HDPE', quantityTpa: 65 }, // +15 excess
    { financialYear: '2025-26', plasticType: 'PP', quantityTpa: 20 },   // exact match
    { financialYear: '2025-26', plasticType: 'PET', quantityTpa: 10 },  // no imports (10 excess)
  ];

  const issues = validateSimpRawMaterialSupplyAgainstImport(imports, supplies);
  assert.equal(issues.length, 2);

  const hdpeIssue = issues.find((i) => i.plasticType === 'HDPE');
  assert.ok(hdpeIssue);
  assert.equal(hdpeIssue.totalImported, 50);
  assert.equal(hdpeIssue.totalSupplied, 65);
  assert.equal(hdpeIssue.difference, 15);

  const petIssue = issues.find((i) => i.plasticType === 'PET');
  assert.ok(petIssue);
  assert.equal(petIssue.totalImported, 0);
  assert.equal(petIssue.totalSupplied, 10);
  assert.equal(petIssue.difference, 10);
});

test('generateSimpImportDetailsExcelBuffer uses CPCB Importer Import Template headers', async () => {
  const records = [
    {
      financialYear: '2024-25',
      plasticType: 'HDPE',
      entityName: 'Global Resins Ltd',
      country: 'Germany',
      address: 'Industrial Park 12, Frankfurt',
      contact: '8888888888',
      quantityTons: 125.5,
      importDate: '2025-02-05',
    },
  ];

  const buffer = await generateSimpImportDetailsExcelBuffer(records);
  assert.ok(buffer && buffer.length > 0);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const sheet = wb.getWorksheet(SIMP_IMPORT_EXCEL_SHEET_NAME);
  assert.ok(sheet);

  const headerRow = sheet.getRow(1);
  const headers = headerRow.values.slice(1);
  assert.deepEqual(headers, SIMP_IMPORT_DETAILS_COLUMNS.map((c) => c.header));

  const dataRow = sheet.getRow(2);
  assert.equal(dataRow.getCell(1).value, 'Global Resins Ltd');
  assert.equal(dataRow.getCell(2).value, 'Germany');
  assert.equal(dataRow.getCell(3).value, 'Industrial Park 12, Frankfurt');
  assert.equal(dataRow.getCell(4).value, '8888888888');
  assert.equal(dataRow.getCell(5).value, '2024-25');
  assert.equal(dataRow.getCell(6).value, 'HDPE');
  assert.equal(dataRow.getCell(7).value, 125.5);
  const dateCell = dataRow.getCell(8);
  assert.equal(dateCell.value, '2025-02-05');
  assert.ok(!(dateCell.value instanceof Date));
  assert.equal(dateCell.numFmt, '@');

  const validations = sheet.dataValidations?.model || {};
  assert.equal(validations.E2?.type, 'list');
  assert.equal(validations.F2?.type, 'list');
  assert.match(String(validations.F2.formulae?.[0] || ''), /HDPE/);
  assert.match(String(validations.F2.formulae?.[0] || ''), /MLP/);
  assert.doesNotMatch(String(validations.F2.formulae?.[0] || ''), /PVC/);
  assert.equal(wb.worksheets.length, 1);
  assert.equal(wb.getWorksheet('Lookups'), undefined);
});

test('generateSimpSupplyDetailsExcelBuffer generates valid workbook with registration types', async () => {
  const records = [
    {
      registrationType: 'Registered',
      financialYear: '2024-25',
      plasticType: 'HDPE',
      entityName: 'Alpha Packaging Pvt Ltd',
      address: 'Plot 44, GIDC, Ahmedabad',
      quantityTpa: 80,
    },
    {
      registrationType: 'Unregistered',
      financialYear: '2024-25',
      plasticType: 'LDPE',
      entityName: 'Beta Plastics',
      address: 'Shop 2, Phase 1, Indore',
      quantityTpa: 25,
    },
  ];

  const buffer = await generateSimpSupplyDetailsExcelBuffer(records);
  assert.ok(buffer && buffer.length > 0);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const sheet = wb.getWorksheet(SIMP_SUPPLY_EXCEL_SHEET_NAME);
  assert.ok(sheet);

  const headerRow = sheet.getRow(1);
  const headers = headerRow.values.slice(1);
  assert.deepEqual(headers, SIMP_SUPPLY_DETAILS_COLUMNS.map((c) => c.header));

  const row2 = sheet.getRow(2);
  assert.equal(row2.getCell(1).value, 'Registered');
  assert.equal(row2.getCell(4).value, 'Alpha Packaging Pvt Ltd');
  assert.equal(row2.getCell(5).value, 'India');
  assert.equal(row2.getCell(10).value, 80);

  const row3 = sheet.getRow(3);
  assert.equal(row3.getCell(1).value, 'UnRegistered');
  assert.equal(row3.getCell(10).value, 25);

  const validations = sheet.dataValidations?.model || {};
  assert.equal(validations.A2?.type, 'list');
  assert.equal(validations.B2?.type, 'list');
  assert.equal(validations.H2?.type, 'list');
  assert.equal(validations.I2?.type, 'list');
  assert.match(String(validations.A2.formulae?.[0] || ''), /Registered/);
  assert.match(String(validations.A2.formulae?.[0] || ''), /UnRegistered/);
  assert.match(String(validations.B2.formulae?.[0] || ''), /Producer \(Small or Micro\)/);
  assert.match(String(validations.I2.formulae?.[0] || ''), /LDPE/);
  assert.ok(headers.includes('Country'));
  assert.ok(headers.some((h) => /import date/i.test(String(h))));
  assert.equal(wb.worksheets.length, 1);
});

test('formatSimpImportDate keeps yyyy-mm-dd and reads Excel dd-mm-yyyy', () => {
  assert.equal(formatSimpImportDate('2025-04-14'), '2025-04-14');
  assert.equal(formatSimpImportDate('01-05-2024'), '2024-05-01');
});

test('empty SIMP Part B rows include portal columns', () => {
  const imp = emptySimpImportRow();
  const sup = emptySimpSupplyRow();
  assert.equal(imp.country, '');
  assert.equal(imp.contact, '');
  assert.equal(imp.importDate, '');
  assert.equal(sup.registrationType, 'Registered');
  assert.equal(sup.entityType, '');
  assert.equal(sup.eprRegistrationNo, '');
  assert.equal(sup.country, 'India');
  assert.equal(sup.salesDate, '');
  assert.ok(imp.id);
  assert.ok(sup.id);
});

test('validateSimpImportCoveringRequiredYears flags a missing FY', () => {
  const issues = validateSimpImportCoveringRequiredYears(
    [{ financialYear: '2024-25', quantityTons: 6, plasticType: 'PE' }],
    ['2024-25', '2025-26'],
  );
  assert.equal(issues.length, 1);
  assert.deepEqual(issues[0].missingYears, ['2025-26']);
});

test('import Excel generate then parse roundtrips CPCB template rows', async () => {
  const records = [
    {
      entityName: 'xyz',
      country: 'India',
      address: 'xyz',
      contact: '8888888888',
      financialYear: '2024-25',
      plasticType: 'HDPE',
      quantityTons: 6,
      importDate: '2025-02-05',
    },
  ];
  const buffer = await generateSimpImportDetailsExcelBuffer(records);
  const parsed = await parseSimpImportDetailsExcelBuffer(buffer);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].entityName, 'xyz');
  assert.equal(parsed[0].country, 'India');
  assert.equal(parsed[0].contact, '8888888888');
  assert.equal(parsed[0].financialYear, '2024-25');
  assert.equal(parsed[0].plasticType, 'HDPE');
  assert.equal(String(parsed[0].quantityTons), '6');
  assert.equal(parsed[0].importDate, '2025-02-05');
});

test('supply Excel generate then parse roundtrips rows', async () => {
  const records = [
    {
      registrationType: 'Registered',
      entityType: 'Producer',
      eprRegistrationNo: 'EPR-1',
      entityName: 'Alpha',
      address: 'Plot 1',
      contact: '9999999999',
      financialYear: '2025-26',
      plasticType: 'HDPE',
      quantityTpa: 12.5,
      salesDate: '2025-04-10',
    },
  ];
  const buffer = await generateSimpSupplyDetailsExcelBuffer(records);
  const parsed = await parseSimpSupplyDetailsExcelBuffer(buffer);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].registrationType, 'Registered');
  assert.equal(parsed[0].entityType, 'Producer');
  assert.equal(parsed[0].eprRegistrationNo, 'EPR-1');
  assert.equal(parsed[0].financialYear, '2025-26');
  assert.equal(parsed[0].entityName, 'Alpha');
  assert.equal(parsed[0].country, 'India');
  assert.equal(parsed[0].contact, '9999999999');
  assert.equal(String(parsed[0].quantityTons), '12.5');
  assert.equal(parsed[0].salesDate, '2025-04-10');
});

test('buildSimpSupplyRowsFromSales maps published sales invoices', () => {
  const rows = buildSimpSupplyRowsFromSales([
    {
      doc_status: 'published',
      registration_type: 'Registered',
      entity_type: 'Producer',
      entity_name: 'Alpha Packaging',
      address: 'Plot 44',
      mobile_number: '9999999999',
      invoice_date: '2025-04-10',
      epr_registration_number: 'EPR-88',
      line_items: [{ plastic_material: 'HDPE', quantity: 12, uom: 'MT', processedQuantity: 12 }],
    },
  ], { reportingYears: ['2024-25', '2025-26'] });
  assert.ok(rows.length >= 1);
  assert.equal(rows[0].entityName, 'Alpha Packaging');
  assert.equal(rows[0].entityType, 'Producer');
  assert.equal(rows[0].contact, '9999999999');
  assert.equal(rows[0].eprRegistrationNo, 'EPR-88');
  assert.equal(rows[0].plasticType, 'HDPE');
  assert.equal(rows[0].salesDate, '2025-04-10');
});

test('buildSimpSupplyRowsFromSales uses quantity_sold_mt when line MT is missing', () => {
  const rows = buildSimpSupplyRowsFromSales([
    {
      doc_status: 'published',
      registration_type: 'Unregistered',
      entity_type: 'Importer',
      entity_name: 'Buyer A',
      invoice_date: '2025-04-14',
      financial_year: '2025-26',
      plastic_type: 'PVC',
      quantity_sold_mt: 0.1,
      line_items: [{ product: 'Cement', quantity: 1, unit: 'Box' }],
    },
    {
      doc_status: 'inbox',
      entity_name: 'Draft',
      quantity_sold_mt: 9,
      financial_year: '2025-26',
    },
  ], { reportingYears: ['2024-25', '2025-26'] });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].entityName, 'Buyer A');
  assert.equal(rows[0].entityType, 'Importer');
  assert.equal(rows[0].registrationType, 'Unregistered');
  assert.equal(rows[0].plasticType, 'Others');
  assert.equal(rows[0].quantityTons, 0.1);
  assert.equal(rows[0].financialYear, '2025-26');
});

test('buildSimpImportRowsFromPurchases maps published purchase lines', () => {
  const rows = buildSimpImportRowsFromPurchases([
    {
      doc_status: 'published',
      supplier_name: 'xyz',
      country: 'India',
      address_line_1: 'xyz',
      supplier_mobile_number: '8888888888',
      invoice_date: '2025-02-05',
      line_items: [{ plastic_material: 'PE', quantity: 6, uom: 'MT', processedQuantity: 6 }],
    },
  ], { reportingYears: ['2024-25', '2025-26'] });
  assert.ok(rows.length >= 1);
  assert.equal(rows[0].entityName, 'xyz');
  assert.equal(rows[0].contact, '8888888888');
  assert.equal(rows[0].financialYear, '2024-25');
  assert.equal(mapToSimpPlasticType('pe'), 'LDPE');
  assert.equal(mapToSimpPlasticType('PVC'), 'Others');
});

UPDATE epr_dashboard 
SET 
  ar_window_status = 'Open',
  ar_due_date = '30-Oct-2026',
  ar_filing_status = 'Submitted',
  wallet_available_potential_mt = '15500.50',
  wallet_consolidated_certificates_mt = '4200.00',
  trade_available_certificates = '8',
  trade_hold_certificates_mt = '250.00',
  grievance_raised = '3',
  grievance_pending = '1',
  grievance_resolved = '2',
  company_name = 'PRISM JOHNSON LIMITED'
WHERE _internal_id = 1;

UPDATE sales_details SET year = 2025 WHERE year = '2024-25';
UPDATE sales_details SET year = 2024 WHERE year = '2023-24';

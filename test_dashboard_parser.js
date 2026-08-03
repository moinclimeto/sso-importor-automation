import fs from 'fs';

const rawData = fs.readFileSync('data/epr_dashboard.json', 'utf8');
const jsonData = JSON.parse(rawData);

let parsed = {};

if (jsonData.cards) {
    for (const card of jsonData.cards) {
        const lines = card.split('\n').map(l => l.trim()).filter(l => l && l !== '!' && l !== 'View Details');
        const title = lines[0];

        if (title === 'Annual Filings') {
            for (let i = 1; i < lines.length; i++) {
                if (lines[i] === 'AR Window Status') parsed.ar_window_status = lines[i+1];
                if (lines[i] === 'Due Date') parsed.ar_due_date = lines[i+1];
                if (lines[i] === 'AR Filing Status') parsed.ar_filing_status = lines[i+1];
            }
        }
        else if (title === 'Wallet') {
            for (let i = 1; i < lines.length; i++) {
                if (lines[i] === 'Total Available Potential (in MT)') parsed.wallet_available_potential_mt = parseFloat(lines[i+1]) || 0;
                if (lines[i] === 'Consolidated Certificates Value (in MT)') parsed.wallet_consolidated_certificates_mt = parseFloat(lines[i+1]) || 0;
            }
        }
        else if (title === 'Trade') {
            for (let i = 1; i < lines.length; i++) {
                if (lines[i] === 'Total certificates available for trade') parsed.trade_available_certificates = parseFloat(lines[i+1]) || 0;
                if (lines[i] === 'Total certificate value hold for trading (MT)') parsed.trade_hold_certificates_mt = parseFloat(lines[i+1]) || 0;
            }
        }
        else if (title === 'Environment Compensation') {
            for (let i = 1; i < lines.length; i++) {
                if (lines[i] === 'Total Environment Composition Levied') parsed.ec_levied = lines[i+1];
                if (lines[i] === 'Paid') parsed.ec_paid = lines[i+1];
                if (lines[i] === 'Pending') parsed.ec_pending = lines[i+1];
            }
        }
        else if (title === 'Grievance Raised') {
            for (let i = 1; i < lines.length; i++) {
                if (lines[i] === 'Total Grievance Raised (in Number)') parsed.grievance_raised = parseInt(lines[i+1]) || 0;
                if (lines[i] === 'Pending') parsed.grievance_pending = parseInt(lines[i+1]) || 0;
                if (lines[i] === 'Resolved') parsed.grievance_resolved = parseInt(lines[i+1]) || 0;
            }
        }
    }
}

if (jsonData.rawText) {
    const lines = jsonData.rawText.split('\n').map(l => l.trim()).filter(l => l);
    const cpcbIdx = lines.findIndex(l => l.includes('Central Pollution Control Board'));
    if (cpcbIdx !== -1 && lines.length > cpcbIdx + 1) {
        parsed.company_name = lines[cpcbIdx + 1];
    }
}

console.log(parsed);

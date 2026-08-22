import re

with open('electron/ipcHandlers.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace Procurement
content = re.sub(
    r"return await sdb\.all\(`SELECT \* FROM procurement_details WHERE year = \?`, \[year \|\| 2025\]\);",
    r"const rows = await sdb.all(`SELECT * FROM transactions WHERE transaction_type = 'purchase' AND year = ?`, [String(year || 2025)]);\n        return rows.map(r => ({ ...r, ...(r.raw_data ? JSON.parse(r.raw_data) : {}) }));",
    content
)

# Replace Sales
content = re.sub(
    r"return await sdb\.all\(`SELECT \* FROM sales_details WHERE year = \?`, \[year \|\| 2025\]\);",
    r"const rows = await sdb.all(`SELECT * FROM transactions WHERE transaction_type = 'sales' AND year = ?`, [String(year || 2025)]);\n        return rows.map(r => ({ ...r, ...(r.raw_data ? JSON.parse(r.raw_data) : {}) }));",
    content
)

# Replace Production
content = re.sub(
    r"return await sdb\.all\(`SELECT \* FROM production_details WHERE year = \?`, \[year \|\| 2025\]\);",
    r"const rows = await sdb.all(`SELECT * FROM transactions WHERE transaction_type = 'production' AND year = ?`, [String(year || 2025)]);\n        return rows.map(r => ({ ...r, ...(r.raw_data ? JSON.parse(r.raw_data) : {}) }));",
    content
)

with open('electron/ipcHandlers.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated ipcHandlers.js")

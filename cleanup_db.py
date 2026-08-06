import sqlite3

conn = sqlite3.connect('pwp.db')
cur = conn.cursor()

cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = [row[0] for row in cur.fetchall() if row[0] != 'sqlite_sequence']

for table in tables:
    cur.execute(f"PRAGMA table_info('{table}')")
    cols = [row[1] for row in cur.fetchall()]
    if 'file_source' in cols:
        cur.execute(f"DELETE FROM '{table}' WHERE file_source IS NULL")
        if cur.rowcount > 0:
            print(f"Deleted {cur.rowcount} duplicated old rows from {table}")

conn.commit()
conn.close()
print("Cleanup complete.")

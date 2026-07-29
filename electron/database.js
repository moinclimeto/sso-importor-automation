import path from 'path';
import { app } from 'electron';
import fs from 'fs';

let db = null;
let dbPath = '';

export function initDatabase() {
  const userDataPath = app.getPath('userData');
  const dbDir = path.join(userDataPath, 'pwp-db');
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  dbPath = path.join(dbDir, 'db.json');
  if (!fs.existsSync(dbPath)) {
    db = { companies: [], purchases: [], sales: [], nextId: 1 };
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
  } else {
    try {
      db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
      if (!db.nextId) db.nextId = 1;
    } catch (e) {
      db = { companies: [], purchases: [], sales: [], nextId: 1 };
    }
  }
  return db;
}

export function getDb() {
  return db;
}

export function saveDb() {
  if (db && dbPath) {
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
  }
}

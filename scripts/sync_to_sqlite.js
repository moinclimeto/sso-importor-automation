import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { persistScrapedData } = require('./src/extractors/epr/scrapedDataPersist.cjs');

/** Legacy: import old on-disk JSON into SQLite. New scraper runs save directly to DB. */
export default async function syncToSqlite() {
  console.log('Note: the scraper now saves directly to SQLite. db:sync only imports legacy JSON files if present.');
  return persistScrapedData({ rootDir: process.cwd() });
}

const isDirectRun =
  process.argv[1] &&
  import.meta.url.replace(/\\/g, '/').endsWith(process.argv[1].replace(/\\/g, '/'));

if (isDirectRun) {
  syncToSqlite()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

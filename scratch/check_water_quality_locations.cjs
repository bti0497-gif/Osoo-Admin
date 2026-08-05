const Database = require('better-sqlite3');
const path = require('path');

const appDataDir = process.env.APPDATA || (process.platform === 'darwin' ? path.join(process.env.HOME || '', 'Library', 'Preferences') : process.env.HOME || '');
const dbPath = path.join(appDataDir, 'Osoo-Admin', 'database.sqlite');

try {
  const db = new Database(dbPath, { readonly: true });
  const locations = db.prepare('SELECT DISTINCT location FROM water_quality WHERE location IS NOT NULL AND location != ""').all();
  console.log('Distinct locations in water_quality:', locations.map(l => l.location));

  const sampleRows = db.prepare('SELECT date, site_name, location, nh3_n, no3_n, po4_p, alkalinity FROM water_quality ORDER BY date DESC LIMIT 10').all();
  console.log('Sample rows:', JSON.stringify(sampleRows, null, 2));
} catch (err) {
  console.error('Error reading db:', err.message);
}

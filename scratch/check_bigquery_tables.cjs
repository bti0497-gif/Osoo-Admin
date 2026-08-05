const { BigQuery } = require('@google-cloud/bigquery');
const path = require('path');

const keyFile = path.join(__dirname, '..', 'server', 'config', 'work-jindan-194620a46d59.json');
const bq = new BigQuery({
  projectId: 'work-jindan',
  keyFilename: keyFile,
});

async function main() {
  try {
    const dataset = bq.dataset('daily_log_system', { location: 'asia-northeast3' });
    const [tables] = await dataset.getTables();
    console.log('Tables in daily_log_system:', tables.map(t => t.id));

    for (const table of tables) {
      if (table.id.includes('water') || table.id.includes('kit') || table.id.includes('log')) {
        try {
          const [metadata] = await table.getMetadata();
          console.log(`\nTable Schema for [${table.id}]:`);
          console.log(metadata.schema.fields.map(f => `${f.name} (${f.type})`).join(', '));

          const [rows] = await bq.query({
            query: `SELECT * FROM \`work-jindan.daily_log_system.${table.id}\` LIMIT 3`,
            location: 'asia-northeast3',
          });
          console.log(`Sample rows count for [${table.id}]:`, rows.length);
          if (rows.length > 0) {
            console.log(`Sample row 1 keys for [${table.id}]:`, Object.keys(rows[0]));
          }
        } catch (e) {
          console.error(`Error inspecting table ${table.id}:`, e.message);
        }
      }
    }
  } catch (err) {
    console.error('BigQuery error:', err.message);
  }
}

main();

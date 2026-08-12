const { BigQuery } = require('@google-cloud/bigquery');
const path = require('path');
const { queryWaterQualityData } = require('../server/services/certificateWaterQualityService.cjs');

async function test() {
  const result = await queryWaterQualityData(2026, 7, 'all');
  console.log('Result length:', result.length);
  console.log('Sample result:', result.slice(0, 10));
}

test().catch(console.error);

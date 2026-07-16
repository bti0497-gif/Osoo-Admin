const { BigQuery } = require('@google-cloud/bigquery');
const path = require('path');
const bq = new BigQuery({ keyFilename: path.join(__dirname, 'server/config/work-jindan-194620a46d59.json') });

// 교차 검증에서 Drive 누락으로 확인된 drive_file_name 목록 (날짜 + 현장명 기준)
const MISSING = [
  { rd: '2026-01-07', site: null, driveFile: '\uc131\uc801\uc11c_20260107_\uc2dc\ud654\ud638_\ud734\uac8c\uc18c.jpg' },
  { rd: '2026-01-19', site: '\ub3d9\uba85\ud734\uac8c\uc18c(\ubd80\uc0b0\ubc29\ud5a5)', driveFile: 'mlss_20260119_\ub3d9\uba85\ud734\uac8c\uc18c(\ubd80\uc0b0\ubc29\ud5a5).jpg' },
  { rd: '2026-01-19', site: '\ub3d9\uba85\ud734\uac8c\uc18c(\uccad\ucc9c\ubc29\ud5a5)', driveFile: 'mlss_20260119_\ub3d9\uba85\ud734\uac8c\uc18c(\uccad\ucc9c\ubc29\ud5a5).jpg' },
  { rd: '2026-01-19', site: '\uc8fd\uc554\ud734\uac8c\uc18c(\uc11c\uc6b8\ubc29\ud5a5)', driveFile: 'mlss_20260119_\uc8fd\uc554\ud734\uac8c\uc18c(\uc11c\uc6b8\ubc29\ud5a5).jpg' },
  { rd: '2026-02-11', site: '\uae08\uc655\ud734\uac8c\uc18c(\ud3c9\ud0dd\ubc29\ud5a5)', driveFile: '\uc131\uc801\uc11c_20260211_\uae08\uc655\ud734\uac8c\uc18c(\ud3c9\ud0dd\ubc29\ud5a5).jpg' },
  { rd: '2026-02-11', site: '\ub3d9\uba85\ud734\uac8c\uc18c(\ubd80\uc0b0\ubc29\ud5a5)', driveFile: '\uc131\uc801\uc11c_20260211_\ub3d9\uba85\ud734\uac8c\uc18c(\ubd80\uc0b0\ubc29\ud5a5).jpg' },
  { rd: '2026-02-11', site: '\ub3d9\uba85\ud734\uac8c\uc18c(\uccad\ucc9c\ubc29\ud5a5)', driveFile: '\uc131\uc801\uc11c_20260211_\ub3d9\uba85\ud734\uac8c\uc18c(\uccad\ucc9c\ubc29\ud5a5).jpg' },
  { rd: '2026-02-11', site: '\uc678\ub3d9\ud734\uac8c\uc18c(\ud3ec\ud56d)', driveFile: '\uc131\uc801\uc11c_20260211_\uc678\ub3d9\ud734\uac8c\uc18c(\ud3ec\ud56d).jpg' },
  { rd: '2026-02-11', site: '\uc8fd\uc554\ud734\uac8c\uc18c(\ubd80\uc0b0\ubc29\ud5a5)', driveFile: '\uc131\uc801\uc11c_20260211_\uc8fd\uc554\ud734\uac8c\uc18c(\ubd80\uc0b0\ubc29\ud5a5).jpg' },
  { rd: '2026-02-11', site: '\uc8fd\uc554\ud734\uac8c\uc18c(\uc11c\uc6b8\ubc29\ud5a5)', driveFile: '\uc131\uc801\uc11c_20260211_\uc8fd\uc554\ud734\uac8c\uc18c(\uc11c\uc6b8\ubc29\ud5a5).jpg' },
  { rd: '2026-02-11', site: '\ud69f\uc131\ud734\uac8c\uc18c(\uac15\ub985\ubc29\ud5a5)', driveFile: '\uc131\uc801\uc11c_20260211_\ud69f\uc131\ud734\uac8c\uc18c(\uac15\ub985\ubc29\ud5a5).jpg' },
  { rd: '2026-02-11', site: '\ud69f\uc131\ud734\uac8c\uc18c(\uc778\ucc9c\ubc29\ud5a5)', driveFile: '\uc131\uc801\uc11c_20260211_\ud69f\uc131\ud734\uac8c\uc18c(\uc778\ucc9c\ubc29\ud5a5).jpg' },
];

(async () => {
  console.log('\nDrive \ub204\ub77d \uc131\uc801\uc11c \uc6d0\ubcf8 PDF \ud30c\uc77c\uba85 \uc870\ud68c\n');

  const results = [];

  for (const item of MISSING) {
    const [rows] = await bq.query({
      query: `
        SELECT
          CAST(report_date AS STRING) AS rd,
          site_name,
          drive_file_name,
          source_pdf_name
        FROM \`daily_log_system.water_quality\`
        WHERE CAST(report_date AS STRING) = @rd
          AND drive_file_name = @fn
        LIMIT 1
      `,
      params: { rd: item.rd, fn: item.driveFile },
      types: { rd: 'STRING', fn: 'STRING' },
      location: 'asia-northeast3',
    });

    const row = rows[0];
    results.push({
      driveFile: item.driveFile,
      sourcePdf: row ? (row.source_pdf_name || '(없음)') : '(BQ\uc5d0 \ud589 \uc5c6\uc74c)',
    });
  }

  const maxDrive = Math.max(...results.map(r => r.driveFile.length), 20);
  console.log('Drive \uc800\uc7a5\ub420 \ud30c\uc77c\uba85'.padEnd(maxDrive + 2) + '|\uc6d0\ubcf8 PDF \ud30c\uc77c\uba85');
  console.log('-'.repeat(maxDrive + 2 + 50));
  results.forEach(r => {
    console.log(r.driveFile.padEnd(maxDrive + 2) + '| ' + r.sourcePdf);
  });
})().catch(e => console.error('\uc624\ub958:', e.message));

/**
 * 성적서 교차 검증 스크립트
 * - BigQuery water_quality 테이블의 drive_file_name 명명 규칙 검사
 * - Google Drive에 실제 이미지 파일 존재 여부 교차 검증
 *
 * 사용: node verify_cert_audit.cjs [startDate] [endDate]
 * 예:   node verify_cert_audit.cjs 2026-01-01 2026-03-01
 */
'use strict';

require('dotenv').config({ path: '.env.local' });
const path = require('path');
const { BigQuery } = require('@google-cloud/bigquery');
const { google } = require('googleapis');

// ── 설정 ─────────────────────────────────────────────────────────────────
const BQ_KEY   = path.join(__dirname, 'server/config/work-jindan-194620a46d59.json');
const DRIVE_KEY = path.join(__dirname, 'server/config/google-key.json');

// certificateRoutes.cjs 와 동일한 성적서 루트 폴더
const CERT_ROOT_FOLDER_ID = '1Po-gd-OKlaeGyL-Ppjc6_wKgSLEM4iX4';

// BQ 리전
const BQ_LOCATION = 'asia-northeast3';

// 명명 규칙: {category}_{YYYYMMDD}_{siteName}.jpg
const FILE_NAME_RE = /^(성적서|mlss|ss|기타_성적서)_(\d{8})_(.+)\.jpg$/;

// ── 클라이언트 초기화 ──────────────────────────────────────────────────────
const bq = new BigQuery({ keyFilename: BQ_KEY });

const driveAuth = new google.auth.GoogleAuth({
  keyFile: DRIVE_KEY,
  scopes: ['https://www.googleapis.com/auth/drive.readonly'],
});
const drive = google.drive({ version: 'v3', auth: driveAuth });

// ── Drive 헬퍼 ───────────────────────────────────────────────────────────
const folderCache = {};

async function findFolder(parentId, name) {
  const safeName = name.replace(/'/g, "\\'");
  const res = await drive.files.list({
    q: `mimeType='application/vnd.google-apps.folder' and name='${safeName}' and '${parentId}' in parents and trashed=false`,
    fields: 'files(id, name)',
    spaces: 'drive',
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
    pageSize: 5,
  });
  return (res.data.files || [])[0] || null;
}

async function getFolder(segments) {
  const key = segments.join('/');
  if (key in folderCache) return folderCache[key];
  let cur = { id: CERT_ROOT_FOLDER_ID };
  for (const seg of segments) {
    cur = await findFolder(cur.id, seg);
    if (!cur) { folderCache[key] = null; return null; }
  }
  folderCache[key] = cur;
  return cur;
}

async function findFile(parentId, fileName) {
  // 구글 드라이브 API의 name 쿼리는 괄호가 포함된 경우 검색 누락이 잦으므로,
  // 폴더 내 전체 리스트를 받아와 메모리에서 매핑 대조합니다.
  const res = await drive.files.list({
    q: `'${parentId}' in parents and trashed=false`,
    fields: 'files(id, name, webViewLink)',
    spaces: 'drive',
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
    pageSize: 1000,
  });
  const files = res.data.files || [];
  const targetClean = fileName.replace(/\s+/g, '');
  return files.find(f => f.name.replace(/\s+/g, '') === targetClean) || null;
}

// ── 메인 ─────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const startDate = args[0] || '2026-01-01';
  const endDate   = args[1] || '2026-03-01';

  console.log(`\n${'='.repeat(62)}`);
  console.log(`📋 성적서 교차 검증 (${startDate} ~ ${endDate})`);
  console.log(`   BigQuery  : daily_log_system.water_quality`);
  console.log(`   Drive 루트: ${CERT_ROOT_FOLDER_ID}`);
  console.log(`${'='.repeat(62)}`);

  // 1) BigQuery 조회 (excel 계열 카테고리 제외)
  console.log('\n[1] BigQuery 조회 중...');
  const [rows] = await bq.query({
    query: `
      SELECT
        id,
        CAST(report_date AS STRING) AS rd,
        site_name,
        category,
        drive_file_name,
        source_pdf_name
      FROM \`daily_log_system.water_quality\`
      WHERE CAST(report_date AS STRING) >= @startDate
        AND CAST(report_date AS STRING) < @endDate
      ORDER BY rd, site_name
    `,
    params: { startDate, endDate },
    types: { startDate: 'STRING', endDate: 'STRING' },
    location: BQ_LOCATION,
  });

  console.log(`   → 전체 행: ${rows.length}건`);

  // 카테고리 분류 현황
  const catCount = {};
  rows.forEach(r => {
    const c = String(r.category || '(없음)');
    catCount[c] = (catCount[c] || 0) + 1;
  });
  console.log('   카테고리 분포:');
  Object.entries(catCount).sort((a, b) => b[1] - a[1]).forEach(([c, n]) =>
    console.log(`     ${c.padEnd(20)} : ${n}건`)
  );

  // PDF 업로드 행만 필터 (drive_file_name 이 있거나 category가 명명 규칙에 맞는 것)
  const pdfRows = rows.filter(r => {
    const fn = String(r.drive_file_name || '').trim();
    const cat = String(r.category || '');
    return fn || ['성적서', 'mlss', 'ss', '기타_성적서'].includes(cat);
  });
  console.log(`\n   → PDF 성적서 행(drive_file_name 보유 또는 성적서계 카테고리): ${pdfRows.length}건`);

  if (pdfRows.length === 0) {
    console.log('   ⚠️  검증할 PDF 성적서 행이 없습니다.');
    return;
  }

  // 2) 명명 규칙 검사
  console.log('\n[2] 명명 규칙 검사');
  const nameOk = [];
  const nameNg = [];

  for (const r of pdfRows) {
    const fn = String(r.drive_file_name || '').trim();
    if (!fn) {
      nameNg.push({ rd: r.rd, site: r.site_name, fn: '(없음)', reason: 'drive_file_name 컬럼 없음' });
      continue;
    }
    const m = FILE_NAME_RE.exec(fn);
    if (!m) {
      nameNg.push({ rd: r.rd, site: r.site_name, fn, reason: '파일명 패턴 불일치' });
      continue;
    }
    // 날짜 일치
    const rdCompact = r.rd.replace(/-/g, '').slice(0, 8);
    if (m[2] !== rdCompact) {
      nameNg.push({ rd: r.rd, site: r.site_name, fn, reason: `날짜불일치: BQ=${rdCompact}, 파일명=${m[2]}` });
      continue;
    }
    nameOk.push({ ...r, fn });
  }

  console.log(`   ✅ 규칙 일치: ${nameOk.length}건`);
  console.log(`   ❌ 규칙 불일치: ${nameNg.length}건`);
  if (nameNg.length > 0) {
    nameNg.slice(0, 20).forEach(x =>
      console.log(`      [${x.rd}] ${x.site} | ${x.fn} → ${x.reason}`)
    );
    if (nameNg.length > 20) console.log(`      ... 외 ${nameNg.length - 20}건`);
  }

  // 3) Drive 파일 존재 여부
  console.log(`\n[3] Drive 파일 존재 확인 (${nameOk.length}건 순차 확인)...`);
  const driveOk = [];
  const driveMissing = [];
  let checked = 0;

  for (const r of nameOk) {
    const yr = r.rd.slice(0, 4);
    const mo1 = String(parseInt(r.rd.slice(5, 7), 10)); // "01"→"1"
    const mo2 = r.rd.slice(5, 7);                        // "01" (두자리)

    // 폴더 경로: 성적서/{year}/{month}
    let folder = await getFolder(['성적서', yr, mo1]);
    if (!folder) folder = await getFolder(['성적서', yr, mo2]);

    if (!folder) {
      driveMissing.push({ fn: r.fn, reason: `폴더없음: 성적서/${yr}/${mo1}(또는 ${mo2})` });
    } else {
      const found = await findFile(folder.id, r.fn);
      if (found) {
        driveOk.push({ fn: r.fn, id: found.id, link: found.webViewLink });
      } else {
        driveMissing.push({ fn: r.fn, reason: `파일없음 (폴더ID: ${folder.id})` });
      }
    }

    checked++;
    if (checked % 20 === 0) process.stdout.write(`   ... ${checked}/${nameOk.length} 확인 중\r`);
  }

  // 4) 결과 출력
  console.log(`\n${'='.repeat(62)}`);
  console.log('📊 최종 결과 요약');
  console.log(`${'='.repeat(62)}`);
  console.log(`BigQuery 전체      : ${rows.length}건`);
  console.log(`  ↳ PDF 성적서      : ${pdfRows.length}건`);
  console.log(`  ↳ 명명규칙 OK     : ${nameOk.length}건  /  NG: ${nameNg.length}건`);
  console.log(`  ↳ Drive 존재      : ${driveOk.length}건  /  누락: ${driveMissing.length}건`);

  if (driveOk.length > 0) {
    console.log(`\n✅ Drive 존재 샘플 (최대 5건):`);
    driveOk.slice(0, 5).forEach(f => console.log(`   ${f.fn}`));
  }

  if (driveMissing.length > 0) {
    console.log(`\n❌ Drive 누락 목록:`);
    driveMissing.slice(0, 40).forEach(f => console.log(`   ${f.fn}  →  ${f.reason}`));
    if (driveMissing.length > 40) console.log(`   ... 외 ${driveMissing.length - 40}건`);
  }

  if (nameNg.length === 0 && driveMissing.length === 0) {
    console.log('\n🎉 모든 항목이 명명 규칙을 따르며 Drive에 정상 존재합니다!');
  }
}

main().catch(err => {
  console.error('\n❌ 오류:', err.message);
  process.exit(1);
});

/**
 * 현장(Wastewater_Sites) 기준 → 회원(Wastewater_Member) 동기화 스크립트
 *
 * 정책:
 * - 현장 탭의 manager_name을 회원명(name) 기준으로 사용.
 * - 같은 manager_name으로 2개 이상 현장이 등록된 경우 → site_name1 = '양방향'
 * - 1개 현장만 있는 경우 → site_name1 = 해당 현장명
 * - 이미 회원이 존재하면: 기존 id/비밀번호/전화번호/권한을 보존하고 site_name1만 정정.
 * - 회원이 없으면: 신규 생성 (password='1234', role='user', phone='').
 * - 'admin', '관리자' 등 시스템/가상 담당자는 제외.
 *
 * 안전장치: dry-run 모드(기본)로 변경 계횵을 먼저 출력하고, --apply 플래그가 있어야 실제 반영.
 *
 * 사용법:
 *   node sync_members_from_sites.cjs            # dry-run (변경计划만 출력)
 *   node sync_members_from_sites.cjs --apply    # 실제 Google Sheets에 반영
 */
require('dotenv').config({ path: '.env.local' });
const { google } = require('googleapis');
const crypto = require('crypto');

const SHEET_ID = process.env.GOOGLE_MEMBERS_SHEET_ID;
const KEY_FILE = 'server/config/google-key.json';

// 시스템/가상 담당자명 — 회원 생성에서 제외
const EXCLUDED_MANAGERS = new Set(['admin', '관리자', '', '(미지정)']);

// 현장 담당자명(시트 기준) → 회원명 정정 매핑.
// 현장 탭 담당자명 오타를 회원명 기준으로 맞출 때 사용.
const MANAGER_NAME_REMAP = {
    '윤형호': '윤형오', // 현장 탭에 '윤형호'로 오타 → 회원명은 '윤형오'
};

const auth = new google.auth.GoogleAuth({
    keyFile: KEY_FILE,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

async function main() {
    const apply = process.argv.includes('--apply');
    console.log(apply ? '=== 실제 반영 모드 (--apply) ===' : '=== DRY-RUN (변경计划만 출력, --apply 로 실행) ===\n');

    const sheets = google.sheets({ version: 'v4', auth });

    // 1. 현장 데이터 조회
    const siteRes = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: 'Wastewater_Sites!A2:G',
    });
    const siteRows = (siteRes.data.values || []).filter(r => r && r.length >= 3);
    // 담당자별 현장 그룹화 (is_active !== '0' 인 활성 현장만)
    const byManager = {};
    for (const r of siteRows) {
        const [, site_name, manager_name, , , is_active] = r;
        if (is_active === '0') continue;
        let mgr = String(manager_name || '').trim();
        if (!mgr || EXCLUDED_MANAGERS.has(mgr)) continue;
        mgr = MANAGER_NAME_REMAP[mgr] || mgr; // 오타 정정
        if (!byManager[mgr]) byManager[mgr] = [];
        byManager[mgr].push(String(site_name || '').trim());
    }

    // 2. 회원 데이터 조회 (전체 행 A2:J)
    const memRes = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: 'Wastewater_Member!A2:J',
    });
    const memRows = (memRes.data.values || []).filter(r => r && r[0]); // id가 있는 행만
    // name → { rowIndex(0-based from A2), row(실제 시트 행번호), full row }
    const memberByName = {};
    memRows.forEach((r, i) => {
        const name = String(r[1] || '').trim();
        if (name) memberByName[name] = { rowIndex: i, row: i + 2, data: r };
    });

    const toUpdate = []; // {row, values}
    const toAppend = []; // [values]
    const plan = [];     // 변경 계획 로그용

    // 3. 각 담당자별로 회원 매칭/생성 계획 수립
    for (const [mgr, sites] of Object.entries(byManager).sort()) {
        const isBidir = sites.length > 1;
        const targetSite1 = isBidir ? '양방향' : sites[0];
        const existing = memberByName[mgr];

        if (existing) {
            // 기존 회원 — site_name1만 정정, 나머지 보존
            const currentSite1 = String(existing.data[4] || '').trim();
            if (currentSite1 === targetSite1) {
                plan.push(`[유지] ${mgr}: site_name1='${targetSite1}' (이미 올바름)`);
                continue;
            }
            const newRow = [...existing.data];
            while (newRow.length < 10) newRow.push('');
            newRow[4] = targetSite1; // site_name1만 변경
            toUpdate.push({ row: existing.row, values: newRow });
            plan.push(`[수정] ${mgr}: '${currentSite1}' → '${targetSite1}'${isBidir ? ' (양방향)' : ''}`);
        } else {
            // 신규 회원 생성
            const newRow = [
                crypto.randomUUID(), // id
                mgr,                 // name
                '1234',              // password (기본값)
                'user',              // role
                targetSite1,         // site_name1
                '',                  // phone
                '',                  // target_lat
                '',                  // target_lng
                '',                  // radius_m
                '',                  // notes
            ];
            toAppend.push(newRow);
            plan.push(`[신규] ${mgr}: site_name1='${targetSite1}'${isBidir ? ' (양방향)' : ''}, password='1234', role='user'`);
        }
    }

    // 4. 계획 출력
    plan.forEach(p => console.log(p));
    console.log(`\n총계: ${toUpdate.length}건 수정, ${toAppend.length}건 신규`);

    if (!apply) {
        console.log('\n→ 실제 반영하려면: node sync_members_from_sites.cjs --apply');
        return;
    }

    // 5. 실제 반영
    // 5-1. 기존 행 업데이트
    for (const { row, values } of toUpdate) {
        await sheets.spreadsheets.values.update({
            spreadsheetId: SHEET_ID,
            range: `Wastewater_Member!A${row}:J${row}`,
            valueInputOption: 'RAW',
            requestBody: { values: [values] },
        });
        console.log(`✓ 업데이트: 행 ${row} (${values[1]})`);
    }

    // 5-2. 신규 행 추가
    if (toAppend.length > 0) {
        await sheets.spreadsheets.values.append({
            spreadsheetId: SHEET_ID,
            range: 'Wastewater_Member!A2',
            valueInputOption: 'RAW',
            insertDataOption: 'INSERT_ROWS',
            requestBody: { values: toAppend },
        });
        console.log(`✓ ${toAppend.length}건 신규 회원 추가 완료`);
    }

    console.log('\n동기화 완료!');
}

main().catch(e => { console.error('오류:', e.message); process.exit(1); });

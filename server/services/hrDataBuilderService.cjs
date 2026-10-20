'use strict';

/**
 * hrDataBuilderService.cjs
 * ─────────────────────────────────────────────────────────────────────
 * 실제 Google Sheets(현장/회원) 및 BigQuery(출결/게시판) 데이터를
 * 인사고과 표준 모델로 결합·가공하는 빌더 서비스
 */

const { getSites } = require('./sitesSheetsService.cjs');
const { getMembers } = require('./membersSheetsService.cjs');

/**
 * KST 현재 시각 정보
 */
function getNowKST() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return {
    dateStr: kst.toISOString().split('T')[0],
    hour: kst.getUTCHours(),
    minute: kst.getUTCMinutes(),
  };
}

/**
 * 1. 실제 활성 사업소 및 실제 담당 현장관리자 목록 매핑
 */
async function getActiveWorkers() {
  let masterSites = [];
  let members = [];

  try {
    masterSites = await getSites();
  } catch (err) {
    console.warn('[hrDataBuilderService] getSites 실패:', err.message);
  }

  try {
    members = await getMembers();
  } catch (err) {
    console.warn('[hrDataBuilderService] getMembers 실패:', err.message);
  }

  const activeSites = (masterSites || [])
    .filter((s) => {
      const active = s.is_active === 1 || s.is_active === '1' || s.is_active === true;
      const sName = String(s.site_name || '').trim();
      return active && sName !== '오수처리장' && sName !== '양북임시휴게소';
    })
    .sort((a, b) => String(a.site_name || '').localeCompare(String(b.site_name || ''), 'ko'));

  const workers = activeSites.map((site) => {
    const sName = String(site.site_name || '').trim();
    const sId = String(site.id || '').trim();
    const mName = String(site.manager_name || '').trim();

    // 회원 시트 매핑: 1) site_name1 일치, 2) 이름 일치
    const matchedMember = (members || []).find((m) => {
      const memSite = String(m.site_name1 || '').trim();
      const memName = String(m.name || '').trim();
      return (memSite && memSite === sName) || (mName && memName === mName);
    });

    const finalWorkerName = matchedMember?.name || mName || '현장관리자';
    const isSpecialRole = matchedMember?.role === 'admin' || matchedMember?.role === 'group_admin';

    return {
      workerId: sId,
      siteId: sId,
      siteName: sName,
      workerName: finalWorkerName,
      position: isSpecialRole ? '관리자' : '현장소장',
      phone: String(matchedMember?.phone || '').trim(),
      method: site.method || 'A2O',
      series: site.series || '1계열',
    };
  });

  return workers;
}

/**
 * 출퇴근 시각 및 근무형태 벌점 계산
 */
function computeAutoPenalty({ dayType, checkIn, checkOut, autoLogout }, customRules = null) {
  const rules = customRules || {
    lateMinor: -1,
    lateNormal: -2,
    lateSevere: -3,
    earlyLeave: -2,
    autoLogout: -2,
    absent: -10,
  };

  if (dayType === 'absent') {
    const pts = rules.absent !== undefined ? rules.absent : -10;
    return {
      autoPenaltyPoints: pts,
      lateType: '무단결근',
      earlyType: null,
      penaltyBadges: [{ label: `무단결근 ${pts}`, color: '#991b1b', bg: '#fecaca' }],
    };
  }

  if (dayType !== 'work' && dayType !== 'half_am' && dayType !== 'half_pm') {
    return {
      autoPenaltyPoints: 0,
      lateType: null,
      earlyType: null,
      penaltyBadges: [],
    };
  }

  let points = 0;
  let lateType = null;
  let earlyType = null;
  const penaltyBadges = [];

  if (checkIn && checkIn !== '-' && dayType !== 'half_am') {
    const parts = checkIn.split(':').map(Number);
    const hh = parts[0];
    const mm = parts[1];
    if (!Number.isNaN(hh) && !Number.isNaN(mm)) {
      const totalMin = hh * 60 + mm;
      if (totalMin > 9 * 60 + 30) {
        const p = rules.lateSevere !== undefined ? rules.lateSevere : -3;
        points += p;
        lateType = '심한지각';
        penaltyBadges.push({ label: `지각(${checkIn}) ${p}`, color: '#dc2626', bg: '#fee2e2' });
      } else if (totalMin > 9 * 60 + 10) {
        const p = rules.lateNormal !== undefined ? rules.lateNormal : -2;
        points += p;
        lateType = '일반지각';
        penaltyBadges.push({ label: `지각(${checkIn}) ${p}`, color: '#ea580c', bg: '#ffedd5' });
      } else if (totalMin >= 9 * 60 + 1) {
        const p = rules.lateMinor !== undefined ? rules.lateMinor : -1;
        points += p;
        lateType = '경미지각';
        penaltyBadges.push({ label: `지각(${checkIn}) ${p}`, color: '#d97706', bg: '#fef3c7' });
      }
    }
  }

  if (autoLogout || (typeof checkOut === 'string' && checkOut.startsWith('20:00'))) {
    const p = rules.autoLogout !== undefined ? rules.autoLogout : -2;
    points += p;
    earlyType = '20시자동퇴근';
    penaltyBadges.push({ label: `20시자동 ${p}`, color: '#ea580c', bg: '#ffedd5' });
  } else if (checkOut && checkOut !== '-' && dayType !== 'half_pm') {
    const parts = checkOut.split(':').map(Number);
    const hh = parts[0];
    const mm = parts[1];
    if (!Number.isNaN(hh) && !Number.isNaN(mm)) {
      const totalMin = hh * 60 + mm;
      if (totalMin < 17 * 60 + 50) {
        const p = rules.earlyLeave !== undefined ? rules.earlyLeave : -2;
        points += p;
        earlyType = '조기퇴근';
        penaltyBadges.push({ label: `조퇴(${checkOut}) ${p}`, color: '#e11d48', bg: '#ffe4e6' });
      }
    }
  }

  return {
    autoPenaltyPoints: points,
    lateType,
    earlyType,
    penaltyBadges,
  };
}

/**
 * 2. 실제 BigQuery 출퇴근 로그 + 중앙관리자 수기 저장 레코드 결합
 */
function buildDailyRecordsMap({ workers, year, month, attendanceRows = [], manualDailyRows = [], scoringRules = null }) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const { dateStr: todayKst } = getNowKST();
  const dailyRecordsMap = {};

  // 빠른 탐색을 위한 인덱싱
  // 1) BigQuery 출결: key = `${date}|${site_id}` 또는 `${date}|${site_name}`
  const bqAttMap = new Map();
  for (const row of attendanceRows) {
    const rDate = String(row.date || '').slice(0, 10);
    const sId = String(row.site_id || '').trim();
    const sName = String(row.site_name || '').trim();
    const mName = String(row.member_name || '').trim();

    if (rDate && sId) bqAttMap.set(`${rDate}|id:${sId}`, row);
    if (rDate && sName) bqAttMap.set(`${rDate}|name:${sName}`, row);
    if (rDate && mName) bqAttMap.set(`${rDate}|mem:${mName}`, row);
  }

  // 2) 중앙관리자 저장 수기 레코드: key = `${work_date}|${worker_id}` 또는 `${work_date}|${site_id}`
  const manualMap = new Map();
  for (const mr of manualDailyRows) {
    const wDate = String(mr.work_date || '').slice(0, 10);
    const wId = String(mr.worker_id || mr.site_id || '').trim();
    if (wDate && wId) manualMap.set(`${wDate}|${wId}`, mr);
  }

  for (const worker of workers) {
    const wId = worker.workerId;
    dailyRecordsMap[wId] = {};

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dow = new Date(year, month - 1, day).getDay();
      const isFuture = dateStr > todayKst;

      let dayType = 'work';
      let checkIn = '-';
      let checkOut = '-';
      let autoLogout = false;
      let leaveReason = '';
      let lateReason = '';
      let earlyLeaveReason = '';
      let isPenaltyExcused = false;

      // BigQuery 출결 탐색
      const bqRow =
        bqAttMap.get(`${dateStr}|id:${worker.siteId}`) ||
        bqAttMap.get(`${dateStr}|name:${worker.siteName}`) ||
        bqAttMap.get(`${dateStr}|mem:${worker.workerName}`) ||
        null;

      if (isFuture) {
        // 미래 날짜: 아직 도래하지 않은 날짜 -> 빈 상태/예정
        dayType = 'work';
        checkIn = '-';
        checkOut = '-';
      } else if (bqRow && (bqRow.login_time || bqRow.logout_time)) {
        // 과거/당일 실제 로그인/로그아웃 기록 있음
        dayType = 'work';
        checkIn = bqRow.login_time ? String(bqRow.login_time).slice(0, 5) : '-';
        if (bqRow.logout_time) {
          const lOut = String(bqRow.logout_time);
          if (bqRow.auto_logout || lOut.startsWith('20:00')) {
            checkOut = '20:00 (자동)';
            autoLogout = true;
          } else {
            checkOut = lOut.slice(0, 5);
          }
        } else {
          checkOut = '-';
        }
      } else {
        // 과거 날짜 중 출근·퇴근 기록이 둘 다 없는 날 = 규정상 휴무일 (regular_off)
        dayType = 'regular_off';
        checkIn = '-';
        checkOut = '-';
      }

      // 기본 벌점 계산
      let penaltyInfo = computeAutoPenalty({ dayType, checkIn, checkOut, autoLogout }, scoringRules);

      // 중앙관리자 수기 저장 레코드 오버레이 (휴가 변경, 사유 등록, 참작 면제 등)
      const manual = manualMap.get(`${dateStr}|${wId}`) || manualMap.get(`${dateStr}|${worker.siteId}`);
      if (manual) {
        if (manual.day_type) dayType = manual.day_type;
        if (manual.login_time && manual.login_time !== '-') checkIn = manual.login_time;
        if (manual.logout_time && manual.logout_time !== '-') checkOut = manual.logout_time;
        if (manual.is_auto_logout !== undefined) autoLogout = Boolean(manual.is_auto_logout);
        leaveReason = manual.leave_reason || '';
        lateReason = manual.late_reason || '';
        earlyLeaveReason = manual.early_leave_reason || '';
        isPenaltyExcused = Boolean(manual.is_penalty_excused);

        // 변경된 상태로 재계산
        penaltyInfo = computeAutoPenalty({ dayType, checkIn, checkOut, autoLogout }, scoringRules);
      }

      const finalPenaltyPoints = isPenaltyExcused ? 0 : penaltyInfo.autoPenaltyPoints;

      dailyRecordsMap[wId][dateStr] = {
        date: dateStr,
        day,
        dow,
        dayType,
        checkIn,
        checkOut,
        autoLogout,
        leaveReason,
        lateReason,
        earlyLeaveReason,
        autoPenaltyPoints: penaltyInfo.autoPenaltyPoints,
        isPenaltyExcused,
        finalPenaltyPoints,
        penaltyBadges: penaltyInfo.penaltyBadges,
        lateType: penaltyInfo.lateType,
        earlyType: penaltyInfo.earlyType,
        isFuture,
      };
    }
  }

  return dailyRecordsMap;
}

module.exports = {
  getNowKST,
  getActiveWorkers,
  computeAutoPenalty,
  buildDailyRecordsMap,
};

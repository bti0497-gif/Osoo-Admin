import { useState, useCallback, useMemo } from 'react';
import { getApiBase } from '../../../core/api/serverConfig.js';

const adminHeaders = () => {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  return {
    'Content-Type': 'application/json',
    'x-user-role': user.role || 'admin',
    'x-user-name': user.name || 'admin',
  };
};

/**
 * 출결 달력 ViewModel
 * selectedSite !== 'all' && period !== 'daily' 일 때 사용
 */
export function useAttendanceCalendar({ selectedDate, selectedSite, period }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    console.log('[useAttendanceCalendar] fetchData 호출:', { selectedDate, selectedSite, period });
    if (!selectedSite || selectedSite === 'all') {
      console.log('[useAttendanceCalendar] selectedSite가 all이거나 없어서 조회 스킵');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ date: selectedDate, period, siteId: selectedSite });
      console.log('[useAttendanceCalendar] API 요청:', params.toString());
      const res = await fetch(`${getApiBase()}/api/attendance?${params}`, { headers: adminHeaders() });
      console.log('[useAttendanceCalendar] API 응답 상태:', res.status);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || '조회 실패');
      }
      const result = await res.json();
      console.log('[useAttendanceCalendar] API 응답 데이터:', result);
      if (!result.success) throw new Error(result.error || '조회 실패');
      const normalized = result.data.map(normalizeRow);
      console.log('[useAttendanceCalendar] 정규화된 데이터:', normalized);
      setRows(normalized);
    } catch (e) {
      console.error('[useAttendanceCalendar] 조회 오류:', e);
      setError(e.message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [selectedDate, selectedSite, period]);

  // date → row 매핑 (날짜 문자열 키)
  const rowsByDate = useMemo(() => {
    const map = {};
    for (const row of rows) {
      const d = row.date?.value ?? row.date ?? '';
      const key = String(d).slice(0, 10);
      if (!map[key]) map[key] = [];
      map[key].push(row);
    }
    return map;
  }, [rows]);

  // 달력에 표시할 날짜 범위 계산
  const calendarDays = useMemo(() => {
    if (!selectedDate) return [];
    if (period === 'weekly') {
      return getWeekDays(selectedDate);
    }
    if (period === 'monthly') {
      return getMonthDays(selectedDate);
    }
    return [];
  }, [selectedDate, period]);

  return { calendarDays, rowsByDate, loading, error, fetchData };
}

// ── 날짜 범위 헬퍼 ─────────────────────────────────────────────

function getWeekDays(dateStr) {
  const d = new Date(dateStr);
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return Array.from({ length: 7 }, (_, i) => {
    const dd = new Date(monday);
    dd.setDate(monday.getDate() + i);
    return toDateStr(dd);
  });
}

function getMonthDays(dateStr) {
  const [year, month] = dateStr.split('-').map(Number);
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  // 달력 그리드: 월요일 시작, 6주 × 7일
  const startDay = first.getDay(); // 0=일
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - (startDay === 0 ? 6 : startDay - 1));
  const totalDays = 42;
  return Array.from({ length: totalDays }, (_, i) => {
    const dd = new Date(gridStart);
    dd.setDate(gridStart.getDate() + i);
    return toDateStr(dd);
  });
}

function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function normalizeRow(row) {
  const norm = {};
  for (const [k, v] of Object.entries(row)) {
    norm[k] = (v !== null && typeof v === 'object' && 'value' in v) ? v.value : v;
  }
  return norm;
}

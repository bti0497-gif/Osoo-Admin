import { useState, useEffect, useCallback } from 'react';
import { getApiBase } from '../../../core/api/serverConfig.js';

// 오늘 날짜 YYYY-MM-DD 반환
const getTodayString = () => new Date().toISOString().split('T')[0];

const adminHeaders = () => {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  return {
    'Content-Type': 'application/json',
    'x-user-role': user.role || 'admin',
    'x-user-name': user.name || 'admin',
  };
};

/**
 * 출결 현황 대시보드 ViewModel
 */
export function useAttendanceDashboard() {
  const [selectedDate, setSelectedDate] = useState(getTodayString());
  const [selectedSite, setSelectedSite] = useState('all');
  const [period, setPeriod] = useState('daily');
  const [sites, setSites] = useState([]);
  const [attendanceData, setAttendanceData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedRowId, setSelectedRowId] = useState(null);

  // 현장 목록 조회
  const fetchSites = useCallback(async () => {
    try {
      const res = await fetch(`${getApiBase()}/api/attendance/sites`, {
        headers: adminHeaders(),
      });
      if (!res.ok) throw new Error('현장 목록 조회 실패');
      const result = await res.json();
      if (result.success) {
        // 중복 site_id 제거
        const uniqueSites = result.data.filter((site, index, self) =>
          index === self.findIndex((s) => s.site_id === site.site_id)
        );
        setSites(uniqueSites);
      }
    } catch (err) {
      console.error('[useAttendanceDashboard] 현장 목록 조회 실패:', err);
    }
  }, []);

  // 출결 데이터 조회
  const fetchAttendance = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSelectedRowId(null);

    try {
      const params = new URLSearchParams({
        date: selectedDate,
        period,
      });
      if (selectedSite !== 'all') {
        params.append('siteId', selectedSite);
      }

      const res = await fetch(`${getApiBase()}/api/attendance?${params}`, {
        headers: adminHeaders(),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || '출결 데이터 조회 실패');
      }

      const result = await res.json();
      if (result.success) {
        const formatted = result.data.map((row, index) => {
          const rawDate = row.date?.value || row.date;
          return {
            id: `${row.site_id || 'unknown'}-${row.member_id || 'unknown'}-${rawDate || 'nodate'}-${index}`,
            no: index + 1,
            date: rawDate || '-',
            siteId: row.site_id,
            siteName: row.site_name || '-',
            worker: row.member_name || '-',
            checkIn: row.login_time || '-',
            checkOut: row.logout_time ? row.logout_time : (row.login_time ? '근무중' : '-'),
            judgment: getJudgment(row),
            access: getAccess(row),
            remoteType: row.remote_session_type || null,
            remoteEvidence: row.remote_session_evidence || null,
            raw: row,
          };
        });
        setAttendanceData(formatted);
      } else {
        throw new Error(result.error || '조회 실패');
      }
    } catch (err) {
      console.error('[useAttendanceDashboard] 출결 조회 실패:', err);
      setError(err.message);
      setAttendanceData([]);
    } finally {
      setLoading(false);
    }
  }, [selectedDate, selectedSite, period]);

  // 초기 현장 목록 로드
  useEffect(() => {
    fetchSites();
  }, [fetchSites]);

  // 조건 변경 시 출결 데이터 재조회
  useEffect(() => {
    fetchAttendance();
  }, [fetchAttendance]);

  return {
    // 상태
    selectedDate,
    setSelectedDate,
    selectedSite,
    setSelectedSite,
    period,
    setPeriod,
    sites,
    attendanceData,
    loading,
    error,
    selectedRowId,
    setSelectedRowId,
    // 액션
    refresh: fetchAttendance,
  };
}

// 판정: 출근 여부
function getJudgment(row) {
  if (!row.login_time) return { label: '미출근', color: '#94a3b8' };
  
  // auto_logout 플래그가 true이거나 퇴근시각이 20:00(저녁 8시) 정각인 경우 자동 로그아웃이므로 '비정상' 판정
  const isAutoLogout = Boolean(row.auto_logout) || (
    typeof row.logout_time === 'string' && row.logout_time.startsWith('20:00')
  );

  if (isAutoLogout) return { label: '비정상', color: '#f97316' };
  if (row.logout_time) return { label: '정상', color: '#22c55e' };
  return { label: '근무중', color: '#3b82f6' };
}

// 접속: 원격 여부 및 접속 프로그램 정보
function getAccess(row) {
  if (!row.login_time) return { label: '-', color: '#94a3b8' };
  
  const program = (
    row.remote_session_type &&
    row.remote_session_type !== 'local' &&
    row.remote_session_type !== 'none'
  ) ? row.remote_session_type : (row.remote_session_evidence || null);

  const isRemote = Boolean(row.remote_session_detected || program);
  if (isRemote) {
    return {
      label: '원격',
      color: '#ef4444',
      program: program || ''
    };
  }
  return { label: '정상', color: '#22c55e' };
}

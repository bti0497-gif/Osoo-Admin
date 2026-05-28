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
        // 데이터 가공: 그리드용 형식 (중복 ID 방지를 위해 인덱스 포함)
        const formatted = result.data.map((row, index) => {
          // BigQuery { value: "..." } 형식 처리
          const rawDate = row.date?.value || row.date;
          return {
            id: `${row.site_id || 'unknown'}-${row.member_id || 'unknown'}-${rawDate || 'nodate'}-${index}`,
            no: index + 1,
            date: rawDate || '-',
            siteId: row.site_id,
            siteName: row.site_name || '-',
            worker: row.member_name || '-',
            checkIn: formatTime(row.login_time),
            checkOut: formatTime(row.logout_time),
            note: getNote(row),
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

// 시간 포맷팅 (BigQuery TIMESTAMP → HH:MM)
function formatTime(timeValue) {
  if (!timeValue) return '-';

  // BigQuery가 { value: "..." } 형태로 반환하는 경우
  if (timeValue && typeof timeValue === 'object' && timeValue.value) {
    timeValue = timeValue.value;
  }

  // Date 객체인 경우 (BigQuery TIMESTAMP)
  if (timeValue instanceof Date) {
    return timeValue.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  // ISO 8601 문자열인 경우 (예: 2026-05-28T09:30:00.000Z)
  const timeStr = String(timeValue);
  if (timeStr.includes('T')) {
    const date = new Date(timeStr);
    if (!isNaN(date.getTime())) {
      return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
    }
  }

  // HH:MM:SS 형식
  const match = timeStr.match(/(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : timeStr;
}

// 비고 항목 생성 (정상/원격/비정상)
function getNote(row) {
  // 출근 기록 없음
  if (!row.login_time) return '-';

  // 출근과 퇴근 모두 있음
  if (row.login_time && row.logout_time) {
    // 장소 불일치 또는 원격 접속 감지
    if (row.remote_session_detected || !row.location_matched) {
      return '원격';
    }
    return '정상';
  }

  // 출근만 있고 퇴근 없음
  return '비정상';
}

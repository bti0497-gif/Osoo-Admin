import { useAttendanceDashboard } from '../viewmodels/useAttendanceDashboard.js';

/**
 * 출결 현황 대시보드 View
 * - 일별/월별/년도별 전국 현장관리자 출결현황
 * - 현장별 주간/월간/년간 현장관리자 출결현황
 */
export function AttendanceDashboardView() {
  const {
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
    refresh,
  } = useAttendanceDashboard();

  return (
    <div style={styles.container}>
      {/* 상단 컨트롤 영역 */}
      <header style={styles.header}>
        {/* 왼쪽: 날짜 선택 */}
        <div style={styles.controlGroup}>
          <label style={styles.label}>조회일</label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => {
              setSelectedDate(e.target.value);
              setSelectedRowId(null); // 선택 초기화
            }}
            style={styles.dateInput}
          />
        </div>

        {/* 가운데: 현장 선택 (전국현황 + 현장목록) */}
        <div style={styles.controlGroup}>
          <label style={styles.label}>현장</label>
          <select
            value={selectedSite}
            onChange={(e) => {
              setSelectedSite(e.target.value);
              setSelectedRowId(null);
            }}
            style={styles.select}
          >
            <option value="all">전국현황</option>
            {sites.map((site) => (
              <option key={site.site_id} value={site.site_id}>
                {site.site_name}
              </option>
            ))}
          </select>
        </div>

        {/* 오른쪽: 기간 선택 */}
        <div style={styles.controlGroup}>
          <label style={styles.label}>조회기간</label>
          <select
            value={period}
            onChange={(e) => {
              setPeriod(e.target.value);
              setSelectedRowId(null); // 선택 초기화
            }}
            style={styles.select}
          >
            <option value="daily">일별</option>
            <option value="weekly">주간</option>
            <option value="monthly">월별</option>
          </select>
        </div>
      </header>

      {/* 그리드 영역 */}
      <main style={styles.gridContainer}>
        {loading && (
          <div style={styles.loadingOverlay}>
            <div style={styles.spinner}></div>
            <span>데이터를 불러오는 중...</span>
          </div>
        )}
        {error && (
          <div style={styles.errorMessage}>
            <span>⚠️ {error}</span>
            <button onClick={refresh} style={styles.retryBtn}>재시도</button>
          </div>
        )}
        {!loading && !error && attendanceData.length === 0 && (
          <div style={styles.emptyMessage}>
            해당 조건의 출결 데이터가 없습니다.
          </div>
        )}
        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead style={styles.thead}>
              <tr style={styles.headerRow}>
                <th style={{ ...styles.th, ...styles.thNo }}>번호</th>
                {period !== 'daily' && (
                  <th style={{ ...styles.th, ...styles.thDate }}>날짜</th>
                )}
                <th style={{ ...styles.th, ...styles.thSite }}>현장명</th>
                <th style={{ ...styles.th, ...styles.thWorker }}>근무자</th>
                <th style={{ ...styles.th, ...styles.thCheckIn }}>출근시간</th>
                <th style={{ ...styles.th, ...styles.thCheckOut }}>퇴근시간</th>
                <th style={{ ...styles.th, ...styles.thNote }}>비고</th>
              </tr>
            </thead>
            <tbody>
              {attendanceData.map((row) => {
                const isSelected = selectedRowId === row.id;
                return (
                  <tr
                    key={row.id}
                    style={isSelected ? styles.trSelected : styles.tr}
                    onClick={() => setSelectedRowId(row.id)}
                  >
                    <td style={{ ...styles.td, textAlign: 'center' }}>{row.no}</td>
                    {period !== 'daily' && (
                      <td style={{ ...styles.td, textAlign: 'center' }}>{row.date}</td>
                    )}
                    <td style={{ ...styles.td, textAlign: 'left' }}>{row.siteName}</td>
                    <td style={{ ...styles.td, textAlign: 'center' }}>{row.worker}</td>
                    <td style={{ ...styles.td, textAlign: 'center' }}>{row.checkIn}</td>
                    <td style={{ ...styles.td, textAlign: 'center' }}>{row.checkOut}</td>
                    <td style={{ ...styles.td, textAlign: 'center' }}>{row.note}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

const styles = {
  container: {
    padding: '24px',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '24px',
    marginBottom: '20px',
    paddingBottom: '16px',
    borderBottom: '1px solid #e2e8f0',
  },
  controlGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#64748b',
  },
  dateInput: {
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid #cbd5e1',
    fontSize: '14px',
    backgroundColor: '#fff',
    cursor: 'pointer',
    minWidth: '140px',
  },
  select: {
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid #cbd5e1',
    fontSize: '14px',
    backgroundColor: '#fff',
    cursor: 'pointer',
    minWidth: '200px',
  },
  gridContainer: {
    flex: 1,
    overflow: 'auto',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
    backgroundColor: '#f8fafc',
    position: 'relative',
  },
  tableWrapper: {
    minWidth: '100%',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 'clamp(10px, 1vw, 12px)', // 더 작은 반응형 폰트
    backgroundColor: '#fff',
    tableLayout: 'fixed', // 열 너비 고정
  },
  thead: {
    position: 'sticky',
    top: 0,
    zIndex: 1,
  },
  headerRow: {
    backgroundColor: '#334155',
  },
  th: {
    padding: 'clamp(8px, 1vw, 12px) clamp(8px, 1vw, 14px)',
    textAlign: 'center',
    fontWeight: 600,
    color: '#fff',
    backgroundColor: '#334155',
    borderBottom: '2px solid #1e293b',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  // 열 너비 비율: 번호(5%, 50px), 날짜(12%, 100px), 현장명(30%), 근무자(13%), 출근(11%, 60px), 퇴근(11%, 60px), 비고(9%, 50px)
  thNo: { width: '5%', minWidth: '50px' },
  thDate: { width: '12%', minWidth: '100px' },
  thSite: { width: '30%', minWidth: '120px' },
  thWorker: { width: '13%', minWidth: '80px' },
  thCheckIn: { width: '11%', minWidth: '60px' },
  thCheckOut: { width: '11%', minWidth: '60px' },
  thNote: { width: '9%', minWidth: '50px' },
  tr: {
    borderBottom: '1px solid #e2e8f0',
    cursor: 'pointer',
    transition: 'background-color 0.15s ease',
  },
  trSelected: {
    borderBottom: '1px solid #e2e8f0',
    cursor: 'pointer',
    backgroundColor: '#dbeafe',
  },
  td: {
    padding: 'clamp(8px, 1vw, 12px) clamp(10px, 1.2vw, 16px)',
    color: '#334155',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  loadingOverlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
    gap: '12px',
    color: '#64748b',
    zIndex: 10,
  },
  spinner: {
    width: '32px',
    height: '32px',
    border: '3px solid #e2e8f0',
    borderTop: '3px solid #3b82f6',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  errorMessage: {
    padding: '16px',
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '8px',
    color: '#dc2626',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    marginBottom: '12px',
  },
  retryBtn: {
    padding: '6px 12px',
    backgroundColor: '#dc2626',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px',
  },
  emptyMessage: {
    padding: '48px',
    textAlign: 'center',
    color: '#94a3b8',
    fontSize: '14px',
  },
};

// Keyframes for spinner
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;
document.head.appendChild(styleSheet);

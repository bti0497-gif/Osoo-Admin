import React from 'react';
import { useAttendanceDashboard } from '../viewmodels/useAttendanceDashboard.js';
import { AttendanceCalendarView } from './AttendanceCalendarView.jsx';

/**
 * 출결 현황 대시보드 View
 * - 일별/주간/월별 전국 현장관리자 출결현황
 * - 상태별 필터링 (전체, 근무중, 퇴근완료, 미출근/기록없음)
 * - 주간/월간 특정 현장 선택 제약 유도 UI
 */
export function AttendanceDashboardView() {
  const {
    selectedDate,
    setSelectedDate,
    selectedSite,
    setSelectedSite,
    period,
    setPeriod,
    statusFilter,
    setStatusFilter,
    sites,
    attendanceData,
    stats,
    loading,
    error,
    requireSiteSelection,
    selectedRowId,
    setSelectedRowId,
    refresh,
  } = useAttendanceDashboard();

  const useCalendar = selectedSite !== 'all' && (period === 'weekly' || period === 'monthly');
  const siteName = sites.find((s) => s.site_id === selectedSite)?.site_name || selectedSite;

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
              setSelectedRowId(null);
            }}
            style={styles.dateInput}
          />
        </div>

        {/* 가운데: 현장 선택 (전국현황 + 현장목록) */}
        <div style={styles.controlGroup}>
          <label style={styles.label}>현장 <span style={{ color: period !== 'daily' ? '#ef4444' : '#64748b' }}>*</span></label>
          <select
            value={selectedSite}
            onChange={(e) => {
              setSelectedSite(e.target.value);
              setSelectedRowId(null);
            }}
            style={{
              ...styles.select,
              borderColor: (period !== 'daily' && selectedSite === 'all') ? '#f87171' : '#cbd5e1',
              fontWeight: selectedSite !== 'all' ? 700 : 400,
            }}
          >
            <option value="all">전국현황 (전체 현장)</option>
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
              setSelectedRowId(null);
            }}
            style={styles.selectShort}
          >
            <option value="daily">일별</option>
            <option value="weekly">주간</option>
            <option value="monthly">월별</option>
          </select>
        </div>

        {/* 일별 전국현황일 때 상태별 필터 바 */}
        {period === 'daily' && (
          <div style={styles.statusFilterGroup}>
            <button
              style={{
                ...styles.statusTab,
                ...(statusFilter === 'all' ? styles.statusTabActiveAll : {}),
              }}
              onClick={() => setStatusFilter('all')}
            >
              전체 <strong>{stats.total}</strong>
            </button>

            <button
              style={{
                ...styles.statusTab,
                ...(statusFilter === 'working' ? styles.statusTabActiveWorking : {}),
              }}
              onClick={() => setStatusFilter('working')}
            >
              <span style={styles.dotWorking} /> 근무중 <strong>{stats.working}</strong>
            </button>

            <button
              style={{
                ...styles.statusTab,
                ...(statusFilter === 'off' ? styles.statusTabActiveOff : {}),
              }}
              onClick={() => setStatusFilter('off')}
            >
              <span style={styles.dotOff} /> 퇴근 <strong>{stats.off}</strong>
            </button>

            <button
              style={{
                ...styles.statusTab,
                ...(statusFilter === 'no_record' ? styles.statusTabActiveNoRecord : {}),
              }}
              onClick={() => setStatusFilter('no_record')}
            >
              <span style={styles.dotNoRecord} /> 미출근 / 기록없음 <strong>{stats.noRecord}</strong>
            </button>
          </div>
        )}
      </header>

      {/* 주간 / 월간 선택 시 전국현황(all) 안내 카드 */}
      {requireSiteSelection && (
        <div style={styles.requireSiteBanner}>
          <div style={styles.bannerIcon}>💡</div>
          <div>
            <h4 style={styles.bannerTitle}>특정 현장을 선택해 주세요</h4>
            <p style={styles.bannerText}>
              주간 및 월간 출결 달력 현황은 특정 현장을 선택해야 조회가 가능합니다. 상단 <strong>[현장]</strong> 드롭다운 메뉴에서 조회하고자 하는 현장을 선택해 주세요.
            </p>
          </div>
        </div>
      )}

      {/* 그리드 및 달력 영역 */}
      <main style={{ ...styles.gridContainer, padding: useCalendar ? '12px' : 0 }}>
        {/* ── 달력 뷰 (특정 현장 + 주간/월별) ── */}
        {useCalendar ? (
          <AttendanceCalendarView
            selectedDate={selectedDate}
            selectedSite={selectedSite}
            period={period}
            siteName={siteName}
          />
        ) : !requireSiteSelection && (
          <>
            {loading && (
              <div style={styles.loadingOverlay}>
                <div style={styles.spinner} />
                <span>출결 데이터를 불러오는 중...</span>
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
                선택한 상태 필터의 출결 데이터가 없습니다.
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
                    <th style={{ ...styles.th, ...styles.thCheckIn }}>출근</th>
                    <th style={{ ...styles.th, ...styles.thCheckOut }}>퇴근</th>
                    <th style={{ ...styles.th, ...styles.thStatus }}>판정</th>
                    <th style={{ ...styles.th, ...styles.thAccess }}>접속</th>
                  </tr>
                </thead>

                <tbody>
                  {attendanceData.map((row) => {
                    const isSelected = selectedRowId === row.id;
                    const isNoRecord = row.statusKey === 'no_record';

                    return (
                      <tr
                        key={row.id}
                        style={{
                          ...(isSelected ? styles.trSelected : styles.tr),
                          ...(isNoRecord ? styles.trNoRecord : {}),
                        }}
                        onClick={() => setSelectedRowId(row.id)}
                      >
                        <td style={{ ...styles.td, textAlign: 'center' }}>{row.no}</td>

                        {period !== 'daily' && (
                          <td style={{ ...styles.td, textAlign: 'center' }}>{row.date}</td>
                        )}

                        <td style={{ ...styles.td, textAlign: 'left', fontWeight: isNoRecord ? 400 : 600 }}>
                          {row.siteName}
                        </td>

                        <td style={{ ...styles.td, textAlign: 'center', color: isNoRecord ? '#94a3b8' : '#334155' }}>
                          {row.worker}
                        </td>

                        <td style={{ ...styles.td, textAlign: 'center', fontFamily: 'monospace', color: isNoRecord ? '#cbd5e1' : '#0f172a' }}>
                          {row.checkIn}
                        </td>

                        <td
                          style={{
                            ...styles.td,
                            textAlign: 'center',
                            fontFamily: 'monospace',
                            color: row.checkOut === '근무중' ? '#2563eb' : isNoRecord ? '#cbd5e1' : '#334155',
                            fontWeight: row.checkOut === '근무중' ? 700 : 'normal',
                          }}
                        >
                          {row.checkOut === '근무중' ? (
                            <span style={styles.workingText}>근무중</span>
                          ) : (
                            row.checkOut
                          )}
                        </td>

                        <td style={{ ...styles.td, textAlign: 'center' }}>
                          {badgeSpan(row.judgment)}
                        </td>

                        <td style={{ ...styles.td, textAlign: 'center' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                            {badgeSpan(row.access)}
                            {row.access?.label === '원격' && (row.access?.program || row.remoteType) && (
                              <span style={{ fontSize: '10px', color: '#ef4444', marginTop: '2px', fontWeight: 600 }}>
                                {row.access?.program || row.remoteType}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function badgeSpan(item, dashed = false) {
  if (!item) return '-';
  const bgColor = item.bg || `${item.color}22`;
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: '10px',
        fontSize: '11px',
        fontWeight: 600,
        backgroundColor: bgColor,
        color: item.color || '#94a3b8',
        borderBottom: dashed ? '1px dashed currentColor' : 'none',
      }}
    >
      {item.label}
    </span>
  );
}

const styles = {
  container: {
    padding: '24px',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    backgroundColor: '#f8fafc',
    boxSizing: 'border-box',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '16px',
    marginBottom: '16px',
    paddingBottom: '16px',
    borderBottom: '1px solid #e2e8f0',
  },
  controlGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  label: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#64748b',
  },
  dateInput: {
    padding: '7px 12px',
    borderRadius: '6px',
    border: '1px solid #cbd5e1',
    fontSize: '13px',
    backgroundColor: '#fff',
    cursor: 'pointer',
    minWidth: '130px',
    outline: 'none',
  },
  select: {
    padding: '7px 12px',
    borderRadius: '6px',
    border: '1px solid #cbd5e1',
    fontSize: '13px',
    backgroundColor: '#fff',
    cursor: 'pointer',
    minWidth: '180px',
    outline: 'none',
  },
  selectShort: {
    padding: '7px 12px',
    borderRadius: '6px',
    border: '1px solid #cbd5e1',
    fontSize: '13px',
    backgroundColor: '#fff',
    cursor: 'pointer',
    minWidth: '90px',
    outline: 'none',
  },
  statusFilterGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginLeft: 'auto',
  },
  statusTab: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    borderRadius: '20px',
    border: '1px solid #cbd5e1',
    backgroundColor: '#ffffff',
    color: '#475569',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  statusTabActiveAll: {
    backgroundColor: '#0f172a',
    color: '#ffffff',
    borderColor: '#0f172a',
  },
  statusTabActiveWorking: {
    backgroundColor: '#2563eb',
    color: '#ffffff',
    borderColor: '#2563eb',
  },
  statusTabActiveOff: {
    backgroundColor: '#16a34a',
    color: '#ffffff',
    borderColor: '#16a34a',
  },
  statusTabActiveNoRecord: {
    backgroundColor: '#64748b',
    color: '#ffffff',
    borderColor: '#64748b',
  },
  dotWorking: {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    backgroundColor: '#2563eb',
  },
  dotOff: {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    backgroundColor: '#16a34a',
  },
  dotNoRecord: {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    backgroundColor: '#94a3b8',
  },
  requireSiteBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '14px 18px',
    backgroundColor: '#eff6ff',
    border: '1px solid #bfdbfe',
    borderRadius: '8px',
    marginBottom: '16px',
  },
  bannerIcon: {
    fontSize: '20px',
  },
  bannerTitle: {
    margin: 0,
    fontSize: '14px',
    fontWeight: 700,
    color: '#1d4ed8',
  },
  bannerText: {
    margin: '2px 0 0 0',
    fontSize: '13px',
    color: '#3b82f6',
  },
  gridContainer: {
    flex: 1,
    overflow: 'auto',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
    backgroundColor: '#ffffff',
    position: 'relative',
  },
  tableWrapper: {
    minWidth: '100%',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px',
    tableLayout: 'fixed',
  },
  thead: {
    position: 'sticky',
    top: 0,
    zIndex: 1,
  },
  headerRow: {
    backgroundColor: '#0f172a',
  },
  th: {
    padding: '10px 12px',
    textAlign: 'center',
    fontWeight: 600,
    color: '#ffffff',
    backgroundColor: '#0f172a',
    borderBottom: '2px solid #1e293b',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  thNo: { width: '4%', minWidth: '40px' },
  thDate: { width: '10%', minWidth: '90px' },
  thSite: { width: '22%', minWidth: '110px' },
  thWorker: { width: '10%', minWidth: '70px' },
  thCheckIn: { width: '10%', minWidth: '70px' },
  thCheckOut: { width: '10%', minWidth: '70px' },
  thStatus: { width: '9%', minWidth: '70px' },
  thAccess: { width: '9%', minWidth: '70px' },
  tr: {
    borderBottom: '1px solid #e2e8f0',
    cursor: 'pointer',
    transition: 'background-color 0.15s ease',
  },
  trNoRecord: {
    backgroundColor: '#fafafa',
  },
  trSelected: {
    borderBottom: '1px solid #e2e8f0',
    cursor: 'pointer',
    backgroundColor: '#dbeafe',
  },
  td: {
    padding: '10px 12px',
    color: '#334155',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  workingText: {
    padding: '2px 6px',
    borderRadius: '4px',
    backgroundColor: '#dbeafe',
    color: '#2563eb',
    fontWeight: 700,
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
    borderTop: '3px solid #2563eb',
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
    margin: '16px',
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

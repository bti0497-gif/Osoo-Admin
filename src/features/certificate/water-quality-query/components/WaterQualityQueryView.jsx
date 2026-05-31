import React, { useEffect } from 'react';
import { useWaterQualityQuery } from '../viewmodels/useWaterQualityQuery';

/**
 * 수질데이터 조회 화면
 */
export default function WaterQualityQueryView() {
  const {
    data,
    sites,
    loading,
    error,
    selectedYear,
    selectedMonth,
    selectedSite,
    setSelectedYear,
    setSelectedMonth,
    setSelectedSite,
    fetchSites,
    fetchData,
  } = useWaterQualityQuery();

  // 초기 로드
  useEffect(() => {
    fetchSites();
  }, [fetchSites]);

  // 월 선택을 위한 옵션
  const months = Array.from({ length: 12 }, (_, i) => i + 1);

  // 그리드 컬럼 정의 (간소화된 스키마)
  const columns = [
    { key: 'no', label: '번호', width: '60px' },
    { key: 'report_date', label: '채수날짜', width: '120px' },
    { key: 'site_name', label: '현장명', width: '200px' },
    { key: 'items', label: '측정항목', width: '200px' },
    { key: 'results', label: '측정결과', width: '200px' },
    { key: 'uploaded_at', label: '업로드시간', width: '150px' },
  ];

  const styles = {
    container: {
      padding: '20px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    },
    header: {
      marginBottom: '20px',
    },
    title: {
      fontSize: '24px',
      fontWeight: 600,
      color: '#1e293b',
      marginBottom: '16px',
    },
    filters: {
      display: 'flex',
      gap: '16px',
      alignItems: 'center',
      marginBottom: '20px',
      padding: '16px',
      backgroundColor: '#f8fafc',
      borderRadius: '8px',
    },
    filterGroup: {
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
    },
    label: {
      fontSize: '12px',
      color: '#64748b',
      fontWeight: 500,
    },
    select: {
      padding: '8px 12px',
      border: '1px solid #e2e8f0',
      borderRadius: '6px',
      fontSize: '14px',
      backgroundColor: '#fff',
      minWidth: '150px',
    },
    input: {
      padding: '8px 12px',
      border: '1px solid #e2e8f0',
      borderRadius: '6px',
      fontSize: '14px',
      backgroundColor: '#fff',
      minWidth: '100px',
    },
    button: {
      padding: '10px 20px',
      backgroundColor: '#3b82f6',
      color: '#fff',
      border: 'none',
      borderRadius: '6px',
      fontSize: '14px',
      fontWeight: 500,
      cursor: 'pointer',
      marginTop: '16px',
    },
    gridContainer: {
      overflowX: 'auto',
      border: '1px solid #e2e8f0',
      borderRadius: '8px',
    },
    table: {
      width: '100%',
      borderCollapse: 'collapse',
      fontSize: '13px',
    },
    th: {
      padding: '12px 8px',
      backgroundColor: '#f1f5f9',
      color: '#475569',
      fontWeight: 600,
      textAlign: 'left',
      borderBottom: '1px solid #e2e8f0',
      whiteSpace: 'nowrap',
    },
    td: {
      padding: '10px 8px',
      borderBottom: '1px solid #e2e8f0',
      color: '#334155',
      whiteSpace: 'nowrap',
    },
    trHover: {
      backgroundColor: '#f8fafc',
    },
    empty: {
      padding: '40px',
      textAlign: 'center',
      color: '#64748b',
    },
    loading: {
      padding: '40px',
      textAlign: 'center',
      color: '#3b82f6',
    },
    error: {
      padding: '40px',
      textAlign: 'center',
      color: '#ef4444',
    },
    count: {
      marginBottom: '12px',
      color: '#64748b',
      fontSize: '14px',
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>수질데이터 조회</h1>
      </div>

      <div style={styles.filters}>
        <div style={styles.filterGroup}>
          <label style={styles.label}>년도</label>
          <input
            type="number"
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            style={styles.input}
            min="2000"
            max="2100"
          />
        </div>

        <div style={styles.filterGroup}>
          <label style={styles.label}>월</label>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
            style={styles.select}
          >
            {months.map((m) => (
              <option key={m} value={m}>
                {m}월
              </option>
            ))}
          </select>
        </div>

        <div style={styles.filterGroup}>
          <label style={styles.label}>현장</label>
          <select
            value={selectedSite}
            onChange={(e) => setSelectedSite(e.target.value)}
            style={{ ...styles.select, minWidth: '200px' }}
          >
            <option value="all">전체 현장</option>
            {sites.map((site) => (
              <option key={site} value={site}>
                {site}
              </option>
            ))}
          </select>
        </div>

        <button style={styles.button} onClick={fetchData} disabled={loading}>
          {loading ? '조회 중...' : '조회'}
        </button>
      </div>

      {error && <div style={styles.error}>에러: {error}</div>}

      {!error && (
        <>
          <div style={styles.count}>
            총 {data.length}건
          </div>

          <div style={styles.gridContainer}>
            <table style={styles.table}>
              <thead>
                <tr>
                  {columns.map((col) => (
                    <th key={col.key} style={{ ...styles.th, width: col.width }}>
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length} style={styles.empty}>
                      {loading ? '로딩 중...' : '데이터가 없습니다.'}
                    </td>
                  </tr>
                ) : (
                  data.map((row, index) => (
                    <tr
                      key={index}
                      style={index % 2 === 1 ? styles.trHover : undefined}
                    >
                      {columns.map((col) => {
                        let value = row[col.key];
                        // 번호는 인덱스로 표시
                        if (col.key === 'no') {
                          value = index + 1;
                        }
                        // 채수날짜: 날짜만 표시
                        else if (col.key === 'report_date' && value) {
                          try {
                            const date = new Date(value);
                            value = date.toLocaleDateString('ko-KR', {
                              year: 'numeric',
                              month: '2-digit',
                              day: '2-digit',
                            });
                          } catch {
                            value = row[col.key];
                          }
                        }
                        // 업로드시간: 날짜+시간 표시
                        else if (col.key === 'uploaded_at' && value) {
                          try {
                            const date = new Date(value);
                            value = date.toLocaleString('ko-KR', {
                              year: 'numeric',
                              month: '2-digit',
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            });
                          } catch {
                            value = row[col.key];
                          }
                        }
                        return (
                          <td key={col.key} style={styles.td}>
                            {value ?? '-'}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

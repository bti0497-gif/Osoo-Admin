import React, { useEffect } from 'react';
import {
  Search,
  Calendar,
  Building2,
  RefreshCw,
  FileSpreadsheet,
  TestTube2,
  Activity,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { useWaterQualityQuery } from '../viewmodels/useWaterQualityQuery';

/**
 * 수질데이타조회 화면 컴포넌트
 *
 * 1단 헤더: 키트 항목 (암모니아성질소, 질산성질소, 인산염인, 알칼리도)
 * 2단 헤더: 측정장소 (유량조정조 ➔ 무산소조 ➔ 포기조 ➔ 침전조 ➔ 방류조)
 * 물의 흐름에 따른 수질 변화 추이를 가로 한 행(Row)에 시각화
 */
export default function WaterQualityQueryView() {
  const {
    pivotedRows,
    locationsList,
    itemsList,
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

  // 초기 현장 목록 로드
  useEffect(() => {
    fetchSites();
  }, [fetchSites]);

  // 현장이 선택되면 데이터 조회
  useEffect(() => {
    if (selectedSite) {
      fetchData(selectedSite);
    }
  }, [selectedSite, selectedYear, selectedMonth, fetchData]);

  // 연도 옵션
  const currentYear = new Date().getFullYear();
  const years = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];
  const months = Array.from({ length: 12 }, (_, i) => i + 1);

  // CSV 내보내기
  const handleExportCSV = () => {
    if (pivotedRows.length === 0 || !selectedSite) return;

    let csvContent = '\uFEFF'; // UTF-8 BOM
    // 헤더 1열
    const headerRow1 = ['순번', '측정날짜'];
    itemsList.forEach((item) => {
      headerRow1.push(`"${item.label}"`);
      for (let i = 1; i < locationsList.length; i++) {
        headerRow1.push('');
      }
    });
    csvContent += headerRow1.join(',') + '\n';

    // 헤더 2열
    const headerRow2 = ['', ''];
    itemsList.forEach(() => {
      locationsList.forEach((loc) => {
        headerRow2.push(`"${loc}"`);
      });
    });
    csvContent += headerRow2.join(',') + '\n';

    // 데이터 행
    pivotedRows.forEach((r, idx) => {
      const rowVals = [idx + 1, r.date];
      itemsList.forEach((item) => {
        locationsList.forEach((loc) => {
          const val = r.measurements?.[loc]?.[item.key];
          rowVals.push(val !== undefined && val !== null ? val : '');
        });
      });
      csvContent += rowVals.join(',') + '\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedSite}_${selectedYear}년${String(selectedMonth).padStart(2, '0')}월_수질분석.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div style={styles.container}>
      {/* 1. 상단 타이틀 */}
      <div style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={styles.iconBadge}>
            <TestTube2 size={24} color="#2563eb" />
          </div>
          <div>
            <h1 style={styles.title}>
              수질데이타조회 <span style={{ fontSize: '15px', color: '#2563eb', fontWeight: 600 }}>({selectedSite || '현장 선택'})</span>
            </h1>
            <p style={styles.subtitle}>
              키트별(암모니아성질소, 질산성질소, 인산염인, 알칼리도)로 처리공정(유량조정조 ➔ 무산소조 ➔ 포기조 ➔ 침전조 ➔ 방류조)을 지나며 수질이 변화하는 추이를 한눈에 확인합니다.
            </p>
          </div>
        </div>
      </div>

      {/* 2. 필터 툴바 (연도, 월, 현장 필수 선택) */}
      <div style={styles.toolbar}>
        <div style={styles.filterGroup}>
          {/* 현장 선택 (필수) */}
          <div style={styles.filterItem}>
            <label style={styles.label}><Building2 size={14} /> 현장 선택 <span style={{ color: '#ef4444' }}>*</span></label>
            <select
              style={{ ...styles.select, fontWeight: 700, borderColor: selectedSite ? '#2563eb' : '#f87171' }}
              value={selectedSite}
              onChange={(e) => setSelectedSite(e.target.value)}
            >
              <option value="">-- 현장을 선택하세요 --</option>
              {sites.map((s) => (
                <option key={s.id} value={s.site_name}>
                  {s.site_name}
                </option>
              ))}
            </select>
          </div>

          {/* 연도 선택 */}
          <div style={styles.filterItem}>
            <label style={styles.label}><Calendar size={14} /> 연도 <span style={{ color: '#ef4444' }}>*</span></label>
            <select
              style={styles.selectShort}
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
            >
              {years.map((y) => (
                <option key={y} value={y}>{y}년</option>
              ))}
            </select>
          </div>

          {/* 월 선택 */}
          <div style={styles.filterItem}>
            <label style={styles.label}><Calendar size={14} /> 월 <span style={{ color: '#ef4444' }}>*</span></label>
            <select
              style={styles.selectShort}
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(parseInt(e.target.value, 10))}
            >
              {months.map((m) => (
                <option key={m} value={m}>{m}월</option>
              ))}
            </select>
          </div>

          <button
            style={styles.btnPrimary}
            onClick={() => fetchData()}
            disabled={loading || !selectedSite}
          >
            <Search size={15} />
            {loading ? '조회 중...' : '조회'}
          </button>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button style={styles.btnSecondary} onClick={() => fetchData()} disabled={loading || !selectedSite}>
            <RefreshCw size={15} className={loading ? 'spin' : ''} />
            새로고침
          </button>
          <button style={styles.btnExcel} onClick={handleExportCSV} disabled={pivotedRows.length === 0 || !selectedSite}>
            <FileSpreadsheet size={15} />
            CSV 추출
          </button>
        </div>
      </div>

      {/* 3. 처리공정 흐름 안내 바 */}
      <div style={styles.flowBanner}>
        <span style={{ fontWeight: 700, color: '#1e293b', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Activity size={15} color="#2563eb" /> 처리공정 흐름 (Process Flow):
        </span>
        <div style={styles.flowList}>
          {locationsList.map((loc, idx) => (
            <React.Fragment key={loc}>
              <span style={styles.flowBadge}>{loc}</span>
              {idx < locationsList.length - 1 && <ArrowRight size={12} color="#94a3b8" />}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* 4. 에러 및 안내 메시지 */}
      {!selectedSite && (
        <div style={styles.warningBox}>
          <span>💡 상단 드롭다운 메뉴에서 <strong>[현장명]</strong>, <strong>[연도]</strong>, <strong>[월]</strong>을 선택하신 후 [조회]를 누르시면 일일 수질 분석 데이터가 렌더링됩니다.</span>
        </div>
      )}

      {error && (
        <div style={styles.errorBox}>
          <span>⚠️ {error}</span>
        </div>
      )}

      {/* 5. 1단: 키트명 / 2단: 측정장소 피벗 데이터 그리드 */}
      <div style={styles.gridContainer}>
        {loading ? (
          <div style={styles.centerLoading}>
            <div className="spinner" />
            <p style={{ marginTop: '12px', color: '#64748b' }}>[{selectedSite}] {selectedYear}년 {selectedMonth}월 일일 수질 데이터를 불러오는 중입니다...</p>
          </div>
        ) : !selectedSite ? (
          <div style={styles.centerEmpty}>
            <Building2 size={42} color="#cbd5e1" />
            <p style={{ marginTop: '12px', fontWeight: 600, color: '#475569' }}>조회할 현장을 먼저 선택해 주세요.</p>
          </div>
        ) : pivotedRows.length === 0 ? (
          <div style={styles.centerEmpty}>
            <Layers size={42} color="#cbd5e1" />
            <p style={{ marginTop: '12px', fontWeight: 600, color: '#475569' }}>[{selectedSite}] {selectedYear}년 {selectedMonth}월 수질 데이터가 없습니다.</p>
            <span style={{ fontSize: '13px', color: '#94a3b8' }}>해당 월에 입력되거나 동기화된 키트 측정 결과가 존재하는지 확인해 주세요.</span>
          </div>
        ) : (
          <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '100%' }}>
            <table style={styles.table}>
              <thead>
                {/* 1단 헤더: 키트 항목 대분류 (암모니아성질소, 질산성질소, 인산염인, 알칼리도) */}
                <tr style={styles.headerRow1}>
                  <th style={{ ...styles.thFixed, width: '50px' }} rowSpan={2}>순번</th>
                  <th style={{ ...styles.thFixed, width: '110px' }} rowSpan={2}>측정날짜</th>

                  {itemsList.map((item) => (
                    <th key={item.key} style={styles.thItemGroup} colSpan={locationsList.length}>
                      <span style={{ ...styles.itemGroupTitle, color: item.color }}>{item.label}</span>
                    </th>
                  ))}
                </tr>

                {/* 2단 헤더: 각 키트 하위 측정 장소 (유량조정조 ➔ 무산소조 ➔ 포기조 ➔ 침전조 ➔ 방류조) */}
                <tr style={styles.headerRow2}>
                  {itemsList.map((item) => (
                    <React.Fragment key={`${item.key}_locs`}>
                      {locationsList.map((loc) => (
                        <th key={`${item.key}_${loc}`} style={styles.thLocation}>
                          {loc}
                        </th>
                      ))}
                    </React.Fragment>
                  ))}
                </tr>
              </thead>

              <tbody>
                {pivotedRows.map((r, idx) => (
                  <tr key={`${r.date}_${idx}`} style={idx % 2 === 1 ? styles.rowEven : styles.rowOdd}>
                    <td style={styles.tdCenter}>{idx + 1}</td>
                    <td style={styles.tdDate}>{r.date}</td>

                    {/* 키트 항목 ➔ 장소 순서로 값 매핑 */}
                    {itemsList.map((item) => (
                      <React.Fragment key={`${r.date}_${item.key}`}>
                        {locationsList.map((loc) => {
                          const val = r.measurements?.[loc]?.[item.key];
                          return (
                            <td key={`${r.date}_${item.key}_${loc}`} style={styles.tdValue}>
                              {renderValueBadge(val, item.color, item.bg)}
                            </td>
                          );
                        })}
                      </React.Fragment>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function renderValueBadge(val, color, bg) {
  if (val === undefined || val === null || isNaN(val)) {
    return <span style={{ color: '#cbd5e1' }}>-</span>;
  }
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 7px',
      borderRadius: '4px',
      fontSize: '12px',
      fontWeight: 700,
      color: color,
      backgroundColor: bg,
    }}>
      {val}
    </span>
  );
}

const styles = {
  container: {
    padding: '20px',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#f8fafc',
    boxSizing: 'border-box',
    overflow: 'hidden',
  },
  header: {
    marginBottom: '14px',
  },
  iconBadge: {
    width: '42px',
    height: '42px',
    borderRadius: '10px',
    backgroundColor: '#eff6ff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid #bfdbfe',
  },
  title: {
    fontSize: '20px',
    fontWeight: 700,
    color: '#0f172a',
    margin: 0,
  },
  subtitle: {
    fontSize: '13px',
    color: '#64748b',
    margin: '2px 0 0 0',
  },
  toolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: '12px 16px',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
    marginBottom: '10px',
  },
  filterGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  filterItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  label: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#475569',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  select: {
    padding: '6px 12px',
    borderRadius: '6px',
    border: '1px solid #cbd5e1',
    fontSize: '13px',
    backgroundColor: '#ffffff',
    color: '#0f172a',
    minWidth: '180px',
    outline: 'none',
  },
  selectShort: {
    padding: '6px 12px',
    borderRadius: '6px',
    border: '1px solid #cbd5e1',
    fontSize: '13px',
    backgroundColor: '#ffffff',
    color: '#0f172a',
    minWidth: '90px',
    outline: 'none',
  },
  btnPrimary: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 18px',
    backgroundColor: '#2563eb',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: '18px',
  },
  btnSecondary: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 14px',
    backgroundColor: '#ffffff',
    color: '#475569',
    border: '1px solid #cbd5e1',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  btnExcel: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 14px',
    backgroundColor: '#059669',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  flowBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    backgroundColor: '#ffffff',
    padding: '8px 16px',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
    marginBottom: '12px',
  },
  flowList: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  flowBadge: {
    padding: '3px 10px',
    borderRadius: '12px',
    backgroundColor: '#f1f5f9',
    color: '#334155',
    fontSize: '12px',
    fontWeight: 600,
    border: '1px solid #cbd5e1',
  },
  warningBox: {
    padding: '10px 14px',
    backgroundColor: '#eff6ff',
    border: '1px solid #bfdbfe',
    borderRadius: '6px',
    color: '#1d4ed8',
    fontSize: '13px',
    marginBottom: '12px',
  },
  errorBox: {
    padding: '10px 14px',
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '6px',
    color: '#dc2626',
    fontSize: '13px',
    marginBottom: '12px',
  },
  gridContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px',
    textAlign: 'center',
  },
  headerRow1: {
    backgroundColor: '#0f172a',
    color: '#ffffff',
  },
  headerRow2: {
    backgroundColor: '#1e293b',
    color: '#cbd5e1',
  },
  thFixed: {
    padding: '10px 8px',
    fontWeight: 600,
    borderRight: '1px solid #334155',
    borderBottom: '1px solid #334155',
    verticalAlign: 'middle',
    color: '#ffffff',
    backgroundColor: '#0f172a',
  },
  thItemGroup: {
    padding: '8px',
    borderRight: '2px solid #475569',
    borderBottom: '1px solid #334155',
    backgroundColor: '#0f172a',
  },
  itemGroupTitle: {
    fontSize: '13px',
    fontWeight: 700,
  },
  thLocation: {
    padding: '6px 8px',
    fontWeight: 600,
    fontSize: '12px',
    borderRight: '1px solid #334155',
    borderBottom: '1px solid #334155',
    color: '#e2e8f0',
    backgroundColor: '#1e293b',
    minWidth: '70px',
  },
  rowOdd: {
    backgroundColor: '#ffffff',
  },
  rowEven: {
    backgroundColor: '#f8fafc',
  },
  tdCenter: {
    padding: '8px',
    borderBottom: '1px solid #e2e8f0',
    borderRight: '1px solid #e2e8f0',
    color: '#64748b',
  },
  tdDate: {
    padding: '8px',
    borderBottom: '1px solid #e2e8f0',
    borderRight: '1px solid #e2e8f0',
    fontWeight: 600,
    color: '#334155',
  },
  tdValue: {
    padding: '6px 4px',
    borderBottom: '1px solid #e2e8f0',
    borderRight: '1px solid #e2e8f0',
  },
  centerLoading: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '250px',
  },
  centerEmpty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '250px',
  },
};

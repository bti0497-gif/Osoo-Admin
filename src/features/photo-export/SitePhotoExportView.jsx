import React, { useMemo } from 'react';
import { useSiteMaster } from '../certificate/hooks/useSiteMaster';
import { useSitePhotoExport } from './useSitePhotoExport';

// ============================================
// Styles (Clean & Spacious 4-Column Design)
// ============================================
const containerStyle = {
  display: 'flex',
  height: 'calc(100vh - 75px)',
  width: '100%',
  gap: '16px',
  padding: '16px',
  backgroundColor: '#f8fafc',
  boxSizing: 'border-box',
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  overflow: 'hidden',
};

const leftPanelStyle = {
  width: '340px',
  minWidth: '340px',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  backgroundColor: '#ffffff',
  borderRadius: '16px',
  border: '1px solid #e2e8f0',
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.03)',
  padding: '16px',
  boxSizing: 'border-box',
  overflow: 'hidden',
};

const rightPanelStyle = {
  flex: 1,
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  backgroundColor: '#ffffff',
  borderRadius: '16px',
  border: '1px solid #e2e8f0',
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.03)',
  padding: '20px',
  boxSizing: 'border-box',
  overflow: 'hidden',
};

const sectionHeaderStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: '14px',
  paddingBottom: '12px',
  borderBottom: '1px solid #f1f5f9',
};

const titleGroupStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
};

const iconBadgeStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '32px',
  height: '32px',
  borderRadius: '8px',
  backgroundColor: '#eff6ff',
  color: '#2563eb',
};

const inputStyle = {
  width: '100%',
  height: '38px',
  padding: '0 12px',
  borderRadius: '8px',
  border: '1px solid #cbd5e1',
  fontSize: '13px',
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'all 0.2s ease',
};

const selectStyle = {
  height: '36px',
  borderRadius: '8px',
  border: '1px solid #cbd5e1',
  padding: '0 8px',
  fontSize: '13px',
  fontWeight: '600',
  color: '#1e293b',
  backgroundColor: '#ffffff',
  outline: 'none',
  cursor: 'pointer',
};

const siteItemStyle = (isSelected) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '10px 12px',
  borderRadius: '8px',
  marginBottom: '4px',
  cursor: 'pointer',
  fontSize: '13px',
  fontWeight: isSelected ? '700' : '500',
  backgroundColor: isSelected ? '#eff6ff' : 'transparent',
  color: isSelected ? '#1d4ed8' : '#334155',
  border: isSelected ? '1px solid #bfdbfe' : '1px solid transparent',
  transition: 'all 0.15s ease',
});

const summaryCardStyle = {
  backgroundColor: '#f8fafc',
  borderRadius: '12px',
  border: '1px solid #e2e8f0',
  padding: '16px',
  marginBottom: '12px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '13px',
};

const thStyle = {
  backgroundColor: '#f1f5f9',
  color: '#475569',
  fontWeight: '600',
  textAlign: 'left',
  padding: '12px 16px',
  borderBottom: '2px solid #e2e8f0',
};

const tdStyle = {
  padding: '14px 16px',
  borderBottom: '1px solid #f1f5f9',
  color: '#334155',
};

const downloadBtnStyle = {
  width: '100%',
  height: '52px',
  backgroundColor: '#94a3b8',
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: '700',
  borderRadius: '12px',
  border: 'none',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '10px',
  transition: 'all 0.2s ease',
};

export function SitePhotoExportView({ currentUser }) {
  const { siteMaster } = useSiteMaster();
  const vm = useSitePhotoExport(siteMaster, currentUser);

  // 연도 옵션
  const yearOptions = useMemo(() => {
    const currentY = new Date().getFullYear();
    return [currentY, currentY - 1, currentY - 2];
  }, []);

  // 월 옵션 (1월~12월)
  const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1);

  // 현장 검색어 필터링 및 한국어 사전순 정렬
  const filteredSites = useMemo(() => {
    if (!Array.isArray(siteMaster)) return [];
    const list = [...siteMaster].sort((a, b) =>
      String(a.site_name || '').localeCompare(String(b.site_name || ''), 'ko')
    );
    if (!vm.searchTerm.trim()) return list;
    const term = vm.searchTerm.toLowerCase();
    return list.filter((s) => String(s.site_name || '').toLowerCase().includes(term));
  }, [siteMaster, vm.searchTerm]);

  const categoriesConfig = [
    {
      key: 'testPhotos',
      icon: '🧪',
      name: '실험분석사진 (1회분)',
      summaryData: vm.activeSummary?.testPhotos,
    },
    {
      key: 'sludgePhotos',
      icon: '🚚',
      name: '슬러지 반출 사진',
      summaryData: vm.activeSummary?.sludgePhotos,
    },
    {
      key: 'cleaningCertificates',
      icon: '📜',
      name: '청소 필증 사진',
      summaryData: vm.activeSummary?.cleaningCertificates,
    },
    {
      key: 'medicineInPhotos',
      icon: '💊',
      name: '약품 입고 사진',
      summaryData: vm.activeSummary?.medicineInPhotos,
    },
    {
      key: 'kitInPhotos',
      icon: '🧪',
      name: '키트 입고 사진',
      summaryData: vm.activeSummary?.kitInPhotos,
    },
  ];

  const selectedCount = vm.selectedSiteIds.size;
  const activeSiteName = vm.lastActiveSite?.site_name;

  return (
    <div style={containerStyle}>
      {/* =================================================== */}
      {/* 1열: 좌측 패널 (연월 데이트피커 + 다중 현장 선택 리스트뷰) */}
      {/* =================================================== */}
      <div style={leftPanelStyle}>
        <div style={sectionHeaderStyle}>
          <div style={titleGroupStyle}>
            <div style={iconBadgeStyle}>
              <span className="material-icons" style={{ fontSize: '20px' }}>checklist</span>
            </div>
            <div>
              <strong style={{ fontSize: '15px', color: '#0f172a' }}>현장 선택 (다중)</strong>
              <div style={{ fontSize: '11px', color: '#64748b' }}>
                선택됨: <b style={{ color: '#2563eb' }}>{selectedCount}개</b> / 총 {filteredSites.length}개
              </div>
            </div>
          </div>
        </div>

        {/* 연/월 데이트피커 셀렉터 */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
          <select
            value={vm.selectedYear}
            onChange={(e) => vm.setSelectedYear(Number(e.target.value))}
            style={{ ...selectStyle, flex: 1 }}
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>{y}년</option>
            ))}
          </select>
          <select
            value={vm.selectedMonth}
            onChange={(e) => vm.setSelectedMonth(Number(e.target.value))}
            style={{ ...selectStyle, flex: 1 }}
          >
            {monthOptions.map((m) => (
              <option key={m} value={m}>{m}월</option>
            ))}
          </select>
        </div>

        {/* 실시간 검색 박스 */}
        <div style={{ marginBottom: '8px' }}>
          <input
            type="text"
            placeholder="🔍 현장명 검색..."
            value={vm.searchTerm}
            onChange={(e) => vm.setSearchTerm(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', padding: '0 2px' }}>
          <button
            onClick={() => vm.selectAllSites(filteredSites)}
            style={{
              fontSize: '11px',
              color: '#2563eb',
              backgroundColor: '#eff6ff',
              border: '1px solid #bfdbfe',
              borderRadius: '6px',
              padding: '3px 8px',
              fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            ✓ 전체 선택 ({filteredSites.length})
          </button>
          <button
            onClick={vm.deselectAllSites}
            style={{
              fontSize: '11px',
              color: '#64748b',
              backgroundColor: '#f1f5f9',
              border: '1px solid #cbd5e1',
              borderRadius: '6px',
              padding: '3px 8px',
              fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            ✕ 전체 해제
          </button>
        </div>

        {/* 현장 리스트뷰 */}
        <div style={{ flex: 1, overflowY: 'auto', paddingRight: '2px' }}>
          {filteredSites.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8', fontSize: '13px' }}>
              검색된 현장이 없습니다.
            </div>
          ) : (
            filteredSites.map((site) => {
              const isSelected = vm.selectedSiteIds.has(site.id);
              return (
                <div
                  key={site.id || site.site_name}
                  onClick={() => vm.toggleSiteSelect(site.id)}
                  style={siteItemStyle(isSelected)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      readOnly
                      style={{ cursor: 'pointer', accentColor: '#2563eb' }}
                    />
                    <span>{site.site_name}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* =================================================== */}
      {/* 2열: 우측 패널 (조회중 현장의 Drive 실시간 현황 + 프로그래스바) */}
      {/* =================================================== */}
      <div style={rightPanelStyle}>
        {/* 상단 현장 정보 헤더 카드리프 */}
        <div style={summaryCardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                backgroundColor: selectedCount === 0 ? '#f1f5f9' : '#dbeafe',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: selectedCount === 0 ? '#94a3b8' : '#1d4ed8',
              }}
            >
              <span className="material-icons" style={{ fontSize: '24px' }}>cloud_done</span>
            </div>
            <div>
              <div style={{ fontSize: '17px', fontWeight: '700', color: '#0f172a' }}>
                {selectedCount === 0
                  ? '선택된 현장이 없습니다'
                  : activeSiteName || '현장을 클릭하세요'}
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                {selectedCount === 0
                  ? '좌측 현장 목록에서 조회할 현장을 선택해 주세요.'
                  : selectedCount > 1
                  ? `선택된 ${selectedCount}개 현장 중 '${activeSiteName}' 현장의 Google Drive 사진 보유 현황`
                  : `${vm.selectedYear}년 ${String(vm.selectedMonth).padStart(2, '0')}월 Google Drive 실시간 스캔 현황`}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={vm.refreshSummary}
              disabled={vm.loadingSummary || !activeSiteName}
              style={{
                height: '36px',
                padding: '0 12px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                backgroundColor: '#ffffff',
                color: '#475569',
                fontSize: '13px',
                fontWeight: '600',
                cursor: vm.loadingSummary || !activeSiteName ? 'not-allowed' : 'pointer',
                opacity: vm.loadingSummary || !activeSiteName ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <span className="material-icons" style={{ fontSize: '16px' }}>refresh</span>
              드라이브 조회
            </button>
          </div>
        </div>

        {/* 🌟 드라이브 조회 진행 상태 프로그래스바 (Scanning Progress Bar) */}
        {vm.loadingSummary && (
          <div
            style={{
              backgroundColor: '#eff6ff',
              border: '1px solid #bfdbfe',
              borderRadius: '10px',
              padding: '12px 14px',
              marginBottom: '14px',
              boxShadow: '0 2px 8px rgba(37, 99, 235, 0.08)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '12px', fontWeight: '700', color: '#1d4ed8' }}>
                📡 {vm.scanProgress.stepText || 'Google Drive 실시간 스캔 중...'}
              </span>
              <span style={{ fontSize: '12px', fontWeight: '800', color: '#2563eb' }}>
                {vm.scanProgress.percent}%
              </span>
            </div>

            <div
              style={{
                width: '100%',
                height: '8px',
                backgroundColor: '#dbeafe',
                borderRadius: '4px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${vm.scanProgress.percent}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #2563eb 0%, #0284c7 100%)',
                  borderRadius: '4px',
                  transition: 'width 0.35s ease-out',
                }}
              />
            </div>
          </div>
        )}

        {/* 중단: 깔끔한 4열 구조 분야별 사진 보유 종합 리스트 표 (Table) */}
        <div style={{ flex: 1, overflowY: 'auto', marginBottom: '16px' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: '44px', textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    aria-label="전체 카테고리 선택"
                    checked={Object.values(vm.categories).every(Boolean)}
                    onChange={(e) => vm.toggleAllCategories(e.target.checked)}
                    style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                  />
                </th>
                <th style={thStyle}>사진 카테고리</th>
                <th style={{ ...thStyle, width: '160px', textAlign: 'center' }}>Drive 보유 수량</th>
                <th style={{ ...thStyle, width: '100px', textAlign: 'center' }}>상태</th>
              </tr>
            </thead>
            <tbody>
              {categoriesConfig.map((cat) => {
                const isChecked = Boolean(vm.categories[cat.key]);
                const count = cat.summaryData?.count || 0;
                const hasFile = count > 0;

                return (
                  <tr
                    key={cat.key}
                    style={{
                      backgroundColor: isChecked ? '#ffffff' : '#f8fafc',
                      opacity: isChecked ? 1 : 0.65,
                    }}
                  >
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        aria-label={`${cat.name} 선택`}
                        checked={isChecked}
                        onChange={() => vm.toggleCategory(cat.key)}
                        style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                      />
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: '600', fontSize: '14px' }}>
                        <span style={{ fontSize: '20px' }}>{cat.icon}</span>
                        <span>{cat.name}</span>
                      </div>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center', fontWeight: '700', fontSize: '14px' }}>
                      {vm.loadingSummary ? (
                        <span style={{ color: '#2563eb', fontSize: '12px', fontWeight: '600' }}>
                          ⏳ {vm.scanProgress.percent}% 스캔 중...
                        </span>
                      ) : selectedCount === 0 ? (
                        <span style={{ color: '#cbd5e1' }}>-</span>
                      ) : (
                        <span style={{ color: hasFile ? '#0284c7' : '#94a3b8' }}>
                          {count}장
                        </span>
                      )}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      {vm.loadingSummary ? (
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: '600',
                            padding: '3px 8px',
                            borderRadius: '12px',
                            backgroundColor: '#eff6ff',
                            color: '#2563eb',
                          }}
                        >
                          조회중
                        </span>
                      ) : selectedCount === 0 ? (
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: '600',
                            padding: '3px 8px',
                            borderRadius: '12px',
                            backgroundColor: '#f1f5f9',
                            color: '#cbd5e1',
                          }}
                        >
                          미선택
                        </span>
                      ) : hasFile ? (
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: '700',
                            padding: '3px 8px',
                            borderRadius: '12px',
                            backgroundColor: '#dcfce7',
                            color: '#15803d',
                          }}
                        >
                          보유중
                        </span>
                      ) : (
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: '600',
                            padding: '3px 8px',
                            borderRadius: '12px',
                            backgroundColor: '#f1f5f9',
                            color: '#94a3b8',
                          }}
                        >
                          없음
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* 하단: 바탕화면 일괄 다운로드 버튼 */}
        <div>
          <button
            onClick={vm.executeDownload}
            disabled={vm.isDownloading || selectedCount === 0}
            style={{
              ...downloadBtnStyle,
              backgroundColor: vm.isDownloading
                ? '#3b82f6'
                : selectedCount > 0
                ? '#1d4ed8'
                : '#cbd5e1',
              cursor: vm.isDownloading || selectedCount === 0 ? 'not-allowed' : 'pointer',
              opacity: vm.isDownloading ? 0.85 : 1,
            }}
          >
            {vm.isDownloading ? (
              <>
                <span
                  className="material-icons"
                  style={{
                    fontSize: '20px',
                    animation: 'spin 1s linear infinite',
                  }}
                >
                  sync
                </span>
                <span>
                  {vm.downloadProgress.message || '다운로드 중...'}
                </span>
              </>
            ) : (
              <>
                <span className="material-icons" style={{ fontSize: '20px' }}>
                  download
                </span>
                <span>
                  {selectedCount === 0
                    ? '다운로드할 현장을 선택하세요'
                    : `🖥️ 바탕화면에 일괄 다운로드 (${selectedCount}개 현장)`}
                </span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ============================================================= */}
      {/* 플로팅 토스트: 다운로드 진행 상태 */}
      {/* ============================================================= */}
      {vm.isDownloading && (
        <div
          style={{
            position: 'fixed',
            bottom: '32px',
            right: '32px',
            width: '420px',
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 12px 40px rgba(0,0,0,0.15), 0 4px 12px rgba(0,0,0,0.08)',
            padding: '20px',
            zIndex: 9999,
            animation: 'slideUp 0.3s ease-out',
          }}
        >
          <style>{`
            @keyframes slideUp {
              from { transform: translateY(20px); opacity: 0; }
              to   { transform: translateY(0);    opacity: 1; }
            }
            @keyframes spin {
              from { transform: rotate(0deg); }
              to   { transform: rotate(360deg); }
            }
          `}</style>

          {/* 토스트 헤더 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #2563eb, #0284c7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
              }}
            >
              <span
                className="material-icons"
                style={{ fontSize: '20px', animation: 'spin 1.2s linear infinite' }}
              >
                cloud_download
              </span>
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a' }}>
                바탕화면 일괄 다운로드 중
              </div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>
                Google Drive → 바탕화면 현장별 폴더
              </div>
            </div>
          </div>

          {/* 현장 진행 표시 */}
          <div
            style={{
              backgroundColor: '#f8fafc',
              borderRadius: '10px',
              padding: '12px 14px',
              marginBottom: '12px',
              border: '1px solid #e2e8f0',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#1d4ed8' }}>
                📂 {vm.downloadProgress.siteName || '준비 중...'}
              </span>
              <span style={{ fontSize: '12px', fontWeight: '800', color: '#0f172a' }}>
                {vm.downloadProgress.current} / {vm.downloadProgress.total}
              </span>
            </div>
            <div style={{ fontSize: '11px', color: '#475569', marginBottom: '8px' }}>
              {vm.downloadProgress.message}
            </div>

            {/* 프로그래스바 */}
            <div
              style={{
                width: '100%',
                height: '6px',
                backgroundColor: '#e2e8f0',
                borderRadius: '3px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${vm.downloadProgress.percent || (vm.downloadProgress.total > 0 ? Math.round((vm.downloadProgress.current / vm.downloadProgress.total) * 100) : 0)}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #2563eb 0%, #0284c7 100%)',
                  borderRadius: '3px',
                  transition: 'width 0.3s ease-out',
                }}
              />
            </div>
          </div>

          <div style={{ fontSize: '11px', color: '#94a3b8', textAlign: 'center' }}>
            다운로드가 완료될 때까지 이 화면을 유지해 주세요
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* 완료 토스트: 다운로드 완료 후 자동 사라짐 */}
      {/* ============================================================= */}
      {vm.downloadComplete && (
        <div
          style={{
            position: 'fixed',
            bottom: '32px',
            right: '32px',
            width: '400px',
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            border: '1px solid #dcfce7',
            boxShadow: '0 12px 40px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.06)',
            padding: '18px 22px',
            zIndex: 9999,
            animation: 'slideUp 0.3s ease-out, fadeOut 0.5s 3s ease-out forwards',
          }}
        >
          <style>{`
            @keyframes fadeOut {
              from { opacity: 1; transform: translateY(0); }
              to   { opacity: 0; transform: translateY(10px); }
            }
          `}</style>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
              }}
            >
              <span className="material-icons" style={{ fontSize: '22px' }}>check_circle</span>
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: '700', color: '#166534' }}>
                다운로드가 완료되었습니다
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                {vm.downloadComplete.siteCount}개 현장 · 총 {vm.downloadComplete.totalSaved}개 파일 저장됨
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

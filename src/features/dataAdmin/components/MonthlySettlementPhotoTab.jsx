import React from 'react';

const CATEGORY_DEFS = [
  {
    key: 'testPhoto',
    title: '실험사진 (키트 4종)',
    desc: '첫 등록일 1일치 4개 수질항목 (암모니아성질소, 질산성질소, 인산염인, 알칼리도)',
    badgeColor: '#3b82f6',
  },
  {
    key: 'sludge',
    title: '슬러지사진',
    desc: '해당 월의 슬러지 반출 사진들',
    badgeColor: '#8b5cf6',
  },
  {
    key: 'cleaningCertificate',
    title: '청소필증',
    desc: '슬러지 청소필증 이미지',
    badgeColor: '#ec4899',
  },
  {
    key: 'medicineIn',
    title: '약품입고사진',
    desc: '포도당, 중탄산나트륨, 팩(PAC) 등 약품 입고 사진',
    badgeColor: '#10b981',
  },
  {
    key: 'kitIn',
    title: '키트입고사진',
    desc: '키트 시약 입고 사진',
    badgeColor: '#f59e0b',
  },
];

export default function MonthlySettlementPhotoTab({ vm }) {
  const {
    year,
    setYear,
    month,
    setMonth,
    filteredSites,
    loadingSites,
    searchFilter,
    setSearchFilter,
    selectedSite,
    setSelectedSite,
    photoSummary,
    loadingSummary,
    selectedCategories,
    toggleCategory,
    targetDirectory,
    downloading,
    downloadStatus,
    handleSelectFolder,
    handleExecuteDownload,
    refreshSummary,
  } = vm;

  const currentSiteName = selectedSite?.site_name || selectedSite?.siteName || '';

  // 년도 옵션 (2024~2030)
  const yearOptions = [2024, 2025, 2026, 2027, 2028, 2029, 2030];
  const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '0.75rem' }}>
      {/* 1. 상단 컨트롤 바 (연월 선택 및 새로고침) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.75rem 1.25rem',
          background: '#ffffff',
          borderRadius: 10,
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1e293b' }}>
            📅 대상 연월:
          </span>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            style={{
              padding: '0.4rem 0.75rem',
              borderRadius: 6,
              border: '1px solid #cbd5e1',
              fontWeight: 600,
              fontSize: '0.9rem',
            }}
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}년
              </option>
            ))}
          </select>

          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            style={{
              padding: '0.4rem 0.75rem',
              borderRadius: 6,
              border: '1px solid #cbd5e1',
              fontWeight: 600,
              fontSize: '0.9rem',
            }}
          >
            {monthOptions.map((m) => (
              <option key={m} value={m}>
                {m}월
              </option>
            ))}
          </select>

          <button
            onClick={refreshSummary}
            disabled={loadingSummary || !currentSiteName}
            style={{
              padding: '0.4rem 0.85rem',
              background: '#f1f5f9',
              color: '#334155',
              border: '1px solid #cbd5e1',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: 600,
            }}
          >
            🔄 새로고침
          </button>
        </div>

        <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
          * 구글 드라이브 및 로컬 저장소 사진을 자동 수집합니다.
        </div>
      </div>

      {/* 2. 메인 2열 레이아웃 */}
      <div style={{ display: 'flex', flex: 1, gap: '0.75rem', minHeight: 0 }}>
        {/* 좌측 (1열): 현장 목록 */}
        <div
          style={{
            width: '280px',
            display: 'flex',
            flexDirection: 'column',
            background: '#ffffff',
            borderRadius: 10,
            border: '1px solid #e2e8f0',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '0.85rem 1rem',
              background: '#f8fafc',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e293b' }}>
                🏢 현장 목록
              </span>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                총 {filteredSites.length}개
              </span>
            </div>
            <input
              type="text"
              placeholder="현장명 검색..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              style={{
                width: '100%',
                padding: '0.35rem 0.6rem',
                borderRadius: 6,
                border: '1px solid #cbd5e1',
                fontSize: '0.85rem',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '0.35rem' }}>
            {loadingSites && (
              <div style={{ padding: '1rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
                현장 목록 로딩 중...
              </div>
            )}
            {!loadingSites && filteredSites.length === 0 && (
              <div style={{ padding: '1rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
                검색된 현장이 없습니다.
              </div>
            )}
            {filteredSites.map((site) => {
              const name = site.site_name || site.siteName || '';
              const isSelected = selectedSite && (selectedSite.site_name || selectedSite.siteName) === name;
              return (
                <div
                  key={site.site_id || site.id || name}
                  onClick={() => setSelectedSite(site)}
                  style={{
                    padding: '0.6rem 0.85rem',
                    borderRadius: 6,
                    marginBottom: '0.25rem',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    fontWeight: isSelected ? 700 : 500,
                    background: isSelected ? '#eff6ff' : 'transparent',
                    color: isSelected ? '#2563eb' : '#334155',
                    border: isSelected ? '1px solid #bfdbfe' : '1px solid transparent',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {name}
                </div>
              );
            })}
          </div>
        </div>

        {/* 우측 (2열): 선택 현장 사진 수집 현황 및 다운로드 */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            background: '#ffffff',
            borderRadius: 10,
            border: '1px solid #e2e8f0',
            padding: '1.25rem',
            gap: '1rem',
            overflowY: 'auto',
          }}
        >
          {/* 헤더 영역 */}
          <div
            style={{
              paddingBottom: '0.75rem',
              borderBottom: '2px solid #f1f5f9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <h2 style={{ margin: 0, fontSize: '1.15rem', color: '#0f172a', fontWeight: 700 }}>
                📍 {currentSiteName ? `${currentSiteName} (${year}년 ${month}월 사진 수집)` : '현장을 선택해 주세요'}
              </h2>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                아래에서 다운로드할 카테고리를 선택한 후, 저장할 폴더를 지정하여 내려받으세요.
              </p>
            </div>
            {loadingSummary && (
              <div style={{ fontSize: '0.85rem', color: '#2563eb', fontWeight: 600 }}>
                ⏳ 사진 데이터 수집 중...
              </div>
            )}
          </div>

          {/* 사진 카테고리 5종 카드 리스트 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.75rem' }}>
            {CATEGORY_DEFS.map((cat) => {
              const summaryData = photoSummary ? getCategorySummary(photoSummary, cat.key) : { count: 0, files: [], date: null };
              const isChecked = selectedCategories.includes(cat.key);
              const hasFiles = summaryData.count > 0;

              return (
                <div
                  key={cat.key}
                  onClick={() => toggleCategory(cat.key)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.85rem 1.1rem',
                    borderRadius: 8,
                    border: isChecked ? '1px solid #93c5fd' : '1px solid #e2e8f0',
                    background: isChecked ? '#f8fafc' : '#ffffff',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {}} // parent onClick handles toggle
                      style={{ width: 18, height: 18, cursor: 'pointer' }}
                    />
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e293b' }}>
                          {cat.title}
                        </span>
                        <span
                          style={{
                            fontSize: '0.75rem',
                            padding: '0.15rem 0.5rem',
                            borderRadius: 12,
                            background: hasFiles ? cat.badgeColor : '#94a3b8',
                            color: '#ffffff',
                            fontWeight: 600,
                          }}
                        >
                          {hasFiles ? `${summaryData.count}건` : '없음'}
                        </span>
                        {cat.key === 'testPhoto' && summaryData.date && (
                          <span style={{ fontSize: '0.75rem', color: '#2563eb', fontWeight: 600 }}>
                            (추출일자: {summaryData.date})
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '0.2rem' }}>
                        {cat.desc}
                      </div>
                    </div>
                  </div>

                  {/* 파일명 요약 칩 */}
                  <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', maxWidth: '350px', justifyContent: 'flex-end' }}>
                    {summaryData.files.slice(0, 3).map((f, idx) => (
                      <span
                        key={idx}
                        style={{
                          fontSize: '0.72rem',
                          background: '#e2e8f0',
                          color: '#334155',
                          padding: '0.15rem 0.4rem',
                          borderRadius: 4,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          maxWidth: '120px',
                        }}
                        title={f.name}
                      >
                        {f.name}
                      </span>
                    ))}
                    {summaryData.files.length > 3 && (
                      <span style={{ fontSize: '0.72rem', color: '#64748b', alignSelf: 'center' }}>
                        +{summaryData.files.length - 3}개 더보기
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 하단 저장 폴더 지정 및 일괄 다운로드 실행 영역 */}
          <div
            style={{
              marginTop: 'auto',
              padding: '1.1rem',
              background: '#f8fafc',
              borderRadius: 10,
              border: '1px solid #e2e8f0',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.85rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#334155' }}>
                🖥️ 저장 위치: <span style={{ color: '#2563eb' }}>{targetDirectory || '내 컴퓨터 [바탕화면] (기본)'}</span>
              </div>
              <button
                onClick={handleSelectFolder}
                disabled={downloading}
                style={{
                  padding: '0.35rem 0.75rem',
                  background: '#ffffff',
                  color: '#475569',
                  border: '1px solid #cbd5e1',
                  borderRadius: 6,
                  fontWeight: 600,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                }}
              >
                📁 저장 위치 변경 {targetDirectory ? '(선택됨)' : ''}
              </button>
            </div>

            {/* 메인 바탕화면 일괄 다운로드 버튼 */}
            <button
              onClick={handleExecuteDownload}
              disabled={downloading || !currentSiteName}
              style={{
                width: '100%',
                padding: '0.85rem',
                background: downloading || !currentSiteName ? '#94a3b8' : '#16a34a',
                color: '#ffffff',
                border: 'none',
                borderRadius: 8,
                fontWeight: 700,
                fontSize: '1rem',
                cursor: downloading || !currentSiteName ? 'not-allowed' : 'pointer',
                boxShadow: downloading ? 'none' : '0 2px 4px rgba(0,0,0,0.1)',
                transition: 'all 0.2s ease',
              }}
            >
              {downloading ? '⏳ 바탕화면으로 사진 수집 및 저장 중...' : '📥 바탕화면에 사진 일괄 다운로드'}
            </button>

            {/* 결과 알림 상태 메세지 */}
            {downloadStatus && (
              <div
                style={{
                  padding: '0.75rem',
                  borderRadius: 6,
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  whiteSpace: 'pre-wrap',
                  background:
                    downloadStatus.type === 'success'
                      ? '#dcfce7'
                      : downloadStatus.type === 'error'
                      ? '#fee2e2'
                      : '#e0f2fe',
                  color:
                    downloadStatus.type === 'success'
                      ? '#166534'
                      : downloadStatus.type === 'error'
                      ? '#991b1b'
                      : '#0369a1',
                  border:
                    downloadStatus.type === 'success'
                      ? '1px solid #bbf7d0'
                      : downloadStatus.type === 'error'
                      ? '1px solid #fecaca'
                      : '1px solid #bae6fd',
                }}
              >
                {downloadStatus.message}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function getCategorySummary(photoSummary, catKey) {
  if (!photoSummary) return { count: 0, files: [], date: null };
  switch (catKey) {
    case 'testPhoto':
      return photoSummary.testPhotos || { count: 0, files: [], date: null };
    case 'sludge':
      return photoSummary.sludgePhotos || { count: 0, files: [] };
    case 'cleaningCertificate':
      return photoSummary.cleaningCertificates || { count: 0, files: [] };
    case 'medicineIn':
      return photoSummary.medicineInPhotos || { count: 0, files: [] };
    case 'kitIn':
      return photoSummary.kitInPhotos || { count: 0, files: [] };
    default:
      return { count: 0, files: [] };
  }
}

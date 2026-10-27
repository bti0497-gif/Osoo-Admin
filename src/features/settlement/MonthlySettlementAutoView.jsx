import React, { useRef, useState } from 'react';
import { useMonthlySettlementAuto } from './hooks/useMonthlySettlementAuto';
import { CheongjuStatementUploadModal } from './components/CheongjuStatementUploadModal';
import { HongcheonHwpModal } from './components/HongcheonHwpModal';
import { TemplateManagerTable } from './components/TemplateManagerTable';

export function MonthlySettlementAutoView({ currentUser } = {}) {
  const {
    activeTab, setActiveTab,
    year, setYear,
    month, setMonth,
    selectedSite, setSelectedSite,
    YEARS, MONTHS,
    sites,
    templates,
    summaryData,
    loading,
    error,
    toastMessage,
    uploadingSiteId,
    isGenerating,
    fetchSummary,
    fetchTemplates,
    openTemplate,
    uploadTemplate,
    generateCheongjuReport,
    generateJukamBusanReport,
    generateJukamSeoulReport,
    generateCheonanBusanReport,
    generateHongcheonExcelReport,
    generateHongcheonHwpReport,
    generateCheongsongReport,
    generateGeumwangReport,
    generateMiryangReport,
    checkDataReady,
  } = useMonthlySettlementAuto(currentUser);

  const fileInputRef = useRef(null);
  const [targetUploadSite, setTargetUploadSite] = useState(null); // { siteId, isSub }
  const [dragOverSiteId, setDragOverSiteId] = useState(null);
  const [isCheongjuModalOpen, setIsCheongjuModalOpen] = useState(false);
  const [isHongcheonModalOpen, setIsHongcheonModalOpen] = useState(false);

  const handleOpenFileDialog = (siteId, isSub = false) => {
    setTargetUploadSite({ siteId, isSub });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file && targetUploadSite) {
      uploadTemplate(targetUploadSite.siteId, file, targetUploadSite.isSub);
    }
  };

  const handleDrop = (e, siteId, isSub = false) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverSiteId(null);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      uploadTemplate(siteId, file, isSub);
    }
  };

  const handleDragOver = (e, siteId) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverSiteId(siteId);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverSiteId(null);
  };

  return (
    <div style={{ padding: '24px', fontFamily: 'system-ui, sans-serif', height: '100%', display: 'flex', flexDirection: 'column', gap: '16px', background: '#f8fafc', overflowY: 'auto' }}>
      
      {/* 숨겨진 파일 선택 Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        style={{ display: 'none' }}
        accept=".xlsx,.xls,.xlsm,.hwp,.hwpx"
      />

      {/* 실시간 토스트 알림 */}
      {toastMessage && (
        <div style={{
          position: 'fixed', top: '24px', right: '24px', zIndex: 9999,
          background: '#0f172a', color: '#ffffff', padding: '12px 20px',
          borderRadius: '8px', fontSize: '13px', fontWeight: 600,
          boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)',
          display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          {toastMessage}
        </div>
      )}

      {/* 1. 상단 타이틀 및 탭 전환 바 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', background: '#ffffff', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
            📑 월정산 관리 및 자동 작성
          </h2>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>
            현장별 표준 정산 양식(Excel / HWP)을 등록·교체하고, 수집된 일일점검·수질·슬러지 데이터를 기반으로 정산서를 자동 작성합니다.
          </p>
        </div>

        {/* 탭 버튼 세그먼트 컨트롤 */}
        <div style={{
          display: 'inline-flex',
          background: '#e2e8f0',
          padding: '4px',
          borderRadius: '10px',
          gap: '4px',
          border: '1px solid #cbd5e1',
          boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.06)'
        }}>
          <button
            type="button"
            onClick={() => setActiveTab('template_manager')}
            style={tabButtonStyle(activeTab === 'template_manager')}
          >
            📁 현장별 기본 빈 양식 관리
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('auto_generate')}
            style={tabButtonStyle(activeTab === 'auto_generate')}
          >
            📊 정산서 자동 작성
          </button>
        </div>
      </div>

      {/* 에러 알림 */}
      {error && (
        <div style={{ padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: '8px', fontSize: '13px' }}>
          ⚠️ 오류: {error}
        </div>
      )}

      {/* TAB 1: 현장별 기본 빈 양식 관리 (TemplateManagerTable) */}
      {activeTab === 'template_manager' && (
        <TemplateManagerTable
          templates={templates}
          uploadingSiteId={uploadingSiteId}
          dragOverSiteId={dragOverSiteId}
          onOpenTemplate={openTemplate}
          onOpenFileDialog={handleOpenFileDialog}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onRefresh={fetchTemplates}
        />
      )}

      {/* TAB 2: 정산서 자동 작성 */}
      {activeTab === 'auto_generate' && (
        <>
          {/* 필터 컨트롤 라인 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', background: '#ffffff', padding: '12px 16px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>조회 조건:</span>
              <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={selectStyle}>
                {YEARS.map((y) => <option key={y} value={y}>{y}년</option>)}
              </select>
              <select value={month} onChange={(e) => setMonth(Number(e.target.value))} style={selectStyle}>
                {MONTHS.map((m) => <option key={m} value={m}>{m}월</option>)}
              </select>
              <select value={selectedSite} onChange={(e) => setSelectedSite(e.target.value)} style={{ ...selectStyle, minWidth: '180px' }}>
                <option value="all">전체 대상 현장</option>
                {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <button onClick={() => fetchSummary(year, month, selectedSite)} style={btnStyle('#2563eb')}>
                {loading ? '조회 중...' : '데이터 조회'}
              </button>
            </div>
            <span style={{ fontSize: '12px', color: '#64748b' }}>
              ※ 고정 관리비는 등록된 빈 양식을 유지하며, 수집된 월별 실적 데이터만 자동 주입됩니다.
            </span>
          </div>

          {/* 데이터 취합 현황 요약 카드 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
            <div style={cardStyle}>
              <span style={cardLabel}>일일 점검 기록</span>
              <span style={{ fontSize: '24px', fontWeight: 700, color: '#2563eb' }}>
                {summaryData?.dailyChecksCount ?? 0}
                <span style={{ fontSize: '13px', fontWeight: 500, color: '#64748b', marginLeft: '4px' }}>건</span>
              </span>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>유입/방류/전력/약품 일일점검</span>
            </div>

            <div style={cardStyle}>
              <span style={cardLabel}>QnTech 키트 수질</span>
              <span style={{ fontSize: '24px', fontWeight: 700, color: '#059669' }}>
                {summaryData?.qntechCount ?? 0}
                <span style={{ fontSize: '13px', fontWeight: 500, color: '#64748b', marginLeft: '4px' }}>건</span>
              </span>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>NH3, NO3, PO4, ALK 수치</span>
            </div>

            <div style={cardStyle}>
              <span style={cardLabel}>공인 성적서 수질</span>
              <span style={{ fontSize: '24px', fontWeight: 700, color: '#7c3aed' }}>
                {summaryData?.certCount ?? 0}
                <span style={{ fontSize: '13px', fontWeight: 500, color: '#64748b', marginLeft: '4px' }}>건</span>
              </span>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>BOD, SS, TN, TP, MLSS 등</span>
            </div>

            <div style={cardStyle}>
              <span style={cardLabel}>정산 대상 현장</span>
              <span style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a' }}>
                {summaryData?.targetSites?.length ?? sites.length}
                <span style={{ fontSize: '13px', fontWeight: 500, color: '#64748b', marginLeft: '4px' }}>개소</span>
              </span>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>죽암, 천안, 청주, 홍천, 청송, 금왕, 밀양</span>
            </div>
          </div>

          {/* 현장별 정산 파일 상태 그리드 */}
          <div style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#1e293b' }}>
                🏛️ {year}년 {month}월 현장별 정산 파일 작성 현황
              </h3>
              <span style={{ fontSize: '12px', color: '#2563eb', background: '#eff6ff', padding: '3px 10px', borderRadius: '12px', fontWeight: 600, border: '1px solid #bfdbfe' }}>
                양식 템플릿 연동 완료
              </span>
            </div>

            <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', color: '#475569', fontWeight: 700, borderBottom: '1px solid #cbd5e1' }}>
                    <th style={thStyle}>현장명</th>
                    <th style={thStyle}>서식 포맷</th>
                    <th style={thStyle}>적용 템플릿</th>
                    <th style={thStyle}>포함 내용</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>상태</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>작업</th>
                  </tr>
                </thead>
                <tbody>
                  {sites.map((site, idx) => (
                    <tr key={site.id} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? '#ffffff' : '#fafafa' }}>
                      <td style={{ ...tdStyle, fontWeight: 600, color: '#0f172a' }}>
                        {site.name} <span style={{ fontSize: '11px', color: '#2563eb' }}>({site.shortName})</span>
                      </td>
                      <td style={tdStyle}>
                        <span style={{
                          padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 600,
                          background: site.type === 'hwp_excel' ? '#fee2e2' : '#e0f2fe',
                          color: site.type === 'hwp_excel' ? '#b91c1c' : '#0369a1',
                        }}>
                          {site.format ? site.format.toUpperCase() : 'DOC'}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, color: '#475569', fontSize: '12px', fontFamily: 'monospace' }}>
                        {site.subTemplate ? `${site.template} + ${site.subTemplate}` : site.template}
                      </td>
                      <td style={{ ...tdStyle, color: '#64748b', fontSize: '12px' }}>
                        {site.description}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <span style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0' }}>
                          데이터 바인딩 준비
                        </span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <button
                          disabled={isGenerating}
                          onClick={async () => {
                            if (site.id === 'cheongju_seoul') {
                              setIsCheongjuModalOpen(true);
                              return;
                            }
                            if (site.id === 'hongcheon_yangyang_hwp') {
                              setIsHongcheonModalOpen(true);
                              return;
                            }
                            if (site.id === 'cheongsong') {
                              await generateCheongsongReport({}, year, month);
                              return;
                            }
                            if (site.id === 'geumwang') {
                              await generateGeumwangReport({}, year, month);
                              return;
                            }
                            if (site.id === 'miryang') {
                              await generateMiryangReport({}, year, month);
                              return;
                            }

                            const checkResult = await checkDataReady(site.id, year, month);
                            if (!checkResult?.ready) {
                              alert(`⚠️ [${site.name}] ${year}년 ${month}월 정산에 필요한 데이터가 아직 로컬에 다운로드되지 않았습니다.\n\n먼저 [데이터관리] 메뉴에서 '${site.name}' 사진 데이터를 바탕화면에 다운로드해 주세요.`);
                              return;
                            }

                            if (site.id === 'jukam_seoul') {
                              await generateJukamSeoulReport({ targetYear: year, targetMonth: month });
                            } else if (site.id === 'jukam_busan') {
                              await generateJukamBusanReport({ targetYear: year, targetMonth: month });
                            } else if (site.id === 'cheonan_busan') {
                              await generateCheonanBusanReport({ targetYear: year, targetMonth: month });
                            } else if (site.id === 'hongcheon_yangyang_excel' || site.id === 'hongcheon_yangyang') {
                              await generateHongcheonExcelReport(year, month);
                            } else {
                              alert(`[${site.name}] ${year}년 ${month}월 정산 파일 자동 작성 엔진이 연결되었습니다.`);
                            }
                          }}
                          style={{
                            padding: '5px 12px', background: isGenerating ? '#94a3b8' : '#4f46e5', color: '#ffffff', border: 'none',
                            borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: isGenerating ? 'not-allowed' : 'pointer',
                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                          }}
                        >
                          {isGenerating ? '⏳ 작성 중...' : '📥 정산서 작성'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* 청주휴게소 모달 */}
      <CheongjuStatementUploadModal
        isOpen={isCheongjuModalOpen}
        onClose={() => setIsCheongjuModalOpen(false)}
        year={year}
        month={month}
        isGenerating={isGenerating}
        onGenerate={async (statements) => {
          const success = await generateCheongjuReport(statements, year, month);
          if (success) setIsCheongjuModalOpen(false);
        }}
      />

      {/* 홍천휴게소 모달 */}
      <HongcheonHwpModal
        isOpen={isHongcheonModalOpen}
        onClose={() => setIsHongcheonModalOpen(false)}
        year={year}
        month={month}
        isGenerating={isGenerating}
        onGenerate={async (customInputs) => {
          const success = await generateHongcheonHwpReport(customInputs, year, month);
          if (success) setIsHongcheonModalOpen(false);
        }}
      />

    </div>
  );
}

const tabButtonStyle = (active) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '8px 18px',
  borderRadius: '8px',
  fontSize: '13.5px',
  fontWeight: active ? 700 : 600,
  border: active ? '1px solid #1d4ed8' : '1px solid transparent',
  background: active ? '#2563eb' : 'transparent',
  color: active ? '#ffffff' : '#475569',
  boxShadow: active ? '0 2px 6px rgba(37, 99, 235, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.2)' : 'none',
  cursor: 'pointer',
  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
});

const selectStyle = {
  height: '32px', border: '1px solid #cbd5e1', borderRadius: '6px',
  padding: '0 8px', fontSize: '13px', color: '#1e293b', background: '#fff',
  fontWeight: 600, cursor: 'pointer',
};

const btnStyle = (bg) => ({
  height: '32px', padding: '0 14px', borderRadius: '6px', fontSize: '13px',
  fontWeight: 600, border: 'none', cursor: 'pointer',
  background: bg, color: '#fff', transition: 'background 0.15s',
});

const cardStyle = {
  background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px',
  padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '4px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
};

const cardLabel = { fontSize: '12px', fontWeight: 600, color: '#64748b' };
const thStyle = { padding: '12px 14px', whiteSpace: 'nowrap', border: '1px solid #cbd5e1' };
const tdStyle = { padding: '12px 14px', verticalAlign: 'middle', border: '1px solid #cbd5e1' };

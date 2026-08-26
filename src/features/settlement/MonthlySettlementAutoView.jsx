import React, { useRef, useState } from 'react';
import { useMonthlySettlementAuto } from './hooks/useMonthlySettlementAuto';

export function MonthlySettlementAutoView() {
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
    fetchSummary,
    fetchTemplates,
    downloadTemplate,
    uploadTemplate,
    deleteTemplate,
  } = useMonthlySettlementAuto();

  // 파일 업로드 input 참조 및 상태
  const fileInputRef = useRef(null);
  const [targetUploadSite, setTargetUploadSite] = useState(null); // { siteId, isSub }
  const [dragOverSiteId, setDragOverSiteId] = useState(null);

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
          animation: 'fadeIn 0.2s ease-in-out'
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

        {/* 탭 버튼 */}
        <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '8px', gap: '4px' }}>
          <button
            onClick={() => setActiveTab('template_manager')}
            style={tabButtonStyle(activeTab === 'template_manager')}
          >
            📁 현장별 기본 빈 양식 관리
          </button>
          <button
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

      {/* ========================================================================= */}
      {/* TAB 1: 현장별 기본 빈 양식 관리 (Excel & HWP) - 교체/삭제/다운로드 지원        */}
      {/* ========================================================================= */}
      {activeTab === 'template_manager' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* 안내 배너 */}
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '14px 18px', color: '#1e40af', fontSize: '13px', lineHeight: 1.6 }}>
            💡 <strong>현장별 기본 빈 양식 관리 안내:</strong>
            <br />• 각 현장의 당해년도 기본 관리비(인건비, 기준 표준처리비 등)는 1월에 한 번 정해지면 12월까지 변하지 않는 고정값입니다.
            <br />• 새 양식 파일(엑셀 <code>.xlsx/.xls/.xlsm</code> 또는 한글 <code>.hwp/.hwpx</code>)을 <strong>[🔄 새 파일로 교체]</strong> 버튼 또는 <strong>드래그 앤 드롭</strong>으로 끌어다 넣으면 기존 양식이 안전하게 교체됩니다.
            <br />• 시스템은 등록된 양식의 고정 서식/수식을 완벽히 보존하며, <strong>매월 수집된 동적 데이터(일일점검 수치, 키트/공인 수질, 슬러지 반출량, 증빙)</strong>만 자동 주입합니다.
          </div>

          {/* 템플릿 목록 테이블 */}
          <div style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '14px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#1e293b' }}>
                📁 5대 현장별 기본 빈 양식 등록 목록
              </h3>
              <button
                onClick={fetchTemplates}
                style={{ ...btnStyle('#f1f5f9'), color: '#334155', border: '1px solid #cbd5e1' }}
              >
                🔄 새로고침
              </button>
            </div>

            <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', color: '#475569', fontWeight: 700, borderBottom: '1px solid #cbd5e1' }}>
                    <th style={thStyle}>현장 구분</th>
                    <th style={thStyle}>포맷</th>
                    <th style={thStyle}>현재 등록된 빈 양식 파일</th>
                    <th style={thStyle}>서식 및 시트 구성 설명</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>파일 크기</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>수정일시</th>
                    <th style={{ ...thStyle, textAlign: 'center', minWidth: '220px' }}>양식 관리 작업</th>
                  </tr>
                </thead>
                <tbody>
                  {templates.map((tpl, idx) => {
                    const isUploading = uploadingSiteId === tpl.id;
                    const isDragOver = dragOverSiteId === tpl.id;

                    return (
                      <tr
                        key={tpl.id}
                        onDragOver={(e) => handleDragOver(e, tpl.id)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, tpl.id, false)}
                        style={{
                          borderBottom: '1px solid #f1f5f9',
                          background: isDragOver ? '#e0f2fe' : (idx % 2 === 0 ? '#ffffff' : '#fafafa'),
                          transition: 'background 0.15s ease',
                        }}
                      >
                        {/* 현장명 */}
                        <td style={{ ...tdStyle, fontWeight: 700, color: '#0f172a' }}>
                          <div>{tpl.name}</div>
                          <span style={{ fontSize: '11px', color: '#2563eb', fontWeight: 500 }}>({tpl.shortName})</span>
                        </td>

                        {/* 포맷 태그 */}
                        <td style={tdStyle}>
                          <span style={{
                            padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 600,
                            background: tpl.type === 'hwp_excel' ? '#fee2e2' : '#e0f2fe',
                            color: tpl.type === 'hwp_excel' ? '#b91c1c' : '#0369a1',
                          }}>
                            {tpl.format.toUpperCase()}
                          </span>
                        </td>

                        {/* 현재 등록 파일명 */}
                        <td style={{ ...tdStyle, color: '#334155', fontFamily: 'monospace' }}>
                          {tpl.exists ? (
                            <div>
                              <span
                                onClick={() => downloadTemplate(tpl.template)}
                                style={{ color: '#2563eb', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}
                                title="클릭하여 파일 다운로드"
                              >
                                📄 {tpl.template}
                              </span>
                              {tpl.subTemplate && (
                                <div style={{ marginTop: '4px' }}>
                                  <span
                                    onClick={() => downloadTemplate(tpl.subTemplate)}
                                    style={{ color: '#059669', fontSize: '11px', cursor: 'pointer', textDecoration: 'underline' }}
                                    title="클릭하여 운영일지 엑셀 다운로드"
                                  >
                                    📊 {tpl.subTemplate}
                                  </span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <span style={{ color: '#dc2626', fontWeight: 600 }}>⚠️ 미등록 (파일을 추가하세요)</span>
                          )}
                        </td>

                        {/* 설명 */}
                        <td style={{ ...tdStyle, color: '#64748b', fontSize: '12px' }}>
                          {tpl.description}
                        </td>

                        {/* 파일 크기 */}
                        <td style={{ ...tdStyle, textAlign: 'right', color: '#64748b', fontFamily: 'monospace' }}>
                          {tpl.exists ? `${(tpl.fileSize / 1024).toFixed(1)} KB` : '-'}
                        </td>

                        {/* 최종 수정일시 */}
                        <td style={{ ...tdStyle, textAlign: 'center', color: '#64748b', fontSize: '11px' }}>
                          {tpl.updatedAt ? new Date(tpl.updatedAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                        </td>

                        {/* 작업 버튼들 */}
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          {isUploading ? (
                            <span style={{ fontSize: '12px', color: '#2563eb', fontWeight: 600 }}>
                              ⏳ 파일 교체 업로드 중...
                            </span>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              {tpl.exists && (
                                <button
                                  onClick={() => downloadTemplate(tpl.template)}
                                  style={actionBtnStyle('#0284c7')}
                                  title="현재 등록된 양식 파일을 다운로드합니다"
                                >
                                  ⬇️ 다운로드
                                </button>
                              )}

                              <button
                                onClick={() => handleOpenFileDialog(tpl.id, false)}
                                style={actionBtnStyle('#4f46e5')}
                                title="새 양식 파일(엑셀/한글)을 선택하여 기존 파일을 교체합니다"
                              >
                                🔄 새 파일로 교체
                              </button>

                              {tpl.exists && (
                                <button
                                  onClick={() => deleteTemplate(tpl.id, false)}
                                  style={actionBtnStyle('#dc2626')}
                                  title="현재 양식 파일을 삭제합니다"
                                >
                                  🗑️ 삭제
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: 정산서 자동 작성                                                     */}
      {/* ========================================================================= */}
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
                <option value="all">전체 5대 현장</option>
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
                {summaryData?.targetSites?.length ?? 5}
                <span style={{ fontSize: '13px', fontWeight: 500, color: '#64748b', marginLeft: '4px' }}>개소</span>
              </span>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>죽암(서울/부산), 천안, 청주, 홍천</span>
            </div>
          </div>

          {/* 5대 현장별 정산 파일 상태 그리드 */}
          <div style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#1e293b' }}>
                🏛️ {year}년 {month}월 5대 현장별 정산 파일 작성 현황
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
                          {site.format.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, color: '#475569', fontSize: '12px', fontFamily: 'monospace' }}>{site.template}</td>
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
                          onClick={() => alert(`[${site.name}] ${year}년 ${month}월 정산 엑셀 파일 자동 빌더 엔진이 곧 연결됩니다.`)}
                          style={{
                            padding: '5px 12px', background: '#4f46e5', color: '#ffffff', border: 'none',
                            borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer'
                          }}
                        >
                          📥 정산서 작성
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

    </div>
  );
}

const tabButtonStyle = (active) => ({
  padding: '6px 14px',
  borderRadius: '6px',
  fontSize: '13px',
  fontWeight: active ? 700 : 500,
  border: 'none',
  background: active ? '#ffffff' : 'transparent',
  color: active ? '#0f172a' : '#64748b',
  boxShadow: active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
  cursor: 'pointer',
  transition: 'all 0.15s ease',
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

const actionBtnStyle = (bg) => ({
  padding: '4px 10px', borderRadius: '6px', fontSize: '11px',
  fontWeight: 600, border: 'none', cursor: 'pointer',
  background: bg, color: '#fff', transition: 'background 0.15s',
});

const cardStyle = {
  background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px',
  padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '4px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
};

const cardLabel = {
  fontSize: '12px', fontWeight: 600, color: '#64748b',
};

const thStyle = {
  padding: '12px 14px',
  whiteSpace: 'nowrap',
};

const tdStyle = {
  padding: '12px 14px',
  verticalAlign: 'middle',
};

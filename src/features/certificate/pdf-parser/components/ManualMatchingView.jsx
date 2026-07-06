import React, { useState, useEffect, useMemo } from 'react';
import { PdfDropZone } from './PdfDropZone';
import { PageThumbnailPanel } from './PageThumbnailPanel';
import { DateSelector } from './DateSelector';
import { FileNameEditor } from './FileNameEditor';
import { CompletionSummary } from './CompletionSummary';
import { useSiteMaster } from '../../hooks/useSiteMaster';
import { usePdfLoader } from '../hooks/usePdfLoader';
import { useManualMatching } from '../hooks/useManualMatching';
import { extractDatesFromFileName, determinePrefix, generateFileName } from '../utils/namingRules';
import { usePdfTemplate } from '../viewmodels/usePdfTemplate';

export function ManualMatchingView() {
  const { siteMaster } = useSiteMaster();
  const {
    pdfDocument,
    pages,
    setPages,
    pdfProgress,
    loadPdf,
    generateRoiImage,
    generateAllThumbnails,
    reset: resetPdfLoader,
  } = usePdfLoader();

  const matching = useManualMatching(siteMaster);

  const [isDragging, setIsDragging] = useState(false);
  const [pdfFile, setPdfFile] = useState(null);

  // 실시간 필터 검색어 및 되돌릴 현장 선택 상태
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMatchedSiteId, setSelectedMatchedSiteId] = useState(null);

  const { globalBoxes } = usePdfTemplate();

  // 검색어를 반영한 남은 현장 필터링 (가나다 순 정렬 추가)
  const filteredAvailableList = useMemo(() => {
    const list = siteMaster.filter(s => matching.availableSites.has(s.id));
    const sortedList = [...list].sort((a, b) => a.site_name.localeCompare(b.site_name, 'ko'));
    if (!searchTerm) return sortedList;
    const term = searchTerm.toLowerCase();
    return sortedList.filter(s => s.site_name.toLowerCase().includes(term));
  }, [searchTerm, matching.availableSites, siteMaster]);

  // 지정 완료 현장 정보 및 페이지 번호 쌍 구하기 (오른쪽 리스트뷰용)
  const matchedPageList = useMemo(() => {
    const list = [];
    pages.forEach(p => {
      if (p.status === 'matched') {
        const site = siteMaster.find(s => s.site_name === p.matchedSite);
        if (site) {
          list.push({
            pageNum: p.pageNum,
            pageIndex: p.pageIndex,
            siteId: site.id,
            siteName: p.matchedSite
          });
        }
      }
    });
    return list.sort((a, b) => a.pageNum - b.pageNum);
  }, [pages, siteMaster]);

  // 현재 보여줄 ROI 이미지 판단
  const activeRoiImage = useMemo(() => {
    if (selectedMatchedSiteId !== null) {
      const siteName = siteMaster.find(s => s.id === selectedMatchedSiteId)?.site_name;
      const pg = pages.find(p => p.matchedSite === siteName);
      return pg?.roiImage || null;
    }
    
    // 미지정 페이지가 하나도 없고 모든 매칭이 끝난 경우
    const targetPages = matching.startFromFirstPage ? pages : pages.slice(1);
    const isAllMatched = targetPages.length > 0 && targetPages.every(p => p.status === 'matched');
    if (isAllMatched) {
      return 'completed';
    }
    
    return pages[matching.currentPageIndex]?.roiImage || null;
  }, [selectedMatchedSiteId, pages, matching.currentPageIndex, matching.startFromFirstPage, siteMaster]);

  // 현재 편집 대상 페이지 (지정완료 선택 중이면 해당 페이지, 아니면 현재 작업 대상 페이지)
  const activePageForName = useMemo(() => {
    if (selectedMatchedSiteId !== null) {
      const siteName = siteMaster.find(s => s.id === selectedMatchedSiteId)?.site_name;
      return pages.find(p => p.matchedSite === siteName);
    }
    return pages[matching.currentPageIndex];
  }, [selectedMatchedSiteId, pages, matching.currentPageIndex, siteMaster]);

  // 파일명 에디터에 보일 현재 파일명 계산
  const currentFileNameValue = activePageForName?.customFileName || matching.customFileName || '';

  const { initSiteMaster } = matching;

  // 현장 마스터 초기화
  useEffect(() => {
    initSiteMaster();
  }, [siteMaster, initSiteMaster]);

  // 현재 페이지 변경 또는 페이지 데이터 로드 완료 시 ROI 이미지 자동 생성
  useEffect(() => {
    let active = true;
    
    const loadRoiForCurrentPage = async () => {
      const index = matching.currentPageIndex;
      if (pages.length === 0 || !pages[index]) return;
      if (pages[index].roiImage) return;

      // globalBoxes에서 location(현장명) 박스 정보를 가져오며 없으면 기본 템플릿을 사용합니다.
      const locationBox = globalBoxes?.location || { x: 229.63, y: 175.04, width: 250, height: 25 };
      const roiImage = await generateRoiImage(index, locationBox, pages);
      
      if (roiImage && active) {
        setPages(prev => {
          const next = [...prev];
          if (next[index]) {
            next[index] = { ...next[index], roiImage };
          }
          return next;
        });
      }
    };
    
    loadRoiForCurrentPage();
    
    return () => {
      active = false;
    };
  }, [matching.currentPageIndex, pages, globalBoxes, generateRoiImage, setPages]);

  // PDF 업로드 핸들러
  const handlePdfDrop = async (file) => {
    console.log('[ManualMatchingView] handlePdfDrop 호출됨:', file);
    try {
      setPdfFile(file);
      matching.goToPage(0);
      matching.selectSite(null);

      // PDF 로드
      console.log('[ManualMatchingView] PDF 로드 시작...');
      const loadedPages = await loadPdf(file);
      console.log('[ManualMatchingView] PDF 로드 완료:', loadedPages);

      if (!loadedPages || loadedPages.length === 0) {
        throw new Error('PDF 페이지 로드 실패');
      }

      // 모든 썸네일 생성
      console.log('[ManualMatchingView] 썸네일 생성 시작...');
      await generateAllThumbnails(loadedPages);
      console.log('[ManualMatchingView] 썸네일 생성 완료');


      // 파일명에서 날짜 추출
      const dates = extractDatesFromFileName(file.name);
      if (dates.length > 0) {
        matching.setSelectedDate(dates[0]);
      }

      // 파일명 미리보기 생성
      const prefix = determinePrefix(file.name);
      const defaultFileName = generateFileName(prefix, matching.selectedDate || 'YYYYMMDD', '현장명');
      matching.setCustomFileName(defaultFileName);

      // 매칭 단계로 이동
      matching.setStep('matching');
      console.log('[ManualMatchingView] 매칭 단계로 이동 완료');

      // 이전 전송 실패한 백업 작업 복원 검사
      const savedTaskStr = localStorage.getItem('osoo_manual_matching_pending_task');
      if (savedTaskStr) {
        try {
          const savedTask = JSON.parse(savedTaskStr);
          if (savedTask.pdfFileName === file.name) {
            if (window.confirm('이전에 전송 실패로 중단되었던 수동 매칭 작업 내역이 존재합니다. 그대로 복원하시겠습니까?')) {
              // 1. 페이지 매칭 상태 복원
              setPages(prev => {
                return prev.map(p => {
                  const savedPage = savedTask.pages.find(sp => sp.pageIndex === p.pageIndex);
                  if (savedPage) {
                    return {
                      ...p,
                      matchedSite: savedPage.matchedSite,
                      status: savedPage.status,
                      customFileName: savedPage.customFileName
                    };
                  }
                  return p;
                });
              });

              // 2. 훅 내부의 남은/지정 완료 목록 정밀 동기화
              const available = new Set(siteMaster.map(s => s.id));
              const used = new Set();
              savedTask.pages.forEach(sp => {
                if (sp.status === 'matched') {
                  const site = siteMaster.find(s => s.site_name === sp.matchedSite);
                  if (site) {
                    available.delete(site.id);
                    used.add(site.id);
                  }
                }
              });
              matching.setAvailableSites(available);
              matching.setUsedSites(used);
              
              // 3. 날짜 및 파일명 설정 복원
              if (savedTask.selectedDate) {
                matching.setSelectedDate(savedTask.selectedDate);
              }
              if (savedTask.customFileName) {
                matching.setCustomFileName(savedTask.customFileName);
              }

              console.log('[ManualMatchingView] 수동 매칭 데이터 백업 복원 성공');
            }
          }
        } catch (restoreErr) {
          console.error('[ManualMatchingView] 백업 복원 실패:', restoreErr);
        }
      }

    } catch (err) {
      console.error('[ManualMatchingView] 오류:', err);
      alert('PDF 파일 로드 중 오류가 발생했습니다: ' + err.message);
    }
  };

  // 현장 선택 지정 핸들러 (원클릭 매칭)
  const handleAssignSite = (siteId) => {
    matching.assignSite(siteId, pages, setPages, pdfFile?.name);
  };

  // 지정 매칭 취소 핸들러 (되돌리기)
  const handleUndoMatch = () => {
    matching.undoMatch(selectedMatchedSiteId, pages, setPages);
    setSelectedMatchedSiteId(null);
  };

  // 파일명 수정 핸들러
  const handleFileNameChange = (newVal) => {
    if (activePageForName) {
      setPages(prev => {
        const next = [...prev];
        if (next[activePageForName.pageIndex]) {
          next[activePageForName.pageIndex] = {
            ...next[activePageForName.pageIndex],
            customFileName: newVal
          };
        }
        return next;
      });
    }
    matching.setCustomFileName(newVal);
  };

  // 최종 매칭 완료 핸들러
  const handleConfirmManualStep = async () => {
    await matching.startUpload(pages, pdfDocument, pdfFile, setPages, globalBoxes);
  };

  // 전체 취소 핸들러
  const handleReset = () => {
    matching.reset();
    resetPdfLoader();
    setPdfFile(null);
  };

  // 업로드 시작 핸들러
  const handleStartUpload = async () => {
    await matching.startUpload(pages, pdfDocument, pdfFile, setPages, globalBoxes);
  };

  // 빠진/매칭안됨 페이지
  const unmatchedPages = pages.filter(p => p.status === 'pending');

  return (
    <div style={{ padding: 24, height: 'calc(100vh - 48px)', display: 'flex', flexDirection: 'column', gap: 16, overflow: 'hidden' }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, color: '#333', flexShrink: 0 }}>성적서 수동 매칭</h1>

      {/* 업로드 단계 */}
      {matching.step === 'upload' && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative', width: '100%', height: '100%' }}>
          <PdfDropZone
            onDrop={handlePdfDrop}
            isDragging={isDragging}
            setIsDragging={setIsDragging}
          />
          
          {/* 진행 상태 오버레이 (드롭존 한가운데 배치) */}
          {pdfProgress.total > 0 && (
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(255, 255, 255, 0.7)',
              backdropFilter: 'blur(8px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10,
              borderRadius: 16,
              animation: 'fadeInOverlay 0.2s ease-out'
            }}>
              <style dangerouslySetInnerHTML={{ __html: `
                @keyframes fadeInOverlay {
                  from { opacity: 0; }
                  to { opacity: 1; }
                }
              `}} />
              
              <div style={{
                background: '#ffffff',
                border: '1px solid rgba(229, 231, 235, 0.8)',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.08), 0 10px 10px -5px rgba(0, 0, 0, 0.03)',
                borderRadius: 20,
                padding: '24px 32px',
                width: 360,
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
                fontFamily: 'Inter, system-ui, sans-serif',
                animation: 'scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
              }}>
                <style dangerouslySetInnerHTML={{ __html: `
                  @keyframes scaleIn {
                    from { transform: scale(0.95); opacity: 0; }
                    to { transform: scale(1); opacity: 1; }
                  }
                `}} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#1f2937', display: 'flex', alignItems: 'center', gap: 8 }}>
                    {pdfProgress.percent === 100 ? (
                      <>
                        <span style={{ color: '#10b981', fontSize: 16 }}>✔</span> 분석 완료
                      </>
                    ) : (
                      <>
                        <span style={{
                          display: 'inline-block',
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          backgroundColor: '#3b82f6',
                          animation: 'overlayPulse 1.5s infinite'
                        }} />
                        <style dangerouslySetInnerHTML={{ __html: `
                          @keyframes overlayPulse {
                            0% { transform: scale(0.95); opacity: 0.5; }
                            50% { transform: scale(1.1); opacity: 1; }
                            100% { transform: scale(0.95); opacity: 0.5; }
                          }
                        `}} />
                        PDF 분석 중...
                      </>
                    )}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: '#3b82f6' }}>
                    {pdfProgress.percent}%
                  </span>
                </div>
                
                <div style={{ fontSize: 13, color: '#4b5563', lineHeight: '1.5', minHeight: 40, display: 'flex', alignItems: 'center', wordBreak: 'keep-all' }}>
                  {pdfProgress.message}
                </div>
                
                {/* 프로그래스 바 */}
                <div style={{
                  width: '100%',
                  height: 8,
                  backgroundColor: '#f3f4f6',
                  borderRadius: 999,
                  overflow: 'hidden'
                }}>
                  <div style={{
                    width: `${pdfProgress.percent}%`,
                    height: '100%',
                    backgroundColor: pdfProgress.percent === 100 ? '#10b981' : '#3b82f6',
                    borderRadius: 999,
                    transition: 'width 0.2s ease-out'
                  }} />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 매칭 단계 */}
      {matching.step === 'matching' && (
        <>
          {/* 옵션: 첫페이지부터 시작 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <input
              type="checkbox"
              id="start-first-page"
              checked={matching.startFromFirstPage}
              onChange={(e) => matching.setStartFromFirstPage(e.target.checked)}
            />
            <label htmlFor="start-first-page" style={{ fontSize: 13, color: '#333' }}>
              첫페이지부터 시작 (기본: 2페이지부터)
            </label>
          </div>

          {/* 3열 레이아웃 */}
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '200px 1fr 280px', gap: 16, overflow: 'hidden', minHeight: 0 }}>
            {/* 왼쪽: 페이지 썸네일 */}
            <div style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <PageThumbnailPanel
                pages={pages}
                currentPageIndex={matching.currentPageIndex}
                onPageClick={matching.goToPage}
                startFromFirstPage={matching.startFromFirstPage}
              />
            </div>

            {/* 중앙: 현장명 크롭 이미지 + 미지정 현장 리스트뷰 */}
            <div style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* 상단: 현장명 영역 크롭 이미지 */}
              <div style={{
                border: '1px solid #e5e7eb',
                borderRadius: 12,
                padding: '12px 16px',
                backgroundColor: '#ffffff',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                height: 110,
                flexShrink: 0,
                boxShadow: '0 1px 3px 0 rgba(0,0,0,0.05)'
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#4b5563' }}>현장명 영역 (크롭)</div>
                <div style={{
                  flex: 1,
                  backgroundColor: '#f9fafb',
                  borderRadius: 8,
                  border: '1px dashed #d1d5db',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden'
                }}>
                  {activeRoiImage === 'completed' ? (
                    <div style={{ fontSize: 13, color: '#10b981', fontWeight: 700, padding: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>🎉 모든 페이지의 현장 지정이 완료되었습니다.</span>
                    </div>
                  ) : activeRoiImage ? (
                    <img
                      src={activeRoiImage}
                      alt="현장명 크롭"
                      style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }}
                    />
                  ) : (
                    <div style={{ fontSize: 12, color: '#9ca3af' }}>선택된 페이지의 ROI 이미지 없음</div>
                  )}
                </div>
              </div>

              {/* 하단: 미지정 현장 리스트뷰 */}
              <div style={{
                flex: 1,
                border: '1px solid #e5e7eb',
                borderRadius: 12,
                backgroundColor: '#ffffff',
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                overflow: 'hidden',
                boxShadow: '0 1px 3px 0 rgba(0,0,0,0.05)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1f2937', margin: 0 }}>남은 현장 ({matching.availableSites.size})</h3>
                  <input
                    type="text"
                    placeholder="🔍 현장명 필터 검색..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 8,
                      border: '1px solid #d1d5db',
                      fontSize: 12,
                      width: 180,
                      outline: 'none',
                      transition: 'all 0.15s ease'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#2563eb'}
                    onBlur={(e) => e.target.style.borderColor = '#d1d5db'}
                  />
                </div>

                <div style={{
                  flex: 1,
                  overflowY: 'auto',
                  border: '1px solid #f3f4f6',
                  borderRadius: 8,
                  padding: 4
                }}>
                  {filteredAvailableList.length === 0 ? (
                    <div style={{ fontSize: 13, color: '#9ca3af', padding: '24px 0', textAlign: 'center' }}>
                      검색 결과가 없거나 남은 현장이 없습니다.
                    </div>
                  ) : (
                    filteredAvailableList.map(s => (
                      <div
                        key={s.id}
                        onClick={() => handleAssignSite(s.id)}
                        style={{
                          padding: '10px 14px',
                          borderRadius: 8,
                          fontSize: 13,
                          color: '#374151',
                          cursor: 'pointer',
                          marginBottom: 4,
                          transition: 'all 0.15s ease',
                          backgroundColor: 'transparent',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#f3f4f6';
                          e.currentTarget.style.transform = 'translateX(4px)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                          e.currentTarget.style.transform = 'translateX(0)';
                        }}
                      >
                        <span>{s.site_name}</span>
                        <span style={{ fontSize: 11, color: '#3b82f6', opacity: 0.8 }}>지정 →</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* 오른쪽: 지정 완료 현장 리스트뷰 + 되돌리기 버튼 + 메타 정보 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%', overflow: 'hidden' }}>
              {/* 지정 완료 현장 리스트뷰 */}
              <div style={{
                border: '1px solid #e5e7eb',
                borderRadius: 12,
                backgroundColor: '#ffffff',
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                height: 250,
                flexShrink: 0,
                boxShadow: '0 1px 3px 0 rgba(0,0,0,0.05)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ fontSize: 13, fontWeight: 700, color: '#374151', margin: 0 }}>
                    지정 완료 현장 ({matchedPageList.length})
                  </h3>
                  
                  {/* 되돌리기 버튼 (왼쪽 화살표) */}
                  <button
                    onClick={handleUndoMatch}
                    disabled={!selectedMatchedSiteId}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 6,
                      border: selectedMatchedSiteId ? '1px solid #fda4af' : '1px solid #e5e7eb',
                      backgroundColor: selectedMatchedSiteId ? '#fff1f2' : '#f9fafb',
                      color: selectedMatchedSiteId ? '#dc2626' : '#9ca3af',
                      cursor: selectedMatchedSiteId ? 'pointer' : 'not-allowed',
                      fontSize: 12,
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={(e) => { if (selectedMatchedSiteId) e.currentTarget.style.backgroundColor = '#ffe4e6'; }}
                    onMouseLeave={(e) => { if (selectedMatchedSiteId) e.currentTarget.style.backgroundColor = '#fff1f2'; }}
                  >
                    ← 되돌리기
                  </button>
                </div>

                <div style={{
                  flex: 1,
                  overflowY: 'auto',
                  border: '1px solid #f3f4f6',
                  borderRadius: 8,
                  padding: 4
                }}>
                  {matchedPageList.length === 0 ? (
                    <div style={{ fontSize: 12, color: '#9ca3af', padding: '24px 0', textAlign: 'center' }}>
                      아직 지정된 현장이 없습니다.
                    </div>
                  ) : (
                    matchedPageList.map(item => {
                      const isSelected = item.siteId === selectedMatchedSiteId;
                      return (
                        <div
                          key={item.siteId}
                          onClick={() => setSelectedMatchedSiteId(item.siteId)}
                          style={{
                            padding: '8px 10px',
                            borderRadius: 6,
                            fontSize: 12,
                            cursor: 'pointer',
                            marginBottom: 4,
                            backgroundColor: isSelected ? '#eff6ff' : 'transparent',
                            border: isSelected ? '1px solid #bfdbfe' : '1px solid transparent',
                            color: isSelected ? '#1e3a8a' : '#4b5563',
                            transition: 'all 0.1s ease',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                          }}
                        >
                          <span style={{ fontWeight: isSelected ? 700 : 500 }}>
                            P{item.pageNum} - {item.siteName}
                          </span>
                          {isSelected && <span style={{ fontSize: 10, color: '#3b82f6' }}>선택됨</span>}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <DateSelector
                extractedDates={extractDatesFromFileName(pdfFile?.name || '')}
                selectedDate={matching.selectedDate}
                onSelect={matching.setSelectedDate}
              />

              <FileNameEditor
                fileName={currentFileNameValue}
                onChange={handleFileNameChange}
              />

              <button
                onClick={handleConfirmManualStep}
                style={{
                  padding: 12,
                  borderRadius: 8,
                  border: 'none',
                  backgroundColor: '#2563eb',
                  color: 'white',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  flexShrink: 0,
                  boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.2)',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#1d4ed8'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
              >
                매칭 최종 완료
              </button>
            </div>
          </div>
        </>
      )}

      {/* 완료 단계 */}
      {matching.step === 'complete' && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <CompletionSummary
            pages={pages}
            unmatchedPages={unmatchedPages}
            uploadProgress={matching.uploadProgress}
            onStartUpload={handleStartUpload}
            onReset={handleReset}
          />
        </div>
      )}

      {/* 업로드 중 */}
      {matching.step === 'uploading' && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <CompletionSummary
            pages={pages}
            unmatchedPages={unmatchedPages}
            uploadProgress={matching.uploadProgress}
            onStartUpload={handleStartUpload}
            onReset={handleReset}
          />
        </div>
      )}
    </div>
  );
}

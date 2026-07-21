import React, { useState, useEffect } from 'react';
import { Calendar, FileSpreadsheet, CheckCircle2, AlertCircle, RefreshCw, BarChart3, Upload, ChevronRight, ChevronLeft, ChevronsRight, ChevronsLeft, Search } from 'lucide-react';

function sanitizeFileNamePart(value, fallback = '현장') {
  const sanitized = String(value || '')
    .replace(/[<>:"/\\|?*]/g, '')
    .trim();
  return sanitized || fallback;
}

function buildExportFileName(siteNames, startDate, endDate, fileExtension = 'xlsx') {
  const firstSiteName = sanitizeFileNamePart(siteNames?.[0], '현장');
  const extraCount = Math.max(0, (siteNames?.length || 0) - 1);
  const siteLabel = extraCount > 0 ? `${firstSiteName} 외 ${extraCount}건` : firstSiteName;
  return `${siteLabel}_기간데이타조회_${startDate}_${endDate}.${fileExtension}`;
}

export function PeriodReportView() {
  const [startDate, setStartDate] = useState('2026-01-01');
  const [endDate, setEndDate] = useState('2026-06-30');
  
  // 현장 목록 데이터 상태
  const [availableSites, setAvailableSites] = useState([]); // 왼쪽: 미선택 현장
  const [selectedSites, setSelectedSites] = useState([]);   // 오른쪽: 선택된 현장
  
  // 검색어 필터 상태
  const [leftSearch, setLeftSearch] = useState('');
  const [rightSearch, setRightSearch] = useState('');

  // 체크박스/활성화 선택 상태 (Set)
  const [leftChecked, setLeftChecked] = useState(new Set());
  const [rightChecked, setRightChecked] = useState(new Set());

  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [uploadingTemplate, setUploadingTemplate] = useState(false);
  const [actionMessage, setActionMessage] = useState(null);

  // 1. 구글 시트 마스터 현장 목록 API 호출
  useEffect(() => {
    let active = true;
    let retryTimeout = null;

    const fetchSites = async (isRetry = false) => {
      if (!active) return;
      setLoading(true);
      try {
        const { getApiBase } = await import('../../core/api/serverConfig');
        const apiBase = getApiBase();
        const res = await fetch(`${apiBase}/api/settings/sites`, {
          headers: {
            'x-user-role': 'super_admin',
            'x-user-name': 'admin',
          }
        });
        const result = await res.json();
        if (res.ok && result.success && Array.isArray(result.sites)) {
          // 활성 상태 현장만 추리고 '오수처리장' 및 '양북임시휴게소' 제외 후 가나다 한국어 사전순 정렬
          const activeSites = result.sites
            .filter(site => site.is_active === 1 || site.is_active === '1')
            .map(site => ({ id: site.id, site_name: String(site.site_name || '').trim() }))
            .filter(site => site.site_name !== '오수처리장' && site.site_name !== '양북임시휴게소' && site.site_name !== '')
            .sort((a, b) => a.site_name.localeCompare(b.site_name, 'ko'));
          
          if (active) {
            setAvailableSites(activeSites);
            setActionMessage(null);
          }
        } else {
          throw new Error(result.message || '현장 목록을 불러오지 못했습니다.');
        }
      } catch (err) {
        console.error('[PeriodReportView] Failed to fetch sites:', err);
        if (active) {
          if (!isRetry) {
            setActionMessage({ type: 'error', text: '현장 목록 조회에 실패하여 2초 후 자동 재시도합니다...' });
            retryTimeout = setTimeout(() => {
              fetchSites(true);
            }, 2000);
          } else {
            setActionMessage({ type: 'error', text: `현장 목록 연동 실패: ${err.message}` });
          }
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    fetchSites();

    return () => {
      active = false;
      if (retryTimeout) clearTimeout(retryTimeout);
    };
  }, []);

  // 2. 엑셀 양식 파일 업로드 연동
  const handleTemplateUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingTemplate(true);
    setActionMessage(null);

    const formData = new FormData();
    formData.append('files', file, '기간 데이타 조회.xlsx');

    try {
      const { getApiBase } = await import('../../core/api/serverConfig');
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/gyeonggi/templates`, {
        method: 'POST',
        headers: {
          'x-user-role': 'super_admin',
          'x-user-name': 'admin',
        },
        body: formData
      });

      const result = await res.json();
      if (res.ok && result.success) {
        setActionMessage({
          type: 'success',
          text: `엑셀 양식 파일이 성공적으로 업로드되어 '기간 데이타 조회.xlsx' 양식으로 등록되었습니다.`
        });
      } else {
        throw new Error(result.message || '업로드 실패');
      }
    } catch (err) {
      console.error('[PeriodReportView] Template upload failed:', err);
      setActionMessage({
        type: 'error',
        text: `엑셀 양식 등록에 실패했습니다: ${err.message}`
      });
    } finally {
      setUploadingTemplate(false);
      e.target.value = '';
    }
  };

  // 3. 화살표 이동 제어 함수
  const moveRight = () => {
    if (leftChecked.size === 0) return;

    const toMove = availableSites.filter(site => leftChecked.has(site.id));
    const remaining = availableSites.filter(site => !leftChecked.has(site.id));

    setAvailableSites(remaining);
    setSelectedSites(prev => [...prev, ...toMove].sort((a, b) => a.site_name.localeCompare(b.site_name, 'ko')));
    setLeftChecked(new Set());
  };

  const moveLeft = () => {
    if (rightChecked.size === 0) return;

    const toMove = selectedSites.filter(site => rightChecked.has(site.id));
    const remaining = selectedSites.filter(site => !rightChecked.has(site.id));

    setSelectedSites(remaining);
    setAvailableSites(prev => [...prev, ...toMove].sort((a, b) => a.site_name.localeCompare(b.site_name, 'ko')));
    setRightChecked(new Set());
  };

  const addAllSites = () => {
    if (availableSites.length === 0) return;
    setSelectedSites(prev => [...prev, ...availableSites].sort((a, b) => a.site_name.localeCompare(b.site_name, 'ko')));
    setAvailableSites([]);
    setLeftChecked(new Set());
  };

  const removeAllSites = () => {
    if (selectedSites.length === 0) return;
    setAvailableSites(prev => [...prev, ...selectedSites].sort((a, b) => a.site_name.localeCompare(b.site_name, 'ko')));
    setSelectedSites([]);
    setRightChecked(new Set());
  };

  const handleLeftCheck = (id) => {
    setLeftChecked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleRightCheck = (id) => {
    setRightChecked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // 4. 더블클릭 단축 이동 UX 구현
  const handleLeftDoubleClick = (site) => {
    setAvailableSites(prev => prev.filter(s => s.id !== site.id));
    setSelectedSites(prev => [...prev, site].sort((a, b) => a.site_name.localeCompare(b.site_name, 'ko')));
    setLeftChecked(prev => {
      const next = new Set(prev);
      next.delete(site.id);
      return next;
    });
  };

  const handleRightDoubleClick = (site) => {
    setSelectedSites(prev => prev.filter(s => s.id !== site.id));
    setAvailableSites(prev => [...prev, site].sort((a, b) => a.site_name.localeCompare(b.site_name, 'ko')));
    setRightChecked(prev => {
      const next = new Set(prev);
      next.delete(site.id);
      return next;
    });
  };

  // 5. 엑셀 양식 출력 기능 (실제 API 호출 + Blob 다운로드)
  const handleExport = async () => {
    if (!startDate || !endDate) {
      setActionMessage({ type: 'error', text: '조회 시작일과 종료일을 모두 선택해 주세요.' });
      return;
    }

    if (startDate > endDate) {
      setActionMessage({ type: 'error', text: '시작일은 종료일보다 늦을 수 없습니다.' });
      return;
    }

    if (selectedSites.length === 0) {
      setActionMessage({ type: 'error', text: '출력할 현장을 최소 1개 이상 우측 리스트에 추가해 주세요.' });
      return;
    }
    setExporting(true);
    setActionMessage(null);

    try {
      const { getApiBase } = await import('../../core/api/serverConfig');
      const apiBase = getApiBase();

      const res = await fetch(`${apiBase}/api/gyeonggi/period-report/export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': 'super_admin',
          'x-user-name': 'admin',
        },
        body: JSON.stringify({
          startDate,
          endDate,
          siteNames: selectedSites.map(s => s.site_name),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: '서버 오류' }));
        throw new Error(err.message || `HTTP ${res.status}`);
      }

      // Blob 다운로드
      const blob = await res.blob();
      const contentDisposition = res.headers.get('Content-Disposition') || '';
      let fileName = buildExportFileName(selectedSites.map((site) => site.site_name), startDate, endDate, 'xlsx');

      // Content-Disposition에서 파일명 추출
      const match = contentDisposition.match(/filename\*?=(?:UTF-8'')?([^;\s]+)/i);
      if (match) {
        fileName = decodeURIComponent(match[1]);
      } else if (blob.type === 'application/zip') {
        fileName = buildExportFileName(selectedSites.map((site) => site.site_name), startDate, endDate, 'zip');
      }

      if (window.electronAPI && window.electronAPI.saveFileToTemp && window.electronAPI.openFile) {
        const arrayBuffer = await blob.arrayBuffer();
        const saveRes = await window.electronAPI.saveFileToTemp(fileName, arrayBuffer);
        if (saveRes.success && saveRes.filePath) {
          await window.electronAPI.openFile(saveRes.filePath);
        } else {
          throw new Error(saveRes.error || '임시 폴더 저장 실패');
        }
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }

      setActionMessage({
        type: 'success',
        text: `선택한 ${selectedSites.length}개 현장의 ${startDate} ~ ${endDate} 기간 데이터가 엑셀 양식에 바인딩되어 다운로드 완료되었습니다.`,
      });
    } catch (err) {
      console.error('[PeriodReportView] Export failed:', err);
      setActionMessage({ type: 'error', text: `엑셀 출력 실패: ${err.message}` });
    } finally {
      setExporting(false);
    }
  };

  // 검색 필터 적용
  const filteredAvailable = availableSites.filter(site => 
    site.site_name.toLowerCase().includes(leftSearch.toLowerCase())
  );
  const filteredSelected = selectedSites.filter(site => 
    site.site_name.toLowerCase().includes(rightSearch.toLowerCase())
  );

  return (
    <div style={{
      padding: '8px 16px',
      color: '#1e293b', // 라이트 테마 기반의 명확하고 짙은 슬레이트 텍스트 컬러 지정
      height: '100%',
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      fontFamily: "'Outfit', 'Inter', -apple-system, sans-serif"
    }}>
      {/* 상단 브랜딩 헤더 */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px',
        borderBottom: '1px solid #e2e8f0', // 테두리 가인성 대폭 보완
        paddingBottom: '12px',
        flexShrink: 0
      }}>
        <div>
          <h1 style={{
            fontSize: '22px',
            fontWeight: '800',
            color: '#1e3a8a', // 선명한 딥 블루 컬러로 텍스트 가독성 대폭 향상
            margin: 0,
            letterSpacing: '-0.75px'
          }}>
            기간 데이터 조회
          </h1>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {/* 양식 업로드용 파일 인풋 및 버튼 */}
          <input 
            type="file"
            id="template-upload-input"
            accept=".xlsx"
            onChange={handleTemplateUpload}
            style={{ display: 'none' }}
          />
          <button
            onClick={() => document.getElementById('template-upload-input').click()}
            disabled={uploadingTemplate}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              background: '#ffffff',
              border: '1.5px solid #cbd5e1',
              color: '#334155',
              fontSize: '12px',
              fontWeight: '700',
              cursor: uploadingTemplate ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s ease',
              boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
            }}
            onMouseOver={(e) => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.borderColor = '#94a3b8'; }}
            onMouseOut={(e) => { e.currentTarget.style.background = '#ffffff'; e.currentTarget.style.borderColor = '#cbd5e1'; }}
          >
            {uploadingTemplate ? <RefreshCw size={14} className="animate-spin" /> : <Upload size={14} style={{ color: '#2563eb' }} />}
            <span>{uploadingTemplate ? '양식 업로드 중...' : '엑셀 양식 등록'}</span>
          </button>

          <div style={{
            display: 'flex',
            gap: '8px',
            padding: '8px 16px',
            borderRadius: '8px',
            background: '#eff6ff',
            border: '1.5px solid #bfdbfe',
            fontSize: '11px',
            color: '#2563eb',
            alignItems: 'center',
            fontWeight: '800',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
          }}>
            <BarChart3 size={13} />
            <span>BigQuery & Sheets 연동 중</span>
          </div>
        </div>
      </div>

      {/* 알림 메시지 배너 */}
      {actionMessage && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '12px 16px',
          borderRadius: '8px',
          marginBottom: '16px',
          fontSize: '12px',
          fontWeight: '700',
          background: actionMessage.type === 'success' ? '#ecfdf5' : '#fef2f2',
          border: actionMessage.type === 'success' ? '1.5px solid #a7f3d0' : '1.5px solid #fca5a5',
          color: actionMessage.type === 'success' ? '#065f46' : '#991b1b',
          boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
          transition: 'all 0.3s ease',
          flexShrink: 0
        }}>
          {actionMessage.type === 'success' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
          <span>{actionMessage.text}</span>
        </div>
      )}

      {/* 1. 상단 제어 바 (기간 설정 - 고대비 톤) */}
      <div style={{
        display: 'flex',
        gap: '16px',
        alignItems: 'center',
        background: '#f8fafc',
        border: '1.5px solid #e2e8f0',
        borderRadius: '12px',
        padding: '12px 18px',
        marginBottom: '16px',
        flexShrink: 0,
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Calendar size={15} style={{ color: '#2563eb' }} />
          <span style={{ fontSize: '13px', fontWeight: '800', color: '#1e293b', letterSpacing: '-0.3px' }}>조회 기간 설정:</span>
        </div>
        <input 
          type="date" 
          value={startDate} 
          onChange={(e) => setStartDate(e.target.value)}
          style={{
            padding: '6px 12px',
            borderRadius: '8px',
            background: '#ffffff',
            border: '1.5px solid #cbd5e1',
            color: '#0f172a', // 글자색을 100% 명확한 다크 슬레이트로 지정
            fontSize: '13px',
            fontWeight: '700',
            outline: 'none',
            transition: 'all 0.2s',
          }}
          onFocus={(e) => e.currentTarget.style.borderColor = '#2563eb'}
          onBlur={(e) => e.currentTarget.style.borderColor = '#cbd5e1'}
        />
        <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 'bold' }}>~</span>
        <input 
          type="date" 
          value={endDate} 
          onChange={(e) => setEndDate(e.target.value)}
          style={{
            padding: '6px 12px',
            borderRadius: '8px',
            background: '#ffffff',
            border: '1.5px solid #cbd5e1',
            color: '#0f172a',
            fontSize: '13px',
            fontWeight: '700',
            outline: 'none',
            transition: 'all 0.2s',
          }}
          onFocus={(e) => e.currentTarget.style.borderColor = '#2563eb'}
          onBlur={(e) => e.currentTarget.style.borderColor = '#cbd5e1'}
        />
      </div>

      {/* 2. 중앙 셔틀 영역 (양쪽 리스트뷰와 그 사이의 화살표) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 80px 1fr',
        gap: '16px',
        alignItems: 'stretch',
        flex: 1,
        minHeight: 0,
        marginBottom: '16px',
        overflow: 'hidden'
      }}>
        {/* 왼쪽: 미선택 현장 */}
        <div style={{
          background: '#ffffff',
          border: '1.5px solid #e2e8f0',
          borderRadius: '16px',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          boxShadow: '0 4px 18px rgba(0, 0, 0, 0.05)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '14px', color: '#1e293b', fontWeight: '800', letterSpacing: '-0.3px' }}>
              미선택 현장 <span style={{ color: '#2563eb', marginLeft: '4px' }}>{filteredAvailable.length}</span>
            </span>
          </div>
          
          {/* 검색창 */}
          <div style={{ position: 'relative', marginBottom: '12px' }}>
            <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
            <input 
              type="text" 
              placeholder="현장명 검색..." 
              value={leftSearch}
              onChange={(e) => setLeftSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px 10px 36px',
                borderRadius: '8px',
                background: '#f8fafc',
                border: '1.5px solid #cbd5e1',
                color: '#0f172a',
                fontSize: '13px',
                outline: 'none',
                transition: 'all 0.2s'
              }}
              onFocus={(e) => e.currentTarget.style.borderColor = '#2563eb'}
              onBlur={(e) => e.currentTarget.style.borderColor = '#cbd5e1'}
            />
          </div>

          {/* 리스트 본체 */}
          <div style={{
            flex: 1,
            background: '#f8fafc',
            border: '1.5px solid #f1f5f9',
            borderRadius: '12px',
            overflowY: 'auto',
            padding: '8px',
            minHeight: 0
          }}>
            {loading ? (
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', alignItems: 'center', height: '100%', color: '#64748b', fontSize: '13px' }}>
                <RefreshCw size={16} className="animate-spin" />
                <span>현장 로딩 중...</span>
              </div>
            ) : filteredAvailable.length === 0 ? null : (
              filteredAvailable.map(site => {
                const isChecked = leftChecked.has(site.id);
                return (
                  <div 
                    key={site.id}
                    onDoubleClick={() => handleLeftDoubleClick(site)}
                    onClick={() => handleLeftCheck(site.id)}
                    style={{
                      padding: '10px 14px',
                      borderRadius: '8px',
                      background: isChecked ? 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)' : '#ffffff',
                      border: isChecked ? '1.5px solid #93c5fd' : '1.5px solid #e2e8f0',
                      cursor: 'pointer',
                      marginBottom: '6px',
                      transition: 'all 0.15s ease',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                    }}
                    onMouseOver={(e) => { if (!isChecked) e.currentTarget.style.background = '#f1f5f9'; }}
                    onMouseOut={(e) => { if (!isChecked) e.currentTarget.style.background = '#ffffff'; }}
                  >
                    <span style={{ 
                      fontSize: '13px', 
                      fontWeight: isChecked ? '700' : '600', 
                      color: isChecked ? '#1e40af' : '#334155',
                      letterSpacing: '-0.2px'
                    }}>
                      {site.site_name}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* 중앙: 화살표 버튼 (가독성 100% 보강 고대비 디자인) */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '16px'
        }}>
          {/* 단일 추가 ▶ */}
          <button 
            onClick={moveRight}
            disabled={leftChecked.size === 0}
            title="선택한 현장 우측으로 추가"
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '50%',
              background: leftChecked.size > 0 
                ? 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)' 
                : '#f1f5f9', // 대비가 아주 높은 연회색 실버 톤
              border: leftChecked.size > 0 ? 'none' : '1.5px solid #cbd5e1',
              color: leftChecked.size > 0 ? '#ffffff' : '#94a3b8', // 짙은 회색 기호 적용
              cursor: leftChecked.size > 0 ? 'pointer' : 'not-allowed',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              transition: 'all 0.2s ease',
              boxShadow: leftChecked.size > 0 ? '0 4px 12px rgba(59, 130, 246, 0.3)' : 'none',
              transform: 'scale(1)'
            }}
            onMouseOver={(e) => { if (leftChecked.size > 0) e.currentTarget.style.transform = 'scale(1.1)'; }}
            onMouseOut={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
          >
            <ChevronRight size={20} style={{ strokeWidth: 2.5 }} />
          </button>
          
          {/* 전체 추가 ▶▶ */}
          <button 
            onClick={addAllSites}
            disabled={availableSites.length === 0}
            title="모든 현장 우측으로 일괄 추가"
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '50%',
              background: availableSites.length > 0 
                ? 'linear-gradient(135deg, #2563eb 0%, #1e3a8a 100%)' 
                : '#f1f5f9',
              border: availableSites.length > 0 ? 'none' : '1.5px solid #cbd5e1',
              color: availableSites.length > 0 ? '#ffffff' : '#94a3b8',
              cursor: availableSites.length > 0 ? 'pointer' : 'not-allowed',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              transition: 'all 0.2s ease',
              boxShadow: availableSites.length > 0 ? '0 4px 12px rgba(37, 99, 235, 0.3)' : 'none',
              transform: 'scale(1)'
            }}
            onMouseOver={(e) => { if (availableSites.length > 0) e.currentTarget.style.transform = 'scale(1.1)'; }}
            onMouseOut={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
          >
            <ChevronsRight size={20} style={{ strokeWidth: 2.5 }} />
          </button>

          {/* 단일 제거 ◀ */}
          <button 
            onClick={moveLeft}
            disabled={rightChecked.size === 0}
            title="선택한 현장 좌측으로 제외"
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '50%',
              background: rightChecked.size > 0 
                ? 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)' 
                : '#f1f5f9',
              border: rightChecked.size > 0 ? 'none' : '1.5px solid #cbd5e1',
              color: rightChecked.size > 0 ? '#ffffff' : '#94a3b8',
              cursor: rightChecked.size > 0 ? 'pointer' : 'not-allowed',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              transition: 'all 0.2s ease',
              boxShadow: rightChecked.size > 0 ? '0 4px 12px rgba(59, 130, 246, 0.3)' : 'none',
              transform: 'scale(1)'
            }}
            onMouseOver={(e) => { if (rightChecked.size > 0) e.currentTarget.style.transform = 'scale(1.1)'; }}
            onMouseOut={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
          >
            <ChevronLeft size={20} style={{ strokeWidth: 2.5 }} />
          </button>

          {/* 전체 제거 ◀◀ */}
          <button 
            onClick={removeAllSites}
            disabled={selectedSites.length === 0}
            title="모든 현장 좌측으로 일괄 제외"
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '50%',
              background: selectedSites.length > 0 
                ? 'linear-gradient(135deg, #2563eb 0%, #1e3a8a 100%)' 
                : '#f1f5f9',
              border: selectedSites.length > 0 ? 'none' : '1.5px solid #cbd5e1',
              color: selectedSites.length > 0 ? '#ffffff' : '#94a3b8',
              cursor: selectedSites.length > 0 ? 'pointer' : 'not-allowed',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              transition: 'all 0.2s ease',
              boxShadow: selectedSites.length > 0 ? '0 4px 12px rgba(37, 99, 235, 0.3)' : 'none',
              transform: 'scale(1)'
            }}
            onMouseOver={(e) => { if (selectedSites.length > 0) e.currentTarget.style.transform = 'scale(1.1)'; }}
            onMouseOut={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
          >
            <ChevronsLeft size={20} style={{ strokeWidth: 2.5 }} />
          </button>
        </div>

        {/* 오른쪽: 출력 대상 현장 */}
        <div style={{
          background: '#ffffff',
          border: '1.5px solid #e2e8f0',
          borderRadius: '16px',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          boxShadow: '0 4px 18px rgba(0, 0, 0, 0.05)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '14px', color: '#1e293b', fontWeight: '800', letterSpacing: '-0.3px' }}>
              출력 대상 현장 <span style={{ color: '#10b981', marginLeft: '4px' }}>{filteredSelected.length}</span>
            </span>
          </div>

          {/* 검색창 */}
          <div style={{ position: 'relative', marginBottom: '12px' }}>
            <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
            <input 
              type="text" 
              placeholder="현장명 검색..." 
              value={rightSearch}
              onChange={(e) => setRightSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px 10px 36px',
                borderRadius: '8px',
                background: '#f8fafc',
                border: '1.5px solid #cbd5e1',
                color: '#0f172a',
                fontSize: '13px',
                outline: 'none',
                transition: 'all 0.2s'
              }}
              onFocus={(e) => e.currentTarget.style.borderColor = '#10b981'}
              onBlur={(e) => e.currentTarget.style.borderColor = '#cbd5e1'}
            />
          </div>

          {/* 리스트 본체 */}
          <div style={{
            flex: 1,
            background: '#f8fafc',
            border: '1.5px solid #f1f5f9',
            borderRadius: '12px',
            overflowY: 'auto',
            padding: '8px',
            minHeight: 0
          }}>
            {filteredSelected.length === 0 ? null : (
              filteredSelected.map(site => {
                const isChecked = rightChecked.has(site.id);
                return (
                  <div 
                    key={site.id}
                    onDoubleClick={() => handleRightDoubleClick(site)}
                    onClick={() => handleRightCheck(site.id)}
                    style={{
                      padding: '10px 14px',
                      borderRadius: '8px',
                      background: isChecked ? 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)' : '#ffffff',
                      border: isChecked ? '1.5px solid #a7f3d0' : '1.5px solid #e2e8f0',
                      cursor: 'pointer',
                      marginBottom: '6px',
                      transition: 'all 0.15s ease',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                    }}
                    onMouseOver={(e) => { if (!isChecked) e.currentTarget.style.background = '#f1f5f9'; }}
                    onMouseOut={(e) => { if (!isChecked) e.currentTarget.style.background = '#ffffff'; }}
                  >
                    <span style={{ 
                      fontSize: '13px', 
                      fontWeight: isChecked ? '700' : '600', 
                      color: isChecked ? '#065f46' : '#334155',
                      letterSpacing: '-0.2px'
                    }}>
                      {site.site_name}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* 3. 최하단: 엑셀 양식 출력 실행 버튼 (젊은 감성의 화려하고 눈에 띄는 에메랄드 그라데이션) */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'flex-end', 
        flexShrink: 0,
        paddingTop: '4px',
        paddingBottom: '8px'
      }}>
        <button 
          onClick={handleExport}
          disabled={exporting || selectedSites.length === 0}
          style={{
            minWidth: '220px',
            padding: '12px 28px',
            borderRadius: '10px',
            background: selectedSites.length === 0 
              ? '#f1f5f9' // 비활성화 시에도 가독성 높은 실버 그레이 색상 적용
              : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            border: selectedSites.length === 0 ? '1.5px solid #cbd5e1' : 'none',
            color: selectedSites.length === 0 ? '#94a3b8' : '#ffffff', // 짙은 회색 텍스트 지정하여 비활성 시에도 명확히 보이도록 보정
            fontSize: '14px',
            fontWeight: '800',
            cursor: selectedSites.length === 0 || exporting ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            opacity: exporting ? 0.7 : 1,
            transition: 'all 0.25s ease',
            boxShadow: selectedSites.length === 0 ? 'none' : '0 4px 16px rgba(16, 185, 129, 0.3)',
            transform: 'scale(1)'
          }}
          onMouseOver={(e) => { if (selectedSites.length > 0 && !exporting) e.currentTarget.style.transform = 'scale(1.03)'; }}
          onMouseOut={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
        >
          {exporting ? <RefreshCw size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
          <span>{exporting ? '엑셀 보고서 생성 중...' : '엑셀 양식 출력'}</span>
        </button>
      </div>
    </div>
  );
}

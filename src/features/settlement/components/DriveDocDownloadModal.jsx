import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { X, Download, Search, CheckSquare, Square, Loader2, FileText, FileCheck, CheckCircle2, AlertCircle } from 'lucide-react';
import { apiClient } from '../../../core/api/apiClient.js';

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function downloadBase64File(base64Data, filename, mimeType = 'image/jpeg') {
  const byteCharacters = atob(base64Data);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i += 1) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: mimeType });
  downloadBlob(blob, filename);
}

export function DriveDocDownloadModal({
  isOpen,
  onClose,
  initialDocType = 'invoice',
  initialTargetYm,
  sites = [],
}) {
  const ymOptions = useMemo(() => {
    const list = [];
    const now = new Date();
    for (let i = 0; i < 24; i += 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const ym = `${y}${m}`;
      list.push({ ym, label: `${y}년 ${m}월 (${ym})` });
    }
    return list;
  }, []);

  const defaultYm = useMemo(() => {
    if (initialTargetYm && /^\d{6}$/.test(initialTargetYm)) return initialTargetYm;
    const now = new Date();
    return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  }, [initialTargetYm]);

  const [docType, setDocType] = useState(initialDocType);
  const [targetYm, setTargetYm] = useState(defaultYm);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSiteNames, setSelectedSiteNames] = useState(new Set());
  const [isDownloading, setIsDownloading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // 현장 목록 정규화
  const normalizedSites = useMemo(() => {
    if (!Array.isArray(sites)) return [];
    return sites
      .map((s) => {
        if (typeof s === 'string') return { id: s, name: s };
        return {
          id: s.id || s.site_id || s.site_name || s.name,
          name: s.site_name || s.name || s.id || '',
        };
      })
      .filter((s) => Boolean(s.name))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }, [sites]);

  // 모달이 열릴 때 초기화
  useEffect(() => {
    if (isOpen) {
      setDocType(initialDocType || 'invoice');
      setTargetYm(defaultYm);
      setSearchQuery('');
      setErrorMessage('');
      setStatusMessage('');
      // 기본적으로 전체 현장 선택
      const allNames = new Set(normalizedSites.map((s) => s.name));
      setSelectedSiteNames(allNames);
    }
  }, [isOpen, initialDocType, defaultYm, normalizedSites]);

  const filteredSites = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return normalizedSites;
    return normalizedSites.filter((s) => s.name.toLowerCase().includes(q));
  }, [normalizedSites, searchQuery]);

  const handleToggleSite = useCallback((siteName) => {
    setSelectedSiteNames((prev) => {
      const next = new Set(prev);
      if (next.has(siteName)) {
        next.delete(siteName);
      } else {
        next.add(siteName);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedSiteNames(new Set(normalizedSites.map((s) => s.name)));
  }, [normalizedSites]);

  const handleDeselectAll = useCallback(() => {
    setSelectedSiteNames(new Set());
  }, []);

  const handleDownload = async () => {
    if (selectedSiteNames.size === 0) {
      alert('다운로드할 현장을 최소 1개 이상 선택해 주세요.');
      return;
    }

    setIsDownloading(true);
    setErrorMessage('');
    setStatusMessage('파일을 검색하고 다운로드 준비 중입니다...');

    const siteList = Array.from(selectedSiteNames);
    const docLabel = docType === 'deposit' ? '입금표' : '계산서';

    try {
      if (siteList.length === 1) {
        // 단일 현장 선택 -> 개별 파일 다운로드
        const singleSite = siteList[0];
        setStatusMessage(`[${singleSite}] ${docLabel} 개별 파일을 다운로드하는 중...`);

        const result = await apiClient.post('/api/settlement/download-selected', {
          docType,
          targetYm,
          sites: [singleSite],
          format: 'json',
        });

        if (!result.success || !Array.isArray(result.files) || result.files.length === 0) {
          throw new Error(result.error || `${singleSite}의 ${targetYm} ${docLabel} 파일을 찾을 수 없습니다.`);
        }

        // 개별 파일들 브라우저 다운로드 실행
        for (const file of result.files) {
          downloadBase64File(file.base64, file.name, file.mimeType);
        }

        const msg = `${singleSite}의 ${result.files.length}개 ${docLabel} 다운로드 완료!\n(바탕화면 점검준비 폴더에도 저장되었습니다.)`;
        setStatusMessage(msg);
        alert(msg);
        onClose();
      } else {
        // 2개 이상 현장 선택 -> JSZip 압축 다운로드
        setStatusMessage(`선택한 ${siteList.length}개 현장의 ${docLabel}를 ZIP으로 압축하는 중...`);

        const baseUrl = apiClient.getBaseUrl();
        const response = await fetch(`${baseUrl}/api/settlement/download-selected`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            docType,
            targetYm,
            sites: siteList,
            format: 'binary',
          }),
        });

        if (!response.ok) {
          const errPayload = await response.json().catch(() => ({}));
          throw new Error(errPayload.error || `선택한 현장들의 ${targetYm} ${docLabel} 파일을 찾을 수 없습니다.`);
        }

        const blob = await response.blob();
        const zipFilename = `${docLabel}_${targetYm}_${siteList.length}개현장.zip`;
        downloadBlob(blob, zipFilename);

        const msg = `${siteList.length}개 현장의 ${docLabel} ZIP 압축 다운로드 완료!\n(바탕화면 점검준비 폴더에도 동기화 저장되었습니다.)`;
        setStatusMessage(msg);
        alert(msg);
        onClose();
      }
    } catch (err) {
      console.error('[DriveDocDownloadModal] 다운로드 실패:', err);
      setErrorMessage(err.message || '다운로드 중 오류가 발생했습니다.');
      setStatusMessage('');
    } finally {
      setIsDownloading(false);
    }
  };

  if (!isOpen) return null;

  const isDeposit = docType === 'deposit';
  const themeColor = isDeposit ? '#16a34a' : '#2563eb';
  const themeLight = isDeposit ? '#f0fdf4' : '#eff6ff';
  const themeBorder = isDeposit ? '#bbf7d0' : '#bfdbfe';
  const selectedCount = selectedSiteNames.size;
  const totalCount = normalizedSites.length;
  const isAllSelected = selectedCount === totalCount && totalCount > 0;

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        {/* 모달 헤더 */}
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {isDeposit ? <FileCheck size={20} color={themeColor} /> : <FileText size={20} color={themeColor} />}
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                Drive {isDeposit ? '입금표' : '계산서'} 월별·현장별 선택 다운로드
              </h3>
              <span style={{ fontSize: '11px', color: '#64748b' }}>
                원하는 연월과 현장을 골라 개별 파일 또는 ZIP 압축으로 즉시 다운로드합니다.
              </span>
            </div>
          </div>
          <button onClick={onClose} style={closeBtnStyle} disabled={isDownloading}>
            <X size={18} />
          </button>
        </div>

        {/* 상단 2개 드롭다운 선택 영역 */}
        <div style={{ padding: '14px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
          {/* 드롭다운 1: 문서 구분 */}
          <div style={{ flex: 1, minWidth: '180px' }}>
            <label style={labelStyle}>1. 문서 구분</label>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              disabled={isDownloading}
              style={{ ...selectStyle, borderColor: themeBorder, background: '#ffffff' }}
            >
              <option value="invoice">📑 계산서 (매입 / 매출)</option>
              <option value="deposit">🧾 입금표 (1페이지 4분할)</option>
            </select>
          </div>

          {/* 드롭다운 2: 다운로드 대상 월 */}
          <div style={{ flex: 1, minWidth: '180px' }}>
            <label style={labelStyle}>2. 다운로드 대상 월</label>
            <select
              value={targetYm}
              onChange={(e) => setTargetYm(e.target.value)}
              disabled={isDownloading}
              style={{ ...selectStyle, borderColor: themeBorder, background: '#ffffff' }}
            >
              {ymOptions.map((opt) => (
                <option key={opt.ym} value={opt.ym}>
                  📅 {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 현장 선택 헤더 바 (검색 + 전체 선택/해제 + 선택 카운트) */}
        <div style={{ padding: '10px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', background: '#ffffff' }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: '280px' }}>
            <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder="현장명 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              disabled={isDownloading}
              style={searchInputStyle}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', cursor: 'pointer', color: '#94a3b8', padding: 0 }}
              >
                <X size={13} />
              </button>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={isAllSelected ? handleDeselectAll : handleSelectAll}
              disabled={isDownloading}
              style={btnToggleAllStyle}
            >
              {isAllSelected ? <CheckSquare size={14} color={themeColor} /> : <Square size={14} color="#64748b" />}
              <span>{isAllSelected ? '전체 해제' : '전체 선택'}</span>
            </button>
            <span style={{ fontSize: '12px', fontWeight: 800, color: selectedCount > 0 ? themeColor : '#94a3b8' }}>
              {selectedCount}개 현장 선택됨 / 총 {totalCount}개
            </span>
          </div>
        </div>

        {/* 현장 체크박스 리스트 영역 */}
        <div style={listContainerStyle}>
          {filteredSites.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
              검색된 현장이 없습니다.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '8px' }}>
              {filteredSites.map((site) => {
                const isChecked = selectedSiteNames.has(site.name);
                return (
                  <div
                    key={site.id || site.name}
                    onClick={() => !isDownloading && handleToggleSite(site.name)}
                    style={{
                      padding: '8px 10px',
                      borderRadius: '8px',
                      border: isChecked ? `1.5px solid ${themeColor}` : '1px solid #e2e8f0',
                      background: isChecked ? themeLight : '#ffffff',
                      cursor: isDownloading ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      userSelect: 'none',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleToggleSite(site.name)}
                      disabled={isDownloading}
                      style={{ cursor: 'pointer', accentColor: themeColor }}
                    />
                    <span style={{ fontSize: '12px', fontWeight: isChecked ? 800 : 600, color: isChecked ? '#0f172a' : '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {site.name}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 상태/에러 메시지 배너 */}
        {errorMessage && (
          <div style={{ padding: '8px 20px', background: '#fef2f2', borderTop: '1px solid #fecaca', color: '#dc2626', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <AlertCircle size={15} />
            <span>{errorMessage}</span>
          </div>
        )}
        {statusMessage && !errorMessage && (
          <div style={{ padding: '8px 20px', background: themeLight, borderTop: `1px solid ${themeBorder}`, color: themeColor, fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            {isDownloading ? <Loader2 size={15} className="spin" /> : <CheckCircle2 size={15} />}
            <span>{statusMessage}</span>
          </div>
        )}

        {/* 하단 버튼 및 안내 영역 */}
        <div style={footerStyle}>
          <div style={{ fontSize: '11px', color: '#64748b' }}>
            {selectedCount === 1 ? (
              <span>💡 1개 현장 선택: <strong>개별 파일 직접 다운로드</strong> + 바탕화면 자동 저장</span>
            ) : selectedCount >= 2 ? (
              <span>💡 2개 이상 현장: <strong>ZIP 압축파일 1개로 즉시 다운로드</strong> + 바탕화면 자동 저장</span>
            ) : (
              <span>다운로드할 현장을 선택해 주세요.</span>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={onClose} style={btnCancelStyle} disabled={isDownloading}>
              취소
            </button>
            <button
              onClick={handleDownload}
              disabled={isDownloading || selectedCount === 0}
              style={{
                ...btnDownloadStyle,
                background: selectedCount === 0 ? '#94a3b8' : themeColor,
                cursor: selectedCount === 0 || isDownloading ? 'not-allowed' : 'pointer',
              }}
            >
              {isDownloading ? (
                <>
                  <Loader2 size={15} className="spin" /> 다운로드 중...
                </>
              ) : selectedCount === 1 ? (
                <>
                  <Download size={15} /> {Array.from(selectedSiteNames)[0]} 개별 다운로드
                </>
              ) : (
                <>
                  <Download size={15} /> 선택한 {selectedCount}개 현장 ZIP 다운로드
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const overlayStyle = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(15, 23, 42, 0.65)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1100,
  backdropFilter: 'blur(4px)',
};

const modalStyle = {
  width: '740px',
  maxWidth: '94vw',
  maxHeight: '85vh',
  backgroundColor: '#ffffff',
  borderRadius: '16px',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
};

const headerStyle = {
  padding: '16px 20px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  borderBottom: '1px solid #e2e8f0',
};

const closeBtnStyle = {
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  color: '#64748b',
};

const labelStyle = {
  display: 'block',
  fontSize: '11px',
  fontWeight: 700,
  color: '#475569',
  marginBottom: '5px',
};

const selectStyle = {
  width: '100%',
  height: '36px',
  padding: '0 10px',
  borderRadius: '8px',
  border: '1.5px solid #cbd5e1',
  fontSize: '13px',
  fontWeight: 700,
  color: '#0f172a',
  outline: 'none',
  boxSizing: 'border-box',
};

const searchInputStyle = {
  width: '100%',
  height: '32px',
  padding: '0 26px 0 30px',
  borderRadius: '6px',
  border: '1px solid #cbd5e1',
  fontSize: '12px',
  outline: 'none',
  boxSizing: 'border-box',
};

const btnToggleAllStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '5px',
  padding: '4px 8px',
  borderRadius: '6px',
  border: '1px solid #cbd5e1',
  background: '#f8fafc',
  fontSize: '11px',
  fontWeight: 700,
  color: '#334155',
  cursor: 'pointer',
};

const listContainerStyle = {
  flex: 1,
  minHeight: '220px',
  maxHeight: '340px',
  overflowY: 'auto',
  padding: '12px 20px',
  background: '#f8fafc',
};

const footerStyle = {
  padding: '14px 20px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  borderTop: '1px solid #e2e8f0',
  background: '#ffffff',
};

const btnCancelStyle = {
  padding: '8px 16px',
  borderRadius: '8px',
  border: '1px solid #cbd5e1',
  background: '#f1f5f9',
  color: '#475569',
  fontSize: '12px',
  fontWeight: 700,
  cursor: 'pointer',
};

const btnDownloadStyle = {
  padding: '8px 18px',
  borderRadius: '8px',
  border: 'none',
  color: '#ffffff',
  fontSize: '12px',
  fontWeight: 800,
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  transition: 'background 0.15s ease',
};

export default DriveDocDownloadModal;

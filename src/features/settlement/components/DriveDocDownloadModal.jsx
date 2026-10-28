import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { X, Download, Search, CheckSquare, Square, Loader2, FileText, FileCheck, CheckCircle2, AlertCircle, Terminal } from 'lucide-react';
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

function formatNowTime() {
  const d = new Date();
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, '0'))
    .join(':');
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
  const [selectedSiteNames, setSelectedSiteNames] = useState(() => new Set());
  const [isDownloading, setIsDownloading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [diagLogs, setDiagLogs] = useState([]);

  const wasOpenRef = useRef(false);
  const initializedSitesRef = useRef(false);

  const appendLog = useCallback((msg) => {
    setDiagLogs((prev) => [`[${formatNowTime()}] ${msg}`, ...prev.slice(0, 49)]);
  }, []);

  // 현장 목록 정규화 (중복 제거 및 가나다순 정렬)
  const normalizedSites = useMemo(() => {
    if (!Array.isArray(sites)) return [];
    const seen = new Set();
    const list = [];
    for (const s of sites) {
      const name = typeof s === 'string' ? s.trim() : String(s?.site_name || s?.name || s?.id || '').trim();
      const id = typeof s === 'string' ? name : String(s?.id || s?.site_id || name).trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      list.push({ id, name });
    }
    return list.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }, [sites]);

  // 모달이 닫혔다가 열릴 때만 1회 초기화 (리렌더링 시 선택 상태 초기화 방지)
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      wasOpenRef.current = true;
      const nextDocType = initialDocType || 'invoice';
      setDocType(nextDocType);
      setTargetYm(defaultYm);
      setSearchQuery('');
      setErrorMessage('');
      setStatusMessage('');
      const allNames = new Set(normalizedSites.map((s) => s.name));
      setSelectedSiteNames(allNames);
      initializedSitesRef.current = allNames.size > 0;
      setDiagLogs([
        `[${formatNowTime()}] 다운로드 창 열림 — 문서: ${nextDocType === 'deposit' ? '입금표' : '계산서'}, 대상월: ${defaultYm}, 전체 ${allNames.size}개 현장 기본 선택됨`,
      ]);
    } else if (!isOpen && wasOpenRef.current) {
      wasOpenRef.current = false;
      initializedSitesRef.current = false;
    }
  }, [isOpen, initialDocType, defaultYm, normalizedSites]);

  // 모달 오픈 직후 비동기로 현장 목록이 도착한 경우 1회만 전체 선택 반영
  useEffect(() => {
    if (isOpen && !initializedSitesRef.current && normalizedSites.length > 0) {
      initializedSitesRef.current = true;
      const allNames = new Set(normalizedSites.map((s) => s.name));
      setSelectedSiteNames(allNames);
      appendLog(`현장 목록 로드 완료 (${allNames.size}개 현장 전체 선택됨)`);
    }
  }, [isOpen, normalizedSites, appendLog]);

  const filteredSites = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return normalizedSites;
    return normalizedSites.filter((s) => s.name.toLowerCase().includes(q));
  }, [normalizedSites, searchQuery]);

  const handleToggleSite = useCallback((siteName) => {
    setSelectedSiteNames((prev) => {
      const next = new Set(prev);
      const willSelect = !next.has(siteName);
      if (willSelect) {
        next.add(siteName);
      } else {
        next.delete(siteName);
      }
      appendLog(`현장 개별 ${willSelect ? '선택' : '해제'}: ${siteName} (현재 ${next.size}개 선택됨)`);
      return next;
    });
  }, [appendLog]);

  const handleSelectAll = useCallback(() => {
    const allNames = new Set(normalizedSites.map((s) => s.name));
    setSelectedSiteNames(allNames);
    appendLog(`전체 선택 실행 (${allNames.size}개 현장 모두 선택됨)`);
  }, [normalizedSites, appendLog]);

  const handleDeselectAll = useCallback(() => {
    setSelectedSiteNames(new Set());
    appendLog('전체 해제 실행 (선택된 현장 0개)');
  }, [appendLog]);

  const handleDocTypeChange = (nextType) => {
    setDocType(nextType);
    appendLog(`문서 구분 변경 -> ${nextType === 'deposit' ? '입금표' : '계산서 (매입/매출)'}`);
  };

  const handleTargetYmChange = (nextYm) => {
    setTargetYm(nextYm);
    appendLog(`다운로드 대상 월 변경 -> ${nextYm}`);
  };

  const handleDownload = async () => {
    if (selectedSiteNames.size === 0) {
      alert('다운로드할 현장을 최소 1개 이상 선택해 주세요.');
      return;
    }

    setIsDownloading(true);
    setErrorMessage('');
    const siteList = Array.from(selectedSiteNames);
    const docLabel = docType === 'deposit' ? '입금표' : '계산서';
    setStatusMessage('구글 드라이브에서 파일을 검색하고 다운로드 준비 중입니다...');
    appendLog(`다운로드 시작 요청 — 문서: ${docLabel}, 대상월: ${targetYm}, 선택 현장(${siteList.length}개): ${siteList.join(', ')}`);

    try {
      if (siteList.length === 1) {
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

        for (const file of result.files) {
          downloadBase64File(file.base64, file.name, file.mimeType);
        }

        const msg = `${singleSite}의 ${result.files.length}개 ${docLabel} 다운로드 완료! (바탕화면 점검준비 폴더에도 저장됨)`;
        setStatusMessage(msg);
        appendLog(`성공: ${msg}`);
        alert(msg);
      } else {
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

        const msg = `${siteList.length}개 현장의 ${docLabel} ZIP 압축 다운로드 완료! (바탕화면 점검준비 폴더에도 저장됨)`;
        setStatusMessage(msg);
        appendLog(`성공: ${msg}`);
        alert(msg);
      }
    } catch (err) {
      console.error('[DriveDocDownloadModal] 다운로드 실패:', err);
      const errMsg = err.message || '다운로드 중 오류가 발생했습니다.';
      setErrorMessage(errMsg);
      setStatusMessage('');
      appendLog(`오류: ${errMsg}`);
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
                문서 구분, 대상 월, 현장을 개별 선택/해제하여 개별 파일(1개 현장) 또는 ZIP 압축(2개 이상)으로 다운로드합니다.
              </span>
            </div>
          </div>
          <button type="button" onClick={onClose} style={closeBtnStyle} disabled={isDownloading}>
            <X size={18} />
          </button>
        </div>

        {/* 상단 2개 드롭다운 선택 영역 */}
        <div style={{ padding: '12px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '180px' }}>
            <label style={labelStyle}>1. 문서 구분</label>
            <select
              value={docType}
              onChange={(e) => handleDocTypeChange(e.target.value)}
              disabled={isDownloading}
              style={{ ...selectStyle, borderColor: themeBorder, background: '#ffffff' }}
            >
              <option value="invoice">📑 계산서 (매입 / 매출)</option>
              <option value="deposit">🧾 입금표 (1페이지 4분할)</option>
            </select>
          </div>

          <div style={{ flex: 1, minWidth: '180px' }}>
            <label style={labelStyle}>2. 다운로드 대상 월</label>
            <select
              value={targetYm}
              onChange={(e) => handleTargetYmChange(e.target.value)}
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

        {/* 현장 선택 헤더 바 */}
        <div style={{ padding: '10px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', background: '#ffffff', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '180px', maxWidth: '260px' }}>
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
                type="button"
                onClick={() => setSearchQuery('')}
                style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', cursor: 'pointer', color: '#94a3b8', padding: 0 }}
              >
                <X size={13} />
              </button>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              onClick={handleSelectAll}
              disabled={isDownloading || isAllSelected}
              style={{ ...btnToggleAllStyle, opacity: isAllSelected ? 0.5 : 1 }}
            >
              <CheckSquare size={14} color={themeColor} />
              <span>전체 선택</span>
            </button>
            <button
              type="button"
              onClick={handleDeselectAll}
              disabled={isDownloading || selectedCount === 0}
              style={{ ...btnToggleAllStyle, opacity: selectedCount === 0 ? 0.5 : 1 }}
            >
              <Square size={14} color="#64748b" />
              <span>전체 해제</span>
            </button>
            <span style={{ fontSize: '12px', fontWeight: 800, color: selectedCount > 0 ? themeColor : '#94a3b8', marginLeft: '4px' }}>
              {selectedCount}개 선택됨 / 총 {totalCount}개
            </span>
          </div>
        </div>

        {/* 현장 체크박스 리스트 영역 (이중 이벤트 버블링 완전 제거) */}
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
                  <button
                    key={site.id || site.name}
                    type="button"
                    disabled={isDownloading}
                    onClick={() => handleToggleSite(site.name)}
                    style={{
                      padding: '9px 10px',
                      borderRadius: '8px',
                      border: isChecked ? `1.5px solid ${themeColor}` : '1px solid #cbd5e1',
                      background: isChecked ? themeLight : '#ffffff',
                      cursor: isDownloading ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      userSelect: 'none',
                      textAlign: 'left',
                      width: '100%',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      readOnly
                      tabIndex={-1}
                      style={{ pointerEvents: 'none', accentColor: themeColor, width: '15px', height: '15px', margin: 0, flexShrink: 0 }}
                    />
                    <span style={{ fontSize: '12px', fontWeight: isChecked ? 800 : 600, color: isChecked ? '#0f172a' : '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {site.name}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 실시간 진단 로그 영역 */}
        <div style={{ padding: '8px 20px', background: '#0f172a', color: '#e2e8f0', borderTop: '1px solid #334155', fontSize: '11px', maxHeight: '78px', overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#38bdf8', fontWeight: 700, marginBottom: '3px' }}>
            <Terminal size={12} />
            <span>진단 로그 (선택/해제 및 다운로드 상태 실시간 표시)</span>
          </div>
          {diagLogs.map((log, idx) => (
            <div key={idx} style={{ lineHeight: 1.4, color: idx === 0 ? '#fde047' : '#94a3b8', fontFamily: 'monospace' }}>
              {log}
            </div>
          ))}
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
              <span>다운로드할 현장을 클릭하여 선택해 주세요.</span>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" onClick={onClose} style={btnCancelStyle} disabled={isDownloading}>
              닫기
            </button>
            <button
              type="button"
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
  maxHeight: '88vh',
  backgroundColor: '#ffffff',
  borderRadius: '16px',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
};

const headerStyle = {
  padding: '14px 20px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  borderBottom: '1px solid #e2e8f0',
};

const closeBtnStyle = { border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b' };
const labelStyle = { display: 'block', fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '4px' };
const selectStyle = { width: '100%', height: '36px', padding: '0 10px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '13px', fontWeight: 700, color: '#0f172a', outline: 'none', boxSizing: 'border-box' };
const searchInputStyle = { width: '100%', height: '32px', padding: '0 26px 0 30px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none', boxSizing: 'border-box' };
const btnToggleAllStyle = { display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#f8fafc', fontSize: '11px', fontWeight: 700, color: '#334155', cursor: 'pointer' };
const listContainerStyle = { flex: 1, minHeight: '200px', maxHeight: '300px', overflowY: 'auto', padding: '12px 20px', background: '#f8fafc' };
const footerStyle = { padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #e2e8f0', background: '#ffffff' };
const btnCancelStyle = { padding: '8px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#f1f5f9', color: '#475569', fontSize: '12px', fontWeight: 700, cursor: 'pointer' };
const btnDownloadStyle = { padding: '8px 18px', borderRadius: '8px', border: 'none', color: '#ffffff', fontSize: '12px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px', transition: 'background 0.15s ease' };

export default DriveDocDownloadModal;

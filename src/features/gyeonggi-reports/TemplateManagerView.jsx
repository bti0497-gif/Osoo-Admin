import React, { useState, useEffect, useCallback } from 'react';
import { FileSpreadsheet, Upload, Download, RefreshCw, CheckCircle2, AlertCircle, RotateCcw, Plus, Folder, FileCheck } from 'lucide-react';
import { getApiBase } from '../../core/api/serverConfig.js';

const adminHeaders = () => {
  const token = localStorage.getItem('token');
  const role = localStorage.getItem('role');
  const name = localStorage.getItem('name');
  return {
    'Authorization': token ? `Bearer ${token}` : '',
    'X-User-Role': role || '',
    'X-User-Name': name || '',
  };
};

export function TemplateManagerView() {
  const [reportTemplates, setReportTemplates] = useState([]);
  const [extraTemplates, setExtraTemplates] = useState([]);
  const [selectedId, setSelectedId] = useState('monthly_report');

  const [loading, setLoading] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [resetting, setResetting] = useState(false);

  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // 템플릿 목록 로드
  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch(`${getApiBase()}/api/gyeonggi/templates`, {
        headers: adminHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const rList = data.reportTemplates || [];
      const eList = data.extraTemplates || [];
      setReportTemplates(rList);
      setExtraTemplates(eList);

      // 선택 상태 유지
      const all = [...rList, ...eList];
      if (all.length > 0 && !all.some(t => t.id === selectedId)) {
        setSelectedId(all[0].id);
      }
    } catch (err) {
      setErrorMsg(err.message || '양식 목록 로드 실패');
      console.error('양식 로드 실패:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const allTemplates = [...reportTemplates, ...extraTemplates];
  const activeTemplate = allTemplates.find(t => t.id === selectedId) || allTemplates[0] || null;

  // 새 양식 파일로 교체 업로드
  const handleReplaceFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !activeTemplate) return;

    setReplacing(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const formData = new FormData();
      formData.append('targetFilename', activeTemplate.filename);
      formData.append('file', file);

      const res = await fetch(`${getApiBase()}/api/gyeonggi/templates/replace`, {
        method: 'POST',
        headers: adminHeaders(),
        body: formData,
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `HTTP ${res.status}`);
      }

      const result = await res.json();
      setSuccessMsg(result.message || `'${activeTemplate.filename}' 양식이 성공적으로 교체되었습니다.`);
      await loadTemplates();
    } catch (err) {
      setErrorMsg(err.message || '양식 파일 교체 실패');
      console.error('양식 교체 실패:', err);
    } finally {
      setReplacing(false);
      e.target.value = '';
    }
  };

  // 원본 기본 양식으로 원복
  const handleResetToDefault = async () => {
    if (!activeTemplate) return;
    if (!confirm(`'${activeTemplate.displayName}' 양식을 번들 원본 기본 양식으로 원복하시겠습니까?`)) return;

    setResetting(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await fetch(`${getApiBase()}/api/gyeonggi/templates/reset`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...adminHeaders(),
        },
        body: JSON.stringify({ filename: activeTemplate.filename }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || `HTTP ${res.status}`);
      }

      const result = await res.json();
      setSuccessMsg(result.message || `'${activeTemplate.filename}' 양식이 기본 양식으로 원복되었습니다.`);
      await loadTemplates();
    } catch (err) {
      setErrorMsg(err.message || '원복 실패');
      console.error('원복 실패:', err);
    } finally {
      setResetting(false);
    }
  };

  // 다운로드
  const handleDownload = (filename) => {
    if (!filename) return;
    window.open(`${getApiBase()}/api/gyeonggi/templates/${encodeURIComponent(filename)}/download`, '_blank');
  };

  const formatFileSize = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (isoString) => {
    if (!isoString) return '-';
    const d = new Date(isoString);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  return (
    <div style={{
      padding: '16px 20px',
      height: '100%',
      display: 'flex',
      gap: '16px',
      boxSizing: 'border-box',
      overflow: 'hidden',
      fontFamily: "'Outfit', 'Inter', -apple-system, sans-serif"
    }}>
      {/* ── 좌측 패널: 출력 양식 목록 (260px 고정) ── */}
      <div style={{
        width: '260px',
        flexShrink: 0,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: '#ffffff',
        border: '1.5px solid #e2e8f0',
        borderRadius: '14px',
        padding: '16px',
        boxSizing: 'border-box',
        boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
      }}>
        {/* 패널 헤더 */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '14px',
          paddingBottom: '10px',
          borderBottom: '1px solid #f1f5f9'
        }}>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: '#1e293b' }}>
            출력 양식 목록
          </h3>
          <button
            onClick={loadTemplates}
            disabled={loading}
            title="새로고침"
            style={{
              padding: '4px 8px',
              borderRadius: '6px',
              background: '#f8fafc',
              border: '1px solid #cbd5e1',
              color: '#64748b',
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '11px',
              fontWeight: '700'
            }}
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* 양식 아이템 스크롤 목록 */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontSize: '11px', fontWeight: '800', color: '#94a3b8', paddingLeft: '4px', textTransform: 'uppercase' }}>
            기본 보고서 양식
          </div>
          {reportTemplates.map((item) => {
            const isSelected = activeTemplate?.id === item.id;
            return (
              <div
                key={item.id}
                onClick={() => setSelectedId(item.id)}
                style={{
                  padding: '12px 14px',
                  borderRadius: '10px',
                  background: isSelected ? 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)' : '#f8fafc',
                  border: isSelected ? '1.5px solid #3b82f6' : '1px solid #e2e8f0',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: isSelected ? '0 2px 6px rgba(59, 130, 246, 0.15)' : 'none'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <FileSpreadsheet size={16} style={{ color: isSelected ? '#2563eb' : '#64748b' }} />
                  <span style={{ fontSize: '13px', fontWeight: isSelected ? '800' : '600', color: isSelected ? '#1e40af' : '#334155' }}>
                    {item.displayName}
                  </span>
                </div>
                <div style={{ fontSize: '11px', color: isSelected ? '#3b82f6' : '#94a3b8', paddingLeft: '24px' }}>
                  {item.filename}
                </div>
              </div>
            );
          })}

          {extraTemplates.length > 0 && (
            <>
              <div style={{ fontSize: '11px', fontWeight: '800', color: '#94a3b8', paddingLeft: '4px', marginTop: '12px', textTransform: 'uppercase' }}>
                사용자 지정 양식
              </div>
              {extraTemplates.map((item) => {
                const isSelected = activeTemplate?.id === item.id;
                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedId(item.id)}
                    style={{
                      padding: '12px 14px',
                      borderRadius: '10px',
                      background: isSelected ? 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)' : '#f8fafc',
                      border: isSelected ? '1.5px solid #3b82f6' : '1px solid #e2e8f0',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <FileSpreadsheet size={16} style={{ color: isSelected ? '#2563eb' : '#64748b' }} />
                      <span style={{ fontSize: '13px', fontWeight: isSelected ? '800' : '600', color: isSelected ? '#1e40af' : '#334155' }}>
                        {item.displayName}
                      </span>
                    </div>
                    <div style={{ fontSize: '11px', color: isSelected ? '#3b82f6' : '#94a3b8', paddingLeft: '24px' }}>
                      {item.filename}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* 패널 하단: 새 양식 추가 버튼 (향후 확장 대비, 현재 비활성화) */}
        <div style={{ paddingTop: '12px', borderTop: '1px solid #f1f5f9', marginTop: 'auto' }}>
          <button
            disabled={true}
            title="새 양식 추가 기능은 향후 업데이트될 예정입니다."
            style={{
              width: '100%',
              padding: '10px',
              borderRadius: '8px',
              background: '#f1f5f9',
              border: '1.5px dashed #cbd5e1',
              color: '#94a3b8',
              fontSize: '12px',
              fontWeight: '700',
              cursor: 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
          >
            <Plus size={14} />
            <span>새 양식 추가</span>
          </button>
        </div>
      </div>

      {/* ── 우측 패널: 선택된 양식 상세 및 파일 교체 (Flex 1) ── */}
      <div style={{
        flex: 1,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: '#ffffff',
        border: '1.5px solid #e2e8f0',
        borderRadius: '14px',
        padding: '24px',
        boxSizing: 'border-box',
        overflowY: 'auto',
        boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
      }}>
        {activeTemplate ? (
          <>
            {/* 타이틀 및 헤더 설명 */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '800', color: '#1e3a8a' }}>
                  {activeTemplate.displayName}
                </h2>
                <span style={{
                  padding: '3px 8px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: '700',
                  background: '#eff6ff',
                  color: '#2563eb',
                  border: '1px solid #bfdbfe'
                }}>
                  {activeTemplate.category || '출력 양식'}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '13px', color: '#64748b', lineHeight: 1.5 }}>
                {activeTemplate.description || '선택한 보고서의 엑셀 출력 기본 양식입니다.'}
              </p>
            </div>

            {/* 알림 메시지 배너 */}
            {successMsg && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '12px 16px',
                borderRadius: '8px',
                marginBottom: '16px',
                fontSize: '13px',
                fontWeight: '700',
                background: '#ecfdf5',
                border: '1.5px solid #a7f3d0',
                color: '#065f46'
              }}>
                <CheckCircle2 size={16} />
                <span>{successMsg}</span>
              </div>
            )}
            {errorMsg && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '12px 16px',
                borderRadius: '8px',
                marginBottom: '16px',
                fontSize: '13px',
                fontWeight: '700',
                background: '#fef2f2',
                border: '1.5px solid #fca5a5',
                color: '#991b1b'
              }}>
                <AlertCircle size={16} />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* 현재 저장 및 적용 중인 엑셀 파일 메타 카드 */}
            <div style={{
              background: '#f8fafc',
              border: '1.5px solid #e2e8f0',
              borderRadius: '12px',
              padding: '18px 20px',
              marginBottom: '24px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FileCheck size={18} style={{ color: '#16a34a' }} />
                  <span style={{ fontSize: '14px', fontWeight: '800', color: '#1e293b' }}>
                    현재 적용 중인 양식 파일
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => handleDownload(activeTemplate.filename)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '6px',
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      color: '#334155',
                      fontSize: '12px',
                      fontWeight: '700',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <Download size={13} style={{ color: '#2563eb' }} />
                    <span>양식 파일 다운로드</span>
                  </button>

                  <button
                    onClick={handleResetToDefault}
                    disabled={resetting}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '6px',
                      background: '#ffffff',
                      border: '1px solid #fca5a5',
                      color: '#dc2626',
                      fontSize: '12px',
                      fontWeight: '700',
                      cursor: resetting ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <RotateCcw size={13} className={resetting ? 'animate-spin' : ''} />
                    <span>{resetting ? '원복 중...' : '기본 양식으로 복원'}</span>
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', fontSize: '13px' }}>
                <div>
                  <span style={{ color: '#64748b', fontSize: '11px', display: 'block', fontWeight: '600' }}>대상 파일명</span>
                  <span style={{ fontWeight: '700', color: '#0f172a' }}>{activeTemplate.filename}</span>
                </div>
                <div>
                  <span style={{ color: '#64748b', fontSize: '11px', display: 'block', fontWeight: '600' }}>파일 크기</span>
                  <span style={{ fontWeight: '700', color: '#0f172a' }}>{formatFileSize(activeTemplate.size)}</span>
                </div>
                <div>
                  <span style={{ color: '#64748b', fontSize: '11px', display: 'block', fontWeight: '600' }}>최종 업데이트 일시</span>
                  <span style={{ fontWeight: '700', color: '#0f172a' }}>{formatDate(activeTemplate.modifiedAt)}</span>
                </div>
              </div>
            </div>

            {/* 양식 교체 드롭존 영역 */}
            <div style={{
              flex: 1,
              minHeight: '160px',
              border: '2px dashed #3b82f6',
              borderRadius: '14px',
              background: '#f0f9ff',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              textAlign: 'center',
              position: 'relative'
            }}>
              <Upload size={36} style={{ color: '#2563eb', marginBottom: '12px' }} />
              <h4 style={{ margin: '0 0 6px 0', fontSize: '15px', fontWeight: '800', color: '#1e3a8a' }}>
                새 엑셀(.xlsx) 파일로 양식 교체하기
              </h4>
              <p style={{ margin: '0 0 16px 0', fontSize: '12px', color: '#64748b' }}>
                새 양식 파일을 선택하거나 이 영역으로 드래그해 오시면, 앱 데이터 관리 경로에 <strong>{activeTemplate.filename}</strong>(으)로 덮어쓰기 복사됩니다.
              </p>

              <label style={{
                padding: '10px 24px',
                borderRadius: '8px',
                background: '#2563eb',
                color: '#ffffff',
                fontSize: '13px',
                fontWeight: '700',
                cursor: replacing ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 2px 6px rgba(37, 99, 235, 0.3)',
                opacity: replacing ? 0.7 : 1
              }}>
                <Upload size={14} />
                <span>{replacing ? '양식 파일 교체 처리 중...' : '컴퓨터에서 새 엑셀 파일 선택'}</span>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  disabled={replacing}
                  onChange={handleReplaceFile}
                  style={{ display: 'none' }}
                />
              </label>
            </div>

            <div style={{ marginTop: '16px', fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Folder size={13} />
              <span>관리 저장 위치: <code>%APPDATA%/Osoo-Admin/templates/gyeonggi/</code></span>
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: '#94a3b8' }}>
            좌측에서 관리할 출력 양식을 선택해 주세요.
          </div>
        )}
      </div>
    </div>
  );
}

export default TemplateManagerView;

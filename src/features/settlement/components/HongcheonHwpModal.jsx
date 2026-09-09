import React, { useState, useEffect, useRef } from 'react';
import { Upload, X, CheckCircle, FileText, AlertCircle, Loader2, Image as ImageIcon } from 'lucide-react';
import { getApiBase } from '../../../core/api/serverConfig';

/**
 * 홍천휴게소(양양방향) 한글 정산서 작성 전용 증빙 업로드 모달
 * - 청소필증 (135 × 100 mm)
 * - 반출사진 (135 × 100 mm)
 * - 계산서 & 성적서 4장 상태 진단 및 누락 경고 노출
 */
export function HongcheonHwpModal({ isOpen, onClose, year, month, onGenerate, isGenerating }) {
  const [evidenceStatus, setEvidenceStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploadingSlot, setUploadingSlot] = useState(null);
  const [dragOverSlot, setDragOverSlot] = useState(null);

  const fileInputRefs = {
    cleanCert: useRef(null),
    sludgePhoto: useRef(null),
  };

  // 모달 오픈 시 또는 연월 변경 시 증빙 상태 조회
  const fetchStatus = async () => {
    if (!isOpen) return;
    setLoading(true);
    try {
      const res = await fetch(`${getApiBase()}/api/settlement/hongcheon/status?year=${year}&month=${month}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.success) {
        setEvidenceStatus(data);
      }
    } catch (err) {
      console.error('[HongcheonHwpModal] 증빙 상태 조회 오류:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, [isOpen, year, month]);

  if (!isOpen) return null;

  const SLOTS = [
    {
      key: 'cleanCert',
      title: '1. 분뇨/슬러지 청소필증',
      spec: '135 × 100 mm',
      desc: '당월 슬러지 청소 및 처리 필증 이미지',
      color: '#0284c7',
      bgLight: '#f0f9ff',
      borderColor: '#bae6fd',
      currentFile: evidenceStatus?.cleanCert,
      previewUrl: evidenceStatus?.cleanCertPreview ? `${getApiBase()}${evidenceStatus.cleanCertPreview}` : null,
    },
    {
      key: 'sludgePhoto',
      title: '2. 슬러지 반출 사진',
      spec: '135 × 100 mm',
      desc: '슬러지 흡입 및 반출 현장 사진',
      color: '#059669',
      bgLight: '#ecfdf5',
      borderColor: '#a7f3d0',
      currentFile: evidenceStatus?.sludgePhoto,
      previewUrl: evidenceStatus?.sludgePhotoPreview ? `${getApiBase()}${evidenceStatus.sludgePhotoPreview}` : null,
    },
  ];

  // 개별 파일 업로드 핸들러
  const handleFileUpload = async (slotKey, file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('이미지 파일(JPG, PNG 등)만 등록 가능합니다.');
      return;
    }

    setUploadingSlot(slotKey);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('year', String(year));
      formData.append('month', String(month));
      formData.append('type', slotKey);

      const res = await fetch(`${getApiBase()}/api/settlement/hongcheon/upload-evidence`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || '이미지 업로드에 실패했습니다.');
      }

      // 상태 즉시 갱신
      if (data.status) {
        setEvidenceStatus(data.status);
      } else {
        await fetchStatus();
      }
    } catch (err) {
      alert(`업로드 오류: ${err.message}`);
    } finally {
      setUploadingSlot(null);
    }
  };

  // 둘 다 저장되었는지 판별
  const hasCleanCert = Boolean(evidenceStatus?.cleanCert);
  const hasSludgePhoto = Boolean(evidenceStatus?.sludgePhoto);
  const isBothReady = hasCleanCert && hasSludgePhoto;

  // 필수 누락 항목 진단
  const missingItems = [];
  if (!evidenceStatus?.invoice) missingItems.push('매출/용역 계산서');
  if (!evidenceStatus?.certs || evidenceStatus.certs.length === 0) missingItems.push('수질 검사 성적서');

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 10000, padding: '20px'
    }}>
      <div style={{
        background: '#ffffff', borderRadius: '16px', width: '100%', maxWidth: '780px',
        maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
        display: 'flex', flexDirection: 'column'
      }}>
        
        {/* 헤더 */}
        <div style={{
          padding: '20px 24px', borderBottom: '1px solid #e2e8f0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'linear-gradient(to right, #f8fafc, #ffffff)'
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
              📝 홍천휴게소(양양방향) 한글 정산보고서 작성 및 증빙 관리
            </h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>
              {year}년 {month}월 정산서에 삽입될 청소필증과 반출사진을 등록하고, 누락된 증빙을 확인합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isGenerating}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b', padding: '4px', borderRadius: '6px' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* 바디 */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* 상태 요약 배너 */}
          <div style={{
            background: isBothReady ? '#f0fdf4' : '#eff6ff',
            border: `1px solid ${isBothReady ? '#bbf7d0' : '#bfdbfe'}`,
            borderRadius: '10px', padding: '14px 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {isBothReady ? (
                <CheckCircle size={20} color="#16a34a" />
              ) : (
                <AlertCircle size={20} color="#2563eb" />
              )}
              <span style={{ fontSize: '13.5px', fontWeight: 600, color: isBothReady ? '#15803d' : '#1e40af' }}>
                {isBothReady
                  ? '필수 증빙(청소필증, 반출사진)이 모두 등록되었습니다. 한글 정산보고서를 작성할 수 있습니다.'
                  : '청소필증과 반출사진을 모두 등록해야 한글 정산서 작성이 활성화됩니다.'}
              </span>
            </div>
            {loading && <Loader2 size={16} className="animate-spin" color="#64748b" />}
          </div>

          {/* 누락 경고 배너 (계산서 또는 성적서 부재 시) */}
          {missingItems.length > 0 && (
            <div style={{
              background: '#fffbeb', border: '1px solid #fde68a',
              borderRadius: '10px', padding: '12px 16px',
              display: 'flex', flexDirection: 'column', gap: '4px'
            }}>
              {missingItems.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#b45309', fontWeight: 600 }}>
                  <AlertCircle size={16} color="#d97706" />
                  ⚠️ {item} 이미지가 마감 폴더나 점검준비 폴더에 없습니다. (한글 작성 시 해당 책갈피는 건너뜁니다)
                </div>
              ))}
            </div>
          )}

          {/* 2대 필수 이미지 업로드 카드 (청소필증 / 반출사진) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
            {SLOTS.map((slot) => {
              const isUploading = uploadingSlot === slot.key;
              const isDrag = dragOverSlot === slot.key;
              const hasFile = Boolean(slot.currentFile);
              const fileName = hasFile ? slot.currentFile.split(/[\\/]/).pop() : '';

              return (
                <div
                  key={slot.key}
                  onDragOver={(e) => { e.preventDefault(); setDragOverSlot(slot.key); }}
                  onDragLeave={() => setDragOverSlot(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOverSlot(null);
                    if (e.dataTransfer.files?.[0]) {
                      handleFileUpload(slot.key, e.dataTransfer.files[0]);
                    }
                  }}
                  style={{
                    background: slot.bgLight,
                    border: `2px dashed ${isDrag ? slot.color : (hasFile ? '#22c55e' : slot.borderColor)}`,
                    borderRadius: '12px', padding: '18px',
                    display: 'flex', flexDirection: 'column', gap: '12px',
                    transition: 'all 0.2s ease',
                    position: 'relative'
                  }}
                >
                  <input
                    type="file"
                    ref={fileInputRefs[slot.key]}
                    onChange={(e) => {
                      if (e.target.files?.[0]) {
                        handleFileUpload(slot.key, e.target.files[0]);
                      }
                    }}
                    accept="image/*"
                    style={{ display: 'none' }}
                  />

                  {/* 카드 헤더 */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '14.5px', fontWeight: 700, color: '#0f172a' }}>
                        {slot.title}
                      </h4>
                      <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>
                        규격: {slot.spec}
                      </span>
                    </div>
                    {hasFile ? (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                        padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700,
                        background: '#dcfce7', color: '#15803d'
                      }}>
                        <CheckCircle size={13} /> 등록완료
                      </span>
                    ) : (
                      <span style={{
                        padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                        background: '#fee2e2', color: '#b91c1c'
                      }}>
                        미등록
                      </span>
                    )}
                  </div>

                  {/* 안내 문구 및 파일 정보 */}
                  <p style={{ margin: 0, fontSize: '12px', color: '#475569' }}>
                    {slot.desc}
                  </p>

                  {/* 이미지 썸네일 미리보기 박스 (140px 고정) */}
                  <div style={{
                    background: '#ffffff', borderRadius: '8px', padding: '8px',
                    border: '1px solid #e2e8f0', height: '150px',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    position: 'relative', overflow: 'hidden'
                  }}>
                    {isUploading ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', color: slot.color, fontSize: '12.5px', fontWeight: 600 }}>
                        <Loader2 size={24} className="animate-spin" />
                        <span>이미지 저장 및 정규 경로 반영 중...</span>
                      </div>
                    ) : hasFile ? (
                      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                          {slot.previewUrl ? (
                            <img
                              src={slot.previewUrl}
                              alt={slot.title}
                              style={{ maxWidth: '100%', maxHeight: '105px', objectFit: 'contain', borderRadius: '4px' }}
                              onError={(e) => {
                                e.target.style.display = 'none';
                                e.target.nextSibling.style.display = 'flex';
                              }}
                            />
                          ) : null}
                          <div style={{ display: slot.previewUrl ? 'none' : 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', color: '#16a34a' }}>
                            <ImageIcon size={36} />
                          </div>
                        </div>

                        {/* 하단 파일 정보 바 */}
                        <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #f1f5f9', paddingTop: '4px', fontSize: '11px' }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px', fontWeight: 600, color: '#334155' }} title={fileName}>
                            📄 {fileName}
                          </span>
                          <span style={{ color: '#15803d', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <CheckCircle size={12} /> 준비완료
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div
                        onClick={() => fileInputRefs[slot.key].current?.click()}
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', color: '#94a3b8', cursor: 'pointer', padding: '16px 0' }}
                      >
                        <Upload size={28} style={{ color: slot.color }} />
                        <span style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>
                          이미지 클릭 또는 드래그 업로드
                        </span>
                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                          JPG, PNG 형식 지원
                        </span>
                      </div>
                    )}
                  </div>

                  {/* 업로드/교체 버튼 */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'auto' }}>
                    <button
                      type="button"
                      onClick={() => fileInputRefs[slot.key].current?.click()}
                      disabled={isUploading || isGenerating}
                      style={{
                        padding: '6px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 600,
                        border: 'none', cursor: 'pointer',
                        background: hasFile ? '#475569' : slot.color, color: '#ffffff',
                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                        transition: 'opacity 0.15s'
                      }}
                    >
                      <Upload size={14} />
                      {hasFile ? '이미지 교체' : '파일 선택 업로드'}
                    </button>
                  </div>

                </div>
              );
            })}
          </div>


          {/* 추가 감지 증빙 요약 리스트 */}
          <div style={{
            background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px',
            padding: '14px 16px', fontSize: '12.5px', color: '#334155'
          }}>
            <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>
              📌 기타 자동 매칭 증빙 현황
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div>
                • <strong>계산서 (162×100mm):</strong>{' '}
                {evidenceStatus?.invoice ? (
                  <span style={{ color: '#16a34a', fontWeight: 600 }}>감지됨 ({evidenceStatus.invoice.split(/[\\/]/).pop()})</span>
                ) : (
                  <span style={{ color: '#dc2626', fontWeight: 600 }}>미발견</span>
                )}
              </div>
              <div>
                • <strong>성적서 4장 (각 54×64mm):</strong>{' '}
                {evidenceStatus?.certs?.length > 0 ? (
                  <span style={{ color: '#16a34a', fontWeight: 600 }}>{evidenceStatus.certs.length}장 감지됨</span>
                ) : (
                  <span style={{ color: '#dc2626', fontWeight: 600 }}>미발견</span>
                )}
              </div>
            </div>
          </div>

        </div>

        {/* 푸터 */}
        <div style={{
          padding: '16px 24px', borderTop: '1px solid #e2e8f0',
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px',
          background: '#f8fafc', borderBottomLeftRadius: '16px', borderBottomRightRadius: '16px'
        }}>
          <button
            type="button"
            onClick={onClose}
            disabled={isGenerating}
            style={{
              padding: '8px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
              border: '1px solid #cbd5e1', background: '#ffffff', color: '#475569', cursor: 'pointer'
            }}
          >
            닫기
          </button>
          <button
            type="button"
            onClick={() => onGenerate({
              cleanCert: evidenceStatus?.cleanCert,
              sludgePhoto: evidenceStatus?.sludgePhoto,
              invoice: evidenceStatus?.invoice,
              certs: evidenceStatus?.certs,
            })}
            disabled={!isBothReady || isGenerating}
            style={{
              padding: '8px 22px', borderRadius: '8px', fontSize: '13px', fontWeight: 700,
              border: 'none',
              cursor: isBothReady && !isGenerating ? 'pointer' : 'not-allowed',
              background: isBothReady ? '#2563eb' : '#94a3b8',
              color: '#ffffff',
              boxShadow: isBothReady ? '0 2px 6px rgba(37, 99, 235, 0.35)' : 'none',
              display: 'inline-flex', alignItems: 'center', gap: '8px'
            }}
          >
            {isGenerating ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                한글 정산보고서 작성 중...
              </>
            ) : (
              <>
                <FileText size={16} />
                홍천 한글 정산보고서 자동 작성하기
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}

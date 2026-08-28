import React, { useState, useRef } from 'react';
import { Upload, X, CheckCircle, FileText, AlertCircle, Loader2 } from 'lucide-react';
import { getApiBase } from '../../../core/api/serverConfig';

/**
 * 청주휴게소 3대 거래명세서(수질분석, 키트, 약품) 업로드 전용 모달
 */
export function CheongjuStatementUploadModal({ isOpen, onClose, year, month, onGenerate, isGenerating }) {
  const [statements, setStatements] = useState({
    waterQuality: null, // 수질검사(대신)
    kit: null,          // 수질분석키트(케이엠)
    chemical: null,     // 약품(에이치디이앤씨)
  });

  const [dragOverSlot, setDragOverSlot] = useState(null);

  const fileInputRefs = {
    waterQuality: useRef(null),
    kit: useRef(null),
    chemical: useRef(null),
  };

  // 모달 오픈 시 로컬 폴더에 이미 저장된 명세서 3종 자동 감지 및 프리필
  React.useEffect(() => {
    if (!isOpen) return;
    const fetchExisting = async () => {
      try {
        const targetYm = `${year}${String(month).padStart(2, '0')}`;
        const res = await fetch(`${getApiBase()}/api/settlement/cheongju-statements-status?targetYm=${targetYm}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.success && data.statements) {
          setStatements((prev) => ({
            waterQuality: prev.waterQuality || (data.statements.waterQuality?.exists ? {
              name: data.statements.waterQuality.fileName,
              path: data.statements.waterQuality.path,
              isExisting: true,
            } : null),
            kit: prev.kit || (data.statements.kit?.exists ? {
              name: data.statements.kit.fileName,
              path: data.statements.kit.path,
              isExisting: true,
            } : null),
            chemical: prev.chemical || (data.statements.chemical?.exists ? {
              name: data.statements.chemical.fileName,
              path: data.statements.chemical.path,
              isExisting: true,
            } : null),
          }));
        }
      } catch (_) {}
    };
    fetchExisting();
  }, [isOpen, year, month]);

  if (!isOpen) return null;

  const SLOTS = [
    {
      key: 'waterQuality',
      title: '1. 수질검사 거래명세서',
      vendor: '대신',
      spec: '85 × 50 mm',
      desc: '수질검사비 거래명세서 이미지',
      color: '#0284c7',
      bgLight: '#f0f9ff',
      borderColor: '#bae6fd',
    },
    {
      key: 'kit',
      title: '2. 수질분석 키트 거래명세서',
      vendor: '케이엠',
      spec: '85 × 50 mm',
      desc: '수질분석 키트 구입 거래명세서 이미지',
      color: '#059669',
      bgLight: '#ecfdf5',
      borderColor: '#a7f3d0',
    },
    {
      key: 'chemical',
      title: '3. 약품 거래명세서',
      vendor: '에이치디이앤씨',
      spec: '85 × 50 mm',
      desc: '약품비 거래명세서 이미지',
      color: '#7c3aed',
      bgLight: '#f5f3ff',
      borderColor: '#ddd6fe',
    },
  ];

  const handleFileSelect = (key, file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('이미지 파일(JPG, PNG 등)만 등록 가능합니다.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      setStatements((prev) => ({
        ...prev,
        [key]: {
          file,
          name: file.name,
          size: file.size,
          previewUrl: e.target.result,
        },
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleRemove = (key) => {
    setStatements((prev) => ({ ...prev, [key]: null }));
    if (fileInputRefs[key]?.current) {
      fileInputRefs[key].current.value = '';
    }
  };

  const handleDrop = (e, key) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverSlot(null);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(key, file);
  };

  const isAllUploaded = statements.waterQuality && statements.kit && statements.chemical;

  const handleSubmit = () => {
    if (!isAllUploaded) return;
    onGenerate(statements);
  };

  return (
    <div style={modalOverlayStyle}>
      <div style={modalContentStyle}>
        {/* 모달 헤더 */}
        <div style={modalHeaderStyle}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '20px' }}>📑</span>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
                청주휴게소 3대 거래명세서 등록
              </h3>
              <span style={badgeStyle}>
                {year}년 {month}월분
              </span>
            </div>
            <p style={{ margin: '6px 0 0 0', fontSize: '13px', color: '#64748b' }}>
              청주휴게소 정산서 한글 파일 작성을 위해 3가지 거래명세서 이미지를 등록해 주세요. (모두 등록 시 작성 버튼 활성화)
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isGenerating}
            style={closeBtnStyle}
            title="닫기"
          >
            <X size={20} />
          </button>
        </div>

        {/* 안내 문구 */}
        <div style={infoBoxStyle}>
          <AlertCircle size={16} style={{ color: '#2563eb', flexShrink: 0, marginTop: '2px' }} />
          <div>
            엑셀에서 캡처하신 <strong>수질분석(대신), 키트(케이엠), 약품(에이치디이앤씨)</strong> 명세서 이미지를 각각 드롭하거나 클릭하여 선택해 주세요.
            삽입 규격(85×50mm)에 맞춰 한글 문서의 각 책갈피 위치에 자동으로 삽입됩니다.
          </div>
        </div>

        {/* 3개 명세서 업로드 슬롯 그리드 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', margin: '16px 0' }}>
          {SLOTS.map((slot) => {
            const uploaded = statements[slot.key];
            const isDragOver = dragOverSlot === slot.key;

            return (
              <div
                key={slot.key}
                onDragOver={(e) => { e.preventDefault(); setDragOverSlot(slot.key); }}
                onDragLeave={() => setDragOverSlot(null)}
                onDrop={(e) => handleDrop(e, slot.key)}
                style={{
                  ...slotCardStyle(uploaded, isDragOver),
                  borderColor: isDragOver ? slot.color : (uploaded ? slot.borderColor : '#e2e8f0'),
                  background: uploaded ? slot.bgLight : (isDragOver ? '#f8fafc' : '#ffffff'),
                }}
              >
                {/* 슬롯 헤더 */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: slot.color }}>
                    {slot.title}
                  </span>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#475569', background: '#ffffff', padding: '2px 6px', borderRadius: '4px', border: '1px solid #cbd5e1' }}>
                    {slot.vendor}
                  </span>
                </div>

                <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '10px' }}>
                  규격: <strong>{slot.spec}</strong>
                </div>

                {/* 숨겨진 Input */}
                <input
                  type="file"
                  accept="image/*"
                  ref={fileInputRefs[slot.key]}
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileSelect(slot.key, f);
                  }}
                />

                {/* 업로드 상태 뷰 */}
                {uploaded ? (
                  <div style={previewBoxStyle}>
                    <div style={{ position: 'relative', width: '100%', height: '140px', background: '#ffffff', borderRadius: '6px', overflow: 'hidden', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                      {uploaded.previewUrl ? (
                        <img
                          src={uploaded.previewUrl}
                          alt={slot.title}
                          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                        />
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', color: slot.color }}>
                          <FileText size={42} />
                          <span style={{ fontSize: '11px', fontWeight: 700, color: '#059669', background: '#ecfdf5', padding: '2px 8px', borderRadius: '4px', border: '1px solid #a7f3d0' }}>
                            💾 기존 명세서 자동 연동됨
                          </span>
                        </div>
                      )}
                      <button
                        onClick={() => handleRemove(slot.key)}
                        disabled={isGenerating}
                        style={removeImgBtnStyle}
                        title="이미지 삭제 또는 교체"
                      >
                        <X size={14} />
                      </button>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px', fontSize: '11px', color: '#334155' }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px', fontWeight: 500 }} title={uploaded.name}>
                        📄 {uploaded.name}
                      </span>
                      <span style={{ color: '#059669', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <CheckCircle size={12} /> 준비완료
                      </span>
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={() => fileInputRefs[slot.key].current?.click()}
                    style={uploadPromptBoxStyle}
                  >
                    <Upload size={28} style={{ color: slot.color, marginBottom: '6px' }} />
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>
                      이미지 클릭 또는 드래그
                    </span>
                    <span style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                      JPG, PNG 파일
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* 모달 푸터 */}
        <div style={modalFooterStyle}>
          <div style={{ fontSize: '12px', color: isAllUploaded ? '#059669' : '#64748b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
            {isAllUploaded ? (
              <>
                <CheckCircle size={16} style={{ color: '#059669' }} />
                3개 명세서 이미지가 모두 준비되었습니다. 정산서를 생성할 수 있습니다.
              </>
            ) : (
              <>
                <AlertCircle size={16} style={{ color: '#f59e0b' }} />
                정산서 생성을 위해 3개 명세서 이미지를 모두 등록해 주세요. ({Object.values(statements).filter(Boolean).length}/3)
              </>
            )}
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={onClose}
              disabled={isGenerating}
              style={cancelBtnStyle}
            >
              취소
            </button>
            <button
              onClick={handleSubmit}
              disabled={!isAllUploaded || isGenerating}
              style={submitBtnStyle(isAllUploaded, isGenerating)}
            >
              {isGenerating ? (
                <>
                  <Loader2 size={16} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} />
                  청주 정산서 한글파일 작성 중...
                </>
              ) : (
                <>
                  <FileText size={16} />
                  ✨ 청주 정산서 한글파일 작성하기
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// 스타일 정의
const modalOverlayStyle = {
  position: 'fixed',
  top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(15, 23, 42, 0.65)',
  backdropFilter: 'blur(3px)',
  zIndex: 10000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '20px',
};

const modalContentStyle = {
  background: '#ffffff',
  borderRadius: '16px',
  width: '100%',
  maxWidth: '860px',
  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
  padding: '24px',
  display: 'flex',
  flexDirection: 'column',
  maxHeight: '90vh',
  overflowY: 'auto',
};

const modalHeaderStyle = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  borderBottom: '1px solid #f1f5f9',
  paddingBottom: '14px',
};

const badgeStyle = {
  background: '#eff6ff',
  color: '#2563eb',
  padding: '2px 8px',
  borderRadius: '12px',
  fontSize: '12px',
  fontWeight: 700,
  border: '1px solid #bfdbfe',
};

const closeBtnStyle = {
  background: 'transparent',
  border: 'none',
  color: '#64748b',
  cursor: 'pointer',
  padding: '4px',
  borderRadius: '6px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const infoBoxStyle = {
  background: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  padding: '10px 14px',
  marginTop: '12px',
  fontSize: '12px',
  color: '#334155',
  display: 'flex',
  gap: '8px',
  lineHeight: 1.5,
};

const slotCardStyle = (uploaded, isDragOver) => ({
  border: '2px dashed #cbd5e1',
  borderRadius: '12px',
  padding: '14px',
  display: 'flex',
  flexDirection: 'column',
  transition: 'all 0.2s ease',
  boxShadow: isDragOver ? '0 4px 12px rgba(37, 99, 235, 0.15)' : 'none',
});

const uploadPromptBoxStyle = {
  height: '140px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  borderRadius: '8px',
  background: '#f8fafc',
  border: '1px solid #e2e8f0',
};

const previewBoxStyle = {
  display: 'flex',
  flexDirection: 'column',
};

const removeImgBtnStyle = {
  position: 'absolute',
  top: '6px',
  right: '6px',
  background: 'rgba(239, 68, 68, 0.9)',
  color: '#ffffff',
  border: 'none',
  borderRadius: '50%',
  width: '22px',
  height: '22px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
};

const modalFooterStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  borderTop: '1px solid #f1f5f9',
  paddingTop: '16px',
  marginTop: '8px',
};

const cancelBtnStyle = {
  padding: '8px 16px',
  background: '#f1f5f9',
  color: '#475569',
  border: '1px solid #cbd5e1',
  borderRadius: '8px',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
};

const submitBtnStyle = (enabled, isGenerating) => ({
  padding: '8px 20px',
  background: enabled ? '#4f46e5' : '#cbd5e1',
  color: '#ffffff',
  border: 'none',
  borderRadius: '8px',
  fontSize: '13px',
  fontWeight: 700,
  cursor: enabled && !isGenerating ? 'pointer' : 'not-allowed',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  boxShadow: enabled ? '0 4px 6px -1px rgba(79, 70, 229, 0.25)' : 'none',
  transition: 'all 0.15s ease',
});

import React, { useRef } from 'react';
import { Upload, X, File } from 'lucide-react';

/**
 * 공통 파일 업로더 위젯
 * @param {Function} onUpload - 파일 선택 시 콜백 (files: FileList)
 * @param {string[]} accept - 허용 확장자 (예: ['.pdf', '.jpg'])
 * @param {boolean} multiple - 다중 선택 여부
 * @param {boolean} disabled - 비활성화
 * @param {string} buttonText - 버튼 텍스트
 */
export function FileUploader({
  onUpload,
  accept = [],
  multiple = false,
  disabled = false,
  buttonText = '파일 선택',
  uploading = false,
  uploadText = '업로드 중...'
}) {
  const inputRef = useRef(null);

  const handleClick = () => {
    if (!disabled && !uploading) {
      inputRef.current?.click();
    }
  };

  const handleChange = (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      onUpload?.(files);
      e.target.value = ''; // 재선택 가능하도록 초기화
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || uploading}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '8px 16px',
          background: disabled || uploading ? '#94a3b8' : '#2563eb',
          color: '#fff',
          border: 'none',
          borderRadius: '6px',
          cursor: disabled || uploading ? 'not-allowed' : 'pointer',
          fontSize: '14px',
          fontWeight: 500,
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <Upload size={16} />
        {uploading ? uploadText : buttonText}
      </button>
      <input
        ref={inputRef}
        type="file"
        style={{ display: 'none' }}
        accept={accept.join(',')}
        multiple={multiple}
        onChange={handleChange}
      />
    </>
  );
}

/**
 * 선택된 파일 목록 표시
 */
export function FileList({ files, onRemove }) {
  if (!files || files.length === 0) return null;

  return (
    <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {Array.from(files).map((file, index) => (
        <div
          key={index}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 12px',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '6px',
          }}
        >
          <File size={16} color="#64748b" />
          <span style={{ flex: 1, fontSize: '13px', color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {file.name}
          </span>
          <span style={{ fontSize: '12px', color: '#94a3b8' }}>
            {(file.size / 1024).toFixed(1)} KB
          </span>
          {onRemove && (
            <button
              onClick={() => onRemove(index)}
              style={{
                padding: '4px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: '#94a3b8',
              }}
              title="제거"
            >
              <X size={16} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export default FileUploader;

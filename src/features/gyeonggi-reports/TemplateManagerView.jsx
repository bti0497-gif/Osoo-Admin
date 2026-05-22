import React, { useState, useEffect, useCallback } from 'react';
import { FileText, Upload, Trash2, Download, Folder, File, RefreshCw } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

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
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);

  // 양식 목록 로드
  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/gyeonggi/templates`, {
        headers: adminHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTemplates(data.templates || []);
    } catch (err) {
      setError(err.message);
      console.error('양식 로드 실패:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  // 파일 업로드
  const handleFileUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      for (const file of files) {
        formData.append('files', file);
      }

      const res = await fetch(`${API_BASE}/api/gyeonggi/templates`, {
        method: 'POST',
        headers: adminHeaders(),
        body: formData,
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `HTTP ${res.status}`);
      }

      await loadTemplates();
    } catch (err) {
      setError(err.message);
      console.error('업로드 실패:', err);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  // 양식 삭제
  const handleDelete = async (filename) => {
    if (!confirm(`"${filename}" 양식을 삭제하시겠습니까?`)) return;

    try {
      const res = await fetch(`${API_BASE}/api/gyeonggi/templates/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
        headers: adminHeaders(),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadTemplates();
    } catch (err) {
      setError(err.message);
      console.error('삭제 실패:', err);
    }
  };

  // 다운로드
  const handleDownload = (filename) => {
    window.open(`${API_BASE}/api/gyeonggi/templates/${encodeURIComponent(filename)}/download`, '_blank');
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 B';
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
    <div style={{ padding: '20px', height: '100%', overflow: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 600 }}>양식관리</h2>
        <div style={{ display: 'flex', gap: '10px' }}>
          <label style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 16px',
            background: '#2563eb',
            color: '#fff',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            opacity: uploading ? 0.6 : 1,
            pointerEvents: uploading ? 'none' : 'auto',
          }}>
            <Upload size={16} />
            {uploading ? '업로드 중...' : '양식 추가'}
            <input type="file" multiple style={{ display: 'none' }} onChange={handleFileUpload} accept=".xlsx,.xls,.doc,.docx,.hwp,.pdf" />
          </label>
          <button
            onClick={loadTemplates}
            disabled={loading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              background: '#f1f5f9',
              color: '#64748b',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '14px',
            }}
          >
            <RefreshCw size={16} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            새로고침
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fee2e2', border: '1px solid #fecaca', borderRadius: '6px', padding: '12px', marginBottom: '16px', color: '#dc2626' }}>
          오류: {error}
        </div>
      )}

      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px' }}>
        <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '12px' }}>
          <Folder size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
          저장 위치: <code>templates/gyeonggi/</code>
        </div>

        {templates.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
            <FileText size={48} style={{ marginBottom: '12px', opacity: 0.3 }} />
            <p>등록된 양식이 없습니다.</p>
            <p style={{ fontSize: '13px' }}>"양식 추가" 버튼을 클릭해 양식 파일을 업로드하세요.</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ textAlign: 'left', padding: '12px', fontWeight: 600, color: '#475569' }}>파일명</th>
                <th style={{ textAlign: 'left', padding: '12px', fontWeight: 600, color: '#475569' }}>크기</th>
                <th style={{ textAlign: 'left', padding: '12px', fontWeight: 600, color: '#475569' }}>수정일</th>
                <th style={{ textAlign: 'center', padding: '12px', fontWeight: 600, color: '#475569' }}>작업</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((template) => (
                <tr key={template.filename} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <File size={18} color="#64748b" />
                      <span style={{ fontWeight: 500 }}>{template.filename}</span>
                    </div>
                  </td>
                  <td style={{ padding: '12px', color: '#64748b' }}>{formatFileSize(template.size)}</td>
                  <td style={{ padding: '12px', color: '#64748b' }}>{formatDate(template.modifiedAt)}</td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                      <button
                        onClick={() => handleDownload(template.filename)}
                        title="다운로드"
                        style={{
                          padding: '6px',
                          background: '#f1f5f9',
                          border: '1px solid #e2e8f0',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          color: '#64748b',
                        }}
                      >
                        <Download size={16} />
                      </button>
                      <button
                        onClick={() => handleDelete(template.filename)}
                        title="삭제"
                        style={{
                          padding: '6px',
                          background: '#fee2e2',
                          border: '1px solid #fecaca',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          color: '#dc2626',
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ marginTop: '20px', padding: '12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', fontSize: '13px', color: '#1e40af' }}>
        <strong>💡 사용 방법:</strong>
        <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
          <li>엑셀(.xlsx), 워드(.docx), 한글(.hwp), PDF 파일을 양식으로 등록할 수 있습니다.</li>
          <li>등록된 양식은 "양식만들기" 메뉴에서 선택하여 사용할 수 있습니다.</li>
          <li>양식 파일은 <code>templates/gyeonggi/</code> 폴더에 저장됩니다.</li>
        </ul>
      </div>
    </div>
  );
}

export default TemplateManagerView;

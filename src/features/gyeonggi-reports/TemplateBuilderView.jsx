import React, { useState, useEffect, useCallback } from 'react';
import { FileText, Play, Download, Calendar, MapPin, Filter, AlertCircle } from 'lucide-react';

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

export function TemplateBuilderView() {
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [sites, setSites] = useState([]);
  
  // 조건 상태
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedSites, setSelectedSites] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [previewData, setPreviewData] = useState(null);

  // 양식 목록 로드
  useEffect(() => {
    fetch(`${API_BASE}/api/gyeonggi/templates`, { headers: adminHeaders() })
      .then(res => res.json())
      .then(data => setTemplates(data.templates || []))
      .catch(err => console.error('양식 로드 실패:', err));
  }, []);

  // 현장 목록 로드
  useEffect(() => {
    fetch(`${API_BASE}/api/certificates/site-normalization`, { headers: adminHeaders() })
      .then(res => res.json())
      .then(data => {
        const siteNames = (data.siteMaster || []).map(s => s.official_name).filter(Boolean);
        setSites(siteNames);
      })
      .catch(err => console.error('현장 로드 실패:', err));
  }, []);

  // 미리보기 (BigQuery 조회)
  const handlePreview = async () => {
    if (!selectedTemplate) {
      setError('양식을 선택해주세요.');
      return;
    }
    if (!startDate || !endDate) {
      setError('조회 기간을 설정해주세요.');
      return;
    }

    setLoading(true);
    setError(null);
    setPreviewData(null);

    try {
      const params = new URLSearchParams({
        startDate,
        endDate,
        sites: selectedSites.join(','),
      });

      const res = await fetch(`${API_BASE}/api/gyeonggi/data-preview?${params}`, {
        headers: adminHeaders(),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setPreviewData(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // 문서 생성
  const handleGenerate = async () => {
    if (!selectedTemplate || !previewData) return;

    setGenerating(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/api/gyeonggi/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...adminHeaders() },
        body: JSON.stringify({
          templateFilename: selectedTemplate,
          startDate,
          endDate,
          sites: selectedSites,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      
      // 파일 다운로드
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedTemplate.replace(/\.[^.]+$/, '')}_${startDate}_${endDate}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  // 전체 선택/해제
  const toggleAllSites = () => {
    if (selectedSites.length === sites.length) {
      setSelectedSites([]);
    } else {
      setSelectedSites([...sites]);
    }
  };

  return (
    <div style={{ padding: '20px', height: '100%', overflow: 'auto' }}>
      <h2 style={{ margin: '0 0 20px 0', fontSize: '20px', fontWeight: 600 }}>양식만들기</h2>

      {error && (
        <div style={{ background: '#fee2e2', border: '1px solid #fecaca', borderRadius: '6px', padding: '12px', marginBottom: '16px', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
        {/* 양식 선택 */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px' }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600, color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <FileText size={16} />
            1. 양식 선택
          </h3>
          <select
            value={selectedTemplate}
            onChange={(e) => setSelectedTemplate(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
              background: '#fff',
            }}
          >
            <option value="">양식을 선택하세요</option>
            {templates.map(t => (
              <option key={t.filename} value={t.filename}>{t.filename}</option>
            ))}
          </select>
          {templates.length === 0 && (
            <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: '#94a3b8' }}>
              등록된 양식이 없습니다. "양식관리" 메뉴에서 먼저 양식을 등록해주세요.
            </p>
          )}
        </div>

        {/* 조회 기간 */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px' }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600, color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Calendar size={16} />
            2. 조회 기간
          </h3>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{ flex: 1, padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
            />
            <span style={{ color: '#64748b' }}>~</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{ flex: 1, padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
            />
          </div>
        </div>
      </div>

      {/* 현장 선택 */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <MapPin size={16} />
            3. 현장 선택 (선택사항)
          </h3>
          <button
            onClick={toggleAllSites}
            style={{
              padding: '4px 10px',
              fontSize: '12px',
              background: '#f1f5f9',
              border: '1px solid #e2e8f0',
              borderRadius: '4px',
              cursor: 'pointer',
              color: '#64748b',
            }}
          >
            {selectedSites.length === sites.length ? '전체 해제' : '전체 선택'}
          </button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', maxHeight: '150px', overflow: 'auto', padding: '4px' }}>
          {sites.map(site => (
            <label
              key={site}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '6px 10px',
                background: selectedSites.includes(site) ? '#dbeafe' : '#f8fafc',
                border: `1px solid ${selectedSites.includes(site) ? '#3b82f6' : '#e2e8f0'}`,
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px',
                color: selectedSites.includes(site) ? '#1e40af' : '#475569',
              }}
            >
              <input
                type="checkbox"
                checked={selectedSites.includes(site)}
                onChange={() => {
                  if (selectedSites.includes(site)) {
                    setSelectedSites(selectedSites.filter(s => s !== site));
                  } else {
                    setSelectedSites([...selectedSites, site]);
                  }
                }}
                style={{ margin: 0 }}
              />
              {site}
            </label>
          ))}
        </div>
        <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: '#94a3b8' }}>
          현장을 선택하지 않으면 전체 현장의 데이터가 조회됩니다.
        </p>
      </div>

      {/* 조회 버튼 */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <button
          onClick={handlePreview}
          disabled={loading || !selectedTemplate}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '10px 20px',
            background: loading ? '#94a3b8' : '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '14px',
            fontWeight: 500,
          }}
        >
          <Filter size={16} />
          {loading ? '조회 중...' : '데이터 미리보기'}
        </button>

        {previewData && (
          <button
            onClick={handleGenerate}
            disabled={generating}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 20px',
              background: generating ? '#94a3b8' : '#16a34a',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: generating ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: 500,
            }}
          >
            <Download size={16} />
            {generating ? '생성 중...' : '문서 생성 및 다운로드'}
          </button>
        )}
      </div>

      {/* 미리보기 결과 */}
      {previewData && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px' }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600, color: '#475569' }}>
            조회 결과 미리보기
          </h3>
          <div style={{ display: 'flex', gap: '20px', marginBottom: '16px' }}>
            <div style={{ flex: 1, background: '#f8fafc', borderRadius: '6px', padding: '12px' }}>
              <div style={{ fontSize: '12px', color: '#64748b' }}>조회 기간</div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#334155' }}>
                {previewData.startDate} ~ {previewData.endDate}
              </div>
            </div>
            <div style={{ flex: 1, background: '#f8fafc', borderRadius: '6px', padding: '12px' }}>
              <div style={{ fontSize: '12px', color: '#64748b' }}>현장 수</div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#334155' }}>
                {previewData.siteCount || previewData.data?.length || 0}개
              </div>
            </div>
            <div style={{ flex: 1, background: '#f8fafc', borderRadius: '6px', padding: '12px' }}>
              <div style={{ fontSize: '12px', color: '#64748b' }}>데이터 건수</div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#334155' }}>
                {previewData.totalCount || previewData.data?.length || 0}건
              </div>
            </div>
          </div>

          {previewData.data && previewData.data.length > 0 && (
            <div style={{ maxHeight: '300px', overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                    <th style={{ padding: '10px', textAlign: 'left', fontWeight: 600, color: '#475569' }}>날짜</th>
                    <th style={{ padding: '10px', textAlign: 'left', fontWeight: 600, color: '#475569' }}>현장</th>
                    <th style={{ padding: '10px', textAlign: 'right', fontWeight: 600, color: '#475569' }}>SS</th>
                    <th style={{ padding: '10px', textAlign: 'right', fontWeight: 600, color: '#475569' }}>BOD</th>
                    <th style={{ padding: '10px', textAlign: 'right', fontWeight: 600, color: '#475569' }}>T-N</th>
                    <th style={{ padding: '10px', textAlign: 'right', fontWeight: 600, color: '#475569' }}>T-P</th>
                  </tr>
                </thead>
                <tbody>
                  {previewData.data.slice(0, 10).map((row, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px 10px' }}>{row.report_date}</td>
                      <td style={{ padding: '8px 10px' }}>{row.site_name}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>{row.ss ?? '-'}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>{row.bod ?? '-'}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>{row.tn ?? '-'}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>{row.tp ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {previewData.data.length > 10 && (
                <p style={{ margin: '10px 0 0 0', fontSize: '12px', color: '#94a3b8', textAlign: 'center' }}>
                  외 {previewData.data.length - 10}건 더 있음
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {!previewData && !loading && (
        <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>
          <Play size={48} style={{ marginBottom: '12px', opacity: 0.3 }} />
          <p>양식을 선택하고 조회 기간을 설정한 후 "데이터 미리보기"를 클릭하세요.</p>
        </div>
      )}
    </div>
  );
}

export default TemplateBuilderView;

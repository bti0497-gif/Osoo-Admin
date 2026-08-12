import React, { useEffect, useState } from 'react';
import { getApiBase } from '../../../../core/api/serverConfig';

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i);
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

function formatDate(val) {
  if (!val) return '-';
  const s = typeof val === 'object' && val.value ? val.value : String(val);
  return s.slice(0, 10);
}

function formatVal(val) {
  if (val === null || val === undefined || val === '') return '-';
  const num = Number(val);
  return Number.isFinite(num) ? num.toLocaleString() : String(val);
}

export default function WaterQualityDataModal({ isOpen, onClose, year, month, selectedSite }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // 모달 내부에서 연월 변경 가능하도록 자체 state 도입
  const [modalYear, setModalYear] = useState(year || CURRENT_YEAR);
  const [modalMonth, setModalMonth] = useState(month || (new Date().getMonth() + 1));

  // 부모에서 year, month prop이 전달되면 맞춰 동기화
  useEffect(() => {
    if (year) setModalYear(year);
    if (month) setModalMonth(month);
  }, [year, month, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          year: String(modalYear),
          month: String(modalMonth),
          siteName: selectedSite || 'all',
        });
        const res = await fetch(`${getApiBase()}/api/certificates/water-quality?${params}`);
        if (!res.ok) {
          throw new Error(`데이터를 가져오는데 실패했습니다: ${res.status}`);
        }
        const result = await res.json();
        if (result.success && Array.isArray(result.data)) {
          setData(result.data);
        } else {
          setData([]);
        }
      } catch (err) {
        console.error('[WaterQualityDataModal] 수질데이터 조회 오류:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [isOpen, modalYear, modalMonth, selectedSite]);

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999, backdropFilter: 'blur(2px)',
    }}>
      <div style={{
        background: '#ffffff', borderRadius: '12px', width: '92%', maxWidth: '820px',
        maxHeight: '85vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        border: '1px solid #e2e8f0', overflow: 'hidden',
      }}>
        {/* 모달 헤더 (연/월 선택 드롭다운 포함) */}
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid #e2e8f0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: '#f8fafc', flexWrap: 'wrap', gap: '8px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
              📊 등록 수질 데이터 목록
            </span>

            {/* 연도 & 월 선택 드롭다운 */}
            <select
              value={modalYear}
              onChange={(e) => setModalYear(Number(e.target.value))}
              style={selectStyle}
            >
              {YEARS.map((y) => <option key={y} value={y}>{y}년</option>)}
            </select>
            <select
              value={modalMonth}
              onChange={(e) => setModalMonth(Number(e.target.value))}
              style={selectStyle}
            >
              {MONTHS.map((m) => <option key={m} value={m}>{m}월</option>)}
            </select>

            <span style={{
              fontSize: '12px', color: '#2563eb', background: '#eff6ff',
              padding: '3px 10px', borderRadius: '12px', fontWeight: 600, border: '1px solid #bfdbfe'
            }}>
              {selectedSite && selectedSite !== 'all' ? selectedSite : '전체 현장'}
            </span>
            <span style={{
              fontSize: '12px', color: '#475569', background: '#e2e8f0',
              padding: '3px 10px', borderRadius: '12px', fontWeight: 600
            }}>
              총 {data.length}건
            </span>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', fontSize: '22px', fontWeight: 600,
              color: '#64748b', cursor: 'pointer', padding: '0 6px', lineHeight: 1,
            }}
            title="닫기"
          >
            ✕
          </button>
        </div>

        {/* 모달 바디 (슬림 그리드) */}
        <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1, background: '#ffffff' }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
              <div style={{
                width: '32px', height: '32px', border: '3px solid #cbd5e1', borderTopColor: '#2563eb',
                borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px auto'
              }} />
              데이터를 읽어오는 중입니다...
            </div>
          ) : error ? (
            <div style={{ padding: '20px', background: '#fef2f2', color: '#991b1b', borderRadius: '8px', fontSize: '14px' }}>
              ⚠️ {error}
            </div>
          ) : data.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#64748b', fontSize: '14px' }}>
              선택한 {modalYear}년 {modalMonth}월에 등록된 엑셀/BigQuery 수질 데이터가 없습니다.
            </div>
          ) : (
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'center' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9', color: '#334155', fontWeight: 700, borderBottom: '1px solid #cbd5e1' }}>
                    <th style={thStyle}>채수일자</th>
                    <th style={{ ...thStyle, textAlign: 'left' }}>현장명</th>
                    <th style={thStyle}>MLSS</th>
                    <th style={thStyle}>BOD</th>
                    <th style={thStyle}>SS</th>
                    <th style={thStyle}>T-N</th>
                    <th style={thStyle}>T-P</th>
                    <th style={thStyle}>총대장균군</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((row, idx) => (
                    <tr
                      key={row.id || idx}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        background: idx % 2 === 0 ? '#ffffff' : '#f8fafc',
                      }}
                    >
                      <td style={tdStyle}>{formatDate(row.sample_date || row.report_date)}</td>
                      <td style={{ ...tdStyle, textAlign: 'left', fontWeight: 600, color: '#1e293b' }}>
                        {row.site_name || row.site_name_raw || '-'}
                      </td>
                      <td style={{ ...tdStyle, fontWeight: 600, color: '#2563eb' }}>{formatVal(row.mlss)}</td>
                      <td style={tdStyle}>{formatVal(row.bod)}</td>
                      <td style={tdStyle}>{formatVal(row.ss)}</td>
                      <td style={tdStyle}>{formatVal(row.tn)}</td>
                      <td style={tdStyle}>{formatVal(row.tp)}</td>
                      <td style={tdStyle}>{formatVal(row.total_coliform)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 모달 푸터 */}
        <div style={{
          padding: '12px 20px', borderTop: '1px solid #e2e8f0', background: '#f8fafc',
          display: 'flex', justifyContent: 'flex-end'
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '6px 18px', background: '#475569', color: '#fff', border: 'none',
              borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer'
            }}
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

const selectStyle = {
  height: '30px', border: '1px solid #cbd5e1', borderRadius: '6px',
  padding: '0 8px', fontSize: '13px', color: '#1e293b', background: '#ffffff',
  fontWeight: 600, cursor: 'pointer',
};

const thStyle = {
  padding: '10px 12px',
  whiteSpace: 'nowrap',
};

const tdStyle = {
  padding: '9px 12px',
  whiteSpace: 'nowrap',
};

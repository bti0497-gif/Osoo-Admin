import React, { useEffect, useState } from 'react';
import { X, Plus, Trash2, Edit2, Check, Building2 } from 'lucide-react';
import { fetchVendorList, saveVendor, removeVendor } from '../utils/vendorStorage';

export function VendorManagerModal({ isOpen, onClose, onVendorChange }) {
  const [vendors, setVendors] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [form, setForm] = useState({
    company_name: '',
    short_name: '',
    contact_person: '',
    phone: '',
    category: '약품',
    notes: '',
  });
  useEffect(() => { if (isOpen) fetchVendorList().then(setVendors).catch(err => alert(err.message)); }, [isOpen]);

  if (!isOpen) return null;

  const handleStartAdd = () => {
    setEditingId('new');
    setForm({
      company_name: '',
      short_name: '',
      contact_person: '',
      phone: '',
      category: '약품',
      notes: '',
    });
  };

  const handleStartEdit = (v) => {
    setEditingId(v.id);
    setForm({
      company_name: v.company_name || '',
      short_name: v.short_name || '',
      contact_person: v.contact_person || '',
      phone: v.phone || '',
      category: v.category || '약품',
      notes: v.notes || '',
    });
  };

  const handleSave = async () => {
    if (!form.company_name.trim()) {
      alert('공식 업체명을 입력해 주세요.');
      return;
    }
    const shortName = form.short_name.trim() || form.company_name.trim();

    let item;
    if (editingId === 'new') {
      item = {
        ...form,
        short_name: shortName,
        vendor_id: `vendor_${Date.now()}`,
      };
    } else {
      item = { ...vendors.find(v => v.id === editingId), ...form, short_name: shortName };
    }

    const saved = await saveVendor(item);
    const nextList = editingId === 'new' ? [saved, ...vendors] : vendors.map(v => v.id === saved.id ? saved : v);
    setVendors(nextList);
    setEditingId(null);
    if (onVendorChange) onVendorChange(nextList);
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`'${name}' 거래처를 삭제하시겠습니까?`)) return;
    await removeVendor(id);
    const nextList = vendors.filter(v => v.id !== id);
    setVendors(nextList);
    if (onVendorChange) onVendorChange(nextList);
  };

  const filtered = vendors.filter(v => 
    v.company_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    v.short_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    v.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        {/* 헤더 */}
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Building2 size={20} color="#2563eb" />
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#1e293b' }}>
              거래처 (업체) 관리
            </h3>
          </div>
          <button onClick={onClose} style={closeBtnStyle}><X size={18} /></button>
        </div>

        {/* 폼 및 검색바 영역 */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
          {editingId ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: '#fff', padding: '14px', borderRadius: '10px', border: '1.5px solid #3b82f6' }}>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#1e40af', marginBottom: '2px' }}>
                {editingId === 'new' ? '➕ 신규 거래처 등록' : '✏️ 거래처 정보 수정'}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={labelStyle}>공식 업체명 *</label>
                  <input
                    type="text"
                    placeholder="예: 대일물산 화학사업부"
                    value={form.company_name}
                    onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>파일명용 단축명</label>
                  <input
                    type="text"
                    placeholder="미입력 시 업체명 사용"
                    value={form.short_name}
                    onChange={(e) => setForm({ ...form, short_name: e.target.value })}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>구분</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    style={inputStyle}
                  >
                    <option value="약품">약품</option>
                    <option value="슬러지">슬러지</option>
                    <option value="키트">키트</option>
                    <option value="수질분석">수질분석</option>
                    <option value="용역">용역</option>
                    <option value="기타">기타</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={labelStyle}>담당자 성명</label>
                  <input
                    type="text"
                    placeholder="담당자 이름"
                    value={form.contact_person}
                    onChange={(e) => setForm({ ...form, contact_person: e.target.value })}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>연락처</label>
                  <input
                    type="text"
                    placeholder="전화번호 / 핸드폰"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>비고</label>
                  <input
                    type="text"
                    placeholder="메모 사항"
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    style={inputStyle}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '6px' }}>
                <button onClick={() => setEditingId(null)} style={btnCancelStyle}>취소</button>
                <button onClick={handleSave} style={btnSaveStyle}>
                  <Check size={14} /> 저장
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
              <input
                type="text"
                placeholder="업체명 / 단축명 / 구분 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ ...inputStyle, width: '280px' }}
              />
              <button onClick={handleStartAdd} style={btnAddStyle}>
                <Plus size={15} /> 신규 거래처 추가
              </button>
            </div>
          )}
        </div>

        {/* 거래처 목록 리스트 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
              등록된 거래처가 없습니다. 상단에서 신규 거래처를 추가해 주세요.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1.5px solid #e2e8f0', color: '#64748b', fontSize: '12px' }}>
                  <th style={{ textAlign: 'left', padding: '8px 10px' }}>공식 업체명</th>
                  <th style={{ textAlign: 'left', padding: '8px 10px' }}>단축명 (파일명 표기)</th>
                  <th style={{ textAlign: 'center', padding: '8px 10px' }}>구분</th>
                  <th style={{ textAlign: 'left', padding: '8px 10px' }}>담당자 / 연락처</th>
                  <th style={{ textAlign: 'center', padding: '8px 10px', width: '80px' }}>관리</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(v => (
                  <tr key={v.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px', fontWeight: 700, color: '#1e293b' }}>
                      {v.company_name}
                    </td>
                    <td style={{ padding: '10px', color: '#2563eb', fontWeight: 700 }}>
                      {v.short_name}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'center' }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 700,
                        background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe'
                      }}>
                        {v.category}
                      </span>
                    </td>
                    <td style={{ padding: '10px', color: '#475569' }}>
                      {v.contact_person || '-'} {v.phone ? `(${v.phone})` : ''}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                        <button onClick={() => handleStartEdit(v)} style={iconBtnStyle} title="수정"><Edit2 size={13} /></button>
                        <button onClick={() => handleDelete(v.id, v.company_name)} style={{ ...iconBtnStyle, color: '#dc2626' }} title="삭제"><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* 푸터 */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
          <span style={{ fontSize: '12px', color: '#64748b' }}>
            등록된 거래처: <strong>{vendors.length}개</strong>
          </span>
          <button onClick={onClose} style={btnCloseMainStyle}>닫기</button>
        </div>
      </div>
    </div>
  );
}

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(15, 23, 42, 0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 9999,
};

const modalStyle = {
  width: '680px',
  maxHeight: '80vh',
  backgroundColor: '#ffffff',
  borderRadius: '16px',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
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
  color: '#64748b',
  marginBottom: '4px',
};

const inputStyle = {
  width: '100%',
  padding: '6px 10px',
  borderRadius: '6px',
  border: '1px solid #cbd5e1',
  fontSize: '12px',
  boxSizing: 'border-box',
};

const btnAddStyle = {
  padding: '7px 14px',
  borderRadius: '6px',
  background: '#2563eb',
  color: '#fff',
  border: 'none',
  fontSize: '12px',
  fontWeight: 700,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
};

const btnSaveStyle = {
  padding: '6px 14px',
  borderRadius: '6px',
  background: '#16a34a',
  color: '#fff',
  border: 'none',
  fontSize: '12px',
  fontWeight: 700,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
};

const btnCancelStyle = {
  padding: '6px 12px',
  borderRadius: '6px',
  background: '#f1f5f9',
  color: '#64748b',
  border: '1px solid #cbd5e1',
  fontSize: '12px',
  cursor: 'pointer',
};

const iconBtnStyle = {
  padding: '4px',
  borderRadius: '4px',
  border: '1px solid #e2e8f0',
  background: '#fff',
  cursor: 'pointer',
  color: '#475569',
};

const btnCloseMainStyle = {
  padding: '6px 16px',
  borderRadius: '6px',
  background: '#334155',
  color: '#fff',
  border: 'none',
  fontSize: '12px',
  fontWeight: 700,
  cursor: 'pointer',
};

export default VendorManagerModal;

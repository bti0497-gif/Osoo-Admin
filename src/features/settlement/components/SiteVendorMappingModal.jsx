import React, { useEffect, useMemo, useState } from 'react';
import { Building2, Loader2, Save, X } from 'lucide-react';
import { apiClient } from '../../../core/api/apiClient.js';

const EMPTY_MAPPING = { sludge_vendor_id_1: '', sludge_vendor_id_2: '', medicine_vendor_id: '', water_vendor_id: '', kit_vendor_id: '' };

export function SiteVendorMappingModal({ isOpen, onClose, sites, vendors, onSaved }) {
  const [mappings, setMappings] = useState([]);
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [draft, setDraft] = useState(EMPTY_MAPPING);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const orderedSites = useMemo(() => [...(sites || [])].sort((a, b) => String(a.site_name || '').localeCompare(String(b.site_name || ''), 'ko')), [sites]);
  const selectedSite = orderedSites.find((site) => String(site.site_id || site.id) === selectedSiteId);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    apiClient.get('/api/settlement/site-vendor-mappings')
      .then((data) => setMappings(data.mappings || []))
      .catch((error) => alert(error.message || '현장별 거래처 정보를 불러오지 못했습니다.'))
      .finally(() => setLoading(false));
  }, [isOpen]);

  useEffect(() => {
    if (!selectedSite) {
      setDraft(EMPTY_MAPPING);
      return;
    }
    const saved = mappings.find((mapping) => mapping.site_id === String(selectedSite.site_id || selectedSite.id));
    setDraft(saved ? {
      sludge_vendor_id_1: saved.sludge_vendor_id_1 || '',
      sludge_vendor_id_2: saved.sludge_vendor_id_2 || '',
      medicine_vendor_id: saved.medicine_vendor_id || '',
      water_vendor_id: saved.water_vendor_id || '',
      kit_vendor_id: saved.kit_vendor_id || '',
    } : EMPTY_MAPPING);
  }, [selectedSiteId, selectedSite, mappings]);

  if (!isOpen) return null;

  const save = async () => {
    if (!selectedSite) return;
    setSaving(true);
    try {
      const mapping = await apiClient.post('/api/settlement/site-vendor-mappings', {
        site_id: String(selectedSite.site_id || selectedSite.id),
        site_name: selectedSite.site_name,
        ...draft,
      });
      setMappings((previous) => {
        const withoutCurrent = previous.filter((item) => item.site_id !== mapping.mapping.site_id);
        return [...withoutCurrent, mapping.mapping];
      });
      onSaved?.(mapping.mapping);
      alert(`${selectedSite.site_name} 거래처 매칭을 저장했습니다.`);
    } catch (error) {
      alert(error.message || '거래처 매칭 저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const selectVendor = (label, field, allowEmpty = true) => (
    <label style={labelStyle}>
      {label}
      <select value={draft[field]} onChange={(event) => setDraft((previous) => ({ ...previous, [field]: event.target.value }))} style={selectStyle}>
        {allowEmpty && <option value="">미지정</option>}
        {(vendors || []).map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.company_name} ({vendor.short_name || vendor.company_name})</option>)}
      </select>
    </label>
  );

  return (
    <div style={backdropStyle} role="presentation" onMouseDown={onClose}>
      <section style={modalStyle} role="dialog" aria-modal="true" aria-label="현장별 거래처 매칭" onMouseDown={(event) => event.stopPropagation()}>
        <header style={headerStyle}>
          <div><Building2 size={18} color="#2563eb" /> 현장별 거래처 매칭</div>
          <button onClick={onClose} style={closeStyle}><X size={18} /></button>
        </header>
        <p style={{ margin: '0 0 14px', color: '#64748b', fontSize: 12 }}>현장별 입금표 선택 목록입니다. 키트 거래처는 공통 거래처를 자동으로 사용합니다.</p>
        {loading ? <div style={loadingStyle}><Loader2 size={18} className="spin" /> Google Sheets를 불러오는 중입니다.</div> : <>
          <label style={labelStyle}>현장
            <select value={selectedSiteId} onChange={(event) => setSelectedSiteId(event.target.value)} style={selectStyle}>
              <option value="">현장을 선택하세요</option>
              {orderedSites.map((site) => <option key={site.site_id || site.id} value={site.site_id || site.id}>{site.site_name}</option>)}
            </select>
          </label>
          {selectedSite && <div style={formGridStyle}>
            {selectVendor('슬러지 거래처', 'sludge_vendor_id_1')}
            {selectVendor('슬러지 거래처 2 (천안만)', 'sludge_vendor_id_2')}
            {selectVendor('약품 거래처', 'medicine_vendor_id')}
            {selectVendor('수질분석 거래처', 'water_vendor_id')}
            {selectVendor('키트 거래처', 'kit_vendor_id')}
          </div>}
        </>}
        <footer style={footerStyle}>
          <button onClick={onClose} style={cancelStyle}>닫기</button>
          <button onClick={save} disabled={!selectedSite || saving || loading} style={{ ...saveStyle, opacity: !selectedSite || saving || loading ? 0.55 : 1 }}>
            {saving ? <Loader2 size={15} className="spin" /> : <Save size={15} />} Google Sheets 저장
          </button>
        </footer>
      </section>
    </div>
  );
}

const backdropStyle = { position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15, 23, 42, 0.42)' };
const modalStyle = { width: 600, maxWidth: 'calc(100vw - 32px)', background: '#fff', borderRadius: 14, boxShadow: '0 20px 60px rgba(15,23,42,.28)', padding: 20 };
const headerStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, fontSize: 17, fontWeight: 800, color: '#0f172a' };
const closeStyle = { border: 'none', background: 'transparent', color: '#64748b', cursor: 'pointer', display: 'flex' };
const labelStyle = { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12, fontWeight: 800, color: '#475569' };
const selectStyle = { width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 7, background: '#fff', color: '#0f172a', fontSize: 13 };
const formGridStyle = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 };
const footerStyle = { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 };
const cancelStyle = { padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 7, background: '#fff', color: '#475569', cursor: 'pointer', fontWeight: 700 };
const saveStyle = { padding: '8px 12px', border: 'none', borderRadius: 7, background: '#2563eb', color: '#fff', cursor: 'pointer', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 };
const loadingStyle = { minHeight: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#64748b', fontSize: 13 };

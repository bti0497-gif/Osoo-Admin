import React, { useState, useMemo, useEffect } from 'react';
import { FileCheck, ArrowLeft, Building2, ExternalLink, CheckCircle2, Grid, Upload, Download, Loader2 } from 'lucide-react';
import { useSiteMaster } from '../certificate/hooks/useSiteMaster';
import { usePdfLoader } from '../certificate/pdf-parser/hooks/usePdfLoader';
import { VendorManagerModal } from './components/VendorManagerModal';
import { SiteVendorMappingModal } from './components/SiteVendorMappingModal';
import { getVendorList, fetchVendorList } from './utils/vendorStorage';
import { apiClient } from '../../core/api/apiClient.js';

export function DepositReceiptManagerView() {
  const { siteMaster = [], loading: sitesLoading } = useSiteMaster();
  const { loadPdf, generateThumbnail } = usePdfLoader();

  const [pdfFile, setPdfFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  // PDF 파일 선택 / 드롭 처리
  const handlePdfSelect = async (e) => {
    const files = e.target.files || e.dataTransfer?.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    if (file.name.toLowerCase().endsWith('.pdf')) {
      setPdfFile(file);
      setMatchedItems({});
      setSelectedMatchedId(null);
      const pages = await loadPdf(file);
      if (!pages?.length) return;
      const nextItems = [];
      for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
        const pageImage = await generateThumbnail(pageIndex, pages, 150 / 72);
        if (!pageImage) continue;
        for (const roi of DEPOSIT_RECEIPT_ROIS) {
          const imageDataUrl = await cropDepositReceipt(pageImage, roi);
          if (imageDataUrl) nextItems.push({ id: `receipt-${pageIndex + 1}-${roi.id}`, pageNumber: pageIndex + 1, receiptNumber: roi.id, label: `${pageIndex + 1}-${roi.id}`, imageDataUrl });
        }
      }
      setSplitItems(nextItems);
      setSelectedIndex(0);
    } else {
      alert('PDF 파일만 선택이 가능합니다.');
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    handlePdfSelect(e);
  };

  // 1페이지 4분할 입금표 데이터 (PDF 파일 미업로드 시 빈 배열)
  const [splitItems, setSplitItems] = useState([]);

  const [selectedIndex, setSelectedIndex] = useState(0);

  // 거래처 관리 모달 상태
  const [vendorModalOpen, setVendorModalOpen] = useState(false);
  const [siteVendorMappingOpen, setSiteVendorMappingOpen] = useState(false);
  const [vendorList, setVendorList] = useState(() => getVendorList());
  useEffect(() => { fetchVendorList().then(setVendorList).catch(console.error); }, []);
  const [selectedVendorId, setSelectedVendorId] = useState(() => {
    const list = getVendorList();
    return list[0]?.id || '';
  });
  const [siteVendorMappings, setSiteVendorMappings] = useState([]);
  const [vendorPicker, setVendorPicker] = useState(null);
  useEffect(() => { apiClient.get('/api/settlement/site-vendor-mappings').then((data) => setSiteVendorMappings(data.mappings || [])).catch(console.error); }, []);
  const [targetYm, setTargetYm] = useState('202607');
  const [isDriveDownloading, setIsDriveDownloading] = useState(false);

  // 현장 필터 및 매칭 상태
  const [siteSearch, setSiteSearch] = useState('');
  const [matchedItems, setMatchedItems] = useState({}); // { itemId: { siteId, siteName, vendorName, filename } }
  const [selectedMatchedId, setSelectedMatchedId] = useState(null);
  const [matchedPreview, setMatchedPreview] = useState(null);

  // 정산 관리 전용 현장 제외 키워드 ('오수처리장', '양북임시', '시화호', '낙동강' 2개 등)
  const isExcludedSite = (siteName = '') => {
    return ['오수처리장', '양북임시', '시화호', '낙동강'].some(keyword => siteName.includes(keyword));
  };

  // 가나다 정렬 현장 목록 (제외 대상 현장 제외)
  const sortedSites = useMemo(() => {
    const rawList = Array.isArray(siteMaster) ? siteMaster : [];
    const filtered = rawList.filter(s => !isExcludedSite(s.site_name));
    return [...filtered].sort((a, b) => (a.site_name || '').localeCompare(b.site_name || '', 'ko'));
  }, [siteMaster]);

  // 미지정 현장 목록
  const availableSites = useMemo(() => {
    return sortedSites.filter(s => {
      const sId = s.site_id || s.id;
      const mapping = siteVendorMappings.find((item) => item.site_id === String(sId)) || siteVendorMappings.find((item) => item.site_name === s.site_name);
      const mappedValues = [mapping?.sludge_vendor_id_1, mapping?.sludge_vendor_id_2, mapping?.medicine_vendor_id, mapping?.water_vendor_id, mapping?.kit_vendor_id].filter(Boolean);
      const requiredVendorIds = mappedValues.map((value) => {
        const token = String(value).replace(/\s+/g, '');
        return vendorList.find((vendor) => [vendor.id, vendor.company_name, vendor.short_name].some((name) => {
          const candidate = String(name || '').replace(/\s+/g, '');
          return candidate === token || candidate.includes(token) || token.includes(candidate);
        }))?.id;
      }).filter(Boolean);
      const completed = requiredVendorIds.length > 0 && requiredVendorIds.every((vendorId) => Object.values(matchedItems).some((item) => item.siteId === sId && item.vendorId === vendorId));
      return !completed && (s.site_name || '').toLowerCase().includes(siteSearch.toLowerCase());
    });
  }, [sortedSites, siteSearch, siteVendorMappings, vendorList, matchedItems]);

  const activeItem = splitItems[selectedIndex] || null;
  const activeMatched = activeItem ? matchedItems[activeItem.id] : null;
  const selectedMatchedItem = selectedMatchedId ? matchedItems[selectedMatchedId] : null;

  // 거래처 목록 동기화
  const handleVendorChange = (nextList) => {
    setVendorList(nextList);
    if (!selectedVendorId && nextList.length > 0) {
      setSelectedVendorId(nextList[0].id);
    }
  };

  // 원클릭 현장 지정 매칭
  const handleSelectSite = (site, vendorOverride) => {
    if (!activeItem) return;

    const activeVendor = vendorOverride || vendorList.find(v => v.id === selectedVendorId) || vendorList[0];
    const vendorShort = activeVendor?.short_name || activeVendor?.company_name || '거래처';

    const filename = `입금표_${targetYm}_${site.site_name} ${vendorShort}.jpg`;

    const targetSiteId = site.site_id || site.id;
    setMatchedItems(prev => ({
      ...prev,
      [activeItem.id]: {
        itemId: activeItem.id,
        siteId: targetSiteId,
        siteName: site.site_name,
        vendorId: activeVendor?.id || '',
        vendorName: vendorShort,
        filename,
      }
    }));

    setVendorPicker(null);

    // 다음 미지정 입금표 카드로 포커스 자동 이동
    const nextUnmatchedIndex = splitItems.findIndex((item, idx) => idx > selectedIndex && !matchedItems[item.id]);
    if (nextUnmatchedIndex !== -1) {
      setSelectedIndex(nextUnmatchedIndex);
    }
  };

  const openSiteVendorPicker = (event, site) => {
    if (!activeItem) return;
    const siteId = String(site.site_id || site.id);
    const mapping = siteVendorMappings.find((item) => item.site_id === siteId) || siteVendorMappings.find((item) => item.site_name === site.site_name);
    const mappedIds = [mapping?.sludge_vendor_id_1, mapping?.sludge_vendor_id_2, mapping?.medicine_vendor_id, mapping?.water_vendor_id, mapping?.kit_vendor_id].filter(Boolean);
    const findVendor = (value) => {
      const token = String(value || '').replace(/\s+/g, '');
      return vendorList.find((vendor) => {
        const names = [vendor.id, vendor.company_name, vendor.short_name].map((name) => String(name || '').replace(/\s+/g, ''));
        return names.some((name) => name === token || name.includes(token) || token.includes(name));
      });
    };
    const vendors = [...new Map(mappedIds.map((value) => [value, findVendor(value)]).filter(([, vendor]) => vendor)).values()];
    if (!vendors.length) return alert(`${site.site_name}의 거래처 정보를 찾지 못했습니다. 시트의 업체명 또는 거래처 ID를 확인해 주세요.`);
    setVendorPicker({ site, vendors, x: Math.min(event.clientX + 18, window.innerWidth - 280), y: Math.min(event.clientY - 18, window.innerHeight - 240) });
  };

  // 되돌리기
  const handleUndoMatch = () => {
    if (!selectedMatchedId) return;
    const item = matchedItems[selectedMatchedId];
    if (!item) return;

    setMatchedItems(prev => {
      const next = { ...prev };
      delete next[selectedMatchedId];
      return next;
    });

    setSelectedMatchedId(null);
  };

  // 실시간 예상 파일명
  const getLiveFilename = (siteName = '현장명') => {
    const activeVendor = vendorList.find(v => v.id === selectedVendorId) || vendorList[0];
    const vendorShort = activeVendor?.short_name || activeVendor?.company_name || '업체명(단축명)';
    return `입금표_${targetYm}_${siteName} ${vendorShort}.jpg`;
  };

  const handleSaveWork = async () => {
    const entries = Object.values(matchedItems).map((item) => ({
      filename: item.filename,
      imageDataUrl: splitItems.find((split) => split.id === item.itemId)?.imageDataUrl,
    }));
    if (!entries.length) return alert('저장할 입금표 매칭이 없습니다.');
    if (entries.some((entry) => !entry.imageDataUrl)) return alert('입금표 이미지를 준비하지 못했습니다.');
    try {
      let savedCount = 0;
      let targetDir = '';
      for (const entry of entries) {
        const result = await apiClient.post('/api/settlement/save-matched-images', { targetYm, documentType: 'deposit', entries: [entry] }, { timeout: 300000 });
        savedCount += result.savedFiles?.length || 0;
        targetDir = result.targetDir || targetDir;
      }
      alert(`${savedCount}개 입금표를 저장했습니다.\n${targetDir}\nDrive 백그라운드 전송을 시작했습니다.`);
      setMatchedItems({});
      setSelectedMatchedId(null);
      setVendorPicker(null);
    } catch (error) {
      alert(`입금표 저장에 실패했습니다.\n${error.message}`);
    }
  };

  const handleDriveDownload = async () => {
    setIsDriveDownloading(true);
    try {
      const response = await apiClient.getRaw('/api/settlement/drive-folder-download', { targetYm, documentType: 'deposit' });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Drive 입금표 폴더를 찾지 못했습니다.');
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `입금표_${targetYm}.zip`; document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
    } catch (error) { alert(error.message); } finally { setIsDriveDownloading(false); }
  };

  return (
    <div style={containerStyle}>
      {/* ── 헤더 바 ── */}
      <div style={headerBarStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <FileCheck size={22} color="#16a34a" />
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
              입금표 관리 (1페이지 4분할 크롭)
            </h2>
            <span style={{ fontSize: '12px', color: '#64748b' }}>
              A4 1페이지 4개 입금표 ROI 자동 분할 & 성적서 방식 3열 고속 매칭
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button onClick={handleDriveDownload} disabled={isDriveDownloading} style={btnWebappStyle}>
            {isDriveDownloading ? <Loader2 size={14} className="spin" /> : <Download size={14} />} Drive 입금표 {targetYm} 다운로드
          </button>
          <button
            onClick={() => setSiteVendorMappingOpen(true)}
            style={btnWebappStyle}
          >
            <Building2 size={14} /> 현장별 거래처 매칭
          </button>
          <button onClick={() => setVendorModalOpen(true)} style={btnVendorStyle}>
            <Building2 size={14} /> 거래처 관리
          </button>
        </div>
      </div>

      {/* ── 3열 고속 매칭 메인 레이아웃 (성적서 수동 매칭 규칙 100% 반영) ── */}
      <div style={grid3ColStyle}>

        {/* ── 1열: 1페이지 4개 분할 입금표 썸네일 목록 (PDF 드롭존 포함) ── */}
        <div
          style={{
            ...col1Style,
            border: isDragging ? '2px dashed #16a34a' : '1.5px solid #e2e8f0',
            background: isDragging ? '#f0fdf4' : '#ffffff'
          }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div style={panelHeaderStyle}>
            <Grid size={14} style={{ marginRight: '6px' }} />
            <span>분할 입금표 목록 ({splitItems.length}개)</span>
          </div>

          {/* PDF 드롭안내 또는 리스트 */}
          <div style={{ padding: '10px 10px 4px 10px' }}>
            <label style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '12px',
              border: '1.5px dashed #cbd5e1',
              borderRadius: '8px',
              background: '#f8fafc',
              cursor: 'pointer',
              textAlign: 'center'
            }}>
              <Upload size={18} color="#16a34a" style={{ marginBottom: '4px' }} />
              <span style={{ fontSize: '12px', fontWeight: 800, color: '#14532d' }}>
                {pdfFile ? '다른 입금표 PDF 파일로 교체' : '여기에 입금표 PDF 드롭 또는 클릭'}
              </span>
              <span style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>
                A4 1페이지당 4개 입금표 카드 분할
              </span>
              <input type="file" accept=".pdf" onChange={handlePdfSelect} style={{ display: 'none' }} />
            </label>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {splitItems.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              const isMatched = Boolean(matchedItems[item.id]);
              return (
                <div
                  key={item.id}
                  onClick={() => setSelectedIndex(idx)}
                  style={{
                    padding: '10px',
                    borderRadius: '8px',
                    border: isSelected ? '2px solid #16a34a' : '1px solid #e2e8f0',
                    background: isSelected ? '#f0fdf4' : isMatched ? '#eff6ff' : '#ffffff',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: 800, fontSize: '12px', color: isSelected ? '#15803d' : '#334155' }}>
                      {item.label}
                    </span>
                  </div>
                  {isMatched && (
                    <span style={{ fontSize: '11px', fontWeight: 800, color: '#16a34a', background: '#dcfce7', padding: '2px 6px', borderRadius: '4px' }}>
                      매칭완료
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── 2열: (상단) 확대 크롭 뷰포트 (110px 고정) + (하단) 남은 현장 리스트 ── */}
        <div style={col2Style}>
          {/* 상단: 확대 크롭 뷰포트 (110px 고정) */}
          <div style={{ ...cropHeaderViewportStyle, height: '210px' }}>
            <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, marginBottom: '4px' }}>
              🧾 {activeItem?.label || '입금표'} 전체 미리보기
            </div>
            <div style={{
              height: '170px',
              background: '#f0fdf4',
              borderRadius: '6px',
              border: '1px dashed #86efac',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#15803d',
              fontWeight: 700,
              fontSize: '13px'
            }}>
              {activeItem?.imageDataUrl ? (
                <img src={activeItem.imageDataUrl} alt={activeItem.label} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              ) : (activeMatched ? `[매칭 완료: ${activeMatched.siteName} (${activeMatched.vendorName})]` : '입금표 PDF를 선택하세요')}
            </div>
          </div>

          {/* 하단: 남은 현장 리스트 (가나다 사전순 정렬) */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ padding: '8px 12px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
              <input
                type="text"
                placeholder="현장명 검색..."
                value={siteSearch}
                onChange={(e) => setSiteSearch(e.target.value)}
                style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
              {sitesLoading ? (
                <div style={{ color: '#94a3b8', fontSize: '12px', textAlign: 'center', padding: '20px' }}>현장 목록 로딩 중...</div>
              ) : availableSites.length === 0 ? (
                <div style={{ color: '#94a3b8', fontSize: '12px', textAlign: 'center', padding: '20px' }}>모든 현장의 지정을 완료하였거나 검색 결과가 없습니다.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {availableSites.map(site => (
                    <div
                      key={site.site_id || site.id || site.site_name}
                      onClick={(event) => openSiteVendorPicker(event, site)}
                      style={siteItemStyle}
                    >
                      <span style={{ fontWeight: 700, fontSize: '13px', color: '#1e293b' }}>{site.site_name}</span>
                      <span style={{ fontSize: '11px', color: '#16a34a', fontWeight: 700 }}>원클릭 지정 ➔</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── 3열: (상단) 지정 완료 현장 리스트 (250px 고정) + (하단) 설정 폼 및 파일명 ── */}
        <div style={col3Style}>
          {/* 상단: 지정 완료 현장 리스트 (250px 고정) */}
          <div style={{ height: '250px', display: 'flex', flexDirection: 'column', borderBottom: '1.5px solid #e2e8f0' }}>
            <div style={{ ...panelHeaderStyle, justifyContent: 'space-between' }}>
              <span>지정 완료 입금표 ({Object.keys(matchedItems).length})</span>
              <button
                onClick={handleUndoMatch}
                disabled={!selectedMatchedId}
                style={{
                  padding: '3px 8px', borderRadius: '4px', border: '1px solid #cbd5e1',
                  background: selectedMatchedId ? '#ffffff' : '#f1f5f9',
                  color: selectedMatchedId ? '#dc2626' : '#94a3b8',
                  fontSize: '11px', fontWeight: 700, cursor: selectedMatchedId ? 'pointer' : 'not-allowed',
                  display: 'flex', alignItems: 'center', gap: '4px'
                }}
              >
                <ArrowLeft size={12} /> 되돌리기
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {Object.values(matchedItems).map(item => {
                const isSelected = selectedMatchedId === item.itemId;
                return (
                  <div
                    key={item.itemId}
                    onClick={() => setSelectedMatchedId(item.itemId)}
                    onDoubleClick={() => {
                      const split = splitItems.find((candidate) => candidate.id === item.itemId);
                      if (split?.imageDataUrl) setMatchedPreview({ item, imageDataUrl: split.imageDataUrl });
                    }}
                    style={{
                      padding: '8px 10px',
                      borderRadius: '6px',
                      border: isSelected ? '2px solid #dc2626' : '1px solid #e2e8f0',
                      background: isSelected ? '#fef2f2' : '#f8fafc',
                      cursor: 'pointer',
                      fontSize: '12px'
                    }}
                  >
                    <div style={{ fontWeight: 800, color: '#0f172a' }}>{item.siteName}</div>
                    <div style={{ color: '#16a34a', fontSize: '11px', wordBreak: 'break-all' }}>{item.filename}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 하단: 입금표 업체 지정 및 실시간 파일명 미리보기 폼 */}
          <div style={{ flex: 1, padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto' }}>
            {/* 입금표 업체/단축명 선택 */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={formLabelStyle}>입금 업체 (단축명)</label>
                <button
                  onClick={() => setVendorModalOpen(true)}
                  style={{ border: 'none', background: 'transparent', color: '#2563eb', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                >
                  + 업체 추가/관리
                </button>
              </div>
              <select
                value={selectedVendorId}
                onChange={(e) => setSelectedVendorId(e.target.value)}
                style={selectStyle}
              >
                {vendorList.map(v => (
                  <option key={v.id} value={v.id}>
                    {v.company_name} ({v.short_name}) - [{v.category}]
                  </option>
                ))}
              </select>
            </div>

            {/* 대상 연월 */}
            <div>
              <label style={formLabelStyle}>대상 연월 (YYYYMM)</label>
              <input
                type="text"
                value={targetYm}
                onChange={(e) => setTargetYm(e.target.value)}
                style={selectStyle}
              />
            </div>

            {/* 실시간 파일명 미리보기 */}
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px', marginTop: 'auto' }}>
              <div style={{ fontSize: '11px', color: '#15803d', fontWeight: 700 }}>📄 저장될 파일명 예시</div>
              <div style={{ fontSize: '12px', color: '#16a34a', fontWeight: 800, marginTop: '2px', wordBreak: 'break-all' }}>
                {selectedMatchedItem?.filename || getLiveFilename()}
              </div>
              <div style={{ fontSize: '10px', color: '#64748b', marginTop: '4px' }}>
                경로: 바탕화면/점검준비/입금표/{targetYm}/
              </div>
            </div>

            {/* 최종 저장 버튼 */}
            <button
              onClick={handleSaveWork}
              style={btnSaveMainStyle}
            >
              <CheckCircle2 size={16} /> 바탕화면 '점검준비' 폴더로 저장
            </button>
          </div>
        </div>

      </div>

      {/* 거래처 관리 모달 */}
      {vendorPicker && (
        <div style={{ position: 'fixed', left: vendorPicker.x, top: vendorPicker.y, zIndex: 1500, width: 260, padding: 10, border: '1px solid #86efac', borderRadius: 10, background: '#fff', boxShadow: '0 12px 28px rgba(15,23,42,.22)' }}>
          <div style={{ marginBottom: 8, fontSize: 12, fontWeight: 800, color: '#166534' }}>{vendorPicker.site.site_name} 거래처 선택</div>
          {vendorPicker.vendors.map((vendor) => {
            const isAssigned = Object.values(matchedItems).some((item) => item.siteId === (vendorPicker.site.site_id || vendorPicker.site.id) && item.vendorId === vendor.id);
            return <button key={vendor.id} onClick={() => !isAssigned && handleSelectSite(vendorPicker.site, vendor)} style={{ display: 'block', width: '100%', padding: '8px 9px', marginBottom: 4, border: '1px solid #e2e8f0', borderRadius: 6, background: isAssigned ? '#dcfce7' : '#f8fafc', color: '#0f172a', textAlign: 'left', cursor: isAssigned ? 'default' : 'pointer', fontWeight: 700, fontSize: 12 }}>
              {isAssigned ? '✓ ' : ''}{vendor.company_name} {vendor.short_name ? `(${vendor.short_name})` : ''}
            </button>
          })}
          <button onClick={() => setVendorPicker(null)} style={{ width: '100%', border: 'none', background: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: 11 }}>닫기</button>
        </div>
      )}
      {matchedPreview && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1800, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,23,42,.42)' }} onMouseDown={() => setMatchedPreview(null)}>
          <div style={{ width: 'min(760px, 88vw)', maxHeight: '86vh', padding: 14, borderRadius: 12, background: '#fff', boxShadow: '0 20px 56px rgba(15,23,42,.32)' }} onMouseDown={(event) => event.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 9, fontSize: 14, fontWeight: 800, color: '#0f172a' }}><span>{matchedPreview.item.siteName} · {matchedPreview.item.vendorName}</span><button onClick={() => setMatchedPreview(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 18 }}>×</button></div>
            <img src={matchedPreview.imageDataUrl} alt={matchedPreview.item.filename} style={{ display: 'block', width: '100%', maxHeight: '72vh', objectFit: 'contain', border: '1px solid #e2e8f0', borderRadius: 8 }} />
          </div>
        </div>
      )}
      <VendorManagerModal
        isOpen={vendorModalOpen}
        onClose={() => setVendorModalOpen(false)}
        onVendorChange={handleVendorChange}
      />
      <SiteVendorMappingModal
        isOpen={siteVendorMappingOpen}
        onClose={() => setSiteVendorMappingOpen(false)}
        sites={sortedSites}
        vendors={vendorList}
      />
    </div>
  );
}

const DEPOSIT_RECEIPT_ROIS = [
  { id: 1, x: 47, y: 94, width: 1146, height: 295 },
  { id: 2, x: 47, y: 496, width: 1146, height: 295 },
  { id: 3, x: 47, y: 898, width: 1146, height: 295 },
  { id: 4, x: 47, y: 1299, width: 1146, height: 295 },
];

function cropDepositReceipt(dataUrl, roi) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const factor = image.naturalWidth / 1240;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(roi.width * factor);
      canvas.height = Math.round(roi.height * factor);
      const context = canvas.getContext('2d');
      context?.drawImage(image, roi.x * factor, roi.y * factor, roi.width * factor, roi.height * factor, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.92));
    };
    image.onerror = () => resolve(null);
    image.src = dataUrl;
  });
}

const containerStyle = {
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  padding: '16px 20px',
  boxSizing: 'border-box',
  overflow: 'hidden',
  fontFamily: "'Outfit', 'Inter', -apple-system, sans-serif"
};

const headerBarStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '14px',
  paddingBottom: '10px',
  borderBottom: '1.5px solid #e2e8f0'
};

const grid3ColStyle = {
  flex: 1,
  display: 'grid',
  gridTemplateColumns: '260px 1fr 340px',
  gap: '14px',
  minHeight: 0,
  overflow: 'hidden'
};

const col1Style = {
  background: '#ffffff',
  border: '1.5px solid #e2e8f0',
  borderRadius: '12px',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden'
};

const col2Style = {
  background: '#ffffff',
  border: '1.5px solid #e2e8f0',
  borderRadius: '12px',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden'
};

const col3Style = {
  background: '#ffffff',
  border: '1.5px solid #e2e8f0',
  borderRadius: '12px',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden'
};

const panelHeaderStyle = {
  padding: '10px 14px',
  background: '#f8fafc',
  borderBottom: '1px solid #e2e8f0',
  fontWeight: 800,
  fontSize: '13px',
  color: '#1e293b',
  display: 'flex',
  alignItems: 'center'
};

const cropHeaderViewportStyle = {
  height: '110px',
  padding: '10px 12px',
  borderBottom: '1.5px solid #e2e8f0',
  background: '#ffffff',
  boxSizing: 'border-box'
};

const siteItemStyle = {
  padding: '10px 12px',
  borderRadius: '8px',
  background: '#f8fafc',
  border: '1px solid #e2e8f0',
  cursor: 'pointer',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  transition: 'all 0.15s ease'
};

const formLabelStyle = {
  display: 'block',
  fontSize: '12px',
  fontWeight: 800,
  color: '#475569'
};

const selectStyle = {
  width: '100%',
  padding: '6px 10px',
  borderRadius: '6px',
  border: '1px solid #cbd5e1',
  fontSize: '12px',
  marginTop: '4px',
  boxSizing: 'border-box'
};

const btnWebappStyle = {
  padding: '7px 12px',
  borderRadius: '6px',
  background: '#eff6ff',
  color: '#2563eb',
  border: '1px solid #bfdbfe',
  fontSize: '12px',
  fontWeight: 700,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: '6px'
};

const btnVendorStyle = {
  padding: '7px 12px',
  borderRadius: '6px',
  background: '#f8fafc',
  color: '#475569',
  border: '1px solid #cbd5e1',
  fontSize: '12px',
  fontWeight: 700,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: '6px'
};

const btnSaveMainStyle = {
  width: '100%',
  padding: '10px',
  borderRadius: '8px',
  background: '#16a34a',
  color: '#ffffff',
  border: 'none',
  fontSize: '13px',
  fontWeight: 800,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px'
};

export default DepositReceiptManagerView;

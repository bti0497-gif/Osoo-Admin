import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { FileText, ArrowLeft, Building2, CheckCircle2, Upload, Loader2, Download } from 'lucide-react';
import { useSiteMaster } from '../certificate/hooks/useSiteMaster';
import { usePdfLoader } from '../certificate/pdf-parser/hooks/usePdfLoader';
import { VendorManagerModal } from './components/VendorManagerModal';
import { getVendorList, fetchVendorList } from './utils/vendorStorage';
import RoiCalibrationModal from './components/RoiCalibrationModal';
import { RoiCropPreview } from './components/RoiCropPreview';
import { DEFAULT_ROI_CONFIG, fetchSettlementRoiConfig, getSettlementRoiConfigSync, saveSettlementRoiConfig } from './utils/settlementRoiConfig';
import { apiClient } from '../../core/api/apiClient.js';

export function TaxInvoiceManagerView() {
  const { siteMaster = [], loading: sitesLoading } = useSiteMaster();

  // 실제 PDF 파서 로더 훅 연동
  const {
    pages: parsedPdfPages,
    loading: pdfLoading,
    pdfProgress,
    loadPdf,
    generateThumbnail,
    reset: resetPdfLoader,
  } = usePdfLoader();

  // PDF 썸네일/미리보기 이미지 맵 상태 { [pageNum]: dataUrl }
  const [pageThumbnails, setPageThumbnails] = useState({});
  // 목록 썸네일과 분리: 확대/교정에는 고해상도 페이지 이미지만 사용한다.
  const [pagePreviewImages, setPagePreviewImages] = useState({});

  // PDF 파싱 데이터 (파일 미업로드 시 빈 배열)
  const pages = useMemo(() => {
    if (parsedPdfPages && parsedPdfPages.length > 0) {
      return parsedPdfPages.map(p => ({
        id: `pdf-page-${p.pageNum}`,
        pageNum: p.pageNum,
        name: `계산서 ${p.pageNum}페이지`,
        thumbnail: pageThumbnails[p.pageNum] || p.thumbnail || null,
        preview: pagePreviewImages[p.pageNum] || pageThumbnails[p.pageNum] || p.thumbnail || null,
      }));
    }
    return [];
  }, [parsedPdfPages, pageThumbnails, pagePreviewImages]);

  const [selectedPageIndex, setSelectedPageIndex] = useState(0);

  // 현재 선택된 페이지의 썸네일 고해상도 렌더링 생성
  useEffect(() => {
    if (parsedPdfPages && parsedPdfPages.length > 0 && selectedPageIndex >= 0 && selectedPageIndex < parsedPdfPages.length) {
      const pageObj = parsedPdfPages[selectedPageIndex];
      if (pageObj && !pageThumbnails[pageObj.pageNum]) {
        generateThumbnail(selectedPageIndex, parsedPdfPages, 0.8, { documentCrop: true }).then(thumb => {
          if (thumb) {
            setPageThumbnails(prev => ({ ...prev, [pageObj.pageNum]: thumb }));
          }
        });
      }
    }
  }, [selectedPageIndex, parsedPdfPages, pageThumbnails, generateThumbnail]);

  useEffect(() => {
    const page = parsedPdfPages?.[selectedPageIndex];
    if (!page || pagePreviewImages[page.pageNum]) return;
    generateThumbnail(selectedPageIndex, parsedPdfPages, 3.5, { documentCrop: true }).then((image) => {
      if (image) setPagePreviewImages((previous) => ({ ...previous, [page.pageNum]: image }));
    });
  }, [selectedPageIndex, parsedPdfPages, pagePreviewImages, generateThumbnail]);

  // 문서 옵션 상태
  const [invoiceType, setInvoiceType] = useState('sales'); // 'sales': 매출계산서, 'purchase': 일반계산서(매입)
  const [salesCategory] = useState('용역비'); // '용역비' | '슬러지'
  const [vendorModalOpen, setVendorModalOpen] = useState(false);
  const [vendorList, setVendorList] = useState(() => getVendorList());
  useEffect(() => { fetchVendorList().then(setVendorList).catch(console.error); }, []);
  const [selectedVendorId, setSelectedVendorId] = useState(() => {
    const list = getVendorList();
    return list[0]?.id || '';
  });
  const [targetYm, setTargetYm] = useState('202607');
  const [isDriveDownloading, setIsDriveDownloading] = useState(false);

  // ROI 미리보기 프리셋 및 영구 정밀 교정 도구 상태
  const [roiPreset, setRoiPreset] = useState('dual');
  const [showRoiCalibrator, setShowRoiCalibrator] = useState(false);
  const [roiEditingProfile, setRoiEditingProfile] = useState('purchase');
  const [roiSettings, setRoiSettings] = useState(() => getSettlementRoiConfigSync());

  // 앱 부팅 시 AppData 영구 JSON 파일에서 최신 ROI 설정 비동기 적재
  useEffect(() => {
    fetchSettlementRoiConfig().then(config => {
      if (config) {
        setRoiSettings(config);
      }
    });
  }, []);

  // 일반계산서(매입) 현장 선택 시 거래처 팝업 상태 및 마우스 좌표
  const [pendingSiteForVendor, setPendingSiteForVendor] = useState(null);
  const [vendorPickerSearch, setVendorPickerSearch] = useState('');
  const [vendorPickerPos, setVendorPickerPos] = useState({ x: 0, y: 0 });

  // 현장별 정산 거래처 매핑 데이터 (구글 시트 연동)
  const [siteVendorMappings, setSiteVendorMappings] = useState([]);
  useEffect(() => {
    apiClient.get('/api/settlement/site-vendor-mappings')
      .then(res => {
        if (res && res.success && Array.isArray(res.mappings)) {
          setSiteVendorMappings(res.mappings);
        }
      })
      .catch(err => console.warn('[TaxInvoiceManagerView] 현장 거래처 매핑 로드 오류:', err));
  }, []);

  // 현장 필터 및 매칭 상태
  const [siteSearch, setSiteSearch] = useState('');
  const [selectedAvailableSiteId, setSelectedAvailableSiteId] = useState(null);
  const [usedSiteCategories, setUsedSiteCategories] = useState(new Set()); // 매출계산서용 {siteId_용역비, siteId_슬러지}
  const [usedPurchaseCategories, setUsedPurchaseCategories] = useState(new Set()); // 일반계산서용 {siteId_약품, siteId_키트, siteId_슬러지, siteId_수질분석}
  const [matchedPages, setMatchedPages] = useState({}); // { pageId: { siteId, siteName, customFilename } }
  const [selectedMatchedId, setSelectedMatchedId] = useState(null);
  const [matchedPreview, setMatchedPreview] = useState(null);

  // 모든 현장을 표출한다.
  const isExcludedSite = () => false;
  const isMultiSludgeVendorSite = useCallback((siteName = '') => siteName.includes('천안휴게소'), []);
  const getPurchaseCategoryCount = useCallback((siteId, category) => Object.values(matchedPages)
    .filter(item => item.siteId === siteId && item.category === category).length, [matchedPages]);
  const getSalesCategoryCount = useCallback((siteId, category) => Object.values(matchedPages)
    .filter(item => item.siteId === siteId && item.category === category).length, [matchedPages]);

  // 구글 시트 매핑 기반 현장별 취급 품목 판단
  const getSiteVendorMapping = useCallback((site) => {
    const sId = String(site?.site_id || site?.id || '').trim();
    const sName = String(site?.site_name || '').trim();
    return siteVendorMappings.find(m => String(m.site_id).trim() === sId || String(m.site_name).trim() === sName);
  }, [siteVendorMappings]);

  const getSiteCategoryConfig = useCallback((site) => {
    const mapping = getSiteVendorMapping(site);
    const sName = String(site?.site_name || '');
    if (!mapping) {
      return {
        hasMedicine: true,
        hasKit: true,
        hasWater: true,
        hasSludge1: true,
        hasSludge2: isMultiSludgeVendorSite(sName),
      };
    }
    return {
      hasMedicine: Boolean(String(mapping.medicine_vendor_id || '').trim()),
      hasKit: Boolean(String(mapping.kit_vendor_id || '').trim()),
      hasWater: Boolean(String(mapping.water_vendor_id || '').trim()),
      hasSludge1: Boolean(String(mapping.sludge_vendor_id_1 || '').trim()),
      hasSludge2: Boolean(String(mapping.sludge_vendor_id_2 || '').trim()) || (isMultiSludgeVendorSite(sName) && Boolean(String(mapping.sludge_vendor_id_1 || '').trim())),
    };
  }, [getSiteVendorMapping, isMultiSludgeVendorSite]);

  // 가나다 정렬된 전체 현장 목록
  const sortedSites = useMemo(() => {
    const rawList = Array.isArray(siteMaster) ? siteMaster : [];
    const filtered = rawList.filter(s => !isExcludedSite(s.site_name));
    return [...filtered].sort((a, b) => (a.site_name || '').localeCompare(b.site_name || '', 'ko'));
  }, [siteMaster]);

  // 미지정 현장 목록 (해당 현장이 취급하는 모든 필수 카테고리가 100% 완료되어야만 미지정 목록에서 제외됨!)
  const availableSites = useMemo(() => {
    return sortedSites.filter(s => {
      const sId = s.site_id || s.id;
      const matchesQuery = (s.site_name || '').toLowerCase().includes(siteSearch.toLowerCase());
      if (!matchesQuery) return false;

      const catCfg = getSiteCategoryConfig(s);

      if (invoiceType === 'sales') {
        const isSalesDone = usedSiteCategories.has(`${sId}_용역비`);
        const sludgeMatchCount = getSalesCategoryCount(sId, '슬러지');
        const requiredSludgeCount = catCfg.hasSludge2 ? 2 : (catCfg.hasSludge1 ? 1 : 0);
        const isSludgeDone = requiredSludgeCount === 0 || sludgeMatchCount >= requiredSludgeCount || usedSiteCategories.has(`${sId}_슬러지`);
        const isAllSalesDone = isSalesDone && isSludgeDone;
        return !isAllSalesDone;
      } else {
        const isDrugDone = !catCfg.hasMedicine || usedPurchaseCategories.has(`${sId}_약품`);
        const isKitDone = !catCfg.hasKit || usedPurchaseCategories.has(`${sId}_키트`);
        const isWaterDone = !catCfg.hasWater || usedPurchaseCategories.has(`${sId}_수질분석`);

        const sludgeMatchCount = getPurchaseCategoryCount(sId, '슬러지');
        const requiredSludgeCount = catCfg.hasSludge2 ? 2 : (catCfg.hasSludge1 ? 1 : 0);
        const isSludgeDone = requiredSludgeCount === 0 || sludgeMatchCount >= requiredSludgeCount || usedPurchaseCategories.has(`${sId}_슬러지`);

        // 모든 취급 항목이 100% 매칭 완료되어야만 완료 목록으로 이동!
        const isAllPurchaseDone = isDrugDone && isKitDone && isWaterDone && isSludgeDone;
        return !isAllPurchaseDone;
      }
    });
  }, [sortedSites, usedSiteCategories, usedPurchaseCategories, siteSearch, invoiceType, getSiteCategoryConfig, getSalesCategoryCount, getPurchaseCategoryCount]);

  const activePage = pages[selectedPageIndex] || null;
  const activeMatched = activePage ? matchedPages[activePage.id] : null;
  const selectedMatchedItem = selectedMatchedId ? matchedPages[selectedMatchedId] : null;

  // 거래처 변경 수신
  const handleVendorChange = (nextList) => {
    setVendorList(nextList);
    if (!selectedVendorId && nextList.length > 0) {
      setSelectedVendorId(nextList[0].id);
    }
  };

  // 원클릭 현장 매칭 (매출계산서의 경우 '용역비' / '슬러지' 카테고리별 독립 매칭 지원)
  const handleSelectSite = (site, categoryOverride) => {
    if (!activePage) return;

    const activeVendor = vendorList.find(v => v.id === selectedVendorId) || vendorList[0];
    const vendorShort = activeVendor?.short_name || '거래처';

    let filename = '';
    let matchKey = '';
    const targetSiteId = site.site_id || site.id;

    if (invoiceType === 'sales') {
      const chosenCat = categoryOverride || salesCategory;
      filename = `매출계산서_${targetYm}_${site.site_name} ${chosenCat}.jpg`;
      matchKey = isMultiSludgeVendorSite(site.site_name) && chosenCat === '슬러지'
        ? `${targetSiteId}_${chosenCat}_${activePage.id}`
        : `${targetSiteId}_${chosenCat}`;
      setUsedSiteCategories(prev => new Set([...prev, matchKey]));
    } else {
      filename = `계산서_${targetYm}_${site.site_name} ${vendorShort}.jpg`;
      matchKey = `${targetSiteId}`;
      setUsedPurchaseCategories(prev => new Set([...prev, matchKey]));
    }

    setMatchedPages(prev => ({
      ...prev,
      [activePage.id]: {
        pageId: activePage.id,
        siteId: targetSiteId,
        siteName: site.site_name,
        category: categoryOverride || salesCategory,
        matchKey,
        filename,
      }
    }));

    // 다음 미지정 페이지로 포커스 자동 이동
    const nextUnmatchedIndex = pages.findIndex((p, idx) => idx > selectedPageIndex && !matchedPages[p.id]);
    if (nextUnmatchedIndex !== -1) {
      setSelectedPageIndex(nextUnmatchedIndex);
    }
  };

  // 일반계산서(매입): [약품], [키트], [슬러지], [수질분석] 4개 카테고리 매칭 (단일 거래처시 자동 지정, 복수시 팝업)
  const handlePurchaseCategoryClick = (e, site, category) => {
    if (!activePage) return;
    const sId = site.site_id || site.id;
    const mapping = getSiteVendorMapping(site);

    // 구글 시트에 명시된 해당 현장 & 품목의 거래처 ID/업체명 토큰 추출
    let targetTokens = [];
    if (mapping) {
      if (category === '약품' && mapping.medicine_vendor_id) targetTokens.push(mapping.medicine_vendor_id);
      else if (category === '키트' && mapping.kit_vendor_id) targetTokens.push(mapping.kit_vendor_id);
      else if (category === '수질분석' && mapping.water_vendor_id) targetTokens.push(mapping.water_vendor_id);
      else if (category === '슬러지') {
        if (mapping.sludge_vendor_id_1) targetTokens.push(mapping.sludge_vendor_id_1);
        if (mapping.sludge_vendor_id_2) targetTokens.push(mapping.sludge_vendor_id_2);
      }
    }

    const findVendorByToken = (token) => {
      const cleanToken = String(token || '').replace(/\s+/g, '');
      if (!cleanToken) return null;
      return vendorList.find(vendor => {
        const names = [vendor.id, vendor.company_name, vendor.short_name].map(name => String(name || '').replace(/\s+/g, ''));
        return names.some(name => name === cleanToken || name.includes(cleanToken) || cleanToken.includes(name));
      });
    };

    // 토큰 매칭 거래처들 추출
    let matchingVendors = targetTokens.map(findVendorByToken).filter(Boolean);

    // 구글 시트에 구체적 토큰이 없을 경우 기존 카테고리 필터링 fallback 적용
    if (matchingVendors.length === 0) {
      matchingVendors = vendorList.filter(v =>
        (v.category || '').toLowerCase().includes(category.toLowerCase())
      );
    }

    if (matchingVendors.length === 1) {
      // 1개 단일 거래처일 경우 원클릭 즉시 자동 매칭!
      const vendor = matchingVendors[0];
      const vendorShort = vendor.short_name || vendor.company_name || '거래처';
      const filename = `계산서_${targetYm}_${site.site_name} ${vendorShort}.jpg`;
      const matchKey = (isMultiSludgeVendorSite(site.site_name) || targetTokens.length > 1) && category === '슬러지'
        ? `${sId}_${category}_${vendor.id || vendor.short_name}`
        : `${sId}_${category}`;

      setMatchedPages(prev => ({
        ...prev,
        [activePage.id]: {
          pageId: activePage.id,
          siteId: sId,
          siteName: site.site_name,
          category,
          matchKey,
          filename,
        }
      }));

      setUsedPurchaseCategories(prev => new Set([...prev, matchKey]));

      const nextUnmatchedIndex = pages.findIndex((p, idx) => idx > selectedPageIndex && !matchedPages[p.id]);
      if (nextUnmatchedIndex !== -1) {
        setSelectedPageIndex(nextUnmatchedIndex);
      }
    } else if (matchingVendors.length > 1) {
      // 천안휴게소(천안위생, 정화회) 등 복수 벤더 존재시: 포인터 위치에 해당 벤더들 목록 팝업 띄우기
      const pointerX = e?.clientX ?? 400;
      const pointerY = e?.clientY ?? 200;
      const popupWidth = 410;
      const popupHeight = 380;
      const firstVendorRowOffsetY = 132;
      const posX = Math.max(10, Math.min(pointerX + 38, window.innerWidth - popupWidth - 10));
      const posY = Math.max(10, Math.min(pointerY - firstVendorRowOffsetY, window.innerHeight - popupHeight - 10));

      setVendorPickerPos({ x: posX, y: posY });
      setPendingSiteForVendor({ ...site, selectedCategory: category, filteredVendors: matchingVendors });
      setVendorPickerSearch(category);
    } else {
      alert(`${site.site_name}의 ${category} 거래처 정보를 찾지 못했습니다. 구글 시트의 거래처 매핑을 확인해 주세요.`);
    }
  };

  // 일반계산서(매입): 거래처 팝업에서 거래처 최종 클릭 시 매칭 확정 & 다음 페이지로 자동 포커스
  const handleConfirmVendorForSite = (vendor) => {
    if (!pendingSiteForVendor || !activePage) return;

    const vendorShort = vendor?.short_name || vendor?.company_name || '거래처';
    const filename = `계산서_${targetYm}_${pendingSiteForVendor.site_name} ${vendorShort}.jpg`;
    const targetSiteId = pendingSiteForVendor.site_id || pendingSiteForVendor.id;
    const category = pendingSiteForVendor.selectedCategory || vendor.category || '기타';
    const matchKey = isMultiSludgeVendorSite(pendingSiteForVendor.site_name) && category === '슬러지'
      ? `${targetSiteId}_${category}_${vendor.id}`
      : `${targetSiteId}_${category}`;

    setMatchedPages(prev => ({
      ...prev,
      [activePage.id]: {
        pageId: activePage.id,
        siteId: targetSiteId,
        siteName: pendingSiteForVendor.site_name,
        category,
        matchKey,
        filename,
      }
    }));

    setUsedPurchaseCategories(prev => new Set([...prev, matchKey]));
    setPendingSiteForVendor(null);

    // 다음 미지정 페이지로 포커스 자동 이동
    const nextUnmatchedIndex = pages.findIndex((p, idx) => idx > selectedPageIndex && !matchedPages[p.id]);
    if (nextUnmatchedIndex !== -1) {
      setSelectedPageIndex(nextUnmatchedIndex);
    }
  };

  // 되돌리기 (매칭 해제)
  const handleUndoMatch = () => {
    if (!selectedMatchedId) return;
    const item = matchedPages[selectedMatchedId];
    if (!item) return;

    if (item.matchKey) {
      setUsedSiteCategories(prev => {
        const next = new Set(prev);
        next.delete(item.matchKey);
        return next;
      });
      setUsedPurchaseCategories(prev => {
        const next = new Set(prev);
        next.delete(item.matchKey);
        return next;
      });
    }

    setMatchedPages(prev => {
      const next = { ...prev };
      delete next[selectedMatchedId];
      return next;
    });

    setSelectedMatchedId(null);
  };

  const resetMatchingWork = useCallback(() => {
    resetPdfLoader();
    setPdfFile(null);
    setPageThumbnails({});
    setPagePreviewImages({});
    setSelectedPageIndex(0);
    setMatchedPages({});
    setUsedSiteCategories(new Set());
    setUsedPurchaseCategories(new Set());
    setSelectedMatchedId(null);
    setSelectedAvailableSiteId(null);
    setPendingSiteForVendor(null);
    setMatchedPreview(null);
    setVendorPickerSearch('');
  }, [resetPdfLoader]);

  const handleSaveWork = async () => {
    const count = Object.keys(matchedPages).length;
    if (!count) {
      alert('저장할 매칭 항목이 없습니다.');
      return;
    }

    try {
      // 저장 시점에 고해상도(scale 2.5) 3mm 크롭 이미지를 실시간 생성하여 100% 잘라내기가 반영되도록 보장
      const entries = [];
      for (const item of Object.values(matchedPages)) {
        const pageObj = parsedPdfPages?.find(candidate => `pdf-page-${candidate.pageNum}` === item.pageId);
        let croppedImageData = null;
        if (pageObj) {
          const pageIndex = pageObj.pageNum - 1;
          croppedImageData = await generateThumbnail(pageIndex, parsedPdfPages, 2.5, { documentCrop: true });
        }
        if (!croppedImageData) {
          const fallbackPage = pages.find(candidate => candidate.id === item.pageId);
          croppedImageData = fallbackPage?.preview || fallbackPage?.thumbnail;
        }

        if (!croppedImageData) {
          alert(`일부 페이지(${item.filename})의 이미지를 준비하지 못했습니다.`);
          return;
        }

        entries.push({ filename: item.filename, imageDataUrl: croppedImageData });
      }

      let targetDir = '';
      let savedCount = 0;
      for (const entry of entries) {
        const result = await apiClient.post('/api/settlement/save-matched-images', { targetYm, entries: [entry] }, { timeout: 300000 });
        savedCount += result.savedFiles.length;
        targetDir = result.targetDir;
      }
      alert(`${savedCount}개 계산서 파일을 성공적으로 저장했습니다!\n${targetDir}\n\nPDF 작업 정보가 리셋되었습니다. 새로운 PDF 파일을 드롭하여 시작하세요.`);
      resetMatchingWork();
    } catch (err) {
      alert(`저장에 실패했습니다.\n${err.message}`);
    }
  };

  const handleDownloadDriveFolder = async () => {
    if (isDriveDownloading) return;
    setIsDriveDownloading(true);
    try {
      const response = await apiClient.getRaw('/api/settlement/drive-folder-download', { targetYm });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Drive 계산서 폴더를 찾지 못했습니다.');
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = `계산서_${targetYm}.zip`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      alert(err.message || `Drive에 계산서/${targetYm} 폴더가 없습니다.`);
    } finally {
      setIsDriveDownloading(false);
    }
  };

  const handlePreviewMatched = (item) => {
    const pageIndex = pages.findIndex(page => page.id === item.pageId);
    if (pageIndex >= 0) {
      setSelectedMatchedId(item.pageId);
      setMatchedPreview({ item, page: pages[pageIndex] });
    }
  };

  const getUniqueFilename = (baseFilename, excludingPageId) => {
    const existing = new Set(Object.values(matchedPages)
      .filter(item => item.pageId !== excludingPageId)
      .map(item => item.filename));
    if (!existing.has(baseFilename)) return baseFilename;
    const extensionIndex = baseFilename.lastIndexOf('.');
    const stem = extensionIndex >= 0 ? baseFilename.slice(0, extensionIndex) : baseFilename;
    const extension = extensionIndex >= 0 ? baseFilename.slice(extensionIndex) : '';
    let number = 2;
    while (existing.has(`${stem} (${number})${extension}`)) number += 1;
    return `${stem} (${number})${extension}`;
  };

  const handleReassignSalesCategory = (item, category) => {
    if (item.category === category) return;
    const baseFilename = `매출계산서_${targetYm}_${item.siteName} ${category}.jpg`;
    const filename = getUniqueFilename(baseFilename, item.pageId);
    const nextMatchKey = isMultiSludgeVendorSite(item.siteName) && category === '슬러지'
      ? `${item.siteId}_${category}_${item.pageId}`
      : `${item.siteId}_${category}`;
    const oldMatchKey = item.matchKey;
    setMatchedPages(previous => ({ ...previous, [item.pageId]: { ...item, category, matchKey: nextMatchKey, filename } }));
    setUsedSiteCategories(previous => {
      const next = new Set(previous);
      const oldStillUsed = Object.values(matchedPages).some(other => other.pageId !== item.pageId && other.matchKey === oldMatchKey);
      if (!oldStillUsed) next.delete(oldMatchKey);
      next.add(nextMatchKey);
      return next;
    });
    setMatchedPreview(previous => previous ? { ...previous, item: { ...item, category, matchKey: nextMatchKey, filename } } : previous);
  };

  // 실시간 예상 파일명 구하기
  const getLiveFilename = (siteName = '현장명') => {
    const activeVendor = vendorList.find(v => v.id === selectedVendorId) || vendorList[0];
    const vendorShort = activeVendor?.short_name || '거래처명';
    if (invoiceType === 'sales') {
      return `매출계산서_${targetYm}_${siteName} ${salesCategory}.jpg`;
    }
    return `계산서_${targetYm}_${siteName} ${vendorShort}.jpg`;
  };

  const [pdfFile, setPdfFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  // PDF 파일 선택 / 드롭 처리 (PDF 전체 페이지 실제 로드 & 자동 판단)
  const handlePdfSelect = async (e) => {
    const files = e.target.files || e.dataTransfer?.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    if (file.name.toLowerCase().endsWith('.pdf')) {
      setPdfFile(file);
      // 새 PDF는 독립 작업 단위다. 이전 문서의 현장/거래처 매칭 상태를 남기지 않는다.
      resetMatchingWork();
      // 파일명 자동 판단: '매출' 포함 여부
      if (file.name.includes('매출')) {
        setInvoiceType('sales');
      } else {
        setInvoiceType('purchase');
      }

      // PDF 69페이지 전체 실제 로드 및 파싱 실행!
      const loadedPages = await loadPdf(file);
      if (loadedPages && loadedPages.length > 0) {
        setSelectedPageIndex(0);
        setPageThumbnails({});
        setPagePreviewImages({});
        // 첫 페이지 썸네일 고해상도 즉시 생성
        const thumb0 = await generateThumbnail(0, loadedPages, 0.8, { documentCrop: true });
        if (thumb0) {
          setPageThumbnails({ [loadedPages[0].pageNum]: thumb0 });
        }
        // 전체 페이지 썸네일을 순차 백그라운드 렌더링한다.
        // 앞 10페이지만 제한하면 이후 목록에는 영구적으로 자리표시자만 남는다.
        void (async () => {
          for (let i = 1; i < loadedPages.length; i += 1) {
            const thumb = await generateThumbnail(i, loadedPages, 0.6, { documentCrop: true });
            if (thumb) {
              setPageThumbnails(prev => ({ ...prev, [loadedPages[i].pageNum]: thumb }));
            }
            // 렌더링 작업 사이에 브라우저에 제어권을 돌려 스크롤/클릭을 유지한다.
            await new Promise(resolve => setTimeout(resolve, 0));
          }
        })();
      }
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

  return (
    <div style={containerStyle}>
      {/* ── 헤더 바 ── */}
      <div style={headerBarStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <FileText size={22} color="#2563eb" />
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
              계산서 관리 (매입 / 매출)
            </h2>
            <span style={{ fontSize: '12px', color: '#64748b' }}>
              웹앱 크롭 연동 & 성적서 방식 3열 고속 현장 매칭
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            onClick={handleDownloadDriveFolder}
            style={btnWebappStyle}
            disabled={isDriveDownloading}
          >
            {isDriveDownloading ? <Loader2 size={14} className="spin" /> : <Download size={14} />}
            Drive 계산서 {targetYm} 다운로드
          </button>
          <button onClick={() => setVendorModalOpen(true)} style={btnVendorStyle}>
            <Building2 size={14} /> 거래처 관리
          </button>
        </div>
      </div>

      {/* ── 3열 고속 매칭 메인 레이아웃 (AGENTS.md 수동매칭 UI 보호 규칙 100% 반영) ── */}
      <div style={grid3ColStyle}>

        {/* ── 1열: 페이지 목록 썸네일 리스트뷰 (PDF 드롭존 포함) ── */}
        <div
          style={{
            ...col1Style,
            border: isDragging ? '2px dashed #2563eb' : '1.5px solid #e2e8f0',
            background: isDragging ? '#eff6ff' : '#ffffff'
          }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div style={panelHeaderStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>페이지 목록 ({pages.length})</span>
              {pdfFile && (
                <button
                  onClick={resetMatchingWork}
                  style={{
                    padding: '2px 6px', borderRadius: '4px', border: '1px solid #cbd5e1',
                    background: '#ffffff', color: '#dc2626', fontSize: '10px', fontWeight: 700,
                    cursor: 'pointer'
                  }}
                  title="현재 PDF 로드 상태를 완전히 초기화합니다."
                >
                  🔄 초기화
                </button>
              )}
            </div>
            {pdfFile && (
              <span style={{ fontSize: '11px', color: '#2563eb', fontWeight: '700', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px' }}>
                {pdfFile.name}
              </span>
            )}
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
              <Upload size={18} color="#2563eb" style={{ marginBottom: '4px' }} />
              <span style={{ fontSize: '12px', fontWeight: 800, color: '#1e3a8a' }}>
                {pdfFile ? '다른 PDF 파일로 교체' : '여기에 계산서 PDF 드롭 또는 클릭'}
              </span>
              <span style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>
                컴퓨터의 PDF 문서를 끌어다 놓으세요
              </span>
              <input type="file" accept=".pdf" onChange={handlePdfSelect} style={{ display: 'none' }} />
            </label>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {pdfLoading && (
              <div style={{ padding: '10px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', fontSize: '12px', color: '#1d4ed8', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Loader2 size={16} className="animate-spin" />
                <span>{pdfProgress.message || 'PDF 페이지 파싱 중...'}</span>
              </div>
            )}

            {pages.length === 0 && !pdfLoading && (
              <div style={{ padding: '24px 16px', color: '#94a3b8', textAlign: 'center', fontSize: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
                📄 PDF 파일을 선택하거나 드롭하면<br />전체 페이지 목록이 여기에 나타납니다.
              </div>
            )}

            {pages.map((page, idx) => {
              const isSelected = idx === selectedPageIndex;
              const isMatched = Boolean(matchedPages[page.id]);
              return (
                <div
                  key={page.id}
                  onClick={() => setSelectedPageIndex(idx)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '8px',
                    border: isSelected ? '2px solid #2563eb' : '1px solid #e2e8f0',
                    background: isSelected ? '#eff6ff' : isMatched ? '#f0fdf4' : '#ffffff',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {page.thumbnail ? (
                      <img
                        src={page.thumbnail}
                        alt={`P.${page.pageNum}`}
                        style={{ width: '36px', height: '48px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #cbd5e1', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}
                      />
                    ) : (
                      <div style={{ width: '36px', height: '48px', background: '#f1f5f9', borderRadius: '4px', border: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#94a3b8', fontWeight: 700 }}>
                        P.{page.pageNum}
                      </div>
                    )}
                    <div>
                      <span style={{ fontWeight: 800, fontSize: '13px', color: isSelected ? '#2563eb' : '#334155', display: 'block' }}>
                        P.{page.pageNum} 계산서
                      </span>
                      <span style={{ fontSize: '11px', color: '#64748b' }}>{page.name}</span>
                    </div>
                  </div>

                  {isMatched && (
                    <span style={{ fontSize: '10px', fontWeight: 800, color: '#16a34a', background: '#dcfce7', padding: '2px 6px', borderRadius: '4px', whiteSpace: 'nowrap' }}>
                      ✓ 매칭완료
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── 2열: (상단) 현장명/상단 크롭 뷰 (110px 고정) + (하단) 남은 현장 리스트 ── */}
        <div style={col2Style}>
          {/* 상단: 크롭 뷰포트 (고정 높이 235px, 2분할 듀얼 뷰포트) */}
          <div style={cropHeaderViewportStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>🔍 P.{activePage?.pageNum || 1} 2분할 듀얼 확대 뷰포트</span>
                <button
                  onClick={() => {
                    setRoiEditingProfile(invoiceType);
                    setShowRoiCalibrator(true);
                  }}
                  style={{
                    padding: '2px 6px', borderRadius: '4px', border: '1px solid #3b82f6',
                    background: '#eff6ff',
                    color: '#2563eb',
                    fontSize: '10px', fontWeight: 800, cursor: 'pointer'
                  }}
                >
                  🛠️ ROI 정밀 교정 열기
                </button>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {/* 계산서 종류 셀렉터 (매출계산서 / 일반계산서) */}
                <div style={{ display: 'flex', gap: '2px', background: '#f1f5f9', padding: '2px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                  <button
                    onClick={() => setInvoiceType('sales')}
                    style={{
                      padding: '2px 7px', borderRadius: '4px', border: 'none',
                      background: invoiceType === 'sales' ? '#2563eb' : 'transparent',
                      color: invoiceType === 'sales' ? '#ffffff' : '#475569',
                      fontSize: '10px', fontWeight: 800, cursor: 'pointer'
                    }}
                  >
                    🏢 매출계산서
                  </button>
                  <button
                    onClick={() => setInvoiceType('purchase')}
                    style={{
                      padding: '2px 7px', borderRadius: '4px', border: 'none',
                      background: invoiceType === 'purchase' ? '#059669' : 'transparent',
                      color: invoiceType === 'purchase' ? '#ffffff' : '#475569',
                      fontSize: '10px', fontWeight: 800, cursor: 'pointer'
                    }}
                  >
                    📄 일반계산서(매입)
                  </button>
                </div>
                <div style={{ display: 'flex', gap: '3px' }}>
                  <button
                    onClick={() => setRoiPreset('dual')}
                    style={{
                      padding: '2px 6px', borderRadius: '4px', border: '1px solid #cbd5e1',
                      background: roiPreset === 'dual' ? '#2563eb' : '#ffffff',
                      color: roiPreset === 'dual' ? '#ffffff' : '#475569',
                      fontSize: '10px', fontWeight: 700, cursor: 'pointer'
                    }}
                  >
                    📱 듀얼 뷰
                  </button>
                  <button
                    onClick={() => setRoiPreset('top')}
                    style={{
                      padding: '2px 6px', borderRadius: '4px', border: '1px solid #cbd5e1',
                      background: roiPreset === 'top' ? '#2563eb' : '#ffffff',
                      color: roiPreset === 'top' ? '#ffffff' : '#475569',
                      fontSize: '10px', fontWeight: 700, cursor: 'pointer'
                    }}
                  >
                    🏢 상호명
                  </button>
                  <button
                    onClick={() => setRoiPreset('middle')}
                    style={{
                      padding: '2px 6px', borderRadius: '4px', border: '1px solid #cbd5e1',
                      background: roiPreset === 'middle' ? '#2563eb' : '#ffffff',
                      color: roiPreset === 'middle' ? '#ffffff' : '#475569',
                      fontSize: '10px', fontWeight: 700, cursor: 'pointer'
                    }}
                  >
                    📦 품목명
                  </button>
                </div>
              </div>
            </div>

            {activePage?.preview ? (
              <div style={{ display: 'flex', flexDirection: 'row', gap: '8px', height: '190px' }}>
                {/* 1. 좌측: 상호명 영역 (공급자 / 공급받는자) */}
                {(roiPreset === 'dual' || roiPreset === 'top') && (
                  <div style={{ flex: 1, position: 'relative', height: '100%', borderRadius: '6px', border: '1.5px solid #93c5fd', overflow: 'hidden', background: '#ffffff' }}>
                    <div style={{ position: 'absolute', top: '4px', left: '6px', zIndex: 10, background: 'rgba(37, 99, 235, 0.85)', color: '#ffffff', fontSize: '9px', fontWeight: 800, padding: '1px 5px', borderRadius: '3px' }}>
                      🏢 상호명
                    </div>
                    <RoiCropPreview src={activePage.preview} config={getRoiProfile(roiSettings, invoiceType)} kind="supplier" />
                  </div>
                )}

                {/* 2. 우측: 품목명 / 거래내역 영역 */}
                {(roiPreset === 'dual' || roiPreset === 'middle') && (
                  <div style={{ flex: 1, position: 'relative', height: '100%', borderRadius: '6px', border: '1.5px solid #a7f3d0', overflow: 'hidden', background: '#ffffff' }}>
                    <div style={{ position: 'absolute', top: '4px', left: '6px', zIndex: 10, background: 'rgba(5, 150, 105, 0.85)', color: '#ffffff', fontSize: '9px', fontWeight: 800, padding: '1px 5px', borderRadius: '3px' }}>
                      📦 품목명
                    </div>
                    <RoiCropPreview src={activePage.preview} config={getRoiProfile(roiSettings, invoiceType)} kind="item" />
                  </div>
                )}
              </div>
            ) : (
              <div style={{
                height: '145px',
                background: '#f1f5f9',
                borderRadius: '6px',
                border: '1px dashed #cbd5e1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#475569',
                fontWeight: 700,
                fontSize: '12px'
              }}>
                {activeMatched ? `[매칭 완료: ${activeMatched.siteName}]` : `🔍 P.${activePage?.pageNum || 1} 2분할 (상호명 + 품목명) 확대 미리보기`}
              </div>
            )}
          </div>

          {/* 하단: 남은 현장 리스트뷰 (가나다순 정렬) */}
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
                  {availableSites.map(site => {
                    const availableSiteId = site.site_id || site.id || site.site_name;
                    const isSiteSelected = selectedAvailableSiteId === availableSiteId;
                    const catCfg = getSiteCategoryConfig(site);
                    return <div
                      key={site.site_id || site.id || site.site_name}
                      onClick={() => setSelectedAvailableSiteId(availableSiteId)}
                      style={{
                        ...siteItemStyle,
                        cursor: 'pointer',
                        border: isSiteSelected ? '2px solid #2563eb' : '1px solid #e2e8f0',
                        background: isSiteSelected ? '#eff6ff' : '#f8fafc',
                      }}
                    >
                      <span style={{ fontWeight: 700, fontSize: '13px', color: '#1e293b' }}>{site.site_name}</span>

                      {invoiceType === 'sales' ? (
                        <div style={{ display: 'flex', gap: '6px' }}>
                          {usedSiteCategories.has(`${site.site_id || site.id}_용역비`) ? (
                            <span style={{ fontSize: '11px', fontWeight: 800, color: '#15803d', background: '#dcfce7', border: '1px solid #bbf7d0', padding: '3px 8px', borderRadius: '6px', display: 'inline-flex', alignItems: 'center' }}>
                              ✓ 용역비 완료
                            </span>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectSite(site, '용역비');
                              }}
                              style={{ ...btnRowSalesStyle, opacity: 1, cursor: 'pointer' }}
                              title="이 현장의 용역비 매출계산서로 지정"
                            >
                              용역비
                            </button>
                          )}

                          {catCfg.hasSludge1 && ((catCfg.hasSludge2
                            ? getSalesCategoryCount(site.site_id || site.id, '슬러지') >= 2
                            : usedSiteCategories.has(`${site.site_id || site.id}_슬러지`)) ? (
                            <span style={{ fontSize: '11px', fontWeight: 800, color: '#15803d', background: '#dcfce7', border: '1px solid #bbf7d0', padding: '3px 8px', borderRadius: '6px', display: 'inline-flex', alignItems: 'center' }}>
                              ✓ 슬러지 완료 {catCfg.hasSludge2 ? `(${getSalesCategoryCount(site.site_id || site.id, '슬러지')}/2)` : ''}
                            </span>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectSite(site, '슬러지');
                              }}
                              style={{ ...btnRowSludgeStyle, opacity: 1, cursor: 'pointer' }}
                              title="이 현장의 슬러지 매출계산서로 지정"
                            >
                              슬러지 {catCfg.hasSludge2 && getSalesCategoryCount(site.site_id || site.id, '슬러지') === 1 ? '(1/2)' : ''}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: '4px' }}>
                          {/* 약품 - 구글 시트에서 취급하는 현장에만 표시 */}
                          {catCfg.hasMedicine && (
                            usedPurchaseCategories.has(`${site.site_id || site.id}_약품`) ? (
                              <span style={{ fontSize: '10px', fontWeight: 800, color: '#15803d', background: '#dcfce7', border: '1px solid #bbf7d0', padding: '3px 6px', borderRadius: '4px' }}>
                                ✓ 약품 완료
                              </span>
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePurchaseCategoryClick(e, site, '약품');
                                }}
                                style={{ ...btnRowDrugStyle, opacity: 1, cursor: 'pointer' }}
                                title="이 현장의 약품 거래처 매칭"
                              >
                                약품
                              </button>
                            )
                          )}

                          {/* 키트 - 구글 시트에서 취급하는 현장에만 표시 */}
                          {catCfg.hasKit && (
                            usedPurchaseCategories.has(`${site.site_id || site.id}_키트`) ? (
                              <span style={{ fontSize: '10px', fontWeight: 800, color: '#15803d', background: '#dcfce7', border: '1px solid #bbf7d0', padding: '3px 6px', borderRadius: '4px' }}>
                                ✓ 키트 완료
                              </span>
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePurchaseCategoryClick(e, site, '키트');
                                }}
                                style={{ ...btnRowKitStyle, opacity: 1, cursor: 'pointer' }}
                                title="이 현장의 키트 거래처 매칭"
                              >
                                키트
                              </button>
                            )
                          )}

                          {/* 슬러지 - 구글 시트에서 취급하는 현장에만 표시 */}
                          {catCfg.hasSludge1 && (
                            (catCfg.hasSludge2
                              ? getPurchaseCategoryCount(site.site_id || site.id, '슬러지') >= 2
                              : usedPurchaseCategories.has(`${site.site_id || site.id}_슬러지`)) ? (
                              <span style={{ fontSize: '10px', fontWeight: 800, color: '#15803d', background: '#dcfce7', border: '1px solid #bbf7d0', padding: '3px 6px', borderRadius: '4px' }}>
                                ✓ 슬러지 완료 {catCfg.hasSludge2 ? `(${getPurchaseCategoryCount(site.site_id || site.id, '슬러지')}/2)` : ''}
                              </span>
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePurchaseCategoryClick(e, site, '슬러지');
                                }}
                                style={{ ...btnRowSludgeStyle, opacity: 1, cursor: 'pointer' }}
                                title="이 현장의 슬러지 거래처 매칭"
                              >
                                슬러지 {catCfg.hasSludge2 && getPurchaseCategoryCount(site.site_id || site.id, '슬러지') === 1 ? '(1/2)' : ''}
                              </button>
                            )
                          )}

                          {/* 수질분석 - 구글 시트에서 취급하는 현장에만 표시 */}
                          {catCfg.hasWater && (
                            usedPurchaseCategories.has(`${site.site_id || site.id}_수질분석`) ? (
                              <span style={{ fontSize: '10px', fontWeight: 800, color: '#15803d', background: '#dcfce7', border: '1px solid #bbf7d0', padding: '3px 6px', borderRadius: '4px' }}>
                                ✓ 수질분석 완료
                              </span>
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePurchaseCategoryClick(e, site, '수질분석');
                                }}
                                style={{ ...btnRowWaterStyle, opacity: 1, cursor: 'pointer' }}
                                title="이 현장의 수질분석 거래처 매칭"
                              >
                                수질분석
                              </button>
                            )
                          )}
                        </div>
                      )}
                    </div>;
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── 3열: (상단) 지정 완료 현장 리스트 (250px 고정) + (하단) 설정 폼 및 파일명 ── */}
        <div style={col3Style}>
          {/* 상단: 지정 완료 리스트 (250px 고정) */}
          <div style={{ height: '250px', display: 'flex', flexDirection: 'column', borderBottom: '1.5px solid #e2e8f0' }}>
            <div style={{ ...panelHeaderStyle, justifyContent: 'space-between' }}>
              <span>지정 완료 현장 ({Object.keys(matchedPages).length})</span>
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
              {Object.values(matchedPages).map(item => {
                const isSelected = selectedMatchedId === item.pageId;
                return (
                  <div
                    key={item.pageId}
                    onClick={() => setSelectedMatchedId(item.pageId)}
                    onDoubleClick={() => handlePreviewMatched(item)}
                    title="더블클릭하면 해당 계산서 페이지를 미리보기로 엽니다."
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
                    <div style={{ color: '#2563eb', fontSize: '11px', wordBreak: 'break-all' }}>{item.filename}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 하단: 조건 선택 및 실시간 파일명 미리보기 폼 */}
          <div style={{ flex: 1, padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto' }}>
            {/* 계산서 종류 표시 배지 */}
            <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 700 }}>문서 종류</span>
              <span style={{ fontSize: '13px', fontWeight: 800, color: invoiceType === 'sales' ? '#2563eb' : '#0f172a' }}>
                {invoiceType === 'sales' ? '🏷️ 매출계산서' : '🏷️ 일반계산서 (매입)'}
              </span>
            </div>

            {/* 연월 입력 */}
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
            <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', padding: '10px', marginTop: 'auto' }}>
              <div style={{ fontSize: '11px', color: '#0369a1', fontWeight: 700 }}>📄 저장될 파일명 예시</div>
              <div style={{ fontSize: '12px', color: '#0284c7', fontWeight: 800, marginTop: '2px', wordBreak: 'break-all' }}>
                {selectedMatchedItem?.filename || getLiveFilename()}
              </div>
              <div style={{ fontSize: '10px', color: '#64748b', marginTop: '4px' }}>
                경로: 바탕화면/점검준비/계산서/{targetYm}/
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

      {/* 일반계산서용 거래처 선택 마우스 위치 팝업 */}
      {pendingSiteForVendor && (
        <>
          {/* 배경 클릭 시 닫기 투명 오버레이 */}
          <div
            onClick={() => setPendingSiteForVendor(null)}
            style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              zIndex: 1999, background: 'rgba(15,23,42,0.15)'
            }}
          />

          {/* 마우스 클릭 위치 기준 컨텍스트 팝업 (우측 1cm, 첫 목록 위치 Y 상단 맞춤) */}
          <div style={{
            position: 'fixed',
            left: `${vendorPickerPos.x}px`,
            top: `${vendorPickerPos.y}px`,
            width: '410px',
            maxHeight: '380px',
            background: '#ffffff',
            borderRadius: '12px',
            boxShadow: '0 20px 25px -5px rgba(15,23,42,0.3), 0 8px 10px -6px rgba(15,23,42,0.15)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            border: '2px solid #3b82f6',
            zIndex: 2000,
            animation: 'fadeIn 0.15s ease-out'
          }}>
            {/* 팝업 헤더 */}
            <div style={{ padding: '12px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>
                  🏢 [{pendingSiteForVendor.site_name}] 거래처 선택
                </h3>
                <span style={{ fontSize: '11px', color: '#64748b' }}>
                  클릭 시 파일명 확정 & 다음 미지정 페이지로 자동 이동
                </span>
              </div>
              <button
                onClick={() => setPendingSiteForVendor(null)}
                style={{ background: 'none', border: 'none', fontSize: '16px', fontWeight: 700, cursor: 'pointer', color: '#64748b' }}
              >
                ✕
              </button>
            </div>

            {/* 검색창 */}
            <div style={{ padding: '12px 20px', borderBottom: '1px solid #f1f5f9' }}>
              <input
                type="text"
                placeholder="거래처명, 단축명, 구분(약품/슬러지/키트 등) 검색..."
                value={vendorPickerSearch}
                onChange={(e) => setVendorPickerSearch(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', boxSizing: 'border-box' }}
                autoFocus
              />
            </div>

            {/* 거래처 목록 */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {(pendingSiteForVendor.filteredVendors || vendorList)
                .filter(v => {
                  const q = vendorPickerSearch.toLowerCase();
                  const selectedCategory = pendingSiteForVendor.selectedCategory || '';
                  const sId = pendingSiteForVendor.site_id || pendingSiteForVendor.id;

                  // 이미 해당 현장에 매칭 완료된 슬러지 벤더 제외 (천안휴게소 천안위생 / 정화회 중 중복 선택 방지)
                  const isAlreadyMatchedSludge = selectedCategory === '슬러지' && Object.values(matchedPages).some(item =>
                    item.siteId === sId && item.category === '슬러지' && (
                      item.matchKey?.endsWith(`_${v.id}`) ||
                      item.matchKey?.endsWith(`_${v.short_name}`) ||
                      item.filename?.includes(v.short_name || v.company_name)
                    )
                  );

                  if (isAlreadyMatchedSludge) return false;

                  if (pendingSiteForVendor.filteredVendors) {
                    return (v.company_name || '').toLowerCase().includes(q) ||
                      (v.short_name || '').toLowerCase().includes(q) ||
                      (v.category || '').toLowerCase().includes(q);
                  }

                  const isSelectedCategory = (v.category || '').toLowerCase().includes(selectedCategory.toLowerCase());
                  return isSelectedCategory && (
                    (v.company_name || '').toLowerCase().includes(q) ||
                    (v.short_name || '').toLowerCase().includes(q) ||
                    (v.category || '').toLowerCase().includes(q)
                  );
                })
                .map(vendor => (
                  <div
                    key={vendor.id}
                    onClick={() => handleConfirmVendorForSite(vendor)}
                    style={{
                      padding: '12px 14px',
                      borderRadius: '10px',
                      border: '1px solid #e2e8f0',
                      background: '#f8fafc',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#eff6ff';
                      e.currentTarget.style.borderColor = '#3b82f6';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#f8fafc';
                      e.currentTarget.style.borderColor = '#e2e8f0';
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '14px', color: '#1e293b' }}>
                        {vendor.short_name || vendor.company_name}
                        {vendor.short_name && <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 500, marginLeft: '6px' }}>({vendor.company_name})</span>}
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                        구분: <span style={{ color: '#2563eb', fontWeight: 700 }}>{vendor.category || '기타'}</span> {vendor.contact_person ? `| 담당: ${vendor.contact_person}` : ''}
                      </div>
                    </div>

                    <span style={{ fontSize: '12px', fontWeight: 800, color: '#2563eb', background: '#dbeafe', padding: '4px 8px', borderRadius: '6px' }}>
                      선택 ➔
                    </span>
                  </div>
                ))}
            </div>
          </div>
        </>
      )}

      {matchedPreview && (
        <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: '572px', maxWidth: 'calc(100vw - 48px)', maxHeight: '80vh', zIndex: 2500, background: '#fff', border: '2px solid #2563eb', borderRadius: '12px', boxShadow: '0 20px 35px rgba(15,23,42,0.28)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '10px 14px', background: '#eff6ff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', fontWeight: 800, color: '#1e3a8a' }}>
            <span>📄 {matchedPreview.item.filename}</span>
            <button onClick={() => setMatchedPreview(null)} aria-label="미리보기 닫기" style={{ border: 'none', background: 'transparent', color: '#475569', fontSize: '22px', cursor: 'pointer', lineHeight: 1 }}>×</button>
          </div>
          <div style={{ padding: '12px', overflow: 'auto', background: '#f8fafc', textAlign: 'center' }}>
            <img src={matchedPreview.page.preview} alt={matchedPreview.item.filename} style={{ maxWidth: '100%', maxHeight: '62vh', objectFit: 'contain', display: 'inline-block', background: '#fff', border: '1px solid #cbd5e1' }} />
          </div>
          {invoiceType === 'sales' && (
            <div style={{ padding: '10px 14px', display: 'flex', gap: '8px', borderTop: '1px solid #e2e8f0', background: '#fff' }}>
              {['용역비', '슬러지'].map(category => {
                const selected = matchedPreview.item.category === category;
                return <button key={category} onClick={() => handleReassignSalesCategory(matchedPreview.item, category)} style={{ flex: 1, padding: '8px', borderRadius: '7px', border: `1px solid ${selected ? '#2563eb' : '#cbd5e1'}`, background: selected ? '#2563eb' : '#fff', color: selected ? '#fff' : '#475569', fontSize: '12px', fontWeight: 800, cursor: selected ? 'default' : 'pointer' }}>{selected ? `✓ ${category}` : `${category}로 지정`}</button>;
              })}
            </div>
          )}
        </div>
      )}

      {/* 거래처 관리 모달 */}
      <VendorManagerModal
        isOpen={vendorModalOpen}
        onClose={() => setVendorModalOpen(false)}
        onVendorChange={handleVendorChange}
      />

      {/* 계산서 상호명/품목명 영구 영역(ROI) 정밀 지정 모달 */}
      <RoiCalibrationModal
        key={`${showRoiCalibrator ? activePage?.id || 'empty' : 'closed'}-${roiEditingProfile}`}
        isOpen={showRoiCalibrator}
        onClose={() => setShowRoiCalibrator(false)}
        activePage={activePage}
        profile={roiEditingProfile}
        onProfileChange={setRoiEditingProfile}
        currentConfig={roiSettings}
        onChange={() => {}}
        onSave={async (newConfig) => {
          const saved = await saveSettlementRoiConfig(newConfig);
          setRoiSettings(saved);
        }}
      />
    </div>
  );
}

function getRoiProfile(config = {}, profile = 'purchase') {
  if (!config) return DEFAULT_ROI_CONFIG;
  if (profile === 'sales') {
    return {
      ...config,
      supplierX: config.salesSupplierX ?? config.supplierX ?? 2,
      supplierY: config.salesSupplierY ?? 10,
      supplierW: config.salesSupplierW ?? config.supplierW ?? 96,
      supplierH: config.salesSupplierH ?? config.supplierH ?? 26,
      supplierFocusX: config.salesSupplierFocusX ?? config.supplierFocusX ?? 50,
      supplierFocusY: config.salesSupplierFocusY ?? config.supplierFocusY ?? 23,
    };
  }
  return config;
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
  height: '235px',
  padding: '8px 12px',
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
  background: '#2563eb',
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

const btnRowSalesStyle = {
  padding: '4px 10px',
  borderRadius: '6px',
  background: '#2563eb',
  color: '#ffffff',
  border: 'none',
  fontSize: '11px',
  fontWeight: 800,
  cursor: 'pointer',
  boxShadow: '0 1px 2px rgba(37,99,235,0.2)',
  transition: 'all 0.15s ease'
};

const btnRowSludgeStyle = {
  padding: '4px 10px',
  borderRadius: '6px',
  background: '#059669',
  color: '#ffffff',
  border: 'none',
  fontSize: '11px',
  fontWeight: 800,
  cursor: 'pointer',
  boxShadow: '0 1px 2px rgba(5,150,105,0.2)',
  transition: 'all 0.15s ease'
};

const btnRowDrugStyle = {
  padding: '3px 7px',
  borderRadius: '5px',
  background: '#2563eb',
  color: '#ffffff',
  border: 'none',
  fontSize: '10px',
  fontWeight: 800,
  cursor: 'pointer',
  transition: 'all 0.15s ease'
};

const btnRowKitStyle = {
  padding: '3px 7px',
  borderRadius: '5px',
  background: '#7c3aed',
  color: '#ffffff',
  border: 'none',
  fontSize: '10px',
  fontWeight: 800,
  cursor: 'pointer',
  transition: 'all 0.15s ease'
};

const btnRowWaterStyle = {
  padding: '3px 7px',
  borderRadius: '5px',
  background: '#d97706',
  color: '#ffffff',
  border: 'none',
  fontSize: '10px',
  fontWeight: 800,
  cursor: 'pointer',
  transition: 'all 0.15s ease'
};

export default TaxInvoiceManagerView;

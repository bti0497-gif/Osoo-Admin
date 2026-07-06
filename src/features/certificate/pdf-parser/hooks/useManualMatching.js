import { useState, useCallback } from 'react';
import { determinePrefix, generateFileName } from '../utils/namingRules';
import { getApiBase } from '../../../../core/api/serverConfig';

const adminHeaders = () => ({
  'x-user-role': 'super_admin',
  'x-user-name': 'admin',
});

function toBase64Utf8(value) {
  const text = String(value ?? '');
  if (!text) return '';
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

/**
 * useManualMatching — 성적서 PDF 수동 현장 매칭 상태 관리
 *
 * 워크플로우:
 * 1. PDF 업로드 → 페이지 로드
 * 2. 각 페이지 ROI 확대 표시
 * 3. 사용자가 현장명 드롭다운에서 선택
 * 4. 페이지 이름 확정 (명명규칙 적용)
 * 5. 다음 페이지로 이동 (반복)
 * 6. 모든 페이지 매칭 완료 → 이미지 변환 → Drive 전송
 */

export function useManualMatching(siteMaster) {
  const [step, setStep] = useState('upload'); // 'upload' | 'matching' | 'complete' | 'uploading'
  const [startFromFirstPage, setStartFromFirstPage] = useState(false);

  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [availableSites, setAvailableSites] = useState(new Set()); // 남은 현장
  const [usedSites, setUsedSites] = useState(new Set()); // 빠진 현장
  const [currentSelection, setCurrentSelection] = useState(null); // 현재 선택된 siteId
  const [selectedDate, setSelectedDate] = useState(null);
  const [customFileName, setCustomFileName] = useState('');

  const [uploadProgress, setUploadProgress] = useState({ percent: 0, message: '' });

  /**
   * 현장 마스터 초기화
   */
  const initSiteMaster = useCallback(() => {
    if (siteMaster.length > 0) {
      setAvailableSites(new Set(siteMaster.map(s => s.id)));
      setUsedSites(new Set());
    }
  }, [siteMaster]);

  /**
   * 현재 페이지 현장 선택
   */
  const selectSite = useCallback((siteId) => {
    setCurrentSelection(siteId);
  }, []);

  /**
   * 현재 페이지 매칭 확정
   */
  const confirmMatch = useCallback((pages, setPages) => {
    if (!currentSelection) return;

    const siteId = currentSelection;
    const siteName = siteMaster.find(s => s.id === siteId)?.site_name || '';

    setPages(prev => {
      const next = [...prev];
      next[currentPageIndex] = {
        ...next[currentPageIndex],
        matchedSite: siteName,
        status: 'matched',
      };
      return next;
    });

    // 남은/빠진 현장 목록 업데이트
    setAvailableSites(prev => {
      const next = new Set(prev);
      next.delete(siteId);
      return next;
    });

    setUsedSites(prev => new Set(prev).add(siteId));

    setCurrentSelection(null);

    // 다음 페이지로 이동
    if (currentPageIndex < pages.length - 1) {
      setCurrentPageIndex(prev => prev + 1);
    } else {
      setStep('complete');
    }
  }, [currentSelection, currentPageIndex, siteMaster]);

  /**
   * 매칭 취소
   */
  const cancelMatch = useCallback((siteId, pages, setPages) => {
    const siteName = siteMaster.find(s => s.id === siteId)?.site_name;
    const pageToCancel = pages.find(p => p.matchedSite === siteName);

    if (pageToCancel) {
      setPages(prev => {
        const next = [...prev];
        next[pageToCancel.pageIndex] = {
          ...next[pageToCancel.pageIndex],
          matchedSite: null,
          status: 'pending',
        };
        return next;
      });
    }

    setUsedSites(prev => {
      const next = new Set(prev);
      next.delete(siteId);
      return next;
    });

    setAvailableSites(prev => new Set(prev).add(siteId));
    setCurrentSelection(null);
  }, [siteMaster]);

  /**
   * 원클릭 현장 지정 및 자동 다음 이동 (VM 비즈니스 로직)
   */
  const assignSite = useCallback((siteId, pages, setPages, pdfFileName) => {
    if (!siteId) return;

    const siteName = siteMaster.find(s => s.id === siteId)?.site_name || '';
    const index = currentPageIndex;

    const prefix = determinePrefix(pdfFileName || '');
    const date = selectedDate || 'YYYYMMDD';
    const defaultName = generateFileName(prefix, date, siteName);

    // 1. 페이지 상태 업데이트
    setPages(prev => {
      const next = [...prev];
      if (next[index]) {
        next[index] = {
          ...next[index],
          matchedSite: siteName,
          status: 'matched',
          customFileName: defaultName
        };
      }
      return next;
    });

    // 2. 남은/지정 현장 목록 불변성 유지하며 갱신
    setAvailableSites(prev => {
      const next = new Set(prev);
      next.delete(siteId);
      return next;
    });
    setUsedSites(prev => new Set(prev).add(siteId));

    // 3. 다음 미지정 페이지로 자동 포커스 이동
    const nextUnmatchedIndex = pages.findIndex((p, i) => i > index && p.status === 'pending');
    if (nextUnmatchedIndex !== -1) {
      setCurrentPageIndex(nextUnmatchedIndex);
    } else {
      const firstUnmatchedIndex = pages.findIndex(p => p.status === 'pending');
      if (firstUnmatchedIndex !== -1 && firstUnmatchedIndex !== index) {
        setCurrentPageIndex(firstUnmatchedIndex);
      }
    }
  }, [currentPageIndex, selectedDate, siteMaster]);

  /**
   * 지정 완료 현장 매칭 취소 및 해당 페이지 복원 (VM 비즈니스 로직)
   */
  const undoMatch = useCallback((siteId, pages, setPages) => {
    if (!siteId) return;

    const siteName = siteMaster.find(s => s.id === siteId)?.site_name;
    const pageToCancel = pages.find(p => p.matchedSite === siteName);

    if (pageToCancel) {
      // 1. 페이지 상태 복원
      setPages(prev => {
        const next = [...prev];
        if (next[pageToCancel.pageIndex]) {
          next[pageToCancel.pageIndex] = {
            ...next[pageToCancel.pageIndex],
            matchedSite: null,
            status: 'pending',
          };
        }
        return next;
      });

      // 2. 매칭 취소된 페이지로 자동 포커스 이동
      setCurrentPageIndex(pageToCancel.pageIndex);
    }

    // 3. 목록 불변성 갱신
    setUsedSites(prev => {
      const next = new Set(prev);
      next.delete(siteId);
      return next;
    });
    setAvailableSites(prev => new Set(prev).add(siteId));
  }, [siteMaster]);

  /**
   * 이전 페이지로 이동
   */
  const goToPrevPage = useCallback(() => {
    if (currentPageIndex > 0) {
      setCurrentPageIndex(prev => prev - 1);
      setCurrentSelection(null);
    }
  }, [currentPageIndex]);

  /**
   * 다음 페이지로 이동
   */
  const goToNextPage = useCallback(() => {
    setCurrentPageIndex(prev => prev + 1);
    setCurrentSelection(null);
  }, []);

  /**
   * 특정 페이지로 이동
   */
  const goToPage = useCallback((index) => {
    setCurrentPageIndex(index);
    setCurrentSelection(null);
  }, []);

  /**
   * 이미지 변환 → Drive 전송 시작 (재시도 및 오프라인 백업 포함)
   */
  const startUpload = useCallback(async (pages, pdfDocument, pdfFile, setPages, globalBoxes) => {
    if (!pdfDocument || pages.length === 0) return;
    
    setStep('uploading');
    setUploadProgress({ percent: 0, message: '이미지 변환 및 드라이브 전송 준비 중...' });

    // 실제로 매칭이 완료된 페이지만 업로드 대상으로 필터링하여 진행률 분모를 정밀하게 맞춥니다.
    const matchedTargets = pages.filter(p => p.status === 'matched');
    const total = matchedTargets.length;
    
    if (total === 0) {
      alert('매칭이 완료된 페이지가 없습니다.');
      setStep('matching');
      return;
    }

    // API 호출 전송 헬퍼 (최대 3회 재시도)
    const uploadWithRetry = async (blob, basename, siteName, pageOrder, attempt = 1) => {
      try {
        const formData = new FormData();
        const tempFileName = `certificate-page-${String(pageOrder).padStart(4, '0')}.jpg`;
        
        formData.append('files', blob, tempFileName);
        formData.append('report_date', selectedDate || new Date().toISOString().split('T')[0]);
        const category = (pdfFile?.name || '').includes('폭기조') || (pdfFile?.name || '').includes('포기조') ? 'mlss' : 'certificate';
        formData.append('category', category);
        formData.append('source_pdf_name_b64', toBase64Utf8(pdfFile?.name || ''));
        formData.append('site_name_b64', toBase64Utf8(siteName));
        formData.append('page_order', String(pageOrder));

        const res = await fetch(`${getApiBase()}/api/certificates/manual-upload-file`, {
          method: 'POST',
          headers: adminHeaders(),
          body: formData,
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(`서버 응답 오류 (${res.status}): ${text.substring(0, 150)}`);
        }

        const data = await res.json();
        if (!data.success && data.failed_count > 0) {
          throw new Error(data.errors?.[0]?.message || '드라이브 전송 결과 실패');
        }

        return data;
      } catch (err) {
        console.warn(`[Upload Attempt ${attempt} Failed]`, err.message);
        if (attempt < 3) {
          await new Promise(r => setTimeout(r, 1000));
          return uploadWithRetry(blob, basename, siteName, pageOrder, attempt + 1);
        } else {
          throw err;
        }
      }
    };

    try {
      for (let i = 0; i < matchedTargets.length; i++) {
        const p = matchedTargets[i];
        const pageNum = p.pageNum;
        
        setUploadProgress({
          percent: Math.round((i / total) * 100),
          message: `[${i + 1}/${total}] '${p.matchedSite}' 이미지 렌더링 중...`
        });

        // 1. PDFJS를 통한 고해상도 페이지 렌더링 및 병합 Blob 추출
        const page = await pdfDocument.getPage(pageNum);
        const scale = 2.0;
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas Context 생성 실패');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: ctx, viewport }).promise;

        // 글로벌 ROI 상자 데이터가 있다면 병합 크롭을 하고, 없으면 전체 이미지화
        let finalBlob;
        const roiKeys = globalBoxes ? Object.keys(globalBoxes) : [];
        if (roiKeys.length > 0) {
          const PADDING = 8;
          const ROI_W = 600;
          const crops = roiKeys.map(field => {
            const box = globalBoxes[field];
            const sx = Math.max(0, box.x * scale - PADDING);
            const sy = Math.max(0, box.y * scale - PADDING);
            const sw = Math.min(canvas.width - sx, box.width * scale + PADDING * 2);
            const sh = Math.min(canvas.height - sy, box.height * scale + PADDING * 2);
            const scaleFactor = ROI_W / sw;
            return { sx, sy, sw, sh, dh: Math.round(sh * scaleFactor) };
          });
          const GAP = 6;
          const totalH = crops.reduce((sum, c) => sum + c.dh + GAP, 0);
          const outCanvas = document.createElement('canvas');
          outCanvas.width = ROI_W;
          outCanvas.height = totalH;
          const outCtx = outCanvas.getContext('2d');
          outCtx.fillStyle = '#fff';
          outCtx.fillRect(0, 0, ROI_W, totalH);
          let offsetY = 0;
          for (const c of crops) {
            outCtx.drawImage(canvas, c.sx, c.sy, c.sw, c.sh, 0, offsetY, ROI_W, c.dh);
            offsetY += c.dh + GAP;
          }
          finalBlob = await new Promise(res => outCanvas.toBlob(b => res(b), 'image/jpeg', 0.88));
          outCanvas.width = 0; outCanvas.height = 0;
        } else {
          finalBlob = await new Promise(res => canvas.toBlob(b => res(b), 'image/jpeg', 0.82));
        }

        page.cleanup();
        canvas.width = 0; canvas.height = 0;

        if (!finalBlob) throw new Error('이미지 변환 실패');

        // 2. Drive 및 BigQuery 저장 API 호출 (최대 3회 재시도)
        setUploadProgress({
          percent: Math.round((i / total) * 100),
          message: `[${i + 1}/${total}] '${p.matchedSite}' 전송 중 (최대 3회 재시도)...`
        });

        const targetFileName = p.customFileName || `${p.matchedSite}.jpg`;
        await uploadWithRetry(finalBlob, targetFileName, p.matchedSite, i + 1);
      }

      setUploadProgress({ percent: 100, message: '모든 페이지 드라이브 전송 완료!' });
      
      // 성공했으므로 백업 제거
      localStorage.removeItem('osoo_manual_matching_pending_task');
      
      // 즉시 완료 요약 창으로 전환하여 경합 방지
      setStep('complete');

    } catch (err) {
      console.error('[Upload Process Error]', err);
      // 실패 시 작업 내용 로컬 스토리지에 보존
      const pendingTask = {
        pdfFileName: pdfFile?.name,
        selectedDate: selectedDate,
        customFileName: customFileName,
        pages: pages.map(p => ({
          pageIndex: p.pageIndex,
          pageNum: p.pageNum,
          matchedSite: p.matchedSite,
          status: p.status,
          customFileName: p.customFileName
        }))
      };
      localStorage.setItem('osoo_manual_matching_pending_task', JSON.stringify(pendingTask));

      alert(`업로드 중 오류가 발생하여 중단되었습니다.\n오류: ${err.message}\n현재까지의 작업 내용은 로컬에 안전하게 보존되었습니다. 나중에 복원할 수 있습니다.`);
      setStep('matching');
      setUploadProgress({ percent: 0, message: '' });
    }
  }, [selectedDate, customFileName]);

  /**
   * 초기화
   */
  const reset = useCallback(() => {
    setStep('upload');
    setStartFromFirstPage(false);
    setCurrentPageIndex(0);
    setAvailableSites(new Set(siteMaster.map(s => s.id)));
    setUsedSites(new Set());
    setCurrentSelection(null);
    setSelectedDate(null);
    setCustomFileName('');
    setUploadProgress({ percent: 0, message: '' });
  }, [siteMaster]);

  return {
    // 상태
    step,
    startFromFirstPage,
    currentPageIndex,
    availableSites,
    usedSites,
    currentSelection,
    selectedDate,
    customFileName,
    uploadProgress,

    // 액션
    initSiteMaster,
    setStep,
    setStartFromFirstPage,
    selectSite,
    confirmMatch,
    cancelMatch,
    assignSite,
    undoMatch,
    goToPrevPage,
    goToNextPage,
    goToPage,
    setSelectedDate,
    setCustomFileName,
    setAvailableSites,
    setUsedSites,
    startUpload,
    reset,
  };
}

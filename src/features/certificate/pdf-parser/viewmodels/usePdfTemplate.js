import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'roi_template';
const electron = window.electronAPI || window.electron;

// 기본 ROI 템플릿: 현장명(location) 만 포함
// date / items / results 는 수질 파싱 전용으로 PDF 업로드 기본값에는 불필요
const DEFAULT_ROI_TEMPLATE = {
  location: { x: 229.63, y: 175.04, width: 250, height: 25 }
};

/**
 * PDF ROI 템플릿 관리 Hook
 * Electron IPC(userData 파일)로 저장, localStorage는 fallback
 */
export function usePdfTemplate() {
  const [globalBoxes, setGlobalBoxes] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Object.keys(parsed).length > 0) {
          console.log('[usePdfTemplate] 템플릿 초기 로드 (localStorage):', Object.keys(parsed));
          return parsed;
        }
      }
    } catch (e) {
      console.error('[usePdfTemplate] 초기 로드 실패:', e);
    }
    // 기본 ROI 템플릿으로 폴백 (하드코딩)
    console.log('[usePdfTemplate] 기본 하드코딩 ROI 템플릿 사용');
    return DEFAULT_ROI_TEMPLATE;
  });
  const [activeField, setActiveField] = useState(null);
  const [showTemplateBoxes, setShowTemplateBoxes] = useState(true);
  const [initialized, setInitialized] = useState(false);

  // Electron 파일에서 로드 (더 신뢰성 있음)
  useEffect(() => {
    if (!electron?.roiLoad) { 
      setTimeout(() => setInitialized(true), 0); 
      return; 
    }
    electron.roiLoad().then(result => {
      setTimeout(() => {
        if (result?.success && result.data && Object.keys(result.data).length > 0) {
          setGlobalBoxes(result.data);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(result.data));
          console.log('[usePdfTemplate] 템플릿 로드 (파일):', Object.keys(result.data));
        } else {
          // 파일에 없으면 하드코딩된 기본값 적용
          setGlobalBoxes(DEFAULT_ROI_TEMPLATE);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_ROI_TEMPLATE));
          console.log('[usePdfTemplate] 템플릿 파일 비어있음 -> 기본 템플릿 세팅');
        }
        setInitialized(true);
      }, 0);
    }).catch(() => {
      setTimeout(() => {
        setGlobalBoxes(DEFAULT_ROI_TEMPLATE);
        setInitialized(true);
      }, 0);
    });
  }, []);

  // globalBoxes 변경 시 자동 저장 (파일 + localStorage)
  useEffect(() => {
    if (!initialized) return;
    if (Object.keys(globalBoxes).length > 0) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(globalBoxes));
      } catch (e) {
        console.error('[usePdfTemplate] localStorage 저장 실패:', e);
      }
      if (electron?.roiSave) {
        electron.roiSave(globalBoxes).catch(e =>
          console.error('[usePdfTemplate] 파일 저장 실패:', e)
        );
      }
    }
  }, [globalBoxes, initialized]);

  /**
   * 템플릿 저장
   */
  const saveTemplate = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(globalBoxes));
      console.log('[usePdfTemplate] 템플릿 저장:', Object.keys(globalBoxes));
      return true;
    } catch (e) {
      console.error('[usePdfTemplate] 저장 실패:', e);
      return false;
    }
  }, [globalBoxes]);

  /**
   * 템플릿 초기화
   */
  const clearTemplate = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      if (electron?.roiSave) electron.roiSave({}).catch(() => {});
      setGlobalBoxes({});
      setActiveField(null);
      console.log('[usePdfTemplate] 템플릿 초기화');
      return true;
    } catch (e) {
      console.error('[usePdfTemplate] 초기화 실패:', e);
      return false;
    }
  }, []);

  /**
   * 특정 필드 박스 설정
   */
  const setBox = useCallback((field, box) => {
    setGlobalBoxes(prev => ({
      ...prev,
      [field]: box,
    }));
  }, []);

  /**
   * 특정 필드 박스 제거
   */
  const removeBox = useCallback((field) => {
    setGlobalBoxes(prev => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  /**
   * 박스 토글 (있으면 제거, 없으면 활성화)
   */
  const toggleField = useCallback((field) => {
    setActiveField(prev => prev === field ? null : field);
  }, []);

  /**
   * 템플릿 불러오기 (외부에서 호출)
   */
  const loadTemplate = useCallback(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setGlobalBoxes(parsed);
        return parsed;
      }
      return null;
    } catch (e) {
      console.error('[usePdfTemplate] 수동 로드 실패:', e);
      return null;
    }
  }, []);

  return {
    // State
    globalBoxes,
    activeField,
    showTemplateBoxes,
    
    // Setters
    setGlobalBoxes,
    setActiveField,
    setShowTemplateBoxes,
    
    // Actions
    saveTemplate,
    clearTemplate,
    setBox,
    removeBox,
    toggleField,
    loadTemplate,
    
    // Computed
    hasTemplate: Object.keys(globalBoxes).length > 0,
    fieldCount: Object.keys(globalBoxes).length,
  };
}

export default usePdfTemplate;

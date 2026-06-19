import { useState, useCallback, useRef } from 'react';
import Tesseract from 'tesseract.js';

/**
 * 로컬 OCR (Tesseract.js) + Gemini fallback 훅
 * 1. 로컬 OCR 시도
 * 2. 실패 또는 정확도 낮으면 Gemini 시도
 * 3. 둘 다 실패 시 재시도
 */
export function useLocalOcr() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [logs, setLogs] = useState([]);
  const abortRef = useRef(false);

  const addLog = useCallback((message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = { timestamp, message, type };
    setLogs(prev => [...prev, logEntry]);
    console.log(`[LocalOCR] ${message}`);
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
    setResult(null);
    setError(null);
  }, []);

  /**
   * ROI(Region of Interest) 기반 로컬 OCR
   * 특정 영역만 잘라서 OCR 수행
   */
  const runLocalOcr = useCallback(async (imageBlob, lang = 'kor+eng', region = null) => {
    addLog(`로컬 OCR 시작${region ? ` (영역: ${region.name})` : ''}...`, 'info');
    
    try {
      let processedBlob = imageBlob;
      
      // ROI가 지정된 경우 이미지 자르기
      if (region) {
        processedBlob = await cropImageRegion(imageBlob, region);
        addLog(`영역 자르기 완료: ${region.name}`, 'info');
      }
      
      const result = await Tesseract.recognize(processedBlob, lang, {
        logger: m => {
          if (m.status === 'recognizing text') {
            addLog(`OCR 진행률: ${(m.progress * 100).toFixed(1)}%`, 'progress');
          }
        },
      });

      const { text, confidence } = result.data;
      addLog(`${region?.name || '전체'} OCR 완료 (신뢰도: ${confidence.toFixed(2)})`, 'success');

      return {
        success: true,
        source: 'local',
        confidence,
        text: text.trim(),
        region: region?.name,
      };
    } catch (err) {
      addLog(`${region?.name || 'OCR'} 실패: ${err.message}`, 'error');
      return { success: false, error: err.message, region: region?.name };
    }
  }, [addLog]);

  /**
   * 성적서 ROI 기반 통합 OCR
   * 각 영역별로 최적화된 OCR 수행
   */
  const runCertificateOcr = useCallback(async (imageBlob, regions = null) => {
    addLog('성적서 ROI OCR 시작...', 'info');
    
    // 기본 성적서 영역 정의 (상대 좌표 0-1)
    const defaultRegions = [
      // 채취일 - ④시료채취 "채취일 : 2026.02.13."
      { name: 'date', x: 0.35, y: 0.40, width: 0.25, height: 0.06, lang: 'kor+eng' },
      // 현장명 - ③의뢰내용 "대상의명칭(측정지점)"
      { name: 'site', x: 0.40, y: 0.22, width: 0.55, height: 0.06, lang: 'kor' },
      // 의뢰항목 - "의뢰항목: 부유물질(MLSS)"
      { name: 'items', x: 0.50, y: 0.28, width: 0.45, height: 0.06, lang: 'kor+eng' },
      // 측정값 - ⑤측정분석결과 "10 320.0"
      { name: 'values', x: 0.45, y: 0.48, width: 0.50, height: 0.10, lang: 'kor+eng' },
    ];
    
    const targetRegions = regions || defaultRegions;
    const results = {};
    let totalConfidence = 0;
    let successCount = 0;
    
    // 각 영역별 OCR 수행
    for (const region of targetRegions) {
      const result = await runLocalOcr(imageBlob, region.lang, region);
      if (result.success) {
        results[region.name] = result.text;
        totalConfidence += result.confidence;
        successCount++;
      }
    }
    
    // 결과 병합 및 파싱
    const combinedText = Object.entries(results)
      .map(([name, text]) => `[${name}] ${text}`)
      .join('\n');
    
    const avgConfidence = successCount > 0 ? totalConfidence / successCount : 0;
    const parsedData = parseCertificateRegions(results);
    
    addLog(`ROI OCR 완료 - 평균 신뢰도: ${avgConfidence.toFixed(2)}%`, 'success');
    
    return {
      success: successCount > 0,
      source: 'local-roi',
      confidence: avgConfidence,
      text: combinedText,
      regions: results,
      parsedData,
    };
  }, [runLocalOcr, addLog]);

  /**
   * Gemini API 호출
   */
  const runGeminiOcr = useCallback(async (imageBlob, masterSites, retryCount = 0) => {
    addLog(`Gemini API 시도 (재시도: ${retryCount})...`, 'info');
    
    try {
      const formData = new FormData();
      formData.append('image', imageBlob, 'page.jpg');
      formData.append('masterSites', JSON.stringify(masterSites));

      const res = await fetch('http://localhost:8901/api/generate-content', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `HTTP ${res.status}`);
      }

      const data = await res.json();
      addLog('Gemini OCR 완료', 'success');

      return {
        success: true,
        source: 'gemini',
        text: data.text,
        parsedData: parseGeminiResponse(data.text),
      };
    } catch (err) {
      addLog(`Gemini 실패: ${err.message}`, 'error');
      return { success: false, error: err.message };
    }
  }, [addLog]);

  /**
   * 통합 OCR: 로컬 → Gemini → 재시도
   */
  const processImage = useCallback(async (imageBlob, masterSites = [], options = {}) => {
    const { 
      confidenceThreshold = 70,  // 로컬 OCR 신뢰도 임계값
      maxRetries = 2,           // 최대 재시도 횟수
      useGeminiFirst = false,   // Gemini 먼저 시도
    } = options;

    if (abortRef.current) {
      return { success: false, error: '사용자가 중단했습니다.' };
    }

    setLoading(true);
    setError(null);
    setResult(null);
    clearLogs();

    let lastError = null;
    let retryAttempt = 0;

    while (retryAttempt <= maxRetries) {
      if (retryAttempt > 0) {
        addLog(`재시도 ${retryAttempt}/${maxRetries}...`, 'warning');
        await delay(2000 * retryAttempt); // 점진적 지연
      }

      try {
        let localResult = null;
        let geminiResult = null;

        // 전략 1: Gemini 먼저 (옵션)
        if (useGeminiFirst) {
          geminiResult = await runGeminiOcr(imageBlob, masterSites, retryAttempt);
          if (geminiResult.success) {
            setResult(geminiResult);
            setLoading(false);
            return geminiResult;
          }
        }

        // 전략 2: 로컬 OCR
        localResult = await runLocalOcr(imageBlob);
        if (localResult.success && localResult.confidence >= confidenceThreshold) {
          // 신뢰도 충분하면 로컬 결과 사용
          setResult(localResult);
          setLoading(false);
          return localResult;
        }

        // 신뢰도 낮으면 Gemini 시도
        if (!useGeminiFirst) {
          addLog('로컬 OCR 신뢰도 낮음, Gemini 시도...', 'warning');
          geminiResult = await runGeminiOcr(imageBlob, masterSites, retryAttempt);
          if (geminiResult.success) {
            setResult(geminiResult);
            setLoading(false);
            return geminiResult;
          }
        }

        // 둘 다 실패
        lastError = geminiResult?.error || localResult?.error || '알 수 없는 오류';
        
      } catch (err) {
        lastError = err.message;
        addLog(`예외 발생: ${err.message}`, 'error');
      }

      retryAttempt++;
    }

    // 모든 시도 실패 - 큐에 저장
    const finalError = `모든 OCR 시도 실패 (재시도 ${maxRetries}회): ${lastError}`;
    setError(finalError);
    setLoading(false);
    addLog(finalError, 'error');

    // 실패한 요청을 localStorage에 저장 (나중에 재시도)
    const failedRequest = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      error: finalError,
      lastError,
      retryCount: maxRetries,
    };
    
    const existingQueue = JSON.parse(localStorage.getItem('ocr_retry_queue') || '[]');
    existingQueue.push(failedRequest);
    localStorage.setItem('ocr_retry_queue', JSON.stringify(existingQueue));
    
    addLog(`실패한 요청이 큐에 저장됨 (ID: ${failedRequest.id})`, 'warning');

    return { success: false, error: finalError, queued: true, requestId: failedRequest.id };
  }, [runLocalOcr, runGeminiOcr, addLog, clearLogs]);

  const abort = useCallback(() => {
    abortRef.current = true;
    addLog('사용자가 작업을 중단했습니다.', 'warning');
  }, [addLog]);

  const reset = useCallback(() => {
    abortRef.current = false;
    clearLogs();
    setResult(null);
    setError(null);
    setLoading(false);
  }, [clearLogs]);

  // 재시도 큐 관리 함수
  const getRetryQueue = useCallback(() => {
    const queue = JSON.parse(localStorage.getItem('ocr_retry_queue') || '[]');
    return queue;
  }, []);

  const clearRetryQueue = useCallback(() => {
    localStorage.removeItem('ocr_retry_queue');
    addLog('재시도 큐가 비워졌습니다.', 'info');
  }, [addLog]);

  const retryQueuedItems = useCallback(async (masterSites = []) => {
    const queue = getRetryQueue();
    if (queue.length === 0) {
      addLog('재시도할 항목이 없습니다.', 'warning');
      return { success: false, message: '큐가 비어있습니다' };
    }

    addLog(`${queue.length}개 항목 재시도 시작...`, 'info');
    const results = [];

    for (const item of queue) {
      if (abortRef.current) break;
      
      addLog(`재시도: ${item.id}`, 'info');
      // TODO: 이미지 데이터도 함께 저장했다면 여기서 재시도
      // 현재는 메타데이터만 저장되어 있어 실제 재시도는 이미지가 필요
      
      results.push({ id: item.id, retried: true });
    }

    return { success: true, retried: results.length, results };
  }, [getRetryQueue, addLog]);

  return {
    loading,
    result,
    error,
    logs,
    processImage,
    runCertificateOcr,  // ROI 기반 성적서 OCR
    abort,
    reset,
    clearLogs,
    getRetryQueue,       // 큐 조회
    clearRetryQueue,     // 큐 비우기
    retryQueuedItems,    // 큐 재시도
  };
}

// 유틸리티 함수
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 성적서 텍스트 파싱 (로컬 OCR 결과용)
 */
function parseCertificateText(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  
  const result = {
    siteName: null,
    reportDate: null,
    items: [],
    values: [],
    rawText: text,
  };

  // 날짜 패턴 (YYYY-MM-DD, YYYY.MM.DD, YYYY/MM/DD)
  const datePattern = /(\d{4})[-./](\d{1,2})[-./](\d{1,2})/;
  
  // 숫자 패턴 (소수점 포함)
  const numberPattern = /(\d+\.?\d*)/;

  for (const line of lines) {
    // 날짜 추출
    const dateMatch = line.match(datePattern);
    if (dateMatch && !result.reportDate) {
      const [_, year, month, day] = dateMatch;
      result.reportDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    // 측정항목 및 값 추출
    const itemPatterns = [
      { key: 'BOD', pattern: /BOD|비오디/i },
      { key: 'SS', pattern: /SS|Suspended/i },
      { key: 'TN', pattern: /TN|총질소/i },
      { key: 'TP', pattern: /TP|총인/i },
      { key: 'MLSS', pattern: /MLSS/i },
      { key: '대장균', pattern: /대장균|Coliform/i },
    ];

    for (const { key, pattern } of itemPatterns) {
      if (pattern.test(line)) {
        const numberMatch = line.match(numberPattern);
        if (numberMatch) {
          result.items.push(key);
          result.values.push(numberMatch[1]);
        }
      }
    }

    // 현장명 추출 (첫 번째 줄 또는 특정 패턴)
    if (!result.siteName && line.length > 2 && line.length < 50) {
      if (/ wastewater|처리장|하수|정수/i.test(line)) {
        result.siteName = line;
      }
    }
  }

  return result;
}

/**
 * Gemini 응답 파싱
 */
function parseGeminiResponse(text) {
  try {
    // JSON 형식 시도
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch {
    // JSON 파싱 실패 시 텍스트 파싱
  }

  // 기본 파싱
  return {
    rawText: text,
    parsed: parseCertificateText(text),
  };
}

/**
 * File을 DataURL로 변환
 */
async function fileToDataUrl(file) {
  console.log('[fileToDataUrl] 입력:', file?.constructor?.name, file?.type, file?.size);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      console.log('[fileToDataUrl] 성공:', reader.result?.substring(0, 50) + '...');
      resolve(reader.result);
    };
    reader.onerror = (e) => {
      console.error('[fileToDataUrl] 실패:', e);
      reject(new Error('FileReader 실패'));
    };
    reader.readAsDataURL(file);
  });
}

/**
 * 이미지 특정 영역 자르기
 * @param {File|Blob} imageFile - 원본 이미지
 * @param {Object} region - 영역 정보 (x, y, width, height - 상대 좌표 0-1)
 * @returns {Promise<Blob>} - 잘린 이미지 Blob
 */
async function cropImageRegion(imageFile, region) {
  console.log('[cropImageRegion] 시작:', region?.name, '파일:', imageFile?.constructor?.name);
  return new Promise(async (resolve, reject) => {
    try {
      // File을 DataURL로 변환
      console.log('[cropImageRegion] fileToDataUrl 호출...');
      const dataUrl = await fileToDataUrl(imageFile);
      console.log('[cropImageRegion] dataUrl 받음, 이미지 로드 시작...');
      
      const img = new Image();
      
      img.onload = () => {
        console.log('[cropImageRegion] 이미지 로드 성공:', img.width, 'x', img.height);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // 픽셀 좌표 계산
        const x = Math.floor(region.x * img.width);
        const y = Math.floor(region.y * img.height);
        const width = Math.floor(region.width * img.width);
        const height = Math.floor(region.height * img.height);
        
        console.log('[cropImageRegion] 자를 영역:', { x, y, width, height });
        
        canvas.width = width;
        canvas.height = height;
        
        // 이미지 자르기
        ctx.drawImage(img, x, y, width, height, 0, 0, width, height);
        
        // Canvas를 Blob으로 변환
        canvas.toBlob((blob) => {
          if (blob) {
            console.log('[cropImageRegion] Blob 변환 성공:', blob.size, 'bytes');
            resolve(blob);
          } else {
            reject(new Error('Canvas to Blob 변환 실패'));
          }
        }, 'image/jpeg', 0.95);
      };
      
      img.onerror = (e) => {
        console.error('[cropImageRegion] 이미지 로드 실패:', e);
        reject(new Error('이미지 로드 실패'));
      };
      
      img.src = dataUrl;
    } catch (err) {
      console.error('[cropImageRegion] 에러:', err);
      reject(err);
    }
  });
}

/**
 * ROI별 OCR 결과를 성적서 데이터로 파싱
 * @param {Object} regions - 각 영역별 OCR 결과
 * @returns {Object} - 파싱된 성적서 데이터
 */
function parseCertificateRegions(regions) {
  const result = {
    siteName: null,
    reportDate: null,
    items: [],
    values: [],
    rawRegions: regions,
  };

  // 날짜 파싱 (date 영역)
  if (regions.date) {
    const datePattern = /(\d{4})[-./]?(\d{1,2})[-./]?(\d{1,2})/;
    const match = regions.date.match(datePattern);
    if (match) {
      const [_, year, month, day] = match;
      result.reportDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
  }

  // 현장명 (site 영역)
  if (regions.site) {
    // 첫 줄을 현장명으로 사용
    result.siteName = regions.site.split('\n')[0].trim();
  }

  // 측정항목 및 값 (items 영역)
  if (regions.items) {
    const lines = regions.items.split('\n').map(l => l.trim()).filter(Boolean);
    
    const itemPatterns = [
      { key: 'BOD', pattern: /BOD|비오디/i },
      { key: 'SS', pattern: /SS|Suspended/i },
      { key: 'TN', pattern: /TN|총질소/i },
      { key: 'TP', pattern: /TP|총인/i },
      { key: 'MLSS', pattern: /MLSS|부유물질/i },
      { key: '대장균', pattern: /대장균|Coliform|CFU/i },
    ];

    for (const line of lines) {
      for (const { key, pattern } of itemPatterns) {
        if (pattern.test(line)) {
          // 숫자 추출 (공백이 있는 경우도 처리: "10 320.0" -> "10320.0")
          const numberMatch = line.match(/(\d[\d\s]*\.?\d*)/);
          if (numberMatch && !result.items.includes(key)) {
            const cleanNumber = numberMatch[1].replace(/\s/g, '');
            result.items.push(key);
            result.values.push(cleanNumber);
            break;
          }
        }
      }
    }
  }

  // 추가: mlss 전용 영역 (있는 경우)
  if (regions.mlss && !result.items.includes('MLSS')) {
    const lines = regions.mlss.split('\n').map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      if (/MLSS|부유물질|mg\/L/i.test(line)) {
        // "10 320.0" 같은 형식도 처리
        const numberMatch = line.match(/(\d[\d\s]*\.?\d+)/);
        if (numberMatch) {
          const cleanNumber = numberMatch[1].replace(/\s/g, '');
          result.items.push('MLSS');
          result.values.push(cleanNumber);
          break;
        }
      }
    }
  }

  return result;
}

import React, { useState, useCallback, useEffect, useContext } from 'react';
import { useLocalOcr } from '../hooks/useLocalOcr';
import { DialogContext } from '../../../../components/common/DialogContext';

/**
 * OCR 테스트 뷰
 * 로컬 OCR (Tesseract.js) vs Gemini API 비교 테스트
 */
export function OcrTestView() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [masterSites, setMasterSites] = useState([]);
  const [options, setOptions] = useState({
    confidenceThreshold: 70,
    maxRetries: 2,
    useGeminiFirst: false,
    useRoiMode: true,  // ROI 기반 OCR 모드
  });

  const dialogContext = useContext(DialogContext);
  const showToast = dialogContext?.showToast || ((msg, type = 'info') => alert(`[${type}] ${msg}`));

  const { 
    loading, 
    result, 
    error, 
    logs, 
    processImage, 
    runCertificateOcr,  // ROI 기반 OCR
    abort, 
    reset,
    clearLogs,
  } = useLocalOcr();

  // 현장명 캐시 로드
  useEffect(() => {
    try {
      const cached = localStorage.getItem('master_sites');
      if (cached) {
        setMasterSites(JSON.parse(cached));
      }
    } catch {
      // ignore
    }
  }, []);

  // 파일 선택
  const handleFileSelect = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    
    // 이미지 미리보기 생성
    const reader = new FileReader();
    reader.onload = (event) => {
      setImagePreview(event.target.result);
    };
    reader.readAsDataURL(file);

    // 이전 결과 초기화
    reset();
  }, [reset]);

  // OCR 결과를 토스트로 표시 (테스트 모드)
  const showOcrResultToast = useCallback(() => {
    if (!result || !result.parsedData) {
      showToast('OCR 결과가 없습니다.', 'error');
      return;
    }

    const { parsedData } = result;
    const message = `📋 인식 결과 확인

📍 현장명: ${parsedData.siteName || '❌ 미인식'}
📅 채수일자: ${parsedData.reportDate || '❌ 미인식'}
📊 측정항목: ${parsedData.items?.join(', ') || '❌ 미인식'}
🔬 분석결과: ${parsedData.values?.join(', ') || '❌ 미인식'}

⚡ 출처: ${result.source === 'local-roi' ? 'ROI 로컬 OCR' : result.source === 'local' ? '로컬 OCR' : 'Gemini API'}
📈 신뢰도: ${result.confidence?.toFixed(1) || 'N/A'}%`;

    showToast(message, 'info', 8000); // 8초간 표시
  }, [result, showToast]);

  // 테스트 실행
  const handleTest = useCallback(async () => {
    if (!selectedFile) {
      showToast('먼저 파일을 선택하세요', 'error');
      return;
    }

    let ocrResult;
    if (options.useRoiMode) {
      // ROI 기반 성적서 OCR
      ocrResult = await runCertificateOcr(selectedFile);
    } else {
      // 일반 OCR (전체 이미지)
      ocrResult = await processImage(selectedFile, masterSites, options);
    }
    
    console.log('[OcrTestView] 결과:', ocrResult);

    // 테스트 모드: 결과를 토스트로 즉시 표시
    if (ocrResult.success && ocrResult.parsedData) {
      const { parsedData } = ocrResult;
      const summary = `📋 OCR 테스트 결과

📍 현장명: ${parsedData.siteName || '❌ 미인식'}
📅 채수일자: ${parsedData.reportDate || '❌ 미인식'}
📊 측정항목: ${parsedData.items?.join(', ') || '❌ 미인식'}
🔬 분석결과: ${parsedData.values?.join(', ') || '❌ 미인식'}

✅ 확인되면 "BigQuery 업로드" 버튼을 눌러 저장하세요.`;

      showToast(summary, 'success', 10000); // 10초간 표시
    } else if (!ocrResult.success) {
      showToast(`❌ OCR 실패: ${ocrResult.error || '알 수 없는 오류'}`, 'error', 8000);
    }
  }, [selectedFile, masterSites, options, processImage, runCertificateOcr, showToast]);

  // 로그 색상
  const getLogColor = (type) => {
    switch (type) {
      case 'error': return '#ef4444';
      case 'warning': return '#f59e0b';
      case 'success': return '#22c55e';
      case 'progress': return '#3b82f6';
      default: return '#64748b';
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto', height: 'calc(100vh - 100px)', overflow: 'auto' }}>
      <h2 style={{ marginBottom: '20px' }}>OCR 엔진 테스트</h2>
      
      {/* 설명 */}
      <div style={{ 
        background: '#f1f5f9', 
        padding: '12px 16px', 
        borderRadius: '8px',
        marginBottom: '20px',
        fontSize: '14px',
        color: '#475569'
      }}>
        <strong>테스트 순서:</strong> 로컬 OCR (Tesseract.js) → Gemini API → 재시도<br/>
        <strong>로컬 OCR 신뢰도:</strong> 70% 이상이면 로컬 결과 사용, 미만이면 Gemini 시도
      </div>

      {/* 옵션 설정 */}
      <div style={{ 
        background: '#fff', 
        border: '1px solid #e2e8f0',
        padding: '16px', 
        borderRadius: '8px',
        marginBottom: '20px'
      }}>
        <h3 style={{ marginBottom: '12px', fontSize: '16px' }}>테스트 옵션</h3>
        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="checkbox"
              checked={options.useRoiMode}
              onChange={(e) => setOptions(prev => ({ ...prev, useRoiMode: e.target.checked }))}
            />
            <span>ROI 기반 OCR (성적서 영역별 인식)</span>
          </label>
          
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="checkbox"
              checked={options.useGeminiFirst}
              onChange={(e) => setOptions(prev => ({ ...prev, useGeminiFirst: e.target.checked }))}
            />
            <span>Gemini 먼저 시도</span>
          </label>
          
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>신뢰도 임계값:</span>
            <input
              type="number"
              value={options.confidenceThreshold}
              onChange={(e) => setOptions(prev => ({ ...prev, confidenceThreshold: Number(e.target.value) }))}
              min="0"
              max="100"
              style={{ width: '60px', padding: '4px' }}
            />
            <span>%</span>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>최대 재시도:</span>
            <input
              type="number"
              value={options.maxRetries}
              onChange={(e) => setOptions(prev => ({ ...prev, maxRetries: Number(e.target.value) }))}
              min="0"
              max="5"
              style={{ width: '60px', padding: '4px' }}
            />
            <span>회</span>
          </label>
        </div>
      </div>

      {/* 파일 선택 + 실행 버튼 */}
      <div style={{ marginBottom: '20px' }}>
        <input
          type="file"
          accept="image/*,.pdf"
          onChange={handleFileSelect}
          style={{ marginBottom: '10px' }}
        />
        {selectedFile && (
          <>
            <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '12px' }}>
              선택된 파일: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
            </div>
            
            {/* 실행 버튼 그룹 - 파일 선택 직후 보임 */}
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
              <button
                onClick={handleTest}
                disabled={loading}
                style={{
                  padding: '12px 24px',
                  background: loading ? '#94a3b8' : '#2563eb',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontWeight: 'bold',
                  fontSize: '15px'
                }}
              >
                {loading ? '처리 중...' : '🚀 OCR 테스트 시작'}
              </button>

              {loading && (
                <button
                  onClick={abort}
                  style={{
                    padding: '12px 20px',
                    background: '#ef4444',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: 'bold'
                  }}
                >
                  중단
                </button>
              )}

              <button
                onClick={() => {
                  setSelectedFile(null);
                  setImagePreview(null);
                  reset();
                }}
                style={{
                  padding: '12px 20px',
                  background: '#64748b',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                초기화
              </button>
            </div>
          </>
        )}
      </div>

      {/* 이미지 미리보기 + 결과 */}
      <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
        {/* 이미지 */}
        {imagePreview && (
          <div style={{ flex: 1 }}>
            <h3 style={{ marginBottom: '8px', fontSize: '14px' }}>원본 이미지</h3>
            <img
              src={imagePreview}
              alt="Preview"
              style={{ 
                maxWidth: '100%', 
                maxHeight: '400px',
                border: '1px solid #e2e8f0',
                borderRadius: '4px'
              }}
            />
          </div>
        )}

        {/* 결과 */}
        {result && (
          <div style={{ flex: 1, background: '#f8fafc', padding: '16px', borderRadius: '8px' }}>
            <h3 style={{ marginBottom: '12px', fontSize: '14px' }}>OCR 결과</h3>
            
            <div style={{ marginBottom: '12px' }}>
              <span style={{ 
                padding: '4px 8px', 
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 'bold',
                background: result.source === 'gemini' ? '#dbeafe' : 
                            result.source === 'local-roi' ? '#f0fdf4' : '#dcfce7',
                color: result.source === 'gemini' ? '#1e40af' : 
                       result.source === 'local-roi' ? '#166534' : '#166534'
              }}>
                {result.source === 'gemini' ? 'Gemini API' : 
                 result.source === 'local-roi' ? 'ROI 로컬 OCR' : '로컬 OCR'}
              </span>
              {result.confidence && (
                <span style={{ marginLeft: '8px', fontSize: '12px', color: '#64748b' }}>
                  신뢰도: {result.confidence.toFixed(2)}%
                </span>
              )}
            </div>

            {result.parsedData && (
              <div style={{ fontSize: '14px' }}>
                <div style={{ marginBottom: '8px' }}>
                  <strong>현장명:</strong> {result.parsedData.siteName || '인식 실패'}
                </div>
                <div style={{ marginBottom: '8px' }}>
                  <strong>채수일:</strong> {result.parsedData.reportDate || '인식 실패'}
                </div>
                <div style={{ marginBottom: '8px' }}>
                  <strong>측정항목:</strong> {result.parsedData.items?.join(', ') || '인식 실패'}
                </div>
                <div style={{ marginBottom: '8px' }}>
                  <strong>측정값:</strong> {result.parsedData.values?.join(', ') || '인식 실패'}
                </div>
                
                {/* ROI 영역별 결과 */}
                {result.regions && (
                  <details style={{ marginTop: '12px' }}>
                    <summary style={{ cursor: 'pointer', fontSize: '12px', color: '#64748b' }}>
                      영역별 인식 결과 보기
                    </summary>
                    <div style={{ marginTop: '8px', padding: '8px', background: '#f1f5f9', borderRadius: '4px' }}>
                      {Object.entries(result.regions).map(([name, text]) => (
                        <div key={name} style={{ marginBottom: '8px' }}>
                          <strong style={{ color: '#475569' }}>[{name}]</strong>
                          <pre style={{ margin: '4px 0', fontSize: '11px', whiteSpace: 'pre-wrap' }}>{text}</pre>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}

            <details style={{ marginTop: '12px' }}>
              <summary style={{ cursor: 'pointer', fontSize: '12px', color: '#64748b' }}>
                원본 텍스트 보기
              </summary>
              <pre style={{ 
                marginTop: '8px', 
                padding: '8px', 
                background: '#f1f5f9',
                fontSize: '11px',
                maxHeight: '200px',
                overflow: 'auto',
                whiteSpace: 'pre-wrap'
              }}>
                {result.text}
              </pre>
            </details>
          </div>
        )}
      </div>

      {/* 버튼 */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <button
          onClick={handleTest}
          disabled={loading || !selectedFile}
          style={{
            padding: '10px 20px',
            background: loading ? '#94a3b8' : '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: loading || !selectedFile ? 'not-allowed' : 'pointer',
            fontWeight: 'bold'
          }}
        >
          {loading ? '처리 중...' : 'OCR 테스트 시작'}
        </button>

        {loading && (
          <button
            onClick={abort}
            style={{
              padding: '10px 20px',
              background: '#ef4444',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            중단
          </button>
        )}

        {/* 결과 확인 토스트 버튼 */}
        {result && (
          <button
            onClick={showOcrResultToast}
            style={{
              padding: '10px 20px',
              background: '#22c55e',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            📋 결과 다시 보기
          </button>
        )}

        {/* BigQuery 업로드 버튼 - 잘되면 이거 연결 */}
        {result?.success && (
          <button
            onClick={() => showToast('🚧 BigQuery 업로드는 테스트 확인 후 연결됩니다', 'warning')}
            style={{
              padding: '10px 20px',
              background: '#f59e0b',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            ⬆️ BigQuery 업로드 (준비중)
          </button>
        )}

        <button
          onClick={() => {
            setSelectedFile(null);
            setImagePreview(null);
            reset();
          }}
          style={{
            padding: '10px 20px',
            background: '#64748b',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
        >
          초기화
        </button>
      </div>

      {/* 오류 */}
      {error && (
        <div style={{ 
          background: '#fee2e2', 
          color: '#991b1b',
          padding: '12px 16px',
          borderRadius: '8px',
          marginBottom: '20px'
        }}>
          <strong>오류:</strong> {error}
        </div>
      )}

      {/* 로그 */}
      <div style={{ 
        background: '#1e293b', 
        color: '#e2e8f0',
        padding: '16px', 
        borderRadius: '8px',
        fontFamily: 'monospace',
        fontSize: '12px',
        maxHeight: '300px',
        overflow: 'auto'
      }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '12px',
          borderBottom: '1px solid #334155',
          paddingBottom: '8px'
        }}>
          <strong>실행 로그</strong>
          <button
            onClick={clearLogs}
            style={{
              fontSize: '11px',
              padding: '4px 8px',
              background: '#334155',
              color: '#e2e8f0',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            로그 지우기
          </button>
        </div>
        
        {logs.length === 0 ? (
          <div style={{ color: '#64748b' }}>로그가 없습니다</div>
        ) : (
          logs.map((log, index) => (
            <div key={index} style={{ marginBottom: '4px' }}>
              <span style={{ color: '#64748b' }}>[{log.timestamp}]</span>
              <span style={{ color: getLogColor(log.type), marginLeft: '8px' }}>
                {log.message}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

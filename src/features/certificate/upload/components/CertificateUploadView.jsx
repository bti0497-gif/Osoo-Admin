import React, { useState, useCallback, useRef } from 'react';
import { useExcelParser } from '../../excel-upload/hooks/useExcelParser';
import { useCertificateUpload } from '../hooks/useCertificateUpload';
import { useSiteMaster } from '../../hooks/useSiteMaster';
import { apiClient } from '../../../../core/api';

export function CertificateUploadView() {
  const [excelFiles, setExcelFiles] = useState([]);
  const [excelDragActive, setExcelDragActive] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  
  // 개별 프로그레스 상태
  const [excelProgress, setExcelProgress] = useState({ show: false, percent: 0, message: '' });

  const excelInputRef = useRef(null);

  const { parseExcel, transformToBigQueryFormat, filterValidRows, filterDuplicateRows } = useExcelParser();
  const { uploadToBigQuery } = useCertificateUpload();
  const { siteMaster } = useSiteMaster();

  // Excel 드래그 앤 드롭
  const handleExcelDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setExcelDragActive(true);
    } else if (e.type === 'dragleave') {
      setExcelDragActive(false);
    }
  }, []);

  const handleExcelDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setExcelDragActive(false);
    
    const files = e.dataTransfer.files;
    const excelFiles = Array.from(files).filter(f => 
      f.name.endsWith('.xlsx') || f.name.endsWith('.xls')
    );
    setExcelFiles(prev => [...prev, ...excelFiles]);
  }, []);

  // 파일 선택
  const handleExcelSelect = useCallback((e) => {
    const files = Array.from(e.target.files);
    setExcelFiles(prev => [...prev, ...files]);
  }, []);

  // 파일 제거
  const removeExcelFile = useCallback((index) => {
    setExcelFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  // Excel 업로드
  const handleExcelUpload = useCallback(async () => {
    setIsUploading(true);
    setUploadResult(null);
    setExcelProgress({ show: true, percent: 10, message: '파일 파싱 중...' });
    
    const result = { success: 0, failed: 0, totalRows: 0 };
    
    try {
      for (let i = 0; i < excelFiles.length; i++) {
        const file = excelFiles[i];
        const progress = Math.round(((i + 1) / excelFiles.length) * 100);
        setExcelProgress({ show: true, percent: progress, message: `${file.name} 처리 중...` });
        
        console.log('[Excel Upload] 처리:', file.name);
        try {
          const parseResult = await parseExcel(file);
          if (parseResult.success) {
            setExcelProgress({ show: true, percent: progress, message: '데이터 변환 중...' });
            const validRows = filterValidRows(parseResult.data);
            const bigQueryData = transformToBigQueryFormat(validRows, siteMaster);

            // 날짜 범위에 따른 연/월 목록 추출
            const yearMonths = [...new Set(bigQueryData.map(d => {
              if (!d.report_date) return null;
              const parts = d.report_date.split('-');
              return `${parts[0]}-${parts[1]}`;
            }).filter(Boolean))];

            setExcelProgress({ show: true, percent: progress, message: '중복 데이터 검사 중...' });

            // 각 연/월별로 기존 빅쿼리 데이터 조회
            let existingRows = [];
            for (const ym of yearMonths) {
              const [y, m] = ym.split('-');
              try {
                const res = await apiClient.get(`/api/certificates/water-quality?year=${y}&month=${parseInt(m, 10)}`);
                if (res.success && Array.isArray(res.data)) {
                  existingRows.push(...res.data);
                }
              } catch (e) {
                console.error('[Excel Upload] 기존 데이터 조회 실패:', e);
              }
            }

            // 중복 데이터 필터링
            const finalData = filterDuplicateRows(bigQueryData, existingRows);
            const dupCount = bigQueryData.length - finalData.length;

            if (dupCount > 0) {
              console.log(`[Excel Upload] 중복 데이터 ${dupCount}건 제외됨.`);
            }

            if (finalData.length === 0) {
              console.log('[Excel Upload] 업로드할 새로운 데이터가 없습니다. (모두 중복)');
              result.success++;
              continue;
            }

            setExcelProgress({ show: true, percent: progress, message: `BigQuery 업로드 중 (${finalData.length}행)...` });
            const uploadResult = await uploadToBigQuery(finalData);
            if (uploadResult.success) {
              result.success++;
              result.totalRows += finalData.length;
            } else {
              result.failed++;
            }
          } else {
            result.failed++;
          }
        } catch (err) {
          console.error('[Excel Upload] 처리 오류:', err);
          result.failed++;
        }
      }

      setExcelProgress({ show: true, percent: 100, message: '완료!' });
      
      setUploadResult({
        success: result.failed === 0,
        message: `Excel: ${result.success}개 파일, ${result.totalRows}행 업로드 완료`,
        type: 'excel'
      });

      if (result.failed === 0) {
        setTimeout(() => setExcelProgress({ show: false, percent: 0, message: '' }), 1500);
        setExcelFiles([]);
      }
    } catch (err) {
      setUploadResult({
        success: false,
        message: `Excel 업로드 오류: ${err.message}`,
        type: 'excel'
      });
    } finally {
      setIsUploading(false);
    }
  }, [excelFiles, parseExcel, filterValidRows, transformToBigQueryFormat, uploadToBigQuery]);



  const dropZoneStyle = (isActive, color) => ({
    border: `3px dashed ${isActive ? color : '#94a3b8'}`,
    borderRadius: '12px',
    padding: '40px 20px',
    textAlign: 'center',
    backgroundColor: isActive ? `${color}10` : '#f8fafc',
    transition: 'all 0.3s ease',
    cursor: 'pointer'
  });

  return (
    <div style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto' }}>
      <h2 style={{ marginBottom: '10px' }}>엑셀 수치 올리기</h2>
      <p style={{ color: '#64748b', marginBottom: '30px' }}>
        수정된 엑셀 성적서 파일을 업로드하여 BigQuery의 수질 데이터(`water_quality`) 테이블에 대량 적재합니다.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
        {/* 좌측: Excel 업로드 영역 */}
        <div>
          <h3 style={{ marginBottom: '10px', color: '#2563eb' }}>📊 Excel 파일 (수치 → BigQuery)</h3>
          <div
            style={dropZoneStyle(excelDragActive, '#2563eb')}
            onDragEnter={handleExcelDrag}
            onDragLeave={handleExcelDrag}
            onDragOver={handleExcelDrag}
            onDrop={handleExcelDrop}
            onClick={() => excelInputRef.current?.click()}
          >
            <input
              ref={excelInputRef}
              type="file"
              multiple
              accept=".xlsx,.xls"
              onChange={handleExcelSelect}
              style={{ display: 'none' }}
            />
            <div style={{ fontSize: '48px', marginBottom: '10px' }}>📈</div>
            <p style={{ fontWeight: 'bold', color: '#334155' }}>
              {excelDragActive ? '여기에 놓으세요!' : 'Excel 파일을 드래그하거나 클릭'}
            </p>
            <p style={{ fontSize: '12px', color: '#64748b' }}>.xlsx, .xls 파일 지원</p>
          </div>
        </div>

        {/* 우측: 업로드 안내 및 프로그레스 영역 */}
        <div style={{ 
          border: '1px dashed #cbd5e1', 
          borderRadius: '12px', 
          padding: '20px', 
          backgroundColor: '#f8fafc',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          minHeight: '235px'
        }}>
          {excelFiles.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
              <div style={{ fontSize: '32px', marginBottom: '10px' }}>⏳</div>
              <p style={{ fontWeight: 'bold', color: '#475569' }}>대기 중</p>
              <p style={{ fontSize: '12px', marginTop: '4px', color: '#64748b' }}>왼쪽 영역에 엑셀 파일을 드래그하거나 클릭하여 올려주세요.</p>
            </div>
          ) : (
            <div>
              <h4 style={{ marginBottom: '10px', color: '#1e293b', fontSize: '14px', fontWeight: 'bold' }}>선택된 파일 목록 ({excelFiles.length}개)</h4>
              <div style={{ maxHeight: '150px', overflowY: 'auto', marginBottom: '15px' }}>
                {excelFiles.map((file, index) => (
                  <div key={index} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 12px',
                    backgroundColor: '#eff6ff',
                    borderRadius: '6px',
                    marginBottom: '5px'
                  }}>
                    <span style={{ fontSize: '13px', color: '#1e40af' }}>📄 {file.name}</span>
                    <button
                      onClick={() => removeExcelFile(index)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#dc2626',
                        cursor: 'pointer',
                        fontSize: '16px'
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              {/* Excel 업로드 버튼 */}
              <button
                onClick={handleExcelUpload}
                disabled={isUploading}
                style={{
                  width: '100%',
                  padding: '12px',
                  backgroundColor: isUploading ? '#94a3b8' : '#2563eb',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: isUploading ? 'not-allowed' : 'pointer',
                  fontWeight: 'bold',
                  fontSize: '14px'
                }}
              >
                {isUploading ? '⏳ 업로드 중...' : '📤 Excel 업로드'}
              </button>

              {/* Excel 프로그레스바 */}
              {excelProgress.show && (
                <div style={{ marginTop: '15px' }}>
                  <div style={{ fontSize: '13px', color: '#334155', marginBottom: '5px' }}>
                    ⏳ {excelProgress.message}
                  </div>
                  <div style={{
                    width: '100%',
                    height: '8px',
                    backgroundColor: '#e2e8f0',
                    borderRadius: '4px',
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      width: `${excelProgress.percent}%`,
                      height: '100%',
                      backgroundColor: '#2563eb',
                      transition: 'width 0.3s ease'
                    }} />
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b', textAlign: 'center', marginTop: '3px' }}>
                    {excelProgress.percent}%
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 결과 메시지 */}
      {uploadResult && (
        <div style={{
          marginTop: '20px',
          padding: '15px',
          borderRadius: '8px',
          backgroundColor: uploadResult.success ? '#dcfce7' : '#fee2e2',
          color: uploadResult.success ? '#166534' : '#991b1b',
          textAlign: 'center'
        }}>
          {uploadResult.success ? '✅' : '❌'} {uploadResult.message}
        </div>
      )}
    </div>
  );
}



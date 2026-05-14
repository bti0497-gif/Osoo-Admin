import { useState, useRef } from 'react';
import { Document, pdfjs } from 'react-pdf';
import { PDFDocument } from 'pdf-lib';
import JSZip from 'jszip';

// Set up the worker for react-pdf
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

const toBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = () => {
    const base64 = reader.result.split(',')[1];
    resolve(base64);
  };
  reader.onerror = error => reject(error);
});

const blobToBase64 = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.readAsDataURL(blob);
  reader.onload = () => {
    const base64 = reader.result.split(',')[1];
    resolve(base64);
  };
  reader.onerror = error => reject(error);
});

export function usePdfParser({ onUploadSuccess, onUploadError }) {
  const [file, setFile] = useState(null);
  const [numPages, setNumPages] = useState(null);
  const [activePage, setActivePage] = useState(1);
  const [processing, setProcessing] = useState(false);
  const [extractedData, setExtractedData] = useState(null);
  const [batchProgress, setBatchProgress] = useState({ active: false, current: 0, total: 0, pages: [] });
  const [pdfDoc, setPdfDoc] = useState(null);
  const [apiKey, setApiKey] = useState(localStorage.getItem('custom_gemini_api_key') || '');
  const [masterSites, setMasterSites] = useState(() => {
    try { return JSON.parse(localStorage.getItem('master_sites') || '[]'); } catch { return []; }
  });
  const [globalBoxes, setGlobalBoxes] = useState(() => {
    const saved = localStorage.getItem('roi_template');
    return saved ? JSON.parse(saved) : {};
  });
  const [activeField, setActiveField] = useState(null);
  const [showTemplateBoxes, setShowTemplateBoxes] = useState(true);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentBox, setCurrentBox] = useState(null);
  const containerRef = useRef(null);

  const saveTemplate = () => {
    localStorage.setItem('roi_template', JSON.stringify(globalBoxes));
  };

  const clearTemplate = () => {
    localStorage.removeItem('roi_template');
    setGlobalBoxes({});
    setActiveField(null);
  };

  const onFileChange = (selected) => {
    if (selected && selected.type === 'application/pdf') {
      setFile(selected);
      setActivePage(1);
      const saved = localStorage.getItem('roi_template');
      setGlobalBoxes(saved ? JSON.parse(saved) : {});
      setExtractedData(null);
    } else {
      onUploadError?.('유효한 PDF 파일을 업로드해주세요.');
    }
  };

  const getPdfPageImageBlob = async (pdfDocument, pageNum) => {
    try {
      const page = await pdfDocument.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: ctx, viewport }).promise;
      
      const blob = await new Promise((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.9);
      });
      
      page.cleanup();
      canvas.width = 0;
      canvas.height = 0;
      
      return blob;
    } catch(e) {
      console.error(e);
      return null;
    }
  };

  const getAiPromptText = (pageIndex, boxesMeta, sitesMeta) => `
성적서 PDF를 파싱해 아래 JSON 스키마만 출력하라.
허용된 필드 외에는 절대 출력하지 말 것.
전체 문서를 해석하지 말고, 제출된 문서의 **[ ${pageIndex} 번째 페이지 ]** 내용만 타겟으로 하라.
${boxesMeta}
${sitesMeta}

[출력 스키마 - 반드시 동일한 키 사용]
{
  "include": true,
  "record": {
    "report_date": "YYYY-MM-DD",
    "site_name": "string",
    "ss": 0.1,
    "bod": 0.1,
    "tn": 0.1,
    "tp": 0.1,
    "total_coliform": 0,
    "mlss": 0.1,
    "do": 0.1,
    "ph": 0.1
  },
  "errors": []
}

[규칙]
- report_date, site_name이 유효하면 include=true, 아니면 include=false.
- report_date는 반드시 YYYY-MM-DD 문자열.
- 숫자 필드는 number 또는 null만 허용. 값이 불명확하면 null.
- 숫자값이 "4 942.9"처럼 공백 포함 시 공백 제거 후 number 변환. 변환 실패한 숫자는 null.
- source/meta/reason 등 추가 키 출력 금지.
- JSON 외 텍스트 출력 금지.
- MLSS/SS 매핑 규칙(현장 반영): 폭기조 문맥 + 비고/표기에 MLSS가 명확하면 mlss에 값 저장. ss는 원문이 SS로 명시되지 않으면 null. 원문이 SS로 명확하면 ss에 저장. 원문이 SS인데 비고에 "MLSS로 간주" 근거가 있으면 ss와 mlss 동시 저장 가능. 근거는 errors가 아니라 내부 로그로만 처리(출력 JSON에는 불필요 설명 금지).
  `;

  const normalizeForFileSegment = (value) => {
    return String(value || '')
      .replace(/[\/\\?%*:|"<>]/g, '_')
      .replace(/\s+/g, '_')
      .trim();
  };

  const getCompactDate = (yyyyMmDd) => {
    const normalized = yyyyMmDd || '';
    return normalized ? normalized.replace(/-/g, '') : '';
  };

  const generateBasename = (extracted, pageIndex) => {
    try {
      if (!extracted || !extracted.record) return `page_${pageIndex}`;
      const rec = extracted.record;
      const dateStr = getCompactDate(rec.report_date);
      const siteStr = normalizeForFileSegment(rec.site_name);
      
      const isNum = (v) => v != null && v !== "";
      const hasOthers = isNum(rec.bod) || isNum(rec.tn) || isNum(rec.tp) || isNum(rec.total_coliform) || isNum(rec.do) || isNum(rec.ph);
      const hasMlss = isNum(rec.mlss);
      const hasSsOnly = isNum(rec.ss) && !hasMlss && !hasOthers;
      
      let prefix = "성적서";
      if (!hasOthers && hasMlss) {
        prefix = "mlss";
      } else if (!hasOthers && !hasMlss && hasSsOnly) {
        prefix = "ss";
      } else if (!hasOthers && !hasMlss && !hasSsOnly) {
        prefix = "기타_성적서";
      }
      
      return `${prefix}_${dateStr}_${siteStr}.jpg`;
    } catch(e) {
      return `page_${pageIndex}.jpg`;
    }
  };

  const handleProcessAllAndDownload = async () => {
    if (!file || !pdfDoc) {
      onUploadError?.('먼저 파일을 업로드해주세요.');
      return;
    }
    if (!numPages) {
      onUploadError?.('PDF를 불러오는 중입니다. 잠시만 기다려주세요.');
      return;
    }
    
    const initialPages = Array.from({ length: numPages }, (_, i) => ({
      page: i + 1,
      status: 'pending'
    }));
    
    setBatchProgress({ active: true, current: 0, total: numPages, pages: initialPages });
    setProcessing(true);
    setExtractedData(null);
    
    await new Promise(resolve => setTimeout(resolve, 100));

    let successCount = 0;
    const allResults = [];
    const zip = new JSZip();
    
    try {
      let boxesMeta = "";
      if (Object.keys(globalBoxes).length > 0) {
        boxesMeta = `\n[참고: 사용자가 지정한 ROI 영역 좌표]\n${JSON.stringify(globalBoxes, null, 2)}\n위 좌표를 참고해 현 화면에서 사용자가 지정한 각각의 영역 위치 안의 텍스트를 우선 대상으로 분석하라.`;
      }

      let sitesMeta = "";
      if (masterSites.length > 0) {
        sitesMeta = `\n[현장명(Site Name) 마스터 목록]\n${masterSites.join(', ')}\n※ 현장명을 추출할 때 반드시 위 목록과 대조하여 오타 없이 동일한 이름으로 교정해서 출력하라.`;
      }

      for (let i = 1; i <= numPages; i++) {
         setBatchProgress(prev => {
           const newPages = [...prev.pages];
           newPages[i - 1] = { page: i, status: 'extracting' };
           return { ...prev, current: i, pages: newPages };
         });
         
         const prompt = getAiPromptText(i, boxesMeta, sitesMeta);

         try {
           const imgBlob = await getPdfPageImageBlob(pdfDoc, i);
           if (!imgBlob) throw new Error(`페이지 이미지 변환 실패`);

           let response;
           let retryCount = 0;
           const maxRetries = 2;
           
           while (retryCount <= maxRetries) {
             try {
               const formData = new FormData();
               formData.append("image", imgBlob, "page.jpg");
               formData.append("prompt", prompt);
               formData.append("model", "gemini-2.5-flash");

               const headers = {};
               if (apiKey) {
                 headers['x-custom-api-key'] = apiKey;
               }

               const apiReq = await fetch("/api/generate-content", {
                 method: "POST",
                 body: formData,
                 headers,
               });

               if (!apiReq.ok) {
                 let errMsg = "API Request Failed";
                 try { const errObj = await apiReq.json(); errMsg = errObj.error || errMsg; } catch(e){}
                 throw new Error(errMsg);
               }
               response = await apiReq.json();
               break;
             } catch (apiErr) {
               console.error(`API Error on page ${i} (Attempt ${retryCount + 1}):`, apiErr);
               if (retryCount >= maxRetries) throw apiErr;
               
               setBatchProgress(prev => {
                 const newPages = [...prev.pages];
                 newPages[i - 1] = { page: i, status: 'extracting', detail: `재시도 중... (${retryCount + 1})` };
                 return { ...prev, pages: newPages };
               });
               await new Promise(r => setTimeout(r, 2000 * (retryCount + 1)));
               retryCount++;
             }
           }
           
           if (!response) throw new Error("API 응답이 없습니다.");
           
           const cleanText = (response.text || "{}").replace(/\`\`\`json/g, "").replace(/\`\`\`/g, "").trim();
           const extracted = JSON.parse(cleanText);
           
           if (extracted && extracted.record) {
             const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
             const dateStr = extracted.record.report_date;
             if (!dateStr || !dateRegex.test(String(dateStr))) {
               extracted.record.report_date = null;
             }
             
             if (extracted.record.site_name) {
               extracted.record.site_name = extracted.record.site_name.replace(/\s*(포기조|폭기조)\s*$/, "").trim();
             }
             
             delete extracted.reason;
             delete extracted.source;
             delete extracted.meta;
             delete extracted.record.site_id;
           }
           
           if (extracted) {
              allResults.push({ extracted, imgBlob });
              
              setBatchProgress(prev => {
                const newPages = [...prev.pages];
                newPages[i - 1] = { page: i, status: 'done', detail: '성공' };
                return { ...prev, pages: newPages };
              });
           } else {
              setBatchProgress(prev => {
                const newPages = [...prev.pages];
                newPages[i - 1] = { page: i, status: 'failed', detail: '결과 없음' };
                return { ...prev, pages: newPages };
              });
           }
           
           if (i < numPages) {
             await new Promise(r => setTimeout(r, 1000));
           }
           
         } catch (err) {
           console.error(`Failed to process page ${i}`, err);
           setBatchProgress(prev => {
             const newPages = [...prev.pages];
             newPages[i - 1] = { page: i, status: 'failed', detail: err.message || '오류 발생' };
             return { ...prev, pages: newPages };
           });
         }
      }
    } catch(e) {
      console.error(e);
      onUploadError?.('PDF 파일을 읽는데 실패했습니다.');
    }
    
    if (allResults.length > 0) {
      const dateCounts = {};
      allResults.forEach(res => {
        const d = res.extracted?.record?.report_date;
        if (d) dateCounts[d] = (dateCounts[d] || 0) + 1;
      });
      
      let mostCommonDate = null;
      let maxCount = 0;
      for (const [dateStr, count] of Object.entries(dateCounts)) {
        if (count > maxCount) {
          maxCount = count;
          mostCommonDate = dateStr;
        }
      }

      let unusedSites = masterSites.map(site => site.replace(/\s*(포기조|폭기조)\s*$/, "").trim());
      if (unusedSites.length > 0) {
        const usedSites = allResults.map(res => res.extracted?.record?.site_name).filter(Boolean);
        unusedSites = unusedSites.filter(site => !usedSites.includes(site));
      }

      const finalJsonList = [];
      const omittedJsonList = [];
      
      allResults.forEach((res, idx) => {
        const ex = res.extracted;
        if (ex && ex.record) {
          if (!ex.errors) ex.errors = [];

          if (!ex.record.report_date && mostCommonDate) {
            ex.record.report_date = mostCommonDate;
          }

          if (!ex.record.site_name && unusedSites.length > 0) {
            const guessedSite = unusedSites.shift();
            ex.record.site_name = guessedSite;
            console.log(`[Batch] Page ${idx+1} 현장명 소거법 할당: ${guessedSite}`);
          }
          
          delete ex.reason;
          delete ex.source;
          delete ex.meta;
          delete ex.record.site_id;

          ex.include = true;
          ex.errors = [];

          if (!ex.record.report_date) {
            ex.include = false;
            ex.errors.push("invalid_or_missing_date");
          } else {
            if (new Date(ex.record.report_date) < new Date('2026-01-01')) {
              ex.include = false;
              ex.errors.push("before_2026_01");
            }
          }

          if (!ex.record.site_name) {
            ex.include = false;
            ex.errors.push("missing_site_name");
          }
        }
        
        if (ex.include && ex.record?.report_date && ex.record?.site_name) {
           finalJsonList.push(ex);
           successCount++;
        } else {
           omittedJsonList.push(ex);
        }

        const basename = generateBasename(ex, idx + 1);
        zip.file(`pages/${basename}.jpg`, res.imgBlob);
      });

      const exportData = {
        version: "certificate-water-quality-v1",
        records: finalJsonList
      };
      zip.file('all_pages_data.json', JSON.stringify(exportData, null, 2));
      
      if (omittedJsonList.length > 0) {
        const omittedExport = {
          version: "certificate-water-quality-v1",
          records: omittedJsonList
        };
        zip.file('omitted_data.json', JSON.stringify(omittedExport, null, 2));
      }
      
      const zipContent = await zip.generateAsync({ type: 'blob' });
      const originalPdfName = file.name.replace(/\.[^/.]+$/, "");
      
      // Download ZIP
      const url = URL.createObjectURL(zipContent);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${originalPdfName}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      onUploadSuccess?.(`일괄 처리가 완료되었습니다!\n총 ${numPages}장 처리를 완료했습니다.\n(유효 추출 성공: ${successCount}장)`);
    }
    
    setProcessing(false);
  };

  return {
    file,
    setFile,
    numPages,
    setNumPages,
    activePage,
    setActivePage,
    pdfDoc,
    setPdfDoc,
    processing,
    extractedData,
    batchProgress,
    apiKey,
    setApiKey,
    masterSites,
    setMasterSites,
    globalBoxes,
    setGlobalBoxes,
    activeField,
    setActiveField,
    showTemplateBoxes,
    setShowTemplateBoxes,
    isDrawing,
    setIsDrawing,
    startPos,
    setStartPos,
    currentBox,
    setCurrentBox,
    containerRef,
    saveTemplate,
    clearTemplate,
    onFileChange,
    handleProcessAllAndDownload,
  };
}

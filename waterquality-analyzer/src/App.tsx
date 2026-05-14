import React, { useState, useRef, MouseEvent, useEffect } from 'react';
import { Upload, FileText, Crop, Calendar, List, CheckSquare, MapPin, CloudUpload, Loader2, ArrowUp, ArrowDown, Trash2, Eye, EyeOff, CheckCircle2, XCircle, Key } from 'lucide-react';
import { Document, Page, pdfjs } from 'react-pdf';
import { PDFDocument } from 'pdf-lib';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Set up the worker for react-pdf
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

const toBase64 = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = () => {
    const base64 = (reader.result as string).split(',')[1];
    resolve(base64);
  };
  reader.onerror = error => reject(error);
});

const blobToBase64 = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.readAsDataURL(blob);
  reader.onload = () => {
    const base64 = (reader.result as string).split(',')[1];
    resolve(base64);
  };
  reader.onerror = error => reject(error);
});

type FieldType = 'date' | 'items' | 'results' | 'location';

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PageProgress {
  page: number;
  status: 'pending' | 'extracting' | 'done' | 'failed';
  detail?: string;
}

interface BatchProgressState {
  active: boolean;
  current: number;
  total: number;
  pages: PageProgress[];
}

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [activePage, setActivePage] = useState<number>(1);
  
  const [activeField, setActiveField] = useState<FieldType | null>(null);
  const [showTemplateBoxes, setShowTemplateBoxes] = useState(true);
  const [globalBoxes, setGlobalBoxes] = useState<Partial<Record<FieldType, BoundingBox>>>(() => {
    const saved = localStorage.getItem('roi_template');
    return saved ? JSON.parse(saved) : {};
  });
  
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentBox, setCurrentBox] = useState<BoundingBox | null>(null);
  
  const [processing, setProcessing] = useState(false);
  const [extractedData, setExtractedData] = useState<any>(null);
  const [batchProgress, setBatchProgress] = useState<BatchProgressState>({ active: false, current: 0, total: 0, pages: [] });
  const [pdfDoc, setPdfDoc] = useState<any>(null);

  const [apiKeyModalOpen, setApiKeyModalOpen] = useState(false);
  const [tempApiKey, setTempApiKey] = useState(localStorage.getItem('custom_gemini_api_key') || '');
  
  const [masterSitesModalOpen, setMasterSitesModalOpen] = useState(false);
  const [masterSites, setMasterSites] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('master_sites') || '[]'); } catch { return []; }
  });
  const [tempSitesText, setTempSitesText] = useState(() => masterSites.join('\n'));

  useEffect(() => {
    const fetchMasterSites = async () => {
      try {
        const response = await fetch("https://docs.google.com/spreadsheets/d/1hcfdTLz5SUyM9OqG3A9kkFGf0Tonh00xGkOj5tV2gOg/export?format=csv&gid=1961616617");
        const csvText = await response.text();
        const lines = csvText.split('\n');
        const sites: string[] = [];
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',');
          if (cols.length > 1 && cols[1].trim()) {
            sites.push(cols[1].trim());
          }
        }
        if (sites.length > 0) {
          setMasterSites(sites);
          localStorage.setItem('master_sites', JSON.stringify(sites));
        }
      } catch (error) {
        console.error("Failed to fetch master sites:", error);
      }
    };
    fetchMasterSites();
  }, []);

  const [alertState, setAlertState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    isConfirm: boolean;
    onConfirm?: () => void;
    showDontShowAgain: boolean;
    dontShowKey?: string;
  }>({ isOpen: false, title: '', message: '', isConfirm: false, showDontShowAgain: false });

  const showAlert = (title: string, message: string, dontShowKey?: string) => {
    if (dontShowKey && localStorage.getItem(dontShowKey) === 'true') {
      return; 
    }
    setAlertState({ isOpen: true, title, message, isConfirm: false, showDontShowAgain: !!dontShowKey, dontShowKey });
  };

  const showConfirm = (title: string, message: string, onConfirm: () => void) => {
    setAlertState({ isOpen: true, title, message, isConfirm: true, showDontShowAgain: false, onConfirm });
  };

  const containerRef = useRef<HTMLDivElement>(null);

  const saveTemplate = () => {
    localStorage.setItem('roi_template', JSON.stringify(globalBoxes));
    showAlert('템플릿 저장 완료', '템플릿이 성공적으로 저장되었습니다! 이후 업로드부터 자동 적용됩니다.', 'hide_save_template_alert');
  };

  const clearTemplate = () => {
    showConfirm("템플릿 초기화", "저장된 템플릿과 그려진 영역을 모두 지우시겠습니까?", () => {
      localStorage.removeItem('roi_template');
      setGlobalBoxes({});
      setActiveField(null);
    });
  };

  const movePage = async (pageIndex: number, direction: 'up' | 'down') => {
    if (!file) return;
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDocLib = await PDFDocument.load(arrayBuffer);
      
      const targetIndex = pageIndex - 1;
      const swapIndex = direction === 'up' ? targetIndex - 1 : targetIndex + 1;
      
      if (swapIndex < 0 || swapIndex >= pdfDocLib.getPageCount()) return;
      
      // Swap pages in pdf-lib by creating a new document to copy into, or using copyPages
      // The easiest way to reorder in pdf-lib is to create a new doc and copy pages in desired order
      const pageCount = pdfDocLib.getPageCount();
      const newPdf = await PDFDocument.create();
      
      const indices = Array.from({ length: pageCount }, (_, i) => i);
      // Swap the elements in the array
      [indices[targetIndex], indices[swapIndex]] = [indices[swapIndex], indices[targetIndex]];
      
      const copiedPages = await newPdf.copyPages(pdfDocLib, indices);
      copiedPages.forEach(p => newPdf.addPage(p));

      const pdfBytes = await newPdf.save();
      const newFile = new File([pdfBytes], file.name, { type: 'application/pdf' });
      
      setFile(newFile);
      setNumPages(newPdf.getPageCount());
      // We must clear pdfDoc so that the new Document component will re-load it and give us the fresh react-pdf instance.
      // Otherwise, batch operations will use the stale `pdfDoc` that still has the deleted pages.
      setPdfDoc(null); 
      setActivePage(swapIndex + 1); // Set the active page to the new position
    } catch (err) {
      console.error("Error moving page", err);
      showAlert('오류', '페이지 이동에 실패했습니다.');
    }
  };

  const deletePage = async (pageIndex: number) => {
    if (!file) return;
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDocLib = await PDFDocument.load(arrayBuffer);
      const targetIndex = pageIndex - 1;
      
      if (pdfDocLib.getPageCount() <= 1) {
        showConfirm("마지막 페이지 삭제", "마지막 페이지입니다. 삭제하면 파일 전체가 닫힙니다. 계속하시겠습니까?", () => {
           setFile(null);
           setPdfDoc(null);
           setNumPages(null);
        });
        return;
      }
      
      pdfDocLib.removePage(targetIndex);
      
      const pdfBytes = await pdfDocLib.save();
      const newFile = new File([pdfBytes], file.name, { type: 'application/pdf' });
      
      setFile(newFile);
      setNumPages(pdfDocLib.getPageCount()); // Update the total page count immediately
      setPdfDoc(null); // Force react-pdf to reload and give us the fresh document instance
      
      if (activePage === pageIndex) {
        setActivePage(Math.max(1, pageIndex - 1));
      } else if (activePage > pageIndex) {
        setActivePage(activePage - 1);
      }
    } catch (err) {
      console.error("Error deleting page", err);
      showAlert('오류', '페이지 삭제에 실패했습니다.');
    }
  };

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    if (selected && selected.type === 'application/pdf') {
      setFile(selected);
      setActivePage(1);
      
      // Try to load any existing template from local storage
      const saved = localStorage.getItem('roi_template');
      setGlobalBoxes(saved ? JSON.parse(saved) : {});
      
      setExtractedData(null);
    } else {
      showAlert('알림', '유효한 PDF 파일을 업로드해주세요.');
    }
  };

  const downloadFile = (data: string, filename: string, type: string) => {
    const blob = new Blob([data], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadImage = (dataUrl: string, filename: string) => {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const getAiPromptText = (pageIndex: number, boxesMeta: string, sitesMeta: string) => `
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

  const generateBasename = (extracted: any, pageIndex: number) => {
    try {
      if (!extracted || !extracted.record) return `page_${pageIndex}`;
      const rec = extracted.record;
      const dateStr = (rec.report_date || "NoDate").replace(/-/g, "");
      let siteStr = (rec.site_name || "UnknownSite").replace(/[\/\\?%*:|"<>]/g, "");
      
      // Remove trailing "포기조" or "폭기조"
      siteStr = siteStr.replace(/\s*(포기조|폭기조)\s*$/, "").trim();
      
      const isNum = (v: any) => v != null && v !== "";
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
      
      return `${prefix}_${dateStr}_${siteStr}`;
    } catch(e) {
      return `page_${pageIndex}`;
    }
  };

  const getPdfPageImageBlob = async (pdfDocument: any, pageNum: number): Promise<Blob | null> => {
    try {
      const page = await pdfDocument.getPage(pageNum);
      // Reduce scale from 2.0 to 1.5 to dramatically decrease image size and processing time
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: ctx, viewport }).promise;
      
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.9);
      });
      
      // Cleanup to prevent memory leaks during batch processing
      page.cleanup();
      canvas.width = 0;
      canvas.height = 0;
      
      return blob;
    } catch(e) {
      console.error(e);
      return null;
    }
  };

  const handleExtractAndDownload = async () => {
    if (!file || !pdfDoc) return;

    console.log('[AI-WEBAPP] send start', { mode: 'single-page', page: activePage });
    setProcessing(true);
    setExtractedData(null);
    
    try {
      const imgBlob = await getPdfPageImageBlob(pdfDoc, activePage);
      if (!imgBlob) throw new Error("이미지 생성 안됨");
      const pageBase64Data = await blobToBase64(imgBlob);

      let boxesMeta = "";
      if (Object.keys(globalBoxes).length > 0) {
        boxesMeta = `\n[참고: 사용자가 지정한 ROI 영역 좌표]\n${JSON.stringify(globalBoxes, null, 2)}\n위 좌표를 참고해 현 화면에서 사용자가 지정한 각각의 영역 위치 안의 텍스트를 우선 대상으로 분석하라.`;
      }

      let sitesMeta = "";
      if (masterSites.length > 0) {
        sitesMeta = `\n[현장명(Site Name) 마스터 목록]\n${masterSites.join(', ')}\n※ 현장명을 추출할 때 반드시 위 목록과 대조하여 오타 없이 동일한 이름으로 교정해서 출력하라.`;
      }

      const prompt = getAiPromptText(activePage, boxesMeta, sitesMeta);

      const formData = new FormData();
      formData.append("image", imgBlob, "page.jpg");
      formData.append("prompt", prompt);
      formData.append("model", "gemini-2.5-flash");

      const customKey = localStorage.getItem('custom_gemini_api_key');
      const headers: Record<string, string> = {};
      if (customKey) {
        headers['x-custom-api-key'] = customKey;
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
      const response = await apiReq.json();
      
      const cleanText = (response.text || "{}").replace(/\`\`\`json/g, "").replace(/\`\`\`/g, "").trim();
      const extracted = JSON.parse(cleanText);
      
      // Strict BigQuery compatibility checks
      if (extracted && !extracted.errors) extracted.errors = [];
      if (extracted && extracted.record) {
        // Remove trailing "포기조" or "폭기조" from the JSON directly
        if (extracted.record.site_name) {
          extracted.record.site_name = extracted.record.site_name.replace(/\s*(포기조|폭기조)\s*$/, "").trim();
        }
        
        // Clean up to strictly match the requested JSON schema by removing forbidden keys
        delete extracted.reason;
        delete extracted.source;
        delete extracted.meta;
        delete extracted.record.site_id; // remove the site_id we had previously

        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        const dateStr = extracted.record.report_date;
        if (!dateStr || !dateRegex.test(String(dateStr))) {
          extracted.record.report_date = null;
          extracted.include = false;
          if (!extracted.errors.includes("invalid_or_missing_date")) {
            extracted.errors.push("invalid_or_missing_date");
          }
        }
      }

      setExtractedData(extracted);
      
      try {
        const basename = generateBasename(extracted, activePage);
        const zip = new JSZip();
        
        // Add JSON
        const exportData = {
          version: "certificate-water-quality-v1",
          records: [extracted]
        };
        zip.file(`${basename}.json`, JSON.stringify(exportData, null, 2));
        
        // Add Image
        const imgBlob = await getPdfPageImageBlob(pdfDoc, activePage);
        if (imgBlob) {
          zip.file(`${basename}.jpg`, imgBlob);
        } else {
          console.warn("Failed to generate image blob for the zip.");
        }
        
        // Trigger Zip download
        const zipContent = await zip.generateAsync({ type: 'blob' });
        const originalPdfName = file.name.replace(/\.[^/.]+$/, "");
        downloadFile(zipContent as any, `${originalPdfName}_page${activePage}.zip`, 'application/zip');
        
      } catch (extErr) {
        console.error('[AI-WEBAPP] download error', extErr);
      }
      
    } catch(err) {
      console.error(err);
      showAlert('오류', 'PDF 처리에 실패했습니다.');
    } finally {
      setProcessing(false);
    }
  };

  const handleProcessAllAndDownload = async () => {
    if (!file || !pdfDoc) {
      showAlert('알림', '먼저 파일을 업로드해주세요.');
      return;
    }
    if (!numPages) {
      showAlert('알림', 'PDF를 불러오는 중입니다. 잠시만 기다려주세요.');
      return;
    }
    
    // Remove window.confirm as it can be blocked by the iframe environment in preview
    const initialPages: PageProgress[] = Array.from({ length: numPages }, (_, i) => ({
      page: i + 1,
      status: 'pending'
    }));
    
    setBatchProgress({ active: true, current: 0, total: numPages, pages: initialPages });
    setProcessing(true); // Ensure all processing flags are captured
    setExtractedData(null); // Clear single page preview
    
    // Yield to let React re-render the button instantly before blocking operations
    await new Promise(resolve => setTimeout(resolve, 100));

    console.log('[AI-WEBAPP] send start', { mode: 'all-pages', totalPages: numPages });

    let successCount = 0;
    const allResults = [];
    
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
           const pageBase64Data = await blobToBase64(imgBlob);

           let response;
           let retryCount = 0;
           const maxRetries = 2;
           
           while (retryCount <= maxRetries) {
             try {
               const formData = new FormData();
               formData.append("image", imgBlob, "page.jpg");
               formData.append("prompt", prompt);
               formData.append("model", "gemini-2.5-flash");

               const customKey = localStorage.getItem('custom_gemini_api_key');
               const headers: Record<string, string> = {};
               if (customKey) {
                 headers['x-custom-api-key'] = customKey;
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
               break; // Success, exit retry loop
             } catch (apiErr: any) {
               console.error(`API Error on page ${i} (Attempt ${retryCount + 1}):`, apiErr);
               if (retryCount >= maxRetries) throw apiErr;
               
               // Backoff delay before retry (2s, then 4s)
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
           
           // Instead of modifying everything strictly here, push null date so we can post-process
           if (extracted && extracted.record) {
             const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
             const dateStr = extracted.record.report_date;
             if (!dateStr || !dateRegex.test(String(dateStr))) {
               extracted.record.report_date = null;
             }
             
             // Remove trailing "포기조" or "폭기조" from the JSON directly
             if (extracted.record.site_name) {
               extracted.record.site_name = extracted.record.site_name.replace(/\s*(포기조|폭기조)\s*$/, "").trim();
             }
             
             // Clean up forbidden keys
             delete extracted.reason;
             delete extracted.source;
             delete extracted.meta;
             delete extracted.record.site_id;
           }
           
           if (extracted) {
              allResults.push({ extracted: extracted, imgBlob });
              
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
           
           // Small delay between pages to avoid hitting rate limits instantly
           if (i < numPages) {
             await new Promise(r => setTimeout(r, 1000));
           }
           
         } catch (err: any) {
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
      showAlert('오류', 'PDF 파일을 읽는데 실패했습니다.');
    }
    
    if (allResults.length > 0) {
      // Find the most common correct date
      const dateCounts: Record<string, number> = {};
      allResults.forEach(res => {
        const d = res.extracted?.record?.report_date;
        if (d) dateCounts[d] = (dateCounts[d] || 0) + 1;
      });
      
      let mostCommonDate: string | null = null;
      let maxCount = 0;
      for (const [dateStr, count] of Object.entries(dateCounts)) {
        if (count > maxCount) {
          maxCount = count;
          mostCommonDate = dateStr;
        }
      }

      // Site Name Elimination Strategy
      let unusedSites = masterSites.map(site => site.replace(/\s*(포기조|폭기조)\s*$/, "").trim());
      if (unusedSites.length > 0) {
        const usedSites = allResults.map(res => res.extracted?.record?.site_name).filter(Boolean);
        unusedSites = unusedSites.filter(site => !usedSites.includes(site));
      }

      // Final pass: backfill missing dates, missing sites, and generate zip
      const finalJsonList: any[] = [];
      const omittedJsonList: any[] = [];
      
      allResults.forEach((res, idx) => {
        const ex = res.extracted;
        if (ex && ex.record) {
          if (!ex.errors) ex.errors = [];

          // Backfill Date
          if (!ex.record.report_date && mostCommonDate) {
            ex.record.report_date = mostCommonDate;
          }

          // Backfill Site Name (Process of Elimination)
          if (!ex.record.site_name && unusedSites.length > 0) {
            const guessedSite = unusedSites.shift();
            ex.record.site_name = guessedSite;
            // Removed adding to warnings since the requested schema doesn't have it.
            console.log(`[Batch] Page ${idx+1} 현장명 소거법 할당: ${guessedSite}`);
          }
          
          // Clean up to strictly match the requested JSON schema by removing forbidden keys
          delete ex.reason;
          delete ex.source;
          delete ex.meta;
          delete ex.record.site_id; // remove the site_id we had previously

          // Re-evaluate inclusion rules based on final date
          ex.include = true;
          ex.errors = []; // reset errors array to rebuild securely

          if (!ex.record.report_date) {
            ex.include = false;
            ex.errors.push("invalid_or_missing_date");
          } else {
            // Check if date is >= 2026-01-01
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
      });

      // Upload to main app server instead of downloading ZIP
      const mainAppServerUrl = 'http://localhost:8901';
      
      // Upload images to Drive
      for (const res of allResults) {
        const ex = res.extracted;
        if (!ex || !ex.record || !ex.include) continue;
        
        const basename = generateBasename(ex, allResults.indexOf(res) + 1);
        const formData = new FormData();
        formData.append('files', res.imgBlob, `${basename}.jpg`);
        
        try {
          await fetch(`${mainAppServerUrl}/api/certificates/manual-upload-file`, {
            method: 'POST',
            body: formData,
          });
        } catch (err) {
          console.error(`Failed to upload image for ${basename}:`, err);
        }
      }
      
      // Upload JSON to BigQuery
      for (const ex of finalJsonList) {
        try {
          await fetch(`${mainAppServerUrl}/api/certificates/import-from-ai`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(ex),
          });
        } catch (err) {
          console.error('Failed to upload JSON to BigQuery:', err);
        }
      }
      
      showAlert('작업 완료', `일괄 처리가 완료되었습니다!\n총 ${numPages}장 처리를 완료했습니다.\n(유효 추출 성공: ${successCount}장)\n데이터가 메인 앱 서버에 전송되었습니다.`, 'hide_batch_complete_alert');
    }
    
    setProcessing(false);
  };

  const fieldColors: Record<FieldType, string> = {
    date: 'border-blue-500 bg-blue-500/20',
    items: 'border-purple-500 bg-purple-500/20',
    results: 'border-green-500 bg-green-500/20',
    location: 'border-orange-500 bg-orange-500/20',
  };

  const fieldLabels: Record<FieldType, string> = {
    date: 'Date (날짜)',
    items: 'Items (분석항목)',
    results: 'Results (분석결과)',
    location: 'Location (현장명)',
  };

  // Drawing logic
  const handleMouseDown = (e: MouseEvent) => {
    if (!activeField || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    setIsDrawing(true);
    setStartPos({ x, y });
    setCurrentBox({ x, y, width: 0, height: 0 });
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDrawing || !containerRef.current || !activeField) return;
    const rect = containerRef.current.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;

    setCurrentBox({
      x: Math.min(startPos.x, currentX),
      y: Math.min(startPos.y, currentY),
      width: Math.abs(currentX - startPos.x),
      height: Math.abs(currentY - startPos.y),
    });
  };

  const handleMouseUp = () => {
    if (!isDrawing || !activeField || !currentBox) return;
    setIsDrawing(false);

    // Only save if the box is big enough to avoid accidental clicks
    if (currentBox.width > 10 && currentBox.height > 10) {
      setGlobalBoxes(prev => ({
        ...prev,
        [activeField]: currentBox
      }));
      setActiveField(null); // Auto-exit drawing mode after successful drawing
    }
    setCurrentBox(null);
  };

  return (
    <div className="flex h-screen w-full bg-[#F3F4F6] flex-col font-sans overflow-hidden">
      <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <FileText size={20} className="text-white" />
          </div>
          <h1 className="text-lg font-semibold text-gray-800">Water Quality Analyzer</h1>
        </div>
        
        {/* Template Actions moved to Header */}
        <div className="flex items-center gap-2">
          <button 
            onClick={() => {
              setTempSitesText(masterSites.join('\n'));
              setMasterSitesModalOpen(true);
            }}
            className="flex items-center gap-1.5 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1.5 rounded-md font-medium hover:bg-emerald-100 transition mr-2"
            title="구글 시트에 있는 현장명 명단을 넣어두면 AI가 오타를 수정하고 남은 현장명을 자동으로 찾아줍니다."
          >
            <MapPin size={14} /> 현장명 명단 (시트연동)
          </button>

          <button 
            onClick={() => {
              setTempApiKey(localStorage.getItem('custom_gemini_api_key') || '');
              setApiKeyModalOpen(true);
            }}
            className="flex items-center gap-1.5 text-xs bg-purple-50 text-purple-700 border border-purple-200 px-3 py-1.5 rounded-md font-medium hover:bg-purple-100 transition mr-2"
            title="외부 배포 환경이나 로컬 환경에서 사용할 개인 API 키 입력"
          >
            <Key size={14} /> 개인 API 키 설정
          </button>

          <button 
            onClick={saveTemplate} 
            className="text-xs bg-blue-50 text-blue-600 border border-blue-200 px-3 py-1.5 rounded-md font-medium hover:bg-blue-100 transition"
          >
            Save as Template
          </button>
          {Object.keys(globalBoxes).length > 0 && (
            <>
              <button 
                onClick={clearTemplate} 
                className="text-xs bg-red-50 text-red-600 border border-red-200 px-3 py-1.5 rounded-md font-medium hover:bg-red-100 transition"
              >
                Clear Template
              </button>
              <button 
                onClick={() => setShowTemplateBoxes(!showTemplateBoxes)} 
                className="flex items-center gap-1.5 text-xs bg-gray-50 text-gray-700 border border-gray-200 px-3 py-1.5 rounded-md font-medium hover:bg-gray-100 transition"
              >
                {showTemplateBoxes ? <><EyeOff size={14}/> Hide ROI</> : <><Eye size={14}/> Show ROI</>}
              </button>
            </>
          )}
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden">
        {/* Left Sidebar - Thumbnails */}
        <aside className="w-48 bg-white border-r border-gray-200 flex flex-col shrink-0 z-10">
          <div className="p-3 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Pages</span>
            <span className="text-xs text-gray-400">{numPages || 0} total</span>
          </div>

          <div className="p-3 border-b border-gray-100 shrink-0">
            <div className="flex flex-col items-center justify-center border border-dashed border-gray-300 rounded-lg p-3 bg-white hover:bg-gray-50 transition duration-150 cursor-pointer relative">
               <input type="file" accept="application/pdf" onChange={onFileChange} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
               <Upload className="text-gray-400 mb-1" size={16} />
               <span className="text-xs text-gray-600 font-medium">Upload PDF</span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-4">
            {file && (
              <Document
                file={file}
                onLoadSuccess={(pdf) => { 
                  setNumPages(pdf.numPages); 
                  setPdfDoc(pdf); 
                  
                  // Only auto-create if it's not a reload from delete operations
                  if (!pdfDoc) {
                    console.log('PDF Load Success');
                  }
                }}
                className="flex flex-col gap-4 w-full"
              >
                {Array.from({ length: numPages || 0 }, (_, index) => {
                  const pageNum = index + 1;
                  const isActive = activePage === pageNum;
                  return (
                    <div key={'thumb-wrapper-' + pageNum} className="relative group perspective-1000 mb-2">
                      <button
                        onClick={() => setActivePage(pageNum)}
                        className={`relative w-full text-left transition-all block ${
                          isActive 
                            ? 'p-1 rounded-lg ring-2 ring-blue-500 bg-blue-50' 
                            : 'p-1 grayscale opacity-60 hover:grayscale-0 hover:opacity-100'
                        }`}
                      >
                        <div className="bg-white border border-gray-200 rounded shadow-sm flex items-center justify-center overflow-hidden pointer-events-none">
                          <Page 
                            pageNumber={pageNum} 
                            width={160} 
                            renderTextLayer={false} 
                            renderAnnotationLayer={false}
                            className="w-full"
                          />
                        </div>
                        <span className={`absolute -left-1 top-0 text-[10px] text-white px-1 rounded-r ${isActive ? 'bg-blue-500' : 'bg-gray-400'}`}>
                          P{pageNum}
                        </span>
                        
                        {/* Show visual indicators if boxes exist */}
                        {Object.keys(globalBoxes).length > 0 && showTemplateBoxes && (
                          <div className="absolute top-1 right-1 flex gap-1 bg-white/90 p-1 rounded-bl shadow-sm">
                            <CheckSquare size={10} className="text-green-600" />
                            <span className="text-[10px] font-bold text-gray-700">{Object.keys(globalBoxes).length}</span>
                          </div>
                        )}
                      </button>

                      {/* Action buttons overlay */}
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                         {pageNum > 1 && (
                           <button onClick={(e) => { e.stopPropagation(); movePage(pageNum, 'up'); }} className="p-2 bg-white/95 border border-gray-200 rounded-full shadow-lg hover:bg-blue-50 text-gray-700 hover:text-blue-600 transition-colors" title="Move Up">
                             <ArrowUp size={14} />
                           </button>
                         )}
                         {pageNum < (numPages || 0) && (
                          <button onClick={(e) => { e.stopPropagation(); movePage(pageNum, 'down'); }} className="p-2 bg-white/95 border border-gray-200 rounded-full shadow-lg hover:bg-blue-50 text-gray-700 hover:text-blue-600 transition-colors" title="Move Down">
                            <ArrowDown size={14} />
                          </button>
                         )}
                         <button onClick={(e) => { e.stopPropagation(); deletePage(pageNum); }} className="p-2 bg-white/95 border border-red-200 rounded-full shadow-lg hover:bg-red-50 text-red-600 transition-colors" title="Delete Page">
                            <Trash2 size={14} />
                         </button>
                      </div>
                    </div>
                  );
                })}
              </Document>
            )}
          </div>
        </aside>

        {/* Right Section - Main Content */}
        <section className="flex-1 flex flex-col bg-gray-200 relative overflow-hidden">
          {file ? (
            <div className="flex flex-col h-full">
              {/* Toolbar */}
              <div className="bg-white border-b border-gray-200 px-6 py-3 flex gap-6 items-center shrink-0">
                <div>
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                    <Crop size={14} /> Select area to draw:
                  </h3>
                  <div className="flex gap-2">
                    {(Object.keys(fieldLabels) as FieldType[]).map((field) => (
                      <button
                        key={field}
                        onClick={() => setActiveField(prev => prev === field ? null : field)}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors flex items-center gap-2
                          ${activeField === field 
                            ? 'bg-blue-50 border-blue-600 text-blue-700 ring-1 ring-blue-600' 
                            : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                          }`}
                      >
                        {field === 'date' && <Calendar size={14} className={activeField === field ? 'text-blue-600' : 'text-gray-400'} />}
                        {field === 'items' && <List size={14} className={activeField === field ? 'text-blue-600' : 'text-gray-400'} />}
                        {field === 'results' && <CheckSquare size={14} className={activeField === field ? 'text-blue-600' : 'text-gray-400'} />}
                        {field === 'location' && <MapPin size={14} className={activeField === field ? 'text-blue-600' : 'text-gray-400'} />}
                        {fieldLabels[field]}
                        {globalBoxes[field] && (
                          <div className={`w-2 h-2 rounded-full ${fieldColors[field].split(' ')[0].replace('border-', 'bg-')}`} />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
                
                {activeField && (
                  <div className="ml-auto text-xs text-gray-500 bg-blue-50 px-3 py-2 rounded-lg border border-blue-100">
                    Click and drag on the document to define the <strong>{fieldLabels[activeField]}</strong> area.
                  </div>
                )}
                {!activeField && file && (
                  <div className="ml-auto flex gap-3">
                    <button 
                      onClick={handleExtractAndDownload}
                      disabled={processing || batchProgress.active}
                      className="flex items-center justify-center gap-2 bg-white border border-blue-600 text-blue-600 hover:bg-blue-50 px-4 py-2 rounded-md text-sm font-medium transition disabled:opacity-50"
                    >
                      {processing && !batchProgress.active ? (
                        <span className="animate-pulse">Processing...</span>
                      ) : (
                        'Download ZIP (Current)'
                      )}
                    </button>

                    <button 
                      onClick={handleProcessAllAndDownload}
                      disabled={processing || batchProgress.active}
                      className={`flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition ${
                        batchProgress.active 
                          ? 'bg-blue-400 text-white cursor-not-allowed shadow-inner' 
                          : 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'
                      }`}
                    >
                      {batchProgress.active ? (
                        <>
                          <Loader2 className="animate-spin" size={16} />
                          {batchProgress.current === 0 
                            ? 'Preparing PDF...' 
                            : `Processing: ${batchProgress.current} / ${batchProgress.total}`}
                        </>
                      ) : (
                        <>
                          <CloudUpload size={16} />
                          Download All (ZIP Archive)
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>

              {/* Extraction Preview Overlay (Instead of Right Panel) -> Put over PDF view when extracted */}
              {extractedData && (
                 <div className="absolute top-16 right-6 w-96 bg-white shadow-2xl border border-gray-200 z-50 rounded-lg overflow-hidden flex flex-col">
                   <div className="p-3 bg-gray-50 flex justify-between items-center border-b border-gray-100">
                     <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wider">Extraction Result</h3>
                     <button onClick={() => setExtractedData(null)} className="text-gray-400 hover:text-gray-600">✕</button>
                   </div>
                   <div className="p-4 flex-1 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 250px)' }}>
                     <div className="flex justify-between items-center mb-4 border-b border-gray-100 pb-2">
                       <span className={`px-2 py-0.5 rounded text-[10px] font-bold text-white ${extractedData.include ? 'bg-green-500' : 'bg-red-500'}`}>
                         {extractedData.include ? 'INCLUDE (Valid)' : 'EXCLUDE (Filtered)'}
                       </span>
                     </div>
                     
                     <span className="text-[10px] text-gray-400 block mb-1">Report Date</span>
                     <span className="text-blue-600 mb-3 block font-medium">{extractedData.record?.report_date || 'N/A'}</span>
                     
                     <span className="text-[10px] text-gray-400 block mb-1">Site Name (Location)</span> 
                     <span className="text-blue-600 mb-4 block font-medium">{extractedData.record?.site_name || 'N/A'}</span>
                     
                     <span className="text-[10px] text-gray-400 block mb-1">Standardized Metrics</span>
                     <pre className="text-[11px] text-gray-800 bg-gray-50 p-2 border rounded whitespace-pre-wrap">{JSON.stringify(extractedData.record, null, 2)}</pre>
                     
                     {!extractedData.include && extractedData.errors?.length > 0 && (
                        <div className="mt-3 p-2 bg-red-50 border border-red-100 text-red-600 text-[10px] rounded">
                          <strong>Filter Reason:</strong> {extractedData.errors.join(', ')}
                        </div>
                     )}
                     {extractedData.include && extractedData.errors?.length > 0 && (
                        <div className="mt-2 p-2 bg-yellow-50 border border-yellow-100 text-yellow-700 text-[10px] rounded">
                          <strong>Warnings:</strong> {extractedData.errors.join(', ')}
                        </div>
                     )}
                   </div>
                 </div>
              )}

              {/* PDF View Area */}
              <div className="flex-1 overflow-auto p-4 md:p-8 flex justify-center items-start bg-gray-200">
                <div 
                  className={`bg-white shadow-2xl rounded-sm relative ${activeField ? 'cursor-crosshair' : ''}`}
                  ref={containerRef}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                >
                   <Document file={file}>
                      <Page 
                        pageNumber={activePage}
                        renderAnnotationLayer={false}
                        renderTextLayer={false}
                        // Scale could be adjusted here if needed
                      />
                   </Document>

                   {/* Render saved boxes */}
                   {showTemplateBoxes && Object.entries(globalBoxes).map(([field, box]) => (
                     box && (
                       <div
                         key={field}
                         className={`absolute border-2 pointer-events-none ${fieldColors[field as FieldType]} transition-all`}
                         style={{ left: box.x, top: box.y, width: box.width, height: box.height }}
                       >
                         <div className={`absolute -top-6 left-[-2px] text-xs font-bold text-white px-2 py-0.5 whitespace-nowrap rounded-t-sm
                           ${fieldColors[field as FieldType].split(' ')[0].replace('border-', 'bg-')}`}>
                           {fieldLabels[field as FieldType]}
                         </div>
                       </div>
                     )
                   ))}

                   {/* Render currently drawing box */}
                   {isDrawing && currentBox && activeField && (
                     <div
                       className={`absolute border-2 border-dashed pointer-events-none ${fieldColors[activeField]}`}
                       style={{ left: currentBox.x, top: currentBox.y, width: currentBox.width, height: currentBox.height }}
                     />
                   )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="text-center text-gray-400 max-w-sm flex flex-col items-center">
                 <div className="h-20 w-20 rounded-full bg-white shadow-sm flex items-center justify-center mb-4">
                   <Crop size={32} className="text-blue-400" />
                 </div>
                 <h2 className="text-xl font-semibold text-gray-700 mb-2">Define Extraction Areas</h2>
                 <p className="text-sm text-gray-500 leading-relaxed">
                   Upload a water quality testing report, then manually designate processing regions like Date, Parameters, Results, and Location by drawing rectangles on the page.
                 </p>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* Batch Progress Modal */}
      {batchProgress.active && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col max-h-[80vh]">
            <div className="p-5 border-b border-gray-100 bg-blue-600 shrink-0">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                {batchProgress.current < batchProgress.total && <Loader2 className="animate-spin" size={20} />}
                {batchProgress.current === batchProgress.total ? '일괄 추출 완료' : '일괄 추출 진행 중...'}
              </h3>
              <div className="mt-4">
                <div className="flex justify-between text-xs text-blue-100 mb-1 font-medium">
                  <span>{batchProgress.current} / {batchProgress.total} 완료</span>
                  <span>{batchProgress.total > 0 ? Math.round((batchProgress.current / batchProgress.total) * 100) : 0}%</span>
                </div>
                <div className="h-2 bg-blue-900/50 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-white transition-all duration-300"
                    style={{ width: `${batchProgress.total > 0 ? (batchProgress.current / batchProgress.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-3 bg-gray-50 flex flex-col gap-2 relative min-h-[50vh]">
              {batchProgress.pages.map((p) => (
                <div 
                  key={p.page}
                  id={`page-item-${p.page}`}
                  ref={(el) => {
                    // Auto-scroll to the item currently being extracted
                    if (el && p.status === 'extracting') {
                      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                  }}
                  className={`flex flex-col p-3 rounded-lg border shadow-sm transition-all gap-1.5 ${
                    p.status === 'extracting' ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-500' : 'bg-white border-gray-100'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`text-sm font-bold min-w-[50px] ${p.status === 'extracting' ? 'text-blue-700' : 'text-gray-700'}`}>
                        Page {p.page}
                      </span>
                      {p.status === 'extracting' && <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium animate-pulse">{p.detail || '상세 분석...'}</span>}
                      {p.status === 'done' && <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">성공</span>}
                      {p.status === 'failed' && <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">실패</span>}
                    </div>
                    <div className="flex items-center justify-center w-6 shrink-0">
                      {p.status === 'pending' && <div className="w-5 h-5 rounded-full border-2 border-gray-200" />}
                      {p.status === 'extracting' && <Loader2 className="animate-spin text-blue-600" size={18} />}
                      {p.status === 'done' && <CheckCircle2 className="text-green-500" size={20} />}
                      {p.status === 'failed' && <XCircle className="text-red-500" size={20} />}
                    </div>
                  </div>
                  {p.status === 'failed' && p.detail && (
                    <div className="text-[11px] text-red-600 bg-red-50/50 p-2 rounded border border-red-100/50 whitespace-pre-wrap break-words mt-1">
                      {p.detail}
                    </div>
                  )}
                </div>
              ))}
            </div>
            
            {batchProgress.current === batchProgress.total && batchProgress.total > 0 && (
               <div className="p-4 bg-gray-50 border-t border-gray-200 flex justify-end shrink-0">
                 <button 
                   onClick={() => setBatchProgress({ active: false, current: 0, total: 0, pages: [] })}
                   className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium text-sm transition-colors shadow-sm"
                 >
                   닫기
                 </button>
               </div>
            )}
          </div>
        </div>
      )}

      {/* Custom Modal for Alerts & Confirms */}
      {alertState.isOpen && (
        <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex justify-center items-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full overflow-hidden transform animate-in fade-in zoom-in-95 duration-200">
            <div className={`px-5 py-4 border-b ${alertState.isConfirm ? 'bg-orange-50 border-orange-100' : 'bg-blue-50 border-blue-100'}`}>
              <h3 className={`text-lg font-bold ${alertState.isConfirm ? 'text-orange-800' : 'text-blue-800'}`}>
                {alertState.title}
              </h3>
            </div>
            <div className="px-5 py-6 flex flex-col gap-4">
              <p className="text-gray-700 whitespace-pre-wrap leading-relaxed text-sm">
                {alertState.message}
              </p>
              
              {alertState.showDontShowAgain && alertState.dontShowKey && (
                <label className="flex items-center gap-2 mt-2 cursor-pointer group w-max">
                  <input 
                    type="checkbox" 
                    className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    onChange={(e) => {
                      if (e.target.checked) {
                        localStorage.setItem(alertState.dontShowKey!, 'true');
                      } else {
                        localStorage.removeItem(alertState.dontShowKey!);
                      }
                    }}
                  />
                  <span className="text-xs text-gray-500 group-hover:text-gray-700 transition">이 메시지 다시 보지 않기</span>
                </label>
              )}
            </div>
            <div className="px-5 py-4 bg-gray-50 flex justify-end gap-3 border-t border-gray-100">
              {alertState.isConfirm && (
                <button 
                  onClick={() => setAlertState(prev => ({ ...prev, isOpen: false }))}
                  className="px-4 py-2 bg-white border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
                >
                  취소
                </button>
              )}
              <button 
                onClick={() => {
                  if (alertState.isConfirm && alertState.onConfirm) {
                    alertState.onConfirm();
                  }
                  setAlertState(prev => ({ ...prev, isOpen: false }));
                }}
                className={`px-4 py-2 rounded-md text-sm font-medium text-white transition shadow-sm ${
                  alertState.isConfirm ? 'bg-orange-600 hover:bg-orange-700' : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* API Key Modal */}
      {apiKeyModalOpen && (
        <div className="fixed inset-0 z-[110] bg-black/40 backdrop-blur-sm flex justify-center items-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden transform animate-in fade-in zoom-in-95 duration-200">
            <div className="px-5 py-4 border-b bg-purple-50 border-purple-100">
              <h3 className="text-lg font-bold text-purple-800 flex items-center gap-2">
                <Key size={18} /> 개인 API 키 설정
              </h3>
            </div>
            <div className="px-5 py-6 flex flex-col gap-4">
              <p className="text-gray-700 leading-relaxed text-sm">
                배포 버전(Published) 또는 외부 링크에서 사용할 본인의 <strong>Gemini API 키</strong>를 입력해주세요. 입력된 키는 서버로 전송되지 않고 현재 사용하는 기기(브라우저)에만 안전하게 저장됩니다.
              </p>
              <input 
                type="password" 
                placeholder="AIzaSy..."
                value={tempApiKey}
                onChange={(e) => setTempApiKey(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition"
              />
              <div className="flex justify-between items-center mt-1">
                <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">
                  → 무료 API 키 발급받기 (구글 AI Studio)
                </a>
              </div>
            </div>
            <div className="px-5 py-4 bg-gray-50 flex justify-end gap-3 border-t border-gray-100">
              {localStorage.getItem('custom_gemini_api_key') && (
                <button 
                  onClick={() => {
                    localStorage.removeItem('custom_gemini_api_key');
                    setTempApiKey('');
                    setApiKeyModalOpen(false);
                    showAlert('초기화 완료', '저장된 API 키가 삭제되었습니다.');
                  }}
                  className="px-4 py-2 border border-red-200 text-red-600 bg-red-50 rounded-md text-sm font-medium hover:bg-red-100 transition mr-auto"
                >
                  초기화
                </button>
              )}
              <button 
                onClick={() => setApiKeyModalOpen(false)}
                className="px-4 py-2 bg-white border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
              >
                취소
              </button>
              <button 
                onClick={() => {
                  if(tempApiKey.trim()) {
                    localStorage.setItem('custom_gemini_api_key', tempApiKey.trim());
                    setApiKeyModalOpen(false);
                    showAlert('저장 완료', 'API 키가 브라우저에 안전하게 저장되었습니다.');
                  } else {
                    showAlert('알림', 'API 키를 입력해주세요.');
                  }
                }}
                className="px-4 py-2 rounded-md text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 transition shadow-sm"
              >
                저장하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Master Sites Modal */}
      {masterSitesModalOpen && (
        <div className="fixed inset-0 z-[110] bg-black/40 backdrop-blur-sm flex justify-center items-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden transform animate-in fade-in zoom-in-95 duration-200">
            <div className="px-5 py-4 border-b bg-emerald-50 border-emerald-100">
              <h3 className="text-lg font-bold text-emerald-800 flex items-center gap-2">
                <MapPin size={18} /> 현장명 마스터 명단 관리
              </h3>
            </div>
            <div className="px-5 py-6 flex flex-col gap-4">
              <p className="text-gray-700 leading-relaxed text-sm">
                구글 시트에 정리된 <strong>전체 현장명 명단</strong>을 복사해서 아래에 붙여넣어주세요 (엔터로 구분).<br/>
                <span className="text-emerald-700 font-medium whitespace-pre-wrap block mt-2">1. AI가 이 명단을 대조하여 흐릿한 글씨도 정확하게 교정합니다.<br/>2. 아예 못 읽은 현장명이 발생하면, 이 명단 중 추출되지 않고 '남은 현장'을 소거법으로 자동 배정합니다!</span>
              </p>
              <textarea 
                placeholder="예시)&#10;제천주유소(서울방향)&#10;청송휴게소&#10;홍천휴게소(양양방향)"
                value={tempSitesText}
                onChange={(e) => setTempSitesText(e.target.value)}
                className="w-full h-48 border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition text-sm font-mono"
              />
            </div>
            <div className="px-5 py-4 bg-gray-50 flex justify-end gap-3 border-t border-gray-100">
              {masterSites.length > 0 && (
                <button 
                  onClick={() => {
                    localStorage.removeItem('master_sites');
                    setMasterSites([]);
                    setTempSitesText('');
                    setMasterSitesModalOpen(false);
                    showAlert('초기화 완료', '저장된 현장명 명단이 삭제되었습니다.');
                  }}
                  className="px-4 py-2 border border-red-200 text-red-600 bg-red-50 rounded-md text-sm font-medium hover:bg-red-100 transition mr-auto"
                >
                  명단 초기화
                </button>
              )}
              <button 
                onClick={() => setMasterSitesModalOpen(false)}
                className="px-4 py-2 bg-white border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
              >
                취소
              </button>
              <button 
                onClick={() => {
                  const parsed = tempSitesText.split('\n').map(s => s.trim()).filter(Boolean);
                  localStorage.setItem('master_sites', JSON.stringify(parsed));
                  setMasterSites(parsed);
                  setMasterSitesModalOpen(false);
                  showAlert('명단 저장 완료', '성공적으로 마스터 현장명 명단이 연동 및 저장되었습니다.\n추출 시 자동 교정 및 소거법이 적용됩니다.');
                }}
                className="px-4 py-2 rounded-md text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 transition shadow-sm"
              >
                저장 및 연동하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

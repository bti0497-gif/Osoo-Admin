import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileText, Crop, Calendar, List, CheckSquare, MapPin, CloudUpload, Loader2, ArrowUp, ArrowDown, Trash2, Eye, EyeOff, CheckCircle2, XCircle, X } from 'lucide-react';
import { Document, Page, pdfjs } from 'react-pdf';
import { PDFDocument } from 'pdf-lib';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

const S = {
  overlay: { position: 'fixed', inset: 0, zIndex: 9999, background: '#f1f5f9', display: 'flex', flexDirection: 'column', fontFamily: 'sans-serif' },
  header: { height: '56px', background: '#fff', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', flexShrink: 0, zIndex: 20 },
  headerLeft: { display: 'flex', alignItems: 'center', gap: '12px' },
  headerIcon: { width: '32px', height: '32px', background: '#2563eb', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: '16px', fontWeight: 600, color: '#1e293b' },
  headerRight: { display: 'flex', alignItems: 'center', gap: '8px' },
  btnGhost: { fontSize: '12px', background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 },
  btnGhostRed: { fontSize: '12px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 },
  btnGhostGray: { fontSize: '12px', background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '4px' },
  btnClose: { padding: '6px', borderRadius: '50%', background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center' },
  main: { display: 'flex', flex: 1, overflow: 'hidden' },
  sidebar: { width: '192px', background: '#fff', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', flexShrink: 0 },
  sidebarHead: { padding: '12px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', flexShrink: 0 },
  sidebarHeadText: { fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' },
  uploadArea: { padding: '12px', borderBottom: '1px solid #f1f5f9', flexShrink: 0 },
  uploadBox: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '1px dashed #cbd5e1', borderRadius: '8px', padding: '12px', background: '#fff', cursor: 'pointer', position: 'relative' },
  uploadInput: { position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' },
  thumbScroll: { flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '16px' },
  thumbWrap: { position: 'relative' },
  thumbBtn: (isActive) => ({ position: 'relative', width: '100%', textAlign: 'left', cursor: 'pointer', background: 'none', border: 'none', padding: '4px', borderRadius: '8px', outline: isActive ? '2px solid #3b82f6' : 'none', opacity: isActive ? 1 : 0.6 }),
  thumbInner: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  thumbBadge: (isActive) => ({ position: 'absolute', left: '-4px', top: 0, fontSize: '10px', color: '#fff', padding: '0 4px', borderRadius: '0 4px 4px 0', background: isActive ? '#3b82f6' : '#94a3b8' }),
  thumbActions: { position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', display: 'flex', alignItems: 'center', gap: '6px', zIndex: 20 },
  iconBtn: (color = '#475569', hoverBg = '#eff6ff') => ({ padding: '8px', background: 'rgba(255,255,255,0.95)', border: `1px solid #e2e8f0`, borderRadius: '50%', boxShadow: '0 1px 4px rgba(0,0,0,0.12)', cursor: 'pointer', display: 'flex', alignItems: 'center', color }),
  iconBtnRed: { padding: '8px', background: 'rgba(255,255,255,0.95)', border: '1px solid #fecaca', borderRadius: '50%', boxShadow: '0 1px 4px rgba(0,0,0,0.12)', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#dc2626' },
  content: { flex: 1, display: 'flex', flexDirection: 'column', background: '#e2e8f0', position: 'relative', overflow: 'hidden' },
  toolbar: { background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '12px 24px', display: 'flex', gap: '24px', alignItems: 'center', flexShrink: 0 },
  toolbarLabel: { fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' },
  fieldBtnActive: { padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 500, border: '1px solid #2563eb', background: '#eff6ff', color: '#1d4ed8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', outline: '1px solid #2563eb' },
  fieldBtnInactive: { padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 500, border: '1px solid #cbd5e1', background: '#fff', color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' },
  btnPrimary: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '8px 16px', borderRadius: '6px', fontSize: '14px', fontWeight: 500, background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.08)' },
  btnPrimaryDisabled: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '8px 16px', borderRadius: '6px', fontSize: '14px', fontWeight: 500, background: '#93c5fd', color: '#fff', border: 'none', cursor: 'not-allowed' },
  statusBadge: { fontSize: '11px', background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0', padding: '6px 12px', borderRadius: '6px' },
  pdfScrollArea: { flex: 1, overflow: 'auto', padding: '32px', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', background: '#e2e8f0' },
  pdfCanvas: (crosshair) => ({ background: '#fff', boxShadow: '0 10px 40px rgba(0,0,0,0.2)', borderRadius: '2px', position: 'relative', cursor: crosshair ? 'crosshair' : 'default' }),
  emptyState: { display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' },
  emptyInner: { textAlign: 'center', color: '#94a3b8', maxWidth: '320px', display: 'flex', flexDirection: 'column', alignItems: 'center' },
  emptyIcon: { height: '80px', width: '80px', borderRadius: '50%', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' },
  modalOverlay: { position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' },
  modalBox: { background: '#fff', borderRadius: '12px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxWidth: '448px', width: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '80vh' },
  modalHeader: { padding: '20px', borderBottom: '1px solid #f1f5f9', background: '#2563eb', flexShrink: 0 },
  modalTitle: { fontSize: '18px', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' },
  progressBarWrap: { marginTop: '16px' },
  progressBarLabel: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#bfdbfe', marginBottom: '4px', fontWeight: 500 },
  progressBarTrack: { height: '8px', background: 'rgba(30,58,138,0.5)', borderRadius: '4px', overflow: 'hidden' },
  progressBarFill: (pct) => ({ height: '100%', background: '#fff', borderRadius: '4px', width: `${pct}%`, transition: 'width 0.3s' }),
  pageList: { flex: 1, overflowY: 'auto', padding: '12px', background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: '8px', minHeight: '50vh' },
  pageItem: (status) => ({ display: 'flex', flexDirection: 'column', padding: '12px', borderRadius: '8px', border: status === 'extracting' ? '1px solid #93c5fd' : '1px solid #f1f5f9', background: status === 'extracting' ? '#eff6ff' : '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', gap: '6px', outline: status === 'extracting' ? '1px solid #3b82f6' : 'none' }),
  pageItemRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  pageLabel: (status) => ({ fontSize: '14px', fontWeight: 700, minWidth: '50px', color: status === 'extracting' ? '#1d4ed8' : '#334155' }),
  pill: (color, bg) => ({ fontSize: '10px', background: bg, color, padding: '2px 8px', borderRadius: '9999px', fontWeight: 500 }),
  modalFooter: { padding: '16px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '12px', flexShrink: 0 },
  resultBox: { fontSize: '12px', color: '#475569', background: '#fff', border: '1px solid #e2e8f0', padding: '10px 12px', borderRadius: '6px' },
  resultTitle: { fontWeight: 600, marginBottom: '4px', color: '#334155' },
};

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

const blobToBase64 = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.readAsDataURL(blob);
  reader.onload = () => {
    const base64 = reader.result.split(',')[1];
    resolve(base64);
  };
  reader.onerror = error => reject(error);
});

const fieldLabels = {
  date: 'Date (날짜)',
  items: 'Items (분석항목)',
  results: 'Results (분석결과)',
  location: 'Location (현장명)',
};

const fieldBorderColors = {
  date: '#3b82f6',
  items: '#a855f7',
  results: '#22c55e',
  location: '#f97316',
};

const fieldBgColors = {
  date: 'rgba(59,130,246,0.12)',
  items: 'rgba(168,85,247,0.12)',
  results: 'rgba(34,197,94,0.12)',
  location: 'rgba(249,115,22,0.12)',
};

export default function PdfParserView({ onClose }) {
  const [file, setFile] = useState(null);
  const [numPages, setNumPages] = useState(null);
  const [activePage, setActivePage] = useState(1);
  const [activeField, setActiveField] = useState(null);
  const [showTemplateBoxes, setShowTemplateBoxes] = useState(true);
  const [globalBoxes, setGlobalBoxes] = useState(() => {
    const saved = localStorage.getItem('roi_template');
    return saved ? JSON.parse(saved) : {};
  });
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentBox, setCurrentBox] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [extractedData, setExtractedData] = useState(null);
  const [batchProgress, setBatchProgress] = useState({ active: false, current: 0, total: 0, pages: [] });
  const [pdfDoc, setPdfDoc] = useState(null);
  const [masterSites, setMasterSites] = useState(() => {
    try { return JSON.parse(localStorage.getItem('master_sites') || '[]'); } catch { return []; }
  });
  const [uploadStatus, setUploadStatus] = useState(null);

  const containerRef = useRef(null);

  useEffect(() => {
    const fetchMasterSites = async () => {
      try {
        const response = await fetch("https://docs.google.com/spreadsheets/d/1hcfdTLz5SUyM9OqG3A9kkFGf0Tonh00xGkOj5tV2gOg/export?format=csv&gid=1961616617");
        const csvText = await response.text();
        const lines = csvText.split('\n');
        const sites = [];
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
- MLSS/SS 매핑 규칙(현장 반영): 폭기조 문맥 + 비고/표기에 MLSS가 명확하면 mlss에 값 저장.
  `;

  const generateBasename = (extracted, pageIndex) => {
    try {
      if (!extracted || !extracted.record) return `page_${pageIndex}`;
      const rec = extracted.record;
      const dateStr = (rec.report_date || "NoDate").replace(/-/g, "");
      let siteStr = (rec.site_name || "UnknownSite").replace(/[\/\\?%*:|"<>]/g, "");
      siteStr = siteStr.replace(/\s*(포기조|폭기조)\s*$/, "").trim();
      const isNum = (v) => v != null && v !== "";
      const hasOthers = isNum(rec.bod) || isNum(rec.tn) || isNum(rec.tp) || isNum(rec.total_coliform) || isNum(rec.do) || isNum(rec.ph);
      const hasMlss = isNum(rec.mlss);
      const hasSsOnly = isNum(rec.ss) && !hasMlss && !hasOthers;
      let prefix = "성적서";
      if (!hasOthers && hasMlss) prefix = "mlss";
      else if (!hasOthers && !hasMlss && hasSsOnly) prefix = "ss";
      else if (!hasOthers && !hasMlss && !hasSsOnly) prefix = "기타_성적서";
      return `${prefix}_${dateStr}_${siteStr}`;
    } catch(e) {
      return `page_${pageIndex}`;
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

  const onFileChange = (event) => {
    const selected = event.target.files?.[0];
    if (selected && selected.type === 'application/pdf') {
      setFile(selected);
      setActivePage(1);
      const saved = localStorage.getItem('roi_template');
      setGlobalBoxes(saved ? JSON.parse(saved) : {});
      setExtractedData(null);
      setUploadStatus(null);
    }
  };

  const movePage = async (pageIndex, direction) => {
    if (!file) return;
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDocLib = await PDFDocument.load(arrayBuffer);
      const targetIndex = pageIndex - 1;
      const swapIndex = direction === 'up' ? targetIndex - 1 : targetIndex + 1;
      if (swapIndex < 0 || swapIndex >= pdfDocLib.getPageCount()) return;
      const pageCount = pdfDocLib.getPageCount();
      const newPdf = await PDFDocument.create();
      const indices = Array.from({ length: pageCount }, (_, i) => i);
      [indices[targetIndex], indices[swapIndex]] = [indices[swapIndex], indices[targetIndex]];
      const copiedPages = await newPdf.copyPages(pdfDocLib, indices);
      copiedPages.forEach(p => newPdf.addPage(p));
      const pdfBytes = await newPdf.save();
      const newFile = new File([pdfBytes], file.name, { type: 'application/pdf' });
      setFile(newFile);
      setNumPages(newPdf.getPageCount());
      setPdfDoc(null);
      setActivePage(swapIndex + 1);
    } catch (err) {
      console.error("Error moving page", err);
    }
  };

  const deletePage = async (pageIndex) => {
    if (!file) return;
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDocLib = await PDFDocument.load(arrayBuffer);
      const targetIndex = pageIndex - 1;
      if (pdfDocLib.getPageCount() <= 1) {
        setFile(null);
        setPdfDoc(null);
        setNumPages(null);
        return;
      }
      pdfDocLib.removePage(targetIndex);
      const pdfBytes = await pdfDocLib.save();
      const newFile = new File([pdfBytes], file.name, { type: 'application/pdf' });
      setFile(newFile);
      setNumPages(pdfDocLib.getPageCount());
      setPdfDoc(null);
      if (activePage === pageIndex) setActivePage(Math.max(1, pageIndex - 1));
      else if (activePage > pageIndex) setActivePage(activePage - 1);
    } catch (err) {
      console.error("Error deleting page", err);
    }
  };

  const saveTemplate = () => {
    localStorage.setItem('roi_template', JSON.stringify(globalBoxes));
  };

  const clearTemplate = () => {
    localStorage.removeItem('roi_template');
    setGlobalBoxes({});
    setActiveField(null);
  };

  const handleMouseDown = (e) => {
    if (!activeField || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setIsDrawing(true);
    setStartPos({ x, y });
    setCurrentBox({ x, y, width: 0, height: 0 });
  };

  const handleMouseMove = (e) => {
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
    if (currentBox.width > 10 && currentBox.height > 10) {
      setGlobalBoxes(prev => ({ ...prev, [activeField]: currentBox }));
      setActiveField(null);
    }
    setCurrentBox(null);
  };

  const handleProcessAllAndUpload = async () => {
    if (!file || !pdfDoc) return;
    if (!numPages) return;

    const initialPages = Array.from({ length: numPages }, (_, i) => ({
      page: i + 1,
      status: 'pending'
    }));
    setBatchProgress({ active: true, current: 0, total: numPages, pages: initialPages });
    setProcessing(true);
    setExtractedData(null);
    setUploadStatus(null);
    await new Promise(resolve => setTimeout(resolve, 100));

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
          if (!imgBlob) throw new Error('페이지 이미지 변환 실패');

          let response;
          let retryCount = 0;
          const maxRetries = 2;
          while (retryCount <= maxRetries) {
            try {
              const formData = new FormData();
              formData.append("image", imgBlob, "page.jpg");
              formData.append("prompt", prompt);
              formData.append("model", "gemini-2.5-flash");
              const apiReq = await fetch("/api/generate-content", {
                method: "POST",
                body: formData,
              });
              if (!apiReq.ok) {
                let errMsg = "API Request Failed";
                try { const errObj = await apiReq.json(); errMsg = errObj.error || errMsg; } catch(e){}
                throw new Error(errMsg);
              }
              response = await apiReq.json();
              break;
            } catch (apiErr) {
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
          const cleanText = (response.text || "{}").replace(/```json/g, "").replace(/```/g, "").trim();
          const extracted = JSON.parse(cleanText);

          if (extracted && extracted.record) {
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            const dateStr = extracted.record.report_date;
            if (!dateStr || !dateRegex.test(String(dateStr))) extracted.record.report_date = null;
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

          if (i < numPages) await new Promise(r => setTimeout(r, 1000));
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
        if (count > maxCount) { maxCount = count; mostCommonDate = dateStr; }
      }

      let unusedSites = masterSites.map(site => site.replace(/\s*(포기조|폭기조)\s*$/, "").trim());
      if (unusedSites.length > 0) {
        const usedSites = allResults.map(res => res.extracted?.record?.site_name).filter(Boolean);
        unusedSites = unusedSites.filter(site => !usedSites.includes(site));
      }

      const finalJsonList = [];
      allResults.forEach((res, idx) => {
        const ex = res.extracted;
        if (ex && ex.record) {
          if (!ex.errors) ex.errors = [];
          if (!ex.record.report_date && mostCommonDate) ex.record.report_date = mostCommonDate;
          if (!ex.record.site_name && unusedSites.length > 0) {
            ex.record.site_name = unusedSites.shift();
          }
          ex.include = true;
          ex.errors = [];
          if (!ex.record.report_date) { ex.include = false; ex.errors.push("invalid_or_missing_date"); }
          if (!ex.record.site_name) { ex.include = false; ex.errors.push("missing_site_name"); }
          if (ex.include) { finalJsonList.push(ex); successCount++; }
        }
      });

      setBatchProgress(prev => ({ ...prev, stage: 'uploading' }));
      let imageOk = 0, jsonOk = 0, imageFail = 0, jsonFail = 0;

      for (const res of allResults) {
        const ex = res.extracted;
        if (!ex || !ex.record || !ex.include) continue;
        const basename = generateBasename(ex, allResults.indexOf(res) + 1);
        const formData = new FormData();
        formData.append('files', res.imgBlob, `${basename}.jpg`);
        try {
          const r = await fetch('/api/certificates/manual-upload-file', { method: 'POST', body: formData });
          if (r.ok) imageOk++; else imageFail++;
        } catch (err) {
          console.error(`이미지 업로드 실패: ${basename}`, err);
          imageFail++;
        }
      }

      for (const ex of finalJsonList) {
        try {
          const r = await fetch('/api/certificates/import-from-ai', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(ex),
          });
          if (r.ok) jsonOk++; else jsonFail++;
        } catch (err) {
          console.error('BigQuery 전송 실패', err);
          jsonFail++;
        }
      }

      setUploadStatus({ imageOk, imageFail, jsonOk, jsonFail });
    }

    setProcessing(false);
  };

  return (
    <div style={S.overlay}>
      <header style={S.header}>
        <div style={S.headerLeft}>
          <div style={S.headerIcon}><FileText size={20} color="#fff" /></div>
          <h1 style={S.headerTitle}>성적서 PDF 파서</h1>
        </div>
        <div style={S.headerRight}>
          <button onClick={saveTemplate} style={S.btnGhost}>ROI 템플릿 저장</button>
          {Object.keys(globalBoxes).length > 0 && (
            <>
              <button onClick={clearTemplate} style={S.btnGhostRed}>초기화</button>
              <button onClick={() => setShowTemplateBoxes(!showTemplateBoxes)} style={S.btnGhostGray}>
                {showTemplateBoxes ? <><EyeOff size={14}/> ROI 숨김</> : <><Eye size={14}/> ROI 표시</>}
              </button>
            </>
          )}
          <button onClick={onClose} style={S.btnClose}><X size={20} /></button>
        </div>
      </header>

      <div style={S.main}>
        <aside style={S.sidebar}>
          <div style={S.sidebarHead}>
            <span style={S.sidebarHeadText}>Pages</span>
            <span style={{ fontSize: '12px', color: '#94a3b8' }}>{numPages || 0} total</span>
          </div>
          <div style={S.uploadArea}>
            <div style={S.uploadBox}>
              <input type="file" accept="application/pdf" onChange={onFileChange} style={S.uploadInput} />
              <Upload size={16} color="#94a3b8" />
              <span style={{ fontSize: '12px', color: '#475569', fontWeight: 500, marginTop: '4px' }}>PDF 업로드</span>
            </div>
          </div>
          <div style={S.thumbScroll}>
            {file && (
              <Document file={file} onLoadSuccess={(pdf) => { setNumPages(pdf.numPages); setPdfDoc(pdf); }}>
                {Array.from({ length: numPages || 0 }, (_, index) => {
                  const pageNum = index + 1;
                  const isActive = activePage === pageNum;
                  return (
                    <div key={'thumb-' + pageNum} style={S.thumbWrap}>
                      <button onClick={() => setActivePage(pageNum)} style={S.thumbBtn(isActive)}>
                        <div style={S.thumbInner}>
                          <Page pageNumber={pageNum} width={160} renderTextLayer={false} renderAnnotationLayer={false} />
                        </div>
                        <span style={S.thumbBadge(isActive)}>P{pageNum}</span>
                      </button>
                      <div style={S.thumbActions}>
                        {pageNum > 1 && <button onClick={(e) => { e.stopPropagation(); movePage(pageNum, 'up'); }} style={S.iconBtn()}><ArrowUp size={14} /></button>}
                        {pageNum < (numPages || 0) && <button onClick={(e) => { e.stopPropagation(); movePage(pageNum, 'down'); }} style={S.iconBtn()}><ArrowDown size={14} /></button>}
                        <button onClick={(e) => { e.stopPropagation(); deletePage(pageNum); }} style={S.iconBtnRed}><Trash2 size={14} /></button>
                      </div>
                    </div>
                  );
                })}
              </Document>
            )}
          </div>
        </aside>

        <section style={S.content}>
          {file ? (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div style={S.toolbar}>
                <div>
                  <div style={S.toolbarLabel}><Crop size={14} /> 분석 영역 지정:</div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {Object.keys(fieldLabels).map((field) => (
                      <button key={field} onClick={() => setActiveField(prev => prev === field ? null : field)} style={activeField === field ? S.fieldBtnActive : S.fieldBtnInactive}>
                        {field === 'date' && <Calendar size={14} color={activeField === field ? '#2563eb' : '#94a3b8'} />}
                        {field === 'items' && <List size={14} color={activeField === field ? '#2563eb' : '#94a3b8'} />}
                        {field === 'results' && <CheckSquare size={14} color={activeField === field ? '#2563eb' : '#94a3b8'} />}
                        {field === 'location' && <MapPin size={14} color={activeField === field ? '#2563eb' : '#94a3b8'} />}
                        {fieldLabels[field]}
                        {globalBoxes[field] && <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: fieldBorderColors[field], display: 'inline-block' }} />}
                      </button>
                    ))}
                  </div>
                </div>
                {!activeField && (
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: '12px', alignItems: 'center' }}>
                    {uploadStatus && (
                      <div style={S.statusBadge}>
                        이미지 {uploadStatus.imageOk}성공/{uploadStatus.imageFail}실패 &nbsp;|&nbsp; BigQuery {uploadStatus.jsonOk}성공/{uploadStatus.jsonFail}실패
                      </div>
                    )}
                    <button onClick={handleProcessAllAndUpload} disabled={processing || batchProgress.active} style={(processing || batchProgress.active) ? S.btnPrimaryDisabled : S.btnPrimary}>
                      {batchProgress.active
                        ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />{batchProgress.current === 0 ? 'PDF 준비 중...' : `처리 중: ${batchProgress.current} / ${batchProgress.total}`}</>
                        : <><CloudUpload size={16} />전체 파싱 후 전송</>
                      }
                    </button>
                  </div>
                )}
              </div>

              <div style={S.pdfScrollArea}>
                <div style={S.pdfCanvas(!!activeField)} ref={containerRef} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
                  <Document file={file}>
                    <Page pageNumber={activePage} renderAnnotationLayer={false} renderTextLayer={false} />
                  </Document>
                  {showTemplateBoxes && Object.entries(globalBoxes).map(([field, box]) => box && (
                    <div key={field} style={{ position: 'absolute', left: box.x, top: box.y, width: box.width, height: box.height, border: `2px solid ${fieldBorderColors[field]}`, background: fieldBgColors[field], pointerEvents: 'none' }}>
                      <div style={{ position: 'absolute', top: '-24px', left: '-2px', fontSize: '12px', fontWeight: 700, color: '#fff', background: fieldBorderColors[field], padding: '2px 8px', borderRadius: '4px 4px 0 0', whiteSpace: 'nowrap' }}>
                        {fieldLabels[field]}
                      </div>
                    </div>
                  ))}
                  {isDrawing && currentBox && activeField && (
                    <div style={{ position: 'absolute', left: currentBox.x, top: currentBox.y, width: currentBox.width, height: currentBox.height, border: `2px dashed ${fieldBorderColors[activeField]}`, pointerEvents: 'none' }} />
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div style={S.emptyState}>
              <div style={S.emptyInner}>
                <div style={S.emptyIcon}><Crop size={32} color="#60a5fa" /></div>
                <h2 style={{ fontSize: '20px', fontWeight: 600, color: '#334155', marginBottom: '8px' }}>성적서 PDF 파싱</h2>
                <p style={{ fontSize: '14px', color: '#94a3b8', lineHeight: 1.6 }}>왼쪽에서 PDF 파일을 업로드하면 자동으로 데이터를 추출해 BigQuery와 Drive에 저장합니다.</p>
              </div>
            </div>
          )}
        </section>
      </div>

      {batchProgress.active && (
        <div style={S.modalOverlay}>
          <div style={S.modalBox}>
            <div style={S.modalHeader}>
              <div style={S.modalTitle}>
                {batchProgress.current < batchProgress.total && <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />}
                {batchProgress.current === batchProgress.total ? '처리 완료' : '일괄 추출 진행 중...'}
              </div>
              <div style={S.progressBarWrap}>
                <div style={S.progressBarLabel}>
                  <span>{batchProgress.current} / {batchProgress.total} 완료</span>
                  <span>{batchProgress.total > 0 ? Math.round((batchProgress.current / batchProgress.total) * 100) : 0}%</span>
                </div>
                <div style={S.progressBarTrack}>
                  <div style={S.progressBarFill(batchProgress.total > 0 ? (batchProgress.current / batchProgress.total) * 100 : 0)} />
                </div>
              </div>
            </div>
            <div style={S.pageList}>
              {batchProgress.pages.map((p) => (
                <div key={p.page} ref={(el) => { if (el && p.status === 'extracting') el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }} style={S.pageItem(p.status)}>
                  <div style={S.pageItemRow}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={S.pageLabel(p.status)}>Page {p.page}</span>
                      {p.status === 'extracting' && <span style={S.pill('#1d4ed8', '#dbeafe')}>{p.detail || '분석 중...'}</span>}
                      {p.status === 'done' && <span style={S.pill('#15803d', '#dcfce7')}>성공</span>}
                      {p.status === 'failed' && <span style={S.pill('#dc2626', '#fee2e2')}>실패</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '24px' }}>
                      {p.status === 'pending' && <div style={{ width: '20px', height: '20px', borderRadius: '50%', border: '2px solid #e2e8f0' }} />}
                      {p.status === 'extracting' && <Loader2 size={18} color="#2563eb" style={{ animation: 'spin 1s linear infinite' }} />}
                      {p.status === 'done' && <CheckCircle2 size={20} color="#22c55e" />}
                      {p.status === 'failed' && <XCircle size={20} color="#ef4444" />}
                    </div>
                  </div>
                  {p.status === 'failed' && p.detail && (
                    <div style={{ fontSize: '11px', color: '#dc2626', background: '#fef2f2', padding: '8px', borderRadius: '4px', border: '1px solid #fecaca', whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: '4px' }}>{p.detail}</div>
                  )}
                </div>
              ))}
            </div>
            {batchProgress.current === batchProgress.total && batchProgress.total > 0 && (
              <div style={S.modalFooter}>
                {uploadStatus && (
                  <div style={S.resultBox}>
                    <div style={S.resultTitle}>전송 결과</div>
                    <div>이미지 → Drive: <span style={{ color: '#16a34a', fontWeight: 600 }}>{uploadStatus.imageOk}건 성공</span>{uploadStatus.imageFail > 0 && <span style={{ color: '#dc2626' }}> / {uploadStatus.imageFail}건 실패</span>}</div>
                    <div>JSON → BigQuery: <span style={{ color: '#16a34a', fontWeight: 600 }}>{uploadStatus.jsonOk}건 성공</span>{uploadStatus.jsonFail > 0 && <span style={{ color: '#dc2626' }}> / {uploadStatus.jsonFail}건 실패</span>}</div>
                  </div>
                )}
                <button onClick={() => setBatchProgress({ active: false, current: 0, total: 0, pages: [] })} style={{ ...S.btnPrimary, alignSelf: 'flex-end', padding: '8px 24px' }}>닫기</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

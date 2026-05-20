import React, { useState, useRef, useEffect } from 'react';
import { getApiBase } from '../../../core/api/serverConfig';
import { createWorker } from 'tesseract.js';
import { Upload, FileText, Crop, Calendar, List, CheckSquare, MapPin, CloudUpload, Loader2, ArrowUp, ArrowDown, Trash2, Eye, EyeOff, CheckCircle2, XCircle, X } from 'lucide-react';
import { Document, Page, pdfjs } from 'react-pdf';
import { PDFDocument } from 'pdf-lib';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

const adminHeaders = () => ({
  'x-user-role': 'super_admin',
  'x-user-name': 'admin',
});

const S = {
  overlay: { width: '100%', height: '100%', background: '#f1f5f9', display: 'flex', flexDirection: 'column', fontFamily: 'sans-serif', minHeight: 0, overflow: 'hidden' },
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

pdfjs.GlobalWorkerOptions.workerSrc = './pdf.worker.min.mjs';

const blobToBase64 = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.readAsDataURL(blob);
  reader.onload = () => {
    const base64 = reader.result.split(',')[1];
    resolve(base64);
  };
  reader.onerror = error => reject(error);
});

// OCR: canvas에서 특정 ROI 영역을 잘라 Tesseract로 인식
async function ocrRoiFromCanvas(canvas, box, scale, lang = 'kor+eng') {
  const PADDING = 6;
  const sx = Math.max(0, box.x * scale - PADDING);
  const sy = Math.max(0, box.y * scale - PADDING);
  const sw = Math.min(canvas.width - sx, box.width * scale + PADDING * 2);
  const sh = Math.min(canvas.height - sy, box.height * scale + PADDING * 2);
  const crop = document.createElement('canvas');
  crop.width = sw; crop.height = sh;
  crop.getContext('2d').drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
  const worker = await createWorker(lang);
  const { data: { text } } = await worker.recognize(crop);
  await worker.terminate();
  crop.width = 0; crop.height = 0;
  return text.trim();
}

// 날짜 파싱: "2025.03.15", "2025-03-15", "2025년3월15일" 등 → "YYYY-MM-DD"
function parseDate(text) {
  const patterns = [
    /(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/,
    /(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/,
    /(\d{4})\s*(\d{2})\s*(\d{2})/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const y = m[1], mo = m[2].padStart(2, '0'), d = m[3].padStart(2, '0');
      if (parseInt(mo) >= 1 && parseInt(mo) <= 12 && parseInt(d) >= 1 && parseInt(d) <= 31)
        return `${y}-${mo}-${d}`;
    }
  }
  return null;
}

// 현장명 파싱: 마스터 목록과 퍼지 매칭
function parseSiteName(text, masterSites) {
  if (!masterSites || masterSites.length === 0) return null;
  const clean = text.replace(/\s+/g, ' ').trim();
  // 완전 포함 우선
  for (const site of masterSites) {
    if (clean.includes(site)) return site;
  }
  // 부분 매칭 (3글자 이상 공통)
  let best = null, bestLen = 0;
  for (const site of masterSites) {
    for (let len = Math.min(site.length, clean.length); len >= 3; len--) {
      for (let s = 0; s <= site.length - len; s++) {
        const sub = site.substring(s, s + len);
        if (clean.includes(sub) && len > bestLen) { best = site; bestLen = len; }
      }
    }
  }
  return bestLen >= 3 ? best : null;
}

// 고정 분석항목 정의: 성적서에 표기되는 한글명 → DB 필드명
const ANALYTE_LABEL_MAP = [
  { key: 'ss',            labels: ['부유물질', 'SS'] },
  { key: 'bod',           labels: ['생물화학적산소요구량', 'BOD'] },
  { key: 'tn',            labels: ['총질소', 'T-N', 'TN'] },
  { key: 'tp',            labels: ['총인', 'T-P', 'TP'] },
  { key: 'total_coliform',labels: ['총대장균군', '총대장균', 'coliform'] },
  { key: 'mlss',          labels: ['MLSS', 'mlss'] },
  { key: 'do',            labels: ['용존산소', 'DO', 'D.O'] },
  { key: 'ph',            labels: ['수소이온농도', 'pH', 'ph'] },
];

// 항목 텍스트(items ROI)와 수치 텍스트(results ROI)를 줄 단위로 매핑
function parseAnalytes(itemsText, resultsText) {
  const result = {};

  // 두 컬럼이 별도로 OCR된 경우: 줄 수가 비슷하면 index 매핑
  if (resultsText) {
    const itemLines = itemsText.split('\n').map(l => l.trim()).filter(Boolean);
    const valLines  = resultsText.split('\n').map(l => l.trim()).filter(Boolean);

    itemLines.forEach((label, idx) => {
      const analyte = ANALYTE_LABEL_MAP.find(a =>
        a.labels.some(l => label.includes(l))
      );
      if (!analyte) return;
      const valStr = valLines[idx] || '';
      const numMatch = valStr.replace(/\s+/g, '').match(/([0-9]+\.?[0-9]*)/);
      if (numMatch) result[analyte.key] = parseFloat(numMatch[1]);
    });

    if (Object.keys(result).length > 0) return result;
  }

  // 폴백: 한 텍스트 안에 "항목명 수치" 인라인으로 있는 경우
  const combined = itemsText + '\n' + (resultsText || '');
  for (const { key, labels } of ANALYTE_LABEL_MAP) {
    for (const label of labels) {
      const re = new RegExp(label.replace('.', '\\.') + '[\\s:：]*([0-9]+\\.?[0-9]*)', 'i');
      const m = combined.match(re);
      if (m) { result[key] = parseFloat(m[1]); break; }
    }
  }
  return result;
}

// 전체 OCR 시도: 성공한 필드는 로컬 파싱, 실패 필드만 Gemini 전송 대상으로 반환
async function tryOcrParse(canvas, globalBoxes, scale, masterSites) {
  const result = { date: null, site_name: null, analytes: {}, failedFields: [] };

  if (globalBoxes.date) {
    const text = await ocrRoiFromCanvas(canvas, globalBoxes.date, scale);
    const parsed = parseDate(text);
    console.log('[OCR] date 원문:', JSON.stringify(text), '→ 파싱:', parsed);
    if (parsed) result.date = parsed;
    else result.failedFields.push('date');
  } else result.failedFields.push('date');

  if (globalBoxes.location) {
    const text = await ocrRoiFromCanvas(canvas, globalBoxes.location, scale);
    const parsed = parseSiteName(text, masterSites);
    console.log('[OCR] location 원문:', JSON.stringify(text), '→ 파싱:', parsed);
    if (parsed) result.site_name = parsed;
    else result.failedFields.push('location');
  } else result.failedFields.push('location');

  const itemsText  = globalBoxes.items   ? await ocrRoiFromCanvas(canvas, globalBoxes.items,   scale) : '';
  const resultsText = globalBoxes.results ? await ocrRoiFromCanvas(canvas, globalBoxes.results, scale) : '';
  console.log('[OCR] items 원문:', JSON.stringify(itemsText));
  console.log('[OCR] results 원문:', JSON.stringify(resultsText));
  if (itemsText || resultsText) {
    result.analytes = parseAnalytes(itemsText, resultsText);
    console.log('[OCR] analytes 파싱 결과:', result.analytes);
    if (Object.keys(result.analytes).length === 0) {
      result.failedFields.push('items'); result.failedFields.push('results');
    }
  } else {
    result.failedFields.push('items'); result.failedFields.push('results');
  }

  return result;
}

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

export default function PdfParserView() {
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
        const res = await fetch(`${getApiBase()}/api/certificates/site-normalization`, { headers: adminHeaders() });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const sites = (data.siteMaster || []).map(s => s.official_name).filter(Boolean);
        if (sites.length > 0) {
          setMasterSites(sites);
          localStorage.setItem('master_sites', JSON.stringify(sites));
          console.log(`[MasterSites] ${sites.length}개 현장명 로드 완료`);
        }
      } catch (error) {
        console.error('[MasterSites] 로드 실패, 캐시 사용:', error.message);
      }
    };
    fetchMasterSites();
  }, []);

  const getAiPromptText = (sitesMeta) => `
성적서 이미지에서 아래 항목을 추출해 JSON만 출력하라.
${sitesMeta}

[분석항목 한글→필드 매핑]
- 부유물질 → ss
- 생물화학적산소요구량(BOD) → bod
- 총질소(T-N) → tn
- 총인(T-P) → tp
- 총대장균군 → total_coliform
- MLSS → mlss
- 용존산소(DO) → do
- 수소이온농도(pH) → ph

[출력 스키마]
{
  "include": true,
  "record": {
    "report_date": "YYYY-MM-DD",
    "site_name": "string",
    "ss": null,
    "bod": null,
    "tn": null,
    "tp": null,
    "total_coliform": null,
    "mlss": null,
    "do": null,
    "ph": null
  },
  "errors": []
}

[규칙]
- report_date: 채취일시 또는 검사일자, YYYY-MM-DD 형식.
- site_name: 이미지의 "대상의뢰명(측정지점명)" 셀 값을 읽어라.
  1단계: 마스터 목록에서 정확히 일치하는 항목이 있으면 그대로 사용.
  2단계: 정확히 없으면, 이미지에서 읽은 이름의 핵심어(예: "여주휴게소")로 마스터를 검색해 유일하게 매칭되는 항목이 있으면 반드시 그 마스터 이름을 사용. (방향 표현이 달라도 무방: "서창방향"→"인천방향" 등)
  3단계: 마스터에서 2개 이상 매칭되면 가장 유사한 것을 선택.
  4단계: 마스터에 전혀 없으면 이미지 원문 그대로 출력.
  절대 마스터에 없는 이름을 지어내거나 관계없는 다른 현장명을 사용하지 말 것.
- 측정분석값 열의 숫자를 읽어 해당 필드에 number로 입력. 없으면 null.
- 숫자에 공백 포함 시 제거 후 변환("4 62" → 4.62 아닌 경우 null).
- include: 이미지에서 report_date와 site_name을 읽을 수 있으면 반드시 true. 마스터 목록에 없는 현장명이어도 true. 날짜나 현장명을 전혀 읽을 수 없을 때만 false.
- JSON만 출력. 추가 텍스트 금지.
- MLSS는 폭기조 관련 항목, SS와 혼동 금지.
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

  const getFullPageImageBlob = async (pdfDocument, pageNum) => {
    try {
      const page = await pdfDocument.getPage(pageNum);
      const scale = 2.0;
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: ctx, viewport }).promise;
      const blob = await new Promise((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.88);
      });
      page.cleanup();
      canvas.width = 0; canvas.height = 0;
      return blob;
    } catch(e) {
      console.error(e);
      return null;
    }
  };

  const getPdfPageImageBlob = async (pdfDocument, pageNum) => {
    try {
      const page = await pdfDocument.getPage(pageNum);
      const scale = 2.0;
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: ctx, viewport }).promise;

      const roiKeys = Object.keys(globalBoxes);
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
          return { field, sx, sy, sw, sh, dh: Math.round(sh * scaleFactor) };
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
        const blob = await new Promise((resolve) => {
          outCanvas.toBlob((b) => resolve(b), 'image/jpeg', 0.88);
        });
        page.cleanup();
        canvas.width = 0; canvas.height = 0;
        outCanvas.width = 0; outCanvas.height = 0;
        return blob;
      }

      const blob = await new Promise((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.82);
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
      let sitesMeta = "";
      if (masterSites.length > 0) {
        sitesMeta = `\n[현장명(Site Name) 마스터 목록]\n${masterSites.join(', ')}\n※ 현장명을 추출할 때 반드시 위 목록과 대조하여 오타 없이 동일한 이름으로 교정해서 출력하라.`;
      }

      for (let i = 1; i <= numPages; i++) {
        setBatchProgress(prev => {
          const newPages = [...prev.pages];
          newPages[i - 1] = { page: i, status: 'extracting', detail: 'Gemini 분석 중...' };
          return { ...prev, current: i, pages: newPages };
        });
        try {
          // Gemini용: ROI 크롭 합성 이미지
          const imgBlob = await getPdfPageImageBlob(pdfDoc, i);
          if (!imgBlob) throw new Error('페이지 이미지 변환 실패');
          // Drive 저장용: 전체 페이지 이미지
          const fullImgBlob = await getFullPageImageBlob(pdfDoc, i);

          const prompt = getAiPromptText(sitesMeta);
          let response;
          let retryCount = 0;
          while (retryCount <= 2) {
            try {
              const formData = new FormData();
              formData.append("image", imgBlob, "page.jpg");
              formData.append("prompt", prompt);
              formData.append("model", "gemini-3.1-flash-lite");
              const apiReq = await fetch(`${getApiBase()}/api/generate-content`, { method: "POST", headers: adminHeaders(), body: formData });
              if (!apiReq.ok) {
                let errMsg = "API Request Failed";
                try { const e = await apiReq.json(); errMsg = e.error || errMsg; if (e.details) console.error('[Gemini 상세 에러]', e.details); } catch(_){}
                throw new Error(errMsg);
              }
              response = await apiReq.json();
              break;
            } catch (apiErr) {
              if (retryCount >= 2) throw apiErr;
              setBatchProgress(prev => {
                const newPages = [...prev.pages];
                newPages[i - 1] = { page: i, status: 'extracting', detail: `재시도 중... (${retryCount + 1})` };
                return { ...prev, pages: newPages };
              });
              await new Promise(r => setTimeout(r, 2000 * (retryCount + 1)));
              retryCount++;
            }
          }

          const cleanText = (response.text || "{}").replace(/```json/g, "").replace(/```/g, "").trim();
          let extracted = JSON.parse(cleanText);

          // 공통 후처리
          if (extracted && extracted.record) {
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            if (!dateRegex.test(String(extracted.record.report_date || ''))) extracted.record.report_date = null;
            if (extracted.record.site_name) {
              extracted.record.site_name = extracted.record.site_name.replace(/\s*(포기조|폭기조)\s*$/, "").trim();
            }
            delete extracted.reason; delete extracted.source; delete extracted.meta; delete extracted.record.site_id;
          }

          if (extracted) {
            allResults.push({ extracted, imgBlob: fullImgBlob || imgBlob });
            setBatchProgress(prev => {
              const newPages = [...prev.pages];
              newPages[i - 1] = { page: i, status: 'done' };
              return { ...prev, pages: newPages };
            });
          } else {
            setBatchProgress(prev => {
              const newPages = [...prev.pages];
              newPages[i - 1] = { page: i, status: 'failed', detail: '결과 없음' };
              return { ...prev, pages: newPages };
            });
          }

          if (i < numPages) await new Promise(r => setTimeout(r, 500));
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
          if (!ex.record.site_name) { ex.record.site_name = '미확인현장'; ex.record._site_unresolved = true; }
          if (ex.include) { finalJsonList.push(ex); successCount++; }
        }
      });

      setBatchProgress(prev => ({ ...prev, stage: 'uploading' }));
      console.log(`[Upload] 전체 결과 ${allResults.length}건, include=true: ${allResults.filter(r=>r.extracted?.include).length}건`);
      allResults.forEach((r,i) => console.log(`  Page${i+1}:`, r.extracted?.include, r.extracted?.record?.site_name, r.extracted?.record?.report_date));
      let imageOk = 0, jsonOk = 0, imageFail = 0, jsonFail = 0;
      const unmatchedSites = [];

      // 1단계: BigQuery INSERT 먼저
      for (const ex of finalJsonList) {
        try {
          const r = await fetch(`${getApiBase()}/api/certificates/import-from-ai`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...adminHeaders() },
            body: JSON.stringify({ ...ex, source_pdf_name: file?.name || null }),
          });
          if (r.ok) {
            jsonOk++;
            const rData = await r.json().catch(() => ({}));
            if (rData.manual_review_required) {
              unmatchedSites.push({ name: rData.site_name_raw || ex.record?.site_name || '알 수 없음', unresolved: false });
            } else if (ex.record?._site_unresolved) {
              unmatchedSites.push({ name: '미확인현장', unresolved: true });
            }
            console.log(`[BigQuery] 전송 성공:`, ex.record?.site_name, ex.record?.report_date);
          } else {
            jsonFail++;
            const t = await r.text();
            console.error(`[BigQuery] 전송 실패(${r.status}):`, t.substring(0,200));
          }
        } catch (err) {
          console.error('[BigQuery] 전송 예외:', err);
          jsonFail++;
        }
      }

      // BigQuery DML 반영 대기 (INSERT 후 즉시 UPDATE 시 행을 못 찾는 문제 방지)
      if (jsonOk > 0) await new Promise(r => setTimeout(r, 4000));

      // 2단계: Drive 업로드 (BigQuery 행이 존재한 후 drive_file_id UPDATE)
      for (const res of allResults) {
        const ex = res.extracted;
        if (!ex || !ex.record || !ex.include) continue;
        const basename = generateBasename(ex, allResults.indexOf(res) + 1);
        const formData = new FormData();
        formData.append('files', res.imgBlob, `${basename}.jpg`);
        try {
          const r = await fetch(`${getApiBase()}/api/certificates/manual-upload-file`, { method: 'POST', headers: adminHeaders(), body: formData });
          if (r.ok) { imageOk++; console.log(`[Drive] 업로드 성공: ${basename}.jpg`); }
          else { imageFail++; const t = await r.text(); console.error(`[Drive] 업로드 실패(${r.status}): ${basename}`, t.substring(0,200)); }
        } catch (err) {
          console.error(`[Drive] 업로드 예외: ${basename}`, err);
          imageFail++;
        }
      }

      setUploadStatus({ imageOk, imageFail, jsonOk, jsonFail, unmatchedSites });
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
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                        <div style={S.statusBadge}>
                          이미지 {uploadStatus.imageOk}성공/{uploadStatus.imageFail}실패 &nbsp;|&nbsp; BigQuery {uploadStatus.jsonOk}성공/{uploadStatus.jsonFail}실패
                        </div>
                        {uploadStatus.unmatchedSites?.length > 0 && (
                          <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', color: '#c2410c', maxWidth: '420px' }}>
                            <strong>⚠ 현장 마스터 미등록 — Google Sheets에 추가 후 재업로드해주세요:</strong><br />
                            {uploadStatus.unmatchedSites.map((s, i) => (
                              <span key={i} style={{ display: 'inline-block', background: s.unresolved ? '#fee2e2' : '#ffedd5', borderRadius: '4px', padding: '1px 6px', margin: '2px 2px 0 0', fontWeight: 700 }}>
                                {s.unresolved ? '⚠ 현장명 인식 실패 (미확인현장으로 임시 저장)' : s.name}
                              </span>
                            ))}
                          </div>
                        )}
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

import { useState, useCallback, useEffect } from 'react';
import { getApiBase } from '../../../../core/api/serverConfig';
import { matchSiteName } from '../../hooks/useSiteMaster';

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

function normalizeSiteCandidateNames(siteCandidates = []) {
  if (!Array.isArray(siteCandidates)) return [];

  const names = [];
  const seen = new Set();

  siteCandidates.forEach((site) => {
    const name = typeof site === 'string'
      ? site
      : (site?.site_name || site?.official_name || site?.name || '');
    const trimmed = String(name || '').trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    names.push(trimmed);
  });

  return names;
}

/**
 * Gemini API 호출 + 성적서 데이터 추출 ViewModel
 * PdfParserView의 검증된 로직을 MVVM으로 이식
 */
export function usePdfGemini() {
  const [masterSites, setMasterSites] = useState(() => {
    try { return JSON.parse(localStorage.getItem('master_sites') || '[]'); } catch { return []; }
  });

  // 현장명 마스터 로드 (캐시 없을 때만 API 호출)
  const fetchMasterSites = useCallback(async (force = false) => {
    // 캐시가 있고 force가 아니면 API 호출 건너뛰기
    const cached = localStorage.getItem('master_sites');
    if (!force && cached) {
      try {
        const sites = JSON.parse(cached);
        if (sites.length > 0) {
          console.log(`[usePdfGemini] 캐시된 ${sites.length}개 현장명 사용`);
          setMasterSites(sites);
          return;
        }
      } catch { /* 무시 */ }
    }

    try {
      const res = await fetch(`${getApiBase()}/api/certificates/site-normalization`, {
        headers: adminHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const sites = (data.siteMaster || []).map(s => s.official_name).filter(Boolean);
      if (sites.length > 0) {
        setMasterSites(sites);
        localStorage.setItem('master_sites', JSON.stringify(sites));
        console.log(`[usePdfGemini] API로 ${sites.length}개 현장명 로드 완료`);
      }
    } catch (error) {
      console.error('[usePdfGemini] 현장명 로드 실패, 캐시 사용:', error.message);
    }
  }, []);

  // 앱 시작 시 1회만 실행 - 캐시 있으면 아예 API 호출 안함
  useEffect(() => {
    const cached = localStorage.getItem('master_sites');
    if (cached) {
      // 캐시 있음: 콘솔에만 출력하고 API 호출 안함
      try {
        const sites = JSON.parse(cached);
        console.log(`[usePdfGemini] 캐시된 현장명 ${sites.length}개 사용 (API 호출 없음)`);
      } catch {
        // 캐시 파싱 실패 시에만 API 호출
        fetchMasterSites(true);
      }
    } else {
      // 캐시 없음: 처음 1회 API 호출
      console.log('[usePdfGemini] 캐시 없음 - API에서 현장명 로드');
      fetchMasterSites(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 마운트 시 1회만 실행

  /**
   * Gemini AI 프롬프트 생성
   */
  const buildPrompt = useCallback(() => {
    let sitesMeta = '';
    if (masterSites.length > 0) {
      sitesMeta = `\n[현장명(Site Name) 마스터 목록]\n${masterSites.join(', ')}\n※ 현장명을 추출할 때 반드시 위 목록과 대조하여 오타 없이 동일한 이름으로 교정해서 출력하라.`;
    }

    return `
성적서 이미지(날짜와 현장명이 표시된 기본 정보 영역)에서 아래 규칙에 따라 정보를 추출하여 오직 JSON 형식으로만 응답하라.
${sitesMeta}

[출력 스키마]
{
  "include": true,
  "record": {
    "report_date": "YYYY-MM-DD",
    "site_name": "string"
  },
  "errors": []
}

[규칙]
1. report_date: 채취일자 또는 검사일자를 찾아 YYYY-MM-DD 형식으로 출력하라.
2. site_name: "대상의뢰명(측정지점명)" 등 현장명이 포함된 셀의 텍스트를 읽어서 마스터 목록과 대조한 뒤 정확한 공식 현장명을 출력하라.
   - 1단계: 마스터 목록에서 정확히 일치하는 항목이 있으면 그대로 사용.
   - 2단계: 정확히 없으면, 이미지에서 읽은 이름의 핵심어(예: "여주휴게소")로 마스터를 검색해 유일하게 매칭되는 항목이 있으면 반드시 그 마스터 이름을 사용.
   - 3단계: 마스터에서 2개 이상 매칭되면 가장 유사한 것을 선택.
   - 4단계: 마스터에 전혀 없으면 이미지 원문 그대로 출력. (예: "여주휴게소 폭기조" 처럼 폭기조라는 말이 들어있으면 원문 그대로 출력)
3. include: 이미지에서 report_date와 site_name을 읽을 수 있으면 반드시 true. 날짜나 현장명을 전혀 읽을 수 없을 때만 false.
4. JSON 외에 어떠한 설명 문자도 포함하지 마라.
`;
  }, [masterSites]);

  /**
   * 단일 이미지에 대해 Gemini API 호출 (재시도 포함)
   */
  const callGemini = useCallback(async (imgBlob, onRetry) => {
    const prompt = buildPrompt();
    let response;
    let retryCount = 0;

    while (retryCount <= 2) {
      try {
        const formData = new FormData();
        formData.append('image', imgBlob, 'page.jpg');
        formData.append('prompt', prompt);
        formData.append('model', 'gemini-3.5-flash');

        const apiReq = await fetch(`${getApiBase()}/api/generate-content`, {
          method: 'POST',
          headers: adminHeaders(),
          body: formData,
        });

        if (!apiReq.ok) {
          let errMsg = 'API Request Failed';
          try {
            const e = await apiReq.json();
            errMsg = e.error || errMsg;
            if (e.details) console.error('[Gemini 상세 에러]', e.details);
          } catch (jsonErr) {
            console.warn('[Gemini JSON 파싱 오류]', jsonErr.message);
          }
          throw new Error(errMsg);
        }

        response = await apiReq.json();
        break;
      } catch (apiErr) {
        if (retryCount >= 2) throw apiErr;
        onRetry?.(retryCount + 1);
        await new Promise(r => setTimeout(r, 2000 * (retryCount + 1)));
        retryCount++;
      }
    }

    // JSON 파싱
    const cleanText = (response.text || '{}').replace(/```json/g, '').replace(/```/g, '').trim();
    let extracted = JSON.parse(cleanText);

    // 후처리
    if (extracted?.record) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(String(extracted.record.report_date || ''))) {
        extracted.record.report_date = null;
      }
      delete extracted.reason;
      delete extracted.source;
      delete extracted.meta;
      delete extracted.record.site_id;
    }

    return extracted;
  }, [buildPrompt]);

  /**
   * 파일명 생성 (Drive 업로드용)
   */
  const generateBasename = useCallback((extracted, pageIndex, pdfFileName = '') => {
    try {
      if (!extracted?.record) return `page_${pageIndex}`;
      const rec = extracted.record;
      const dateStr = (rec.report_date || 'NoDate').replace(/-/g, '');
      const rawSite = rec.site_name || 'UnknownSite';

      // PDF 파일명에서 확장자를 지우고 공백을 제거하여 '폭기조'/'포기조'가 포함되는지 검사
      const cleanFileName = String(pdfFileName || '').replace(/\.[^/.]+$/, '').trim();
      const noSpaceFileName = cleanFileName.replace(/\s+/g, '');
      const isMlss = noSpaceFileName.includes('폭기조') || noSpaceFileName.includes('포기조');
      
      const siteStr = rawSite.replace(/[/\\?%*:|"<>]/g, '').trim();
      const prefix = isMlss ? 'mlss' : '성적서';

      return `${prefix}_${dateStr}_${siteStr}`;
    } catch (err) {
      console.warn('[generateBasename] 파일명 생성 예외:', err.message);
      return `page_${pageIndex}`;
    }
  }, []);

  /**
   * 결과 후처리: 날짜/현장명 보정
   */
  const postProcessResults = useCallback((allResults, pdfFileName, siteMaster = []) => {
    // 최빈 날짜 계산
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

    // 파일명 맨 앞의 날짜 추출 (2자리 연도 YY.MM.DD 또는 4자리 연도 YYYY.MM.DD 유연하게 매칭)
    const dateMatch = String(pdfFileName || '').match(/^(\d{2,4})[-_.]?(\d{2})[-_.]?(\d{2})/);
    let filenameDate = null;
    if (dateMatch) {
      let y = dateMatch[1];
      if (y.length === 2) y = '20' + y; // '26' -> '2026'
      filenameDate = `${y}-${dateMatch[2]}-${dateMatch[3]}`;
    }

    // 파일명 기반 종류 결정
    const cleanFileName = String(pdfFileName || '').replace(/\.[^/.]+$/, '').trim();
    const noSpaceFileName = cleanFileName.replace(/\s+/g, '');
    const isMlss = noSpaceFileName.includes('폭기조') || noSpaceFileName.includes('포기조');
    const filenameCategory = isMlss ? 'mlss' : '성적서(5개 항목)';

    // 미사용 현장명 목록
    let unusedSites = masterSites.map(site => site.replace(/\s*(포기조|폭기조)\s*$/, '').trim());
    if (unusedSites.length > 0) {
      const usedSites = allResults.map(res => res.extracted?.record?.site_name).filter(Boolean);
      unusedSites = unusedSites.filter(site => !usedSites.includes(site));
    }

    const finalResults = [];
    let successCount = 0;

    allResults.forEach((res, idx) => {
      // extracted 가 없거나 record 가 null 인 경우 안전한 폴백 보증
      if (!res.extracted) res.extracted = { include: true, record: {}, errors: [] };
      if (!res.extracted.record) res.extracted.record = {};
      if (!res.extracted.errors) res.extracted.errors = [];

      const ex = res.extracted;
      
      // 1. 파일명 기반 날짜가 있으면 최우선으로 채수날짜 적용
      if (filenameDate) {
        ex.record.report_date = filenameDate;
      } else if (!ex.record.report_date && mostCommonDate) {
        ex.record.report_date = mostCommonDate;
      }
      
      // 2. 파일명 기반 종류 주입
      ex.category = filenameCategory;

        // 추출된 현장명을 캐시된 현장명 목록과 매핑하여 공식 현장명으로 정확하게 치환
        if (ex.record.site_name) {
          const matched = matchSiteName(ex.record.site_name, siteMaster);
          if (matched && matched.site_name) {
            ex.record.site_name = matched.site_name; // 정확한 공식 명칭으로 치환!
          }
        }

        if (!ex.record.site_name && unusedSites.length > 0) {
          ex.record.site_name = unusedSites.shift();
        }
        ex.include = true;
        ex.errors = [];
        if (!ex.record.report_date) { ex.include = false; ex.errors.push('invalid_or_missing_date'); }
        if (!ex.record.site_name) { ex.record.site_name = '미확인현장'; ex.record._site_unresolved = true; }

        ex.basename = generateBasename(ex, idx + 1, pdfFileName);

        if (ex.include) {
          finalResults.push({ ...res, extracted: ex });
          successCount++;
        }
    });

    return { finalResults, successCount };
  }, [masterSites, generateBasename]);

  /**
   * PDF 파일명 중복 체크 API 호출
   */
  const checkPdfDuplicate = useCallback(async (pdfName) => {
    try {
      const encodedName = toBase64Utf8(pdfName);
      const query = encodedName
        ? `pdfNameB64=${encodeURIComponent(encodedName)}`
        : `pdfName=${encodeURIComponent(pdfName || '')}`;
      const res = await fetch(`${getApiBase()}/api/certificates/check-duplicate-pdf?${query}`, {
        headers: adminHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return data;
    } catch (err) {
      console.error('[checkPdfDuplicate] 실패:', err.message);
      return { success: false, exists: false };
    }
  }, []);

  /**
  /**
   * 병합 이미지에 대해 일괄 현장명 분석 Gemini API 호출 (청크 지원)
   * pageNumbers: 현재 청크에 들어있는 실제 페이지 번호 목록 (예: [11, 12, 13, ...])
   */
  const callGeminiBatch = useCallback(async (mergedImgBlob, pageNumbers, onRetry, siteCandidates = []) => {
    const pageMappingStr = pageNumbers.map((pNum, idx) => `위에서부터 ${idx + 1}번째 조각은 ${pNum}페이지`).join('\n');
    const expectedSchema = pageNumbers.map(pNum => `  { "page": ${pNum}, "include": true, "record": { "report_date": "YYYY-MM-DD", "site_name": "string" } }`).join(',\n');
    const candidateSiteNames = normalizeSiteCandidateNames(siteCandidates);
    const promptSiteNames = candidateSiteNames.length > 0
      ? candidateSiteNames
      : normalizeSiteCandidateNames(masterSites);
    const siteListText = promptSiteNames.length > 0
      ? promptSiteNames.map((name, idx) => `${idx + 1}. ${name}`).join('\n')
      : '- 후보 현장 목록 없음';

    const prompt = `
당신은 오수처리장 성적서 분석 전문가입니다.
제공된 이미지는 성적서 PDF 파일의 각 페이지에서 '현장명' 또는 '날짜'가 표시된 기본 정보 영역만 가로형으로 크롭하여 위에서부터 아래로 순서대로 병합한 단일 이미지입니다.

조각들은 위에서부터 순서대로 다음과 같이 실제 페이지 번호와 대응됩니다:
${pageMappingStr}

각 페이지 조각 이미지 내의 텍스트 정보를 해독하여, 각 실제 페이지 번호별로 해당하는 현장명(site_name)과 날짜(report_date)를 분석하여 반드시 아래 JSON 배열 형식으로만 응답해 주세요.
[현장명 후보 목록]
${siteListText}

[출력 스키마]
[
${expectedSchema}
]

[규칙]
1. 각 페이지 조각 내에서 현장명과 날짜를 읽어 YYYY-MM-DD 형식의 report_date와 site_name을 구하십시오.
2. site_name은 이미지 내 텍스트를 해독한 뒤 [현장명 후보 목록] 중 가장 잘 매핑되는 공식 현장명으로 변환하여 반환하십시오.
   - 후보 목록에 같은 현장이 있으면 반드시 후보 목록의 표기를 그대로 반환하십시오.
   - 괄호 안 방향(예: 서울방향, 부산방향, 인천방향)이 보이면 방향까지 일치하는 후보를 우선 선택하십시오.
   - 후보 목록에서 판단할 수 없을 때만 이미지에서 읽은 원문을 반환하십시오.
3. JSON 배열 요소의 "page" 값은 반드시 위 조각 매핑과 일치하는 실제 페이지 번호(예: ${pageNumbers.join(', ')})로 출력하십시오.
4. JSON 외에 어떠한 설명 마크다운 래퍼(예: \`\`\`json)나 문장도 출력하지 마십시오.
`;

    let response;
    let retryCount = 0;

    while (retryCount <= 2) {
      try {
        const formData = new FormData();
        formData.append('image', mergedImgBlob, 'merged_pages.jpg');
        formData.append('prompt', prompt);
        formData.append('model', 'gemini-3.5-flash');

        const apiReq = await fetch(`${getApiBase()}/api/generate-content`, {
          method: 'POST',
          headers: adminHeaders(),
          body: formData,
        });

        if (!apiReq.ok) {
          let errMsg = 'API Request Failed';
          try {
            const e = await apiReq.json();
            errMsg = e.error || errMsg;
          } catch { /* ignore parse error, keep default message */ }
          throw new Error(errMsg);
        }

        response = await apiReq.json();
        break;
      } catch (err) {
        retryCount++;
        if (retryCount > 2) throw err;
        if (onRetry) onRetry(retryCount);
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    const text = response?.text || '';

    // JSON 파싱 헬퍼: 응답이 잘렸을 때 자동 복구 시도
    function tryParseGeminiJson(raw) {
      const clean = raw.replace(/```json/g, '').replace(/```/g, '').trim();
      // 1차 시도: 그대로 파싱
      try { return JSON.parse(clean); } catch { /* first parse attempt failed */ }
      // 2차 시도: 끝부분 잘림 복구 - 마지막으로 완성된 객체까지만 사용
      //   예: "[{...}, {... (잘림)" → "[{...}]"
      const lastClose = clean.lastIndexOf('}');
      if (lastClose > 0) {
        const truncated = clean.slice(0, lastClose + 1);
        // 배열 시작이면 닫아줌
        const candidate = truncated.startsWith('[') ? truncated + ']' : truncated;
        try { return JSON.parse(candidate); } catch { /* truncation recovery failed */ }
      }
      return null;
    }

    const parsed = tryParseGeminiJson(text);
    if (parsed) return parsed;

    // 복구 실패 시 한 번 더 Gemini 재호출
    console.warn('[callGeminiBatch] JSON 잘림 감지 → 재호출 시도. 원문:', text.slice(0, 200));
    if (onRetry) onRetry('JSON 재시도');
    try {
      const formData2 = new FormData();
      formData2.append('image', mergedImgBlob, 'merged_pages.jpg');
      formData2.append('prompt', prompt);
      formData2.append('model', 'gemini-3.5-flash');
      const apiReq2 = await fetch(`${getApiBase()}/api/generate-content`, {
        method: 'POST',
        headers: adminHeaders(),
        body: formData2,
      });
      if (apiReq2.ok) {
        const resp2 = await apiReq2.json();
        const parsed2 = tryParseGeminiJson(resp2?.text || '');
        if (parsed2) return parsed2;
      }
    } catch (retryErr) {
      console.error('[callGeminiBatch] 재호출 실패:', retryErr.message);
    }

    console.error('[callGeminiBatch] JSON 파싱 최종 실패. 원문:', text);
    throw new Error('Gemini 응답 JSON 파싱 실패');
  }, [masterSites]);

  return {
    masterSites,
    callGemini,
    callGeminiBatch,
    generateBasename,
    postProcessResults,
    buildPrompt,
    checkPdfDuplicate,
    refreshSites: () => fetchMasterSites(true), // 수동 새로고침 (force=true)
  };
}

export default usePdfGemini;

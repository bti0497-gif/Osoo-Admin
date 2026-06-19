import { useState, useCallback, useEffect } from 'react';
import { getApiBase } from '../../../../core/api/serverConfig';

const adminHeaders = () => ({
  'x-user-role': 'super_admin',
  'x-user-name': 'admin',
});

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
          } catch (_) {}
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
      if (extracted.record.site_name) {
        extracted.record.site_name = extracted.record.site_name.replace(/\s*(포기조|폭기조)\s*$/, '').trim();
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
  const generateBasename = useCallback((extracted, pageIndex) => {
    try {
      if (!extracted?.record) return `page_${pageIndex}`;
      const rec = extracted.record;
      const dateStr = (rec.report_date || 'NoDate').replace(/-/g, '');
      let siteStr = (rec.site_name || 'UnknownSite').replace(/[/\\?%*:|"<>]/g, '');
      siteStr = siteStr.replace(/\s*(포기조|폭기조)\s*$/, '').trim();

      const isNum = (v) => v != null && v !== '';
      const hasOthers = isNum(rec.bod) || isNum(rec.tn) || isNum(rec.tp) || isNum(rec.total_coliform) || isNum(rec.do) || isNum(rec.ph);
      const hasMlss = isNum(rec.mlss);
      const hasSsOnly = isNum(rec.ss) && !hasMlss && !hasOthers;

      let prefix = '성적서';
      if (!hasOthers && hasMlss) prefix = 'mlss';
      else if (!hasOthers && !hasMlss && hasSsOnly) prefix = 'ss';
      else if (!hasOthers && !hasMlss && !hasSsOnly) prefix = '기타_성적서';

      return `${prefix}_${dateStr}_${siteStr}`;
    } catch (e) {
      return `page_${pageIndex}`;
    }
  }, []);

  /**
   * 결과 후처리: 날짜/현장명 보정
   */
  const postProcessResults = useCallback((allResults) => {
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

    // 미사용 현장명 목록
    let unusedSites = masterSites.map(site => site.replace(/\s*(포기조|폭기조)\s*$/, '').trim());
    if (unusedSites.length > 0) {
      const usedSites = allResults.map(res => res.extracted?.record?.site_name).filter(Boolean);
      unusedSites = unusedSites.filter(site => !usedSites.includes(site));
    }

    const finalResults = [];
    let successCount = 0;

    allResults.forEach((res, idx) => {
      const ex = res.extracted;
      if (ex?.record) {
        if (!ex.errors) ex.errors = [];
        if (!ex.record.report_date && mostCommonDate) ex.record.report_date = mostCommonDate;
        if (!ex.record.site_name && unusedSites.length > 0) {
          ex.record.site_name = unusedSites.shift();
        }
        ex.include = true;
        ex.errors = [];
        if (!ex.record.report_date) { ex.include = false; ex.errors.push('invalid_or_missing_date'); }
        if (!ex.record.site_name) { ex.record.site_name = '미확인현장'; ex.record._site_unresolved = true; }

        ex.basename = generateBasename(ex, idx + 1);

        if (ex.include) {
          finalResults.push({ ...res, extracted: ex });
          successCount++;
        }
      }
    });

    return { finalResults, successCount };
  }, [masterSites, generateBasename]);

  return {
    masterSites,
    callGemini,
    generateBasename,
    postProcessResults,
    buildPrompt,
    refreshSites: () => fetchMasterSites(true), // 수동 새로고침 (force=true)
  };
}

export default usePdfGemini;

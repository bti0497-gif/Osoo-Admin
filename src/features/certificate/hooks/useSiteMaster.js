import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../../../core/api';

/**
 * 구글시트 현장 목록을 로드하고 캐싱하는 훅
 * site_id, site_name을 포함하여 엑셀 파싱 시 현장명 매칭에 사용
 */

let _cachedSiteMaster = null; // 모듈 레벨 캐시 (앱 실행 동안 유지)

// 불필요한 현장 세부 지시어 (비교 시 제거)
const DETAILED_WORDS_REMOVE = /폭기조|포기조|방류수|오수|원수|처리수|침전조|유입수|1호기|2호기|1호|2호|SBR/g;

// 방향 지시어 목록
const DIRECTIONS = ['부산', '서울', '순천', '광양', '천안', '기흥', '인천', '대전', '대구', '광주', '울산', '경기', '충청', '강원', '전라', '경상', '하행', '상행'];

function extractDirection(str) {
    const match = str.match(/\(([^)]+)\)|（([^）]+)）/);
    if (match) {
        const dir = (match[1] || match[2] || '').trim();
        return dir.replace(/방향/g, '');
    }
    // 괄호가 없어도 이름에 방향 단어가 명시적으로 포함되어 있는지 체크
    for (const d of DIRECTIONS) {
        if (str.includes(d)) return d;
    }
    return null;
}

function normKey(str) {
    return String(str || '')
        .trim()
        .replace(DETAILED_WORDS_REMOVE, '')
        .replace(/\s+/g, '')
        .replace(/휴게소/g, '')
        .replace(/방향/g, '')
        .replace(/[()（）]/g, '')
        .toLowerCase();
}

function strSimilarity(a, b) {
    const sa = normKey(a);
    const sb = normKey(b);
    if (!sa || !sb) return 0;
    if (sa === sb) return 1;
    if (sa.includes(sb) || sb.includes(sa)) return 0.9;
    let matches = 0;
    const shorter = sa.length < sb.length ? sa : sb;
    const longer  = sa.length < sb.length ? sb : sa;
    for (const ch of shorter) {
        if (longer.includes(ch)) matches++;
    }
    return matches / longer.length;
}

/**
 * siteMaster 목록에서 rawName과 가장 유사한 현장을 찾아 반환
 * @returns { site_id, site_name, site_name_raw, confidence, manual_review_required }
 */
export function matchSiteName(rawName, siteMaster) {
    const raw = String(rawName || '').trim();
    if (!raw || !Array.isArray(siteMaster) || siteMaster.length === 0) {
        return { site_id: null, site_name: raw, site_name_raw: raw, confidence: 0, manual_review_required: true };
    }

    const rawDir = extractDirection(raw);
    let best = null;
    let bestScore = 0;

    for (const site of siteMaster) {
        const candidates = [
            site.site_name,
            site.site_name.replace(/\s+/g, ''),
            site.site_name.replace(/휴게소/g, '').trim(),
            site.site_name.replace(/방향/g, '').trim(),
            site.site_name.replace(/[()（）]/g, '').trim(),
        ].filter(Boolean);

        const siteDir = extractDirection(site.site_name);

        for (const c of candidates) {
            let score = strSimilarity(raw, c);
            
            // 방향 보정 로직
            if (rawDir || siteDir) {
                if (rawDir && siteDir && rawDir === siteDir) {
                    score += 0.2; // 방향이 같으면 점수 가산
                } else if (rawDir && siteDir && rawDir !== siteDir) {
                    score -= 0.5; // 방향이 다르면 점수 감산 (오매칭 방지)
                }
            }

            if (score > bestScore) {
                bestScore = score;
                best = site;
            }
        }
    }

    if (!best || bestScore < 0.5) {
        return { site_id: null, site_name: raw, site_name_raw: raw, confidence: Number(bestScore.toFixed(4)), manual_review_required: true };
    }

    return {
        site_id: String(best.id),
        site_name: best.site_name,
        site_name_raw: raw,
        confidence: Number(bestScore.toFixed(4)),
        manual_review_required: bestScore < 0.8,
    };
}

export function useSiteMaster() {
    const [siteMaster, setSiteMaster] = useState(_cachedSiteMaster || []);
    const [loading, setLoading] = useState(!_cachedSiteMaster);
    const [error, setError] = useState(null);

    const load = useCallback(async () => {
        if (_cachedSiteMaster) {
            setSiteMaster(_cachedSiteMaster);
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const res = await apiClient.get('/api/site-master');
            const sites = Array.isArray(res?.sites) ? res.sites : [];
            _cachedSiteMaster = sites;
            setSiteMaster(sites);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const invalidateCache = useCallback(() => {
        _cachedSiteMaster = null;
        load();
    }, [load]);

    return { siteMaster, loading, error, invalidateCache };
}

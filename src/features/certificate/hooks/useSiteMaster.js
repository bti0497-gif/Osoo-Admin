import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../../../core/api';

/**
 * 구글시트 현장 목록을 로드하고 캐싱하는 훅
 * site_id, site_name을 포함하여 엑셀 파싱 시 현장명 매칭에 사용
 */

let _cachedSiteMaster = null; // 모듈 레벨 캐시 (앱 실행 동안 유지)

function normKey(str) {
    return String(str || '')
        .trim()
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

        for (const c of candidates) {
            const score = strSimilarity(raw, c);
            if (score > bestScore) {
                bestScore = score;
                best = site;
            }
        }
    }

    if (!best || bestScore < 0.5) {
        return { site_id: null, site_name: raw, site_name_raw: raw, confidence: bestScore, manual_review_required: true };
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

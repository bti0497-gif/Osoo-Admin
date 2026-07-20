import { useCallback, useEffect, useState } from 'react';
import { AuthModel } from './AuthModel';
import { ADMIN_ROLES } from '../../core/constants';

const isAdminUser = (member) => ADMIN_ROLES.includes(String(member?.role || ''));

// [개발 단계 임시 설정] 중앙관리자 앱 기능 개발 중이므로 로그인 바이패스 활성화 중
// 개발 마무리 단계에서 중앙관리자별 로그인 및 소통게시판 작성자 식별을 적용할 경우 `false`로 변경
const BYPASS_LOGIN = true;

const DEFAULT_ADMIN_USER = {
    id: 'super_admin',
    name: '최고관리자',
    role: 'super_admin',
    site_name1: '',
    managed_sites: [],
};

const mergeSiteSession = (baseUser, siteSession) => ({
    ...baseUser,
    ...(siteSession?.site_id ? { site_id: siteSession.site_id } : {}),
    ...(siteSession?.site_name1 ? { site_name1: siteSession.site_name1 } : {}),
    ...(siteSession?.manager_name ? { name: siteSession.manager_name } : {}),
    ...(siteSession?.method ? { method: siteSession.method } : {}),
    ...(siteSession?.series ? { series: siteSession.series } : {}),
});

export const useAuthViewModel = () => {
    const [user, setUser] = useState(BYPASS_LOGIN ? DEFAULT_ADMIN_USER : null);
    const [isLoading, setIsLoading] = useState(false);
    const [loginHintName, setLoginHintName] = useState('');

    const refreshLoginHint = useCallback(async () => {
        const hint = await AuthModel.getLoginHint();
        setLoginHintName(String(hint || '').trim());
    }, []);

    useEffect(() => {
        if (BYPASS_LOGIN) {
            const restoreBypassSession = async () => {
                try {
                    const siteSession = await AuthModel.getActiveSiteSession();
                    setUser(mergeSiteSession(DEFAULT_ADMIN_USER, siteSession));
                } finally {
                    setIsLoading(false);
                }
            };
            restoreBypassSession();
            return;
        }

        const restoreSession = async () => {
            try {
                const savedUser = AuthModel.loadSession();
                if (savedUser && isAdminUser(savedUser)) {
                    setUser(savedUser);
                } else {
                    AuthModel.clearSession();
                    await refreshLoginHint();
                }
            } finally {
                setIsLoading(false);
            }
        };

        restoreSession();
    }, [refreshLoginHint]);

    const login = async (name, password) => {
        if (BYPASS_LOGIN) {
            const siteSession = await AuthModel.getActiveSiteSession();
            const bypassUser = mergeSiteSession(DEFAULT_ADMIN_USER, siteSession);
            setUser(bypassUser);
            return { success: true, user: bypassUser, locationMatched: true };
        }

        setIsLoading(true);
        try {
            const userData = await AuthModel.localLogin(name, password);
            if (!userData) {
                return { success: false, message: '이름 또는 비밀번호가 올바르지 않습니다.' };
            }
            if (!isAdminUser(userData)) {
                return { success: false, message: '중앙관리자 또는 최고관리자만 접속할 수 있습니다.' };
            }

            AuthModel.saveSession(userData);
            setUser(userData);
            return { success: true, user: userData, locationMatched: true };
        } catch (err) {
            return { success: false, message: '서버 연결 실패: ' + err.message };
        } finally {
            setIsLoading(false);
        }
    };

    const logout = async () => {
        if (BYPASS_LOGIN) {
            const siteSession = await AuthModel.getActiveSiteSession();
            setUser(mergeSiteSession(DEFAULT_ADMIN_USER, siteSession));
            return;
        }
        AuthModel.clearSession();
        setUser(null);
        await refreshLoginHint();
    };

    const switchActiveSite = async (siteId) => {
        if (!siteId) return { success: false, site: null };
        const result = await AuthModel.selectActiveSite(siteId);
        if (result?.success) {
            const site = result.site || {};
            setUser(prev => mergeSiteSession(prev || DEFAULT_ADMIN_USER, {
                site_id: site.id || siteId,
                site_name1: site.site_name || prev?.site_name1 || '',
                manager_name: site.manager_name || prev?.name || '',
                method: site.method || prev?.method || '',
                series: site.series || prev?.series || '',
            }));
        }
        return result;
    };

    return {
        user,
        loginHintName,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        switchActiveSite,
    };
};

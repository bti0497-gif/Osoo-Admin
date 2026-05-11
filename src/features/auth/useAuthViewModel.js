import { useCallback, useEffect, useState } from 'react';
import { AuthModel } from './AuthModel';
import { ADMIN_ROLES } from '../../core/constants';

const isAdminUser = (member) => ADMIN_ROLES.includes(String(member?.role || ''));

// TODO: 중앙관리자 앱은 특정 로그인이 필요 없으므로 바이패스 활성화
// 로그인 기능을 다시 활성화하려면 false로 변경
const BYPASS_LOGIN = true;

const DEFAULT_ADMIN_USER = {
    id: 'central_admin',
    name: '중앙관리자',
    role: 'central_admin',
    site_name1: '전체현장',
    managed_sites: [],
};

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
            // 바이패스 모드: 기본 관리자로 자동 로그인
            setUser(DEFAULT_ADMIN_USER);
            setIsLoading(false);
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
            // 바이패스 모드: 로그인 무시하고 기본 관리자로 설정
            setUser(DEFAULT_ADMIN_USER);
            return { success: true, user: DEFAULT_ADMIN_USER, locationMatched: true };
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
            // 바이패스 모드: 로그아웃해도 다시 기본 관리자로 복귀
            setUser(DEFAULT_ADMIN_USER);
            return;
        }
        AuthModel.clearSession();
        setUser(null);
        await refreshLoginHint();
    };

    const switchActiveSite = async () => ({ success: true, site: null });

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

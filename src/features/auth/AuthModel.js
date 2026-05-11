import { getApiBase } from '../../core/api/serverConfig';

const SESSION_KEY = 'osoo_admin_user_session';

export const AuthModel = {
    async getLoginHint() {
        return '';
    },

    async localLogin(name, password) {
        try {
            const res = await fetch(`${getApiBase()}/api/auth/local-login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, password })
            });
            const data = await res.json();
            if (!data.success) return null;
            return data.member;
        } catch (e) {
            console.error('Admin login failed:', e);
            return null;
        }
    },

    async discoveryLogin(name, password) {
        return this.localLogin(name, password);
    },

    saveSession(userData) {
        try {
            localStorage.setItem(SESSION_KEY, JSON.stringify({
                user: userData,
                savedAt: new Date().toISOString()
            }));
        } catch (e) {
            console.warn('세션 저장 실패:', e);
        }
    },

    loadSession() {
        try {
            const raw = localStorage.getItem(SESSION_KEY);
            if (!raw) return null;
            return JSON.parse(raw).user || null;
        } catch (e) {
            console.warn('세션 복원 실패:', e);
            return null;
        }
    },

    clearSession() {
        try {
            localStorage.removeItem(SESSION_KEY);
        } catch (e) {
            console.warn('세션 삭제 실패:', e);
        }
    }
};

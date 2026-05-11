import { apiClient } from '../../core/api';

const createMemberId = () => {
    if (globalThis.crypto?.randomUUID) {
        return globalThis.crypto.randomUUID();
    }

    if (globalThis.crypto?.getRandomValues) {
        const bytes = new Uint8Array(16);
        globalThis.crypto.getRandomValues(bytes);
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }

    return `member-${Date.now().toString(36)}`;
};

export const MemberModel = {
    async fetchMembers() {
        const data = await apiClient.get('/api/auth/members');
        if (!data.success) throw new Error(data.error || '회원 목록 조회 실패');
        return data.members || [];
    },

    async saveMember(memberData) {
        // 회원 ID는 이름 변경과 동명이인에 흔들리지 않도록 문자열 UUID를 기준으로 한다.
        const payload = {
            ...memberData,
            id: memberData.id || createMemberId()
        };
        const data = await apiClient.post('/api/auth/members', payload);
        if (!data.success) throw new Error(data.error || '회원 저장 실패');
        return payload;
    },

    async deleteMember(id) {
        const data = await apiClient.delete(`/api/auth/members/${id}`);
        if (!data.success) throw new Error(data.error || '회원 삭제 실패');
        return { success: true };
    },

    async bootstrapSiteMember(payload) {
        const data = await apiClient.post('/api/settings/bootstrap-site-member', payload);
        if (!data.success) throw new Error(data.message || data.error || '현장/회원 동시 저장 실패');
        return data;
    },

    async fetchSites() {
        const data = await apiClient.get('/api/settings/sites');
        if (!data.success) throw new Error(data.message || '현장 목록 조회 실패');
        return { sites: data.sites || [], currentSiteId: data.currentSiteId || null };
    },

    async saveSite(sitePayload) {
        const data = await apiClient.post('/api/settings/sites', {
            siteId: sitePayload.siteId,
            siteName: sitePayload.siteName,
            managerName: sitePayload.managerName,
            method: sitePayload.method,
            series: sitePayload.series,
            isActive: sitePayload.isActive
        });
        if (!data.success) throw new Error(data.message || '현장 저장 실패');
        return data.site;
    },

    async deleteSite(siteId) {
        const data = await apiClient.delete(`/api/settings/sites/${siteId}`);
        if (!data.success) throw new Error(data.message || '현장 삭제 실패');
        return data;
    },

    async selectSite(siteId) {
        const data = await apiClient.post('/api/settings/select-site', { siteId });
        if (!data.success) throw new Error(data.message || '현장 선택 실패');
        return data.site;
    }
};

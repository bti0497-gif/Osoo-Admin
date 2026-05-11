import { apiClient } from '../../core/api';

/**
 * FacilityModel — 고장·수리 이력 API
 *
 * [향후 추가 예정: 장비이력카드 연계 API]
 * - fetchEquipments()        : 현장 장비 목록 조회 (기기명, 사양, 사진 URL 등)
 * - createEquipment(data)    : 장비 등록
 * - updateEquipment(id, data): 장비 정보 수정
 * - removeEquipment(id)      : 장비 삭제
 * - fetchLogsByEquipment(facilityId): 특정 장비의 수리 이력만 필터 조회
 *
 * facility_logs 에 facility_id 컬럼 추가 후 위 API와 연동
 */

function userPayload(currentUser) {
    return {
        _user: {
            id: currentUser?.id || '',
            name: currentUser?.name || 'unknown',
            role: currentUser?.role || 'user',
            site_id: currentUser?.site_id || '',
            site_name: currentUser?.site_name1 || '',
        }
    };
}

function userQuery(currentUser) {
    const u = userPayload(currentUser)._user;
    return {
        _role: u.role,
        _name: u.name,
        _member_id: u.id,
        site_id: u.site_id,
        site_name: u.site_name,
    };
}

export const FacilityModel = {
    async fetchAll(q, currentUser) {
        return apiClient.get('/api/facilities', {
            ...userQuery(currentUser),
            ...(q ? { q } : {})
        });
    },

    async create(data, currentUser) {
        return apiClient.post('/api/facilities', { ...data, ...userPayload(currentUser) });
    },

    async update(id, data, currentUser) {
        return apiClient.put(`/api/facilities/${id}`, { ...data, ...userPayload(currentUser) });
    },

    async remove(id, currentUser) {
        const params = new URLSearchParams(userQuery(currentUser));
        return apiClient.delete(`/api/facilities/${id}?${params.toString()}`);
    }
};

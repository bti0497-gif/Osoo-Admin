import { apiClient } from '../../core/api';

/**
 * [CRITICAL] 사용자 인증 정보 생성
 * 게시판 API는 인증/권한 체크가 엄격하므로 모든 요청에 정확한 사용자 정보 필요
 * 
 * 반환값:
 * - _user: query params 또는 body에 포함될 객체
 * - headers: HTTP 헤더(x-user-*)에 포함될 값들 (encodeURIComponent 적용)
 * 
 * WARNING: 
 * - 헤더 인코딩은 반드시 encodeURIComponent 사용
 * - role 값은 서버의 isAdminRole()과 일치해야 함 ('admin', 'group_admin', 'central_admin')
 * - 수정 시 boardRoutes.cjs의 extractUser()와 함께 테스트 필수
 */
function userPayload(currentUser) {
    const name = currentUser?.name || 'unknown';
    const role = currentUser?.role || 'user';
    const site = currentUser?.site_name1 || '';
    return {
        _user: { name, role, site },
        headers: {
            'x-user-name': encodeURIComponent(name),
            'x-user-role': encodeURIComponent(role),
            'x-user-site': encodeURIComponent(site)
        }
    };
}

function userQuery(currentUser) {
    const u = userPayload(currentUser)._user;
    return `_role=${encodeURIComponent(u.role)}&_site=${encodeURIComponent(u.site)}&_name=${encodeURIComponent(u.name)}`;
}

export const BoardModel = {
    async fetchPosts(currentUser) {
        const u = userPayload(currentUser)._user;
        const res = await apiClient.get('/api/board/posts', {
            _role: u.role,
            _site: u.site,
            _name: u.name
        });
        if (!res.success) throw new Error(res.message || '게시글 로드 실패');
        return res.data;
    },

    async fetchPost(id, currentUser) {
        const { _user, headers } = userPayload(currentUser);
        const res = await apiClient.get(`/api/board/posts/${id}`, _user, { headers });
        if (!res.success) throw new Error(res.message || '게시글 로드 실패');
        return res.data;
    },

    async savePost(postData, currentUser) {
        const body = { ...postData, ...userPayload(currentUser) };
        if (postData.id) {
            const res = await apiClient.put(`/api/board/posts/${postData.id}`, body);
            if (!res.success) throw new Error(res.message || '수정 실패');
            return { id: postData.id, ...postData };
        } else {
            const res = await apiClient.post('/api/board/posts', body);
            if (!res.success) throw new Error(res.message || '작성 실패');
            return res.data;
        }
    },

    async deletePost(id, currentUser) {
        const res = await apiClient.delete(`/api/board/posts/${id}?${userQuery(currentUser)}`);
        if (!res.success) throw new Error(res.message || '삭제 실패');
        return res.data;
    },

    async fetchComments(postId, currentUser) {
        const { _user, headers } = userPayload(currentUser);
        const res = await apiClient.get(`/api/board/posts/${postId}/comments`, _user, { headers });
        if (!res.success) throw new Error(res.message || '댓글 로드 실패');
        return res.data;
    },

    async saveComment(postId, commentData, currentUser) {
        const { _user, headers } = userPayload(currentUser);
        const body = { ...commentData, _user };
        const res = await apiClient.post(`/api/board/posts/${postId}/comments`, body, { headers });
        if (!res.success) throw new Error(res.message || '댓글 작성 실패');
        return res.data;
    },

    async deleteComment(id, currentUser) {
        const res = await apiClient.delete(`/api/board/comments/${id}?${userQuery(currentUser)}`);
        if (!res.success) throw new Error(res.message || '댓글 삭제 실패');
        return res.data;
    },

    async uploadFile(file, { boardId = null, date = null } = {}) {
        const formData = new FormData();
        formData.append('file', file);
        if (boardId) formData.append('boardId', String(boardId));
        if (date) formData.append('date', String(date));
        return apiClient.upload('/api/upload', formData);
    }
};


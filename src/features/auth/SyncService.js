import { getApiBase } from '../../core/api/serverConfig';

export const SyncService = {
    async syncMembers() {
        try {
            // 관리자용 수동 동기화 전용: 현장 앱의 백그라운드 동기화에서는 호출하지 않는다.
            // 로컬 오프라인 로그인 캐시는 로그인에 성공한 해당 회원만 저장해야 한다.
            const res = await fetch(`${getApiBase()}/api/auth/members`);
            const data = await res.json();
            if (!data.success) {
                console.error('[SyncService] 회원 로드 실패:', data.error);
                return;
            }
            // 로컬 DB에 병합
            for (const member of data.members || []) {
                try {
                    await fetch(`${getApiBase()}/api/auth/sync-member`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(member)
                    });
                } catch (e) {
                    console.error('[SyncService] 멤버 로컬 동기화 실패:', member.name, e);
                }
            }
            console.log('[SyncService] 회원 동기화 완료');
        } catch (e) {
            console.error('[SyncService] syncMembers 에러:', e);
        }
    },

    async syncAttendance() {
        try {
            // 로컬 미동기화 출결 → BigQuery 전송
            const res = await fetch(`${getApiBase()}/api/auth/sync-attendance-bq`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await res.json();
            if (data.success) {
                console.log(`[SyncService] 출결 BigQuery 동기화 완료 (${data.syncedCount}건)`);
            } else {
                console.error('[SyncService] 출결 동기화 실패:', data.error);
            }
        } catch (e) {
            console.error('[SyncService] syncAttendance 에러:', e);
        }
    },

    async startBackgroundSync() {
        if (!navigator.onLine) {
            console.log('[SyncService] 오프라인 상태이므로 동기화를 연기합니다.');
            return;
        }
        console.log('[SyncService] 백그라운드 서버 동기화 시작 (온라인)');
        // 전체 회원 목록을 현장 로컬 DB에 저장하지 않는다.
        // 온라인 로그인 성공 시 /api/auth/local-login이 해당 회원만 로컬에 캐시한다.
        await this.syncAttendance();
    },

    initAutoSync() {
        window.addEventListener('online', () => {
            console.log('[SyncService] 네트워크 연결이 복구되었습니다. 밀린 데이터를 동기화합니다.');
            this.startBackgroundSync().catch(console.error);
        });
    }
};


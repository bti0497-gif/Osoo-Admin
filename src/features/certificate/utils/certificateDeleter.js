/**
 * 성적서 삭제 모듈
 */

import { CertificateModel } from '../CertificateModel';
import { buildCertificateAuthHeaders } from './authUtils';

export async function deleteFilesProgressive(params) {
    const { selectedIds, records, currentUser, onProgress, onRecordDeleted, onSelectedRemoved, showToast } = params;
    
    const fileIds = Array.from(selectedIds);
    const total = fileIds.length;
    const errors = [];
    let deletedCount = 0;
    
    for (let i = 0; i < fileIds.length; i++) {
        const fileId = fileIds[i];
        const record = records.find(r => r.id === fileId);
        const fileName = record?.fileName || fileId;
        
        onProgress?.({
            current: i + 1,
            total,
            fileName,
            status: 'deleting',
        });
        
        try {
            const authHeaders = buildCertificateAuthHeaders(currentUser);
            const result = await CertificateModel.deleteOne(fileId, i, total, authHeaders);
            
            if (result.success) {
                deletedCount++;
                onRecordDeleted?.(fileId);
                onSelectedRemoved?.(fileId);
            } else {
                errors.push({ fileId, fileName, error: result.error || '삭제 실패' });
            }
        } catch (err) {
            console.error(`[Delete] ${fileId} 오류:`, err);
            errors.push({ fileId, fileName, error: err.message || '네트워크 오류' });
        }
    }
    
    const status = errors.length === 0 ? 'completed' : errors.length < total ? 'partial' : 'error';
    
    onProgress?.({
        current: total,
        total,
        fileName: '',
        status,
        errors,
    });
    
    if (errors.length === 0) {
        showToast?.(`${deletedCount}개 파일 삭제 완료`, 'success');
    } else if (errors.length < total) {
        showToast?.(`${deletedCount}개 삭제, ${errors.length}개 실패`, 'warning');
    } else {
        showToast?.('모든 파일 삭제 실패', 'error');
    }
    
    return { success: errors.length === 0, deletedCount, errors };
}

export function confirmDelete(count) {
    return window.confirm(`선택한 ${count}개 성적서를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`);
}

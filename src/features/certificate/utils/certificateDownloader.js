/**
 * 성적서 다운로드 모듈
 */

import { CertificateModel } from '../CertificateModel';

export async function downloadSingleFile(record, showToast) {
    if (!record?.downloadUrl) {
        showToast?.('다운로드 URL이 없습니다.', 'error');
        return;
    }
    
    showToast?.('파일 다운로드를 시작합니다...', 'info');
    
    try {
        CertificateModel.downloadFile(record.downloadUrl, record.fileName);
        showToast?.('파일 다운로드를 시작했습니다.', 'success');
    } catch (err) {
        console.error('[Download] 오류:', err);
        showToast?.('다운로드 중 오류가 발생했습니다.', 'error');
        throw err;
    }
}

export function downloadMergedFiles(selectedIds, selectedYear, selectedMonth, selectedSite, showAlert, showToast) {
    if (selectedIds.size === 0) {
        showAlert?.('다운로드할 파일을 선택해 주세요.');
        return;
    }

    showToast?.('PDF 병합 다운로드를 시작합니다...', 'info');
    
    const yearMonth = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
    const count = selectedIds.size;
    const siteName = selectedSite === 'ALL' ? '전체현장' : selectedSite;
    const fileName = `통합성적서_${yearMonth}_${count}개_${siteName}.pdf`;
    
    CertificateModel.downloadMergedPdf(Array.from(selectedIds), fileName);
    
    showToast?.(`${selectedIds.size}개 파일을 병합하여 다운로드했습니다.`, 'success');
}

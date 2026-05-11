/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         PDF MERGER MODULE                                ║
 * ║                     ⚠️  수정 금지 / DO NOT MODIFY  ⚠️                     ║
 * ║                                                                          ║
 * ║  이 모듈은 성적서 이미지를 PDF로 병합하는 핵심 기능입니다.                     ║
 * ║  스테이징(3단계) 방식으로 구현되어 있으며, 임시 파일 관리와 메모리 최적화를      ║
 * ║  동시에 처리합니다.                                                       ║
 * ║                                                                          ║
 * ║  수정이 필요한 경우:                                                      ║
 * ║  1. 이 파일을 직접 수정하지 마세요                                          ║
 * ║  2. 먼저 팀 리더와 상의하세요                                               ║
 * ║  3. 테스트 환경에서 충분히 검증하세요                                        ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { PDFDocument } = require('pdf-lib');

/**
 * Google Drive 파일들을 PDF로 병합 (스테이징 방식)
 * 
 * Stage 1: Local Staging - os.tmpdir()에 임시 폴더 생성, 01.jpg, 02.jpg 등으로 저장
 * Stage 2: PDF Compilation - pdf-lib으로 로컬 파일 읽어 PDF 페이지 생성
 * Stage 3: Cleanup - 임시 폴더의 모든 파일 삭제
 * 
 * @param {Object} drive - Google Drive API client
 * @param {string[]} fileIds - 병합할 Drive 파일 ID 목록
 * @param {string} fileName - 결과 PDF 파일명
 * @returns {Promise<Buffer>} - 병합된 PDF Buffer
 */
async function mergeDriveFilesToPdf(drive, fileIds, fileName) {
    let stagingDir = null;
    
    try {
        console.log('[PdfMerger] merge-download 요청:', { fileIds: fileIds?.length, fileName });
        
        if (!Array.isArray(fileIds) || fileIds.length === 0) {
            throw new Error('병합할 파일 ID가 필요합니다.');
        }

        if (!drive) {
            throw new Error('Drive 서비스를 사용할 수 없습니다.');
        }

        // ═══════════════════════════════════════════════════════════════════
        // Stage 1: Local Staging - 임시 폴더 생성 및 파일 다운로드
        // ═══════════════════════════════════════════════════════════════════
        console.log('[PdfMerger] Stage 1: Local Staging 시작');
        stagingDir = path.join(os.tmpdir(), `cert_merge_${Date.now()}`);
        fs.mkdirSync(stagingDir, { recursive: true });
        console.log('[PdfMerger] 임시 폴더 생성:', stagingDir);

        const stagedFiles = [];
        const failedFiles = [];

        for (let i = 0; i < fileIds.length; i++) {
            const fileId = fileIds[i];
            try {
                console.log(`[PdfMerger] Drive 파일 다운로드 ${i + 1}/${fileIds.length}:`, fileId.substring(0, 20) + '...');
                
                // Drive에서 파일 메타데이터 가져오기 (확장자 확인용)
                let ext = 'jpg';
                try {
                    const fileMeta = await drive.files.get({
                        fileId: fileId,
                        fields: 'name,mimeType'
                    });
                    const name = fileMeta.data.name || '';
                    const detectedExt = name.split('.').pop()?.toLowerCase();
                    if (detectedExt === 'jpg' || detectedExt === 'jpeg') ext = 'jpg';
                    else if (detectedExt === 'png') ext = 'png';
                    else if (detectedExt === 'pdf') ext = 'pdf';
                    else if (detectedExt === 'webp') ext = 'webp';
                } catch (metaErr) {
                    console.log('[PdfMerger] 파일 메타데이터 조회 실패, 기본 jpg 사용:', metaErr.message);
                }

                // Drive에서 파일 다운로드
                const driveResponse = await drive.files.get({
                    fileId: fileId,
                    alt: 'media',
                }, { responseType: 'arraybuffer' });

                const fileBuffer = Buffer.from(driveResponse.data);
                const paddedIndex = String(i + 1).padStart(2, '0');
                const localFileName = `${paddedIndex}.${ext}`;
                const localPath = path.join(stagingDir, localFileName);

                // 로컬에 저장
                fs.writeFileSync(localPath, fileBuffer);
                stagedFiles.push({ 
                    index: i + 1, 
                    fileName: localFileName, 
                    localPath, 
                    ext, 
                    size: fileBuffer.length 
                });
                
                console.log('[PdfMerger] 파일 저장 완료:', { 
                    fileId: fileId.substring(0, 20) + '...', 
                    localFileName, 
                    size: fileBuffer.length 
                });
            } catch (fileErr) {
                console.error(`[PdfMerger] 파일 다운로드 실패 (${fileId}):`, fileErr.message);
                failedFiles.push({ fileId, error: fileErr.message });
            }
        }

        if (stagedFiles.length === 0) {
            throw new Error('병합할 수 있는 파일이 없습니다.');
        }

        console.log('[PdfMerger] Stage 1 완료:', { stagedFiles: stagedFiles.length, failed: failedFiles.length });

        // ═══════════════════════════════════════════════════════════════════
        // Stage 2: PDF Compilation - pdf-lib로 로컬 파일 읽어 PDF 생성
        // ═══════════════════════════════════════════════════════════════════
        console.log('[PdfMerger] Stage 2: PDF Compilation 시작');
        const mergedPdf = await PDFDocument.create();
        let pdfCount = 0;
        let imageCount = 0;

        for (const staged of stagedFiles) {
            try {
                console.log(`[PdfMerger] PDF에 추가: ${staged.fileName}`);
                
                if (staged.ext === 'pdf') {
                    // PDF 파일 병합
                    const pdfBytes = fs.readFileSync(staged.localPath);
                    const pdf = await PDFDocument.load(pdfBytes);
                    const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
                    copiedPages.forEach(page => mergedPdf.addPage(page));
                    pdfCount++;
                    console.log('[PdfMerger] PDF 페이지 추가 완료:', staged.fileName);
                } else {
                    // 이미지 파일을 PDF 페이지로 변환
                    const imgBytes = fs.readFileSync(staged.localPath);
                    let image;
                    
                    if (staged.ext === 'png') {
                        image = await mergedPdf.embedPng(imgBytes);
                    } else {
                        // jpg, webp 등은 jpg로 처리
                        image = await mergedPdf.embedJpg(imgBytes);
                    }
                    
                    // A4 크기로 페이지 생성 (595 x 842 points)
                    const pageWidth = 595;
                    const pageHeight = 842;
                    const page = mergedPdf.addPage([pageWidth, pageHeight]);
                    
                    // 이미지 비율 유지하면서 페이지에 맞춤
                    const imgWidth = image.width;
                    const imgHeight = image.height;
                    const scale = Math.min(
                        (pageWidth - 40) / imgWidth,
                        (pageHeight - 40) / imgHeight
                    );
                    const scaledWidth = imgWidth * scale;
                    const scaledHeight = imgHeight * scale;
                    const x = (pageWidth - scaledWidth) / 2;
                    const y = (pageHeight - scaledHeight) / 2;
                    
                    page.drawImage(image, {
                        x: x,
                        y: y,
                        width: scaledWidth,
                        height: scaledHeight,
                    });
                    imageCount++;
                    console.log('[PdfMerger] 이미지 페이지 추가 완료:', staged.fileName);
                }
            } catch (compileErr) {
                console.error(`[PdfMerger] PDF 컴파일 실패 (${staged.fileName}):`, compileErr.message);
                failedFiles.push({ fileName: staged.fileName, error: compileErr.message });
            }
        }

        console.log('[PdfMerger] Stage 2 완료:', { pdfCount, imageCount });

        if (pdfCount === 0 && imageCount === 0) {
            throw new Error('병합할 수 있는 파일이 없습니다.');
        }

        // PDF 저장
        console.log('[PdfMerger] PDF 저장 중...');
        const mergedPdfBuffer = await mergedPdf.save();
        console.log('[PdfMerger] PDF 저장 완료, 크기:', mergedPdfBuffer.length);

        // ═══════════════════════════════════════════════════════════════════
        // Stage 3: Cleanup - 임시 파일 정리
        // ═══════════════════════════════════════════════════════════════════
        console.log('[PdfMerger] Stage 3: Cleanup 시작');
        if (stagingDir && fs.existsSync(stagingDir)) {
            fs.rmSync(stagingDir, { recursive: true, force: true });
            console.log('[PdfMerger] 임시 폴더 삭제 완료:', stagingDir);
        }

        return {
            buffer: mergedPdfBuffer,
            pdfCount,
            imageCount,
            failedFiles,
            totalPages: pdfCount + imageCount
        };
    } catch (err) {
        // 오류 발생 시에도 임시 파일 정리
        if (stagingDir && fs.existsSync(stagingDir)) {
            try {
                fs.rmSync(stagingDir, { recursive: true, force: true });
                console.log('[PdfMerger] 오류 발생 후 임시 폴더 정리 완료');
            } catch (cleanupErr) {
                console.error('[PdfMerger] 임시 폴더 정리 실패:', cleanupErr.message);
            }
        }
        
        console.error('[PdfMerger] PDF 병합 오류:', err.message);
        throw err;
    }
}

module.exports = {
    mergeDriveFilesToPdf
};

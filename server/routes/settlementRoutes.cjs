const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const multer = require('multer');
const JSZip = require('jszip');
const {
  isDriveConfigured,
  getDriveRootFolderId,
  getOrCreateFolderPath,
  uploadBufferToFolder,
  listFilesFolder,
  downloadDriveFileBuffer,
  getSingleSettlementRootFolder,
  findFolderInParent,
} = require('../services/driveService.cjs');
const {
  getSettlementSummary,
  getTemplateList,
  getTemplateFilePath,
  saveTemplateFile,
  deleteTemplateFile,
  SETTLEMENT_TARGET_SITES,
} = require('../services/settlementService.cjs');

// 메모리 스토리지 multer 설정 (최대 250MB 허용 - 대용량 HWP 보고서 지원)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 250 * 1024 * 1024 },
});

module.exports = function createSettlementRoutes(db, BASE_DIR, appDataPath) {
  const router = express.Router();

  /**
   * GET /api/settlement/sites
   * 정산 지원 대상 현장 목록
   */
  router.get('/sites', (req, res) => {
    res.json({
      success: true,
      sites: SETTLEMENT_TARGET_SITES,
    });
  });

  /**
   * GET /api/settlement/templates
   * 현장별 기본 빈 양식(Excel / HWP) 목록 및 상태 조회
   */
  router.get('/templates', (req, res) => {
    try {
      const templates = getTemplateList();
      res.json({
        success: true,
        templates,
      });
    } catch (err) {
      console.error('[settlementRoutes] 템플릿 목록 조회 오류:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * GET /api/settlement/templates/:filename/download
   * 템플릿 원본 파일 다운로드
   */
  router.get('/templates/:filename/download', (req, res) => {
    try {
      const { filename } = req.params;
      const filePath = getTemplateFilePath(filename);
      if (!filePath) {
        return res.status(404).json({ success: false, error: '해당 템플릿 파일을 찾을 수 없습니다.' });
      }

      res.download(filePath, path.basename(filePath));
    } catch (err) {
      console.error('[settlementRoutes] 템플릿 다운로드 오류:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * POST /api/settlement/templates/:id/upload
   * 특정 현장의 기본 빈 양식 신규 등록 / 파일 교체
   */
  router.post('/templates/:id/upload', upload.single('file'), (req, res) => {
    try {
      const { id } = req.params;
      const isSub = req.body?.isSub === 'true' || req.body?.isSub === true;
      if (!req.file) {
        return res.status(400).json({ success: false, error: '업로드할 파일이 없습니다.' });
      }

      const result = saveTemplateFile(id, req.file.buffer, req.file.originalname, isSub);
      res.json({
        success: true,
        message: '양식 파일이 성공적으로 등록/교체되었습니다.',
        ...result,
      });
    } catch (err) {
      console.error('[settlementRoutes] 템플릿 업로드/교체 오류:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * DELETE /api/settlement/templates/:id
   * 특정 현장의 기본 빈 양식 삭제
   */
  router.delete('/templates/:id', (req, res) => {
    try {
      const { id } = req.params;
      const isSub = req.query?.isSub === 'true' || req.query?.isSub === true;
      const updatedSite = deleteTemplateFile(id, isSub);
      res.json({
        success: true,
        message: '양식 파일이 삭제되었습니다.',
        site: updatedSite,
      });
    } catch (err) {
      console.error('[settlementRoutes] 템플릿 삭제 오류:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * GET /api/settlement/summary
   * 월정산 데이터 집계 요약 조회
   * Query: year, month, siteId
   */
  router.get('/summary', async (req, res) => {
    try {
      const { year, month, siteId } = req.query;
      if (!year || !month) {
        return res.status(400).json({ success: false, error: 'year와 month 파라미터는 필수입니다.' });
      }

      const summary = await getSettlementSummary(year, month, siteId || 'all');
      res.json({
        success: true,
        ...summary,
      });
    } catch (err) {
      console.error('[settlementRoutes] summary 조회 오류:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  function getDesktopDirectories() {
    const home = os.homedir();
    const dirs = [];
    const candidates = [
      path.join(home, 'OneDrive', '바탕 화면'),
      path.join(home, 'OneDrive', 'Desktop'),
      path.join(home, 'OneDrive - Personal', '바탕 화면'),
      path.join(home, 'OneDrive - Personal', 'Desktop'),
      path.join(home, '바탕 화면'),
      path.join(home, 'Desktop'),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate) && !dirs.includes(candidate)) {
        dirs.push(candidate);
      }
    }
    if (dirs.length === 0) dirs.push(path.join(home, 'Desktop'));
    return dirs;
  }

  router.post('/save-matched-images', (req, res) => {
    try {
      const targetYm = String(req.body?.targetYm || '').replace(/[^0-9]/g, '');
      const documentType = req.body?.documentType === 'deposit' ? 'deposit' : 'invoice';
      const entries = Array.isArray(req.body?.entries) ? req.body.entries : [];
      if (!/^\d{6}$/.test(targetYm)) return res.status(400).json({ success: false, error: '대상 연월은 YYYYMM 형식이어야 합니다.' });
      if (!entries.length) return res.status(400).json({ success: false, error: '저장할 매칭 이미지가 없습니다.' });
      const documentFolder = documentType === 'deposit' ? '입금표' : '계산서';

      const desktopDirs = getDesktopDirectories();
      const primaryTargetDir = path.join(desktopDirs[0], '점검준비', documentFolder, targetYm);
      const savedFiles = [];

      for (const desktopDir of desktopDirs) {
        const targetDir = path.join(desktopDir, '점검준비', documentFolder, targetYm);
        fs.mkdirSync(targetDir, { recursive: true });

        entries.forEach((entry) => {
          const match = String(entry.imageDataUrl || '').match(/^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/);
          if (!match) throw new Error(`유효하지 않은 JPEG 이미지입니다: ${entry.filename || '이름 없음'}`);
          const requested = path.basename(String(entry.filename || '계산서.jpg')).replace(/[\\/:*?"<>|]/g, '_');
          const ext = path.extname(requested) || '.jpg';
          const stem = path.basename(requested, ext);
          let index = 1;
          let fileName = `${stem}${ext}`;
          while (fs.existsSync(path.join(targetDir, fileName))) fileName = `${stem} (${++index})${ext}`;
          fs.writeFileSync(path.join(targetDir, fileName), Buffer.from(match[1], 'base64'));

          if (desktopDir === desktopDirs[0]) {
            savedFiles.push(fileName);
          }
        });
      }

      // 바탕화면 저장은 즉시 완료 처리하고, Drive 전송은 작업을 막지 않도록 백그라운드로 진행한다.
      void uploadSettlementFilesToDrive(primaryTargetDir, targetYm, savedFiles, documentType).catch((uploadError) => {
        console.error('[settlementRoutes] 계산서 Drive 백그라운드 전송 실패:', uploadError.message);
      });
      return res.json({ success: true, targetDir: primaryTargetDir, savedFiles, driveUploadQueued: isDriveConfigured() });
    } catch (err) {
      console.error('[settlementRoutes] 매칭 이미지 저장 오류:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/drive-folder-download', async (req, res) => {
    try {
      const targetYm = normalizeTargetYm(req.query.targetYm);
      if (!targetYm) return res.status(400).json({ success: false, error: '대상 연월은 YYYYMM 형식이어야 합니다.' });
      if (!isDriveConfigured()) return res.status(503).json({ success: false, error: 'Google Drive 연동 설정을 찾을 수 없습니다.' });

      const monthlyFolder = await findSettlementMonthlyFolder(targetYm);
      if (!monthlyFolder) return res.status(404).json({ success: false, error: `Drive에 월정산/${targetYm} 폴더가 없습니다.` });

      const files = (await listFilesFolder(monthlyFolder.id))
        .filter((file) => file.mimeType !== 'application/vnd.google-apps.folder');
      if (!files.length) return res.status(404).json({ success: false, error: `Drive의 월정산/${targetYm} 폴더가 비어 있습니다.` });

      const zip = new JSZip();
      const archiveFolderName = `월정산_${targetYm}`;
      for (const file of files) {
        zip.file(`${archiveFolderName}/${file.name}`, await downloadDriveFileBuffer(file.id));
      }
      const archive = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
      const archiveName = `월정산_${targetYm}.zip`;
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(archiveName)}`);
      return res.send(archive);
    } catch (err) {
      console.error('[settlementRoutes] 계산서 Drive 다운로드 오류:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
};

function normalizeTargetYm(value) {
  const targetYm = String(value || '').replace(/[^0-9]/g, '');
  return /^\d{6}$/.test(targetYm) ? targetYm : '';
}

async function findSettlementMonthlyFolder(targetYm) {
  if (!isDriveConfigured()) return null;
  const monthlyRoot = await getSingleSettlementRootFolder();
  return monthlyRoot ? findFolderInParent(monthlyRoot.id, targetYm) : null;
}

async function uploadSettlementFilesToDrive(localFolder, targetYm, fileNames) {
  if (!isDriveConfigured()) return;
  const monthlyRoot = await getSingleSettlementRootFolder();
  if (!monthlyRoot) return;

  for (const fileName of fileNames) {
    const sourcePath = path.join(localFolder, fileName);
    if (!fs.existsSync(sourcePath)) continue;

    const targetFolder = await getOrCreateFolderPath(getDriveRootFolderId(), ['월정산', targetYm]);

    await uploadBufferToFolder({
      folderId: targetFolder.id,
      fileName,
      buffer: fs.readFileSync(sourcePath),
      mimeType: 'image/jpeg',
    });
  }
  console.log(`[settlementRoutes] Drive 월정산 전송 완료: 월정산/${targetYm} (${fileNames.length}개 파일)`);
}

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
const {
  getSiteSettlementVendors,
  seedSiteSettlementVendors,
  upsertSiteSettlementVendors,
} = require('../services/siteSettlementVendorsSheetsService.cjs');
const { generateCheongjuHwpReport } = require('../services/hwpSettlementService.cjs');

// 메모리 스토리지 multer 설정 (최대 250MB 허용 - 대용량 HWP 보고서 지원)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 250 * 1024 * 1024 },
});

module.exports = function createSettlementRoutes(db, BASE_DIR, appDataPath) {
  const router = express.Router();

  /**
   * GET /api/settlement/site-vendor-mappings
   * 현장별 정산 거래처(슬러지, 약품, 수질, 키트) 구글 시트 매핑 조회
   */
  router.get('/site-vendor-mappings', async (req, res) => {
    try {
      const mappings = await getSiteSettlementVendors();
      res.json({ success: true, mappings });
    } catch (err) {
      console.error('[settlementRoutes] 현장별 거래처 매핑 조회 오류:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * POST /api/settlement/site-vendor-mappings
   * 현장별 정산 거래처 매핑 수정/등록
   */
  router.post('/site-vendor-mappings', async (req, res) => {
    try {
      const mapping = await upsertSiteSettlementVendors(req.body);
      res.json({ success: true, mapping });
    } catch (err) {
      console.error('[settlementRoutes] 현장별 거래처 매핑 등록 오류:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * POST /api/settlement/site-vendor-mappings/seed
   * 현장별 정산 거래처 시트 초기 행 생성
   */
  router.post('/site-vendor-mappings/seed', async (req, res) => {
    try {
      const mappings = await seedSiteSettlementVendors(req.body?.sites || []);
      res.json({ success: true, mappings });
    } catch (err) {
      console.error('[settlementRoutes] 현장별 거래처 시트 시딩 오류:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

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

  /**
   * POST /api/settlement/generate/cheongju
   * 청주휴게소 정산서 한글(HWP) 파일 생성 및 전송
   */
  router.post(
    '/generate/cheongju',
    upload.fields([
      { name: 'statementWaterQuality', maxCount: 1 },
      { name: 'statementKit', maxCount: 1 },
      { name: 'statementChemical', maxCount: 1 },
    ]),
    async (req, res) => {
      try {
        const year = parseInt(req.body?.year || new Date().getFullYear(), 10);
        const month = parseInt(req.body?.month || (new Date().getMonth() + 1), 10);

        const tempDir = path.join(os.tmpdir(), `osoo_cheongju_stmt_${Date.now()}`);
        fs.mkdirSync(tempDir, { recursive: true });

        const statementFiles = {};

        if (req.files?.statementWaterQuality?.[0]) {
          const file = req.files.statementWaterQuality[0];
          const ext = path.extname(file.originalname) || '.jpg';
          const p = path.join(tempDir, `stmt_water_quality${ext}`);
          fs.writeFileSync(p, file.buffer);
          statementFiles.waterQuality = p;
        }

        if (req.files?.statementKit?.[0]) {
          const file = req.files.statementKit[0];
          const ext = path.extname(file.originalname) || '.jpg';
          const p = path.join(tempDir, `stmt_kit${ext}`);
          fs.writeFileSync(p, file.buffer);
          statementFiles.kit = p;
        }

        if (req.files?.statementChemical?.[0]) {
          const file = req.files.statementChemical[0];
          const ext = path.extname(file.originalname) || '.jpg';
          const p = path.join(tempDir, `stmt_chemical${ext}`);
          fs.writeFileSync(p, file.buffer);
          statementFiles.chemical = p;
        }

        console.log(`[settlementRoutes] 청주휴게소 ${year}년 ${month}월 정산서 생성 시작`);
        const generatedPath = await generateCheongjuHwpReport({
          year,
          month,
          statementFiles,
        });

        const fileName = path.basename(generatedPath);
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);

        const fileStream = fs.createReadStream(generatedPath);
        fileStream.pipe(res);

        fileStream.on('end', () => {
          // 임시 명세서 파일 정리
          try {
            fs.rmSync(tempDir, { recursive: true, force: true });
          } catch (_) {}
        });
      } catch (err) {
        console.error('[settlementRoutes] 청주 정산서 생성 오류:', err);
        res.status(500).json({ success: false, error: err.message });
      }
    }
  );

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

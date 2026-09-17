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
  getReportSiteList,
  getMonthlyReportData,
  getMonthlyReportUsageSummary,
  transformToReportData,
} = require('../services/monthlyReportService.cjs');
const {
  getSiteSettlementVendors,
  seedSiteSettlementVendors,
  upsertSiteSettlementVendors,
} = require('../services/siteSettlementVendorsSheetsService.cjs');
const {
  generateCheongjuHwpReport,
  prewarmHwpEngine,
  isSettlementSeason,
} = require('../services/hwpSettlementService.cjs');
const {
  generateJukamBusanExcelReport,
  generateJukamSeoulExcelReport,
} = require('../services/jukamSettlementService.cjs');
const { generateCheonanBusanExcelReport } = require('../services/cheonanSettlementService.cjs');
const { generateHongcheonExcelReport } = require('../services/hongcheonSettlementService.cjs');
const {
  getHongcheonEvidenceStatus,
  saveHongcheonEvidence,
  generateHongcheonHwpReport,
} = require('../services/hongcheonHwpService.cjs');
const { getMonthlyPhotoSummary } = require('../services/photoExportService.cjs');

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
   * POST /api/settlement/prewarm-hwp
   * HWP COM 엔진 사전 웜업 (말일~익월2일 정산 시즌 또는 정산 메뉴 진입 시 호출)
   */
  router.post('/prewarm-hwp', async (req, res) => {
    try {
      const force = Boolean(req.body?.force);
      const isSeason = isSettlementSeason();
      // 백그라운드 비동기로 웜업 수행 (클라이언트는 즉시 응답 받음)
      prewarmHwpEngine(force).catch(err => console.warn('[settlementRoutes] Pre-warm background warning:', err.message));
      res.json({
        success: true,
        message: 'HWP COM 엔진 사전 웜업 요청이 접수되었습니다.',
        isSettlementSeason: isSeason,
      });
    } catch (err) {
      console.warn('[settlementRoutes] HWP 사전 웜업 오류:', err.message);
      res.json({ success: false, error: err.message });
    }
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
   * POST /api/settlement/templates/:filename/open
   * 템플릿 파일을 사용자의 PC 기본 프로그램(Excel, 한글 등)으로 직접 열기
   */
  router.post('/templates/:filename/open', (req, res) => {
    try {
      const { filename } = req.params;
      const filePath = getTemplateFilePath(filename);
      if (!filePath || !fs.existsSync(filePath)) {
        return res.status(404).json({ success: false, error: '해당 템플릿 파일을 찾을 수 없습니다.' });
      }

      const { exec } = require('child_process');
      const escapedPath = filePath.replace(/'/g, "''");
      exec(`powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Invoke-Item -LiteralPath '${escapedPath}'"`, (err) => {
        if (err) {
          console.error('[settlementRoutes] 양식 열기 오류:', err);
        }
      });

      res.json({
        success: true,
        message: `${filename} 양식 파일을 열었습니다.`,
        filePath,
      });
    } catch (err) {
      console.error('[settlementRoutes] 양식 열기 오류:', err);
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
   * GET /api/settlement/check-data-ready
   * 데이터관리에서 필요한 현장 사진/데이터가 다운로드되어 있는지 사전 검사
   */
  router.get('/check-data-ready', (req, res) => {
    try {
      const siteId = String(req.query.siteId || '');
      const year = parseInt(req.query.year || new Date().getFullYear(), 10);
      const month = parseInt(req.query.month || (new Date().getMonth() + 1), 10);

      const targetYm = `${year}${String(month).padStart(2, '0')}`;
      const mm = String(month).padStart(2, '0');
      const desktopDirs = getDesktopDirectories();

      // 현장별 대표 사진 폴더 키워드 검색
      const siteObj = SETTLEMENT_TARGET_SITES.find(s => s.id === siteId);
      const siteName = siteObj?.name || '청주휴게소';

      let isReady = false;
      let foundPath = null;

      for (const desktopDir of desktopDirs) {
        if (!fs.existsSync(desktopDir)) continue;

        // 월정산/점검준비/현장별 폴더 후보 전체 탐색
        const photoFolderCandidates = [
          // 1. 최신 월정산 저장 경로 (청주마감자료, 천안마감자료, 죽암휴게소 등)
          path.join(desktopDir, '월정산', '청주마감자료', targetYm),
          path.join(desktopDir, '월정산', '천안마감자료', targetYm),
          path.join(desktopDir, '월정산', '천안(부산)', targetYm),
          path.join(desktopDir, '월정산', '천안(부산방향)', targetYm),
          path.join(desktopDir, '월정산', '죽암휴게소', targetYm),
          path.join(desktopDir, '월정산', '죽암(부산)', targetYm),
          path.join(desktopDir, '월정산', '죽암(서울)', targetYm),
          path.join(desktopDir, '월정산', siteName, targetYm),
          path.join(desktopDir, '월정산', `${siteName}(서울방향)`, targetYm),
          path.join(desktopDir, '월정산', `${siteName}(부산방향)`, targetYm),

          // 2. 점검준비 폴더
          path.join(desktopDir, '점검준비', '정산서', targetYm),
          path.join(desktopDir, '점검준비', '명세서', targetYm),
          path.join(desktopDir, '점검준비', '계산서', targetYm),
          path.join(desktopDir, '점검준비', '입금표', targetYm),
          path.join(desktopDir, '점검준비', '성적서', targetYm),

          // 3. 기존 사진모음 폴더 호환
          path.join(desktopDir, `${siteName}_${year}년${mm}월_사진모음`),
          path.join(desktopDir, `${siteName}(서울방향)_${year}년${mm}월_사진모음`),
          path.join(desktopDir, `${siteName}_${year}년${month}월_사진모음`),
        ];

        for (const candidate of photoFolderCandidates) {
          if (fs.existsSync(candidate)) {
            try {
              const files = fs.readdirSync(candidate);
              if (files.length > 0) {
                isReady = true;
                foundPath = candidate;
                break;
              }
            } catch (_) {}
          }
        }
        if (isReady) break;
      }

      return res.json({
        success: true,
        ready: isReady,
        path: foundPath,
        siteName,
        targetYm,
      });
    } catch (err) {
      console.error('[settlementRoutes] check-data-ready 오류:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * GET /api/settlement/cheongju-statements-status
   * 청주 3대 거래명세서(수질분석-대신, 키트-케이엠, 약품-에이치디이앤씨) 기존 등록 여부 조회
   */
  router.get('/cheongju-statements-status', (req, res) => {
    try {
      const targetYm = normalizeTargetYm(req.query.targetYm) || `${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}`;
      const statementsDir = getCheongjuStatementsDir(targetYm);
      const waterQualityPath = findCheongjuStatementFile(statementsDir, targetYm, '대신');
      const kitPath = findCheongjuStatementFile(statementsDir, targetYm, '케이엠');
      const chemicalPath = findCheongjuStatementFile(statementsDir, targetYm, '에이치디이앤씨');

      const statements = {
        waterQuality: waterQualityPath ? { exists: true, fileName: path.basename(waterQualityPath), path: waterQualityPath } : { exists: false },
        kit: kitPath ? { exists: true, fileName: path.basename(kitPath), path: kitPath } : { exists: false },
        chemical: chemicalPath ? { exists: true, fileName: path.basename(chemicalPath), path: chemicalPath } : { exists: false },
      };

      const allReady = Boolean(statements.waterQuality.exists && statements.kit.exists && statements.chemical.exists);

      return res.json({
        success: true,
        targetYm,
        allReady,
        statements,
      });
    } catch (err) {
      console.error('[settlementRoutes] cheongju-statements-status 오류:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/cheongju-statements-preview', (req, res) => {
    try {
      const targetYm = normalizeTargetYm(req.query.targetYm);
      const type = String(req.query.type || '');
      const keywordByType = {
        waterQuality: '대신',
        kit: '케이엠',
        chemical: '에이치',
      };
      const keyword = keywordByType[type];
      if (!targetYm || !keyword) {
        return res.status(400).json({ success: false, error: '유효하지 않은 명세서 미리보기 요청입니다.' });
      }

      const vendor = type === 'chemical' ? '에이치디이앤씨' : keyword;
      const file = findCheongjuStatementFile(getCheongjuStatementsDir(targetYm), targetYm, vendor);
      if (file) return res.sendFile(file);

      return res.status(404).json({ success: false, error: '명세서 이미지를 찾을 수 없습니다.' });
    } catch (err) {
      console.error('[settlementRoutes] 청주 명세서 미리보기 오류:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/cheongju-statements/:type', upload.single('file'), (req, res) => {
    try {
      const type = String(req.params.type || '');
      const labels = {
        waterQuality: '대신',
        kit: '케이엠',
        chemical: '에이치디이앤씨',
      };
      const label = labels[type];
      const targetYm = normalizeTargetYm(req.body?.targetYm);
      const extension = path.extname(req.file?.originalname || '').toLowerCase();
      if (!label || !targetYm || !req.file || !['.jpg', '.jpeg', '.png'].includes(extension)) {
        return res.status(400).json({ success: false, error: '유효하지 않은 명세서 저장 요청입니다.' });
      }

      const targetDir = getCheongjuStatementsDir(targetYm);
      fs.mkdirSync(targetDir, { recursive: true });
      const fileName = `명세서_${targetYm}_청주휴게소(서울방향) ${label}${extension}`;
      fs.writeFileSync(path.join(targetDir, fileName), req.file.buffer);

      return res.json({
        success: true,
        fileName,
        previewUrl: `/api/settlement/cheongju-statements-preview?targetYm=${targetYm}&type=${type}`,
      });
    } catch (err) {
      console.error('[settlementRoutes] 청주 명세서 저장 오류:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * GET /api/settlement/hongcheon/status
   * 홍천휴게소 한글 정산 증빙 이미지(청소필증, 반출사진, 계산서, 성적서) 상태 조회
   */
  router.get('/hongcheon/status', (req, res) => {
    try {
      const year = parseInt(req.query.year || new Date().getFullYear(), 10);
      const month = parseInt(req.query.month || (new Date().getMonth() + 1), 10);
      const status = getHongcheonEvidenceStatus(year, month);
      
      const cleanCertPreview = status.cleanCert
        ? `/api/settlement/hongcheon/preview?type=cleanCert&year=${year}&month=${month}&t=${Date.now()}`
        : null;
      const sludgePhotoPreview = status.sludgePhoto
        ? `/api/settlement/hongcheon/preview?type=sludgePhoto&year=${year}&month=${month}&t=${Date.now()}`
        : null;

      return res.json({
        success: true,
        ...status,
        cleanCertPreview,
        sludgePhotoPreview,
      });
    } catch (err) {
      console.error('[settlementRoutes] hongcheon/status 오류:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * GET /api/settlement/hongcheon/preview
   * 홍천휴게소 증빙 이미지 미리보기 서빙
   */
  router.get('/hongcheon/preview', (req, res) => {
    try {
      const year = parseInt(req.query.year || new Date().getFullYear(), 10);
      const month = parseInt(req.query.month || (new Date().getMonth() + 1), 10);
      const type = String(req.query.type || '');

      const status = getHongcheonEvidenceStatus(year, month);
      let targetFile = null;
      if (type === 'cleanCert') targetFile = status.cleanCert;
      else if (type === 'sludgePhoto') targetFile = status.sludgePhoto;
      else if (type === 'invoice') targetFile = status.invoice;

      if (targetFile && fs.existsSync(targetFile)) {
        return res.sendFile(targetFile);
      }
      return res.status(404).json({ success: false, error: '이미지를 찾을 수 없습니다.' });
    } catch (err) {
      console.error('[settlementRoutes] hongcheon/preview 오류:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * POST /api/settlement/hongcheon/upload-evidence
   * 홍천휴게소 청소필증 또는 반출사진 업로드 저장
   */
  router.post('/hongcheon/upload-evidence', upload.single('file'), (req, res) => {
    try {
      const year = parseInt(req.body?.year || new Date().getFullYear(), 10);
      const month = parseInt(req.body?.month || (new Date().getMonth() + 1), 10);
      const type = String(req.body?.type || '');

      if (!req.file || !['cleanCert', 'sludgePhoto'].includes(type)) {
        return res.status(400).json({ success: false, error: '유효하지 않은 업로드 요청입니다.' });
      }

      const saveRes = saveHongcheonEvidence(year, month, type, req.file.buffer, req.file.originalname);
      const status = getHongcheonEvidenceStatus(year, month);

      return res.json({
        success: true,
        saveRes,
        status: {
          ...status,
          cleanCertPreview: status.cleanCert
            ? `/api/settlement/hongcheon/preview?type=cleanCert&year=${year}&month=${month}&t=${Date.now()}`
            : null,
          sludgePhotoPreview: status.sludgePhoto
            ? `/api/settlement/hongcheon/preview?type=sludgePhoto&year=${year}&month=${month}&t=${Date.now()}`
            : null,
        },
      });
    } catch (err) {
      console.error('[settlementRoutes] hongcheon/upload-evidence 오류:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * POST /api/settlement/generate/hongcheon-hwp
   * 홍천휴게소 한글 정산보고서 자동 생성
   */
  router.post('/generate/hongcheon-hwp', async (req, res) => {
    try {
      const year = parseInt(req.body?.year || new Date().getFullYear(), 10);
      const month = parseInt(req.body?.month || (new Date().getMonth() + 1), 10);
      const customInputs = req.body?.customInputs || {};

      const result = await generateHongcheonHwpReport(year, month, customInputs);
      return res.json({ success: true, ...result });
    } catch (err) {
      console.error('[settlementRoutes] generate/hongcheon-hwp 오류:', err);
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
      let diagnosticStage = '요청 검증';
      let diagnosticTargetYm = '';
      try {
        const year = parseInt(req.body?.year || new Date().getFullYear(), 10);
        const month = parseInt(req.body?.month || (new Date().getMonth() + 1), 10);
        const targetYm = `${year}${String(month).padStart(2, '0')}`;
        diagnosticTargetYm = targetYm;
        const tempDir = path.join(os.tmpdir(), `osoo_cheongju_stmt_${Date.now()}`);
        fs.mkdirSync(tempDir, { recursive: true });

        diagnosticStage = '6_명세서 저장본 확인';
        const statementsDir = getCheongjuStatementsDir(targetYm);
        const statementFiles = {
          waterQuality: findCheongjuStatementFile(statementsDir, targetYm, '대신'),
          kit: findCheongjuStatementFile(statementsDir, targetYm, '케이엠'),
          chemical: findCheongjuStatementFile(statementsDir, targetYm, '에이치디이앤씨'),
        };
        if (Object.values(statementFiles).some((filePath) => !filePath)) {
          throw new Error(`청주 거래명세서 3종을 ${statementsDir}에 모두 저장한 뒤 생성해 주세요.`);
        }
        const statementWorkingFiles = materializeCheongjuStatementFiles(statementFiles, tempDir);

        diagnosticStage = '기본 HWP 템플릿 확인';
        const cheongjuTemplate = getTemplateList().find((site) => site.id === 'cheongju_seoul');
        const templatePath = cheongjuTemplate?.template
          ? getTemplateFilePath(cheongjuTemplate.template)
          : null;

        if (!templatePath) {
          throw new Error('청주휴게소 정산 한글 양식이 없습니다. 양식관리에서 청주휴게소(서울방향) HWP 양식을 등록해 주세요.');
        }

        diagnosticStage = 'Drive 현장 사진 준비';
        const photoSummary = await getMonthlyPhotoSummary({
          siteName: '청주휴게소(서울방향)',
          year,
          month,
          appDataPath,
        });
        const photoFiles = await materializeCheongjuPhotoFiles(photoSummary, tempDir);
        diagnosticStage = '월별운영보고서 청주 현장 조회';
        const reportSites = await getReportSiteList(year, month);
        const cheongjuSite = reportSites.find((site) => {
          const name = String(site.site_name || '').replace(/\s/g, '');
          return name.includes('청주') && name.includes('서울');
        });
        if (!cheongjuSite) {
          throw new Error('월별운영보고서 데이터에서 청주휴게소(서울방향) 현장을 찾을 수 없습니다.');
        }
        diagnosticStage = 'BigQuery 약품·키트·슬러지 원본 조회';
        const [rawMonthlyData, usageSummary] = await Promise.all([
          getMonthlyReportData(year, month, cheongjuSite.site_id),
          getMonthlyReportUsageSummary(year, month, cheongjuSite.site_id),
        ]);
        const reportData = transformToReportData(year, month, cheongjuSite.site_name, rawMonthlyData);
        diagnosticStage = 'HWP 자동화';

        console.log(`\n================== [청주 정산서 생성 진단 시작] ==================`);
        console.log(`[청주 정산서 진단] 대상: ${year}년 ${month}월 (${targetYm})`);
        console.log(`[청주 정산서 진단] 템플릿 파일: ${templatePath} (${fs.existsSync(templatePath) ? fs.statSync(templatePath).size + ' bytes' : 'NOT FOUND'})`);
        console.log(`[청주 정산서 진단] 거래명세서 3종 원본:`);
        Object.entries(statementFiles).forEach(([k, v]) => {
          console.log(`  - [${k}]: ${v} (${fs.existsSync(v) ? fs.statSync(v).size + ' bytes' : 'NOT FOUND'})`);
        });
        console.log(`[청주 정산서 진단] BigQuery 슬러지 반출일 행 수: ${(rawMonthlyData?.flowRows || []).length}건`);
        console.log(`[청주 정산서 진단] HWP 자동화 프로세스 시작...`);

        const generatedResult = await generateCheongjuHwpReport({
          year,
          month,
          statementFiles: statementWorkingFiles,
          photoFiles,
          usageSummary,
          reportData,
          flowRows: rawMonthlyData.flowRows,
          site: cheongjuSite,
          templatePath,
        });

        const finalFilePath = typeof generatedResult === 'string' ? generatedResult : generatedResult.filePath;
        const fileName = (typeof generatedResult === 'object' && generatedResult.fileName)
          ? generatedResult.fileName
          : path.basename(finalFilePath);

        console.log(`[청주 정산서 진단] HWP 파일 생성 완료!`);
        console.log(`  - 최종 파일 경로: ${finalFilePath}`);
        console.log(`  - 파일 크기: ${fs.existsSync(finalFilePath) ? fs.statSync(finalFilePath).size + ' bytes' : 'NOT FOUND'}`);
        console.log(`================== [청주 정산서 생성 진단 완료] ==================\n`);

        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch (_) {}

        return res.json({
          success: true,
          filePath: finalFilePath,
          fileName,
          message: `[청주(서울방향)] ${year}년 ${month}월 정산 보고서 한글 파일 생성이 완료되었습니다.`,
        });
      } catch (err) {
        const logPath = writeCheongjuPreflightFailureLog(diagnosticTargetYm, diagnosticStage, err);
        console.error(`\n[청주 정산서 진단 ERROR] 단계: [${diagnosticStage}] 실패:`, err.message);
        console.error(`[청주 정산서 진단 ERROR] 사전점검 실패 로그: ${logPath}`);
        res.status(500).json({ success: false, error: `${err.message} 로그: ${logPath}` });
      }
    }
  );

  /**
   * POST /api/settlement/generate/jukam-busan
   * 죽암휴게소(부산방향) 정산서 엑셀(XLS) 파일 자동 생성
   */
  router.post('/generate/jukam-busan', async (req, res) => {
    try {
      const year = parseInt(req.body.year || new Date().getFullYear(), 10);
      const month = parseInt(req.body.month || (new Date().getMonth() + 1), 10);

      console.log(`[settlementRoutes] 죽암(부산) ${year}년 ${month}월 정산 엑셀 생성 요청 시작`);
      const result = await generateJukamBusanExcelReport({
        year,
        month,
      });

      return res.json({
        success: true,
        filePath: result.filePath,
        fileName: result.fileName,
        targetYm: result.targetYm,
        message: `[죽암(부산방향)] ${year}년 ${month}월 정산 엑셀 파일 생성이 완료되었습니다.`,
      });
    } catch (err) {
      console.error('[settlementRoutes] 죽암(부산) 정산서 생성 오류:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * POST /api/settlement/generate/cheonan-busan
   * 천안휴게소(부산방향) 정산서 엑셀(XLSX) 파일 자동 생성
   */
  router.post('/generate/cheonan-busan', async (req, res) => {
    try {
      const year = parseInt(req.body.year || new Date().getFullYear(), 10);
      const month = parseInt(req.body.month || (new Date().getMonth() + 1), 10);

      console.log(`[settlementRoutes] 천안(부산) ${year}년 ${month}월 정산 엑셀 생성 요청 시작`);
      const result = await generateCheonanBusanExcelReport({
        year,
        month,
      });

      return res.json({
        success: true,
        filePath: result.filePath,
        fileName: result.fileName,
        targetYm: result.targetYm,
        message: `[천안(부산방향)] ${year}년 ${month}월 정산 엑셀 파일 생성이 완료되었습니다.`,
      });
    } catch (err) {
      console.error('[settlementRoutes] 천안(부산) 정산서 생성 오류:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * POST /api/settlement/generate/jukam-seoul
   * 죽암휴게소(서울방향) 정산서 엑셀(XLS) 파일 자동 생성
   */
  router.post('/generate/jukam-seoul', async (req, res) => {
    try {
      const year = parseInt(req.body.year || new Date().getFullYear(), 10);
      const month = parseInt(req.body.month || (new Date().getMonth() + 1), 10);

      console.log(`[settlementRoutes] 죽암(서울) ${year}년 ${month}월 정산 엑셀 생성 요청 시작`);
      const result = await generateJukamSeoulExcelReport({
        year,
        month,
      });

      return res.json({
        success: true,
        filePath: result.filePath,
        fileName: result.fileName,
        targetYm: result.targetYm,
        message: `[죽암(서울방향)] ${year}년 ${month}월 정산 엑셀 파일 생성이 완료되었습니다.`,
      });
    } catch (err) {
      console.error('[settlementRoutes] 죽암(서울) 정산서 생성 오류:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * POST /api/settlement/generate/hongcheon-excel
   * 홍천휴게소(양양방향) 정산서 엑셀(XLSX) 파일 자동 생성
   */
  router.post('/generate/hongcheon-excel', async (req, res) => {
    try {
      const year = parseInt(req.body.year || new Date().getFullYear(), 10);
      const month = parseInt(req.body.month || (new Date().getMonth() + 1), 10);

      console.log(`[settlementRoutes] 홍천(양양) ${year}년 ${month}월 정산 엑셀 생성 요청 시작`);
      const result = await generateHongcheonExcelReport(year, month);

      return res.json({
        success: true,
        filePath: result.savedPath,
        fileName: result.fileName,
        desktopPath: result.desktopPath,
        message: `[홍천(양양방향)] ${year}년 ${month}월 정산 엑셀 파일 생성이 완료되었습니다.`,
      });
    } catch (err) {
      console.error('[settlementRoutes] 홍천(양양) 정산 엑셀 생성 오류:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * GET /api/settlement/hongcheon/status
   * 홍천휴게소 한글 정산 증빙 이미지(청소필증, 반출사진, 계산서, 성적서) 상태 및 누락 진단
   */
  router.get('/hongcheon/status', (req, res) => {
    try {
      const year = parseInt(req.query.year || new Date().getFullYear(), 10);
      const month = parseInt(req.query.month || (new Date().getMonth() + 1), 10);
      const status = getHongcheonEvidenceStatus(year, month);
      res.json({ success: true, ...status });
    } catch (err) {
      console.error('[settlementRoutes] 홍천 증빙 상태 조회 오류:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * POST /api/settlement/hongcheon/upload-evidence
   * 홍천휴게소 청소필증 또는 반출사진 개별 업로드
   */
  router.post('/hongcheon/upload-evidence', upload.single('file'), (req, res) => {
    try {
      const year = parseInt(req.body.year || new Date().getFullYear(), 10);
      const month = parseInt(req.body.month || (new Date().getMonth() + 1), 10);
      const type = req.body.type; // 'cleanCert' or 'sludgePhoto'

      if (!req.file) {
        return res.status(400).json({ success: false, error: '업로드할 이미지 파일이 없습니다.' });
      }
      if (!type || (type !== 'cleanCert' && type !== 'sludgePhoto')) {
        return res.status(400).json({ success: false, error: '유효한 증빙 유형(cleanCert 또는 sludgePhoto)이 아닙니다.' });
      }

      const result = saveHongcheonEvidence(year, month, type, req.file.buffer, req.file.originalname);
      const updatedStatus = getHongcheonEvidenceStatus(year, month);
      res.json({
        success: true,
        message: `[${type === 'cleanCert' ? '청소필증' : '반출사진'}] 파일이 성공적으로 등록되었습니다.`,
        uploadResult: result,
        status: updatedStatus,
      });
    } catch (err) {
      console.error('[settlementRoutes] 홍천 증빙 업로드 오류:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * POST /api/settlement/generate/hongcheon-hwp
   * 홍천휴게소(양양방향) 한글(HWP) 정산서 자동 생성 실행
   */
  router.post('/generate/hongcheon-hwp', async (req, res) => {
    try {
      const year = parseInt(req.body.year || new Date().getFullYear(), 10);
      const month = parseInt(req.body.month || (new Date().getMonth() + 1), 10);

      console.log(`[settlementRoutes] 홍천(양양) ${year}년 ${month}월 한글 정산서 생성 요청 시작`);
      const result = await generateHongcheonHwpReport(year, month, req.body.customInputs || {});

      return res.json({
        success: true,
        filePath: result.savedPath,
        fileName: result.fileName,
        desktopPath: result.desktopPath,
        missing: result.missing,
        message: `[홍천(양양방향)] ${year}년 ${month}월 한글 정산보고서 생성이 완료되었습니다.`,
      });
    } catch (err) {
      console.error('[settlementRoutes] 홍천(양양) 한글 정산서 생성 오류:', err);
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

function getCheongjuStatementsDir(targetYm) {
  return path.join(
    os.homedir(),
    'OneDrive',
    '바탕 화면',
    '월정산',
    '청주마감자료',
    targetYm,
    '6_명세서'
  );
}

function findCheongjuStatementFile(statementsDir, targetYm, vendor) {
  if (!fs.existsSync(statementsDir)) return null;
  const prefix = `명세서_${targetYm}_청주휴게소(서울방향) ${vendor}`;
  const fileName = fs.readdirSync(statementsDir).find((name) => (
    name.startsWith(prefix) && /\.(jpg|jpeg|png)$/i.test(name)
  ));
  return fileName ? path.join(statementsDir, fileName) : null;
}

function writeCheongjuPreflightFailureLog(targetYm, stage, error) {
  const appDataRoot = process.env.APP_DATA_PATH
    || path.join(process.env.APPDATA || os.homedir(), 'Osoo_Admin_App');
  const logDir = path.join(appDataRoot, 'logs', 'cheongju-hwp');
  fs.mkdirSync(logDir, { recursive: true });
  const safeTargetYm = /^\d{6}$/.test(targetYm) ? targetYm : 'unknown';
  const logPath = path.join(logDir, `${safeTargetYm}_${new Date().toISOString().replace(/[:.]/g, '-')}_preflight-error.log`);
  const content = [
    `RUN FAILED BEFORE HWP AUTOMATION`,
    `Stage: ${stage}`,
    `Error: ${error?.stack || error?.message || String(error)}`,
    '',
  ].join('\n');
  fs.writeFileSync(logPath, content, 'utf8');
  return logPath;
}

async function findSettlementMonthlyFolder(targetYm) {
  if (!isDriveConfigured()) return null;
  const monthlyRoot = await getSingleSettlementRootFolder();
  return monthlyRoot ? findFolderInParent(monthlyRoot.id, targetYm) : null;
}

async function uploadSettlementFilesToDrive(localFolder, targetYm, fileNames) {
  if (!isDriveConfigured() || !Array.isArray(fileNames) || fileNames.length === 0) return;
  const monthlyRoot = await getSingleSettlementRootFolder();
  if (!monthlyRoot?.id) return;

  // 단일 월정산 루트(monthlyRoot.id) 직하위에 YYYYMM 폴더를 1회만 확정 생성/조회하여 중복 폴더 원천 차단
  const targetFolder = await getOrCreateFolder(monthlyRoot.id, targetYm);
  if (!targetFolder?.id) return;

  for (const fileName of fileNames) {
    const sourcePath = path.join(localFolder, fileName);
    if (!fs.existsSync(sourcePath)) continue;

    await uploadBufferToFolder({
      folderId: targetFolder.id,
      fileName,
      buffer: fs.readFileSync(sourcePath),
      mimeType: 'image/jpeg',
    });
  }
  console.log(`[settlementRoutes] Drive 월정산 전송 완료: 월정산/${targetYm} (${fileNames.length}개 파일)`);
}

async function materializeCheongjuPhotoFiles(summary, tempDir) {
  const categories = {
    cleaningCertificates: summary.cleaningCertificates?.files || [],
    testPhotos: summary.testPhotos?.files || [],
    sludgePhotos: summary.sludgePhotos?.files || [],
    medicineInPhotos: summary.medicineInPhotos?.files || [],
    kitInPhotos: summary.kitInPhotos?.files || [],
  };
  const result = {};
  const documentNamePattern = /명세서|계산서|입금표|매출계산서/i;
  const certSizes = new Set();

  for (const [category, files] of Object.entries(categories)) {
    result[category] = [];
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      if (documentNamePattern.test(file.name || '')) continue;
      // 슬러지 사진인데 파일명에 '필증'/'영수증'이 들어간 파일은 제외
      if (category === 'sludgePhotos' && (/필증|영수증/i.test(file.name || ''))) continue;

      const extension = path.extname(file.name || '') || '.jpg';
      const targetPath = path.join(tempDir, `${category}_${index + 1}${extension}`);

      try {
        if (file.localPath && fs.existsSync(file.localPath)) {
          fs.copyFileSync(file.localPath, targetPath);
        } else if (file.driveFileId) {
          fs.writeFileSync(targetPath, await downloadDriveFileBuffer(file.driveFileId));
        } else {
          continue;
        }

        const size = fs.statSync(targetPath).size;
        // 청소필증 파일 크기 기록
        if (category === 'cleaningCertificates') {
          certSizes.add(size);
        } else if (category === 'sludgePhotos' && certSizes.has(size)) {
          // 청소필증과 크기(bytes)가 완벽히 동일한 오분류 파일은 슬러지 사진에서 제외
          console.log(`[settlementRoutes] 슬러지 사진 중 청소필증과 동일한 크기(${size} bytes)의 파일 제외: ${file.name}`);
          try { fs.unlinkSync(targetPath); } catch (_) {}
          continue;
        }

        result[category].push(targetPath);
      } catch (err) {
        console.warn(`[settlementRoutes] 청주 ${category} 증빙 준비 실패 (${file.name}):`, err.message);
      }
    }
  }

  return result;
}

function materializeCheongjuStatementFiles(statementFiles, tempDir) {
  const result = {};
  for (const [type, sourcePath] of Object.entries(statementFiles)) {
    const extension = path.extname(sourcePath || '') || '.jpg';
    const targetPath = path.join(tempDir, `statement_${type}${extension}`);
    fs.copyFileSync(sourcePath, targetPath);
    result[type] = targetPath;
  }
  return result;
}

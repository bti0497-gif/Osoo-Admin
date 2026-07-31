const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const JSZip = require('jszip');
const {
  isDriveConfigured,
  getDriveRootFolderId,
  getOrCreateFolderPath,
  findFolderInParent,
  listFilesFolder,
  uploadBufferToFolder,
  downloadDriveFileBuffer,
} = require('../services/driveService.cjs');
const { seedSiteSettlementVendors, upsertSiteSettlementVendors } = require('../services/siteSettlementVendorsSheetsService.cjs');
const { getSites } = require('../services/sitesSheetsService.cjs');
const router = express.Router();

const DEFAULT_ROI_CONFIG = {
  supplierX: 2,
  supplierY: 3,    // 상호명 Y 시작 위치 (%)
  supplierW: 96,
  supplierH: 26,   // 상호명 영역 높이 (%)
  itemX: 2,
  itemY: 53,       // 품목명 Y 시작 위치 (%)
  itemW: 96,
  itemH: 24,       // 품목명 영역 높이 (%)
  zoomScale: 2.4,  // 확대 배율
};

module.exports = function (db, baseDir, appDataPath) {
  const roiConfigFilePath = path.join(appDataPath, 'osoo_settlement_roi_config.json');

  // ROI 설정 조회 API
  router.get('/roi-config', (req, res) => {
    try {
      if (fs.existsSync(roiConfigFilePath)) {
        const raw = fs.readFileSync(roiConfigFilePath, 'utf8');
        const parsed = JSON.parse(raw);
        return res.json({ success: true, config: { ...DEFAULT_ROI_CONFIG, ...parsed } });
      }
      return res.json({ success: true, config: DEFAULT_ROI_CONFIG });
    } catch (err) {
      console.error('[settlementRoutes] ROI 설정 읽기 오류:', err);
      return res.json({ success: true, config: DEFAULT_ROI_CONFIG });
    }
  });

  // ROI 설정 저장 API (AppData JSON 영구 파일 저장)
  router.post('/roi-config', (req, res) => {
    try {
      const config = req.body || {};
      const nextConfig = {
        ...DEFAULT_ROI_CONFIG,
        ...config,
      };

      if (!fs.existsSync(appDataPath)) {
        fs.mkdirSync(appDataPath, { recursive: true });
      }

      fs.writeFileSync(roiConfigFilePath, JSON.stringify(nextConfig, null, 2), 'utf8');
      console.log('[settlementRoutes] AppData에 ROI 영구 설정 저장 성공:', roiConfigFilePath);
      return res.json({ success: true, config: nextConfig });
    } catch (err) {
      console.error('[settlementRoutes] ROI 설정 저장 오류:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  let vendorMappingsCache = null;
  let vendorMappingsCacheTime = 0;
  const VENDOR_MAPPINGS_CACHE_TTL = 5 * 60 * 1000; // 5분 캐시

  router.get('/site-vendor-mappings', async (_req, res) => {
    try {
      const now = Date.now();
      if (vendorMappingsCache && (now - vendorMappingsCacheTime < VENDOR_MAPPINGS_CACHE_TTL)) {
        return res.json({ success: true, mappings: vendorMappingsCache, cached: true });
      }

      const { getSiteMaster } = require('../services/siteMasterCacheService.cjs');
      let sites = getSiteMaster();
      if (!sites || !sites.length) {
        sites = await getSites();
      }
      const mappings = await seedSiteSettlementVendors(sites);
      if (mappings && mappings.length > 0) {
        vendorMappingsCache = mappings;
        vendorMappingsCacheTime = Date.now();
      }
      return res.json({ success: true, mappings });
    } catch (err) {
      if (vendorMappingsCache) {
        console.warn('[settlementRoutes] 구글시트 API 쿼터 초과/오류로 인하여 캐시된 현장 벤더 매핑 사용:', err.message);
        return res.json({ success: true, mappings: vendorMappingsCache, cached: true });
      }
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/site-vendor-mappings', async (req, res) => {
    try {
      const mapping = await upsertSiteSettlementVendors(req.body || {});
      vendorMappingsCache = null;
      return res.json({ success: true, mapping });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
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

      const documentType = req.query.documentType === 'deposit' ? 'deposit' : 'invoice';
      const documentFolder = documentType === 'deposit' ? '입금표' : '계산서';
      const monthlyFolder = await findSettlementMonthlyFolder(targetYm, documentType);
      if (!monthlyFolder) return res.status(404).json({ success: false, error: `Drive에 월정산/${documentFolder}/${targetYm} 폴더가 없습니다.` });

      const files = (await listFilesFolder(monthlyFolder.id))
        .filter((file) => file.mimeType !== 'application/vnd.google-apps.folder');
      if (!files.length) return res.status(404).json({ success: false, error: `Drive의 월정산/${documentFolder}/${targetYm} 폴더가 비어 있습니다.` });

      const zip = new JSZip();
      const archiveFolderName = `${documentFolder}_${targetYm}`;
      for (const file of files) {
        zip.file(`${archiveFolderName}/${file.name}`, await downloadDriveFileBuffer(file.id));
      }
      const archive = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
      const archiveName = `${documentFolder}_${targetYm}.zip`;
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

async function findSettlementMonthlyFolder(targetYm, documentType = 'invoice') {
  const rootFolderId = getDriveRootFolderId();
  const monthlyRoot = await findFolderInParent(rootFolderId, '월정산');
  const documentFolder = documentType === 'deposit' ? '입금표' : '계산서';
  const categoryFolder = monthlyRoot && await findFolderInParent(monthlyRoot.id, documentFolder);
  return categoryFolder ? findFolderInParent(categoryFolder.id, targetYm) : null;
}

async function uploadSettlementFilesToDrive(localFolder, targetYm, fileNames, documentType = 'invoice') {
  if (!isDriveConfigured()) return;
  const documentFolder = documentType === 'deposit' ? '입금표' : '계산서';
  const monthlyFolder = await getOrCreateFolderPath(getDriveRootFolderId(), ['월정산', documentFolder, targetYm]);
  for (const fileName of fileNames) {
    const sourcePath = path.join(localFolder, fileName);
    if (!fs.existsSync(sourcePath)) continue;
    await uploadBufferToFolder({
      folderId: monthlyFolder.id,
      fileName,
      buffer: fs.readFileSync(sourcePath),
      mimeType: 'image/jpeg',
    });
  }
  console.log(`[settlementRoutes] Drive ${documentFolder} 전송 완료: 월정산/${documentFolder}/${targetYm} (${fileNames.length}개)`);
}

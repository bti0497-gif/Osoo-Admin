const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const multer = require('multer');
const { decodeUserContextHeader } = require('../utils/httpUserHeaders.cjs');

function resolveUserRole(req) {
  return decodeUserContextHeader(
    req.headers['x-user-role']
    || req.body?._user?.role
    || req.query?._role
    || ''
  ).trim().toLowerCase();
}

function ensureAdmin(req, res) {
  const role = resolveUserRole(req);
  if (role === 'admin' || role === 'group_admin' || role === 'central_admin' || role === 'super_admin') return true;
  res.status(403).json({ success: false, message: '관리자 권한이 필요합니다.' });
  return false;
}
const { getBigQueryClient, DATASET_ID } = require('../services/bigQueryClientService.cjs');
const { getAppDataTemplatesDir, getBundleTemplatesDir, resolveTemplatePath } = require('../services/templatePathService.cjs');

const router = express.Router();

const fsSync = require('fs');

const DEFAULT_REPORT_TEMPLATES = [
  {
    id: 'monthly_report',
    filename: '월운영보고서.xlsx',
    displayName: '월운영보고서 양식',
    description: '각 현장별 월간 운영 실적 데이터(유량, 약품, 슬러지 등)를 시트별로 자동 생성 및 출력을 위해 바인딩하는 기본 엑셀 템플릿',
    category: '기본 출력 양식',
  },
  {
    id: 'period_report',
    filename: '기간 데이타 조회.xlsx',
    displayName: '기간 데이터 조회 양식',
    description: '특정 기간 동안의 현장별 수질, 유량 및 약품 데이터를 종합 바인딩하여 출력하는 기본 엑셀 템플릿',
    category: '기본 출력 양식',
  },
];

function getTemplatesDir() {
  return getAppDataTemplatesDir();
}

// 디렉토리 초기화 및 번들 템플릿 자동 동기화
async function ensureTemplatesDir() {
  const appDataTemplatesDir = getAppDataTemplatesDir();
  const bundleTemplatesDir = getBundleTemplatesDir();

  try {
    await fs.mkdir(appDataTemplatesDir, { recursive: true });

    // 번들 기본 템플릿 파일들을 AppData 쓰기 경로로 자동 복사 (초기 1회 또는 복구용)
    if (fsSync.existsSync(bundleTemplatesDir)) {
      const bundleFiles = await fs.readdir(bundleTemplatesDir);
      for (const file of bundleFiles) {
        const targetPath = path.join(appDataTemplatesDir, file);
        const sourcePath = path.join(bundleTemplatesDir, file);
        if (!fsSync.existsSync(targetPath) && fsSync.existsSync(sourcePath)) {
          await fs.copyFile(sourcePath, targetPath);
        }
      }
    }
  } catch (err) {
    console.error('[gyeonggiRoutes] 템플릿 디렉토리 초기화 실패:', err);
  }
}

// multer 설정 (메모리 저장)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

/**
 * GET /api/gyeonggi/templates
 * 양식 목록 조회 (기본 출력 양식 + 사용자 지정 양식)
 */
router.get('/api/gyeonggi/templates', async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) return;
    await ensureTemplatesDir();

    const templatesDir = getTemplatesDir();
    const files = await fs.readdir(templatesDir);

    const fileStatsMap = new Map();
    for (const filename of files) {
      try {
        const filePath = path.join(templatesDir, filename);
        const stat = await fs.stat(filePath);
        fileStatsMap.set(filename, {
          filename,
          size: stat.size,
          modifiedAt: stat.mtime.toISOString(),
        });
      } catch (_) {}
    }

    const reportTemplates = DEFAULT_REPORT_TEMPLATES.map(tpl => {
      const stat = fileStatsMap.get(tpl.filename) || { size: 0, modifiedAt: null };
      return {
        ...tpl,
        size: stat.size,
        modifiedAt: stat.modifiedAt,
        exists: Boolean(stat.modifiedAt),
      };
    });

    const defaultFilenames = new Set(DEFAULT_REPORT_TEMPLATES.map(t => t.filename));
    const extraTemplates = Array.from(fileStatsMap.values())
      .filter(f => !defaultFilenames.has(f.filename))
      .map(f => ({
        id: f.filename,
        filename: f.filename,
        displayName: f.filename,
        description: '사용자 추가 템플릿 파일',
        category: '사용자 지정',
        size: f.size,
        modifiedAt: f.modifiedAt,
        exists: true,
      }));

    res.json({
      success: true,
      reportTemplates,
      extraTemplates,
      templates: [...reportTemplates, ...extraTemplates],
    });
  } catch (err) {
    console.error('양식 목록 조회 실패:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/gyeonggi/templates/replace
 * 지정한 양식 파일 교체 (AppData 저장소로 덮어쓰기)
 */
router.post('/api/gyeonggi/templates/replace', upload.single('file'), async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) return;
    await ensureTemplatesDir();

    const { targetFilename } = req.body;
    const file = req.file;

    if (!targetFilename || !file) {
      return res.status(400).json({ success: false, message: 'targetFilename과 file이 필요합니다.' });
    }

    const safeFilename = path.basename(targetFilename);
    const destPath = path.join(getTemplatesDir(), safeFilename);

    await fs.writeFile(destPath, file.buffer);

    res.json({
      success: true,
      message: `'${safeFilename}' 양식이 성공적으로 교체되었습니다.`,
      filename: safeFilename,
      size: file.size,
    });
  } catch (err) {
    console.error('양식 교체 실패:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/gyeonggi/templates/reset
 * 양식 파일을 원본 번들 기본 양식으로 원복
 */
router.post('/api/gyeonggi/templates/reset', async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) return;
    await ensureTemplatesDir();

    const { filename } = req.body;
    if (!filename) {
      return res.status(400).json({ success: false, message: 'filename이 필요합니다.' });
    }

    const safeFilename = path.basename(filename);
    const sourcePath = path.join(getBundleTemplatesDir(), safeFilename);
    const destPath = path.join(getTemplatesDir(), safeFilename);

    if (!fsSync.existsSync(sourcePath)) {
      return res.status(404).json({ success: false, message: '기본 번들 양식 원본을 찾을 수 없습니다.' });
    }

    await fs.copyFile(sourcePath, destPath);

    res.json({
      success: true,
      message: `'${safeFilename}' 양식이 초기 기본 양식으로 복원되었습니다.`,
    });
  } catch (err) {
    console.error('양식 원복 실패:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/gyeonggi/templates
 * 다중 양식 파일 업로드
 */
router.post('/api/gyeonggi/templates', upload.array('files', 10), async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) return;
    await ensureTemplatesDir();

    const files = Array.isArray(req.files) ? req.files : [];
    if (files.length === 0) {
      return res.status(400).json({ success: false, message: '업로드 파일이 없습니다.' });
    }

    const results = [];
    for (const file of files) {
      const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
      const destPath = path.join(getTemplatesDir(), originalName);

      await fs.writeFile(destPath, file.buffer);
      results.push({ filename: originalName, size: file.size });
    }

    res.json({ success: true, uploaded: results.length, files: results });
  } catch (err) {
    console.error('양식 업로드 실패:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * DELETE /api/gyeonggi/templates/:filename
 * 양식 삭제
 */
router.delete('/api/gyeonggi/templates/:filename', async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) return;

    const { filename } = req.params;
    if (!filename) {
      return res.status(400).json({ success: false, message: '파일명이 필요합니다.' });
    }

    const safeFilename = path.basename(filename);
    const filePath = path.join(getTemplatesDir(), safeFilename);

    await fs.unlink(filePath);
    res.json({ success: true, message: `${safeFilename} 삭제 완료` });
  } catch (err) {
    console.error('양식 삭제 실패:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/gyeonggi/templates/:filename/download
 * 양식 다운로드
 */
router.get('/api/gyeonggi/templates/:filename/download', async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) return;
    
    const { filename } = req.params;
    const safeFilename = path.basename(filename);
    const filePath = resolveTemplatePath(safeFilename);
    
    res.download(filePath, safeFilename);
  } catch (err) {
    console.error('양식 다운로드 실패:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/gyeonggi/data-preview
 * BigQuery 데이터 미리보기
 */
router.get('/api/gyeonggi/data-preview', async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) return;
    
    const { startDate, endDate, sites } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'startDate와 endDate가 필요합니다.' });
    }
    
    const bq = getBigQueryClient();
    if (!bq) {
      return res.status(500).json({ success: false, message: 'BigQuery 클라이언트가 초기화되지 않았습니다.' });
    }
    
    let query = `
      SELECT report_date, site_name, ss, bod, tn, tp, total_coliform, mlss, do, ph
      FROM \`${DATASET_ID}.water_quality\`
      WHERE report_date >= @startDate AND report_date <= @endDate
    `;
    
    const params = { startDate, endDate };
    const types = { startDate: 'DATE', endDate: 'DATE' };
    
    // 현장 필터
    if (sites && sites.trim()) {
      const siteList = sites.split(',').map(s => s.trim()).filter(Boolean);
      if (siteList.length > 0) {
        query += ` AND site_name IN UNNEST(@sites)`;
        params.sites = siteList;
        types.sites = 'STRING';
      }
    }
    
    query += ` ORDER BY report_date, site_name LIMIT 1000`;
    
    const [rows] = await bq.query({ query, params, types });
    
    res.json({
      success: true,
      startDate,
      endDate,
      siteCount: new Set(rows.map(r => r.site_name)).size,
      totalCount: rows.length,
      data: rows,
    });
  } catch (err) {
    console.error('데이터 미리보기 실패:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/gyeonggi/generate
 * 문서 생성
 */
router.post('/api/gyeonggi/generate', async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) return;
    
    const { templateFilename, startDate, endDate, sites } = req.body;
    
    if (!templateFilename || !startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'templateFilename, startDate, endDate가 필요합니다.' });
    }
    
    // 템플릿 파일 존재 확인
    const safeFilename = path.basename(templateFilename);
    const templatePath = path.join(TEMPLATES_DIR, safeFilename);
    
    try {
      await fs.access(templatePath);
    } catch {
      return res.status(404).json({ success: false, message: '템플릿 파일을 찾을 수 없습니다.' });
    }
    
    // 데이터 조회
    const bq = getBigQueryClient();
    let query = `
      SELECT report_date, site_name, ss, bod, tn, tp, total_coliform, mlss, do, ph
      FROM \`${DATASET_ID}.water_quality\`
      WHERE report_date >= @startDate AND report_date <= @endDate
    `;
    
    const params = { startDate, endDate };
    const types = { startDate: 'DATE', endDate: 'DATE' };
    
    if (sites && sites.length > 0) {
      query += ` AND site_name IN UNNEST(@sites)`;
      params.sites = sites;
      types.sites = 'STRING';
    }
    
    query += ` ORDER BY report_date, site_name`;
    
    const [rows] = await bq.query({ query, params, types });
    
    // TODO: 템플릿 엔진으로 데이터 바인딩 (현재는 JSON 응답)
    // 향후 xlsx-populate, docx-templates 등으로 구현
    
    res.json({
      success: true,
      message: '문서 생성 기능은 템플릿 엔진 연동 후 구현됩니다.',
      template: safeFilename,
      recordCount: rows.length,
      data: rows,
    });
  } catch (err) {
    console.error('문서 생성 실패:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = { gyeonggiRouter: router };

const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const multer = require('multer');
const { ensureAdmin } = require('../utils/httpUserHeaders.cjs');
const { getBigQueryClient, DATASET_ID } = require('../services/bigQueryClientService.cjs');

const router = express.Router();

// 양식 저장 경로
const TEMPLATES_DIR = path.join(__dirname, '..', '..', 'templates', 'gyeonggi');

// 디렉토리 초기화
async function ensureTemplatesDir() {
  try {
    await fs.mkdir(TEMPLATES_DIR, { recursive: true });
  } catch (err) {
    console.error('템플릿 디렉토리 생성 실패:', err);
  }
}

// multer 설정 (메모리 저장)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

/**
 * GET /api/gyeonggi/templates
 * 양식 목록 조회
 */
router.get('/api/gyeonggi/templates', async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) return;
    await ensureTemplatesDir();
    
    const files = await fs.readdir(TEMPLATES_DIR);
    const templates = await Promise.all(
      files.map(async (filename) => {
        const filePath = path.join(TEMPLATES_DIR, filename);
        const stat = await fs.stat(filePath);
        return {
          filename,
          size: stat.size,
          modifiedAt: stat.mtime.toISOString(),
        };
      })
    );
    
    // 수정일 내림차순 정렬
    templates.sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));
    
    res.json({ success: true, count: templates.length, templates });
  } catch (err) {
    console.error('양식 목록 조회 실패:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/gyeonggi/templates
 * 양식 파일 업로드
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
      // 파일명 latin1 디코딩
      const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
      const destPath = path.join(TEMPLATES_DIR, originalName);
      
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
    
    // 경로 주입 방지
    const safeFilename = path.basename(filename);
    const filePath = path.join(TEMPLATES_DIR, safeFilename);
    
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
    const filePath = path.join(TEMPLATES_DIR, safeFilename);
    
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
      FROM \`${DATASET_ID}.certificate_water_quality\`
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
      FROM \`${DATASET_ID}.certificate_water_quality\`
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

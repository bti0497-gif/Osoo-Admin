const express = require('express');
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { getBigQueryClient, DATASET_ID } = require('../services/bigQueryClientService.cjs');
const {
  buildBatchExportExcel,
  buildBatchPreviewPdf,
  buildPreviewManifest,
  buildPageRenderData,
  buildPagePreviewPdf,
  findPageInManifest,
  normalizeDateRange,
  parsePageKey,
  getActiveDates,
} = require('../services/dailyLogPreviewService.cjs');
const { resolveReportTemplatePath } = require('../services/reportTemplateService.cjs');
const { getHtmlTemplatePath } = require('../services/excelTemplateHtmlService.cjs');
const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function buildMissingTemplateResponse(templateName) {
  const requestedTemplateName = String(templateName || '수질분석일지').trim() || '수질분석일지';
  return {
    code: 'REPORT_TEMPLATE_MISSING',
    error: `${requestedTemplateName} 양식을 찾을 수 없습니다.`,
    userMessage: `${requestedTemplateName} 양식을 찾을 수 없습니다.\n설정에서 ${requestedTemplateName} 양식 파일을 업로드해 주세요.`
  };
}

module.exports = function(db, baseDir, appDataPath) {
  router.get('/api/logs/preview-template-html', async (req, res) => {
    const { templateName } = req.query;
    const templateInfo = resolveReportTemplatePath(baseDir, appDataPath, templateName, { excelOnly: true });

    if (!templateInfo?.absolutePath || !fs.existsSync(templateInfo.absolutePath)) {
      return res.status(404).json(buildMissingTemplateResponse(templateName));
    }

    const htmlPath = getHtmlTemplatePath(appDataPath, templateInfo.fileName);
    if (!fs.existsSync(htmlPath)) {
      return res.status(404).json({
        code: 'REPORT_TEMPLATE_HTML_MISSING',
        error: 'HTML 템플릿을 찾을 수 없습니다.',
        userMessage: 'HTML 템플릿이 아직 생성되지 않았습니다. 설정에서 양식 파일을 다시 업로드해 주세요.'
      });
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return res.sendFile(htmlPath);
  });

  router.get('/api/logs/active-dates', async (req, res) => {
    const { startDate, endDate, templateName } = req.query;

    const templateInfo = resolveReportTemplatePath(baseDir, appDataPath, templateName, { excelOnly: true });
    if (!templateInfo?.absolutePath || !fs.existsSync(templateInfo.absolutePath)) {
      return res.status(404).json(buildMissingTemplateResponse(templateName));
    }

    try {
      if (!startDate || !endDate) {
        return res.status(400).json({ success: false, error: 'startDate 및 endDate가 필요합니다.' });
      }

      const range = normalizeDateRange(startDate, endDate);
      const { siteName } = req.query;
      const activeDates = getActiveDates(db, range.startDate, range.endDate, siteName);
      console.log(`[Active Dates API] Range: ${range.startDate} ~ ${range.endDate}, Site: ${siteName || 'ALL'}, Found: ${activeDates.length}`);
      if (activeDates.length > 0) {
          console.log(`[Active Dates API] Sample dates: ${activeDates.slice(0, 5).join(', ')}${activeDates.length > 5 ? '...' : ''}`);
      }
      return res.json({ success: true, activeDates });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  });

  router.get('/api/logs/preview-manifest', async (req, res) => {
    const { startDate, endDate, date, templateName } = req.query;

    const templateInfo = resolveReportTemplatePath(baseDir, appDataPath, templateName, { excelOnly: true });
    if (!templateInfo?.absolutePath || !fs.existsSync(templateInfo.absolutePath)) {
      return res.status(404).json(buildMissingTemplateResponse(templateName));
    }

    try {
      const { siteName } = req.query;
      const range = normalizeDateRange(startDate || date, endDate || date || startDate);
      const manifest = buildPreviewManifest(db, range.startDate, range.endDate, siteName);

      return res.json({ success: true, ...manifest });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  });

  router.get('/api/logs/preview-pdf', async (req, res) => {
    const { date, startDate, endDate, pageKey, templateName, download } = req.query;
    const templateInfo = resolveReportTemplatePath(baseDir, appDataPath, templateName, { excelOnly: true });

    if (!templateInfo?.absolutePath || !fs.existsSync(templateInfo.absolutePath)) {
      return res.status(404).json(buildMissingTemplateResponse(templateName));
    }

    try {
      const { siteName } = req.query;
      const range = normalizeDateRange(startDate || date, endDate || date || startDate);
      const manifest = buildPreviewManifest(db, range.startDate, range.endDate, siteName);
      const targetPage = findPageInManifest(manifest, pageKey);

      if (!targetPage) {
        return res.status(404).json({ error: 'Preview page not found' });
      }

      const { pdfPath } = await buildPagePreviewPdf({
        db,
        baseDir,
        appDataPath,
        templateInfo,
        page: targetPage,
        siteName,
      });

      const outputFileName = `${path.parse(templateInfo.fileName).name}-${targetPage.date}-${targetPage.pageNumberForDate}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `${download === '1' ? 'attachment' : 'inline'}; filename="preview.pdf"; filename*=UTF-8''${encodeURIComponent(outputFileName)}`
      );
      res.setHeader('Cache-Control', 'private, max-age=3600');

      return res.sendFile(pdfPath);
    } catch (err) {
      console.error('[Excel Preview PDF Error]', err.message);
      return res.status(500).json({ error: `Excel PDF 미리보기 생성에 실패했습니다: ${err.message}` });
    }
  });

  router.get('/api/logs/preview-page-data', async (req, res) => {
    const { date, startDate, endDate, pageKey, templateName } = req.query;
    const templateInfo = resolveReportTemplatePath(baseDir, appDataPath, templateName, { excelOnly: true });

    if (!templateInfo?.absolutePath || !fs.existsSync(templateInfo.absolutePath)) {
      return res.status(404).json(buildMissingTemplateResponse(templateName));
    }

    try {
      const { siteName } = req.query;
      const range = normalizeDateRange(startDate || date, endDate || date || startDate);
      const manifest = buildPreviewManifest(db, range.startDate, range.endDate, siteName);
      const targetPage = findPageInManifest(manifest, pageKey);

      if (!targetPage) {
        return res.status(404).json({ error: 'Preview page not found' });
      }

      const renderData = buildPageRenderData({ db, baseDir, page: targetPage, siteName });
      const photoUrls = Object.fromEntries(
        Object.entries(renderData.selectedPhotos || {})
          .filter(([, photoPath]) => Boolean(photoPath))
          .map(([analyteKey]) => [
            analyteKey,
            `${req.protocol}://${req.get('host')}/api/logs/preview-photo?startDate=${encodeURIComponent(range.startDate)}&endDate=${encodeURIComponent(range.endDate)}&pageKey=${encodeURIComponent(targetPage.pageKey)}&templateName=${encodeURIComponent(templateInfo.fileName)}&analyte=${encodeURIComponent(analyteKey)}${siteName ? `&siteName=${encodeURIComponent(siteName)}` : ''}`,
          ])
      );

      return res.json({
        success: true,
        page: {
          ...renderData,
          photoUrls,
          selectedPhotos: undefined,
        },
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/api/logs/preview-photo', async (req, res) => {
    const { date, startDate, endDate, pageKey, templateName, analyte } = req.query;
    const analyteKey = String(analyte || '').trim();
    const templateInfo = resolveReportTemplatePath(baseDir, appDataPath, templateName, { excelOnly: true });

    if (!templateInfo?.absolutePath || !fs.existsSync(templateInfo.absolutePath)) {
      return res.status(404).json(buildMissingTemplateResponse(templateName));
    }

    if (!analyteKey) {
      return res.status(400).json({ error: 'analyte is required' });
    }

    try {
      const { siteName } = req.query;
      const range = normalizeDateRange(startDate || date, endDate || date || startDate);
      const manifest = buildPreviewManifest(db, range.startDate, range.endDate, siteName);
      const parsedPageKey = pageKey ? parsePageKey(pageKey) : null;
      const targetPage = findPageInManifest(manifest, pageKey || (parsedPageKey ? pageKey : ''));

      if (!targetPage) {
        return res.status(404).json({ error: 'Preview page not found' });
      }

      const renderData = buildPageRenderData({ db, baseDir, page: targetPage, siteName });
      const photoPath = renderData.selectedPhotos?.[analyteKey];

      if (!photoPath || !fs.existsSync(photoPath)) {
        return res.status(404).json({ error: 'Preview photo not found' });
      }

      res.setHeader('Cache-Control', 'private, max-age=3600');
      return res.sendFile(photoPath);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  router.get('/api/logs/batch-pdf', async (req, res) => {
    const { date, startDate, endDate, templateName, download } = req.query;
    const templateInfo = resolveReportTemplatePath(baseDir, appDataPath, templateName, { excelOnly: true });

    if (!templateInfo?.absolutePath || !fs.existsSync(templateInfo.absolutePath)) {
      return res.status(404).json(buildMissingTemplateResponse(templateName));
    }

    try {
      const { siteName } = req.query;
      const range = normalizeDateRange(startDate || date, endDate || date || startDate);
      const manifest = buildPreviewManifest(db, range.startDate, range.endDate, siteName);
      const pdfPath = await buildBatchPreviewPdf({
        db,
        baseDir,
        appDataPath,
        templateInfo,
        manifest,
        siteName,
      });
      const outputFileName = `${path.parse(templateInfo.fileName).name}-${range.startDate}-${range.endDate}.pdf`;

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `${download === '1' ? 'attachment' : 'inline'}; filename="report.pdf"; filename*=UTF-8''${encodeURIComponent(outputFileName)}`
      );
      res.setHeader('Cache-Control', 'private, max-age=3600');

      return res.sendFile(pdfPath);
    } catch (err) {
      console.error('[Excel Batch PDF Error]', err.message);
      return res.status(500).json({ error: `기간 PDF 생성에 실패했습니다: ${err.message}` });
    }
  });

  router.get('/api/logs/export', async (req, res) => {
    const { date, startDate, endDate, templateName } = req.query;
    const templateInfo = resolveReportTemplatePath(baseDir, appDataPath, templateName, { excelOnly: true });

    if (!templateInfo?.absolutePath || !fs.existsSync(templateInfo.absolutePath)) {
      return res.status(404).json(buildMissingTemplateResponse(templateName));
    }

    try {
      const { siteName } = req.query;
      const range = normalizeDateRange(startDate || date, endDate || date || startDate);
      console.log(`[Excel Export] Request Range: ${range.startDate} ~ ${range.endDate}, Site: ${siteName || 'ALL'}`);
      const manifest = buildPreviewManifest(db, range.startDate, range.endDate, siteName);
      console.log(`[Excel Export] Manifest generated. Total Sheets: ${manifest.pages.length}`);
      if (manifest.pages.length > 0) {
          const distinctDates = [...new Set(manifest.pages.map(p => p.date))];
          console.log(`[Excel Export] Manifest Dates: ${distinctDates.join(', ')}`);
      }
      
      if (!manifest.pages.length) {
          return res.status(400).json({ error: '선택한 기간에 수질분석 데이터가 없습니다.' });
      }

      const outputPaths = await buildBatchExportExcel({
        db,
        baseDir,
        appDataPath,
        templateInfo,
        manifest,
        siteName,
      });

      // 생성된 각 파일을 시스템 기본 프로그램(Excel)으로 열기
      const { openExcelFile } = require('../services/excelOpenService.cjs');
      for (const filePath of outputPaths) {
        await openExcelFile(filePath);
      }

      return res.json({ 
        success: true, 
        message: `${outputPaths.length}개의 엑셀 파일을 열었습니다.`,
        files: outputPaths.map(p => path.basename(p)),
      });
    } catch (err) {
      console.error('[Excel Batch Export Error]', err.message);
      return res.status(500).json({ error: `내보내기에 실패했습니다: ${err.message}` });
    }
  });

  router.get('/api/logs/generate-excel', async (req, res) => {
    const { date, templateName } = req.query;
    const mappingPath = path.join(baseDir, 'templates', 'mapping.json');
    const templateInfo = resolveReportTemplatePath(baseDir, appDataPath, templateName, { excelOnly: true });

    if (!templateInfo?.absolutePath || !fs.existsSync(templateInfo.absolutePath)) {
      return res.status(404).json(buildMissingTemplateResponse(templateName));
    }

    try {
      const mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(templateInfo.absolutePath);
      const worksheet = workbook.worksheets[0];

      const flows = db.prepare('SELECT * FROM flow_readings WHERE date = ?').all(date);
      const medicines = db.prepare('SELECT * FROM medicine_logs WHERE date = ?').all(date);

      const getDataValue = (fieldName) => {
        if (fieldName === 'date') return date;
        const flowMatch = fieldName.match(/^flow_(\w+)_(\w+)$/);
        if (flowMatch) {
          const [, type, valType] = flowMatch;
          const r = flows.find(f => f.type === type);
          return r ? (valType === 'raw' ? r.raw_value : r.calculated_flow) : '';
        }
        const medMatch = fieldName.match(/^medicine_(\w+)_(\w+)$/);
        if (medMatch) {
          const [, name, valType] = medMatch;
          const m = medicines.find(med => med.medicine_name.includes(name));
          return m ? m[valType === 'usage' ? 'usage_amount' : 'purchase_amount'] : '';
        }
        return '';
      };

      const excelMapping = mapping.excel || {};
      for (const [cellAddr, config] of Object.entries(excelMapping)) {
        const field = typeof config === 'string' ? config : config.field;
        const type = typeof config === 'string' ? 'text' : config.type;
        if (type === 'text' || type === 'number') {
          worksheet.getCell(cellAddr).value = getDataValue(field);
        } else if (type === 'image') {
          const imagePath = path.join(baseDir, 'resources', 'images', date, `${field}.jpg`);
          if (fs.existsSync(imagePath)) {
            const imgId = workbook.addImage({ filename: imagePath, extension: 'jpeg' });
            worksheet.addImage(imgId, {
              tl: { col: worksheet.getCell(cellAddr).col - 1, row: worksheet.getCell(cellAddr).row - 1 },
              ext: { width: config.width || 200, height: config.height || 150 }
            });
          }
        }
      }

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=Log_${date}.xlsx`);
      await workbook.xlsx.write(res);
      res.end();
    } catch (err) {
      res.status(500).json({ error: 'Excel generation failed: ' + err.message });
    }
  });

  router.post('/api/logs/import-water-quality-excel', upload.single('file'), async (req, res) => {
    try {
      if (!req.file || !req.file.buffer) {
        return res.status(400).json({ success: false, message: '업로드된 파일이 없습니다.' });
      }

      const bq = getBigQueryClient();
      if (!bq) {
        return res.status(500).json({ success: false, message: 'BigQuery 연결에 실패했습니다.' });
      }

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(req.file.buffer);

      const worksheet = workbook.worksheets[0];
      if (!worksheet) {
        return res.status(400).json({ success: false, message: '엑셀 파일에 시트가 존재하지 않습니다.' });
      }

      let headerRow = null;
      worksheet.eachRow((row, rowNumber) => {
        if (!headerRow && row.values.some(v => v !== null && v !== undefined && v !== '')) {
          headerRow = row;
        }
      });

      if (!headerRow) {
        return res.status(400).json({ success: false, message: '엑셀 파일에서 헤더 정보를 찾을 수 없습니다.' });
      }

      const headers = [];
      headerRow.eachCell((cell, colNumber) => {
        headers[colNumber] = String(cell.value || '').trim().toLowerCase();
      });

      const colIndex = {
        date: headers.findIndex(h => h && (h.includes('날짜') || h.includes('일자') || h.includes('date') || h.includes('채수') || h.includes('기간'))),
        site: headers.findIndex(h => h && (h.includes('현장') || h.includes('시료') || h.includes('site') || h.includes('지점') || h.includes('명'))),
        bod: headers.findIndex(h => h && (h === 'bod' || h.includes('생물화학'))),
        ss: headers.findIndex(h => h && (h === 'ss' || h.includes('부유물질'))),
        tn: headers.findIndex(h => h && (h === 'tn' || h === 't-n' || h.includes('총질소'))),
        tp: headers.findIndex(h => h && (h === 'tp' || h === 't-p' || h.includes('총인'))),
        total_coliform: headers.findIndex(h => h && (h.includes('대장균') || h === 'coliform')),
        mlss: headers.findIndex(h => h && (h === 'mlss')),
        do: headers.findIndex(h => h && (h === 'do' || h.includes('용존산소'))),
        ph: headers.findIndex(h => h && (h === 'ph' || h.includes('수소이온'))),
      };

      if (colIndex.date === -1 || colIndex.site === -1) {
        return res.status(400).json({
          success: false,
          message: '날짜 및 현장명(시료명) 컬럼이 필요합니다. 헤더 컬럼명을 확인해 주세요.'
        });
      }

      const parsedRows = [];
      const errors = [];

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === headerRow.number) return;

        const getVal = (idx) => {
          if (idx === -1 || idx === undefined || idx === null) return null;
          const cell = row.getCell(idx);
          if (!cell) return null;
          let val = cell.value;
          if (val && typeof val === 'object' && val.result !== undefined) {
            val = val.result;
          }
          return val;
        };

        const rawDate = getVal(colIndex.date);
        const rawSite = getVal(colIndex.site);

        if (!rawDate || !rawSite) return;

        let dateStr = String(rawDate).trim();
        if (rawDate instanceof Date) {
          dateStr = rawDate.toISOString().split('T')[0];
        } else {
          const m = dateStr.match(/(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/);
          if (m) {
            dateStr = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
          } else {
            errors.push(`Row ${rowNumber}: 날짜 포맷이 올바르지 않습니다. (${rawDate})`);
            return;
          }
        }

        const cleanSite = String(rawSite).trim().replace(/\s*(포기조|폭기조)\s*$/, '');

        const toNum = (val) => {
          if (val === null || val === undefined || val === '') return null;
          const parsed = Number(String(val).replace(/,/g, '').trim());
          return Number.isFinite(parsed) ? parsed : null;
        };

        const record = {
          report_date: dateStr,
          site_name: cleanSite,
          ss: toNum(getVal(colIndex.ss)),
          bod: toNum(getVal(colIndex.bod)),
          tn: toNum(getVal(colIndex.tn)),
          tp: toNum(getVal(colIndex.tp)),
          total_coliform: toNum(getVal(colIndex.total_coliform)),
          mlss: toNum(getVal(colIndex.mlss)),
          do: toNum(getVal(colIndex.do)),
          ph: toNum(getVal(colIndex.ph)),
        };

        parsedRows.push(record);
      });

      if (parsedRows.length === 0) {
        return res.status(400).json({
          success: false,
          message: '파싱 성공한 행이 없습니다. 엑셀 데이터를 확인해 주세요.',
          errors
        });
      }

      const dataset = bq.dataset(DATASET_ID);
      const table = dataset.table('water_quality');
      const [tableMetadata] = await table.getMetadata();
      const fields = new Set((tableMetadata.schema?.fields || []).map((field) => String(field.name || '')));

      let successCount = 0;
      const nowIso = new Date().toISOString().replace('T', ' ').replace('Z', ' UTC');

      for (const row of parsedRows) {
        try {
          const rowId = require('crypto').randomUUID();
          const category = row.mlss != null && row.bod === null ? 'mlss' : '성적서';

          await bq.query({
            query: `
              MERGE \`${DATASET_ID}.water_quality\` T
              USING (
                SELECT
                  @id AS id,
                  @uploadedAt AS uploaded_at,
                  @reportDate AS report_date,
                  @category AS category,
                  @siteName AS site_name,
                  @ss AS ss,
                  @bod AS bod,
                  @tn AS tn,
                  @tp AS tp,
                  @totalColiform AS total_coliform,
                  @mlss AS mlss,
                  @do AS do_val,
                  @ph AS ph
              ) S
              ON T.report_date = S.report_date AND T.site_name = S.site_name
              WHEN MATCHED THEN
                UPDATE SET
                  uploaded_at = S.uploaded_at,
                  category = S.category,
                  ss = COALESCE(S.ss, T.ss),
                  bod = COALESCE(S.bod, T.bod),
                  tn = COALESCE(S.tn, T.tn),
                  tp = COALESCE(S.tp, T.tp),
                  total_coliform = COALESCE(S.total_coliform, T.total_coliform),
                  mlss = COALESCE(S.mlss, T.mlss),
                  ${fields.has('do') ? '`do` = COALESCE(S.do_val, T.`do`),' : ''}
                  ph = COALESCE(S.ph, T.ph)
              WHEN NOT MATCHED THEN
                INSERT (id, uploaded_at, report_date, category, site_name, ss, bod, tn, tp, total_coliform, mlss, ${fields.has('do') ? '`do`,' : ''} ph)
                VALUES (S.id, S.uploaded_at, S.report_date, S.category, S.site_name, S.ss, S.bod, S.tn, S.tp, S.total_coliform, S.mlss, ${fields.has('do') ? 'S.do_val,' : ''} S.ph)
            `,
            params: {
              id: rowId,
              uploadedAt: nowIso,
              reportDate: row.report_date,
              category,
              siteName: row.site_name,
              ss: row.ss,
              bod: row.bod,
              tn: row.tn,
              tp: row.tp,
              totalColiform: row.total_coliform,
              mlss: row.mlss,
              do_val: row.do,
              ph: row.ph,
            },
            types: {
              id: 'STRING',
              uploadedAt: 'TIMESTAMP',
              reportDate: 'DATE',
              category: 'STRING',
              siteName: 'STRING',
              ss: 'FLOAT64',
              bod: 'FLOAT64',
              tn: 'FLOAT64',
              tp: 'FLOAT64',
              totalColiform: 'INT64',
              mlss: 'FLOAT64',
              do_val: 'FLOAT64',
              ph: 'FLOAT64',
            }
          });

          successCount++;
        } catch (rowErr) {
          console.error(`[BigQuery Merge Error] Date: ${row.report_date}, Site: ${row.site_name}`, rowErr.message);
          errors.push(`Date: ${row.report_date}, Site: ${row.site_name} 저장 실패: ${rowErr.message}`);
        }
      }

      return res.json({
        success: true,
        totalRows: parsedRows.length,
        successCount,
        failedCount: parsedRows.length - successCount,
        errors
      });
    } catch (err) {
      console.error('[Excel Upload API Error]', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  return router;
};

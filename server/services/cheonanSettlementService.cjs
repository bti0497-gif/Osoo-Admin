'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const JSZip = require('jszip');
const { getBigQueryClient, DATASET_ID } = require('./bigQueryClientService.cjs');

/**
 * JS Date를 엑셀 시리얼 넘버로 변환 (1900 date system)
 */
function dateToExcelSerial(year, month, day = 1) {
  const date = new Date(Date.UTC(year, month - 1, day));
  const epoch = new Date(Date.UTC(1899, 11, 30));
  return Math.round((date.getTime() - epoch.getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * 신규 현장관리자 앱 사진 파일명 패턴에서 반출시각 추출
 * 패턴: YYYY-MM-DD_HHmmss_현장명_슬러지반출*.jpg (예: 2026-09-09_083542_동명휴게소(춘천방향)_슬러지반출.jpg)
 */
function extractTimeFromPhotoFileName(fileName) {
  if (!fileName) return null;
  const m = fileName.match(/(?:\d{4}-?\d{2}-?\d{2})_(\d{2})(\d{2})(?:\d{2})?_/);
  if (m) {
    const hh = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
      return {
        timeStr: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`,
        timeSerial: (hh * 3600 + mm * 60) / 86400,
      };
    }
  }
  return null;
}

/**
 * JPEG/PNG EXIF에서 촬영 시각 추출
 */
function extractExifDateTime(buf) {
  function isDigit(b) { return b >= 0x30 && b <= 0x39; }
  try {
    for (let i = 0; i < buf.length - 19; i++) {
      if (
        isDigit(buf[i])    && isDigit(buf[i+1])  && isDigit(buf[i+2])  && isDigit(buf[i+3])  &&
        buf[i+4]  === 0x3A &&
        isDigit(buf[i+5])  && isDigit(buf[i+6])  &&
        buf[i+7]  === 0x3A &&
        isDigit(buf[i+8])  && isDigit(buf[i+9])  &&
        buf[i+10] === 0x20 &&
        isDigit(buf[i+11]) && isDigit(buf[i+12]) &&
        buf[i+13] === 0x3A &&
        isDigit(buf[i+14]) && isDigit(buf[i+15]) &&
        buf[i+16] === 0x3A &&
        isDigit(buf[i+17]) && isDigit(buf[i+18])
      ) {
        const year = parseInt(buf.slice(i, i+4).toString('ascii'), 10);
        if (year < 2000 || year > 2099) continue;
        const hr  = parseInt(buf.slice(i+11, i+13).toString('ascii'), 10);
        const mn  = parseInt(buf.slice(i+14, i+16).toString('ascii'), 10);
        if (hr >= 0 && hr <= 23 && mn >= 0 && mn <= 59) {
          return {
            timeStr: `${String(hr).padStart(2, '0')}:${String(mn).padStart(2, '0')}`,
            timeSerial: (hr * 3600 + mn * 60) / 86400,
          };
        }
      }
    }
  } catch (_) {}
  return null;
}

/**
 * 데스크탑 및 OneDrive 경로 목록 조회
 */
function getDesktopDirectories() {
  const userHome = os.homedir();
  const dirs = [
    path.join(userHome, 'OneDrive', '바탕 화면'),
    path.join(userHome, 'OneDrive', 'Desktop'),
    path.join(userHome, '바탕 화면'),
    path.join(userHome, 'Desktop'),
  ];
  return dirs.filter(d => fs.existsSync(d));
}

/**
 * 천안휴게소(부산방향) 엑셀 정산서 자동 생성 메인 서비스
 */
async function generateCheonanBusanExcelReport({
  year = new Date().getFullYear(),
  month = new Date().getMonth() + 1,
  outputPath = null,
} = {}) {
  const targetYm = `${year}${String(month).padStart(2, '0')}`;
  const desktopDirs = getDesktopDirectories();

  // 1. 템플릿 파일 탐색 (우선순위: 바탕화면 정산양식 최신본 -> 앱 번들 템플릿)
  const templateCandidates = [
    ...desktopDirs.map(d => path.join(d, '정산양식', `2026년 8월 천안(부산)휴게소 오수정화조 정산내역.xlsx`)),
    ...desktopDirs.map(d => path.join(d, '정산양식', `${year}년 ${month}월 천안(부산)휴게소 오수정화조 정산내역.xlsx`)),
    ...desktopDirs.map(d => path.join(d, '정산양식', `천안(부산)_정산양식.xlsx`)),
    path.join(__dirname, '../templates/settlement/template_cheonan_busan.xlsx'),
  ];

  let templatePath = null;
  for (const cand of templateCandidates) {
    if (fs.existsSync(cand)) {
      templatePath = cand;
      break;
    }
  }

  if (!templatePath) {
    throw new Error('천안휴게소(부산방향) 정산 엑셀 양식 파일을 찾을 수 없습니다.');
  }

  // 2. 최종 저장 경로 결정 (OneDrive 바탕 화면 > 월정산 > 천안마감자료 > YYYYMM)
  const defaultOutputDir = desktopDirs.length > 0
    ? path.join(desktopDirs[0], '월정산', '천안마감자료', targetYm)
    : path.join(os.homedir(), '바탕 화면', '월정산', '천안마감자료', targetYm);

  if (!fs.existsSync(defaultOutputDir)) {
    fs.mkdirSync(defaultOutputDir, { recursive: true });
  }

  const finalFileName = `${year}년 ${month}월 천안(부산)휴게소 오수정화조 정산내역.xlsx`;
  const finalFilePath = outputPath || path.join(defaultOutputDir, finalFileName);

  // 3. BigQuery 슬러지 반출일 조회
  const bq = getBigQueryClient();
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

  const query = `
    SELECT date, type, raw_value, calculated_flow, sludge_export, created_at
    FROM \`${DATASET_ID}.flow_readings\`
    WHERE date >= @startDate AND date < @endDate
      AND (site_id = 'd439fe52-84c9-4015-bc85-f0100fbf953a' OR site_name LIKE '%천안%')
      AND type = '슬러지'
    ORDER BY date
  `;

  // 슬러지 사진 파일 후보 탐색
  const sludgePhotoDirs = [
    ...desktopDirs.map(d => path.join(d, '월정산', '천안마감자료', targetYm, '2_슬러지사진')),
    ...desktopDirs.map(d => path.join(d, '월정산', '천안마감자료', targetYm)),
    ...desktopDirs.map(d => path.join(d, '월정산', '천안(부산)', targetYm)),
    ...desktopDirs.map(d => path.join(d, '점검준비', '정산서', targetYm)),
  ];

  const localSludgePhotos = [];
  sludgePhotoDirs.forEach(dir => {
    if (fs.existsSync(dir)) {
      try {
        fs.readdirSync(dir).forEach(f => {
          if (f.includes('슬러지') && /\.(jpg|jpeg|png)$/i.test(f)) {
            localSludgePhotos.push(path.join(dir, f));
          }
        });
      } catch (_) {}
    }
  });

  let sludgeMap = new Map();
  try {
    const [sludgeRows] = await bq.query({ query, params: { startDate, endDate } });
    sludgeRows.forEach(r => {
      const rawDate = r.date?.value || r.date;
      const exportAmt = r.sludge_export != null ? Number(r.sludge_export) : (r.raw_value != null ? Number(r.raw_value) : 0);
      if (exportAmt > 0) {
        const d = new Date(rawDate);
        const dayNum = d.getDate();

        // 반출시간 결정:
        // 1) 신규 현장앱 사진 파일명(YYYY-MM-DD_HHmmss_...) 또는 EXIF 메타데이터에서 실제 촬영시각 추출
        // 2) 이전 버전이거나 시각이 없으면 공란(null) 유지
        let timeStr = '';
        let timeSerial = null;

        const matchedPhoto = localSludgePhotos.find(p => {
          const fn = path.basename(p);
          return fn.includes(rawDate) || fn.includes(rawDate.replace(/-/g, ''));
        });

        if (matchedPhoto) {
          const fn = path.basename(matchedPhoto);
          const parsed = extractTimeFromPhotoFileName(fn);
          if (parsed) {
            timeStr = parsed.timeStr;
            timeSerial = parsed.timeSerial;
          } else {
            try {
              const buf = fs.readFileSync(matchedPhoto);
              const exifParsed = extractExifDateTime(buf);
              if (exifParsed) {
                timeStr = exifParsed.timeStr;
                timeSerial = exifParsed.timeSerial;
              }
            } catch (_) {}
          }
        }

        sludgeMap.set(dayNum, {
          date: rawDate,
          dayNum,
          weight: exportAmt,
          vendor: '정화회',
          timeStr,
          timeSerial,
        });
      }
    });
  } catch (bqErr) {
    console.warn('[cheonanSettlementService] BigQuery 슬러지 데이터 조회 실패:', bqErr.message);
  }

  // 4. 증빙 이미지(용역비, 슬러지) 파일 탐색
  const invoiceCandidates = [];
  for (const d of desktopDirs) {
    const invoiceDir = path.join(d, '점검준비', '계산서', targetYm);
    if (fs.existsSync(invoiceDir)) {
      try {
        const files = fs.readdirSync(invoiceDir);
        for (const f of files) {
          invoiceCandidates.push(path.join(invoiceDir, f));
        }
      } catch (_) {}
    }
  }

  // 용역비: '매출계산서' 최우선 매칭
  const yongyeokList = invoiceCandidates.filter(p => {
    const name = path.basename(p);
    return name.includes('천안') && (name.includes('부산') || name.includes('호두')) && (name.includes('용역비') || name.includes('용역'));
  });
  const yongyeokImgPath = yongyeokList.find(p => path.basename(p).includes('매출')) || yongyeokList[0] || null;

  // 슬러지: '매출계산서' 최우선 매칭 (정화회/슬러지)
  const sludgeList = invoiceCandidates.filter(p => {
    const name = path.basename(p);
    return name.includes('천안') && (name.includes('부산') || name.includes('호두')) && (name.includes('슬러지') || name.includes('정화회'));
  });
  const sludgeImgPath = sludgeList.find(p => path.basename(p).includes('매출')) || sludgeList[0] || null;

  // 5. OpenXML(ZIP) 로드 및 직접 조작
  const templateBuf = fs.readFileSync(templatePath);
  const zip = await JSZip.loadAsync(templateBuf);

  // 규격: 너비 18.94cm, 높이 9.86cm (1cm = 360,000 EMU)
  const widthEmu = 6818400;  // 18.94 * 360000
  const heightEmu = 3549600; // 9.86 * 360000

  // 이미지 교체
  if (yongyeokImgPath && fs.existsSync(yongyeokImgPath)) {
    zip.file('xl/media/image1.jpg', fs.readFileSync(yongyeokImgPath));
  }
  if (sludgeImgPath && fs.existsSync(sludgeImgPath)) {
    zip.file('xl/media/image2.png', fs.readFileSync(sludgeImgPath));
  }

  // drawing2.xml 내 규격 (18.94cm x 9.86cm) 확인 및 적용
  if (zip.files['xl/drawings/drawing2.xml']) {
    let drawing2Xml = await zip.files['xl/drawings/drawing2.xml'].async('string');
    drawing2Xml = drawing2Xml.replace(
      /(<xdr:pic>.*?<xdr:cNvPr[^>]*name="그림 3".*?<a:xfrm><a:off[^>]*\/>)<a:ext[^>]*\/>/s,
      `$1<a:ext cx="${widthEmu}" cy="${heightEmu}"/>`
    );
    drawing2Xml = drawing2Xml.replace(
      /(<xdr:pic>.*?<xdr:cNvPr[^>]*name="그림 4".*?<a:xfrm><a:off[^>]*\/>)<a:ext[^>]*\/>/s,
      `$1<a:ext cx="${widthEmu}" cy="${heightEmu}"/>`
    );
    zip.file('xl/drawings/drawing2.xml', drawing2Xml);
  }

  // workbook.xml 시트 탭 이름 변경
  if (zip.files['xl/workbook.xml']) {
    let wbXml = await zip.files['xl/workbook.xml'].async('string');
    wbXml = wbXml.replace(/name="[0-9]+월\(증빙현황\)"/, `name="${month}월(증빙현황)"`);
    wbXml = wbXml.replace(/name="슬러지반출관리대장\([0-9]+월\)"/, `name="슬러지반출관리대장(${month}월)"`);
    zip.file('xl/workbook.xml', wbXml);
  }

  // sharedStrings.xml 시트 제목들 갱신
  if (zip.files['xl/sharedStrings.xml']) {
    let ssXml = await zip.files['xl/sharedStrings.xml'].async('string');
    ssXml = ssXml.replace(/\[\d+월\]\s*천안호두\(부산방향\)휴게소\s*오수처리비\s*정산/g, `[${month}월] 천안호두(부산방향)휴게소 오수처리비 정산`);
    ssXml = ssXml.replace(/\d+월\s*증빙현황\[천안호두\(부산\)휴게소\]/g, `${month}월 증빙현황[천안호두(부산)휴게소]`);
    ssXml = ssXml.replace(/\d{4}년\s*\d+월\s*슬러지반출\s*관리대장/g, `${year}년 ${month}월 슬러지반출 관리대장`);
    zip.file('xl/sharedStrings.xml', ssXml);
  }

  // sheet3.xml 슬러지 데이터 갱신 (공유수식 없이 순수 날짜/순번/슬러지 값 직접 기입)
  if (zip.files['xl/worksheets/sheet3.xml']) {
    let sheet3Xml = await zip.files['xl/worksheets/sheet3.xml'].async('string');
    const startSerial = dateToExcelSerial(year, month, 1);
    const daysInMonth = new Date(year, month, 0).getDate(); // 해당 월의 실제 마지막 일수 (28/29/30/31)

    // Row 4부터 34까지 (최대 31일) 행 갱신
    for (let day = 1; day <= 31; day++) {
      const rowNum = 3 + day;
      const rowPattern = new RegExp(`(<row r="${rowNum}"[^>]*>)(.*?)(<\/row>)`, 's');
      const rowMatch = sheet3Xml.match(rowPattern);
      if (rowMatch) {
        const rowOpen = rowMatch[1];
        const rowClose = rowMatch[3];

        if (day <= daysInMonth) {
          const serial = startSerial + day - 1;
          const evt = sludgeMap.get(day);

          const cellA = `<c r="A${rowNum}" s="19"><v>${day}</v></c>`;
          const cellB = `<c r="B${rowNum}" s="34"><v>${serial}</v></c>`;
          const cellC = evt ? `<c r="C${rowNum}" s="19" t="inlineStr"><is><t>${evt.vendor}</t></is></c>` : `<c r="C${rowNum}" s="19"/>`;
          const cellD = (evt && evt.timeSerial != null) ? `<c r="D${rowNum}" s="35"><v>${evt.timeSerial}</v></c>` : `<c r="D${rowNum}" s="35"/>`;
          const cellE = evt ? `<c r="E${rowNum}" s="19"><v>${evt.weight}</v></c>` : `<c r="E${rowNum}" s="19"/>`;
          const cellF = `<c r="F${rowNum}" s="19"/>`;

          sheet3Xml = sheet3Xml.replace(rowPattern, `${rowOpen}${cellA}${cellB}${cellC}${cellD}${cellE}${cellF}${rowClose}`);
        } else {
          // 해당 월에 존재하지 않는 일자 (예: 9월 31일, 2월 29~31일)는 빈 행으로 유지
          const cellA = `<c r="A${rowNum}" s="19"/>`;
          const cellB = `<c r="B${rowNum}" s="34"/>`;
          const cellC = `<c r="C${rowNum}" s="19"/>`;
          const cellD = `<c r="D${rowNum}" s="19"/>`;
          const cellE = `<c r="E${rowNum}" s="19"/>`;
          const cellF = `<c r="F${rowNum}" s="19"/>`;

          sheet3Xml = sheet3Xml.replace(rowPattern, `${rowOpen}${cellA}${cellB}${cellC}${cellD}${cellE}${cellF}${rowClose}`);
        }
      }
    }

    zip.file('xl/worksheets/sheet3.xml', sheet3Xml);
  }

  // 6. 파일 생성 및 쓰기
  const finalBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  fs.writeFileSync(finalFilePath, finalBuf);

  return {
    success: true,
    filePath: finalFilePath,
    fileName: finalFileName,
    targetYm,
    sludgeCount: sludgeMap.size,
    hasYongyeokImg: !!yongyeokImgPath,
    hasSludgeImg: !!sludgeImgPath,
  };
}

module.exports = {
  generateCheonanBusanExcelReport,
};

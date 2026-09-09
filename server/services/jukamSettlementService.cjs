'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');
const sharp = require('sharp');

const { getMonthlyReportData, transformToReportData } = require('./monthlyReportService.cjs');

// 죽암휴게소(부산방향) 구글 시트 / BigQuery 표준 현장 ID
const JUKAM_BUSAN_SITE_ID = 'fdd44211-5162-4494-838d-fb5f5d6bed69';

/**
 * 윈도우 바탕화면 디렉토리 목록 조회 (OneDrive 및 로컬)
 */
function getDesktopDirectories() {
  const home = os.homedir();
  const dirs = [
    path.join(home, 'OneDrive', '바탕 화면'),
    path.join(home, 'OneDrive', 'Desktop'),
    path.join(home, '바탕 화면'),
    path.join(home, 'Desktop'),
  ];
  return dirs.filter(d => fs.existsSync(d));
}

/**
 * 문자열을 PowerShell 이스케이프 문자열로 변환
 */
function toPowerShellLiteral(str) {
  if (typeof str !== 'string') return "''";
  return "'" + str.replace(/'/g, "''") + "'";
}

/**
 * cm 단위를 Excel Point 단위로 변환 (1cm = 28.3464567 pt)
 */
const CM_TO_PT = 28.3464567;

/**
 * 약품 사진 3장(포도당, 중탄산, PAC)을 각각 너비 5.89cm, 높이 2.6cm로 리사이즈하여
 * 세로로 이어붙인 단일 합성 JPG 파일(높이 7.8cm, 너비 5.89cm) 생성
 */
async function compositeChemicalPhotos(glucoseImg, sodaImg, pacImg, tempDir) {
  const files = [glucoseImg, sodaImg, pacImg].filter(f => f && fs.existsSync(f));
  if (files.length === 0) return null;

  try {
    // 가로 1000px 기준, 개당 세로 441px (1000 * 2.6 / 5.89 ≈ 441px) -> 총 높이 1323px
    const targetW = 1000;
    const singleH = Math.round((targetW * 2.6) / 5.89);
    const totalH = singleH * 3;

    // 만약 3장 미만일 경우 채워넣기
    while (files.length < 3) {
      files.push(files[files.length - 1]);
    }

    const resizedBuffers = await Promise.all(
      files.slice(0, 3).map(async f => {
        return await sharp(f)
          .resize(targetW, singleH, { fit: 'cover' })
          .toBuffer();
      })
    );

    const composites = resizedBuffers.map((buf, idx) => ({
      input: buf,
      top: idx * singleH,
      left: 0,
    }));

    const outPath = path.join(tempDir, `jukam_busan_chem_${Date.now()}.jpg`);
    await sharp({
      create: {
        width: targetW,
        height: totalH,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .composite(composites)
      .jpeg({ quality: 90 })
      .toFile(outPath);

    return outPath;
  } catch (err) {
    console.error('[jukamSettlementService] 약품 사진 합성 실패:', err.message);
    return null;
  }
}

/**
 * 죽암휴게소(부산방향) 엑셀 정산서 자동 생성 메인 함수
 */
async function generateJukamBusanExcelReport({
  year = new Date().getFullYear(),
  month = new Date().getMonth() + 1,
  chemicalCarryover = {}, // { glucose, soda, pac }
  chemicalInbound = {},   // { glucose, soda, pac }
  outputPath = null,
} = {}) {
  const targetYm = `${year}${String(month).padStart(2, '0')}`;
  const desktopDirs = getDesktopDirectories();

  // 1. 원본 템플릿 파일 탐색
  const templateCandidates = [
    ...desktopDirs.map(d => path.join(d, '정산양식', `2026년 8월 오수처리비 정산(죽암부산행).xls`)),
    ...desktopDirs.map(d => path.join(d, '정산양식', `오수처리비 정산(죽암부산행).xls`)),
    path.join(process.cwd(), 'server', 'templates', 'settlement', 'template_jukam_busan.xls'),
    ...desktopDirs.map(d => path.join(d, '월정산', '죽암마감자료', `2026년 8월 오수처리비 정산(죽암부산행).xls`)),
  ];

  let templatePath = null;
  for (const cand of templateCandidates) {
    if (fs.existsSync(cand)) {
      templatePath = cand;
      break;
    }
  }

  if (!templatePath) {
    throw new Error('죽암휴게소(부산방향) 정산 엑셀 양식 파일을 찾을 수 없습니다.');
  }

  // 2. 최종 저장 경로 결정 (월정산 > 죽암마감자료 > YYYYMM)
  const defaultOutputDir = desktopDirs.length > 0
    ? path.join(desktopDirs[0], '월정산', '죽암마감자료', targetYm)
    : path.join(os.homedir(), '바탕 화면', '월정산', '죽암마감자료', targetYm);

  if (!fs.existsSync(defaultOutputDir)) {
    fs.mkdirSync(defaultOutputDir, { recursive: true });
  }

  const finalReportFileName = `${year}년 ${month}월 오수처리비 정산(죽암부산행).xls`;
  const finalReportPath = outputPath || path.join(defaultOutputDir, finalReportFileName);

  // 3. 임시 작업 파일 생성
  const tempDir = os.tmpdir();
  const tempWorkingPath = path.join(tempDir, `jukam_busan_${Date.now()}_${Math.random().toString(36).substring(7)}.xls`);
  fs.copyFileSync(templatePath, tempWorkingPath);

  // 4. BigQuery에서 죽암(부산) 월간 운영 데이터 및 약품 데이터 조회
  console.log(`[jukamSettlementService] BigQuery 데이터 조회 시작: ${year}년 ${month}월 (죽암부산)`);
  let reportData = null;
  try {
    const rawData = await getMonthlyReportData(year, month, JUKAM_BUSAN_SITE_ID);
    reportData = transformToReportData(year, month, '죽암휴게소(부산방향)', rawData);
    console.log(`[jukamSettlementService] BigQuery 조회 성공: 일별 행수 ${reportData.dailyRows.length}건`);
  } catch (err) {
    console.warn('[jukamSettlementService] BigQuery 조회 실패 또는 데이터 없음, 기본값 진행:', err.message);
    const lastDay = new Date(year, month, 0).getDate();
    const rows = [];
    for (let d = 1; d <= lastDay; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      rows.push({ date: dateStr, 유입: 0, 방류: 0, 슬러지: 0, 포도당: 0, 중탄산: 0, 응집제: 0 });
    }
    reportData = {
      dailyRows: rows,
      medicine: {
        포도당: { 이월: 0, 입고: 0, 사용: 0 },
        중탄산: { 이월: 0, 입고: 0, 사용: 0 },
        응집제: { 이월: 0, 입고: 0, 사용: 0 },
      },
    };
  }

  // 약품 파라미터 오버라이드 (전달받은 파라미터가 있으면 우선, 없으면 BigQuery 집계값 사용)
  const med = reportData.medicine;
  const chemFinal = {
    glucoseCarryover: chemicalCarryover.glucose !== undefined ? Number(chemicalCarryover.glucose) : (med.포도당?.이월 ?? 180),
    glucoseInbound:   chemicalInbound.glucose !== undefined   ? Number(chemicalInbound.glucose)   : (med.포도당?.입고 ?? 1000),
    sodaCarryover:    chemicalCarryover.soda !== undefined    ? Number(chemicalCarryover.soda)    : (med.중탄산?.이월 ?? 100),
    sodaInbound:      chemicalInbound.soda !== undefined      ? Number(chemicalInbound.soda)      : (med.중탄산?.입고 ?? 300),
    pacCarryover:     chemicalCarryover.pac !== undefined     ? Number(chemicalCarryover.pac)     : (med.응집제?.이월 ?? 100),
    pacInbound:       chemicalInbound.pac !== undefined       ? Number(chemicalInbound.pac)       : (med.응집제?.입고 ?? 1000),
  };

  // 슬러지 반출일 목록 추출
  const sludgeEvents = [];
  reportData.dailyRows.forEach((r, idx) => {
    if (Number(r.슬러지) > 0) {
      const dParts = r.date.split('-');
      const m = parseInt(dParts[1], 10);
      const d = parseInt(dParts[2], 10);
      const mDotDd = `${m}.${String(d).padStart(2, '0')}`;
      sludgeEvents.push({
        dayIndex: idx + 1,
        date: r.date,
        mDotDd,
        weight: Number(r.슬러지),
      });
    }
  });

  // 5. 로컬 사진 및 증빙 파일 탐색
  const invoiceDirs = desktopDirs.map(d => path.join(d, '점검준비', '계산서', targetYm));
  const depositDirs = desktopDirs.map(d => path.join(d, '점검준비', '입금표', targetYm));
  const certDirs = desktopDirs.map(d => path.join(d, '점검준비', '성적서', targetYm));

  const settlementPhotoDirs = desktopDirs.flatMap(d => [
    path.join(d, '월정산', '죽암마감자료', targetYm),
    path.join(d, '월정산', '죽암마감자료'),
    path.join(d, '월정산', '죽암휴게소', targetYm),
    path.join(d, '월정산', '죽암(부산)', targetYm),
    path.join(d, '월정산', '죽암(부산방향)', targetYm),
    path.join(d, `죽암휴게소(부산방향)_${year}년${String(month).padStart(2, '0')}월_사진모음`),
  ]);

  // 죽암휴게소(부산방향) 전용 파일 필터 (동명, 천안 등 타 휴게소 및 서울방향 배제)
  const isJukamBusanFile = (filename) => {
    const lower = filename.toLowerCase();
    const isJukam = lower.includes('죽암');
    const isSeoul = lower.includes('서울');
    return isJukam && !isSeoul;
  };

  const findImages = (dirs, vendorKeyword = '') => {
    const list = [];
    const seen = new Set();
    const dirList = Array.isArray(dirs) ? dirs : [dirs];
    for (const d of dirList) {
      if (!d || !fs.existsSync(d)) continue;
      try {
        const files = fs.readdirSync(d);
        for (const f of files) {
          const lower = f.toLowerCase();
          const isExt = /\.(jpg|jpeg|png|bmp|webp)$/i.test(f);
          if (!isExt) continue;
          const siteMatch = isJukamBusanFile(lower);
          const vendorMatch = !vendorKeyword || lower.includes(vendorKeyword.toLowerCase());
          if (siteMatch && vendorMatch) {
            const fullPath = path.join(d, f);
            if (!seen.has(fullPath)) {
              seen.add(fullPath);
              list.push(fullPath);
            }
          }
        }
      } catch (_) {}
    }
    return list;
  };

  const sludgePhotoDirs = settlementPhotoDirs.flatMap(d => [path.join(d, '2_슬러지사진'), d]);
  const cleanCertPhotoDirs = settlementPhotoDirs.flatMap(d => [path.join(d, '3_청소필증'), d]);
  const chemPhotoDirs = settlementPhotoDirs.flatMap(d => [path.join(d, '4_약품입고'), d]);

  // 증빙 이미지 탐색
  const invMgmt = findImages(invoiceDirs, '용역비').concat(findImages(invoiceDirs, '매출계산서'));
  const invWater = findImages(invoiceDirs, '대신');
  const depWater = findImages(depositDirs, '대신');
  const invKit = findImages(invoiceDirs, '케이엠');
  const depKit = findImages(depositDirs, '케이엠');
  const invChem = findImages(invoiceDirs, '에이치');
  const depChem = findImages(depositDirs, '에이치');

  // 시험성적서 4장 (점검준비 > 성적서 > YYYYMM 폴더 우선 탐색, 총 6장 중 앞의 4장)
  let certImages = findImages(certDirs).sort();
  if (certImages.length === 0) {
    const expPhotoDirs = settlementPhotoDirs.flatMap(d => [path.join(d, '1_실험사진'), d]);
    certImages = findImages(expPhotoDirs).sort();
  }
  certImages = certImages.slice(0, 4);

  // 약품 입고 개별 사진 (포도당, 중탄산, PAC)
  const chemGlucose = findImages(chemPhotoDirs, '포도당', '부산');
  const chemSoda = findImages(chemPhotoDirs, '중탄산', '부산');
  const chemPac = findImages(chemPhotoDirs, '팩', '부산').concat(findImages(chemPhotoDirs, 'pac', '부산'));

  // 약품 3단 합성 이미지 생성
  const combinedChemPath = await compositeChemicalPhotos(
    chemGlucose[0],
    chemSoda[0],
    chemPac[0],
    tempDir
  );

  // 슬러지 필증 및 반출사진
  const cleanCerts = findImages(cleanCertPhotoDirs, '', '부산');
  const sludgePhotos = findImages(sludgePhotoDirs, '', '부산');

  // 슬러지 텍스트 라벨 결정
  const event1Date = sludgeEvents[0]?.mDotDd || `${month}.05`;
  const event2Date = sludgeEvents[1]?.mDotDd || (sludgeEvents.length > 1 ? `${month}.20` : null);

  const photoPayload = {
    salesInvoice: invMgmt[0] || null,
    waterInvoice: invWater[0] || null,
    waterDeposit: depWater[0] || null,
    kitInvoice: invKit[0] || null,
    kitDeposit: depKit[0] || null,
    chemInvoice: invChem[0] || null,
    chemDeposit: depChem[0] || null,
    certImages: certImages, // 4장
    combinedChemImage: combinedChemPath,
    cleanCert1: cleanCerts[0] || null,
    cleanCert2: cleanCerts[1] || null,
    sludgePhoto1: sludgePhotos[0] || null,
    sludgePhoto2: sludgePhotos[1] || null,
    cleanCert1Text: `슬러지 수거필증(${event1Date})`,
    sludgePhoto1Text: `슬러지 처리 사진(${event1Date})`,
    cleanCert2Text: event2Date ? `슬러지 수거필증(${event2Date})` : '',
    sludgePhoto2Text: event2Date ? `슬러지 처리 사진(${event2Date})` : '',
  };

  // 6. PowerShell Excel COM 스크립트 작성
  const logPath = path.join(tempDir, `osoo_jukam_log_${Date.now()}.txt`);
  const dataPayload = {
    year,
    month,
    dailyRows: reportData.dailyRows,
    chemicals: chemFinal,
    photos: photoPayload,
    sludgeEvents,
  };

  const psScript = `
$ErrorActionPreference = 'Continue'
$workingFile = ${toPowerShellLiteral(tempWorkingPath)}
$logFile = ${toPowerShellLiteral(logPath)}
$dataJson = ${toPowerShellLiteral(JSON.stringify(dataPayload))}

function LogMsg($m) {
  Add-Content -LiteralPath $logFile -Value "[$(Get-Date -Format 'HH:mm:ss')] $m" -Encoding utf8
  Write-Host $m
}

LogMsg "1. Starting Excel COM..."
$excel = New-Object -ComObject Excel.Application
try {
  $excel.Visible = $false
  $excel.DisplayAlerts = $false

  LogMsg "2. Opening workbook: $workingFile"
  $wb = $excel.Workbooks.Open($workingFile)
  $data = ConvertFrom-Json $dataJson
  $photos = $data.photos
  $med = $data.chemicals

  $CM_TO_PT = 28.3464567

  # -------------------------------------------------------------
  # 시트 1: 위탁계약 방식 - 연월 치환
  # -------------------------------------------------------------
  try {
    $wsContract = $wb.Sheets.Item("위탁계약 방식")
    if ($wsContract) {
      try {
        $rngTitle = $wb.Names.Item("월정산제목").RefersToRange
        if ($rngTitle) { $rngTitle.Value = "$($data.month)월 오수처리비 정산" }
      } catch {
        $wsContract.Range("R1").Value = "$($data.month)월 오수처리비 정산"
      }
      $wsContract.Range("A1").Value = "$($data.month)월 오수처리비 정산"
      LogMsg "Updated '위탁계약 방식' sheet title to $($data.month)월"
    }
  } catch {
    LogMsg "Error updating 위탁계약 방식: $($_.Exception.Message)"
  }

  # -------------------------------------------------------------
  # 시트 2: 증빙 - 정의된 이름을 사용한 정밀 규격 바인딩
  # -------------------------------------------------------------
  try {
    $wsProof = $wb.Sheets.Item("증빙")
    if ($wsProof) {
      # 타이틀 갱신
      try {
        $rngProofTitle = $wb.Names.Item("월증빙제목").RefersToRange
        if ($rngProofTitle) { $rngProofTitle.Value = "$($data.month)월  증빙" }
      } catch {
        $wsProof.Range("A1").Value = "$($data.month)월  증빙"
      }

      # 이미지 삽입 헬퍼 함수 (병합 셀 MergeArea 기준 정밀 중앙 정렬)
      function InsertImageToRange($picPath, $rng, $wPt, $hPt, $alignMode = "center") {
        if (-not $picPath -or -not (Test-Path -LiteralPath $picPath) -or -not $rng) { return $null }
        try {
          $ma = $rng.MergeArea
          $left = [double]$ma.Left
          $top = [double]$ma.Top
          $maW = [double]$ma.Width
          $maH = [double]$ma.Height
          if ($alignMode -eq "center") {
            if ($maW -gt $wPt) { $left = $left + (($maW - $wPt) / 2) }
            if ($maH -gt $hPt) { $top = $top + (($maH - $hPt) / 2) }
          }
          $shape = $wsProof.Shapes.AddPicture($picPath, 0, 1, $left, $top, $wPt, $hPt)
          $shape.LockAspectRatio = 0
          $shape.Width = $wPt
          $shape.Height = $hPt
          $shape.Left = $left
          $shape.Top = $top
          return $shape
        } catch {
          LogMsg "InsertImageToRange Error ($picPath): $($_.Exception.Message)"
          return $null
        }
      }

      # 1) 매출계산서: 높이 4.86cm, 너비 7.6cm (셀 중앙 배치)
      try {
        $rngSales = $wb.Names.Item("매출계산서").RefersToRange
        if ($rngSales -and $photos.salesInvoice) {
          $wSales = 7.6 * $CM_TO_PT
          $hSales = 4.86 * $CM_TO_PT
          InsertImageToRange $photos.salesInvoice $rngSales $wSales $hSales "center" | Out-Null
          LogMsg "Inserted 매출계산서 (4.86 x 7.6cm)"
        }
      } catch { LogMsg "매출계산서 error: $($_.Exception.Message)" }

      # 2) 성적서 4장: 각 장당 높이 4.17cm, 너비 2.89cm (2장씩 2줄 그리드 정중앙 배치)
      try {
        $rngCert = $wb.Names.Item("성적서").RefersToRange
        if ($rngCert -and $photos.certImages) {
          $wCert = 2.89 * $CM_TO_PT
          $hCert = 4.17 * $CM_TO_PT
          $gapX = 4.0
          $gapY = 4.0
          $totalGridW = ($wCert * 2.0) + $gapX
          $totalGridH = ($hCert * 2.0) + $gapY

          $ma = $rngCert.MergeArea
          $startLeft = [double]$ma.Left
          $startTop = [double]$ma.Top
          $maW = [double]$ma.Width
          $maH = [double]$ma.Height
          if ($maW -gt $totalGridW) { $startLeft = $startLeft + (($maW - $totalGridW) / 2.0) }
          if ($maH -gt $totalGridH) { $startTop = $startTop + (($maH - $totalGridH) / 2.0) }

          $cIdx = 0
          foreach ($cp in @($photos.certImages)) {
            if ($cIdx -ge 4) { break }
            $row = [Math]::Floor([double]$cIdx / 2.0)
            $col = [double]($cIdx % 2)
            $pTop = $startTop + ($row * ($hCert + $gapY))
            $pLeft = $startLeft + ($col * ($wCert + $gapX))

            $shape = $wsProof.Shapes.AddPicture($cp, 0, 1, $pLeft, $pTop, $wCert, $hCert)
            $shape.LockAspectRatio = 0
            $shape.Width = $wCert
            $shape.Height = $hCert
            $shape.Left = $pLeft
            $shape.Top = $pTop
            $cIdx++
          }
          LogMsg "Inserted $($cIdx) 성적서 images (4.17 x 2.89cm, 2x2 grid 정중앙 배치)"
        }
      } catch { LogMsg "성적서 error: $($_.Exception.Message)" }

      # 3) 수질계산서와입금표: 상단 계산서(4.86x7.6cm), 하단 입금표(2.62x7.6cm)
      try {
        $rngWater = $wb.Names.Item("수질계산서와입금표").RefersToRange
        if ($rngWater) {
          $wBill = 7.6 * $CM_TO_PT
          $hInv = 4.86 * $CM_TO_PT
          $hDep = 2.62 * $CM_TO_PT
          $gapY = 6
          $totalH = $hInv + $hDep + $gapY

          $startTop = $rngWater.Top
          $startLeft = $rngWater.Left
          if ($rngWater.Width -gt $wBill) { $startLeft = $rngWater.Left + (($rngWater.Width - $wBill) / 2) }
          if ($rngWater.Height -gt $totalH) { $startTop = $rngWater.Top + (($rngWater.Height - $totalH) / 2) }

          if ($photos.waterInvoice) {
            $s1 = $wsProof.Shapes.AddPicture($photos.waterInvoice, 0, 1, $startLeft, $startTop, $wBill, $hInv)
            $s1.LockAspectRatio = 0
            $s1.Width = $wBill
            $s1.Height = $hInv
          }
          if ($photos.waterDeposit) {
            $depTop = $startTop + $hInv + $gapY
            $s2 = $wsProof.Shapes.AddPicture($photos.waterDeposit, 0, 1, $startLeft, $depTop, $wBill, $hDep)
            $s2.LockAspectRatio = 0
            $s2.Width = $wBill
            $s2.Height = $hDep
          }
          LogMsg "Inserted 수질계산서와입금표"
        }
      } catch { LogMsg "수질계산서와입금표 error: $($_.Exception.Message)" }

      # 4) 키트계산서 & 키트입금표 (각각 단독 셀 중앙 배치)
      try {
        $wBill = 7.6 * $CM_TO_PT
        $hInv = 4.86 * $CM_TO_PT
        $hDep = 2.62 * $CM_TO_PT

        $rngKitInv = $wb.Names.Item("키트계산서").RefersToRange
        if ($rngKitInv -and $photos.kitInvoice) {
          InsertImageToRange $photos.kitInvoice $rngKitInv $wBill $hInv "center" | Out-Null
        }
        $rngKitDep = $wb.Names.Item("키트입금표").RefersToRange
        if ($rngKitDep -and $photos.kitDeposit) {
          InsertImageToRange $photos.kitDeposit $rngKitDep $wBill $hDep "center" | Out-Null
        }
        LogMsg "Inserted 키트계산서 & 키트입금표"
      } catch { LogMsg "키트 error: $($_.Exception.Message)" }

      # 5) 약품계산서입금표: 상단 계산서(4.86x7.6cm), 하단 입금표(2.62x7.6cm)
      try {
        $rngChem = $wb.Names.Item("약품계산서입금표").RefersToRange
        if ($rngChem) {
          $wBill = 7.6 * $CM_TO_PT
          $hInv = 4.86 * $CM_TO_PT
          $hDep = 2.62 * $CM_TO_PT
          $gapY = 6
          $totalH = $hInv + $hDep + $gapY

          $startTop = $rngChem.Top
          $startLeft = $rngChem.Left
          if ($rngChem.Width -gt $wBill) { $startLeft = $rngChem.Left + (($rngChem.Width - $wBill) / 2) }
          if ($rngChem.Height -gt $totalH) { $startTop = $rngChem.Top + (($rngChem.Height - $totalH) / 2) }

          if ($photos.chemInvoice) {
            $s1 = $wsProof.Shapes.AddPicture($photos.chemInvoice, 0, 1, $startLeft, $startTop, $wBill, $hInv)
            $s1.LockAspectRatio = 0
            $s1.Width = $wBill
            $s1.Height = $hInv
          }
          if ($photos.chemDeposit) {
            $depTop = $startTop + $hInv + $gapY
            $s2 = $wsProof.Shapes.AddPicture($photos.chemDeposit, 0, 1, $startLeft, $depTop, $wBill, $hDep)
            $s2.LockAspectRatio = 0
            $s2.Width = $wBill
            $s2.Height = $hDep
          }
          LogMsg "Inserted 약품계산서입금표"
        }
      } catch { LogMsg "약품계산서입금표 error: $($_.Exception.Message)" }

      # 6) 약품입고사진: 너비 5.89cm, 높이 7.8cm (3단 합성 이미지 중앙 배치)
      try {
        $rngChemPic = $wb.Names.Item("약품입고사진").RefersToRange
        if ($rngChemPic -and $photos.combinedChemImage) {
          $wChem = 5.89 * $CM_TO_PT
          $hChem = 7.8 * $CM_TO_PT
          InsertImageToRange $photos.combinedChemImage $rngChemPic $wChem $hChem "center" | Out-Null
          LogMsg "Inserted 약품입고사진 (7.8 x 5.89cm 3단 합성)"
        }
      } catch { LogMsg "약품입고사진 error: $($_.Exception.Message)" }

      # 7) 슬러지 수거필증 & 반출사진 (1회차 / 2회차)
      # 필증: 높이 7.83cm, 너비 3.77cm | 반출사진: 높이 5.13cm, 너비 6.24cm
      try {
        $wClean = 3.77 * $CM_TO_PT
        $hClean = 7.83 * $CM_TO_PT
        $wPhoto = 6.24 * $CM_TO_PT
        $hPhoto = 5.13 * $CM_TO_PT

        # 1회차
        $rngClean1 = $wb.Names.Item("수거필증1").RefersToRange
        if ($rngClean1 -and $photos.cleanCert1) {
          InsertImageToRange $photos.cleanCert1 $rngClean1 $wClean $hClean "center" | Out-Null
        }
        $rngPhoto1 = $wb.Names.Item("반출사진1").RefersToRange
        if ($rngPhoto1 -and $photos.sludgePhoto1) {
          InsertImageToRange $photos.sludgePhoto1 $rngPhoto1 $wPhoto $hPhoto "center" | Out-Null
        }

        # 2회차
        $rngClean2 = $wb.Names.Item("수거필증2").RefersToRange
        if ($rngClean2 -and $photos.cleanCert2) {
          InsertImageToRange $photos.cleanCert2 $rngClean2 $wClean $hClean "center" | Out-Null
        }
        $rngPhoto2 = $wb.Names.Item("반출사진2").RefersToRange
        if ($rngPhoto2 -and $photos.sludgePhoto2) {
          InsertImageToRange $photos.sludgePhoto2 $rngPhoto2 $wPhoto $hPhoto "center" | Out-Null
        }

        # 날짜 라벨 바인딩
        if ($photos.cleanCert1Text) {
          $wb.Names.Item("필증날짜1").RefersToRange.Value = $photos.cleanCert1Text
        }
        if ($photos.sludgePhoto1Text) {
          $wb.Names.Item("반출날짜1").RefersToRange.Value = $photos.sludgePhoto1Text
        }
        if ($photos.cleanCert2Text) {
          $wb.Names.Item("필증날짜2").RefersToRange.Value = $photos.cleanCert2Text
          $wb.Names.Item("반출날짜2").RefersToRange.Value = $photos.sludgePhoto2Text
        }
        LogMsg "Inserted 슬러지 증빙 사진 및 날짜 라벨"
      } catch { LogMsg "슬러지 증빙 error: $($_.Exception.Message)" }
    }
  } catch {
    LogMsg "Error updating 증빙 시트: $($_.Exception.Message)"
  }

  # -------------------------------------------------------------
  # 시트 3: 월간운영일지 - 일별 데이터 바인딩 및 약품 이월/입고 주입
  # -------------------------------------------------------------
  try {
    $wsLog = $wb.Sheets.Item("월간운영일지")
    if ($wsLog) {
      # 제목
      try {
        $wb.Names.Item("월간일지제목").RefersToRange.Value = "죽암(부산)휴게소 $($data.year)년 $($data.month)월 운영일지"
      } catch {
        $wsLog.Range("A2").Value = "죽암(부산)휴게소 $($data.year)년 $($data.month)월 운영일지"
      }

      # 정의된 범위 가져오기
      $rngDates = $wb.Names.Item("월간일지날짜").RefersToRange
      $rngIn    = $wb.Names.Item("유입수").RefersToRange
      $rngOut   = $wb.Names.Item("방류수").RefersToRange
      $rngSludge= $wb.Names.Item("슬러지").RefersToRange
      $rngGlu   = $wb.Names.Item("포도당").RefersToRange
      $rngSoda  = $wb.Names.Item("중탄산").RefersToRange
      $rngPac   = $wb.Names.Item("팩").RefersToRange

      $dailyList = @($data.dailyRows)
      $totalRows = $rngDates.Rows.Count

      for ($i = 1; $i -le $totalRows; $i++) {
        $idx = $i - 1
        if ($idx -lt $dailyList.Count) {
          $rowItem = $dailyList[$idx]
          # 날짜 기입 (일자 번호 또는 엑셀 날짜 시리얼)
          $oaDate = [DateTime]::Parse($rowItem.date).ToOADate()
          $rngDates.Cells.Item($i, 1).Value2 = $oaDate
          $rngIn.Cells.Item($i, 1).Value2     = [double]$rowItem.유입
          $rngOut.Cells.Item($i, 1).Value2    = [double]$rowItem.방류
          $rngSludge.Cells.Item($i, 1).Value2 = [double]$rowItem.슬러지
          $rngGlu.Cells.Item($i, 1).Value2    = [double]$rowItem.포도당
          $rngSoda.Cells.Item($i, 1).Value2   = [double]$rowItem.중탄산
          $rngPac.Cells.Item($i, 1).Value2    = [double]$rowItem.응집제
        } else {
          # 당월 말일 초과 행은 공란 처리
          $rngDates.Cells.Item($i, 1).Value2 = ""
          $rngIn.Cells.Item($i, 1).Value2     = ""
          $rngOut.Cells.Item($i, 1).Value2    = ""
          $rngSludge.Cells.Item($i, 1).Value2 = ""
          $rngGlu.Cells.Item($i, 1).Value2    = ""
          $rngSoda.Cells.Item($i, 1).Value2   = ""
          $rngPac.Cells.Item($i, 1).Value2    = ""
        }
      }

      # 약품 이월량 및 입고량 주입 (사용량과 재고량은 엑셀 수식 자동 계산)
      $wsLog.Range("D39").Value2 = [double]$med.glucoseCarryover # 질소제거제(L) 이월
      $wsLog.Range("E39").Value2 = [double]$med.glucoseInbound   # 질소제거제(L) 입고
      $wsLog.Range("D40").Value2 = [double]$med.sodaCarryover    # 중탄산나트륨(kg) 이월
      $wsLog.Range("E40").Value2 = [double]$med.sodaInbound      # 중탄산나트륨(kg) 입고
      $wsLog.Range("D41").Value2 = [double]$med.pacCarryover     # 응집제PAC(kg) 이월
      $wsLog.Range("E41").Value2 = [double]$med.pacInbound       # 응집제PAC(kg) 입고

      LogMsg "Updated 월간운영일지 daily data & chemicals"
    }
  } catch {
    LogMsg "Error updating 월간운영일지: $($_.Exception.Message)"
  }

  # -------------------------------------------------------------
  # 시트 4: 슬러지반출대장 - 일자별 슬러지 반출 내역 바인딩
  # -------------------------------------------------------------
  try {
    $wsSludgeSheet = $wb.Sheets.Item("슬러지반출대장")
    if ($wsSludgeSheet) {
      $wsSludgeSheet.Range("A1").Value2 = "$($data.year)년 $($data.month)월 슬러지반출 관리대장"
      $wsSludgeSheet.Range("A2").Value2 = "죽암(부산)휴게소"

      # 슬러지 이벤트 맵 (일자별)
      $eventsMap = @{}
      foreach ($ev in @($data.sludgeEvents)) {
        $eventsMap["$($ev.dayIndex)"] = $ev
      }

      $lastDay = [DateTime]::DaysInMonth([int]$data.year, [int]$data.month)
      for ($d = 1; $d -le 31; $d++) {
        $rowNum = $d + 3 # 4행부터 1일
        $dKey = "$d"
        if ($d -le $lastDay) {
          $curDate = (Get-Date -Year $data.year -Month $data.month -Day $d)
          $wsSludgeSheet.Cells.Item($rowNum, 1).Value2 = [int]$d
          $wsSludgeSheet.Cells.Item($rowNum, 2).Value2 = $curDate.ToOADate()

          if ($eventsMap.ContainsKey($dKey)) {
            $ev = $eventsMap[$dKey]
            $wsSludgeSheet.Cells.Item($rowNum, 3).Value2 = "국민환경"
            $wsSludgeSheet.Cells.Item($rowNum, 4).Value2 = "08:30"
            $wsSludgeSheet.Cells.Item($rowNum, 5).Value2 = [double]$ev.weight
          } else {
            $wsSludgeSheet.Cells.Item($rowNum, 3).Value2 = ""
            $wsSludgeSheet.Cells.Item($rowNum, 4).Value2 = ""
            $wsSludgeSheet.Cells.Item($rowNum, 5).Value2 = ""
          }
        } else {
          # 말일 이후 행 비우기
          $wsSludgeSheet.Cells.Item($rowNum, 1).Value2 = ""
          $wsSludgeSheet.Cells.Item($rowNum, 2).Value2 = ""
          $wsSludgeSheet.Cells.Item($rowNum, 3).Value2 = ""
          $wsSludgeSheet.Cells.Item($rowNum, 4).Value2 = ""
          $wsSludgeSheet.Cells.Item($rowNum, 5).Value2 = ""
        }
      }
      LogMsg "Updated 슬러지반출대장 sheet successfully"
    }
  } catch {
    LogMsg "Error updating 슬러지반출대장: $($_.Exception.Message)"
  }

  LogMsg "3. Saving workbook..."
  $wb.Save()
  $wb.Close($false)
  LogMsg "4. Workbook saved successfully!"
} finally {
  $excel.Quit()
  [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($excel)
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
`;

  // 임시 .ps1 스크립트 파일 생성 (BOM UTF-8)
  const tempScriptPath = path.join(tempDir, `osoo_jukam_${Date.now()}_${Math.random().toString(36).substring(7)}.ps1`);
  const bomBuffer = Buffer.from('\uFEFF', 'utf8');
  const scriptBuffer = Buffer.from(`[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\n${psScript}`, 'utf8');
  fs.writeFileSync(tempScriptPath, Buffer.concat([bomBuffer, scriptBuffer]));

  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-STA', '-File', tempScriptPath],
      { windowsHide: true, maxBuffer: 20 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (fs.existsSync(logPath)) {
          const logContent = fs.readFileSync(logPath, 'utf8');
          console.log('[jukamSettlementService Log]:\n' + logContent);
        }

        try { if (fs.existsSync(tempScriptPath)) fs.unlinkSync(tempScriptPath); } catch (_) {}
        try { if (fs.existsSync(logPath)) fs.unlinkSync(logPath); } catch (_) {}
        try { if (combinedChemPath && fs.existsSync(combinedChemPath)) fs.unlinkSync(combinedChemPath); } catch (_) {}

        if (error) {
          console.error('[jukamSettlementService] PowerShell 실행 실패:', error, stderr);
          try { if (fs.existsSync(tempWorkingPath)) fs.unlinkSync(tempWorkingPath); } catch (_) {}
          return reject(new Error(`죽암 엑셀 정산서 생성 실패: ${error.message}`));
        }

        try {
          fs.copyFileSync(tempWorkingPath, finalReportPath);
          try { if (fs.existsSync(tempWorkingPath)) fs.unlinkSync(tempWorkingPath); } catch (_) {}

          console.log(`[jukamSettlementService] 죽암(부산) 정산서 엑셀 파일 생성 완료: ${finalReportPath}`);

          // 사용자가 바로 확인할 수 있도록 바탕화면 루트에도 복사
          try {
            desktopDirs.forEach(d => {
              const rootCopy = path.join(d, path.basename(finalReportPath));
              if (rootCopy !== finalReportPath) {
                fs.copyFileSync(finalReportPath, rootCopy);
                console.log(`[jukamSettlementService] 부산 바탕화면 루트 복사 완료: ${rootCopy}`);
              }
            });
          } catch (e) {
            console.warn('[jukamSettlementService] 부산 바탕화면 루트 복사 경고:', e.message);
          }

          return resolve({
            success: true,
            filePath: finalReportPath,
            fileName: path.basename(finalReportPath),
            targetYm,
          });
        } catch (copyErr) {
          console.error('[jukamSettlementService] 최종 파일 복사 실패:', copyErr);
          return reject(new Error(`엑셀 정산서 파일 복사 실패: ${copyErr.message}`));
        }
      }
    );
  });
}

/**
 * 수질실험 튜브 사진 4장을 2x2 그리드로 리사이즈하여
 * 단일 합성 JPG 파일(높이 10.88cm, 너비 12.61cm) 생성
 */
async function compositeWaterLabPhotos(photos, tempDir) {
  const files = (photos || []).filter(f => f && fs.existsSync(f));
  if (files.length === 0) return null;
  while (files.length < 4) files.push(files[files.length - 1]);

  try {
    const singleW = 630;
    const singleH = 544;
    const totalW = singleW * 2;
    const totalH = singleH * 2;

    const resized = await Promise.all(
      files.slice(0, 4).map(f => sharp(f).resize(singleW, singleH, { fit: 'cover' }).toBuffer())
    );

    const composites = [
      { input: resized[0], top: 0, left: 0 },
      { input: resized[1], top: 0, left: singleW },
      { input: resized[2], top: singleH, left: 0 },
      { input: resized[3], top: singleH, left: singleW },
    ];

    const outPath = path.join(tempDir, `jukam_seoul_lab_${Date.now()}.jpg`);
    await sharp({
      create: { width: totalW, height: totalH, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .composite(composites)
      .jpeg({ quality: 90 })
      .toFile(outPath);

    return outPath;
  } catch (err) {
    console.error('[jukamSettlementService] 수질실험 사진 합성 실패:', err.message);
    return null;
  }
}

/**
 * 서울방향 약품 사진 3장(포도당, 중탄산, PAC)을 세로로 이어붙여
 * 단일 합성 JPG 파일(높이 11.75cm, 너비 9.37cm) 생성
 */
async function compositeSeoulChemicalPhotos(glucoseImg, sodaImg, pacImg, tempDir) {
  const files = [glucoseImg, sodaImg, pacImg].filter(f => f && fs.existsSync(f));
  if (files.length === 0) return null;
  while (files.length < 3) files.push(files[files.length - 1]);

  try {
    const targetW = 937;
    const singleH = Math.round((targetW * 3.916) / 9.37); // ≈ 392px
    const totalH = singleH * 3; // ≈ 1176px

    const resized = await Promise.all(
      files.slice(0, 3).map(f => sharp(f).resize(targetW, singleH, { fit: 'cover' }).toBuffer())
    );

    const composites = resized.map((buf, idx) => ({
      input: buf,
      top: idx * singleH,
      left: 0,
    }));

    const outPath = path.join(tempDir, `jukam_seoul_chem_${Date.now()}.jpg`);
    await sharp({
      create: { width: targetW, height: totalH, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .composite(composites)
      .jpeg({ quality: 90 })
      .toFile(outPath);

    return outPath;
  } catch (err) {
    console.error('[jukamSettlementService] 서울 약품 사진 합성 실패:', err.message);
    return null;
  }
}

// 죽암휴게소(서울방향) 구글 시트 / BigQuery 표준 현장 ID
const JUKAM_SEOUL_SITE_ID = '76d71f60-220f-436a-944e-9cbf6fd60218';

/**
 * 죽암휴게소(서울방향) 엑셀 정산서 자동 생성 메인 함수
 */
async function generateJukamSeoulExcelReport({
  year = new Date().getFullYear(),
  month = new Date().getMonth() + 1,
  outputPath = null,
} = {}) {
  const targetYm = `${year}${String(month).padStart(2, '0')}`;
  const desktopDirs = getDesktopDirectories();

  // 1. 원본 템플릿 파일 탐색
  const templateCandidates = [
    ...desktopDirs.map(d => path.join(d, '정산양식', `죽암(서울)휴게소 오수처리(2026년 8월).xls`)),
    ...desktopDirs.map(d => path.join(d, '정산양식', `죽암(서울)휴게소 오수처리.xls`)),
    path.join(process.cwd(), 'server', 'templates', 'settlement', 'template_jukam_seoul.xls'),
    ...desktopDirs.map(d => path.join(d, '월정산', '죽암마감자료', `죽암(서울)휴게소 오수처리(2026년 8월).xls`)),
  ];

  let templatePath = null;
  for (const cand of templateCandidates) {
    if (fs.existsSync(cand)) {
      templatePath = cand;
      break;
    }
  }

  if (!templatePath) {
    throw new Error('죽암휴게소(서울방향) 정산 엑셀 양식 파일을 찾을 수 없습니다.');
  }

  // 2. 최종 저장 경로 결정
  const defaultOutputDir = desktopDirs.length > 0
    ? path.join(desktopDirs[0], '월정산', '죽암마감자료', targetYm)
    : path.join(os.homedir(), '바탕 화면', '월정산', '죽암마감자료', targetYm);

  if (!fs.existsSync(defaultOutputDir)) {
    fs.mkdirSync(defaultOutputDir, { recursive: true });
  }

  const finalReportFileName = `죽암(서울)휴게소 오수처리(${year}년 ${month}월).xls`;
  const finalReportPath = outputPath || path.join(defaultOutputDir, finalReportFileName);

  // 3. 임시 작업 파일 생성
  const tempDir = os.tmpdir();
  const tempWorkingPath = path.join(tempDir, `jukam_seoul_${Date.now()}_${Math.random().toString(36).substring(7)}.xls`);
  fs.copyFileSync(templatePath, tempWorkingPath);

  // 4. BigQuery에서 죽암(서울) 월간 운영 데이터 및 약품 데이터 조회
  console.log(`[jukamSettlementService] BigQuery 데이터 조회 시작: ${year}년 ${month}월 (죽암서울)`);
  let reportData = null;
  try {
    const rawData = await getMonthlyReportData(year, month, JUKAM_SEOUL_SITE_ID);
    reportData = transformToReportData(year, month, '죽암휴게소(서울방향)', rawData);
    console.log(`[jukamSettlementService] BigQuery 서울 조회 성공: 일별 행수 ${reportData.dailyRows.length}건`);
  } catch (err) {
    console.warn('[jukamSettlementService] BigQuery 서울 조회 실패, 기본값 진행:', err.message);
    const lastDay = new Date(year, month, 0).getDate();
    const rows = [];
    for (let d = 1; d <= lastDay; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      rows.push({ date: dateStr, 유입: 0, 방류: 0, 슬러지: 0, 포도당: 0, 중탄산: 0, 응집제: 0 });
    }
    reportData = {
      dailyRows: rows,
      medicine: {
        포도당: { 이월: 0, 입고: 0, 사용: 0 },
        중탄산: { 이월: 0, 입고: 0, 사용: 0 },
        응집제: { 이월: 0, 입고: 0, 사용: 0 },
      },
    };
  }

  // 슬러지 반출일 목록 추출
  const sludgeEvents = [];
  reportData.dailyRows.forEach((r, idx) => {
    if (Number(r.슬러지) > 0) {
      const dParts = r.date.split('-');
      const m = parseInt(dParts[1], 10);
      const d = parseInt(dParts[2], 10);
      sludgeEvents.push({
        dayIndex: idx + 1,
        date: r.date,
        mDotDd: `${m}.${String(d).padStart(2, '0')}`,
        weight: Number(r.슬러지),
      });
    }
  });

  // 5. 로컬 사진 및 증빙 파일 탐색
  const invoiceDirs = desktopDirs.map(d => path.join(d, '점검준비', '계산서', targetYm));
  const depositDirs = desktopDirs.map(d => path.join(d, '점검준비', '입금표', targetYm));
  const certDirs = desktopDirs.map(d => path.join(d, '점검준비', '성적서', targetYm));

  const photoBase = path.join(desktopDirs[0] || path.join(os.homedir(), '바탕 화면'), '월정산', '죽암마감자료', targetYm);
  const expPhotoDirs = [path.join(photoBase, '1_실험사진')];
  const sludgePhotoDirs = [path.join(photoBase, '2_슬러지사진')];
  const cleanCertPhotoDirs = [path.join(photoBase, '3_청소필증')];
  const chemPhotoDirs = [path.join(photoBase, '4_약품입고')];

  const isJukamSeoulFile = (filename) => {
    const lower = filename.toLowerCase();
    const isJukam = lower.includes('죽암');
    const isBusan = lower.includes('부산');
    return isJukam && !isBusan;
  };

  const findImages = (dirs, vendorKeyword = '') => {
    const list = [];
    const seen = new Set();
    const dirList = Array.isArray(dirs) ? dirs : [dirs];
    for (const d of dirList) {
      if (!d || !fs.existsSync(d)) continue;
      try {
        const files = fs.readdirSync(d);
        for (const f of files) {
          const lower = f.toLowerCase();
          const isExt = /\.(jpg|jpeg|png|bmp|webp)$/i.test(f);
          if (!isExt) continue;
          const siteMatch = isJukamSeoulFile(lower);
          const vendorMatch = !vendorKeyword || lower.includes(vendorKeyword.toLowerCase());
          if (siteMatch && vendorMatch) {
            const fullPath = path.join(d, f);
            if (!seen.has(fullPath)) {
              seen.add(fullPath);
              list.push(fullPath);
            }
          }
        }
      } catch (_) {}
    }
    return list;
  };

  // 계산서 및 입금표 탐색
  const invMgmt = findImages(invoiceDirs, '용역비').concat(findImages(invoiceDirs, '매출계산서'));
  const invWater = findImages(invoiceDirs, '대신');
  const depWater = findImages(depositDirs, '대신');
  const invKit = findImages(invoiceDirs, '케이엠');
  const depKit = findImages(depositDirs, '케이엠');
  const invChem = findImages(invoiceDirs, '에이치');
  const depChem = findImages(depositDirs, '에이치');

  // 성적서 4장 (점검준비/성적서/YYYYMM 중 서울방향)
  const certImages = findImages(certDirs).sort().slice(0, 4);

  // 수질실험 사진 4장 (1_실험사진) 및 2x2 합성
  const rawLabPhotos = [];
  if (fs.existsSync(expPhotoDirs[0])) {
    fs.readdirSync(expPhotoDirs[0]).forEach(f => {
      if (/\.(jpg|jpeg|png)$/i.test(f)) rawLabPhotos.push(path.join(expPhotoDirs[0], f));
    });
  }
  const combinedLabPhotoPath = await compositeWaterLabPhotos(rawLabPhotos.slice(0, 4), tempDir);

  // 약품 사진 3장 및 3단 세로 합성
  const chemGlucose = findImages(chemPhotoDirs, '포도당');
  const chemSoda = findImages(chemPhotoDirs, '중탄산');
  const chemPac = findImages(chemPhotoDirs, '팩').concat(findImages(chemPhotoDirs, 'pac'));
  const combinedChemPath = await compositeSeoulChemicalPhotos(
    chemGlucose[0],
    chemSoda[0],
    chemPac[0],
    tempDir
  );

  // 슬러지 필증 및 반출사진
  const cleanCerts = findImages(cleanCertPhotoDirs);
  const sludgePhotos = findImages(sludgePhotoDirs);

  const photoPayload = {
    salesInvoice: invMgmt[0] || null,
    waterInvoice: invWater[0] || null,
    waterDeposit: depWater[0] || null,
    kitInvoice: invKit[0] || null,
    kitDeposit: depKit[0] || null,
    chemInvoice: invChem[0] || null,
    chemDeposit: depChem[0] || null,
    certImages: certImages, // 4장
    combinedLabPhoto: combinedLabPhotoPath,
    combinedChemPhoto: combinedChemPath,
    cleanCert: cleanCerts[0] || null,
    sludgePhoto: sludgePhotos[0] || null,
  };

  const med = reportData.medicine;
  const logPath = path.join(tempDir, `osoo_jukam_seoul_log_${Date.now()}.txt`);
  const dataPayload = {
    year,
    month,
    dailyRows: reportData.dailyRows,
    chemicals: {
      glucoseUsage: med.포도당?.사용 ?? 0,
      sodaUsage: med.중탄산?.사용 ?? 0,
      pacUsage: med.응집제?.사용 ?? 0,
    },
    photos: photoPayload,
    sludgeEvents,
  };

  const psScript = `
$ErrorActionPreference = 'Continue'
$workingFile = ${toPowerShellLiteral(tempWorkingPath)}
$logFile = ${toPowerShellLiteral(logPath)}
$dataJson = ${toPowerShellLiteral(JSON.stringify(dataPayload))}

function LogMsg($m) {
  Add-Content -LiteralPath $logFile -Value "[$(Get-Date -Format 'HH:mm:ss')] $m" -Encoding utf8
  Write-Host $m
}

LogMsg "1. Starting Excel COM for Jukam Seoul..."
$excel = New-Object -ComObject Excel.Application
try {
  $excel.Visible = $false
  $excel.DisplayAlerts = $false

  LogMsg "2. Opening workbook: $workingFile"
  $wb = $excel.Workbooks.Open($workingFile)
  $data = ConvertFrom-Json $dataJson
  $photos = $data.photos
  $med = $data.chemicals

  $CM_TO_PT = 28.3464567

  # -------------------------------------------------------------
  # 0. 시트 탭 이름 동적 변경 (모든 시트에 해당 월 주입)
  # -------------------------------------------------------------
  try {
    $wb.Sheets.Item(1).Name = "$($data.month)월 죽암오수처리 정산"
    $wb.Sheets.Item(2).Name = "$($data.month)월증빙자료"
    $wb.Sheets.Item(3).Name = "슬러지반출관리대장($($data.month)월)"
    LogMsg "Renamed all 3 sheet tabs to month $($data.month)월"
  } catch {
    LogMsg "Sheet rename error: $($_.Exception.Message)"
  }

  # -------------------------------------------------------------
  # 시트 1: 정산표 - 연월 타이틀 갱신
  # -------------------------------------------------------------
  try {
    $rngTitle = $wb.Names.Item("정산제목월").RefersToRange
    if ($rngTitle) {
      $rngTitle.Value2 = "[$($data.month)월] 휴게소 오수처리비 정산 내역"
      LogMsg "Updated 정산제목월"
    }
  } catch {
    LogMsg "Error updating 정산제목월: $($_.Exception.Message)"
  }

  # -------------------------------------------------------------
  # 시트 2: 증빙자료 - 운영일지 및 증빙 사진 규격 바인딩
  # -------------------------------------------------------------
  try {
    $wsProof = $wb.Sheets.Item(2)
    if ($wsProof) {
      # 운영보고서 타이틀
      try {
        $wb.Names.Item("운영보고서월").RefersToRange.Value2 = "2026년 휴게소 오수처리시설 운영일지($($data.month)월) 죽암(서울)"
      } catch { LogMsg "운영보고서월 error: $($_.Exception.Message)" }

      # 일별 데이터 바인딩
      $rngDates = $wb.Names.Item("날짜").RefersToRange
      $rngIn    = $wb.Names.Item("유입").RefersToRange
      $rngOut   = $wb.Names.Item("방류").RefersToRange
      $rngSludge= $wb.Names.Item("슬러지").RefersToRange
      $rngGlu   = $wb.Names.Item("포도당").RefersToRange
      $rngSoda  = $wb.Names.Item("중탄산").RefersToRange
      $rngPac   = $wb.Names.Item("팩").RefersToRange

      $dailyList = @($data.dailyRows)
      $totalRows = $rngDates.Rows.Count

      for ($i = 1; $i -le $totalRows; $i++) {
        $idx = $i - 1
        if ($idx -lt $dailyList.Count) {
          $rowItem = $dailyList[$idx]
          $oaDate = [DateTime]::Parse($rowItem.date).ToOADate()
          $rngDates.Cells.Item($i, 1).Value2 = $oaDate
          $rngIn.Cells.Item($i, 1).Value2     = [double]$rowItem.유입
          $rngOut.Cells.Item($i, 1).Value2    = [double]$rowItem.방류
          $rngSludge.Cells.Item($i, 1).Value2 = [double]$rowItem.슬러지
          $rngGlu.Cells.Item($i, 1).Value2    = [double]$rowItem.포도당
          $rngSoda.Cells.Item($i, 1).Value2   = [double]$rowItem.중탄산
          $rngPac.Cells.Item($i, 1).Value2    = [double]$rowItem.응집제
        } else {
          $rngDates.Cells.Item($i, 1).Value2 = ""
          $rngIn.Cells.Item($i, 1).Value2     = ""
          $rngOut.Cells.Item($i, 1).Value2    = ""
          $rngSludge.Cells.Item($i, 1).Value2 = ""
          $rngGlu.Cells.Item($i, 1).Value2    = ""
          $rngSoda.Cells.Item($i, 1).Value2   = ""
          $rngPac.Cells.Item($i, 1).Value2    = ""
        }
      }

      # 약품 사용량 합계 바인딩
      try {
        $wb.Names.Item("포도당사용").RefersToRange.Value2 = [double]$med.glucoseUsage
        $wb.Names.Item("중탄산사용").RefersToRange.Value2 = [double]$med.sodaUsage
        $wb.Names.Item("팩사용").RefersToRange.Value2     = [double]$med.pacUsage
      } catch { LogMsg "약품사용량 error: $($_.Exception.Message)" }

      # 이미지 삽입 헬퍼 함수 (병합 셀 MergeArea 기준 정밀 중앙 정렬)
      function InsertImageToRange($picPath, $rng, $wPt, $hPt, $alignMode = "center") {
        if (-not $picPath -or -not (Test-Path -LiteralPath $picPath) -or -not $rng) { return $null }
        try {
          $ma = $rng.MergeArea
          $left = $ma.Left
          $top = $ma.Top
          if ($alignMode -eq "center") {
            if ($ma.Width -gt $wPt) { $left = $ma.Left + (($ma.Width - $wPt) / 2) }
            if ($ma.Height -gt $hPt) { $top = $ma.Top + (($ma.Height - $hPt) / 2) }
          }
          $shape = $wsProof.Shapes.AddPicture($picPath, 0, 1, $left, $top, $wPt, $hPt)
          $shape.LockAspectRatio = 0
          $shape.Width = $wPt
          $shape.Height = $hPt
          $shape.Left = $left
          $shape.Top = $top
          return $shape
        } catch {
          LogMsg "InsertImageToRange Error ($picPath): $($_.Exception.Message)"
          return $null
        }
      }

      # 성적서 두 장을 병합 셀(MergeArea) 안에 좌우 나란히 중앙 정렬하여 배치하는 함수
      function InsertTwoCertsToRange($cert1, $cert2, $rng, $wPt, $hPt, $gapPt = 8) {
        if (-not $rng) { return }
        try {
          $ma = $rng.MergeArea
          $has1 = ($cert1 -and (Test-Path -LiteralPath $cert1))
          $has2 = ($cert2 -and (Test-Path -LiteralPath $cert2))
          
          if ($has1 -and $has2) {
            $totalW = ($wPt * 2) + $gapPt
            $startLeft = $ma.Left
            if ($ma.Width -gt $totalW) { $startLeft = $ma.Left + (($ma.Width - $totalW) / 2) }
            $startTop = $ma.Top
            if ($ma.Height -gt $hPt) { $startTop = $ma.Top + (($ma.Height - $hPt) / 2) }

            $s1 = $wsProof.Shapes.AddPicture($cert1, 0, 1, $startLeft, $startTop, $wPt, $hPt)
            $s1.LockAspectRatio = 0
            $s1.Width = $wPt
            $s1.Height = $hPt
            $s1.Left = $startLeft
            $s1.Top = $startTop

            $c2Left = $startLeft + $wPt + $gapPt
            $s2 = $wsProof.Shapes.AddPicture($cert2, 0, 1, $c2Left, $startTop, $wPt, $hPt)
            $s2.LockAspectRatio = 0
            $s2.Width = $wPt
            $s2.Height = $hPt
            $s2.Left = $c2Left
            $s2.Top = $startTop
          } elseif ($has1) {
            InsertImageToRange $cert1 $rng $wPt $hPt "center" | Out-Null
          } elseif ($has2) {
            InsertImageToRange $cert2 $rng $wPt $hPt "center" | Out-Null
          }
        } catch {
          LogMsg "InsertTwoCertsToRange Error: $($_.Exception.Message)"
        }
      }

      # 1) 성적서: 각 장당 높이 6.6cm, 너비 4.83cm
      # 1,2번째 장은 성적서12 셀에 좌우 나란히, 3,4번째 장은 성적서34 셀에 좌우 나란히 배치
      $wCert = 4.83 * $CM_TO_PT
      $hCert = 6.6 * $CM_TO_PT
      try {
        $rngCert12 = $wb.Names.Item("성적서12").RefersToRange
        $cert1 = if ($photos.certImages.Count -ge 1) { $photos.certImages[0] } else { $null }
        $cert2 = if ($photos.certImages.Count -ge 2) { $photos.certImages[1] } else { $null }
        InsertTwoCertsToRange $cert1 $cert2 $rngCert12 $wCert $hCert 8

        $rngCert34 = $wb.Names.Item("성적서34").RefersToRange
        $cert3 = if ($photos.certImages.Count -ge 3) { $photos.certImages[2] } else { $null }
        $cert4 = if ($photos.certImages.Count -ge 4) { $photos.certImages[3] } else { $null }
        InsertTwoCertsToRange $cert3 $cert4 $rngCert34 $wCert $hCert 8
        LogMsg "Inserted 성적서 images (각 영역당 2장씩 좌우 나란히 배치 완료)"
      } catch { LogMsg "성적서 error: $($_.Exception.Message)" }

      # 2) 수질실험사진: 높이 10.88cm, 너비 12.61cm (2x2 합성 이미지 중앙)
      try {
        $rngLab = $wb.Names.Item("실험사진").RefersToRange
        if ($rngLab -and $photos.combinedLabPhoto) {
          $wLab = 12.61 * $CM_TO_PT
          $hLab = 10.88 * $CM_TO_PT
          InsertImageToRange $photos.combinedLabPhoto $rngLab $wLab $hLab "center" | Out-Null
          LogMsg "Inserted 수질실험사진 (10.88 x 12.61cm 2x2 합성)"
        }
      } catch { LogMsg "실험사진 error: $($_.Exception.Message)" }

      # 3) 약품입고사진: 높이 11.75cm, 너비 9.37cm (3단 세로 합성 이미지 중앙)
      try {
        $rngChem = $wb.Names.Item("약품입고사진").RefersToRange
        if ($rngChem -and $photos.combinedChemPhoto) {
          $wChem = 9.37 * $CM_TO_PT
          $hChem = 11.75 * $CM_TO_PT
          InsertImageToRange $photos.combinedChemPhoto $rngChem $wChem $hChem "center" | Out-Null
          LogMsg "Inserted 약품입고사진 (11.75 x 9.37cm 3단 합성)"
        }
      } catch { LogMsg "약품입고사진 error: $($_.Exception.Message)" }

      # 4) 계산서 4종: 높이 8.87cm, 너비 16.58cm
      $wInvoice = 16.58 * $CM_TO_PT
      $hInvoice = 8.87 * $CM_TO_PT
      try {
        $rngSales = $wb.Names.Item("매출계산서").RefersToRange
        if ($rngSales -and $photos.salesInvoice) {
          InsertImageToRange $photos.salesInvoice $rngSales $wInvoice $hInvoice "center" | Out-Null
        }
        $rngWaterInv = $wb.Names.Item("수질분석계산서").RefersToRange
        if ($rngWaterInv -and $photos.waterInvoice) {
          InsertImageToRange $photos.waterInvoice $rngWaterInv $wInvoice $hInvoice "center" | Out-Null
        }
        $rngKitInv = $wb.Names.Item("키트계산서").RefersToRange
        if ($rngKitInv -and $photos.kitInvoice) {
          InsertImageToRange $photos.kitInvoice $rngKitInv $wInvoice $hInvoice "center" | Out-Null
        }
        $rngChemInv = $wb.Names.Item("약품계산서").RefersToRange
        if ($rngChemInv -and $photos.chemInvoice) {
          InsertImageToRange $photos.chemInvoice $rngChemInv $wInvoice $hInvoice "center" | Out-Null
        }
        LogMsg "Inserted 계산서 4종"
      } catch { LogMsg "계산서 error: $($_.Exception.Message)" }

      # 5) 입금표 3종: 높이 5.09cm, 너비 16.52cm
      $wDeposit = 16.52 * $CM_TO_PT
      $hDeposit = 5.09 * $CM_TO_PT
      try {
        $rngWaterDep = $wb.Names.Item("수질입금표").RefersToRange
        if ($rngWaterDep -and $photos.waterDeposit) {
          InsertImageToRange $photos.waterDeposit $rngWaterDep $wDeposit $hDeposit "center" | Out-Null
        }
        $rngKitDep = $wb.Names.Item("키트입금표").RefersToRange
        if ($rngKitDep -and $photos.kitDeposit) {
          InsertImageToRange $photos.kitDeposit $rngKitDep $wDeposit $hDeposit "center" | Out-Null
        }
        $rngChemDep = $wb.Names.Item("약품입금표").RefersToRange
        if ($rngChemDep -and $photos.chemDeposit) {
          InsertImageToRange $photos.chemDeposit $rngChemDep $wDeposit $hDeposit "center" | Out-Null
        }
        LogMsg "Inserted 입금표 3종"
      } catch { LogMsg "입금표 error: $($_.Exception.Message)" }

      # 6) 슬러지 청소필증 (9.83 x 4.28cm) & 반출사진 (5.66 x 8.02cm)
      try {
        $wClean = 4.28 * $CM_TO_PT
        $hClean = 9.83 * $CM_TO_PT
        $wPhoto = 8.02 * $CM_TO_PT
        $hPhoto = 5.66 * $CM_TO_PT

        $rngClean = $wb.Names.Item("청소필증").RefersToRange
        if ($rngClean -and $photos.cleanCert) {
          InsertImageToRange $photos.cleanCert $rngClean $wClean $hClean "center" | Out-Null
        }
        $rngPhoto = $wb.Names.Item("반출사진").RefersToRange
        if ($rngPhoto -and $photos.sludgePhoto) {
          InsertImageToRange $photos.sludgePhoto $rngPhoto $wPhoto $hPhoto "center" | Out-Null
        }
        LogMsg "Inserted 슬러지 증빙 사진"
      } catch { LogMsg "슬러지증빙 error: $($_.Exception.Message)" }
    }
  } catch {
    LogMsg "Error updating 증빙자료 시트: $($_.Exception.Message)"
  }

  # -------------------------------------------------------------
  # 시트 3: 슬러지반출관리대장
  # -------------------------------------------------------------
  try {
    $wsSludgeSheet = $wb.Sheets.Item(3)
    if ($wsSludgeSheet) {
      try {
        $wb.Names.Item("슬러지월").RefersToRange.Value2 = "$($data.year)년 $($data.month)월 슬러지반출 관리대장"
      } catch { LogMsg "슬러지월 error: $($_.Exception.Message)" }

      $rngSludgeDates = $wb.Names.Item("슬러지날짜").RefersToRange
      $rngSludgeVends = $wb.Names.Item("슬러지업체").RefersToRange
      $rngSludgeTimes = $wb.Names.Item("슬러지시간").RefersToRange
      $rngSludgeAmts  = $wb.Names.Item("슬러지반출").RefersToRange

      $eventsMap = @{}
      foreach ($ev in @($data.sludgeEvents)) {
        $eventsMap["$($ev.dayIndex)"] = $ev
      }

      $lastDay = [DateTime]::DaysInMonth([int]$data.year, [int]$data.month)
      $totalRows = $rngSludgeDates.Rows.Count
      for ($d = 1; $d -le $totalRows; $d++) {
        $dKey = "$d"
        if ($d -le $lastDay) {
          $curDate = (Get-Date -Year $data.year -Month $data.month -Day $d)
          $rngSludgeDates.Cells.Item($d, 1).Value2 = $curDate.ToOADate()

          if ($eventsMap.ContainsKey($dKey)) {
            $ev = $eventsMap[$dKey]
            $rngSludgeVends.Cells.Item($d, 1).Value2 = "국민환경"
            $rngSludgeTimes.Cells.Item($d, 1).Value2 = "08:30"
            $rngSludgeAmts.Cells.Item($d, 1).Value2  = [double]$ev.weight
          } else {
            $rngSludgeVends.Cells.Item($d, 1).Value2 = ""
            $rngSludgeTimes.Cells.Item($d, 1).Value2 = ""
            $rngSludgeAmts.Cells.Item($d, 1).Value2  = ""
          }
        } else {
          $rngSludgeDates.Cells.Item($d, 1).Value2 = ""
          $rngSludgeVends.Cells.Item($d, 1).Value2 = ""
          $rngSludgeTimes.Cells.Item($d, 1).Value2 = ""
          $rngSludgeAmts.Cells.Item($d, 1).Value2  = ""
        }
      }
      LogMsg "Updated 슬러지반출관리대장 sheet successfully"
    }
  } catch {
    LogMsg "Error updating 슬러지반출관리대장: $($_.Exception.Message)"
  }

  LogMsg "3. Saving workbook..."
  $wb.Save()
  $wb.Close($false)
  LogMsg "4. Workbook saved successfully!"
} finally {
  $excel.Quit()
  [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($excel)
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
`;

  const tempScriptPath = path.join(tempDir, `osoo_jukam_seoul_${Date.now()}_${Math.random().toString(36).substring(7)}.ps1`);
  const bomBuffer = Buffer.from('\uFEFF', 'utf8');
  const scriptBuffer = Buffer.from(`[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\n${psScript}`, 'utf8');
  fs.writeFileSync(tempScriptPath, Buffer.concat([bomBuffer, scriptBuffer]));

  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-STA', '-File', tempScriptPath],
      { windowsHide: true, maxBuffer: 20 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (fs.existsSync(logPath)) {
          const logContent = fs.readFileSync(logPath, 'utf8');
          console.log('[jukamSettlementService Seoul Log]:\n' + logContent);
        }

        try { if (fs.existsSync(tempScriptPath)) fs.unlinkSync(tempScriptPath); } catch (_) {}
        try { if (fs.existsSync(logPath)) fs.unlinkSync(logPath); } catch (_) {}
        try { if (combinedLabPhotoPath && fs.existsSync(combinedLabPhotoPath)) fs.unlinkSync(combinedLabPhotoPath); } catch (_) {}
        try { if (combinedChemPath && fs.existsSync(combinedChemPath)) fs.unlinkSync(combinedChemPath); } catch (_) {}

        if (error) {
          console.error('[jukamSettlementService] 서울 PowerShell 실행 실패:', error, stderr);
          try { if (fs.existsSync(tempWorkingPath)) fs.unlinkSync(tempWorkingPath); } catch (_) {}
          return reject(new Error(`죽암(서울) 엑셀 정산서 생성 실패: ${error.message}`));
        }

        try {
          fs.copyFileSync(tempWorkingPath, finalReportPath);
          try { if (fs.existsSync(tempWorkingPath)) fs.unlinkSync(tempWorkingPath); } catch (_) {}

          console.log(`[jukamSettlementService] 죽암(서울) 정산서 엑셀 파일 생성 완료: ${finalReportPath}`);

          // 사용자가 바로 확인할 수 있도록 바탕화면 루트에도 복사
          try {
            desktopDirs.forEach(d => {
              const rootCopy = path.join(d, path.basename(finalReportPath));
              if (rootCopy !== finalReportPath) {
                fs.copyFileSync(finalReportPath, rootCopy);
                console.log(`[jukamSettlementService] 바탕화면 루트 복사 완료: ${rootCopy}`);
              }
            });
          } catch (e) {
            console.warn('[jukamSettlementService] 바탕화면 루트 복사 경고:', e.message);
          }

          return resolve({
            success: true,
            filePath: finalReportPath,
            fileName: path.basename(finalReportPath),
            targetYm,
          });
        } catch (copyErr) {
          console.error('[jukamSettlementService] 최종 파일 복사 실패:', copyErr);
          return reject(new Error(`엑셀 정산서 파일 복사 실패: ${copyErr.message}`));
        }
      }
    );
  });
}

module.exports = {
  generateJukamBusanExcelReport,
  generateJukamSeoulExcelReport,
};

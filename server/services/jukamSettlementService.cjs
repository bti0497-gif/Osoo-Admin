const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');

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

  // 1. 원본 템플릿 파일 탐색 (정산양식 폴더)
  const templateCandidates = [
    ...desktopDirs.map(d => path.join(d, '정산양식', `2026년 8월 오수처리비 정산(죽암부산행).xls`)),
    ...desktopDirs.map(d => path.join(d, '정산양식', `오수처리비 정산(죽암부산행).xls`)),
    ...desktopDirs.map(d => path.join(d, '정산양식', `죽암(부산)_정산양식.xls`)),
    ...desktopDirs.map(d => path.join(d, '월정산', '죽암마감자료', `2026년 8월 오수처리비 정산(죽암부산행).xls`)),
    path.join(process.cwd(), 'templates', '2026년 8월 오수처리비 정산(죽암부산행).xls'),
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
  const tempWorkingPath = path.join(os.tmpdir(), `jukam_busan_${Date.now()}_${Math.random().toString(36).substring(7)}.xls`);
  fs.copyFileSync(templatePath, tempWorkingPath);

  // 4. 로컬 점검준비 및 월정산 폴더에서 필요한 이미지 파일들 탐색
  const invoiceDirs = desktopDirs.map(d => path.join(d, '점검준비', '계산서', targetYm));
  const depositDirs = desktopDirs.map(d => path.join(d, '점검준비', '입금표', targetYm));
  const stmtDirs = desktopDirs.map(d => path.join(d, '점검준비', '명세서', targetYm));

  const settlementPhotoDirs = desktopDirs.flatMap(d => [
    path.join(d, '월정산', '죽암마감자료', targetYm),
    path.join(d, '월정산', '죽암휴게소', targetYm),
    path.join(d, '월정산', '죽암(부산)', targetYm),
    path.join(d, '월정산', '죽암(부산방향)', targetYm),
    path.join(d, `죽암휴게소(부산방향)_${year}년${String(month).padStart(2, '0')}월_사진모음`),
    path.join(d, `죽암휴게소_${year}년${String(month).padStart(2, '0')}월_사진모음`),
  ]);

  const findImages = (dirs, vendorKeyword = '', siteKeyword = '부산') => {
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
          const siteMatch = !siteKeyword || lower.includes(siteKeyword.toLowerCase()) || lower.includes('죽암');
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

  const expPhotoDirs = settlementPhotoDirs.flatMap(d => [path.join(d, '1_실험사진'), d]);
  const sludgePhotoDirs = settlementPhotoDirs.flatMap(d => [path.join(d, '2_슬러지사진'), d]);
  const cleanCertPhotoDirs = settlementPhotoDirs.flatMap(d => [path.join(d, '3_청소필증'), d]);
  const chemPhotoDirs = settlementPhotoDirs.flatMap(d => [path.join(d, '4_약품입고'), d]);

  // 각 증빙 항목별 이미지 파일 결정
  // 1) 매출계산서: 용역비
  const invMgmt = findImages(invoiceDirs, '용역비', '부산');
  // 2) 수질계산서 & 입금증
  const invWater = findImages(invoiceDirs, '대신', '부산');
  const depWater = findImages(depositDirs, '대신', '부산');
  // 3) 키트계산서 & 입금증
  const invKit = findImages(invoiceDirs, '케이엠', '부산');
  const depKit = findImages(depositDirs, '케이엠', '부산');
  // 4) 약품계산서 & 입금증
  const invChem = findImages(invoiceDirs, '에이치', '부산');
  const depChem = findImages(depositDirs, '에이치', '부산');
  // 5) 성적서 6장
  const certImages = findImages(expPhotoDirs, '', '부산').concat(findImages(expPhotoDirs, ''));
  // 6) 약품입고 3장 (포도당, 중탄산, PAC)
  const chemGlucose = findImages(chemPhotoDirs, '포도당', '부산');
  const chemSoda = findImages(chemPhotoDirs, '중탄산', '부산');
  const chemPac = findImages(chemPhotoDirs, '팩', '부산').concat(findImages(chemPhotoDirs, 'pac', '부산'));
  // 7) 슬러지 증빙 (청소필증 1/2차, 반출사진 1/2차)
  const cleanCerts = findImages(cleanCertPhotoDirs, '', '부산');
  const sludgePhotos = findImages(sludgePhotoDirs, '', '부산');

  const photoPayload = {
    salesInvoice: invMgmt[0] || null,
    waterInvoice: invWater[0] || null,
    waterDeposit: depWater[0] || null,
    kitInvoice: invKit[0] || null,
    kitDeposit: depKit[0] || null,
    chemInvoice: invChem[0] || null,
    chemDeposit: depChem[0] || null,
    certImages: certImages.slice(0, 6),
    chemPhotos: [chemGlucose[0], chemSoda[0], chemPac[0]].filter(Boolean),
    cleanCert1: cleanCerts[0] || null,
    cleanCert2: cleanCerts[1] || null,
    sludgePhoto1: sludgePhotos[0] || null,
    sludgePhoto2: sludgePhotos[1] || null,
  };

  // 5. PowerShell Excel Automation 스크립트 작성
  const logPath = path.join(os.tmpdir(), `osoo_jukam_log_${Date.now()}.txt`);

  const psScript = `
$ErrorActionPreference = 'Continue'
$workingFile = ${toPowerShellLiteral(tempWorkingPath)}
$logFile = ${toPowerShellLiteral(logPath)}
$photoJson = ${toPowerShellLiteral(JSON.stringify(photoPayload))}

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
  $photos = ConvertFrom-Json $photoJson

  # -------------------------------------------------------------
  # 시트 1: 위탁계약 방식 - 제목 치환
  # -------------------------------------------------------------
  try {
    $wsContract = $wb.Sheets.Item("위탁계약 방식")
    if ($wsContract) {
      $wsContract.Range("R1").Value = "${month}월 오수처리비 정산"
      $wsContract.Range("A1").Value = "${month}월 오수처리비 정산"
      LogMsg "Updated '위탁계약 방식' sheet title to ${month}월"
    }
  } catch {
    LogMsg "Error updating 위탁계약 방식: $($_.Exception.Message)"
  }

  # -------------------------------------------------------------
  # 시트 3: 월간운영일지 - 제목 및 약품 이월/입고량 주입
  # -------------------------------------------------------------
  try {
    $wsLog = $wb.Sheets.Item("월간운영일지")
    if ($wsLog) {
      $wsLog.Range("A2").Value = "죽암(부산)휴게소 ${year}년 ${month}월 운영일지"

      # 약품 이월량 및 입고량 주입 (전월 말일 재고 및 당월 입고)
      $wsLog.Range("D39").Value = 180  # 포도당 이월
      $wsLog.Range("E39").Value = 1000 # 포도당 입고
      $wsLog.Range("D40").Value = 100  # 중탄산 이월
      $wsLog.Range("E40").Value = 300  # 중탄산 입고
      $wsLog.Range("D41").Value = 100  # 팩 이월
      $wsLog.Range("E41").Value = 1000 # 팩 입고
      LogMsg "Updated '월간운영일지' sheet chemicals and title"
    }
  } catch {
    LogMsg "Error updating 월간운영일지: $($_.Exception.Message)"
  }

  # -------------------------------------------------------------
  # 시트 2: 증빙 - 이미지 배치 및 규격 맞춤 (비율 고정 해제)
  # -------------------------------------------------------------
  $wsProof = $wb.Sheets.Item("증빙")
  if ($wsProof) {
    $wsProof.Range("A1").Value = "${month}월  증빙"

    # 이미지 삽입 헬퍼 함수
    function InsertImage($picPath, $top, $left, $widthPt, $heightPt) {
      if (-not $picPath -or -not (Test-Path -LiteralPath $picPath)) { return $null }
      try {
        $shape = $wsProof.Shapes.AddPicture($picPath, 0, 1, $left, $top, $widthPt, $heightPt)
        $shape.LockAspectRatio = 0 # msoFalse: 가로세로 비율 고정 해제!
        $shape.Width = $widthPt
        $shape.Height = $heightPt
        return $shape
      } catch {
        LogMsg "Error inserting picture $picPath : $($_.Exception.Message)"
        return $null
      }
    }

    # 1) 매출계산서 (단독 셀): 높이 5.16cm, 너비 8.03cm
    $wSingle = 8.03 * ${CM_TO_PT}
    $hInvoice = 5.16 * ${CM_TO_PT}
    $hDeposit = 2.80 * ${CM_TO_PT}

    try {
      $rngSales = $wsProof.Range("매출계산서")
      if ($rngSales -and $photos.salesInvoice) {
        InsertImage $photos.salesInvoice $rngSales.Top $rngSales.Left $wSingle $hInvoice | Out-Null
        LogMsg "Inserted 매출계산서"
      }
    } catch { LogMsg "매출계산서 error: $($_.Exception.Message)" }

    # 2) 수질계산입금 (복합 셀): 상단 계산서, 하단 입금표
    try {
      $rngWater = $wsProof.Range("수질계산입금")
      if ($rngWater) {
        if ($photos.waterInvoice) {
          InsertImage $photos.waterInvoice $rngWater.Top $rngWater.Left $wSingle $hInvoice | Out-Null
        }
        if ($photos.waterDeposit) {
          $depTop = $rngWater.Top + $hInvoice + 4
          InsertImage $photos.waterDeposit $depTop $rngWater.Left $wSingle $hDeposit | Out-Null
        }
        LogMsg "Inserted 수질계산입금"
      }
    } catch { LogMsg "수질계산입금 error: $($_.Exception.Message)" }

    # 3) 키트계산 & 키트입금 (단독 셀)
    try {
      $rngKitInv = $wsProof.Range("키트계산")
      if ($rngKitInv -and $photos.kitInvoice) {
        InsertImage $photos.kitInvoice $rngKitInv.Top $rngKitInv.Left $wSingle $hInvoice | Out-Null
      }
      $rngKitDep = $wsProof.Range("키트입금")
      if ($rngKitDep -and $photos.kitDeposit) {
        InsertImage $photos.kitDeposit $rngKitDep.Top $rngKitDep.Left $wSingle $hDeposit | Out-Null
      }
      LogMsg "Inserted 키트계산 & 키트입금"
    } catch { LogMsg "키트 error: $($_.Exception.Message)" }

    # 4) 약품계산입금 (복합 셀): 상단 계산서, 하단 입금표
    try {
      $rngChem = $wsProof.Range("약품계산입금")
      if ($rngChem) {
        if ($photos.chemInvoice) {
          InsertImage $photos.chemInvoice $rngChem.Top $rngChem.Left $wSingle $hInvoice | Out-Null
        }
        if ($photos.chemDeposit) {
          $depTop = $rngChem.Top + $hInvoice + 4
          InsertImage $photos.chemDeposit $depTop $rngChem.Left $wSingle $hDeposit | Out-Null
        }
        LogMsg "Inserted 약품계산입금"
      }
    } catch { LogMsg "약품계산입금 error: $($_.Exception.Message)" }

    # 5) 성적서 6장 (성적서 셀): 3장씩 2줄 그리드 (높이 4.02cm, 너비 2.77cm)
    try {
      $rngCert = $wsProof.Range("성적서")
      if ($rngCert -and $photos.certImages) {
        $wCert = 2.77 * ${CM_TO_PT}
        $hCert = 4.02 * ${CM_TO_PT}
        $gapX = 4
        $gapY = 4

        $cIdx = 0
        foreach ($cp in @($photos.certImages)) {
          if ($cIdx -ge 6) { break }
          $row = [Math]::Floor($cIdx / 3)
          $col = $cIdx % 3
          $pTop = $rngCert.Top + ($row * ($hCert + $gapY))
          $pLeft = $rngCert.Left + ($col * ($wCert + $gapX))
          InsertImage $cp $pTop $pLeft $wCert $hCert | Out-Null
          $cIdx++
        }
        LogMsg "Inserted $($cIdx) 성적서 images"
      }
    } catch { LogMsg "성적서 error: $($_.Exception.Message)" }

    # 6) 약품입고 사진 (약품입고 셀): 포도당, 중탄산, PAC 3장 세로 배치 (높이 8.18cm, 너비 5.29cm)
    try {
      $rngChemPhoto = $wsProof.Range("약품입고")
      if ($rngChemPhoto -and $photos.chemPhotos) {
        $wChemP = 5.29 * ${CM_TO_PT}
        $hChemP = 8.18 * ${CM_TO_PT}
        $gapY = 3

        $cpIdx = 0
        foreach ($cp in @($photos.chemPhotos)) {
          if ($cpIdx -ge 3) { break }
          $pTop = $rngChemPhoto.Top + ($cpIdx * ($hChemP + $gapY))
          $pLeft = $rngChemPhoto.Left
          InsertImage $cp $pTop $pLeft $wChemP $hChemP | Out-Null
          $cpIdx++
        }
        LogMsg "Inserted $($cpIdx) 약품입고 images"
      }
    } catch { LogMsg "약품입고 error: $($_.Exception.Message)" }

    # 7) 슬러지 청소필증 & 반출사진 (1회차/2회차)
    try {
      $wSludge = 8.03 * ${CM_TO_PT}
      $hSludge = 5.16 * ${CM_TO_PT}
      
      $rngClean1 = $wsProof.Range("청소필증1")
      if ($rngClean1 -and $photos.cleanCert1) {
        InsertImage $photos.cleanCert1 $rngClean1.Top $rngClean1.Left $wSludge $hSludge | Out-Null
      }
      $rngPhoto1 = $wsProof.Range("반출사진1")
      if ($rngPhoto1 -and $photos.sludgePhoto1) {
        InsertImage $photos.sludgePhoto1 $rngPhoto1.Top $rngPhoto1.Left $wSludge $hSludge | Out-Null
      }
      $rngClean2 = $wsProof.Range("청소필증2")
      if ($rngClean2 -and $photos.cleanCert2) {
        InsertImage $photos.cleanCert2 $rngClean2.Top $rngClean2.Left $wSludge $hSludge | Out-Null
      }
      $rngPhoto2 = $wsProof.Range("반출사진2")
      if ($rngPhoto2 -and $photos.sludgePhoto2) {
        InsertImage $photos.sludgePhoto2 $rngPhoto2.Top $rngPhoto2.Left $wSludge $hSludge | Out-Null
      }
      LogMsg "Inserted 슬러지 증빙 photos"
    } catch { LogMsg "슬러지 증빙 error: $($_.Exception.Message)" }
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
  const tempScriptPath = path.join(os.tmpdir(), `osoo_jukam_${Date.now()}_${Math.random().toString(36).substring(7)}.ps1`);
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

        if (error) {
          console.error('[jukamSettlementService] PowerShell 실행 실패:', error, stderr);
          try { if (fs.existsSync(tempWorkingPath)) fs.unlinkSync(tempWorkingPath); } catch (_) {}
          return reject(new Error(`죽암 엑셀 정산서 생성 실패: ${error.message}`));
        }

        try {
          fs.copyFileSync(tempWorkingPath, finalReportPath);
          try { if (fs.existsSync(tempWorkingPath)) fs.unlinkSync(tempWorkingPath); } catch (_) {}

          console.log(`[jukamSettlementService] 죽암 정산서 엑셀 파일 생성 완료: ${finalReportPath}`);
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
};

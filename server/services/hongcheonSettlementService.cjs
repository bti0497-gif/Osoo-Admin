/**
 * 홍천휴게소(양양방향) 월별 정산 보고서 자동 생성 서비스
 * 
 * [규격 및 로직]
 * 1. 템플릿: template_hongcheon_yangyang_excel.xlsx (또는 template_hongcheon_yangyang.xlsx)
 * 2. 13개 시트 구조:
 *    - '2026년도 01월' ~ '2026년도 12월' (12개 월별 시트)
 *    - '2026년 총괄(홍천 양양)' (1개 연간 총괄 시트)
 * 3. 총괄 시트 누적 바인딩:
 *    - 기본 빈 양식에는 '월금액1'($C$8:$H$9)만 입력되어 있으므로,
 *    - '월금액1'의 수식/서식을 '월금액2'부터 해당월('월금액m')까지 순서대로 누적 복사(Range.Copy)
 * 4. 시트 표시 상태 제어:
 *    - 해당월 시트(예: '2026년도 08월')만 Visible = -1 (xlSheetVisible)
 *    - 나머지 11개 월별 시트는 Visible = 0 (xlSheetHidden)
 *    - '2026년 총괄(홍천 양양)' 시트는 항상 표시 (Visible = -1)
 *    - 해당월 시트를 활성 시트(Select)로 지정
 * 5. 출력 저장 위치:
 *    - 정규 경로: 바탕화면 > 월정산 > 홍천마감자료 > YYYYMM > 홍천(양양)휴게소_${yy}년 ${month}월 오수정화조 임대료 정산보고서.xlsx
 *    - 바탕화면 루트: 바탕화면 바로 위 동시 복사 보존
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { getTemplateFilePath } = require('./settlementService.cjs');

/**
 * 사용자 바탕화면(OneDrive 포함) 경로 탐색
 */
function findDesktopPath() {
  const homeDir = process.env.USERPROFILE || 'C:\\Users\\ASUS';
  const candidates = [
    path.join(homeDir, 'OneDrive', '바탕 화면'),
    path.join(homeDir, 'Desktop'),
    path.join(homeDir, 'OneDrive', 'Desktop'),
  ];
  for (const cand of candidates) {
    if (fs.existsSync(cand)) return cand;
  }
  return path.join(homeDir, 'Desktop');
}

/**
 * 홍천(양양) 엑셀 정산서 자동 생성
 */
async function generateHongcheonExcelReport(year, month) {
  const numYear = Number(year) || 2026;
  const numMonth = Number(month) || 8;
  const targetMonthStr = String(numMonth).padStart(2, '0');
  const yy = String(numYear).slice(-2);

  // 1. 템플릿 파일 탐색 (AppData 최우선)
  let tplPath = getTemplateFilePath('template_hongcheon_yangyang_excel.xlsx');
  if (!tplPath || !fs.existsSync(tplPath)) {
    tplPath = getTemplateFilePath('template_hongcheon_yangyang.xlsx');
  }
  if (!tplPath || !fs.existsSync(tplPath)) {
    throw new Error('홍천휴게소 엑셀 기본 빈 양식 파일(template_hongcheon_yangyang_excel.xlsx)을 찾을 수 없습니다.');
  }

  // 2. 저장 경로 및 파일명 결정
  const desktopPath = findDesktopPath();
  const outputFileName = `홍천(양양)휴게소_${yy}년 ${numMonth}월 오수정화조 임대료 정산보고서.xlsx`;
  const targetFolder = path.join(desktopPath, '월정산', '홍천마감자료', `${numYear}${targetMonthStr}`);
  if (!fs.existsSync(targetFolder)) {
    fs.mkdirSync(targetFolder, { recursive: true });
  }
  const targetFilePath = path.join(targetFolder, outputFileName);
  const desktopFilePath = path.join(desktopPath, outputFileName);

  // 3. PowerShell 스크립트 작성 (UTF-8 BOM 포함)
  const targetSheetName = `${numYear}년도 ${targetMonthStr}월`;
  const psScript = `\ufeff
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$excel.ScreenUpdating = $false

try {
  $wb = $excel.Workbooks.Open('${tplPath.replace(/'/g, "''")}')

  # 1. 총괄 시트 누적 월금액 복사 (월금액1 -> 월금액2 ~ 월금액${numMonth})
  $rng1 = $wb.Names.Item('월금액1').RefersToRange
  for ($m = 2; $m -le ${numMonth}; $m++) {
    $targetName = "월금액$m"
    try {
      $rngM = $wb.Names.Item($targetName).RefersToRange
      $rng1.Copy($rngM)
    } catch {
      Write-Warning "월금액 복사 실패: $targetName ($($_.Exception.Message))"
    }
  }

  # 2. 13개 시트 표시/숨김 제어
  $targetSheet = "${targetSheetName}"
  $found = $false
  foreach ($sh in $wb.Sheets) {
    $cleanName = $sh.Name.Trim()
    if ($cleanName -match '^\\d{4}년도\\s*\\d{1,2}월$') {
      if ($cleanName -eq $targetSheet) {
        $sh.Visible = -1 # xlSheetVisible
        $found = $true
      } else {
        $sh.Visible = 0  # xlSheetHidden
      }
    } elseif ($cleanName -like "*총괄*") {
      $sh.Visible = -1 # 총괄 시트는 항상 표시
    }
  }

  if ($found) {
    $wb.Sheets.Item($targetSheet).Select()
  }

  # 3. 저장
  if (Test-Path '${targetFilePath.replace(/'/g, "''")}') {
    Remove-Item -Force '${targetFilePath.replace(/'/g, "''")}'
  }
  # 51 = xlOpenXMLWorkbook (.xlsx)
  $wb.SaveAs('${targetFilePath.replace(/'/g, "''")}', 51)
  $wb.Close($false)
  Write-Output "SUCCESS"
} finally {
  $excel.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
}
`;

  const tempPsPath = path.join(path.dirname(targetFilePath), `_run_hongcheon_${Date.now()}.ps1`);
  fs.writeFileSync(tempPsPath, psScript, 'utf8');

  return new Promise((resolve, reject) => {
    exec(`powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${tempPsPath}"`, { encoding: 'utf8' }, (err, stdout, stderr) => {
      try { if (fs.existsSync(tempPsPath)) fs.unlinkSync(tempPsPath); } catch (e) {}

      if (err) {
        return reject(new Error(`홍천 엑셀 생성 실패: ${err.message}\n${stderr || stdout}`));
      }

      // 4. 바탕화면 바로 위에도 동시 복사
      try {
        fs.copyFileSync(targetFilePath, desktopFilePath);
      } catch (copyErr) {
        console.warn('[hongcheonSettlementService] 바탕화면 동시 복사 경고:', copyErr.message);
      }

      resolve({
        success: true,
        fileName: outputFileName,
        savedPath: targetFilePath,
        desktopPath: desktopFilePath,
        year: numYear,
        month: numMonth,
      });
    });
  });
}

module.exports = {
  generateHongcheonExcelReport,
};

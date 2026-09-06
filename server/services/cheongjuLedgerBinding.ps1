# Loaded as UTF-8 by the generated automation script.
function Get-CellText($cell) {
  return (($cell.SelectNodes('./PARALIST/P/TEXT/CHAR') | ForEach-Object { $_.InnerText }) -join '').Trim()
}

function Set-LedgerCell($cell, [string]$value) {
  if ($null -eq $cell) { throw 'Missing ledger cell' }
  # Preserve paragraphs, character styles, bookmarks and the table itself.
  $chars = @($cell.SelectNodes('./PARALIST/P/TEXT/CHAR'))
  if ($chars.Count -gt 0) {
    $chars[0].InnerText = $value
    for ($i = 1; $i -lt $chars.Count; $i++) { $chars[$i].InnerText = '' }
  } else {
    $textNode = $cell.SelectSingleNode('./PARALIST/P/TEXT')
    if ($null -eq $textNode) { throw 'Cell text container is missing' }
    $charNode = $cell.OwnerDocument.CreateElement('CHAR')
    $charNode.InnerText = $value
    [void]$textNode.AppendChild($charNode)
  }
}

function Set-CheongjuLedgers($hwp, $bindings, $sludge, [int]$year, [int]$month, $workingDoc) {
  [xml]$doc = $hwp.GetTextFile('HWPML2X', '')
  $tables = @($doc.SelectNodes('//TABLE'))
  # The month bookmark splits '(7월)' into separate character runs.
  $monthMarks = @($doc.SelectNodes('//BOOKMARK') | Where-Object { $_.GetAttribute('Name') -eq '약품관리대장월' })
  if ($monthMarks.Count -ne 1) { throw 'Medicine ledger month bookmark missing/duplicated' }
  $monthText = $monthMarks[0].SelectSingleNode('following-sibling::CHAR[1]')
  if ($null -eq $monthText -or $monthText.InnerText -notmatch '^\d+월') { throw 'Medicine ledger month text missing' }
  $monthText.InnerText = $monthText.InnerText -replace '^\d+월', "${month}월"
  $expected = [System.Collections.Generic.List[object]]::new()
  function Set-TrackedCell($table, $cell, [string]$value, [string]$label) {
    $index = -1
    for ($i=0; $i -lt $tables.Count; $i++) { if ([object]::ReferenceEquals($tables[$i], $table)) { $index=$i; break } }
    if ($index -lt 0) { throw 'Unrecognized table' }
    Set-LedgerCell $cell $value
    $expected.Add(@{ table=$index; row=[int]$cell.RowAddr; col=[int]$cell.ColAddr; value=$value; label=$label })
  }
  foreach ($binding in $bindings) {
    $nodes = @($doc.SelectNodes('//BOOKMARK') | Where-Object { $_.GetAttribute('Name') -eq $binding.bookmark })
    if ($nodes.Count -ne 1) { throw "Required bookmark missing/duplicated: $($binding.bookmark)" }
    $cell = $nodes[0].SelectSingleNode('ancestor::CELL[1]')
    $table = $cell.SelectSingleNode('ancestor::TABLE[1]')
    if ($table.ColCount -ne '5') { throw "Unexpected ledger table: $($binding.bookmark)" }
    $head = $table.SelectSingleNode("./ROW/CELL[@RowAddr='0'][@ColAddr='$($cell.ColAddr)']")
    if (((Get-CellText $head) -replace '\s','') -ne $binding.header) { throw "Wrong column for $($binding.bookmark)" }
    Set-TrackedCell $table $cell ([string]$binding.value) $binding.bookmark
  }
  $sludgeTables = @($tables | Where-Object {
    $_.ColCount -eq '6' -and $_.SelectNodes('./ROW/CELL').Count -gt 100 -and
    ($_.InnerText -match '업체명') -and ($_.InnerText -match '중량')
  })
  if ($sludgeTables.Count -ne 1) { throw 'Sludge ledger table is missing/ambiguous' }
  $table = $sludgeTables[0]
  $events = @{}
  foreach ($item in $sludge) {
    if ($events.ContainsKey([int]$item.dayNum)) { throw 'Duplicate sludge day' }
    $events[[int]$item.dayNum] = $item
  }
  $days = [DateTime]::DaysInMonth($year, $month)
  $seenDays = @{}
  foreach ($cell in @($table.SelectNodes('./ROW/CELL[@ColAddr="1"]'))) {
    $text = Get-CellText $cell
    if ($text -notmatch '^\s*\d+월\s*(\d+)일\s*$') { continue }
    $day = [int]$Matches[1]
    if ($seenDays.ContainsKey($day)) { throw 'Duplicate day row in template' }
    $seenDays[$day] = $true
    Set-TrackedCell $table $cell $(if ($day -le $days) { "${month}월 ${day}일" } else { '' }) "sludge-date-$day"
    $event = $events[$day]
    $values = @('', '', '', '')
    if ($null -ne $event -and $day -le $days) { $values = @([string]$event.vendor, [string]$event.time, [string]$event.weight, '') }
    for ($col=2; $col -le 5; $col++) {
      $target = $table.SelectSingleNode("./ROW/CELL[@RowAddr='$($cell.RowAddr)'][@ColAddr='$col']")
      Set-TrackedCell $table $target $values[$col-2] "sludge-$day-$col"
    }
  }
  for ($day=1; $day -le $days; $day++) { if (-not $seenDays.ContainsKey($day)) { throw "Missing sludge day $day" } }
  $xmlPath = "$workingDoc.binding.xml"
  try {
    # HWPML's importer treats pretty-print whitespace as document content.
    # Compact XML avoids inflating blank cells and pushing rows off the page.
    $settings = [System.Xml.XmlWriterSettings]::new()
    $settings.Indent = $false
    $settings.Encoding = [System.Text.UTF8Encoding]::new($false)
    $writer = [System.Xml.XmlWriter]::Create($xmlPath, $settings)
    try { $doc.WriteTo($writer) } finally { $writer.Dispose() }
    $hwp.Clear(1) | Out-Null
    if (-not $hwp.Open($xmlPath, 'HWPML2X', 'lock:false')) { throw 'Bound document import failed' }
  } finally { if (Test-Path -LiteralPath $xmlPath) { Remove-Item -LiteralPath $xmlPath -Force } }
  LogMsg "LEDGER BIND: $($expected.Count) exact cells prepared"
  return ,$expected
}

function Test-CheongjuLedgers($hwp, $expected) {
  [xml]$doc = $hwp.GetTextFile('HWPML2X', '')
  $tables = @($doc.SelectNodes('//TABLE'))
  $failures = @()
  foreach ($entry in $expected) {
    $cell = $tables[$entry.table].SelectSingleNode("./ROW/CELL[@RowAddr='$($entry.row)'][@ColAddr='$($entry.col)']")
    $actual = if ($null -eq $cell) { '<missing>' } else { Get-CellText $cell }
    if ($actual -ne $entry.value) { $failures += "$($entry.label): expected '$($entry.value)', actual '$actual'" }
  }
  if ($failures.Count) { throw ($failures -join '; ') }
  LogMsg "LEDGER VERIFIED: $($expected.Count)/$($expected.Count) exact cells after reopen"
}

function Test-CheongjuEvidence($hwp, $tasks) {
  [xml]$doc = $hwp.GetTextFile('HWPML2X', '')
  foreach ($name in @('관리비계산서', '수질검사명세서', '약품명세서', '키트명세서', '슬러지계산서', '슬러지입금표')) {
    $task = @($tasks | Where-Object { $_.bookmarks -contains $name })[0]
    $count = @($task.files).Count
    if ($count -eq 0) { continue }
    $marks = @($doc.SelectNodes('//BOOKMARK') | Where-Object { $_.GetAttribute('Name') -eq $name })
    if ($name -eq '약품명세서' -and $marks.Count -eq 0) {
      $anchors = @($doc.SelectNodes('//BOOKMARK') | Where-Object { $_.GetAttribute('Name') -eq '약품계산서' })
      if ($anchors.Count -ne 1) { throw 'Chemical statement anchor missing/duplicated' }
      $anchorCell = $anchors[0].SelectSingleNode('ancestor::CELL[1]')
      $table = $anchorCell.SelectSingleNode('ancestor::TABLE[1]')
      $cell = $table.SelectSingleNode("./ROW/CELL[@RowAddr='$($anchorCell.RowAddr)'][@ColAddr='$([int]$anchorCell.ColAddr-1)']")
    } else {
    if ($marks.Count -ne 1) { throw "Evidence bookmark missing/duplicated: $name" }
    $cell = $marks[0].SelectSingleNode('ancestor::CELL[1]')
    }
    $actual = $cell.SelectNodes('.//PICTURE').Count
    if ($actual -ne $count) { throw "Evidence count mismatch ${name}: expected $count, actual $actual" }
    LogMsg "EVIDENCE VERIFIED: $name $actual/$count"
  }
}

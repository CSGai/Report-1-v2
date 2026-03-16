# claud ai coming in clutch because i didn't want to make a node console application
# mostly to see if it could and this ended up pretty good after like 20 minutes of debugging

param(
    [string]$JsonFile  = ".\calanderAPI\weeklyCalanderPlan.json",
    [string]$CodesFile = ".\calanderAPI\CalanderCodes.json"
)

& cmd /c "chcp 65001" | Out-Null
$host.UI.RawUI.WindowTitle = "Weekly JSON Editor"

function PSObjectToHashtable($obj) {
    $ht = @{}
    foreach ($prop in $obj.PSObject.Properties) {
        if ($prop.Value -is [System.Management.Automation.PSCustomObject]) {
            $ht[$prop.Name] = PSObjectToHashtable $prop.Value
        } else {
            $ht[$prop.Name] = $prop.Value
        }
    }
    return $ht
}

function Reverse-String($s) {
    return -join $s.ToCharArray()[$s.Length..0]
}

function Get-Val($obj, $key, $default) {
    if ($obj -ne $null -and $obj[$key] -ne $null -and $obj[$key] -ne "") {
        return $obj[$key]
    }
    return $default
}

function Show-Menu($fieldName, $labels, $currentLabel) {
    Write-Host ""
    Write-Host ("  " + $fieldName) -ForegroundColor White

    for ($i = 0; $i -lt $labels.Count; $i++) {
        $marker = if ($labels[$i] -eq $currentLabel) { "*" } else { " " }
        $num    = "{0,2}" -f ($i + 1)
        Write-Host ("  " + $marker + " " + $num + ")  " + (Reverse-String $labels[$i]))
    }

    $keepHint = if ($currentLabel) { Reverse-String $currentLabel } else { "none" }
    Write-Host ""
    $input = Read-Host ("  Pick [1-" + $labels.Count + "] or Enter to keep [" + $keepHint + "]")

    if ($input -eq "") { return -1 }

    $n = 0
    if ([int]::TryParse($input, [ref]$n) -and $n -ge 1 -and $n -le $labels.Count) {
        return ($n - 1)
    }

    Write-Host "  Invalid - keeping current." -ForegroundColor Red
    return -1
}

# ── Load codes ───────────────────────────────────────────────

if (-not (Test-Path $CodesFile)) {
    Write-Host ("Codes file not found: " + $CodesFile) -ForegroundColor Red
    exit 1
}

$codesRaw  = Get-Content $CodesFile -Raw -Encoding UTF8 | ConvertFrom-Json
$codes     = PSObjectToHashtable $codesRaw
$primaries = $codes.primaries

# ── Load data ────────────────────────────────────────────────

if (Test-Path $JsonFile) {
    $raw  = Get-Content $JsonFile -Raw -Encoding UTF8 | ConvertFrom-Json
    $data = PSObjectToHashtable $raw
} else {
    $data = @{}
}

# ── Helpers ──────────────────────────────────────────────────

function Find-PrimaryLabel($code) {
    foreach ($label in $primaries.Keys) {
        $c = if ($primaries[$label]["code"] -ne $null) { $primaries[$label]["code"] } else { $primaries[$label]["codes"] }
        if ($c -eq $code) { return $label }
    }
    return $null
}

function Find-SecondaryLabel($secMap, $code) {
    foreach ($label in $secMap.Keys) {
        if ($secMap[$label] -eq $code) { return $label }
    }
    return $null
}

# ── Main loop ────────────────────────────────────────────────

$days = "Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"

foreach ($day in $days) {
    Write-Host ""
    Write-Host ("==== " + $day + " ====") -ForegroundColor Cyan

    $cur         = $data[$day]
    $curMainCode = Get-Val $cur "MainCode"         "02"
    $curSecCode  = Get-Val $cur "SecondaryCode"    ""
    $curNote     = Get-Val $cur "Note"             ""
    $curDate     = Get-Val $cur "FutureReportDate" "dd.mm.20YY"

    $curMainLabel = Find-PrimaryLabel $curMainCode

    # Pick primary
    $primaryLabels = @($primaries.Keys)
    $idx = Show-Menu "MainCode" $primaryLabels $curMainLabel
    if ($idx -ge 0) { $curMainLabel = $primaryLabels[$idx] }

    $primaryEntry = $primaries[$curMainLabel]
    $mainCode     = if ($primaryEntry["code"] -ne $null) { $primaryEntry["code"] } else { $primaryEntry["codes"] }

    # Pick secondary filtered to chosen primary
    $secMap      = $primaryEntry["secondaries"]
    $secLabels   = @($secMap.Keys)
    $curSecLabel = Find-SecondaryLabel $secMap $curSecCode
    if (-not $curSecLabel) { $curSecLabel = $secLabels[0] }

    $idx2 = Show-Menu "SecondaryCode" $secLabels $curSecLabel
    if ($idx2 -ge 0) { $curSecLabel = $secLabels[$idx2] }

    $secCode = $secMap[$curSecLabel]

    # Note
    Write-Host ""
    $note = Read-Host ("  Note [" + $curNote + "]")
    if ($note -eq "") { $note = $curNote }

    $data[$day] = @{
        MainCode         = $mainCode
        SecondaryCode    = $secCode
        Note             = $note
        FutureReportDate = $curDate
    }
}

# ── Save (ordered) ────────────────────────────────────────────

$ordered = [ordered]@{}
foreach ($day in $days) {
    $d = $data[$day]
    $ordered[$day] = [ordered]@{
        MainCode         = $d["MainCode"]
        SecondaryCode    = $d["SecondaryCode"]
        Note             = $d["Note"]
        FutureReportDate = $d["FutureReportDate"]
    }
}

$ordered | ConvertTo-Json -Depth 5 | Set-Content -Path $JsonFile -Encoding UTF8
Write-Host ""
Write-Host ("Saved to " + $JsonFile) -ForegroundColor Green
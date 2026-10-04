param(
    [Parameter(Mandatory=$true)][string]$Adb,
    [Parameter(Mandatory=$true)][string]$Aapt,
    [string[]]$Emulators = @('emulator-5554','emulator-5556'),
    [string]$Apk = (Join-Path (Split-Path $PSScriptRoot -Parent) 'app/build/outputs/apk/debug/app-debug.apk')
)
$ErrorActionPreference = 'Stop'
$package = 'com.eladbiller.knightline.gpt'
# Validate the entire target list before invoking ADB. Never deploy by default
# device selection, never accept a physical serial, and never clear app data.
if (!$Emulators.Count -or @($Emulators | Where-Object { $_ -notmatch '^emulator-[0-9]+$' }).Count) {
    throw 'GPT test installation is restricted to explicitly named emulators.'
}
$badging = (& $Aapt dump badging $Apk) -join "`n"
if ($LASTEXITCODE -ne 0 -or $badging -notmatch "(?m)^package: name='com\.eladbiller\.knightline\.gpt'") {
    throw 'Refusing to install: APK does not have the separate GPT package ID.'
}
foreach ($serial in $Emulators) {
    $emulated = (& $Adb -s $serial shell getprop ro.kernel.qemu).Trim()
    if ($LASTEXITCODE -ne 0 -or $emulated -ne '1') { throw "Not a verified Android emulator: $serial" }
}
foreach ($serial in $Emulators) {
    & $Adb -s $serial install -r $Apk
    if ($LASTEXITCODE -ne 0) { throw "GPT installation failed on $serial" }
    & $Adb -s $serial shell am start -n "$package/com.traillink.KnightlineActivity"
    if ($LASTEXITCODE -ne 0) { throw "GPT launch failed on $serial" }
}

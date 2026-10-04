$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$compiled = Join-Path $repo 'app/build/intermediates/javac/debug/compileDebugJavaWithJavac/classes'
$testOutput = Join-Path $repo 'app/build/bluetooth-test-classes'
New-Item -ItemType Directory -Force -Path $testOutput | Out-Null
# These fakes are test-only and never enter the APK. Compile the actual transport
# source, allowing regression reproduction before another Android build.
$sources = @(Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'bluetooth-fakes') -Recurse -Filter '*.java' | ForEach-Object FullName)
$sources += Join-Path $repo 'app/src/main/java/com/traillink/BluetoothLink.java'
$sources += Join-Path $repo 'app/build/generated/source/buildConfig/debug/com/eladbiller/knightline/BuildConfig.java'
$sources += Join-Path $PSScriptRoot 'com/traillink/BluetoothLifecycleTest.java'
& javac -encoding UTF-8 -cp $compiled -d $testOutput $sources
if ($LASTEXITCODE -ne 0) { throw 'Bluetooth test compilation failed.' }
& java -cp "$testOutput$([IO.Path]::PathSeparator)$compiled" com.traillink.BluetoothLifecycleTest
if ($LASTEXITCODE -ne 0) { throw 'Bluetooth lifecycle test failed.' }

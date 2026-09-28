param([string]$Sdk='D:\CodexAndroidTest\android-sdk')
$ErrorActionPreference='Stop'
$projectDir=$PSScriptRoot
$appBuild=(Resolve-Path (Join-Path $projectDir '..\..\work\chesslink-build')).Path
$buildDir=Join-Path $appBuild 'flow-tests'
$jdkDir=Join-Path $Sdk 'jdk\jdk-17.0.20.1+1'
$env:JAVA_HOME=$jdkDir
$bt=Join-Path $Sdk 'build-tools\35.0.0'
$androidJar=Join-Path $Sdk 'platforms\android-35\android.jar'
New-Item -ItemType Directory -Force -Path "$buildDir\classes","$buildDir\dex" | Out-Null
$appClasses=Join-Path $appBuild 'classes.jar'
# The Android test compiler needs the packaged app classpath so it sees the
# same generated-resource classes as the target APK.
$appJar=$appClasses
function Check([string]$step){if($LASTEXITCODE -ne 0){throw "$step failed ($LASTEXITCODE)"}}
& "$bt\aapt2.exe" link -o "$buildDir\base.apk" --manifest "$projectDir\tests\ChessLinkAndroidManifest.xml" -I $androidJar
Check 'Flow test resources'
$sources=@(
    "$projectDir\tests\com\traillink\ChessLinkFlowDeviceTests.java",
    "$projectDir\tests\com\traillink\LearningTest.java",
    "$projectDir\tests\com\traillink\GameTest.java",
    "$projectDir\tests\com\traillink\TimelineTest.java",
    "$projectDir\tests\com\traillink\V3Test.java",
    "$projectDir\tests\com\traillink\UpgradeTest.java"
)
& "$jdkDir\bin\javac.exe" -encoding UTF-8 -source 8 -target 8 -classpath "$androidJar;$appJar" -d "$buildDir\classes" $sources
Check 'Flow test compilation'
& "$jdkDir\bin\jar.exe" cf "$buildDir\classes.jar" -C "$buildDir\classes" .
& "$bt\d8.bat" --lib $androidJar --classpath "$appBuild\classes.jar" --min-api 26 --output "$buildDir\dex" "$buildDir\classes.jar"
Check 'Flow test dex'
& "$jdkDir\bin\jar.exe" uf "$buildDir\base.apk" -C "$buildDir\dex" classes.dex
& "$bt\zipalign.exe" -f 4 "$buildDir\base.apk" "$buildDir\aligned.apk"
& "$bt\apksigner.bat" sign --ks "$projectDir\..\..\work\chesslink-signing\development.jks" --ks-pass pass:android --key-pass pass:android --out "$projectDir\..\..\work\ChessLink-flow-tests.apk" "$buildDir\aligned.apk"
Check 'Flow test signing'
& "$bt\apksigner.bat" verify --verbose "$projectDir\..\..\work\ChessLink-flow-tests.apk"
Check 'Flow test verification'
Write-Output 'Built work/ChessLink-flow-tests.apk'

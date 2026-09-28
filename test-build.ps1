param([string]$Sdk='D:\CodexAndroidTest\android-sdk')
$ErrorActionPreference='Stop'
$projectDir=$PSScriptRoot
$appBuild=Join-Path $projectDir '..\..\work\traillink-build'
$buildDir=Join-Path $appBuild 'tests'
$jdkDir=Join-Path $Sdk 'jdk\jdk-17.0.20.1+1'
$env:JAVA_HOME=$jdkDir
$bt=Join-Path $Sdk 'build-tools\35.0.0'
$androidJar=Join-Path $Sdk 'platforms\android-35\android.jar'
New-Item -ItemType Directory -Force -Path "$buildDir\classes","$buildDir\dex" | Out-Null
function Check([string]$s){if($LASTEXITCODE -ne 0){throw "$s failed"}}
& "$bt\aapt2.exe" link -o "$buildDir\base.apk" --manifest "$projectDir\tests\AndroidManifest.xml" -I $androidJar
Check 'Test resources'
$sources=@(Get-ChildItem "$projectDir\tests" -Filter '*.java' -Recurse | ForEach-Object FullName)
& "$jdkDir\bin\javac.exe" -encoding UTF-8 -source 8 -target 8 -classpath "$androidJar;$appBuild\classes" -d "$buildDir\classes" $sources
Check 'Test compilation'
& "$jdkDir\bin\jar.exe" cf "$buildDir\classes.jar" -C "$buildDir\classes" .
& "$bt\d8.bat" --lib $androidJar --classpath "$appBuild\classes.jar" --min-api 26 --output "$buildDir\dex" "$buildDir\classes.jar"
Check 'Test dex'
& "$jdkDir\bin\jar.exe" uf "$buildDir\base.apk" -C "$buildDir\dex" classes.dex
& "$bt\zipalign.exe" -f 4 "$buildDir\base.apk" "$buildDir\aligned.apk"
& "$bt\apksigner.bat" sign --ks "$projectDir\..\..\work\traillink-signing\development.jks" --ks-pass pass:android --key-pass pass:android --out "$projectDir\..\..\work\TrailLink-tests.apk" "$buildDir\aligned.apk"
Check 'Test signing'

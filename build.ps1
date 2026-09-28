param([string]$Sdk='D:\CodexAndroidTest\android-sdk')
$ErrorActionPreference='Stop'
$projectDir=$PSScriptRoot
$buildDir=Join-Path $projectDir '..\..\work\chesslink-build'
$jdkDir=Join-Path $Sdk 'jdk\jdk-17.0.20.1+1'
$env:JAVA_HOME=$jdkDir
$env:PATH="$jdkDir\bin;$env:PATH"
$bt=Join-Path $Sdk 'build-tools\35.0.0'
$androidJar=Join-Path $Sdk 'platforms\android-35\android.jar'
New-Item -ItemType Directory -Force -Path "$buildDir\classes","$buildDir\dex","$buildDir\res","$buildDir\gen" | Out-Null
function Check([string]$step){if($LASTEXITCODE -ne 0){throw "$step failed ($LASTEXITCODE)"}}
& "$bt\aapt2.exe" compile --dir "$projectDir\res" -o "$buildDir\resources.zip"
Check 'Resource compilation'
if(!(Test-Path -LiteralPath "$projectDir\native\lib\arm64-v8a\libstockfish.so")){throw 'Run build-stockfish.ps1 first.'}
& "$bt\aapt2.exe" link -o "$buildDir\base.apk" --manifest "$projectDir\AndroidManifest.xml" -I $androidJar --java "$buildDir\gen" "$buildDir\resources.zip"
Check 'Resource linking'
$sources=@(Get-ChildItem "$projectDir\src","$buildDir\gen" -Filter '*.java' -Recurse | ForEach-Object FullName)
& "$jdkDir\bin\javac.exe" -encoding UTF-8 -source 8 -target 8 -classpath $androidJar -d "$buildDir\classes" $sources
Check 'Java compilation'
& "$jdkDir\bin\jar.exe" cf "$buildDir\classes.jar" -C "$buildDir\classes" .
Check 'Class archive'
& "$bt\d8.bat" --lib $androidJar --min-api 26 --output "$buildDir\dex" "$buildDir\classes.jar"
Check 'Dex compilation'
Copy-Item -LiteralPath "$buildDir\base.apk" -Destination "$buildDir\unsigned.apk" -Force
& "$jdkDir\bin\jar.exe" uf "$buildDir\unsigned.apk" -C "$buildDir\dex" classes.dex
Check 'APK assembly'
& "$jdkDir\bin\jar.exe" uf "$buildDir\unsigned.apk" -C "$projectDir\native" lib -C "$projectDir" assets
Check 'Stockfish packaging'
& "$bt\zipalign.exe" -P 16 -f 4 "$buildDir\unsigned.apk" "$buildDir\aligned.apk"
Check 'APK alignment'
$keyDir=Join-Path $projectDir '..\..\work\chesslink-signing'
New-Item -ItemType Directory -Force -Path $keyDir | Out-Null
$key=Join-Path $keyDir 'development.jks'
if(!(Test-Path -LiteralPath $key)){& "$jdkDir\bin\keytool.exe" -genkeypair -keystore $key -storepass android -keypass android -alias chesslink -keyalg RSA -keysize 2048 -validity 10000 -dname 'CN=ChessLink Development';Check 'Signing key generation'}
& "$bt\apksigner.bat" sign --ks $key --ks-pass pass:android --key-pass pass:android --out "$projectDir\..\ChessLink.apk" "$buildDir\aligned.apk"
Check 'APK signing'
& "$bt\apksigner.bat" verify --verbose "$projectDir\..\ChessLink.apk"
Check 'APK verification'
Write-Output 'Built outputs/ChessLink.apk'

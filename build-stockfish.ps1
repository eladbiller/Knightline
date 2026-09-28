param([string]$Sdk='D:\CodexAndroidTest\android-sdk')
$ErrorActionPreference='Stop'
$taskNdk=Join-Path $Sdk 'ndk\27.2.12479018'
$taskBin=Join-Path $taskNdk 'toolchains\llvm\prebuilt\windows-x86_64\bin'
$taskSource=Join-Path $PSScriptRoot 'third_party\stockfish\src'
$taskNet=Join-Path $PSScriptRoot 'assets\stockfish\nn-5af11540bbfe.nnue'
if(!(Test-Path -LiteralPath "$taskBin\clang++.exe")){throw 'Install Android NDK 27.2.12479018 before building Stockfish.'}
if((Get-FileHash -LiteralPath $taskNet).Hash -notlike '5AF11540BBFE*'){throw 'Stockfish network hash mismatch.'}
$taskSources=@(Get-ChildItem -LiteralPath $taskSource -Filter '*.cpp' -Recurse | ForEach-Object FullName)
$taskTargets=@(
 @{Abi='armeabi-v7a';Target='armv7a-linux-androideabi26';Flags=@('-DUSE_NEON','-mfpu=neon')},
 @{Abi='arm64-v8a';Target='aarch64-linux-android26';Flags=@('-DIS_64BIT','-DUSE_NEON')},
 @{Abi='x86_64';Target='x86_64-linux-android26';Flags=@('-DIS_64BIT','-DUSE_SSE2','-msse2')}
)
foreach($taskTarget in $taskTargets){
 $taskOut=Join-Path $PSScriptRoot ("native\lib\"+$taskTarget.Abi)
 New-Item -ItemType Directory -Force -Path $taskOut | Out-Null
 $taskFlags=@(('--target='+$taskTarget.Target),'-std=c++17','-O3','-DNDEBUG','-DNNUE_EMBEDDING_OFF','-fPIE','-pie','-pthread','-static-libstdc++','-Wl,-z,max-page-size=16384')+$taskTarget.Flags
 & "$taskBin\clang++.exe" @taskFlags @taskSources '-latomic' '-lm' '-o' "$taskOut\libstockfish.so"
 if($LASTEXITCODE -ne 0){throw ("Stockfish compilation failed: "+$taskTarget.Abi)}
 & "$taskBin\llvm-strip.exe" "$taskOut\libstockfish.so"
 if($LASTEXITCODE -ne 0){throw 'Stockfish stripping failed'}
 Write-Output ("Built Stockfish 16: "+$taskTarget.Abi)
}

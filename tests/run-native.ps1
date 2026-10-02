$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$compiled = Join-Path $repo 'app/build/intermediates/javac/debug/compileDebugJavaWithJavac/classes'
$testOutput = Join-Path $repo 'app/build/native-test-classes'
if (!(Test-Path -LiteralPath $compiled)) { throw 'Run Gradle :app:assembleDebug first.' }
New-Item -ItemType Directory -Force -Path $testOutput | Out-Null
$suites = @('GameTest','LearningTest','TimelineTest','V3Test','UpgradeTest','PuzzleTest','AdvancedLearningTest','LibraryProgressTest','EndgameFeedbackTest','NavigationTest','ArchiveLessonTest','SandboxTakebackTest')
$sources = @($suites | ForEach-Object { Join-Path $PSScriptRoot "com/traillink/$_.java" })
$sources += Join-Path $repo 'app/src/test/java/com/eladbiller/knightline/BridgeGuardTest.java'
$sources += Join-Path $PSScriptRoot 'com/eladbiller/knightline/SkillRatingStoreTest.java'
# Explicit UTF-8 is required on older Windows JDKs: several assertions contain
# Unicode typography. Do not accidentally compile both duplicate rating suites.
& javac -encoding UTF-8 -cp $compiled -d $testOutput $sources
if ($LASTEXITCODE -ne 0) { throw 'Test compilation failed.' }
$classpath = "$testOutput$([IO.Path]::PathSeparator)$compiled"
foreach ($suite in $suites) {
    & java -cp $classpath "com.traillink.$suite"
    if ($LASTEXITCODE -ne 0) { throw "$suite failed." }
}
foreach ($suite in @('BridgeGuardTest','SkillRatingStoreTest')) {
    & java -cp $classpath "com.eladbiller.knightline.$suite"
    if ($LASTEXITCODE -ne 0) { throw "$suite failed." }
}

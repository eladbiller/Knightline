# v0.7 — wooden feedback and contextual navigation

## Changes and evidence

The visible UI still runs entirely from packaged local assets. Games, engine decisions, saves, sound and vibration remain native. No accounts or runtime sound downloads were added.

- Five primary destinations: Home, Play, Learn, Games, Profile. Resume appears before the Home introduction and on Play. Learn has separate Puzzles / Openings / Endgames categories.
- Contextual Back: archived review → Games; live analysis → original board; finished-game review → Home; lesson → Learn; normal game → its originating tab. Android Back on Home backgrounds the app instead of looping.
- Category scroll, puzzle filter/page and game-library position survive detail navigation. Cancel and Android Back restore clock, strength, lesson side, endgame stage and room code. Native confirmation tokens are cancelled too, not merely hidden.
- Feedback is available from the game menu without leaving or remounting the board. Engine information and feedback return to their parent menu.
- Kenney CC0 wood-impact sources replace the synthesized clicks. Three 240ms placement variants, a 340ms two-contact capture, a quieter 290ms mistake and a 400ms finish are generated offline. PCM checks verify mono/44.1kHz/16-bit, bounded peaks (0.42–0.66), quiet endpoints, non-identical files and the packaged license. This is objective asset validation, not a perceptual listening test.
- Board-event vibration is a bounded 45ms pulse, or two contacts for captures/mistakes/finishes. API 33+ uses `USAGE_MEDIA`; older Android uses `AudioAttributes.USAGE_GAME`. The app does not inspect the touch-feedback switch or use policy-bypass flags. Android-wide vibration restrictions, DND and hardware limitations still apply.

## Automated native and JavaScript checks

The complete native suites passed **42,210 assertions**: the prior 42,182 rule, puzzle, archive, lesson, feedback-classification, bridge and rating checks plus 28 contextual-routing checks. Evaluation orientation and review numbering passed another **277 assertions**. Six processed sound assets passed PCM/provenance checks. These are executed CLI tests, not an empty JUnit result.

Counts are assertions, not distinct UI scenarios. The inherited foundation suite also covers non-chess rules.

## Installed Pixel API 35 flows

The scripts drive actual touch/keyboard input in the installed APK and native chess controller. They do not substitute a fake engine or chess bridge.

- **412dp / 130% / gestures:** full navigation journey, setup cancellation, nested menus, list restoration, archived return, Home exit, feedback switches/persistence, review scoring/alternatives/key moves and lifted drag. Review sampled 1,714 board frames without recorded violations; drag sampled 767 board frames. The review board was 348 CSS pixels, square and scroll-free.
- **Final 412dp / 100% / gestures:** the complete navigation journey passed again after the setup-footer correction, including keyboard input and contextual returns. It sampled 3,732 UI frames (1,886 sheet frames) without recorded violations. Tests wait for sheet transitions to finish before targeting controls; a first run correctly rejected a still-moving control instead of tapping off-screen.
- **360dp / 150% / three-button navigation / airplane mode:** complete navigation with Android keyboard entry, invalid room-code recovery and cancelled replacement; puzzle filter/page restoration; archive-to-library restoration; White/Black opening completion, five endgame mating patterns, impossible-material explanations, full Stockfish technique and hints. Navigation sampled 3,556 UI frames (1,768 sheet frames); lessons sampled 3,516 UI frames (1,169 sheet frames), without recorded sideways displacement or tested text/geometry violations. Game boards measured 243–273 CSS pixels and pages had zero vertical overflow. `navigator.onLine` was verified false.
- **Feedback diagnostics:** with Android touch feedback set to zero, Knightline's game/media vibrations still completed. With Knightline's vibration switch off, no new app vibration was emitted. Sound-off emitted no new app SoundPool start; enabled placement/capture previews reached Android's audio service. Both switches survived process restart. The test restores the original Android touch-feedback setting in `finally`.
- **Final narrow bot/review regressions:** normal Stockfish play, keyboard selection, illegal taps, lifted dragging, native replies, takeback and Hint → Show move → Hide passed without board expansion. Saved-move scoring, both-side exploration, Show best, Back/Forward branch reset and non-wrapping key moments passed again at 360dp/150%. Review sampled 1,831 UI frames (1,596 board frames) with no recorded violations; its 246px board remained square and scroll-free.

The release recordings are continuous, unsped-up Android captures, not screenshot slideshows. Each capture covers up to 45 seconds of a longer scripted journey; assertions continue after recording ends. Selected recordings include narrow navigation (44.81s) and lesson navigation/completion (44.45s), plus review and normal bot coaching. Screenshots extracted from recordings are supplementary only.

## Problems caught and resolved

1. The previous sticky setup footer covered part of **Hard** at 360dp/150%/three-button navigation. Setup now uses a shrinking options scroller and a separate, non-overlapping action row. Other menus use in-flow footers. The exact blocked touch flow passed after this structural correction.
2. Cancelling native replacement previously lost the prior sheet and its choices. Parent-sheet snapshots now restore content, inputs and scroll, and Android Back sends the native cancellation token.
3. Archived review previously returned Home, and lesson/puzzle navigation lost context. Explicit native return paths and per-category scroll retention now match these journeys.
4. Startup testing could reach the initial HTML before native state. The UI is now inert/busy until its first native state, and tests wait for that readiness marker.
5. Diagnostic/test corrections: Android reports `finished` in lowercase; CDP text insertion did not type reliably into the Android input, so room-code tests use Android keyboard events and assert text before submitting. Review navigation assertions now wait for the native move response instead of reading an old index after a fixed delay. These were test failures, not claims of engine or vibration-service defects.

## Reproduction

Use a disposable emulator: game-flow tests replace its active test match. Set `ADB` and optionally `ANDROID_SERIAL`. From the repository root:

```text
node tests/webview-analysis-flow.mjs --mode=navigation --record=<navigation.mp4>
node tests/webview-analysis-flow.mjs --mode=feedback
node tests/webview-analysis-flow.mjs --mode=lessons --record=<lessons.mp4>
node tests/webview-analysis-flow.mjs --mode=review --record=<review.mp4>
node tests/webview-analysis-flow.mjs --mode=interaction
node tests/webview-board-flow.mjs --mode=bot --record=<bot.mp4>
node tests/feedback-audio.mjs
node tests/evaluation-orientation.mjs
node tests/review-numbering.mjs
```

Run review before interaction. `QA_ACTION_DELAY_MS=1100` enables human-paced normal-bot recording. Sound regeneration requires FFmpeg (`FFMPEG=<path> node scripts/generate-feedback.mjs`). Original CC0 assets/license are retained under `third_party/kenney-impact-sounds`.

## References and limits

Android documents [game/media vibration usage](https://developer.android.com/reference/android/os/VibrationAttributes#USAGE_MEDIA) separately from touch interactions. Return paths follow [predictable navigation principles](https://developer.android.com/guide/navigation/principles). Sound provenance is [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds), not Chess.com's audio.

Only the Pixel emulator was connected. Actual speaker quality, physical vibration feel, Android 26–32 device behavior and two-phone Bluetooth/PeerJS were **not** revalidated. Existing online relay limitations remain. Android screen recordings contain video, not sound. This is a developer-signed beta, not a claim that every device or every chess feature was retested.

The final APK's three UI files, six WAVs and sound license were checked byte-for-byte against the source assets. Package `com.eladbiller.knightline`, version `0.7.0-beta` / code 8, min API 26, arm64-v8a/armeabi-v7a/x86_64. Signature SHA-256 remains `779396cfdce796d353a7f0f1f5212477d24d4ed69b107c5369294384000705b9`. APK: 37,619,754 bytes; SHA-256 `262ecfa3056c10ff29e78882bf670dc48f98be7c2828ea86b60fbc3d6623fd88`.

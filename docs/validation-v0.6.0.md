# v0.6 — review semantics, floating drag, feedback and lessons

## Native checks

| Suite | Assertions |
| --- | ---: |
| GameTest | 35,004 |
| LearningTest | 317 |
| TimelineTest | 70 |
| V3Test | 76 |
| UpgradeTest | 237 |
| PuzzleTest | 265 |
| AdvancedLearningTest | 5,748 |
| LibraryProgressTest | 42 |
| EndgameFeedbackTest | 336 |
| BridgeGuardTest | 57 |
| SkillRatingStoreTest | 30 |
| **Native total** | **42,182** |
| Evaluation-orientation JavaScript | **75** |
| Review-numbering JavaScript | **202** |

These counts are assertions, not distinct UI scenarios. Core suites inherited from the foundation also cover non-chess rules. The new suite checks all seven material categories, both colors, legal custom starting positions, all five mating finishes, all seven opening lines for both learner colors, en passant capture feedback and non-capture promotion feedback.

All four generated WAV files are deterministic PCM mono at 44.1kHz, with peak amplitude 0.78 (no sample clipping). Move/capture/mistake/finish durations are 90/150/140/270ms. This is an objective asset check, not a claim about perceived sound quality.

## Installed Pixel API 35 flows

Tests use touch input in the installed Android WebView and native game controller, not a mock chess bridge. Continuous animation-frame checks audit 64 equal squares, square board geometry, viewport zoom, unchanged review-position width and relevant text bounds. Real input/native state assertions cover the entire tested sequence; screenshots are supplementary.

- At 412dp/130% text: review and free analysis, lifted drag through engine updates, cancel/off-board/illegal/legal drops, opening lessons as both colors, five endgame finishes, impossible-material explanations, full endgame practice against Stockfish and Hint/Show move/Read method.
- At 412dp/100% text with three-button navigation in airplane mode: opening/endgame flows, delayed completion checks, saved Black opening and endgame practice across process restart, archived custom-position review, review/drag regressions and six multi-move puzzle lines spanning all five rated bands plus promotion. The review/puzzle frame audits sampled 1,796/1,780 frames without recorded violations; pages had zero scroll and their boards measured 350/377 CSS pixels.
- At 360dp/150% text in airplane mode: opening lessons and endgames, review before-board/after-score semantics, both-side alternatives, Back/Forward reset, Show best, graph visibility, normal bot selection/tap/drag/reply, hints and takeback. Tested game/review pages have zero page scroll; boards measure approximately 267/270 CSS pixels. The final review flow sampled 1,656 frames without recorded geometry/text violations. The final lesson flow sampled 1,410, including delayed completion checks (completed-lesson board: 297px). Custom Black-first archive notation and opening/endgame persistence passed again at this size.

The review test deliberately uses a mating move: the root score is `−M0` while its board is still before the move; Play from here evaluates that before-position (`−M1`). A legal non-best continuation changes the position and score, removes automatic arrows, and retains game-style last-move squares. The next/previous controls exit the branch at the same selected index. Rapid saved-move changes cannot publish stale engine scores.

Native Android vibration diagnostics recorded completed `HEAVY_CLICK` / `USAGE_TOUCH` effects for Knightline. The focused feedback flow verifies no app vibration when either the app switch or Android haptics are off, checks the system-off diagnostic, and restarts to verify persisted switches. Android audio diagnostics also recorded started SoundPool game-audio events for the app. This establishes request delivery/policy behavior on an emulator, not perceived sound quality or physical vibration feel.

## Bugs found during this work

- Legacy bot scheduling fell through to Stockfish after Black completed an opening line. That produced a seventh ply in a six-ply lesson and could invalidate guided restoration. Knightline now explicitly stops the bot at lesson completion; the flow test waits after completion and compares the full board. The UI offers deliberate completed-lesson actions.
- Engine publications previously rebuilt normal game/puzzle boards. They now patch surrounding information while keeping the board connected, preserving pointer capture and focus during drag.
- The first authored bishop finishing positions already checked the non-moving king. Native legality assertions caught them; the corrected positions and their mirrored Black equivalents pass.
- A display-configuration change invalidated an initial test connection during Activity recreation. The test was repeated against the settled configuration. One archive test searched rendered uppercase text with a case-sensitive mixed-case label; that selector was corrected, without changing archive behavior.
- Custom endgames can begin with Black. Move prefixes and statistics now use the actual mover instead of assuming the first saved ply belongs to White; unit checks cover 100 plies for either starting color.

## Continuous recordings

Selected unsped-up Android recordings include setup/review at 100% (45.13s), opening lessons/completion at 100% (44.84s), lifted dragging at 130% (30.40s), and narrow 150% review/lessons. The recording window is capped at 45 seconds; the full scripted flow can continue beyond it. The release includes recordings as evidence, while state assertions cover later actions as well.

## Reproduction

Use a disposable emulator. These scripts replace its active test match and must not run on a personal save. Set `ADB` to the platform-tools executable; run Node from the repository root.

```text
node tests/webview-analysis-flow.mjs --mode=review --record=<review.mp4>
node tests/webview-analysis-flow.mjs --mode=interaction --record=<drag.mp4>
node tests/webview-analysis-flow.mjs --mode=lessons --record=<lessons.mp4>
node tests/webview-analysis-flow.mjs --mode=lesson-persist
node tests/webview-analysis-flow.mjs --mode=feedback
node tests/webview-board-flow.mjs --mode=bot --record=<bot.mp4>
```

Run review before interaction: the latter deliberately explores the preceding four-ply test game. `QA_ACTION_DELAY_MS=1100` enables human-paced bot-flow recording. The feedback mode temporarily changes the emulator's system haptic switch and restores its prior value in `finally`.

## Design references and boundaries

The feedback uses Android's predefined, device-tuned touch effects and respects both the app switch and system haptic policy; it does not use ignore-setting flags. See [Android haptic guidance](https://developer.android.com/develop/ui/views/haptics/haptic-feedback) and [VibrationEffect](https://developer.android.com/reference/android/os/VibrationEffect).

Board-contact sounds and lifted dragging take inspiration from familiar chess-app interactions. [Chess.com documents sound themes](https://support.chess.com/en/articles/8704531-how-do-i-turn-off-sound) and [drag/click settings](https://support.chess.com/en/articles/8614003-how-do-i-manage-my-live-chess-settings). No Chess.com audio, code or artwork was copied. Dead-position teaching uses the distinction in the [FIDE Laws](https://rcc.fide.com/wp-content/uploads/2022/11/Laws_of_Chess-2023.pdf): no possible legal mating sequence is different from an inability to force mate against correct defense.

- Only the Pixel API 35 emulator was connected. Physical-phone layouts, vibration feel, and two-device Bluetooth/PeerJS were not revalidated.
- Full-technique endgames are free practice against Stockfish with teaching notes and progressive hints, not a new exhaustive step-by-step endgame trainer or tablebase certification. Two knights is explicitly not advertised as a generally forced win.
- Review is bounded offline Stockfish analysis, not Chess.com's proprietary grading/accuracy service. All scores remain White-perspective.
- Continuous recordings are unsped-up evidence of their recorded intervals, not exhaustive feature coverage. Time-ordered samples were visually inspected alongside continuous geometry/input assertions; not every recorded frame was individually inspected.
- Developer/debug signing identity is unchanged, preserving beta update compatibility. Stockfish source/notices and Lichess attribution remain included.

APK: `0.6.0-beta`, version code 7, min Android API 26. Signature SHA-256: `779396cfdce796d353a7f0f1f5212477d24d4ed69b107c5369294384000705b9`.

APK SHA-256: `dd833ed034877b9f2e2277e56cbe9a2a1894e1bfc395c82441a387ead14445fe`.

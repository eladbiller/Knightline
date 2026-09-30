# v0.5 — review-first library, honest puzzle progress, native feedback

## Changes verified

- Review starts at the position **before** the selected move. There is no Before/After toggle. Pieces paint above the graded played-move arrow; a rendered hit test checks the queen at the arrow origin, not only CSS z-index values.
- Both sides can immediately explore legal alternatives. The board and evaluation rail keep their orientation. Show best is explicit; navigation, Undo and Reset line hide it again. Exploration never changes the source game.
- Key moments, player filters and the review CTA precede the collapsed move/statistics section. Finished games offer Review last game; finished and archived review return Home.
- The review-only library retains the latest 100 played games, including unfinished ones. Empty boards are not archived. The active save remains separate. Retention, restart, corrupt-entry isolation, safe filenames and deep-copy isolation have native tests.
- Legal wrong puzzle moves appear on the board. Explicit Undo restores the previous position but not eligibility for a first-try solve. Hints and failures remain recorded through retries and process restarts. Legacy completions remain as practice because their original attempt history cannot be proved. Warm-up is the first difficulty filter.
- Sound and vibration have independent native-stored switches and a preview control. Android SoundPool diagnostics showed a started game-audio event for the app. This does not establish perceived audio quality or physical vibration feel.
- The selected A / Modern knight logo is packaged as the HTML badge, startup mark and adaptive launcher icon. The Local only Home panel is gone.

## Problems found and addressed

At 150% text size, Highlights wrapped its final letter and unnecessarily reduced the review board. The title is now Review, the action stays on one line, and the narrow review board measures 270 CSS pixels. A generic hover rule also darkened the mint Resume button without changing its dark text; its interaction state now preserves the light mint surface.

Native updates no longer navigate away from Home, puzzles or archived analysis. A newly accepted peer session can still open its board. Archive analysis has generation/entry checks so leaving or opening another game cannot apply stale reports.

The first 100% setup test sampled one frame of the intentional opening transition: y=526.34, followed by y=485.60 for all remaining 101 samples. Width and height stayed constant. The harness now waits for the actual opening animation to finish, rather than assuming a fixed delay is enough on a busy emulator. The strict one-pixel bound check remains unchanged and passes every clock selection. Other asynchronous test actions wait for native position, confirmation or library state instead of relying on short delays.

## Native verification

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
| BridgeGuardTest | 50 |
| SkillRatingStoreTest | 30 |
| **Native total** | **41,839** |
| Evaluation-orientation JavaScript | **75** |

These are assertion counts, not distinct UI scenarios. Inherited core suites include non-chess rules. AdvancedLearningTest replays all 256 packaged puzzles, checks visible wrong moves and Undo, and covers 684 player solution moves across 149 White-side and 107 Black-side positions. It also tests review variation isolation, monotonic revisions, castling, en passant and promotion. Puzzle difficulty is the source database's estimate, not a new Stockfish certification.

## Installed APK: actual flows

The tests use real touch input in the installed Android WebView and the native controller, not a mock bridge. Continuous animation-frame checks measure board geometry, equal cells, unchanged-position stability, viewport zoom and relevant text bounds while actions and engine replies occur. Screenshots supplement continuous recordings; they are not the sole test.

| Pixel API 35 configuration | Completed flows |
| --- | --- |
| 412dp, 100% text, three-button navigation, airplane mode | Setup; pass-and-play to mate; live/completed review; both-side alternatives; Show best; Undo/reset; player filters; puzzle solutions from all five rated bands; visible mistake/Undo; permanent assistance; promotion; save/progress restart |
| 412dp, 130% text, gesture navigation | Review and puzzles; archived analysis isolated from an active game; feedback preferences and library restart; archived review with no active save; offline guided lesson and normal bot coaching |
| 360dp, 150% text, gesture navigation, airplane mode | Review and puzzles; nine-ply alternative with knight underpromotion; library/active-save isolation and restart; feedback switches; bot tap/drag, hints and takeback; bot review/player filters; actual keyboard and Back behavior |

The tested review and puzzle pages had zero page scroll, 64 equal squares and visible primary actions. Review boards measured 350px at 100% and 270px at the final 360dp/150% layout; the 100% and 150% puzzle boards measured 377px and 265px. The final 100% review and puzzle runs sampled 2,868 and 1,662 frames respectively with no recorded geometry/text violations. The final narrow review run sampled 1,489 frames without violations.

Normal bot and guided-lesson tests include repeated selection/switch/cancel, keyboard focus, illegal taps, tap and drag moves, native replies, Take back confirmation, Hint → piece → Show move → Hide, and selection with the coaching overlay. Their per-frame checks found zero unstable frames; viewport scale remained 1. The 130% game board measured 363.29px, and the narrow bot board 266.92px. The evaluation rail's White fill touches White's side of the displayed board; positive numeric scores still mean White's advantage.

The library flow starts a new active match, opens an older finished game, explores a different line, then checks the active game is unchanged. It force-stops/restarts the app to verify archive and independent feedback preferences. It then clears only the emulator's active test save and confirms archived review still works and exits Home. No physical-phone data was used or cleared.

## Continuous recordings

Raw Android recordings were inspected through time-ordered video frame sequences alongside the real-input/state checks and animation-frame assertions. No claim is made that every video frame was visually inspected. Recordings are unsped-up, and are evidence of the recorded intervals rather than exhaustive feature coverage.

| Recording | Actual duration |
| --- | ---: |
| Setup/review, 100% | 42.80s |
| Setup/review, 150% | 44.69s |
| Puzzles, 100% | 44.51s |
| Puzzles, 150% | 45.03s |
| Library/preferences/restart, 150% | 42.55s |
| Guided coaching, 130% | 34.96s |
| Normal bot coaching, 130% | 33.55s |

The original fast bot capture ended at its last changed frame after 15.70s despite a 45-second recording window. Guided and bot recordings were repeated with human-paced input; no video was stretched or padded. Older 130% recordings were retained locally but are not the final logo/layout evidence.

Reproduce on a disposable emulator using `ADB=<adb path>` and these Node scripts (PowerShell users should set `$env:ADB`):

```text
node tests/webview-analysis-flow.mjs --mode=review --record=<output.mp4>
node tests/webview-analysis-flow.mjs --mode=puzzles --record=<output.mp4>
node tests/webview-analysis-flow.mjs --mode=persist
node tests/webview-analysis-flow.mjs --mode=library --record=<output.mp4>
node tests/webview-board-flow.mjs --mode=lesson --record=<output.mp4>
node tests/webview-board-flow.mjs --mode=bot --record=<output.mp4>
```

Run review before puzzles/persist/library: those scenarios deliberately assert the preceding test game's state. `QA_ACTION_DELAY_MS=1100` gives readable board-flow recordings without changing the assertions. Do not run these destructive test-game workflows against a personal save.

## Build and limitations

The final offline Gradle build succeeded. APK version is `0.5.0-beta` / code 6. Its packaged HTML, JS, CSS, logo, puzzle data and four WAV hashes match source. The signature verifies with the same local developer/debug certificate as earlier betas, preserving install-over compatibility.

- Only the Pixel API 35 emulator was connected. Physical-phone layouts, actual vibration feel, two-device Bluetooth and end-to-end PeerJS were **not revalidated**. Existing PeerJS relay/network limitations remain.
- Offline Stockfish review is time-limited local analysis, not Chess.com's proprietary cloud service or accuracy model. Free variations get real position scores rather than invented move grades.
- Puzzle progress, saved games and ratings are local to this install. No account/cloud backup was added. Retention is bounded at 100 games.
- This remains a developer-signed beta, not a production Play Store release. Stockfish GPL source/notices and Lichess CC0 attribution remain in the repository/APK as applicable.

APK SHA-256: `7f38fdb84c1a7420ff7aacbeace065a649052351de85fac724cf6d95cc4762f5`.

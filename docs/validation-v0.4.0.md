# v0.4 — free analysis, deeper puzzles, correctly oriented evaluation

## Behavior

- Review defaults to one **played-move** arrow: green Best/Good, yellow Inaccuracy, orange Mistake, red Blunder, gray ungraded. Show best is explicit and resets on navigation, Undo, and manual moves. No endpoint circles or boxes.
- Either side can make any legal move in review. Native validation handles turns, check, promotion, castling and en passant. A separate Stockfish process evaluates the independent line, so saved-game batch reports cannot block it. Undo and Return to game never replace the saved match or alter its rating.
- Review orientation is captured at entry and stays fixed while exploring both sides. The evaluation rail places its white end next to White's side of the displayed board. Positive numbers always favor White; rotation does not reverse score meaning.
- Every highlight identifies its player and color. Bot/friend reviews offer My moves/Both players; pass-and-play offers White/Black/Both players.
- Six original warm-ups remain, plus 250 rated, multi-move CC0 Lichess puzzles, 50 per difficulty band. Native replies advance the full line; promotion choices work for either side. Misses and hints enter a practice collection; an unassisted clean solve clears that entry. Progress is stored independently of the saved match.
- A consistent knight mark replaces the previous logo, and the bottom Play control uses a conventional play triangle.

## Bugs caught during this implementation

The sticky overview footer could overlap player-filter chips. Real-touch hit testing reproduced the covered target; the overview footer now participates in its scrollable content instead of covering it. Setup retains its separate stable footer.

The previous evaluation rail always placed White at the bottom. It now takes the same orientation as the board. Pure rendering tests check both sides, positive/negative/unknown scores and mate notation; installed-app tests check actual board/rail alignment in both orientations.

Engine updates preserve the board and square nodes when the position is unchanged. Workspace revisions never rewind after Undo, and search generations reject results for older positions. Rapid navigation back to a terminal position must retain its terminal score after earlier searches finish.

## Native and rendering verification

| Suite | Assertions |
| --- | ---: |
| GameTest | 35,004 |
| LearningTest | 317 |
| TimelineTest | 70 |
| V3Test | 76 |
| UpgradeTest | 237 |
| PuzzleTest (legacy warm-ups/retry core) | 265 |
| AdvancedLearningTest | 4,980 |
| BridgeGuardTest | 37 |
| SkillRatingStoreTest | 30 |
| **Native total** | **41,016** |
| Evaluation rail JavaScript | **75** |

The native count includes inherited non-chess core tests, not 41,016 UI scenarios. AdvancedLearningTest replays every one of the 256 solutions through Game twice, covers 684 player solution moves, rejects wrong attempts and input during replies, and tests free analysis for both sides, mate/Undo, monotonic revisions, isolation, en passant, castling and all promotion choices. The catalog contains 149 White-side and 107 Black-side positions. Puzzle quality/rating comes from the source database; this is not a claim of separately reanalyzing every puzzle with Stockfish.

## Installed-APK flow tests

`tests/webview-analysis-flow.mjs` sends real WebView touch input to the installed APK and uses the native controller, not a mock bridge. It follows setup → live review → saved game → completed game → graded review → independent analysis → Undo/reset → puzzles → saved match. Checks include whole multi-move solutions in all five bands, promotion, missed/clean retries, filters, keyboard-accessible controls, Android Back, process restart and stale-engine-result rejection.

Completed: 412dp/100% text with three-button navigation, 412dp/130% text and 360dp/150% text with gesture navigation. The tested review/puzzle workspaces had zero page scroll, equal square cells, visible primary controls and no review advice/score overlap. Review boards measured 350px, 347px and 268px respectively; puzzle boards measured 377px, 377px and 265px. Continuous Android recordings were inspected in time order alongside input/state and per-frame geometry assertions. The three setup/review videos measure 44.7–45.2 seconds; the raw bot, guided and puzzle recordings measure 62.1, 49.3 and 71.0 seconds. Recordings preserve actual timing, including quiet periods after a flow finishes; they are not evidence of exhaustive coverage by themselves.

- The entire 100% review/puzzle run passed in airplane mode, with `navigator.onLine === false`.
- Clean completion, the missed-puzzle collection and the separate saved match survived a real force-stop/process restart at 130%.
- At 360dp/150%, offline bot play passed selection, switching/canceling, keyboard square selection, illegal taps, tap/drag moves, native replies, takeback, Hint → Show move → Hide, and selection with the coaching overlay. Per-frame checks found zero unstable frames and viewport scale remained 1.
- Bot review after resignation correctly identified You/Stockfish and filtered My moves. An additional nine-ply free-analysis line ended in a knight underpromotion, followed by Undo and Return to game, without rotation or lost state.
- A separate continuous 150% recording covers an advanced four-move puzzle and a three-move promotion puzzle, both offline.
- Android keyboard/input visibility and the two-stage Back behavior passed at 100% and 150%.
- The 130% offline guided-opening flow also passed tap/drag, native replies, takeback, all hint stages, keyboard square focus and repeated selection, with zero unstable frames.

The final offline Gradle build succeeded. APK version is `0.4.0-beta` / code 5. Packaged HTML, CSS, JS, puzzle data and notice hashes match the source files; the APK verifies with the same developer signing certificate as the previous beta.

## Limitations

- Only the Pixel API 35 emulator was connected. Physical-phone, two-device Bluetooth and end-to-end PeerJS validation were not repeated; existing online connectivity limitations remain.
- Offline review uses time-limited Stockfish analysis, not Chess.com's proprietary accuracy model or cloud service. Manual variations receive fresh numeric evaluation, not fabricated move grades.
- This is a finite 256-position collection. Source puzzle ratings are estimates and do not update a player's Private Skill Rating.
- APKs use the existing local developer/debug signing identity, not a production Play Store certificate. Stockfish GPL source and notices remain in the repository; Lichess CC0 attribution ships inside the APK.

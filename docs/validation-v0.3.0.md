# v0.3 — board workspaces, guided review, offline puzzles

## Changes

- Game layout allocates a real viewport to the board and keeps Hint, Take back, Moves, and More in one stable action row. Selection still mutates existing square nodes; it does not rebuild the board layout.
- Review adds a highlights sheet, White/Black move classifications, key-moment navigation, engine evaluation history, compact move-quality titles, and independent retry practice. Full reports and unrestricted practice branching remain available in Details.
- Translucent full-length arrows replace the disconnected thin marks. Knight arrows bend at right angles. Green means best; amber means played. Decorative source/target circles and boxes are removed. Piece-only hints illuminate the piece itself.
- Graph values come from real reports, use White's perspective, and explicitly place forced mates at the edges. Unknown values are gaps, not invented scores. Numeric evaluation is not an accuracy percentage.
- Six original mate-in-one teaching positions use native chess legality. Every position has exactly one mating move; wrong attempts leave the original position untouched. Completion is stored separately from the saved game and private rating.
- Native system-bar/keyboard insets resize the actual WebView. Android text scaling is applied once in CSS, with WebView text-only zoom disabled.

## Reproduced problems corrected

At 360dp/150% text, changing to Untimed widened the setup action and wrapped Cancel, moving the entire sheet by 31.46 CSS pixels. The action now has a stable label, the footer uses predictable columns, and the chosen clock is communicated by its selected chip.

The earlier WebView text zoom enlarged glyphs independently of rem-based boxes. A test caught coaching text overlapping the following controls. Font scaling now updates both text and layout units from the same Android preference (150% is a 24px root, not independently zoomed 27.36px glyphs).

On short screens, the full evaluation graph is available in Overview; the main review retains the move strip, verdict, advice, Best, Retry, and navigation. This is a responsive hierarchy, not page scrolling or cropped controls.

## Verification

Native CLI suites: GameTest 35,004; LearningTest 317; TimelineTest 70; V3Test 76; UpgradeTest 237; PuzzleTest 265; BridgeGuardTest 21; SkillRatingStoreTest 30. Total 36,020. Some core suites include inherited non-chess games; this count is not a count of UI features.

`tests/webview-workspace-flow.mjs` uses real touch input against the installed APK and native controller. It checks:

- Setup geometry through clock changes.
- A complete pass-and-play Fool's Mate, live unscored review, then real Stockfish-scored review.
- Highlights, move navigation, jump lists, Before/Played/Best, full reports, Android Back.
- An incorrect retry followed by the correct mating move, without altering the saved match.
- All six puzzles, wrong-move feedback, staged hints, hide/retry/next, progress, and saved-match isolation.
- Zero page scroll, equal square geometry, visible action controls, and no coach-copy overlap with scores/actions.

`tests/webview-board-flow.mjs` separately samples every animation frame during piece selection, switching, deselection, keyboard focus, illegal taps, tap/drag moves, takeback, and bot/lesson hints.

Continuous Android recordings accompany the testing. Timestamp-ordered visual inspection is used alongside per-frame geometry and state assertions; recording alone is not treated as proof that every feature works.

### Installed-APK flow matrix

| Pixel configuration | Completed flows |
| --- | --- |
| 412dp, 100% text, three-button navigation | Setup, complete pass-and-play, live and scored review, all review views, wrong/correct retry, all six puzzles, hints, saved-match isolation, keyboard and Back |
| 412dp, 130% text, gesture navigation | Guided opening: tap and drag, native reply, takeback, all hint stages, keyboard square focus, repeated piece selection |
| 360dp, 150% text, gesture navigation | Setup, complete pass-and-play, live/scored review, retries, six puzzles, persistence after restart, keyboard and Back; airplane-mode bot game, numeric evaluation, takeback, tap/drag and hints |

The workspace checks found zero page scroll, square cells, visible action controls, and no coaching-copy overlap in the tested layouts. Board-selection checks found zero unstable frames and no viewport zoom. Recordings retain real timing and include setup/review, puzzles, offline bot play, and guided play. These results cover the listed flows, not every possible device or game position.

## Scope and limitations

- Puzzles are a six-position starter collection, not an unlimited puzzle service.
- Review verdicts are offline, time-limited Stockfish assessments. No fabricated Brilliant/Book awards, global accuracy score, or cloud analysis is claimed.
- Retry asks for the engine's searched recommendation; a different legal move is not automatically called a blunder.
- Only the Pixel emulator was connected during this work. Physical-phone, two-device Bluetooth, and end-to-end PeerJS tests were not repeated. Existing PeerJS connectivity limitations remain.
- APKs are developer/debug-signed betas using the existing local Android identity, not production Play Store releases.

## Design references

The review hierarchy follows the useful patterns in [Chess.com's mobile review guidance](https://support.chess.com/en/articles/10328363-how-do-i-use-game-review-on-the-app): highlights, move classifications, key moves, Best, and Retry. Artwork, implementation, and puzzle positions are Knightline's own. [Lichess's puzzle themes](https://lichess.org/training/themes) informed the emphasis on learning recognizable tactical patterns.

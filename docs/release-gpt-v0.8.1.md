# Knightline Preview gpt version — recovery beta

Download **Knightline-Preview-v0.8.1-beta-side-by-side-gpt-version.apk** under Assets. This uses `com.eladbiller.knightline.gpt` and installs as **Knightline Preview gpt version** alongside the normal app. It updates only an existing GPT installation, with separate saves/profile and multiplayer identities. Both players need the GPT edition.

## Improved

- Fixed Bluetooth stale-socket/callback races and PeerJS retry-generation handling.
- Rooms keep their reconnect target before the first game; replacing a match with an online room is saved immediately.
- Clear recovery states and bounded retries, with an explicit Reconnect action.
- Disconnect stays paused after app restart and remains available during recovery.
- Reconnecting no longer ejects the host or guest from Sandbox. Saved matches, capture trays, history and takeback Practice status stay synchronized.

Captured pieces, empty-board Sandbox, offline evaluation and consensual **Ask undo** remain included from 0.8.0.

## Validation

42,434 native/lifecycle assertions passed, plus JavaScript contract tests. The exact APK passed Pixel offline Sandbox, persistence and capture flows at 360dp / 150% text, and actual two-phone Bluetooth takebacks, process-restart recovery, pre-game room recovery and 3+2 clock checks. Original phone installations remained 1.0.0-step3, unchanged. Continuous flow recordings are attached.

Actual PeerJS play, takebacks, both-role restart recovery and retry exhaustion also passed between two Android emulators. **Two-real-phone online testing is still incomplete:** the Redmi was offline and the Vivo later locked. This is not presented as two-phone online coverage.

See the [validation report](https://github.com/eladbiller/Knightline/blob/gpt-version/docs/validation-gpt-v0.8.1.md) for exact coverage, environment interruptions and limits. No claim covers every network/NAT, radio-toggle case or Android background policy.

Developer-signed beta. Stockfish GPL source and notices remain in the repository.

SHA-256: `b9694c79353e592de9fb4ff254ec30f0cf0e216ad1040b7963118e19faf306bc`.

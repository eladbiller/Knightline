# Knightline Preview 0.7.1 beta

Download **Knightline-Preview-v0.7.1-beta.apk** from Assets below. Install on both phones; install over the previous Knightline beta to retain app data. ChessLink is unchanged.

## Cleaner Games history

Opening lessons and endgame practice no longer appear in Games or use its 100-game limit. Older lesson files are preserved but hidden. Lessons still resume and support immediate review.

## Easier two-phone setup

- Clear Host / Join guidance and waiting states; paired phones appear immediately.
- The phone picker closes automatically on connection.
- Online Create generates a shareable code when the field is blank.
- Clock selection reaches the other phone correctly. Declining an invitation leaves the current game unchanged.
- Reconnect restores the unfinished match instead of replacing it.

## Real-device fixes

Fixed stale lesson settings in friend matches, the guest's clock display, live incoming chat, rating-exchange timing and missing guest move history. Both phones retain saved game reviews. Enlarged-text review no longer squeezes its reading area against the score controls.

## Testing

Real Vivo and Redmi matches passed over Bluetooth and PeerJS, including captures, clocks, chat, reconnect, resignation and saved review. Bluetooth also passed with both phones in airplane mode and no active internet network. Setup was tested at 130%/150% phone text size; Pixel review and navigation passed at 360dp/150%.

42,344 native and 277 JavaScript assertions passed. Continuous recordings are attached. See the [validation record](https://github.com/eladbiller/Knightline/blob/main/docs/validation-v0.7.1.md) for exact coverage and limits. PeerJS was tested on one shared Wi-Fi LAN, not every mobile network/NAT. The phones were already Bluetooth-paired.

Developer-signed beta. Stockfish GPL source and notices remain included.

APK SHA-256: `f768cc697ab565fad246dc8b7f0243e6ccc67f18889b4381ee7d9bd143d72217`.

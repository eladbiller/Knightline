# Wooden board feedback

Source: [Kenney Impact Sounds 1.0](https://kenney.nl/assets/impact-sounds), created/distributed by Kenney, 2019-12-19. CC0; the original license is included beside these four unmodified source Ogg files and inside the APK.

Downloaded from the official asset page on 2026-10-01. These are wood-impact foley assets, not recordings claimed to come from a particular chess set, and not Chess.com's audio.

`scripts/generate-feedback.mjs` decodes, filters, trims and envelopes the sources into short offline mono PCM samples. Three placement variants avoid a repeated identical click. Capture combines removal/contact and placement. No oscillator, speech, melody or runtime download is used. The game uses Android media volume. Rebuild with Node and FFmpeg using the command in the script.

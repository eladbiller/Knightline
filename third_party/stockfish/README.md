# Stockfish 16 — source and native build provenance

Stockfish is copyright (C) 2004–2023 the Stockfish developers (see AUTHORS), licensed under GNU GPL version 3 or later. Copying.txt contains the full license. TrailLink communicates with this separate executable through standard UCI stdin/stdout.

The source in src/ is unmodified Stockfish 16, from upstream commit:
68e1e9b3811e16cad014b590d7443b9063b3eb52

Upstream: https://github.com/official-stockfish/Stockfish/tree/68e1e9b3811e16cad014b590d7443b9063b3eb52

Downloaded release archive:
https://github.com/official-stockfish/Stockfish/releases/download/sf_16/stockfish-android-armv7-neon.tar

Archive SHA-256:
AB9A90DD6441C62B4D4DD94C0F882B6C6B6068F2E0A4E9461D16735E908EA0B6

The release executable is NOT redistributed. All three supplied executables were compiled locally from the bundled source using build-stockfish.ps1 and Android NDK 27.2.12479018 for minimum API 26, C++17, -O3, PIE, static libc++, 16 KB ELF page alignment, and NNUE_EMBEDDING_OFF. ARM builds use NEON; x86_64 uses baseline SSE2. No engine source patch or weakening modifications were made.

The independent UCI executable is named libstockfish.so solely for Android native-library packaging/extraction. It is launched as a subprocess, not JNI-loaded.

## Neural network

The identical upstream NNUE network is bundled once at assets/stockfish/nn-5af11540bbfe.nnue:
https://tests.stockfishchess.org/api/nn/nn-5af11540bbfe.nnue

SHA-256:
5AF11540BBFEFCB54E38C5DD000CAB4B469DFA7599A1D55BE5D2722C20A8929B

Network size: 40,119,326 bytes. It is GPL-licensed evaluation data distributed with Stockfish. The native executable selects its app-private copy through UCI EvalFile.

## Executable SHA-256

- arm64-v8a: D9D537A0C5233651392CE78268F2FF43309CEDD83987F624FFABDE7B34601B6D
- armeabi-v7a: 2D0D20E563B869551766303841B991B973D3CC51FB173927139D335E57413B8D
- x86_64: 6457F53F1D9EA3D9146B21DF80E91E4E0FDF67D0038CA9B84B68E3A779B27CF3

Android NDK/runtime notices are included here and in the APK assets. Source and network are included in the accompanying TrailLink-source.zip; preserve these files, license notices and build instructions when redistributing the engine.

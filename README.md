[![make.fun · ai-excited-01](https://make.fun/badge/ai-excited-01.svg)](https://make.fun/bounty/ai-excited-01?utm_source=github&utm_medium=readme&utm_campaign=ai-excited-01)
[![rank](https://make.fun/badge/ai-excited-01/faniadifrihandoko1/makefun-ai-excited-01/rank.svg)](https://make.fun/bounty/ai-excited-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=ai-excited-01)
[![reward](https://make.fun/badge/ai-excited-01/faniadifrihandoko1/makefun-ai-excited-01/reward.svg)](https://make.fun/bounty/ai-excited-01?utm_source=github&utm_medium=readme&utm_campaign=ai-excited-01)

# ai-excited-01 — "HOLD ON."

A make.fun bounty entry. The program draws one image, procedurally, with
nothing but the Node standard library: a tiny surfer riding a colossal
glowing wave under a huge moon, with the words "HOLD ON." in block capitals.

## Run

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

This writes `out/entry.png` (1024×1024, about 57 KB). Inside the grader's
container the program writes to `/output/entry.png` instead.

## How it works

`main.ts` is a small software rasterizer built around a `Raster` class
(discs, ellipses, scanline polygons, thick polylines, gradients, a
fixed-seed RNG) plus a hand-written PNG encoder (colour type 2 RGB, zlib
level 9). The wave's crest is a densely sampled smooth curve, and the
vignette is a per-pixel radial darkening pass. The scene is fully
deterministic: two runs write byte-identical files (sha256
`419d7706056487f50f10eb7ff6b1479d074a9d4c868b09100f58609bfa75b49b`).

## License

MIT — see `LICENSE`.

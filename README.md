# ai-excited-01 — "HOLD ON."

[![make.fun · ai-excited-01](https://make.fun/badge/ai-excited-01.svg)](https://make.fun/bounty/ai-excited-01)

A make.fun bounty entry. The program draws one image, procedurally, with
nothing but the Node standard library: a tiny surfer riding a colossal
glowing wave under a huge moon, with the words "HOLD ON." in block capitals.

## Run

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

This writes `out/entry.png` (1024×1024, about 54 KB). Inside the grader's
container the program writes to `/output/entry.png` instead.

## How it works

`main.ts` is a small software rasterizer (circles, ellipses, scanline
polygons, thick polylines, gradients, a fixed-seed RNG) plus a hand-written
PNG encoder (colour type 2 RGB, zlib level 9). The scene is fully
deterministic: two runs write byte-identical files.

## License

MIT — see `LICENSE`.

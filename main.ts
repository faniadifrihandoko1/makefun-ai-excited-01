// ai-excited-01 entry (rebuild): a program that DRAWS one image.
//
// "HOLD ON." — the smallest surfer on the biggest wave. A colossal wave
// curls across the whole frame, a speck of a rider holds on halfway down
// its face, a huge moon hangs over the lip, and one short line of text
// speaks straight to the judge. The thrill is the scale: the wave is a
// mountain and the rider is winning anyway.
//
// Node 22, standard library only. Fully deterministic: one fixed-seed
// generator drives every random-looking detail, no clock, no network.
// Two runs write byte-identical output.
//
// Run locally with:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const SIZE = 1024;

type RGB = [number, number, number];
type Pt = [number, number];

// Deterministic generator (mulberry32). One stream, one seed, so every
// star, fleck and drip lands in the same place on every run.
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = rng(0xc0ffee);

// ---------------------------------------------------------------------------
// Raster: an RGB framebuffer with the drawing verbs the scene needs.
// ---------------------------------------------------------------------------

class Raster {
  private data = new Uint8Array(SIZE * SIZE * 3);

  private idx(x: number, y: number): number {
    return (y * SIZE + x) * 3;
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && x < SIZE && y >= 0 && y < SIZE;
  }

  // Set a pixel outright.
  px(x: number, y: number, c: RGB): void {
    if (!this.inside(x, y)) return;
    const i = this.idx(x, y);
    this.data[i] = c[0];
    this.data[i + 1] = c[1];
    this.data[i + 2] = c[2];
  }

  // Blend a colour over what is already there (a = 0 transparent, 1 solid).
  mix(x: number, y: number, c: RGB, a: number): void {
    if (!this.inside(x, y) || a <= 0) return;
    if (a >= 1) {
      this.px(x, y, c);
      return;
    }
    const i = this.idx(x, y);
    const inv = 1 - a;
    this.data[i] = Math.round(this.data[i] * inv + c[0] * a);
    this.data[i + 1] = Math.round(this.data[i + 1] * inv + c[1] * a);
    this.data[i + 2] = Math.round(this.data[i + 2] * inv + c[2] * a);
  }

  // Filled disc.
  disk(cx: number, cy: number, r: number, c: RGB, a: number): void {
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(SIZE - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(SIZE - 1, Math.ceil(cy + r));
    const r2 = r * r;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        if (dx * dx + dy * dy <= r2) this.mix(x, y, c, a);
      }
    }
  }

  // Filled ellipse.
  oval(cx: number, cy: number, rx: number, ry: number, c: RGB, a: number): void {
    const x0 = Math.max(0, Math.floor(cx - rx));
    const x1 = Math.min(SIZE - 1, Math.ceil(cx + rx));
    const y0 = Math.max(0, Math.floor(cy - ry));
    const y1 = Math.min(SIZE - 1, Math.ceil(cy + ry));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.mix(x, y, c, a);
      }
    }
  }

  // Scanline-filled polygon.
  poly(points: Pt[], c: RGB, a: number): void {
    let lo = SIZE;
    let hi = 0;
    for (const p of points) {
      lo = Math.min(lo, p[1]);
      hi = Math.max(hi, p[1]);
    }
    lo = Math.max(0, Math.floor(lo));
    hi = Math.min(SIZE - 1, Math.ceil(hi));
    const n = points.length;
    for (let y = lo; y <= hi; y++) {
      const yc = y + 0.5;
      const xs: number[] = [];
      for (let i = 0; i < n; i++) {
        const p = points[i];
        const q = points[(i + 1) % n];
        if ((p[1] <= yc && q[1] > yc) || (q[1] <= yc && p[1] > yc)) {
          xs.push(p[0] + ((yc - p[1]) / (q[1] - p[1])) * (q[0] - p[0]));
        }
      }
      xs.sort((m, n2) => m - n2);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const x0 = Math.max(0, Math.ceil(xs[k]));
        const x1 = Math.min(SIZE - 1, Math.floor(xs[k + 1]));
        for (let x = x0; x <= x1; x++) this.mix(x, y, c, a);
      }
    }
  }

  // Thick segment, round caps: a chain of discs along the line.
  seg(x0: number, y0: number, x1: number, y1: number, w: number, c: RGB, a: number): void {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(len / Math.max(1, w * 0.35)));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      this.disk(x0 + dx * t, y0 + dy * t, w / 2, c, a);
    }
  }

  // Thick polyline with round joins.
  stroke(points: Pt[], w: number, c: RGB, a: number): void {
    for (let i = 0; i + 1 < points.length; i++) {
      this.seg(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1], w, c, a);
    }
  }

  // Soft halo: concentric discs whose alpha fades out quadratically,
  // so no hard ring shows.
  halo(cx: number, cy: number, r: number, c: RGB, peak: number): void {
    const rings = 72;
    for (let s = rings; s >= 1; s--) {
      const t = s / rings;
      this.disk(cx, cy, r * t, c, peak * (1 - t) * (1 - t) * 0.1);
    }
  }

  // Full-canvas vertical gradient through colour stops.
  sky(stops: Array<[number, RGB]>): void {
    for (let y = 0; y < SIZE; y++) {
      const t = y / (SIZE - 1);
      let i = 0;
      while (i + 1 < stops.length && stops[i + 1][0] < t) i++;
      const a = stops[i];
      const b = stops[Math.min(i + 1, stops.length - 1)];
      const span = b[0] - a[0] || 1;
      const f = Math.max(0, Math.min(1, (t - a[0]) / span));
      const r = Math.round(a[1][0] + (b[1][0] - a[1][0]) * f);
      const g = Math.round(a[1][1] + (b[1][1] - a[1][1]) * f);
      const bl = Math.round(a[1][2] + (b[1][2] - a[1][2]) * f);
      const row = y * SIZE * 3;
      for (let x = 0; x < SIZE; x++) {
        this.data[row + x * 3] = r;
        this.data[row + x * 3 + 1] = g;
        this.data[row + x * 3 + 2] = bl;
      }
    }
  }

  // Radial vignette: darken the corners so the eye stays on the wave.
  vignette(cx: number, cy: number, inner: number, outer: number, strength: number): void {
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d <= inner) continue;
        const f = Math.min(1, (d - inner) / (outer - inner));
        const dim = 1 - strength * f * f;
        const i = this.idx(x, y);
        this.data[i] = Math.round(this.data[i] * dim);
        this.data[i + 1] = Math.round(this.data[i + 1] * dim);
        this.data[i + 2] = Math.round(this.data[i + 2] * dim);
      }
    }
  }

  // Raw RGB rows for the encoder.
  bytes(): Uint8Array {
    return this.data;
  }
}

// ---------------------------------------------------------------------------
// 5x7 block capitals. Only the glyphs the text needs.
// ---------------------------------------------------------------------------

const GLYPHS: Record<string, string[]> = {
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
};

function drawGlyphs(img: Raster, text: string, x0: number, y0: number, s: number, c: RGB): void {
  let cx = x0;
  for (const ch of text) {
    const g = GLYPHS[ch] ?? GLYPHS[' '];
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (g[row][col] !== '#') continue;
        for (let dy = 0; dy < s; dy++) {
          for (let dx = 0; dx < s; dx++) {
            img.px(cx + col * s + dx, y0 + row * s + dy, c);
          }
        }
      }
    }
    cx += 6 * s;
  }
}

// Text with a dark outline: draw it shifted in 8 directions first.
function drawText(img: Raster, text: string, x: number, y: number, s: number): void {
  const dark: RGB = [6, 16, 40];
  const white: RGB = [255, 255, 255];
  for (const [dx, dy] of [[-3, 0], [3, 0], [0, -3], [0, 3], [-3, -3], [3, -3], [-3, 3], [3, 3]] as Pt[]) {
    drawGlyphs(img, text, x + dx, y + dy, s, dark);
  }
  drawGlyphs(img, text, x, y, s, white);
}

// ---------------------------------------------------------------------------
// The scene.
// ---------------------------------------------------------------------------

// Smooth crest height: the wave rises from the lower left to the lip.
function crestY(x: number): number {
  return 806 - 580 * Math.pow(Math.min(x, 940) / 940, 1.45);
}

function paint(img: Raster): void {
  // Night sky, indigo up top, burning orange at the horizon.
  img.sky([
    [0.0, [8, 12, 46]],
    [0.35, [24, 32, 92]],
    [0.55, [94, 44, 124]],
    [0.68, [214, 84, 72]],
    [1.0, [16, 40, 66]],
  ]);

  // Stars, thicker and brighter near the top.
  for (let i = 0; i < 220; i++) {
    const x = rand() * SIZE;
    const y = rand() * 560;
    const b = 140 + Math.floor(rand() * 115);
    const r = rand() < 0.12 ? 2.2 : rand() < 0.4 ? 1.6 : 1.1;
    img.disk(x, y, r, [b, b, Math.min(255, b + 20)], 0.9);
  }

  // A few birds: tiny dark chevrons.
  const bird: RGB = [20, 24, 52];
  const birds: Pt[] = [[180, 180], [240, 150], [300, 205], [150, 250], [340, 160]];
  const spans = [16, 12, 14, 10, 9];
  birds.forEach((bd, i) => {
    const s = spans[i];
    img.seg(bd[0] - s, bd[1], bd[0], bd[1] - s * 0.45, 2.4, bird, 0.9);
    img.seg(bd[0], bd[1] - s * 0.45, bd[0] + s, bd[1], 2.4, bird, 0.9);
  });

  // The huge moon, upper right, warm halo and crater freckles.
  img.halo(772, 208, 260, [255, 214, 140], 1.0);
  img.disk(772, 208, 92, [255, 246, 216], 1);
  img.disk(742, 182, 16, [232, 214, 176], 0.85);
  img.disk(796, 232, 11, [232, 214, 176], 0.85);
  img.disk(758, 240, 8, [238, 222, 186], 0.8);
  img.disk(812, 178, 7, [238, 222, 186], 0.8);

  // --- The wave. A densely sampled crest curve, so the lip bends
  // smoothly instead of kinking from point to point. ---
  const crest: Pt[] = [];
  for (let x = 0; x <= 940; x += 20) crest.push([x, crestY(x)]);
  const curl: Pt[] = [[958, 252], [950, 318], [912, 372], [856, 402], [806, 396]];
  const face: Pt[] = [
    [700, 545], [560, 665], [400, 785], [220, 895], [80, 970], [0, SIZE],
  ];

  // Wave body, deep teal.
  img.poly([[0, SIZE], ...crest, ...curl.slice(1), ...face], [7, 56, 92], 1);

  // Inner face, lighter teal, inset from the body.
  const innerCrest: Pt[] = [];
  for (let x = 64; x <= 880; x += 24) innerCrest.push([x, crestY(x) + 58]);
  img.poly(
    [
      [64, SIZE], ...innerCrest, [906, 302], [862, 382], [782, 482],
      [662, 602], [502, 722], [322, 852], [162, 962],
    ],
    [13, 122, 152],
    1,
  );

  // Sunlit band running down the face.
  img.poly(
    [
      [420, 700], [560, 600], [700, 470], [800, 360], [830, 350],
      [760, 470], [620, 600], [470, 720],
    ],
    [52, 196, 186],
    0.4,
  );

  // The tube: the shadowed hollow under the curling lip. Kept small and
  // tucked tight under the lip, with a bright rim on its upper edge so it
  // reads as the curl's shadow instead of a stray oval.
  img.oval(862, 356, 46, 22, [4, 30, 52], 1);
  img.oval(862, 352, 34, 15, [6, 44, 74], 1);
  // Foam arc hugging the top of the tube, so the shadow reads as the
  // curl's hollow instead of a stray oval.
  const rim: Pt[] = [];
  for (let a = Math.PI * 1.08; a <= Math.PI * 1.92; a += 0.1) {
    rim.push([862 + Math.cos(a) * 48, 354 + Math.sin(a) * 24]);
  }
  img.stroke(rim, 5, [215, 235, 248], 0.85);

  // Crest foam: a thick white lip along the sampled crest, plus the curl.
  img.stroke(crest, 15, [244, 252, 255], 1);
  img.stroke([[940, crestY(940)], ...curl], 13, [244, 252, 255], 1);
  // A thinner foam line inside the face, for volume.
  const innerFoam: Pt[] = [];
  for (let x = 60; x <= 880; x += 40) innerFoam.push([x, crestY(x) + 92]);
  img.stroke(innerFoam, 6, [160, 225, 240], 0.55);
  // Drips along the upper crest only, kept small so they read as foam,
  // not a row of beads.
  for (const p of crest) {
    if (p[1] > 700) continue;
    img.disk(p[0] + rand() * 12 - 6, p[1] + rand() * 8 - 2, 3 + rand() * 4, [255, 255, 255], 0.9);
  }
  // Spray arcing off the lip.
  for (let i = 0; i < 90; i++) {
    const t = rand();
    const x = 950 - t * 150 + rand() * 26 - 13;
    const y = 250 + t * t * 150 - t * 60 + rand() * 20 - 10;
    img.disk(x, y, 1 + rand() * 2.6, [235, 245, 255], 0.55 + rand() * 0.4);
  }
  // Foam flecks across the face.
  for (let i = 0; i < 160; i++) {
    const x = 60 + rand() * 880;
    const y = 560 + rand() * 440;
    img.disk(x, y, 0.9 + rand() * 2.2, [220, 240, 250], 0.25 + rand() * 0.35);
  }

  // --- The surfer: a speck with a bright board, riding the face. ---
  const board: RGB = [255, 88, 56];
  const dark: RGB = [8, 20, 38];
  img.seg(572, 612, 628, 584, 8, board, 1);
  img.seg(572, 612, 628, 584, 3.5, [255, 240, 220], 0.9);
  img.disk(608, 562, 5.5, dark, 1);
  img.seg(606, 568, 600, 592, 5, dark, 1);
  img.seg(602, 576, 582, 568, 4.5, dark, 1);
  img.seg(602, 576, 622, 570, 4.5, dark, 1);
  img.seg(600, 592, 590, 608, 4.5, dark, 1);
  img.seg(600, 592, 612, 604, 4.5, dark, 1);
  // A small wake trailing the board.
  img.seg(566, 614, 520, 628, 3, [240, 248, 255], 0.7);
  img.seg(556, 620, 516, 634, 2, [240, 248, 255], 0.5);

  // Foreground water: a dark band with foam streaks at the bottom.
  img.poly([[0, SIZE], [0, 968], [SIZE, 968], [SIZE, SIZE]], [5, 32, 56], 0.92);
  for (let i = 0; i < 14; i++) {
    const y = 978 + rand() * 40;
    const x0 = rand() * 700;
    img.seg(x0, y, x0 + 90 + rand() * 160, y + rand() * 4 - 2, 2, [210, 232, 244], 0.22 + rand() * 0.2);
  }

  // Pull the eye to the wave and the rider.
  img.vignette(512, 470, 560, 980, 0.3);

  // The words, bottom left: crisp block capitals.
  drawText(img, 'HOLD ON.', 56, 936, 6);
}

// ---------------------------------------------------------------------------
// PNG encoding: colour type 2 (RGB), 8-bit, filter-0 rows, zlib level 9.
// ---------------------------------------------------------------------------

function crcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
}

const CRC = crcTable();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    c = CRC[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  const signed = new Uint8Array(4 + data.length);
  signed.set(out.subarray(4, 8), 0);
  signed.set(data, 4);
  view.setUint32(8 + data.length, crc32(signed));
  return out;
}

function encodePng(img: Raster): Uint8Array {
  const raw = new Uint8Array(SIZE * (1 + SIZE * 3));
  const src = img.bytes();
  for (let y = 0; y < SIZE; y++) {
    raw[y * (1 + SIZE * 3)] = 0;
    raw.set(src.subarray(y * SIZE * 3, (y + 1) * SIZE * 3), y * (1 + SIZE * 3) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });

  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, SIZE);
  view.setUint32(4, SIZE);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type 2 = RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', idat),
    makeChunk('IEND', new Uint8Array(0)),
  ];
  let total = 0;
  for (const p of parts) total += p.length;
  const png = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    png.set(p, off);
    off += p.length;
  }
  return png;
}

function main(): void {
  const img = new Raster();
  paint(img);
  const png = encodePng(img);
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'entry.png'), png);
}

main();

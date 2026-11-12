import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";

const cache = new Map();

function readJascPal(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  // JASC-PAL / 0100 / count / RGB lines
  const colors = [];
  for (const line of lines) {
    if (!/^\d+\s+\d+\s+\d+/.test(line)) continue;
    const [r, g, b] = line.split(/\s+/).map(Number);
    colors.push([r, g, b]);
  }
  while (colors.length < 16) colors.push([0, 0, 0]);
  return colors.slice(0, 16);
}

function loadPalettes(tilesetDir) {
  const palDir = path.join(tilesetDir, "palettes");
  const pals = [];
  for (let i = 0; i < 16; i++) {
    const fp = path.join(palDir, `${String(i).padStart(2, "0")}.pal`);
    if (fs.existsSync(fp)) pals.push(readJascPal(fp));
    else pals.push(null);
  }
  return pals;
}

function loadTilesPng(tilesetDir) {
  const fp = path.join(tilesetDir, "tiles.png");
  const png = PNG.sync.read(fs.readFileSync(fp));
  return png;
}

/** Infer 4bpp index from greyscale-ish tiles.png channel. */
function indexFromPixel(r) {
  return Math.max(0, Math.min(15, Math.round(r / 17)));
}

function getTilePixels(png, tileId) {
  // tiles.png is 128xN → 16 tiles per row of 8x8
  const tilesPerRow = Math.floor(png.width / 8);
  const tx = (tileId % tilesPerRow) * 8;
  const ty = Math.floor(tileId / tilesPerRow) * 8;
  const out = Buffer.alloc(8 * 8);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const i = ((ty + y) * png.width + (tx + x)) * 4;
      out[y * 8 + x] = indexFromPixel(png.data[i]);
    }
  }
  return out;
}

function blitTile(dest, destW, dx, dy, tilePixels, palette, hFlip, vFlip) {
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const sx = hFlip ? 7 - x : x;
      const sy = vFlip ? 7 - y : y;
      const idx = tilePixels[sy * 8 + sx];
      if (idx === 0) continue; // transparent
      const [r, g, b] = palette[idx] || [255, 0, 255];
      const di = ((dy + y) * destW + (dx + x)) * 4;
      dest[di] = r;
      dest[di + 1] = g;
      dest[di + 2] = b;
      dest[di + 3] = 255;
    }
  }
}

function resolveTilesetDir(projectRoot, symbol) {
  // gTileset_General → primary/general, gTileset_Petalburg → secondary/petalburg
  const name = String(symbol || "").replace(/^gTileset_/, "");
  if (!name) return null;
  const snake = name
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/__/g, "_")
    .toLowerCase();
  const primary = path.join(projectRoot, "data", "tilesets", "primary", snake);
  const secondary = path.join(projectRoot, "data", "tilesets", "secondary", snake);
  if (fs.existsSync(path.join(primary, "metatiles.bin"))) return { dir: primary, isSecondary: false };
  if (fs.existsSync(path.join(secondary, "metatiles.bin"))) return { dir: secondary, isSecondary: true };
  // try lowercase already
  const p2 = path.join(projectRoot, "data", "tilesets", "primary", name.toLowerCase());
  const s2 = path.join(projectRoot, "data", "tilesets", "secondary", name.toLowerCase());
  if (fs.existsSync(path.join(p2, "metatiles.bin"))) return { dir: p2, isSecondary: false };
  if (fs.existsSync(path.join(s2, "metatiles.bin"))) return { dir: s2, isSecondary: true };
  return null;
}

function loadTileset(projectRoot, symbol) {
  const resolved = resolveTilesetDir(projectRoot, symbol);
  if (!resolved) return null;
  const metatiles = fs.readFileSync(path.join(resolved.dir, "metatiles.bin"));
  const count = Math.floor(metatiles.length / 16); // 8 x u16
  return {
    symbol,
    ...resolved,
    metatiles,
    count,
    png: loadTilesPng(resolved.dir),
    pals: loadPalettes(resolved.dir),
  };
}

function drawMetatile(rgba, width, x0, y0, metaId, primary, secondary) {
  const isSecondary = metaId >= 0x200;
  const localId = isSecondary ? metaId - 0x200 : metaId;
  const ts = isSecondary ? secondary : primary;
  if (!ts || localId < 0 || localId >= ts.count) {
    // magenta placeholder
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const i = ((y0 + y) * width + (x0 + x)) * 4;
        rgba[i] = 255;
        rgba[i + 1] = 0;
        rgba[i + 2] = 255;
        rgba[i + 3] = 255;
      }
    }
    return;
  }
  const base = localId * 16;
  // clear
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const i = ((y0 + y) * width + (x0 + x)) * 4;
      rgba[i] = 0;
      rgba[i + 1] = 0;
      rgba[i + 2] = 0;
      rgba[i + 3] = 0;
    }
  }
  // 8 tile refs: bottom layer 0-3, top layer 4-7; each TL TR BL BR
  for (let layer = 0; layer < 2; layer++) {
    for (let t = 0; t < 4; t++) {
      const word = ts.metatiles.readUInt16LE(base + (layer * 4 + t) * 2);
      const tileNum = word & 0x3ff;
      const hFlip = (word >> 10) & 1;
      const vFlip = (word >> 11) & 1;
      const palNum = (word >> 12) & 0xf;
      const tilePixels = getTilePixels(ts.png, tileNum);
      // Secondary tileset palettes often start at 6 in-engine; files are still 00.pal locally.
      const pal = ts.pals[palNum] || ts.pals[0] || Array.from({ length: 16 }, () => [0, 0, 0]);
      const dx = x0 + (t % 2) * 8;
      const dy = y0 + Math.floor(t / 2) * 8;
      blitTile(rgba, width, dx, dy, tilePixels, pal, hFlip, vFlip);
    }
  }
}

export function buildMetatileSheet(projectRoot, primarySymbol, secondarySymbol, opts = {}) {
  const key = `${projectRoot}|${primarySymbol}|${secondarySymbol}|${opts.max || 0}`;
  if (cache.has(key)) return cache.get(key);

  const primary = loadTileset(projectRoot, primarySymbol);
  const secondary = loadTileset(projectRoot, secondarySymbol);
  if (!primary) {
    throw new Error(`Primary tileset not found: ${primarySymbol}`);
  }

  const primaryCount = primary.count;
  const secondaryCount = secondary?.count || 0;
  const maxPrimary = Math.min(primaryCount, opts.maxPrimary || primaryCount);
  const maxSecondary = Math.min(secondaryCount, opts.maxSecondary || secondaryCount);
  const total = maxPrimary + maxSecondary;
  const cols = opts.cols || 16;
  const rows = Math.ceil(total / cols) || 1;
  const width = cols * 16;
  const height = rows * 16;
  const png = new PNG({ width, height });
  png.data.fill(0);

  const idList = [];
  for (let i = 0; i < maxPrimary; i++) idList.push(i);
  for (let i = 0; i < maxSecondary; i++) idList.push(0x200 + i);

  idList.forEach((metaId, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    drawMetatile(png.data, width, col * 16, row * 16, metaId, primary, secondary);
  });

  const buffer = PNG.sync.write(png);
  const result = {
    buffer,
    cols,
    tileSize: 16,
    primaryCount: maxPrimary,
    secondaryCount: maxSecondary,
    ids: idList,
    primaryPath: primary.dir,
    secondaryPath: secondary?.dir || null,
  };
  cache.set(key, result);
  return result;
}

export function renderLayoutPng(projectRoot, layout, blocks) {
  const primary = loadTileset(projectRoot, layout.primary_tileset);
  const secondary = loadTileset(projectRoot, layout.secondary_tileset);
  const width = layout.width * 16;
  const height = layout.height * 16;
  const png = new PNG({ width, height });
  png.data.fill(0);
  for (let y = 0; y < layout.height; y++) {
    for (let x = 0; x < layout.width; x++) {
      const b = blocks[y * layout.width + x];
      drawMetatile(png.data, width, x * 16, y * 16, b.metatileId, primary, secondary);
    }
  }
  return PNG.sync.write(png);
}

export function listTilesetSymbols(projectRoot) {
  const out = [];
  for (const kind of ["primary", "secondary"]) {
    const root = path.join(projectRoot, "data", "tilesets", kind);
    if (!fs.existsSync(root)) continue;
    for (const name of fs.readdirSync(root)) {
      const dir = path.join(root, name);
      if (fs.existsSync(path.join(dir, "metatiles.bin"))) {
        const pascal = name
          .split(/[_-]/)
          .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
          .join("");
        out.push({ kind, folder: name, symbol: `gTileset_${pascal}` });
      }
    }
  }
  return out;
}

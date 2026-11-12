import fs from "node:fs";
import path from "node:path";

export const METATILE_ID_MASK = 0x03ff;
export const COLLISION_MASK = 0x0c00;
export const ELEVATION_MASK = 0xf000;
export const COLLISION_SHIFT = 10;
export const ELEVATION_SHIFT = 12;

export function unpackBlock(word) {
  return {
    metatileId: word & METATILE_ID_MASK,
    collision: (word & COLLISION_MASK) >> COLLISION_SHIFT,
    elevation: (word & ELEVATION_MASK) >> ELEVATION_SHIFT,
    raw: word,
  };
}

export function packBlock({ metatileId = 0, collision = 0, elevation = 3 }) {
  return (
    (metatileId & METATILE_ID_MASK) |
    ((collision << COLLISION_SHIFT) & COLLISION_MASK) |
    ((elevation << ELEVATION_SHIFT) & ELEVATION_MASK)
  );
}

export function readBlockdata(filePath, width, height) {
  const buf = fs.readFileSync(filePath);
  const expected = width * height * 2;
  if (buf.length < expected) {
    throw new Error(
      `Blockdata too small: ${filePath} has ${buf.length} bytes, expected ${expected}`
    );
  }
  const blocks = [];
  for (let i = 0; i < width * height; i++) {
    const word = buf.readUInt16LE(i * 2);
    blocks.push(unpackBlock(word));
  }
  return blocks;
}

export function writeBlockdata(filePath, blocks, width, height) {
  if (blocks.length !== width * height) {
    throw new Error(
      `Block count ${blocks.length} != ${width}x${height}=${width * height}`
    );
  }
  const buf = Buffer.alloc(width * height * 2);
  for (let i = 0; i < blocks.length; i++) {
    const b = typeof blocks[i] === "number" ? unpackBlock(blocks[i]) : blocks[i];
    buf.writeUInt16LE(packBlock(b), i * 2);
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buf);
  return { bytes: buf.length, cells: blocks.length };
}

export function fillBlocks(width, height, fill = { metatileId: 1, collision: 0, elevation: 3 }) {
  return Array.from({ length: width * height }, () => ({ ...fill }));
}

export function readBorder(filePath) {
  if (!fs.existsSync(filePath)) {
    return fillBlocks(2, 2, { metatileId: 0, collision: 0, elevation: 3 });
  }
  return readBlockdata(filePath, 2, 2);
}

export function writeBorder(filePath, blocks = null) {
  const b = blocks || fillBlocks(2, 2, { metatileId: 0, collision: 0, elevation: 3 });
  return writeBlockdata(filePath, b, 2, 2);
}

export function paintBlocks(blocks, width, strokes) {
  const next = blocks.map((b) => ({ ...b }));
  for (const s of strokes) {
    const { x, y } = s;
    if (x < 0 || y < 0 || x >= width) continue;
    const height = Math.floor(next.length / width);
    if (y >= height) continue;
    const i = y * width + x;
    next[i] = {
      metatileId: s.metatileId ?? next[i].metatileId,
      collision: s.collision ?? next[i].collision,
      elevation: s.elevation ?? next[i].elevation,
    };
  }
  return next;
}

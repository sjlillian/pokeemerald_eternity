import fs from "node:fs";
import path from "node:path";
import {
  readBlockdata,
  writeBlockdata,
  readBorder,
  writeBorder,
  paintBlocks,
  fillBlocks,
} from "./layoutBin.mjs";

function layoutsPath(projectRoot) {
  return path.join(projectRoot, "data", "layouts", "layouts.json");
}

function mapGroupsPath(projectRoot) {
  return path.join(projectRoot, "data", "maps", "map_groups.json");
}

function mapDir(projectRoot, mapName) {
  return path.join(projectRoot, "data", "maps", mapName);
}

function mapJsonPath(projectRoot, mapName) {
  return path.join(mapDir(projectRoot, mapName), "map.json");
}

function scriptsPath(projectRoot, mapName) {
  return path.join(mapDir(projectRoot, mapName), "scripts.inc");
}

export function readLayoutsJson(projectRoot) {
  return JSON.parse(fs.readFileSync(layoutsPath(projectRoot), "utf8"));
}

export function writeLayoutsJson(projectRoot, data) {
  fs.writeFileSync(layoutsPath(projectRoot), JSON.stringify(data, null, 2) + "\n");
}

export function findLayout(projectRoot, layoutId) {
  const data = readLayoutsJson(projectRoot);
  const layout = (data.layouts || []).find((l) => l.id === layoutId || l.name === layoutId);
  return { data, layout };
}

export function readMapJson(projectRoot, mapName) {
  const fp = mapJsonPath(projectRoot, mapName);
  if (!fs.existsSync(fp)) {
    throw new Error(`Map not found: ${mapName}`);
  }
  return JSON.parse(fs.readFileSync(fp, "utf8"));
}

export function writeMapJson(projectRoot, mapName, json) {
  const fp = mapJsonPath(projectRoot, mapName);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, JSON.stringify(json, null, 2) + "\n");
  return fp;
}

export function loadMapDocument(projectRoot, mapName) {
  const map = readMapJson(projectRoot, mapName);
  const { layout } = findLayout(projectRoot, map.layout);
  if (!layout) {
    throw new Error(`Layout ${map.layout} not found for map ${mapName}`);
  }
  const blockPath = path.join(projectRoot, layout.blockdata_filepath);
  const borderPath = path.join(projectRoot, layout.border_filepath);
  const blocks = readBlockdata(blockPath, layout.width, layout.height);
  const border = readBorder(borderPath);
  let scripts = "";
  const sp = scriptsPath(projectRoot, mapName);
  if (fs.existsSync(sp)) scripts = fs.readFileSync(sp, "utf8");

  return {
    mapName,
    map,
    layout,
    blocks,
    border,
    scripts,
    paths: {
      mapJson: mapJsonPath(projectRoot, mapName),
      scripts: sp,
      blockdata: blockPath,
      border: borderPath,
    },
  };
}

export function saveMapHeader(projectRoot, mapName, patch) {
  const map = readMapJson(projectRoot, mapName);
  const allowed = [
    "music",
    "region",
    "region_map_section",
    "requires_flash",
    "weather",
    "map_type",
    "allow_cycling",
    "allow_escaping",
    "allow_running",
    "show_map_name",
    "battle_scene",
  ];
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      map[key] = patch[key];
    }
  }
  writeMapJson(projectRoot, mapName, map);
  return map;
}

export function saveConnections(projectRoot, mapName, connections) {
  const map = readMapJson(projectRoot, mapName);
  map.connections = Array.isArray(connections) ? connections : [];
  writeMapJson(projectRoot, mapName, map);
  return map.connections;
}

export function saveEvents(projectRoot, mapName, events) {
  const map = readMapJson(projectRoot, mapName);
  for (const key of ["object_events", "warp_events", "coord_events", "bg_events"]) {
    if (Object.prototype.hasOwnProperty.call(events, key)) {
      map[key] = events[key];
    }
  }
  writeMapJson(projectRoot, mapName, map);
  return {
    object_events: map.object_events,
    warp_events: map.warp_events,
    coord_events: map.coord_events,
    bg_events: map.bg_events,
  };
}

export function saveScripts(projectRoot, mapName, text) {
  const fp = scriptsPath(projectRoot, mapName);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, text.replace(/\r?\n/g, "\n"));
  ensureEventScriptsInclude(projectRoot, mapName);
  return fp;
}

export function saveLayoutBlocks(projectRoot, mapName, blocks) {
  const doc = loadMapDocument(projectRoot, mapName);
  writeBlockdata(
    doc.paths.blockdata,
    blocks,
    doc.layout.width,
    doc.layout.height
  );
  return { width: doc.layout.width, height: doc.layout.height, cells: blocks.length };
}

export function paintMap(projectRoot, mapName, strokes, defaults = {}) {
  const doc = loadMapDocument(projectRoot, mapName);
  const painted = paintBlocks(
    doc.blocks,
    doc.layout.width,
    strokes.map((s) => ({
      x: s.x,
      y: s.y,
      metatileId: s.metatileId ?? defaults.metatileId,
      collision: s.collision ?? defaults.collision,
      elevation: s.elevation ?? defaults.elevation ?? 3,
    }))
  );
  writeBlockdata(
    doc.paths.blockdata,
    painted,
    doc.layout.width,
    doc.layout.height
  );
  return {
    width: doc.layout.width,
    height: doc.layout.height,
    blocks: painted,
  };
}

export function ensureEventScriptsInclude(projectRoot, mapName) {
  const fp = path.join(projectRoot, "data", "event_scripts.s");
  if (!fs.existsSync(fp)) return { ok: false, reason: "missing event_scripts.s" };
  const line = `\t.include "data/maps/${mapName}/scripts.inc"`;
  const text = fs.readFileSync(fp, "utf8");
  if (text.includes(`data/maps/${mapName}/scripts.inc`)) {
    return { ok: true, already: true };
  }
  const trimmed = text.replace(/\s*$/, "");
  fs.writeFileSync(fp, `${trimmed}\n${line}\n`);
  return { ok: true, appended: true };
}

export function toLayoutConst(mapName) {
  const snake = mapName
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/__/g, "_")
    .toUpperCase();
  return {
    mapId: `MAP_${snake}`,
    layoutId: `LAYOUT_${snake}`,
    layoutName: `${mapName}_Layout`,
    mapsec: `MAPSEC_${snake}`,
  };
}

export function createMap(projectRoot, options) {
  const {
    name,
    width = 20,
    height = 20,
    primary_tileset = "gTileset_General",
    secondary_tileset = "gTileset_Petalburg",
    map_type = "MAP_TYPE_TOWN",
    group = "gMapGroup_Pangea",
    cloneFrom = null,
    fillMetatileId = 1,
    region_map_section = null,
  } = options;

  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) {
    throw new Error("Map name must be alphanumeric/underscore and start with a letter");
  }
  if (fs.existsSync(mapJsonPath(projectRoot, name))) {
    throw new Error(`Map already exists: ${name}`);
  }

  const ids = toLayoutConst(name);
  let layoutWidth = width;
  let layoutHeight = height;
  let primary = primary_tileset;
  let secondary = secondary_tileset;
  let blocks;
  let border;

  if (cloneFrom) {
    const src = loadMapDocument(projectRoot, cloneFrom);
    layoutWidth = src.layout.width;
    layoutHeight = src.layout.height;
    primary = src.layout.primary_tileset;
    secondary = src.layout.secondary_tileset;
    blocks = src.blocks.map((b) => ({ ...b }));
    border = src.border.map((b) => ({ ...b }));
  } else {
    blocks = fillBlocks(layoutWidth, layoutHeight, {
      metatileId: fillMetatileId,
      collision: 0,
      elevation: 3,
    });
    border = fillBlocks(2, 2, { metatileId: 0, collision: 0, elevation: 3 });
  }

  const layoutFolder = path.join(projectRoot, "data", "layouts", name);
  fs.mkdirSync(layoutFolder, { recursive: true });
  const blockRel = `data/layouts/${name}/map.bin`;
  const borderRel = `data/layouts/${name}/border.bin`;
  writeBlockdata(path.join(projectRoot, blockRel), blocks, layoutWidth, layoutHeight);
  writeBorder(path.join(projectRoot, borderRel), border);

  const layouts = readLayoutsJson(projectRoot);
  layouts.layouts = layouts.layouts || [];
  layouts.layouts.push({
    id: ids.layoutId,
    name: ids.layoutName,
    width: layoutWidth,
    height: layoutHeight,
    primary_tileset: primary,
    secondary_tileset: secondary,
    border_filepath: borderRel,
    blockdata_filepath: blockRel,
    layout_version: "emerald",
  });
  writeLayoutsJson(projectRoot, layouts);

  const map = {
    id: ids.mapId,
    name,
    layout: ids.layoutId,
    music: "MUS_LITTLEROOT",
    region: "REGION_HOENN",
    region_map_section: region_map_section || ids.mapsec,
    requires_flash: false,
    weather: "WEATHER_NONE",
    map_type,
    allow_cycling: true,
    allow_escaping: map_type === "MAP_TYPE_INDOOR" ? true : false,
    allow_running: true,
    show_map_name: true,
    battle_scene: "MAP_BATTLE_SCENE_NORMAL",
    connections: [],
    object_events: [],
    warp_events: [],
    coord_events: [],
    bg_events: [],
  };
  writeMapJson(projectRoot, name, map);
  saveScripts(projectRoot, name, `${name}_MapScripts::\n\t.byte 0\n`);

  const groups = JSON.parse(fs.readFileSync(mapGroupsPath(projectRoot), "utf8"));
  if (!groups[group]) groups[group] = [];
  if (!groups[group].includes(name)) groups[group].push(name);
  fs.writeFileSync(mapGroupsPath(projectRoot), JSON.stringify(groups, null, 2) + "\n");

  return {
    mapName: name,
    map,
    layoutId: ids.layoutId,
    group,
    size: { width: layoutWidth, height: layoutHeight },
  };
}

export { mapJsonPath, scriptsPath, mapGroupsPath };

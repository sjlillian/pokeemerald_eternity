import fs from "node:fs";
import path from "node:path";
import { MAP_GROUP, PINNED_MAPS, DEFAULT_MAP } from "./config.mjs";

/** Fallback list when project files are unreachable (cloud / missing checkout). */
export const FALLBACK_PANGEA_MAPS = [
  "StibiumTown",
  "BismutumVillage",
  "KaliumTown",
  "NatriumVillage",
  "FerrumTown",
  "CuprumTown",
  "ManganumCity",
  "HydrargyrumCity",
  "AurumCity",
  "NiccolumVillage",
  "StannumVillage",
  "ArgentumVillage",
  "KaliumForest",
  "NatriumLake",
  "FerrumRiver",
  "AurumForest",
  "AurumLake",
  "CuprumMountain",
  "ManganumMountain",
  "ArgentumMountain",
  "PangeanPass",
  "PangeaBikeBridge",
  "PangeaIsland1",
  "PangeaIsland2",
  "PangeaIsland3",
  "PangeaIsland4",
  "PangeaRoute1",
  "PangeaRoute2",
  "PangeaRoute3",
  "PangeaRoute4",
  "PangeaRoute5",
  "PangeaRoute6",
  "PangeaRoute7",
  "PangeaRoute8",
  "PangeaRoute9",
  "PangeaRoute10",
  "PangeaRoute11",
  "PangeaRoute12",
];

function classifyMap(name) {
  const n = name.toLowerCase();
  if (
    n.includes("indoor") ||
    n.includes("interior") ||
    n.includes("_house") ||
    n.includes("gym") ||
    n.includes("center") ||
    n.includes("mart") ||
    n.includes("room")
  ) {
    return "interior";
  }
  if (n.includes("route") || n.includes("pass") || n.includes("bridge") || n.includes("island")) {
    return "route";
  }
  if (n.includes("town") || n.includes("city") || n.includes("village")) {
    return "settlement";
  }
  return "other";
}

export function readPangeaMaps(projectRoot) {
  const groupsPath = path.join(projectRoot || "", "data", "maps", "map_groups.json");
  let maps = [];
  let source = "fallback";
  let error = null;

  if (projectRoot && fs.existsSync(groupsPath)) {
    try {
      const raw = fs.readFileSync(groupsPath, "utf8");
      const json = JSON.parse(raw);
      const group = json?.[MAP_GROUP];
      if (Array.isArray(group) && group.length) {
        maps = group.map(String);
        source = "map_groups.json";
      } else {
        error = `${MAP_GROUP} missing or empty in map_groups.json`;
        maps = FALLBACK_PANGEA_MAPS;
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      maps = FALLBACK_PANGEA_MAPS;
    }
  } else {
    maps = FALLBACK_PANGEA_MAPS;
    if (!projectRoot) error = "No project root configured";
    else if (!fs.existsSync(projectRoot)) error = `Project root not found: ${projectRoot}`;
    else error = "data/maps/map_groups.json not found";
  }

  const pinnedSet = new Set(PINNED_MAPS);
  const enriched = maps.map((name) => ({
    name,
    kind: classifyMap(name),
    pinned: pinnedSet.has(name),
    isDefault: name === DEFAULT_MAP,
  }));

  enriched.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return {
    group: MAP_GROUP,
    source,
    error,
    count: enriched.length,
    defaultMap: DEFAULT_MAP,
    pinned: PINNED_MAPS,
    maps: enriched,
    openGuide:
      "In Porymap: use the map list / filter to open the named map. Prefer gMapGroup_Pangea members (StibiumTown default).",
  };
}

export const SURFACE_GUIDES = [
  {
    id: "region-map",
    title: "Region Map Editor",
    shortcut: "Ctrl+M",
    path: "Tools → Region Map Editor",
    docs: "https://huderlem.github.io/porymap/manual/region-map-editor.html",
    notes: "Tabs: Background Image, Map Layout, Map Entries. Map Layout = MAPSEC / Fly placement.",
  },
  {
    id: "events",
    title: "Events",
    shortcut: null,
    path: "Open a map → Events tab (object events, triggers, etc.)",
    docs: "https://huderlem.github.io/porymap/manual/events.html",
    notes: "Agent edits under data/maps/** event JSON refresh after Porymap reload.",
  },
  {
    id: "warps",
    title: "Warps",
    shortcut: null,
    path: "Open a map → Events → Warp events",
    docs: "https://huderlem.github.io/porymap/manual/events.html",
    notes: "Interiors and overworld links live here; Studio watches the same map files.",
  },
  {
    id: "scripts",
    title: "Scripts",
    shortcut: null,
    path: "Open a map / event → script field, or edit data/scripts and map-local scripts in the repo",
    docs: "https://huderlem.github.io/porymap/manual/scripting.html",
    notes: "Studio watches data/scripts/** and map script paths; reload Porymap to re-read.",
  },
  {
    id: "connections",
    title: "Connections",
    shortcut: null,
    path: "Open a map → Connections tab",
    docs: "https://huderlem.github.io/porymap/manual/connections-tab.html",
    notes: "Watched via data/maps/**.",
  },
  {
    id: "tilesets",
    title: "Tilesets / Metatiles",
    shortcut: null,
    path: "Tileset editor / metatile pane in the map view",
    docs: "https://huderlem.github.io/porymap/manual/tileset-editor.html",
    notes: "Watched via src/data/tilesets/** when present.",
  },
  {
    id: "encounters",
    title: "Wild Encounters",
    shortcut: null,
    path: "Tools / Wild Pokémon editor (project-dependent)",
    docs: "https://huderlem.github.io/porymap/manual/",
    notes: "Default watch includes src/data/wild_encounters.json when present.",
  },
];

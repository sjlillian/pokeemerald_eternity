import fs from "node:fs";
import path from "node:path";

export const DEFAULT_PORYMAP_PATH =
  "C:\\Users\\Spencer\\OneDrive\\Desktop\\PokemonGame\\porymap-windows-6.3.1\\porymap.exe";

export const DEFAULT_PROJECT_ROOT =
  "C:\\Users\\Spencer\\OneDrive\\Desktop\\Pokemon Aurora Project\\pokeemerald_eternity";

export const DEFAULT_WATCH_GLOBS = [
  "data/maps/**",
  "data/layouts/**",
  "data/scripts/**",
  "src/data/region_map/**",
  "src/data/wild_encounters.json",
  "src/data/tilesets/**",
];

export const PINNED_MAPS = [
  "StibiumTown",
  "PangeanPass",
  "PangeaBikeBridge",
  "FerrumTown",
  "HydrargyrumCity",
];

export const DEFAULT_MAP = "StibiumTown";

export const MAP_GROUP = "gMapGroup_Pangea";

export const RELOAD_HINT_DEFAULT =
  "Reload the project in Porymap (File → Reload Project, or your usual shortcut).";

export function loadConfig(env = process.env) {
  const porymapPath = (env.PORYMAP_PATH || DEFAULT_PORYMAP_PATH).trim();
  const projectRoot = (env.PROJECT_ROOT || DEFAULT_PROJECT_ROOT).trim();
  const port = Number(env.PORT || 7340);
  const reloadHint = (env.RELOAD_HINT || RELOAD_HINT_DEFAULT).trim();
  const watchGlobs = env.WATCH_GLOBS
    ? env.WATCH_GLOBS.split(";").map((g) => g.trim()).filter(Boolean)
    : DEFAULT_WATCH_GLOBS;

  return {
    porymapPath,
    projectRoot,
    port,
    reloadHint,
    watchGlobs,
    mapGroup: MAP_GROUP,
    pinnedMaps: PINNED_MAPS,
    defaultMap: DEFAULT_MAP,
  };
}

export function looksLikePokeemeraldProject(root) {
  if (!root) return false;
  return (
    fs.existsSync(path.join(root, "data", "maps")) ||
    fs.existsSync(path.join(root, "data", "layouts"))
  );
}

export function detectPorymapVersionLabel(exePath) {
  if (!exePath) return { ok: false, label: "missing path", warn511: false };
  const exists = fs.existsSync(exePath);
  if (!exists) {
    return { ok: false, label: "not found on disk", warn511: false, exists: false };
  }
  const lower = exePath.toLowerCase();
  const warn511 = lower.includes("5.1.1") || lower.includes("porymap-windows-5");
  const looks631 = lower.includes("6.3.1") || lower.includes("porymap-windows-6.3");
  return {
    ok: !warn511,
    exists: true,
    label: warn511 ? "looks like 5.1.1 (unsupported for eternity)" : looks631 ? "6.3.1 path" : "found (confirm 6.3.1)",
    warn511,
    looks631,
  };
}

import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadConfig,
  looksLikePokeemeraldProject,
  detectPorymapVersionLabel,
} from "./lib/config.mjs";
import { launchPorymap, getLaunchState } from "./lib/launch.mjs";
import { readPangeaMaps, SURFACE_GUIDES } from "./lib/maps.mjs";
import { MapStackWatcher } from "./lib/watch.mjs";
import {
  loadMapDocument,
  saveMapHeader,
  saveConnections,
  saveEvents,
  saveScripts,
  saveLayoutBlocks,
  paintMap,
  createMap,
} from "./lib/mapDocument.mjs";
import {
  buildMetatileSheet,
  renderLayoutPng,
  listTilesetSymbols,
} from "./lib/tilesetRender.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = loadConfig();
const app = express();
app.use(express.json({ limit: "8mb" }));

const watcher = new MapStackWatcher({
  projectRoot: config.projectRoot,
  globs: config.watchGlobs,
});

const sseClients = new Set();
let studioWriteUntil = 0;

function noteStudioWrite() {
  studioWriteUntil = Date.now() + 1500;
}

function localCapabilities() {
  const version = detectPorymapVersionLabel(config.porymapPath);
  const projectExists = Boolean(
    config.projectRoot && looksLikePokeemeraldProject(config.projectRoot)
  );
  return {
    localMode: Boolean(version.exists && projectExists),
    porymap: version,
    projectOk: projectExists,
  };
}

function statusPayload() {
  const caps = localCapabilities();
  const watch = watcher.getStatus();
  return {
    app: "Porymap Studio",
    version: "0.2.0",
    ...caps,
    porymapPath: config.porymapPath,
    projectRoot: config.projectRoot,
    mapGroup: config.mapGroup,
    defaultMap: config.defaultMap,
    pinnedMaps: config.pinnedMaps,
    reloadHint: config.reloadHint,
    watchGlobs: config.watchGlobs,
    launch: getLaunchState(),
    sync: {
      state: watch.syncState,
      watching: watch.watching,
      lastEvent: watch.lastEvent,
      studioWriteQuiet: Date.now() < studioWriteUntil,
    },
    activity: watch.activity,
  };
}

function requireLocal(res) {
  const caps = localCapabilities();
  if (!caps.projectOk) {
    res.status(503).json({
      ok: false,
      error: "Project root not available. Run Studio locally against pokeemerald_eternity.",
    });
    return false;
  }
  return true;
}

function broadcast(event) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of sseClients) client.write(data);
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, app: "porymap-studio", version: "0.2.0" });
});

app.get("/api/status", (_req, res) => {
  res.json(statusPayload());
});

app.get("/api/maps", (_req, res) => {
  res.json(readPangeaMaps(config.projectRoot));
});

app.get("/api/surfaces", (_req, res) => {
  res.json({ surfaces: SURFACE_GUIDES });
});

app.get("/api/tilesets", (_req, res) => {
  if (!requireLocal(res)) return;
  res.json({ tilesets: listTilesetSymbols(config.projectRoot) });
});

app.get("/api/maps/:name", (req, res) => {
  if (!requireLocal(res)) return;
  try {
    const doc = loadMapDocument(config.projectRoot, req.params.name);
    res.json({
      ok: true,
      mapName: doc.mapName,
      map: doc.map,
      layout: doc.layout,
      blocks: doc.blocks,
      border: doc.border,
      scripts: doc.scripts,
      paths: doc.paths,
    });
  } catch (err) {
    res.status(404).json({ ok: false, error: err.message });
  }
});

app.get("/api/maps/:name/preview.png", (req, res) => {
  if (!requireLocal(res)) return;
  try {
    const doc = loadMapDocument(config.projectRoot, req.params.name);
    const png = renderLayoutPng(config.projectRoot, doc.layout, doc.blocks);
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "no-store");
    res.send(png);
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.get("/api/tilesheet.png", (req, res) => {
  if (!requireLocal(res)) return;
  try {
    const primary = String(req.query.primary || "gTileset_General");
    const secondary = String(req.query.secondary || "gTileset_Petalburg");
    const sheet = buildMetatileSheet(config.projectRoot, primary, secondary, {
      cols: Number(req.query.cols || 16),
    });
    res.setHeader("Content-Type", "image/png");
    res.setHeader(
      "X-Porymap-Studio-Meta",
      JSON.stringify({
        cols: sheet.cols,
        tileSize: sheet.tileSize,
        primaryCount: sheet.primaryCount,
        secondaryCount: sheet.secondaryCount,
        ids: sheet.ids,
      })
    );
    res.send(sheet.buffer);
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.get("/api/tilesheet/meta", (req, res) => {
  if (!requireLocal(res)) return;
  try {
    const primary = String(req.query.primary || "gTileset_General");
    const secondary = String(req.query.secondary || "gTileset_Petalburg");
    const sheet = buildMetatileSheet(config.projectRoot, primary, secondary);
    res.json({
      ok: true,
      cols: sheet.cols,
      tileSize: sheet.tileSize,
      primaryCount: sheet.primaryCount,
      secondaryCount: sheet.secondaryCount,
      ids: sheet.ids,
      url: `/api/tilesheet.png?primary=${encodeURIComponent(primary)}&secondary=${encodeURIComponent(secondary)}`,
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.put("/api/maps/:name/header", (req, res) => {
  if (!requireLocal(res)) return;
  try {
    noteStudioWrite();
    const map = saveMapHeader(config.projectRoot, req.params.name, req.body || {});
    res.json({ ok: true, map });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.put("/api/maps/:name/connections", (req, res) => {
  if (!requireLocal(res)) return;
  try {
    noteStudioWrite();
    const connections = saveConnections(
      config.projectRoot,
      req.params.name,
      req.body?.connections || req.body || []
    );
    res.json({ ok: true, connections });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.put("/api/maps/:name/events", (req, res) => {
  if (!requireLocal(res)) return;
  try {
    noteStudioWrite();
    const events = saveEvents(config.projectRoot, req.params.name, req.body || {});
    res.json({ ok: true, events });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.put("/api/maps/:name/scripts", (req, res) => {
  if (!requireLocal(res)) return;
  try {
    noteStudioWrite();
    const fp = saveScripts(
      config.projectRoot,
      req.params.name,
      String(req.body?.text ?? "")
    );
    res.json({ ok: true, path: fp });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.put("/api/maps/:name/layout", (req, res) => {
  if (!requireLocal(res)) return;
  try {
    noteStudioWrite();
    const result = saveLayoutBlocks(
      config.projectRoot,
      req.params.name,
      req.body?.blocks || []
    );
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.post("/api/maps/:name/paint", (req, res) => {
  if (!requireLocal(res)) return;
  try {
    noteStudioWrite();
    const strokes = req.body?.strokes || [];
    const defaults = req.body?.defaults || {};
    const result = paintMap(config.projectRoot, req.params.name, strokes, defaults);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.post("/api/maps/create", (req, res) => {
  if (!requireLocal(res)) return;
  try {
    noteStudioWrite();
    const created = createMap(config.projectRoot, req.body || {});
    res.json({ ok: true, ...created });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.post("/api/launch", (req, res) => {
  const caps = localCapabilities();
  if (!caps.porymap.exists) {
    return res.status(503).json({
      ok: false,
      localOnly: true,
      error:
        "Porymap binary not reachable. Run Studio locally so launch can spawn 6.3.1.",
      status: statusPayload(),
    });
  }
  const result = launchPorymap({
    porymapPath: config.porymapPath,
    projectRoot: config.projectRoot,
    force: Boolean(req.body?.force),
  });
  const status = statusPayload();
  if (!result.ok) {
    return res.status(result.needsConfirm ? 409 : 400).json({ ...result, status });
  }
  return res.json({ ...result, status });
});

app.post("/api/ack-reload", (_req, res) => {
  res.json(watcher.acknowledgeReload());
});

app.get("/api/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
  res.write(`data: ${JSON.stringify({ type: "hello", status: statusPayload() })}\n\n`);
  sseClients.add(res);
  req.on("close", () => sseClients.delete(res));
});

watcher.on("change", (evt) => {
  const quiet = Date.now() < studioWriteUntil;
  if (quiet) {
    watcher.acknowledgeReload();
    broadcast({
      type: "studio-saved",
      event: evt,
      status: statusPayload(),
      message: "Studio wrote map files — canvas is source of truth; reload Porymap to verify.",
    });
    return;
  }
  broadcast({
    type: "files-changed",
    syncState: "reload needed",
    reloadHint: config.reloadHint,
    event: evt,
    status: statusPayload(),
  });
});

watcher.on("activity", (evt) => {
  broadcast({ type: "activity", event: evt });
});

app.use(express.static(path.join(__dirname, "public")));
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

await watcher.start();
app.listen(config.port, "127.0.0.1", () => {
  const caps = localCapabilities();
  console.log(`Porymap Studio http://127.0.0.1:${config.port}`);
  console.log(`  project: ${config.projectRoot}`);
  console.log(`  porymap: ${config.porymapPath}`);
  console.log(`  localMode: ${caps.localMode} (${caps.porymap.label})`);
  console.log(`  editors: layout/events/warps/scripts/connections/create`);
});

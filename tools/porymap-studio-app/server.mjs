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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = loadConfig();
const app = express();
app.use(express.json({ limit: "256kb" }));

const watcher = new MapStackWatcher({
  projectRoot: config.projectRoot,
  globs: config.watchGlobs,
});

const sseClients = new Set();

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
    version: "0.1.0",
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
    },
    activity: watch.activity,
  };
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, app: "porymap-studio" });
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

app.post("/api/launch", (req, res) => {
  const caps = localCapabilities();
  if (!caps.porymap.exists) {
    return res.status(503).json({
      ok: false,
      localOnly: true,
      error:
        "Porymap binary not reachable from this server. Run Studio locally on Spencer’s Windows machine (npm start) so launch can spawn 6.3.1.",
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
  req.on("close", () => {
    sseClients.delete(res);
  });
});

function broadcast(event) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of sseClients) {
    client.write(data);
  }
}

watcher.on("change", (evt) => {
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
  console.log(`  watch: ${caps.projectOk ? "on" : "off"}`);
});

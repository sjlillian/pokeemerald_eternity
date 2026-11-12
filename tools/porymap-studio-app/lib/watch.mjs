import path from "node:path";
import { EventEmitter } from "node:events";

/**
 * File watcher for map-stack globs. Uses chokidar when available.
 * Emits: { type, path, at }
 */
export class MapStackWatcher extends EventEmitter {
  constructor({ projectRoot, globs, debounceMs = 400 }) {
    super();
    this.projectRoot = projectRoot;
    this.globs = globs;
    this.debounceMs = debounceMs;
    this.watcher = null;
    this.timer = null;
    this.lastEvent = null;
    this.activity = [];
    this.maxActivity = 40;
    this.syncState = "idle";
  }

  getStatus() {
    return {
      syncState: this.syncState,
      watching: Boolean(this.watcher),
      projectRoot: this.projectRoot,
      globs: this.globs,
      lastEvent: this.lastEvent,
      activity: this.activity.slice(0, 20),
    };
  }

  async start() {
    await this.stop();
    if (!this.projectRoot) {
      this.syncState = "no-project";
      return this.getStatus();
    }

    let chokidar;
    try {
      chokidar = await import("chokidar");
    } catch {
      this.syncState = "watcher-unavailable";
      return this.getStatus();
    }

    // Prefer directory roots + cwd so Windows path.join does not break `**` globs.
    const watchTargets = this.globs.map((g) => {
      const cleaned = g.replace(/\\/g, "/").replace(/\/\*\*$/, "").replace(/\*\*$/, "");
      return cleaned || g;
    });
    this.watcher = chokidar.watch(watchTargets, {
      cwd: this.projectRoot,
      ignoreInitial: true,
      // OneDrive / Windows often miss native FS events; polling keeps the watch-first loop honest.
      usePolling: true,
      interval: 500,
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
      ignored: [
        /(^|[/\\])\../,
        /node_modules/,
        /\.git/,
        /\/build\//,
        /\\build\\/,
      ],
    });

    const onFs = (type) => (filePath) => this.#queue(type, filePath);
    this.watcher.on("add", onFs("add"));
    this.watcher.on("change", onFs("change"));
    this.watcher.on("unlink", onFs("unlink"));
    this.watcher.on("error", (err) => {
      this.emit("error", err);
    });

    this.syncState = "watching";
    return this.getStatus();
  }

  #queue(type, filePath) {
    const abs = path.isAbsolute(filePath)
      ? filePath
      : path.join(this.projectRoot || "", filePath);
    const rel = this.projectRoot ? path.relative(this.projectRoot, abs) : filePath;
    const event = {
      type,
      path: rel.replace(/\\/g, "/"),
      absPath: abs,
      at: new Date().toISOString(),
    };
    this.lastEvent = event;
    this.syncState = "files changed";
    this.activity.unshift(event);
    if (this.activity.length > this.maxActivity) {
      this.activity.length = this.maxActivity;
    }

    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.syncState = "reload needed";
      this.emit("change", { ...event, syncState: this.syncState });
    }, this.debounceMs);

    this.emit("activity", event);
  }

  acknowledgeReload() {
    this.syncState = this.watcher ? "watching" : "idle";
    return this.getStatus();
  }

  async stop() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }
}

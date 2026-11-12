import fs from "node:fs";
import { spawn } from "node:child_process";
import { looksLikePokeemeraldProject, detectPorymapVersionLabel } from "./config.mjs";

let running = null;

export function getLaunchState() {
  return {
    running: Boolean(running && !running.killed),
    pid: running?.pid ?? null,
  };
}

export function launchPorymap({ porymapPath, projectRoot, force = false }) {
  const version = detectPorymapVersionLabel(porymapPath);
  if (!porymapPath) {
    return { ok: false, error: "Porymap path is empty. Set PORYMAP_PATH." };
  }
  if (!version.exists) {
    return {
      ok: false,
      error: `Porymap binary not found: ${porymapPath}`,
      version,
    };
  }
  if (version.warn511) {
    return {
      ok: false,
      error:
        "Configured path looks like Porymap 5.1.1. Eternity needs 6.3.1 — update PORYMAP_PATH.",
      version,
    };
  }
  if (!projectRoot) {
    return { ok: false, error: "Project root is empty. Set PROJECT_ROOT." };
  }
  if (!fs.existsSync(projectRoot)) {
    return { ok: false, error: `Project root not found: ${projectRoot}` };
  }

  const projectOk = looksLikePokeemeraldProject(projectRoot);
  if (!projectOk && !force) {
    return {
      ok: false,
      needsConfirm: true,
      error: `No data/maps or data/layouts under ${projectRoot}. Pass force=true to launch anyway.`,
    };
  }

  if (running && !running.killed) {
    return {
      ok: true,
      alreadyRunning: true,
      message:
        "Porymap already launched from Studio. Focus that window, or close it and launch again.",
      pid: running.pid,
      projectRoot,
      version,
    };
  }

  try {
    running = spawn(porymapPath, [projectRoot], {
      detached: true,
      stdio: "ignore",
      windowsHide: false,
    });
    running.unref();
    running.on("error", () => {
      running = null;
    });
    running.on("exit", () => {
      running = null;
    });
    return {
      ok: true,
      launched: true,
      pid: running.pid,
      projectRoot,
      porymapPath,
      version,
      message: `Launched Porymap on ${projectRoot}`,
    };
  } catch (err) {
    running = null;
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

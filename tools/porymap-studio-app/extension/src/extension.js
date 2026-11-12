const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const http = require("http");
const { spawn } = require("child_process");

let serverProc = null;

const FALLBACK_APP_ROOT =
  "C:\\Users\\Spencer\\OneDrive\\Desktop\\Pokemon Aurora Project\\porymap-studio-app";

function getPort() {
  return vscode.workspace.getConfiguration("porymapStudio").get("port", 7340);
}

function studioUrl() {
  return `http://127.0.0.1:${getPort()}`;
}

function appRoot() {
  const configured = vscode.workspace
    .getConfiguration("porymapStudio")
    .get("appRoot", "")
    .trim();
  if (configured && fs.existsSync(path.join(configured, "server.mjs"))) {
    return configured;
  }
  // extension/src → extension → porymap-studio-app
  const sibling = path.resolve(__dirname, "..", "..");
  if (fs.existsSync(path.join(sibling, "server.mjs"))) {
    return sibling;
  }
  return FALLBACK_APP_ROOT;
}

function checkHealth(port) {
  return new Promise((resolve) => {
    const req = http.get(
      { host: "127.0.0.1", port, path: "/api/health", timeout: 800 },
      (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      }
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function ensureServer() {
  const port = getPort();
  if (await checkHealth(port)) {
    return { ok: true, already: true, url: studioUrl() };
  }

  const auto = vscode.workspace
    .getConfiguration("porymapStudio")
    .get("autoStartServer", true);
  if (!auto) {
    return {
      ok: false,
      error: `Studio server not running on ${studioUrl()}. Run npm start in porymap-studio-app.`,
    };
  }

  if (serverProc && !serverProc.killed) {
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 250));
      if (await checkHealth(port)) {
        return { ok: true, started: true, url: studioUrl() };
      }
    }
  }

  const root = appRoot();
  const entry = path.join(root, "server.mjs");
  serverProc = spawn(process.execPath, [entry], {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    detached: false,
    stdio: "ignore",
    windowsHide: true,
  });
  serverProc.on("exit", () => {
    serverProc = null;
  });

  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 250));
    if (await checkHealth(port)) {
      return { ok: true, started: true, url: studioUrl() };
    }
  }
  return {
    ok: false,
    error: `Timed out waiting for Studio server at ${studioUrl()}. From porymap-studio-app run: npm install && npm start`,
  };
}

function getWebviewHtml(webview, url) {
  const csp = [
    `default-src 'none'`,
    `frame-src ${url}`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src ${webview.cspSource}`,
  ].join("; ");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Porymap Studio</title>
  <style>
    html, body, iframe { margin: 0; width: 100%; height: 100%; border: 0; background: #0c1611; }
    .boot { color: #9bb0a2; font: 13px/1.4 sans-serif; padding: 16px; }
  </style>
</head>
<body>
  <div class="boot" id="boot">Starting Porymap Studio…</div>
  <iframe id="frame" title="Porymap Studio" src="${url}" style="display:none"></iframe>
  <script>
    const frame = document.getElementById('frame');
    const boot = document.getElementById('boot');
    frame.addEventListener('load', () => {
      boot.style.display = 'none';
      frame.style.display = 'block';
    });
  </script>
</body>
</html>`;
}

class StudioViewProvider {
  constructor(context) {
    this.context = context;
  }

  resolveWebviewView(webviewView) {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri],
    };
    void this.refresh(webviewView);
  }

  async refresh(webviewView) {
    const target = webviewView || this.view;
    if (!target) return;
    target.webview.html = `<!DOCTYPE html><html><body style="background:#0c1611;color:#9bb0a2;font:13px sans-serif;padding:16px">Starting local Studio server…</body></html>`;
    const result = await ensureServer();
    if (!result.ok) {
      target.webview.html = `<!DOCTYPE html><html><body style="background:#0c1611;color:#f0d78a;font:13px/1.45 sans-serif;padding:16px"><strong>Porymap Studio</strong><p>${result.error}</p></body></html>`;
      return;
    }
    target.webview.html = getWebviewHtml(target.webview, result.url);
  }
}

function activate(context) {
  const provider = new StudioViewProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("porymapStudio.panel", provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand("porymapStudio.open", async () => {
      await vscode.commands.executeCommand("porymapStudio.panel.focus");
      await provider.refresh();
    }),
    vscode.commands.registerCommand("porymapStudio.ensureServer", async () => {
      const result = await ensureServer();
      if (result.ok) {
        void vscode.window.showInformationMessage(`Porymap Studio ready: ${result.url}`);
        await provider.refresh();
      } else {
        void vscode.window.showErrorMessage(result.error);
      }
    })
  );
}

function deactivate() {
  if (serverProc && !serverProc.killed) {
    serverProc.kill();
    serverProc = null;
  }
}

module.exports = { activate, deactivate };

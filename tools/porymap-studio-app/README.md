# Porymap Studio (Cursor App MVP)

Watch-first map cockpit for **Pokémon Aurora / Pangea**. Orchestrates **Porymap 6.3.1** (launch + file sync + guided surfaces). Does **not** reimplement the Qt editors.

PRD: Project docs `porymap-studio-app-prd.md` v0.2 (full Porymap parity for orchestration).

## What works in this MVP

| Capability | Status |
|------------|--------|
| Launch Porymap 6.3.1 on `pokeemerald_eternity` | Works (local server) |
| Soft guard against 5.1.1 paths | Works |
| Watch map / layout / script / region / tileset / encounter globs | Works (chokidar + SSE activity feed) |
| Reload nudge (`reload needed` badge + hint) | Works (manual File → Reload Project in Porymap) |
| `gMapGroup_Pangea` list + search + pins | Works (reads `map_groups.json`) |
| Region Map / Events / Warps / Scripts / … guides | Works (cockpit → native Porymap) |
| Qt embed / true deep-link open-map / auto-reload API | Deferred |

## Locked local paths

| Item | Path |
|------|------|
| App | `C:\Users\Spencer\OneDrive\Desktop\Pokemon Aurora Project\porymap-studio-app` |
| Project | `C:\Users\Spencer\OneDrive\Desktop\Pokemon Aurora Project\pokeemerald_eternity` |
| Porymap 6.3.1 | `C:\Users\Spencer\OneDrive\Desktop\PokemonGame\porymap-windows-6.3.1\porymap.exe` |

Override with env (`PORYMAP_PATH`, `PROJECT_ROOT`, `PORT`) or `.env` values from `.env.example`.

## Happy path A — local Cursor App server (launch + live watch)

```powershell
cd "C:\Users\Spencer\OneDrive\Desktop\Pokemon Aurora Project\porymap-studio-app"
npm install
npm start
```

Open **http://127.0.0.1:7340** (browser, Cursor Simple Browser, or Apps preview after publish).

1. Confirm project + Porymap strip are green/local.
2. **Launch / Focus Porymap**.
3. Let an agent edit `data/maps/**` (or other watched paths).
4. Watch **Activity** + sync badge → in Porymap use **File → Reload Project**.

## Happy path B — Cursor Activity Bar panel

Keeps the same server UI beside chat.

```powershell
cd "C:\Users\Spencer\OneDrive\Desktop\Pokemon Aurora Project\porymap-studio-app"
npm install

cd extension
# From repo root of the app, package the companion extension:
npx --yes @vscode/vsce package --allow-missing-repository
```

Install the generated `.vsix` with the **Cursor CLI** (not double-click / VS VSIXInstaller):

```powershell
cursor --install-extension ".\porymap-studio-0.1.0.vsix"
```

Or: Extensions → `…` → **Install from VSIX…**

Then:

1. Reload Cursor.
2. Click the **Porymap Studio** Activity Bar icon (map glyph).
3. Panel auto-starts `server.mjs` when needed.
4. Use **Launch / Focus Porymap** inside the panel.

Commands: `Porymap Studio: Focus Panel`, `Porymap Studio: Start Local Server`.

## Publish as Cursor App

This folder is a deployable web app (`public/` + `server.mjs`).

- **On this Windows machine:** `npm start` → http://127.0.0.1:7340 (launch + watch work). Activity Bar companion under `extension/`.
- **Cursor-hosted `publish-app`:** not available from this self-hosted worker; use a managed Cloud Agent on this repo/folder when you want the Apps catalog entry. Hosted runtime still needs a local server to spawn `porymap.exe`.

Git tracking copy also lives at `pokeemerald_eternity/tools/porymap-studio-app` on branch `cursor/porymap-studio-mvp-3bc6` for PR review. **Run from the Desktop sibling folder above** (same code).

## Coexistence with `porymap-cursor-extension`

Keep using **Porymap: Launch against Workspace** until you prefer Studio daily. Studio reuses the same launch + watch idea with a richer Apps-style UI and wider globs. Do not remove the old extension yet.

## Scripts

| Script | Purpose |
|--------|---------|
| `npm start` / `npm run dev` | Local Studio server on `127.0.0.1:7340` |
| `npm run check` | Syntax-check server modules |

## Deferred (honest)

- Automatic Porymap reload without menu action  
- CLI/deep-link that opens a named map or Events tab  
- Qt embed inside Cursor  
- Replacing the Command Palette extension entirely  

# Porymap Studio (v0.2 — create / edit)

In-app map studio for **Pokémon Aurora / Pangea**: paint layouts, edit events/warps/scripts/connections, create maps, and optionally launch **Porymap 6.3.1** for Qt verification.

## Run

```powershell
cd "C:\Users\Spencer\OneDrive\Desktop\Pokemon Aurora Project\porymap-studio-app"
npm install
npm start
```

Open **http://127.0.0.1:7340**.

| Env | Default |
|-----|---------|
| `PORYMAP_PATH` | `...\porymap-windows-6.3.1\porymap.exe` |
| `PROJECT_ROOT` | `...\pokeemerald_eternity` |
| `PORT` | `7340` |

## Editors

- **Layout** — metatile picker + paint → `data/layouts/<Map>/map.bin`
- **Events / Warps** — CRUD → `data/maps/<Map>/map.json`
- **Scripts** — `scripts.inc` (+ `event_scripts.s` include)
- **Connections / Header** — map.json fields
- **Create map** — layout bins, layouts.json, map folder, `gMapGroup_Pangea`

Live canvas updates when you paint/save. External agent edits still surface as `reload needed`.

## Activity Bar companion

See `extension/` — auto-starts this server and embeds the UI beside chat.

## Git

Tracked copy: `pokeemerald_eternity/tools/porymap-studio-app` on `cursor/porymap-studio-mvp-3bc6`.

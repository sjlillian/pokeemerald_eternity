const $ = (id) => document.getElementById(id);

const state = {
  status: null,
  maps: null,
  filter: "",
  doc: null,
  sheet: null,
  sheetImg: null,
  mapImg: null,
  selectedMeta: 1,
  painting: false,
  dirtyLayout: false,
};

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.data = data;
    err.status = res.status;
    throw err;
  }
  return data;
}

function setBadge(syncState) {
  const el = $("syncBadge");
  const label = syncState || "idle";
  const slug = String(label).toLowerCase().replace(/\s+/g, "-");
  el.textContent = label;
  el.className = "badge " + slug;
  if (slug === "reload-needed" || slug === "files-changed") {
    el.classList.add("warn");
    $("btnAck").classList.remove("hidden");
  } else {
    $("btnAck").classList.add("hidden");
  }
}

function setPathClip(el, text) {
  const value = text || "(unset)";
  el.textContent = value;
  el.title = value;
}

function renderStatus(status) {
  state.status = status;
  setPathClip($("projectRoot"), status.projectRoot || "(unset)");
  const pory = status.porymap || {};
  setPathClip(
    $("porymapStatus"),
    `${pory.label || "unknown"} · ${status.porymapPath || ""}`
  );
  setBadge(status.sync?.state || "idle");
  $("reloadHint").textContent = status.reloadHint || "";
  const banner = $("modeBanner");
  if (!status.localMode) {
    banner.classList.remove("hidden");
    banner.textContent =
      "Editors need local Studio against pokeemerald_eternity + Porymap 6.3.1 paths.";
  } else {
    banner.classList.add("hidden");
  }
  renderActivity(status.activity || []);
}

function renderActivity(items) {
  const list = $("activityList");
  list.innerHTML = "";
  if (!items.length) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="path" title="Waiting for edits…">Waiting for edits…</span><span class="when">live</span>`;
    list.appendChild(li);
    return;
  }
  for (const item of items.slice(0, 20)) {
    const li = document.createElement("li");
    const when = item.at ? new Date(item.at).toLocaleTimeString() : "";
    const label = `${item.type || "change"} · ${item.path}`;
    li.innerHTML = `<span class="path"></span><span class="when">${when}</span>`;
    const pathEl = li.querySelector(".path");
    pathEl.textContent = label;
    pathEl.title = label;
    list.appendChild(li);
  }
}

function renderMaps(payload) {
  state.maps = payload;
  const q = state.filter.trim().toLowerCase();
  const maps = (payload.maps || []).filter((m) => !q || m.name.toLowerCase().includes(q));
  $("mapMeta").textContent = `${payload.count} maps · ${payload.source}`;
  const list = $("mapList");
  list.innerHTML = "";
  for (const m of maps) {
    const li = document.createElement("li");
    if (state.doc?.mapName === m.name) li.classList.add("active");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = m.name;
    btn.title = m.name;
    btn.addEventListener("click", () => openMap(m.name));
    const tag = document.createElement("span");
    tag.className = "tag" + (m.pinned ? " pin" : "");
    tag.textContent = m.pinned ? "pin" : m.kind;
    li.append(btn, tag);
    list.appendChild(li);
  }
}

function switchTab(name) {
  document.querySelectorAll(".tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.tab === name);
  });
  document.querySelectorAll(".tab-pane").forEach((p) => {
    p.classList.toggle("active", p.dataset.pane === name);
  });
}

async function openMap(name) {
  const doc = await api(`/api/maps/${encodeURIComponent(name)}`);
  state.doc = doc;
  state.dirtyLayout = false;
  $("emptyState").hidden = true;
  $("editorRoot").hidden = false;
  $("editorTabs").hidden = false;
  $("activeMapTitle").textContent = name;
  $("activeMapSub").textContent = `${doc.layout.width}×${doc.layout.height} · ${doc.layout.primary_tileset} + ${doc.layout.secondary_tileset}`;
  $("scriptsEditor").value = doc.scripts || "";
  $("brushId").value = String(state.selectedMeta);
  renderObjectEvents();
  renderWarps();
  renderConnections();
  renderHeader();
  await loadSheet();
  await drawMap();
  renderMaps(state.maps);
  switchTab("layout");
}

async function loadSheet() {
  const doc = state.doc;
  if (!doc) return;
  const primary = doc.layout.primary_tileset;
  const secondary = doc.layout.secondary_tileset;
  const meta = await api(
    `/api/tilesheet/meta?primary=${encodeURIComponent(primary)}&secondary=${encodeURIComponent(secondary)}`
  );
  state.sheet = meta;
  const img = new Image();
  img.src = `${meta.url}&t=${Date.now()}`;
  await img.decode();
  state.sheetImg = img;
  const canvas = $("sheetCanvas");
  const cols = meta.cols;
  const rows = Math.ceil(meta.ids.length / cols);
  canvas.width = cols * 16;
  canvas.height = rows * 16;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);
  // selection ring
  const idx = meta.ids.indexOf(state.selectedMeta);
  if (idx >= 0) {
    const c = idx % cols;
    const r = Math.floor(idx / cols);
    ctx.strokeStyle = "#3dbf88";
    ctx.lineWidth = 2;
    ctx.strokeRect(c * 16 + 1, r * 16 + 1, 14, 14);
  }
}

async function drawMap() {
  const doc = state.doc;
  if (!doc) return;
  const { width, height } = doc.layout;
  const canvas = $("mapCanvas");
  const scale = 16;
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  // Prefer rendered preview for fidelity; fall back to sheet blit
  try {
    const img = new Image();
    img.src = `/api/maps/${encodeURIComponent(doc.mapName)}/preview.png?t=${Date.now()}`;
    await img.decode();
    state.mapImg = img;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  } catch {
    ctx.fillStyle = "#102018";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (state.sheetImg && state.sheet) {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const b = doc.blocks[y * width + x];
          blitMeta(ctx, x * scale, y * scale, b.metatileId);
        }
      }
    }
  }

  // event overlays
  ctx.font = "10px IBM Plex Sans";
  for (const e of doc.map.object_events || []) {
    mark(ctx, e.x, e.y, "#6ec8ff", "O");
  }
  for (const e of doc.map.warp_events || []) {
    mark(ctx, e.x, e.y, "#f0b35a", "W");
  }
  for (const e of doc.map.coord_events || []) {
    mark(ctx, e.x, e.y, "#d67cff", "T");
  }
  for (const e of doc.map.bg_events || []) {
    mark(ctx, e.x, e.y, "#9adf7a", "B");
  }

  $("layoutStatus").textContent = state.dirtyLayout
    ? "Unsaved layout strokes — Save layout"
    : `${width}×${height} · live preview`;
}

function blitMeta(ctx, dx, dy, metaId) {
  const idx = state.sheet.ids.indexOf(metaId);
  if (idx < 0 || !state.sheetImg) return;
  const cols = state.sheet.cols;
  const sx = (idx % cols) * 16;
  const sy = Math.floor(idx / cols) * 16;
  ctx.drawImage(state.sheetImg, sx, sy, 16, 16, dx, dy, 16, 16);
}

function mark(ctx, x, y, color, label) {
  const px = x * 16 + 2;
  const py = y * 16 + 2;
  ctx.fillStyle = color;
  ctx.fillRect(px, py, 12, 12);
  ctx.fillStyle = "#04100a";
  ctx.fillText(label, px + 2, py + 10);
}

function canvasCell(evt, canvas) {
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor(((evt.clientX - rect.left) / rect.width) * canvas.width / 16);
  const y = Math.floor(((evt.clientY - rect.top) / rect.height) * canvas.height / 16);
  return { x, y };
}

async function paintAt(x, y) {
  const doc = state.doc;
  if (!doc || !$("brushPaint").checked) return;
  const { width, height } = doc.layout;
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const metatileId = Number($("brushId").value);
  const collision = Number($("brushCollision").value);
  const elevation = Number($("brushElevation").value);
  const i = y * width + x;
  doc.blocks[i] = { metatileId, collision, elevation };
  state.dirtyLayout = true;
  // optimistic draw
  const ctx = $("mapCanvas").getContext("2d");
  if (state.sheetImg) blitMeta(ctx, x * 16, y * 16, metatileId);
  else {
    ctx.fillStyle = `hsl(${(metatileId * 37) % 360} 40% 35%)`;
    ctx.fillRect(x * 16, y * 16, 16, 16);
  }
  $("layoutStatus").textContent = `Painted (${x},${y}) id=${metatileId} — Save layout`;
}

async function flushPaint(strokes) {
  if (!state.doc || !strokes.length) return;
  const result = await api(`/api/maps/${encodeURIComponent(state.doc.mapName)}/paint`, {
    method: "POST",
    body: JSON.stringify({
      strokes,
      defaults: {
        metatileId: Number($("brushId").value),
        collision: Number($("brushCollision").value),
        elevation: Number($("brushElevation").value),
      },
    }),
  });
  state.doc.blocks = result.blocks;
  state.dirtyLayout = false;
  setBadge("studio-saved");
  await drawMap();
}

function field(label, key, value, opts = {}) {
  const wrap = document.createElement("label");
  wrap.textContent = label;
  let input;
  if (opts.select) {
    input = document.createElement("select");
    for (const opt of opts.select) {
      const o = document.createElement("option");
      o.value = opt;
      o.textContent = opt;
      if (String(value) === String(opt)) o.selected = true;
      input.appendChild(o);
    }
  } else {
    input = document.createElement("input");
    input.type = opts.type || "text";
    if (opts.type === "number") {
      input.min = opts.min ?? 0;
      if (opts.max != null) input.max = opts.max;
    }
    if (opts.type === "checkbox") input.checked = Boolean(value);
    else input.value = value ?? "";
  }
  input.dataset.key = key;
  wrap.appendChild(input);
  return wrap;
}

function readFields(root) {
  const out = {};
  root.querySelectorAll("[data-key]").forEach((el) => {
    const key = el.dataset.key;
    if (el.type === "checkbox") out[key] = el.checked;
    else if (el.type === "number") out[key] = Number(el.value);
    else out[key] = el.value;
  });
  return out;
}

function renderObjectEvents() {
  const root = $("objectEventsEditor");
  root.innerHTML = "";
  const list = state.doc.map.object_events || [];
  list.forEach((ev, index) => {
    const card = document.createElement("div");
    card.className = "event-card";
    const grid = document.createElement("div");
    grid.className = "grid";
    grid.append(
      field("graphics_id", "graphics_id", ev.graphics_id || "OBJ_EVENT_GFX_BOY_1"),
      field("x", "x", ev.x ?? 0, { type: "number" }),
      field("y", "y", ev.y ?? 0, { type: "number" }),
      field("elevation", "elevation", ev.elevation ?? 3, { type: "number" }),
      field("movement_type", "movement_type", ev.movement_type || "MOVEMENT_TYPE_FACE_DOWN"),
      field("movement_range_x", "movement_range_x", ev.movement_range_x ?? 0, { type: "number" }),
      field("movement_range_y", "movement_range_y", ev.movement_range_y ?? 0, { type: "number" }),
      field("trainer_type", "trainer_type", ev.trainer_type || "TRAINER_TYPE_NONE"),
      field("script", "script", ev.script || "0x0"),
      field("flag", "flag", ev.flag || "0"),
      field("local_id", "local_id", ev.local_id || "")
    );
    const actions = document.createElement("div");
    actions.className = "card-actions";
    const del = document.createElement("button");
    del.type = "button";
    del.className = "btn danger";
    del.textContent = "Remove";
    del.addEventListener("click", () => {
      state.doc.map.object_events.splice(index, 1);
      renderObjectEvents();
      drawMap();
    });
    actions.appendChild(del);
    card.append(grid, actions);
    card.dataset.index = String(index);
    root.appendChild(card);
  });
}

function collectObjectEvents() {
  const cards = [...$("objectEventsEditor").querySelectorAll(".event-card")];
  return cards.map((card) => {
    const o = readFields(card);
    if (!o.local_id) delete o.local_id;
    o.trainer_sight_or_berry_tree_id = "0";
    return o;
  });
}

function renderWarps() {
  const root = $("warpEventsEditor");
  root.innerHTML = "";
  const list = state.doc.map.warp_events || [];
  list.forEach((ev, index) => {
    const card = document.createElement("div");
    card.className = "event-card";
    const grid = document.createElement("div");
    grid.className = "grid";
    grid.append(
      field("x", "x", ev.x ?? 0, { type: "number" }),
      field("y", "y", ev.y ?? 0, { type: "number" }),
      field("elevation", "elevation", ev.elevation ?? 0, { type: "number" }),
      field("dest_map", "dest_map", ev.dest_map || "MAP_STIBIUM_TOWN"),
      field("dest_warp_id", "dest_warp_id", ev.dest_warp_id ?? "0")
    );
    const actions = document.createElement("div");
    actions.className = "card-actions";
    const del = document.createElement("button");
    del.type = "button";
    del.className = "btn danger";
    del.textContent = "Remove";
    del.addEventListener("click", () => {
      state.doc.map.warp_events.splice(index, 1);
      renderWarps();
      drawMap();
    });
    actions.appendChild(del);
    card.append(grid, actions);
    root.appendChild(card);
  });
}

function collectWarps() {
  return [...$("warpEventsEditor").querySelectorAll(".event-card")].map((card) => {
    const o = readFields(card);
    o.dest_warp_id = String(o.dest_warp_id);
    return o;
  });
}

function renderConnections() {
  const root = $("connectionsEditor");
  root.innerHTML = "";
  const list = state.doc.map.connections || [];
  list.forEach((ev, index) => {
    const card = document.createElement("div");
    card.className = "event-card";
    const grid = document.createElement("div");
    grid.className = "grid";
    grid.append(
      field("map", "map", ev.map || "MAP_PANGEA_ROUTE1"),
      field("direction", "direction", ev.direction || "up", {
        select: ["up", "down", "left", "right", "dive", "emerge"],
      }),
      field("offset", "offset", ev.offset ?? 0, { type: "number" })
    );
    const actions = document.createElement("div");
    actions.className = "card-actions";
    const del = document.createElement("button");
    del.type = "button";
    del.className = "btn danger";
    del.textContent = "Remove";
    del.addEventListener("click", () => {
      state.doc.map.connections.splice(index, 1);
      renderConnections();
    });
    actions.appendChild(del);
    card.append(grid, actions);
    root.appendChild(card);
  });
}

function collectConnections() {
  return [...$("connectionsEditor").querySelectorAll(".event-card")].map((card) =>
    readFields(card)
  );
}

function renderHeader() {
  const root = $("headerEditor");
  root.innerHTML = "";
  const m = state.doc.map;
  const fields = [
    ["music", m.music],
    ["region_map_section", m.region_map_section],
    ["weather", m.weather],
    ["map_type", m.map_type],
    ["battle_scene", m.battle_scene],
  ];
  for (const [key, val] of fields) {
    root.appendChild(field(key, key, val));
  }
  root.appendChild(field("allow_cycling", "allow_cycling", m.allow_cycling, { type: "checkbox" }));
  root.appendChild(field("allow_escaping", "allow_escaping", m.allow_escaping, { type: "checkbox" }));
  root.appendChild(field("allow_running", "allow_running", m.allow_running, { type: "checkbox" }));
  root.appendChild(field("show_map_name", "show_map_name", m.show_map_name, { type: "checkbox" }));
  root.appendChild(field("requires_flash", "requires_flash", m.requires_flash, { type: "checkbox" }));
}

// events
$("mapSearch").addEventListener("input", (e) => {
  state.filter = e.target.value;
  if (state.maps) renderMaps(state.maps);
});

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => switchTab(tab.dataset.tab));
});

$("btnLaunch").addEventListener("click", async () => {
  try {
    const result = await api("/api/launch", { method: "POST", body: "{}" });
    if (result.status) renderStatus(result.status);
  } catch (err) {
    if (err.status === 409) {
      if (window.confirm(`${err.message}\nLaunch anyway?`)) {
        await api("/api/launch", { method: "POST", body: JSON.stringify({ force: true }) });
      }
      return;
    }
    window.alert(err.message);
  }
});

$("btnAck").addEventListener("click", async () => {
  const status = await api("/api/ack-reload", { method: "POST", body: "{}" });
  setBadge(status.syncState);
});

$("btnCreate").addEventListener("click", () => $("createDialog").showModal());

$("createForm").addEventListener("close", async () => {
  if ($("createForm").returnValue !== "create") return;
  const fd = new FormData($("createForm"));
  const body = Object.fromEntries(fd.entries());
  body.width = Number(body.width);
  body.height = Number(body.height);
  body.fillMetatileId = Number(body.fillMetatileId);
  if (!body.cloneFrom) delete body.cloneFrom;
  try {
    const created = await api("/api/maps/create", {
      method: "POST",
      body: JSON.stringify(body),
    });
    const maps = await api("/api/maps");
    renderMaps(maps);
    await openMap(created.mapName);
  } catch (err) {
    window.alert(err.message);
  }
});

let strokeBuf = [];
const mapCanvas = $("mapCanvas");
mapCanvas.addEventListener("mousedown", async (evt) => {
  state.painting = true;
  const { x, y } = canvasCell(evt, mapCanvas);
  strokeBuf = [{ x, y }];
  await paintAt(x, y);
});
mapCanvas.addEventListener("mousemove", async (evt) => {
  if (!state.painting) return;
  const { x, y } = canvasCell(evt, mapCanvas);
  const last = strokeBuf[strokeBuf.length - 1];
  if (last && last.x === x && last.y === y) return;
  strokeBuf.push({ x, y });
  await paintAt(x, y);
});
window.addEventListener("mouseup", async () => {
  if (!state.painting) return;
  state.painting = false;
  const strokes = strokeBuf.splice(0);
  try {
    await flushPaint(strokes);
  } catch (err) {
    window.alert(err.message);
  }
});

$("sheetCanvas").addEventListener("click", (evt) => {
  if (!state.sheet) return;
  const { x, y } = canvasCell(evt, $("sheetCanvas"));
  const idx = y * state.sheet.cols + x;
  const id = state.sheet.ids[idx];
  if (id == null) return;
  state.selectedMeta = id;
  $("brushId").value = String(id);
  loadSheet();
});

$("btnSaveLayout").addEventListener("click", async () => {
  try {
    await api(`/api/maps/${encodeURIComponent(state.doc.mapName)}/layout`, {
      method: "PUT",
      body: JSON.stringify({ blocks: state.doc.blocks }),
    });
    state.dirtyLayout = false;
    setBadge("studio-saved");
    await drawMap();
  } catch (err) {
    window.alert(err.message);
  }
});

$("btnAddObject").addEventListener("click", () => {
  state.doc.map.object_events = state.doc.map.object_events || [];
  state.doc.map.object_events.push({
    graphics_id: "OBJ_EVENT_GFX_BOY_1",
    x: 5,
    y: 5,
    elevation: 3,
    movement_type: "MOVEMENT_TYPE_FACE_DOWN",
    movement_range_x: 0,
    movement_range_y: 0,
    trainer_type: "TRAINER_TYPE_NONE",
    trainer_sight_or_berry_tree_id: "0",
    script: `${state.doc.mapName}_EventScript_Npc`,
    flag: "0",
  });
  renderObjectEvents();
  drawMap();
});

$("btnSaveEvents").addEventListener("click", async () => {
  try {
    const object_events = collectObjectEvents();
    const events = await api(`/api/maps/${encodeURIComponent(state.doc.mapName)}/events`, {
      method: "PUT",
      body: JSON.stringify({
        object_events,
        warp_events: state.doc.map.warp_events,
        coord_events: state.doc.map.coord_events,
        bg_events: state.doc.map.bg_events,
      }),
    });
    state.doc.map = { ...state.doc.map, ...events.events };
    setBadge("studio-saved");
    await drawMap();
  } catch (err) {
    window.alert(err.message);
  }
});

$("btnAddWarp").addEventListener("click", () => {
  state.doc.map.warp_events = state.doc.map.warp_events || [];
  state.doc.map.warp_events.push({
    x: 5,
    y: 5,
    elevation: 0,
    dest_map: "MAP_STIBIUM_TOWN",
    dest_warp_id: "0",
  });
  renderWarps();
  drawMap();
});

$("btnSaveWarps").addEventListener("click", async () => {
  try {
    const warp_events = collectWarps();
    const events = await api(`/api/maps/${encodeURIComponent(state.doc.mapName)}/events`, {
      method: "PUT",
      body: JSON.stringify({
        object_events: state.doc.map.object_events,
        warp_events,
        coord_events: state.doc.map.coord_events,
        bg_events: state.doc.map.bg_events,
      }),
    });
    state.doc.map = { ...state.doc.map, ...events.events };
    setBadge("studio-saved");
    await drawMap();
  } catch (err) {
    window.alert(err.message);
  }
});

$("btnSaveScripts").addEventListener("click", async () => {
  try {
    await api(`/api/maps/${encodeURIComponent(state.doc.mapName)}/scripts`, {
      method: "PUT",
      body: JSON.stringify({ text: $("scriptsEditor").value }),
    });
    $("scriptsStatus").textContent = "Saved scripts.inc";
    setBadge("studio-saved");
  } catch (err) {
    window.alert(err.message);
  }
});

$("btnAddConn").addEventListener("click", () => {
  state.doc.map.connections = state.doc.map.connections || [];
  state.doc.map.connections.push({ map: "MAP_PANGEA_ROUTE1", direction: "up", offset: 0 });
  renderConnections();
});

$("btnSaveConn").addEventListener("click", async () => {
  try {
    const connections = collectConnections();
    const result = await api(`/api/maps/${encodeURIComponent(state.doc.mapName)}/connections`, {
      method: "PUT",
      body: JSON.stringify({ connections }),
    });
    state.doc.map.connections = result.connections;
    setBadge("studio-saved");
  } catch (err) {
    window.alert(err.message);
  }
});

$("btnSaveHeader").addEventListener("click", async () => {
  try {
    const patch = readFields($("headerEditor"));
    const result = await api(`/api/maps/${encodeURIComponent(state.doc.mapName)}/header`, {
      method: "PUT",
      body: JSON.stringify(patch),
    });
    state.doc.map = result.map;
    setBadge("studio-saved");
  } catch (err) {
    window.alert(err.message);
  }
});

function connectEvents() {
  try {
    const es = new EventSource("/api/events");
    es.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);
        if (data.status) renderStatus(data.status);
        if (data.type === "studio-saved") setBadge("studio-saved");
        if (data.type === "files-changed") {
          setBadge("reload needed");
          // refresh open map if external agent edited it
          if (state.doc) openMap(state.doc.mapName).catch(() => {});
        }
        if (data.type === "activity" && data.event) {
          renderActivity([data.event, ...(state.status?.activity || [])]);
        }
      } catch {
        /* ignore */
      }
    };
  } catch {
    /* optional */
  }
}

const SIDEBAR_KEY = "porymapStudio.sidebarWidth";

function clampSidebar(px) {
  const styles = getComputedStyle(document.documentElement);
  const min = Number.parseFloat(styles.getPropertyValue("--sidebar-min")) || 260;
  const max = Number.parseFloat(styles.getPropertyValue("--sidebar-max")) || 560;
  const hardMax = Math.min(max, Math.floor(window.innerWidth * 0.55));
  return Math.max(min, Math.min(hardMax, Math.round(px)));
}

function applySidebarWidth(px) {
  const width = clampSidebar(px);
  document.documentElement.style.setProperty("--sidebar", `${width}px`);
  return width;
}

function initSidebarResize() {
  const saved = Number(localStorage.getItem(SIDEBAR_KEY));
  if (Number.isFinite(saved) && saved > 0) applySidebarWidth(saved);
  else applySidebarWidth(340);

  const handle = $("sidebarResizer");
  if (!handle) return;

  let dragging = false;

  const onMove = (clientX) => {
    if (!dragging) return;
    const width = applySidebarWidth(clientX);
    localStorage.setItem(SIDEBAR_KEY, String(width));
  };

  handle.addEventListener("pointerdown", (evt) => {
    if (window.matchMedia("(max-width: 980px)").matches) return;
    dragging = true;
    document.body.classList.add("is-resizing-sidebar");
    handle.setPointerCapture?.(evt.pointerId);
    evt.preventDefault();
  });
  handle.addEventListener("pointermove", (evt) => onMove(evt.clientX));
  const end = (evt) => {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove("is-resizing-sidebar");
    try {
      handle.releasePointerCapture?.(evt.pointerId);
    } catch {
      /* ignore */
    }
  };
  handle.addEventListener("pointerup", end);
  handle.addEventListener("pointercancel", end);

  handle.addEventListener("keydown", (evt) => {
    const current =
      Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--sidebar")
      ) || 340;
    if (evt.key === "ArrowLeft") {
      localStorage.setItem(SIDEBAR_KEY, String(applySidebarWidth(current - 16)));
      evt.preventDefault();
    } else if (evt.key === "ArrowRight") {
      localStorage.setItem(SIDEBAR_KEY, String(applySidebarWidth(current + 16)));
      evt.preventDefault();
    }
  });

  window.addEventListener("resize", () => {
    const current =
      Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--sidebar")
      ) || 340;
    applySidebarWidth(current);
  });
}

async function boot() {
  initSidebarResize();
  const [status, maps] = await Promise.all([api("/api/status"), api("/api/maps")]);
  renderStatus(status);
  renderMaps(maps);
  connectEvents();
  const preferred = maps.defaultMap || "StibiumTown";
  if ((maps.maps || []).some((m) => m.name === preferred)) {
    await openMap(preferred);
  }
}

boot().catch((err) => {
  $("modeBanner").classList.remove("hidden");
  $("modeBanner").textContent = `Studio API unreachable: ${err.message}`;
});

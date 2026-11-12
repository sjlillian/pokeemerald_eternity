const $ = (id) => document.getElementById(id);

const state = {
  status: null,
  maps: null,
  surfaces: [],
  filter: "",
};

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

function renderStatus(status) {
  state.status = status;
  $("projectRoot").textContent = status.projectRoot || "(unset)";
  const pory = status.porymap || {};
  $("porymapStatus").textContent = `${pory.label || "unknown"} · ${status.porymapPath || ""}`;
  setBadge(status.sync?.state || "idle");
  $("reloadHint").textContent = status.reloadHint || "";

  const banner = $("modeBanner");
  if (!status.localMode) {
    banner.classList.remove("hidden");
    banner.textContent =
      "Local launch/watch needs this app running on Spencer’s Windows machine (npm start) with Porymap 6.3.1 + pokeemerald_eternity paths. Guides and Pangea list still work.";
  } else {
    banner.classList.add("hidden");
  }

  $("pathsDetail").textContent = [
    `PORYMAP_PATH=${status.porymapPath}`,
    `PROJECT_ROOT=${status.projectRoot}`,
    `mapGroup=${status.mapGroup}`,
    `watchGlobs=`,
    ...(status.watchGlobs || []).map((g) => `  - ${g}`),
  ].join("\n");

  renderActivity(status.activity || []);
}

function renderMaps(payload) {
  state.maps = payload;
  const q = state.filter.trim().toLowerCase();
  const maps = (payload.maps || []).filter((m) => !q || m.name.toLowerCase().includes(q));
  $("mapMeta").textContent = `${payload.count} maps · source ${payload.source}${
    payload.error ? ` · ${payload.error}` : ""
  }`;
  const list = $("mapList");
  list.innerHTML = "";
  for (const m of maps) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = m.name;
    btn.addEventListener("click", () => openMapGuide(m.name));
    const tag = document.createElement("span");
    tag.className = "tag" + (m.pinned ? " pin" : "");
    tag.textContent = m.pinned ? "pin" : m.kind;
    li.append(btn, tag);
    list.appendChild(li);
  }
}

function renderSurfaces(surfaces) {
  state.surfaces = surfaces;
  const root = $("surfaceList");
  root.innerHTML = "";
  for (const s of surfaces) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "surface";
    btn.innerHTML = `<strong>${s.title}${s.shortcut ? ` · ${s.shortcut}` : ""}</strong><span>${s.path}</span>`;
    btn.addEventListener("click", () => showGuide(s));
    root.appendChild(btn);
  }
}

function renderActivity(items) {
  const list = $("activityList");
  list.innerHTML = "";
  if (!items.length) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="path">Waiting for agent file edits…</span><span class="when">watch-first loop</span>`;
    list.appendChild(li);
    return;
  }
  for (const item of items) {
    const li = document.createElement("li");
    const when = item.at ? new Date(item.at).toLocaleTimeString() : "";
    li.innerHTML = `<span class="path">${item.type || "change"} · ${item.path}</span><span class="when">${when}</span>`;
    list.appendChild(li);
  }
}

function showGuide(surface) {
  $("guideTitle").textContent = surface.title;
  const lines = [
    surface.path,
    surface.shortcut ? `Shortcut: ${surface.shortcut}` : null,
    surface.notes,
    "",
    "After agent edits: watch the Activity feed, then reload in Porymap if the GUI does not refresh.",
  ]
    .filter(Boolean)
    .join("\n");
  $("guideBody").textContent = lines;
  const docs = $("guideDocs");
  if (surface.docs) {
    docs.href = surface.docs;
    docs.style.display = "";
  } else {
    docs.style.display = "none";
  }
  $("guideDialog").showModal();
}

function openMapGuide(name) {
  showGuide({
    title: `Open ${name}`,
    path: `In Porymap map list, open ${name} (group gMapGroup_Pangea).`,
    shortcut: null,
    notes:
      "Deep-link into a named map is best-effort in v1. Studio launches the project; you pick the map once, then watch agent edits refresh after reload.",
    docs: "https://huderlem.github.io/porymap/manual/",
  });
}

async function api(path, options) {
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

async function refresh() {
  const [status, maps, surfaces] = await Promise.all([
    api("/api/status"),
    api("/api/maps"),
    api("/api/surfaces"),
  ]);
  renderStatus(status);
  renderMaps(maps);
  renderSurfaces(surfaces.surfaces || []);
}

async function onLaunch() {
  try {
    const result = await api("/api/launch", { method: "POST", body: "{}" });
    if (result.status) renderStatus(result.status);
    flash($("btnLaunch"), result.alreadyRunning ? "Already running" : "Launched");
  } catch (err) {
    if (err.status === 409 && err.data?.needsConfirm) {
      const ok = window.confirm(`${err.message}\n\nLaunch anyway?`);
      if (ok) {
        const result = await api("/api/launch", {
          method: "POST",
          body: JSON.stringify({ force: true }),
        });
        if (result.status) renderStatus(result.status);
      }
      return;
    }
    window.alert(err.message || String(err));
  }
}

function flash(btn, text) {
  const prev = btn.textContent;
  btn.textContent = text;
  setTimeout(() => {
    btn.textContent = prev;
  }, 1400);
}

function connectEvents() {
  try {
    const es = new EventSource("/api/events");
    es.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);
        if (data.status) renderStatus(data.status);
        else if (data.type === "activity" && data.event) {
          const activity = [data.event, ...(state.status?.activity || [])].slice(0, 20);
          renderActivity(activity);
          setBadge("files changed");
          $("btnAck").classList.remove("hidden");
        }
        if (data.type === "files-changed") {
          setBadge("reload needed");
          $("btnAck").classList.remove("hidden");
        }
      } catch {
        /* ignore malformed */
      }
    };
  } catch {
    /* SSE optional */
  }
}

$("btnLaunch").addEventListener("click", onLaunch);
$("btnRegion").addEventListener("click", () => {
  const s = state.surfaces.find((x) => x.id === "region-map");
  if (s) showGuide(s);
});
$("btnGroup").addEventListener("click", () => {
  $("mapSearch").focus();
  $("mapSearch").select();
  showGuide({
    title: "gMapGroup_Pangea",
    path: "Studio list below is filtered to gMapGroup_Pangea (including interiors as they appear).",
    notes: "In Porymap, browse that group rather than dumping all Hoenn defaults.",
    docs: "https://huderlem.github.io/porymap/manual/",
  });
});
$("btnDefaultMap").addEventListener("click", () => openMapGuide("StibiumTown"));
$("btnAck").addEventListener("click", async () => {
  const status = await api("/api/ack-reload", { method: "POST", body: "{}" });
  renderStatus({ ...state.status, sync: { ...(state.status?.sync || {}), state: status.syncState }, activity: status.activity });
  setBadge(status.syncState);
});
$("mapSearch").addEventListener("input", (e) => {
  state.filter = e.target.value;
  if (state.maps) renderMaps(state.maps);
});

refresh().catch((err) => {
  $("modeBanner").classList.remove("hidden");
  $("modeBanner").textContent = `Studio API unreachable: ${err.message}. Run npm start in porymap-studio-app.`;
});
connectEvents();

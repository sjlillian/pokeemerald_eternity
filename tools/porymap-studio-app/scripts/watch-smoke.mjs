import path from "node:path";
import fs from "node:fs";
import chokidar from "chokidar";

const root =
  "C:\\Users\\Spencer\\OneDrive\\Desktop\\Pokemon Aurora Project\\pokeemerald_eternity";

const w = chokidar.watch(["data/maps", "data/layouts"], {
  cwd: root,
  ignoreInitial: true,
  usePolling: true,
  interval: 400,
});

w.on("ready", () => {
  console.log("READY", Object.keys(w.getWatched()).length);
  const abs = path.join(root, "data/maps/StibiumTown/map.json");
  fs.writeFileSync(abs, fs.readFileSync(abs));
  console.log("wrote");
});
w.on("all", (ev, p) => console.log("EVENT", ev, p));
w.on("error", (e) => console.error("ERR", e));

setTimeout(() => process.exit(0), 5000);

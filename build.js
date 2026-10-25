// Builds dist/index.js = Astra plugin SDK (taken from an installed plugin bundle) + src/index.js,
// writes MANIFEST.json with file hashes and packs anim-studio.astraplugin. Run: node build.js
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const zlib = require("node:zlib");

const root = __dirname;
const sdkCandidates = ["anim-studio", "denchik-vroid-manager", "dota-coach", "screen-vision"]
  .map((id) => path.join(process.env.APPDATA, "astra", "astra", "config", "plugins", id, "dist", "index.js"));
let bundle, cut = -1;
for (const p of sdkCandidates) {
  if (!fs.existsSync(p)) continue;
  bundle = fs.readFileSync(p, "utf8");
  cut = ["// src/index.ts", "// src/index.js"].map((m) => bundle.indexOf(m)).filter((i) => i >= 0)[0] ?? -1;
  if (cut >= 0) break;
}
if (cut < 0) throw new Error("Astra plugin SDK bundle not found (install any Astra plugin first)");

fs.mkdirSync(path.join(root, "dist"), { recursive: true });
const src = fs.readFileSync(path.join(root, "src", "index.js"), "utf8");
fs.writeFileSync(path.join(root, "dist", "index.js"), bundle.slice(0, cut) + "// src/index.js\n" + src);

const sha = (p) => crypto.createHash("sha256").update(fs.readFileSync(path.join(root, p))).digest("hex");
const paths = ["dist/index.js", "icon.svg", "plugin.toml", "ui/app.js", "ui/index.html"].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
const files = paths.map((p) => ({ path: p, sha256: sha(p), size: fs.statSync(path.join(root, p)).size, mode: "0644" }));
const permissions = {};
const manifest = {
  schema: "astra.bundle/2",
  plugin_id: "anim-studio",
  version: /^version\s*=\s*"([^"]+)"/m.exec(fs.readFileSync(path.join(root, "plugin.toml"), "utf8"))[1],
  platform: { os: "windows", arch: "any" },
  protocol: 1,
  min_astra_version: "",
  capabilities: ["tools", "ui_contributions"],
  permissions,
  permissions_hash: "sha256:" + crypto.createHash("sha256").update("{}").digest("hex"),
  entry: { command: "node", args: ["dist/index.js"] },
  files
};
fs.writeFileSync(path.join(root, "MANIFEST.json"), JSON.stringify(manifest, null, 2));

// .astraplugin = zip: MANIFEST.json first and stored, the rest deflated, unix mode 0644
const crcTable = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (b) => { let c = -1; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const entries = [], central = [];
let offset = 0;
for (const p of ["MANIFEST.json", ...paths]) {
  const data = fs.readFileSync(path.join(root, p));
  const stored = p === "MANIFEST.json";
  const body = stored ? data : zlib.deflateRawSync(data);
  const name = Buffer.from(p);
  const crc = crc32(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x800, 6); local.writeUInt16LE(stored ? 0 : 8, 8);
  local.writeUInt16LE(0, 10); local.writeUInt16LE(0x5b21, 12); local.writeUInt32LE(crc, 14); local.writeUInt32LE(body.length, 18);
  local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26);
  entries.push(local, name, body);
  const cen = Buffer.alloc(46);
  cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(0x0314, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x800, 8); cen.writeUInt16LE(stored ? 0 : 8, 10);
  cen.writeUInt16LE(0, 12); cen.writeUInt16LE(0x5b21, 14); cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(body.length, 20); cen.writeUInt32LE(data.length, 24);
  cen.writeUInt16LE(name.length, 28); cen.writeUInt32LE((0o100644 << 16) >>> 0, 38); cen.writeUInt32LE(offset, 42);
  central.push(cen, name);
  offset += 30 + name.length + body.length;
}
const cdir = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(paths.length + 1, 8); end.writeUInt16LE(paths.length + 1, 10);
end.writeUInt32LE(cdir.length, 12); end.writeUInt32LE(offset, 16);
fs.writeFileSync(path.join(root, "anim-studio.astraplugin"), Buffer.concat([...entries, cdir, end]));
console.log("built", files.map((f) => `${f.path} ${f.size}`).join(", "), "→ anim-studio.astraplugin");

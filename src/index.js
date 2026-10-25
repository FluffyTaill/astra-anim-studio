// Anim Studio — Astra plugin: install your own avatar animations without editing TOML by hand.
//
// It keeps ONE add-on animation pack, `animpacks/anim-studio/`, generated from `studio.json`, and
// lists it in `addons = [...]` of the characters you pick. The engine stacks an add-on on top of
// the character's own pack, so nothing of the user's pack is touched:
//   * every animation gets its own state `as_<id>` (preview it in Astra → Model → Animations,
//     bind it to events in Model → Triggers);
//   * "when bored" adds it to `idle` as a rare variant (merge = "extend");
//   * "to music" adds it to dance_slow / dance_mid / dance_fast (merge = "extend").
// After a change the avatar engine is restarted (Astra brings it back by itself).
var import_node_fs = require("node:fs");
var import_node_path = require("node:path");
var import_node_zlib = require("node:zlib");
var import_node_child_process = require("node:child_process");
var { plugin, tool, s } = require_dist();

var CFG = import_node_path.join(process.env.APPDATA || "", "astra", "astra", "config");
var PACK_ROOT = import_node_path.join(CFG, "companion", "pack");
var STUDIO = import_node_path.join(PACK_ROOT, "animpacks", "anim-studio");
var CLIPS = import_node_path.join(STUDIO, "clips");
var ORIG = import_node_path.join(CLIPS, "orig");
var DB_PATH = import_node_path.join(STUDIO, "studio.json");
var PACK_ID = "anim-studio";
var BANDS = ["slow", "mid", "fast"];
var EXTS = [".vrma", ".fbx", ".glb"];

// ── small helpers ───────────────────────────────────────────────────────────

function powershell(script, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const encoded = Buffer.from(script, "utf16le").toString("base64");
    import_node_child_process.execFile("powershell.exe",
      ["-NoProfile", "-NonInteractive", "-STA", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
      { windowsHide: true, timeout: timeoutMs },
      (err, stdout, stderr) => (err ? reject(new Error((stderr || err.message).trim())) : resolve(stdout.trim())));
  });
}

function slug(name) {
  const base = String(name).toLowerCase().replace(/\.[^.]+$/, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return (base || "anim").slice(0, 32);
}

function tomlStr(v) {
  return JSON.stringify(String(v));
}

// ── studio.json ─────────────────────────────────────────────────────────────

function loadDb() {
  try {
    const db = JSON.parse(import_node_fs.readFileSync(DB_PATH, "utf8"));
    db.anims = db.anims || [];
    return db;
  } catch {
    return { version: 1, anims: [], reroll: [20, 35] };
  }
}

function saveDb(db) {
  import_node_fs.mkdirSync(STUDIO, { recursive: true });
  import_node_fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

// ── glTF / VRMA ─────────────────────────────────────────────────────────────

function readGlbJson(file) {
  const b = import_node_fs.readFileSync(file);
  if (b.readUInt32LE(0) !== 0x46546c67) throw new Error("not a GLB/VRMA file");
  const len = b.readUInt32LE(12);
  return JSON.parse(b.subarray(20, 20 + len).toString("utf8"));
}

function gltfAnimations(json) {
  return (json.animations || []).map((a, i) => {
    let dur = 0;
    for (const smp of a.samplers || []) {
      const acc = json.accessors?.[smp.input];
      if (acc?.max?.[0] > dur) dur = acc.max[0];
    }
    return { name: a.name || `animation_${i}`, duration: Math.round(dur * 100) / 100 };
  });
}

// ── FBX (binary 7.x): read, write, lock hips in place ───────────────────────

var FBX_MAGIC = Buffer.from("Kaydara FBX Binary  \0", "latin1");
var FBX_TICKS = 46186158000;

function fbxRead(b) {
  if (!b.subarray(0, 21).equals(FBX_MAGIC)) throw new Error("not a binary FBX (ASCII FBX is not supported — re-export as FBX Binary)");
  const version = b.readUInt32LE(23);
  const v64 = version >= 7500;
  const head = v64 ? 25 : 13;
  function node(pos) {
    const end = v64 ? Number(b.readBigUInt64LE(pos)) : b.readUInt32LE(pos);
    const nprops = v64 ? Number(b.readBigUInt64LE(pos + 8)) : b.readUInt32LE(pos + 4);
    const nlen = b[pos + (v64 ? 24 : 12)];
    pos += head;
    if (end === 0) return [null, pos];
    const name = b.toString("latin1", pos, pos + nlen);
    pos += nlen;
    const props = [];
    for (let i = 0; i < nprops; i++) {
      const t = String.fromCharCode(b[pos++]);
      if ("YCIFDL".includes(t)) {
        const v = t === "Y" ? b.readInt16LE(pos) : t === "C" ? b[pos] !== 0 : t === "I" ? b.readInt32LE(pos)
          : t === "F" ? b.readFloatLE(pos) : t === "D" ? b.readDoubleLE(pos) : b.readBigInt64LE(pos);
        pos += { Y: 2, C: 1, I: 4, F: 4, D: 8, L: 8 }[t];
        props.push([t, v]);
      } else if ("fdlib".includes(t)) {
        const n = b.readUInt32LE(pos), enc = b.readUInt32LE(pos + 4), clen = b.readUInt32LE(pos + 8);
        pos += 12;
        let raw = b.subarray(pos, pos + clen);
        pos += clen;
        if (enc) raw = import_node_zlib.inflateSync(raw);
        const arr = [];
        for (let k = 0; k < n; k++) {
          arr.push(t === "f" ? raw.readFloatLE(k * 4) : t === "d" ? raw.readDoubleLE(k * 8) : t === "l" ? raw.readBigInt64LE(k * 8)
            : t === "i" ? raw.readInt32LE(k * 4) : raw[k] !== 0);
        }
        props.push([t, arr]);
      } else if (t === "S" || t === "R") {
        const n = b.readUInt32LE(pos);
        pos += 4;
        props.push([t, Buffer.from(b.subarray(pos, pos + n))]);
        pos += n;
      } else {
        throw new Error(`FBX: unknown property type ${t}`);
      }
    }
    const children = [];
    while (pos < end) {
      const [child, next] = node(pos);
      pos = next;
      if (!child) break;
      children.push(child);
    }
    return [{ name, props, children }, end];
  }
  let pos = 27;
  const nodes = [];
  for (;;) {
    const [n, next] = node(pos);
    pos = next;
    if (!n) break;
    nodes.push(n);
  }
  return { v64, head, nodes, header: b.subarray(0, 27), footer: b.subarray(pos) };
}

function fbxWrite(f) {
  const out = [Buffer.from(f.header)];
  let offset = f.header.length;
  function propsBuf(props) {
    const parts = [];
    for (const [t, v] of props) {
      parts.push(Buffer.from(t, "latin1"));
      if ("YCIFDL".includes(t)) {
        const size = { Y: 2, C: 1, I: 4, F: 4, D: 8, L: 8 }[t];
        const x = Buffer.alloc(size);
        if (t === "Y") x.writeInt16LE(v); else if (t === "C") x[0] = v ? 1 : 0; else if (t === "I") x.writeInt32LE(v);
        else if (t === "F") x.writeFloatLE(v); else if (t === "D") x.writeDoubleLE(v); else x.writeBigInt64LE(BigInt(v));
        parts.push(x);
      } else if ("fdlib".includes(t)) {
        const size = { f: 4, d: 8, l: 8, i: 4, b: 1 }[t];
        const raw = Buffer.alloc(v.length * size);
        v.forEach((x, k) => {
          if (t === "f") raw.writeFloatLE(x, k * 4); else if (t === "d") raw.writeDoubleLE(x, k * 8);
          else if (t === "l") raw.writeBigInt64LE(BigInt(x), k * 8); else if (t === "i") raw.writeInt32LE(x, k * 4); else raw[k] = x ? 1 : 0;
        });
        const comp = import_node_zlib.deflateSync(raw);
        const h = Buffer.alloc(12);
        h.writeUInt32LE(v.length, 0); h.writeUInt32LE(1, 4); h.writeUInt32LE(comp.length, 8);
        parts.push(h, comp);
      } else {
        const h = Buffer.alloc(4);
        h.writeUInt32LE(v.length);
        parts.push(h, v);
      }
    }
    return Buffer.concat(parts);
  }
  function nodeBuf(n, at) {
    const name = Buffer.from(n.name, "latin1");
    const pb = propsBuf(n.props);
    const kids = [];
    let cur = at + f.head + name.length + pb.length;
    for (const c of n.children) {
      const cb = nodeBuf(c, cur);
      kids.push(cb);
      cur += cb.length;
    }
    if (n.children.length || !n.props.length) kids.push(Buffer.alloc(f.head));
    const body = Buffer.concat(kids);
    const end = at + f.head + name.length + pb.length + body.length;
    const h = Buffer.alloc(f.head);
    if (f.v64) {
      h.writeBigUInt64LE(BigInt(end), 0); h.writeBigUInt64LE(BigInt(n.props.length), 8); h.writeBigUInt64LE(BigInt(pb.length), 16); h[24] = name.length;
    } else {
      h.writeUInt32LE(end, 0); h.writeUInt32LE(n.props.length, 4); h.writeUInt32LE(pb.length, 8); h[12] = name.length;
    }
    return Buffer.concat([h, name, pb, body]);
  }
  for (const n of f.nodes) {
    const nb = nodeBuf(n, offset);
    out.push(nb);
    offset += nb.length;
  }
  out.push(Buffer.alloc(f.head), Buffer.from(f.footer));
  return Buffer.concat(out);
}

function fbxIndex(f) {
  const top = Object.fromEntries(f.nodes.map((n) => [n.name, n]));
  const objs = new Map();
  for (const o of top.Objects?.children || []) if (o.props[0]?.[0] === "L") objs.set(o.props[0][1], o);
  const conns = (top.Connections?.children || []).map((c) => c.props.map((p) => p[1]));
  const label = (o) => o.props[1][1].toString("latin1").split("\0")[0];
  return { objs, conns, label };
}

function fbxInfo(b) {
  const f = fbxRead(b);
  const { objs, label } = fbxIndex(f);
  let dur = 0;
  let hips = false;
  for (const o of objs.values()) {
    if (o.name === "Model" && /(^|:)Hips$/i.test(label(o))) hips = true;
    if (o.name === "AnimationCurve") {
      const kt = o.children.find((c) => c.name === "KeyTime");
      const last = kt?.props[0][1].at(-1);
      if (last !== undefined) dur = Math.max(dur, Number(last) / FBX_TICKS);
    }
  }
  return { duration: Math.round(dur * 100) / 100, humanoid: hips };
}

// Makes the hips' horizontal track constant (its first key): no sliding out of the window.
function fbxInPlace(b) {
  const f = fbxRead(b);
  const { objs, conns, label } = fbxIndex(f);
  const hips = new Set([...objs].filter(([, o]) => o.name === "Model" && /(^|:)Hips$/i.test(label(o))).map(([id]) => id));
  const tnodes = conns.filter((c) => c[0].toString() === "OP" && hips.has(c[2]) && c[3].toString() === "Lcl Translation").map((c) => c[1]);
  let fixed = 0;
  for (const cn of tnodes) {
    for (const c of conns) {
      if (c[0].toString() !== "OP" || c[2] !== cn || !["d|X", "d|Z"].includes(c[3].toString())) continue;
      const kv = objs.get(c[1])?.children.find((ch) => ch.name === "KeyValueFloat");
      if (kv) {
        const vals = kv.props[0][1];
        kv.props[0] = [kv.props[0][0], vals.map(() => vals[0])];
        fixed++;
      }
    }
  }
  return { buf: fixed ? fbxWrite(f) : b, fixed };
}

// ── inspecting a file the user picked ───────────────────────────────────────

function inspectFile(path) {
  const ext = import_node_path.extname(path).toLowerCase();
  if (!EXTS.includes(ext)) throw new Error("unsupported");
  if (ext === ".fbx") {
    const info = fbxInfo(import_node_fs.readFileSync(path));
    return { kind: "fbx", animations: [{ name: import_node_path.basename(path, ext), duration: info.duration }], humanoid: info.humanoid };
  }
  const json = readGlbJson(path);
  const vrma = !!json.extensions?.VRMC_vrm_animation;
  const anims = gltfAnimations(json);
  if (!anims.length) throw new Error("noanims");
  if (vrma) return { kind: "vrma", animations: [{ name: import_node_path.basename(path, ext), duration: anims[0].duration }], humanoid: true };
  return { kind: "glb", animations: anims, humanoid: true };
}

function uniqueId(db, base) {
  let id = slug(base);
  let n = 2;
  while (db.anims.some((a) => a.id === id)) id = `${slug(base)}_${n++}`;
  return id;
}

function writeClipFile(anim, srcFile) {
  import_node_fs.mkdirSync(ORIG, { recursive: true });
  const orig = import_node_path.join(ORIG, anim.file);
  if (srcFile) import_node_fs.copyFileSync(srcFile, orig);
  const dst = import_node_path.join(CLIPS, anim.file);
  if (anim.kind === "fbx" && anim.inplace) {
    const { buf } = fbxInPlace(import_node_fs.readFileSync(orig));
    import_node_fs.writeFileSync(dst, buf);
  } else {
    import_node_fs.copyFileSync(orig, dst);
  }
}

function importFile({ path, picks, inplace, title }) {
  const info = inspectFile(path);
  const db = loadDb();
  const ext = import_node_path.extname(path).toLowerCase();
  const fileBase = uniqueId(db, import_node_path.basename(path));
  const file = `${fileBase}${ext}`;
  const chosen = info.kind === "glb" ? info.animations.filter((a) => !picks || picks.includes(a.name)) : info.animations;
  const added = [];
  chosen.forEach((a, i) => {
    const id = uniqueId(db, info.kind === "glb" ? `${fileBase}_${a.name}` : fileBase);
    const anim = {
      id, title: (info.kind === "glb" ? a.name : title || a.name), file, kind: info.kind,
      source: info.kind === "glb" ? a.name : undefined, duration: a.duration,
      inplace: info.kind === "fbx" ? inplace !== false : false, enabled: true, speed: 1,
      idle: { on: false, weight: 0.04 }, music: { slow: false, mid: false, fast: false }
    };
    if (i === 0) writeClipFile(anim, path);
    db.anims.push(anim);
    added.push(anim);
  });
  saveDb(db);
  return { added, humanoid: info.humanoid };
}

// ── generating the add-on pack ──────────────────────────────────────────────

function buildToml(db) {
  const L = [
    "# Generated by the Anim Studio plugin from studio.json — edit animations in Astra → Anim Studio,",
    "# changes made here by hand are overwritten.",
    "[animpack]", 'kind = "vrm"', 'name = "Anim Studio"', `uid = "local:${PACK_ID}"`, ""
  ];
  const on = db.anims.filter((a) => a.enabled);
  for (const a of on) {
    L.push("[[clips]]", `name = ${tomlStr("as_" + a.id)}   # ${String(a.title).replace(/[\r\n]/g, " ")}`,
      `file = ${tomlStr("clips/" + a.file)}`);
    if (a.source) L.push(`source = ${tomlStr(a.source)}`);
    L.push("loop = false", "fade = 0.5");
    if (a.speed && a.speed !== 1) L.push(`speed = ${Number(a.speed).toFixed(2)}`);
    L.push("");
  }
  // idle and drag are always declared (as empty extensions when nothing is added): the engine checks
  // an add-on on its own too, and every state's `→ idle` / `→ drag` edge must name a state it knows.
  const idle = on.filter((a) => a.idle?.on);
  L.push("[states.idle]", 'merge = "extend"');
  for (const a of idle) L.push("[[states.idle.variants]]", `clip = ${tomlStr("as_" + a.id)}`, `weight = ${Math.max(0.005, Number(a.idle.weight) || 0.04).toFixed(3)}`);
  L.push("", "[states.drag]", 'merge = "extend"', "");
  const [lo, hi] = db.reroll || [20, 35];
  for (const band of BANDS) {
    const list = on.filter((a) => a.music?.[band]);
    if (!list.length) continue;
    L.push(`[states.dance_${band}]`, 'merge = "extend"', 'pick = "random"', `reroll_secs = [${lo}, ${hi}]`);
    for (const a of list) L.push(`[[states.dance_${band}.variants]]`, `clip = ${tomlStr("as_" + a.id)}`);
    L.push("");
  }
  for (const a of on) {
    const st = "as_" + a.id;
    L.push(`[states.${st}]`, `clip = ${tomlStr(st)}`, "loop = false",
      `[[states.${st}.transitions]]`, 'on = "clip_finished"', 'to = "idle"',
      `[[states.${st}.transitions]]`, 'on = "dragged"', 'to = "drag"', "");
  }
  return L.join("\n");
}

function writePack(db) {
  import_node_fs.mkdirSync(CLIPS, { recursive: true });
  import_node_fs.writeFileSync(import_node_path.join(STUDIO, "animpack.toml"), buildToml(db));
}

// ── characters ──────────────────────────────────────────────────────────────

function activeCharacter() {
  try {
    const t = import_node_fs.readFileSync(import_node_path.join(PACK_ROOT, "companion.toml"), "utf8");
    return /^\s*character\s*=\s*"([^"]*)"/m.exec(t)?.[1] || "";
  } catch {
    return "";
  }
}

function readCharacter(id) {
  const file = import_node_path.join(PACK_ROOT, "characters", id, "character.toml");
  const text = import_node_fs.readFileSync(file, "utf8");
  const get = (k) => new RegExp(`^\\s*${k}\\s*=\\s*"([^"]*)"`, "m").exec(text)?.[1] || "";
  const addonsLine = /^\s*addons\s*=\s*\[([^\]]*)\]/m.exec(text);
  const addons = addonsLine ? [...addonsLine[1].matchAll(/"([^"]*)"/g)].map((m) => m[1]) : [];
  return { id, file, text, name: get("name") || id, kind: get("kind"), animpack: get("animpack"), addons };
}

function listCharacters() {
  const dir = import_node_path.join(PACK_ROOT, "characters");
  const active = activeCharacter();
  let ids = [];
  try {
    ids = import_node_fs.readdirSync(dir).filter((d) => import_node_fs.existsSync(import_node_path.join(dir, d, "character.toml")));
  } catch {}
  const list = [];
  for (const id of ids) {
    try {
      const c = readCharacter(id);
      if (c.kind !== "vrm") continue;
      list.push({ id, name: c.name, animpack: c.animpack, attached: c.addons.includes(PACK_ID), active: id === active });
    } catch {}
  }
  return { list, active, activeIsBuiltin: !!active && !ids.includes(active) };
}

function setAttached(id, on) {
  const c = readCharacter(id);
  const addons = c.addons.filter((a) => a !== PACK_ID);
  if (on) addons.push(PACK_ID);
  const line = `addons = [${addons.map((a) => tomlStr(a)).join(", ")}]`;
  let text;
  if (/^\s*addons\s*=\s*\[[^\]]*\]/m.test(c.text)) text = c.text.replace(/^\s*addons\s*=\s*\[[^\]]*\]/m, line);
  else if (/^\s*animpack\s*=.*$/m.test(c.text)) text = c.text.replace(/^(\s*animpack\s*=.*)$/m, `$1\n${line}`);
  else text = c.text.replace(/^\[character\]\s*$/m, `[character]\n${line}`);
  if (!import_node_fs.existsSync(c.file + ".before-anim-studio")) import_node_fs.copyFileSync(c.file, c.file + ".before-anim-studio");
  import_node_fs.writeFileSync(c.file, text);
}

// ── restart the avatar and read what the engine said ────────────────────────

function latestLog() {
  const dir = import_node_path.join(CFG, "logs");
  const files = import_node_fs.readdirSync(dir).filter((f) => f.startsWith("daemon.log")).map((f) => import_node_path.join(dir, f));
  files.sort((a, b) => import_node_fs.statSync(b).mtimeMs - import_node_fs.statSync(a).mtimeMs);
  return files[0];
}

async function restartAvatar() {
  let log, start = 0;
  try {
    log = latestLog();
    start = import_node_fs.statSync(log).size;
  } catch {}
  await powershell("Stop-Process -Name astra-avatar-engine -Force -ErrorAction SilentlyContinue").catch(() => {});
  if (!log) return { ok: true, note: "" };
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 750));
    let fresh = "";
    try {
      const fd = import_node_fs.openSync(log, "r");
      const size = import_node_fs.fstatSync(fd).size;
      const buf = Buffer.alloc(Math.max(0, size - start));
      import_node_fs.readSync(fd, buf, 0, buf.length, start);
      import_node_fs.closeSync(fd);
      fresh = buf.toString("utf8");
    } catch {}
    const loaded = /\[manifest\] loaded .*playing '([^']*)' \((\d+) clips\)/.exec(fresh);
    if (loaded) {
      const problems = fresh.split(/\r?\n/).filter((l) => /as_|anim-studio/.test(l) && /(warn|error|invalid|unknown|cannot|refused|missing|skipped)/i.test(l))
        .map((l) => l.replace(/^.*?\[(anim|manifest|animpacks)\]/, "[$1]").slice(0, 300));
      return { ok: true, pack: loaded[1], clips: Number(loaded[2]), problems };
    }
  }
  return { ok: false, note: "timeout" };
}

// ── state for the page ──────────────────────────────────────────────────────

function getState() {
  const db = loadDb();
  return { anims: db.anims, reroll: db.reroll || [20, 35], characters: listCharacters(), folder: STUDIO };
}

var app = plugin({
  id: "anim-studio",
  tools: {
    anim_studio_list: tool({
      description: "Anim Studio: lists the custom avatar animations the user installed and when each one plays (when bored / to music / its own state as_<id>). Список своих анимаций аватара и когда они играют.",
      input: s.object({}),
      run: async () => JSON.stringify(loadDb().anims.map((a) => ({
        title: a.title, state: "as_" + a.id, enabled: a.enabled, when_bored: a.idle?.on ? a.idle.weight : false,
        music: BANDS.filter((b) => a.music?.[b])
      })))
    })
  },
  ui: {
    contributions: [{
      id: "anim-studio", slot: "page.custom", label: "Anim Studio",
      icon_svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="4.5" r="2"/><path d="M12 7v6l-3 6M12 13l3 6M7 10l5-2 5 2"/></svg>',
      url: "index.html", width: 0, height: 0, transparent: true
    }],
    onCall: {
      getState: async () => getState(),
      pickFile: async () => ({
        // a top-most owner keeps the dialog in front of the Astra window
        path: await powershell("Add-Type -AssemblyName System.Windows.Forms; $o=New-Object System.Windows.Forms.Form -Property @{TopMost=$true;ShowInTaskbar=$false;WindowState='Minimized'}; $d=New-Object System.Windows.Forms.OpenFileDialog; $d.Filter='Animations (*.vrma;*.fbx;*.glb)|*.vrma;*.fbx;*.glb|All files (*.*)|*.*'; if($d.ShowDialog($o) -eq 'OK'){Write-Output $d.FileName}; $o.Dispose()", 600000)
      }),
      inspectFile: async (p) => inspectFile(String(p.path || "")),
      importFile: async (p) => importFile(p),
      updateAnim: async (p) => {
        const db = loadDb();
        const a = db.anims.find((x) => x.id === p.id);
        if (!a) throw new Error("not found");
        const before = a.inplace;
        const patch = p.patch || {};
        for (const k of ["title", "enabled", "speed", "inplace"]) if (k in patch) a[k] = patch[k];
        if (patch.idle) a.idle = { ...a.idle, ...patch.idle };
        if (patch.music) a.music = { ...a.music, ...patch.music };
        if (a.kind === "fbx" && before !== a.inplace) writeClipFile(a);
        saveDb(db);
        return a;
      },
      deleteAnim: async (p) => {
        const db = loadDb();
        const a = db.anims.find((x) => x.id === p.id);
        db.anims = db.anims.filter((x) => x.id !== p.id);
        if (a && !db.anims.some((x) => x.file === a.file)) {
          for (const f of [import_node_path.join(CLIPS, a.file), import_node_path.join(ORIG, a.file)]) import_node_fs.rmSync(f, { force: true });
        }
        saveDb(db);
        return true;
      },
      setReroll: async (p) => {
        const db = loadDb();
        db.reroll = [Math.max(5, Number(p.lo) || 20), Math.max(6, Number(p.hi) || 35)];
        saveDb(db);
        return db.reroll;
      },
      setCharacter: async (p) => {
        setAttached(String(p.id), !!p.on);
        return listCharacters();
      },
      apply: async () => {
        const db = loadDb();
        writePack(db);
        // first use: nobody wears the studio yet — attach it to the character worn now
        const chars = listCharacters();
        if (db.anims.length && !chars.list.some((c) => c.attached) && chars.list.some((c) => c.active)) setAttached(chars.active, true);
        return restartAvatar();
      },
      openFolder: async () => {
        import_node_fs.mkdirSync(STUDIO, { recursive: true });
        import_node_child_process.spawn("explorer.exe", [STUDIO], { detached: true, stdio: "ignore" }).unref();
        return true;
      }
    }
  },
  healthCheck: () => ({ healthy: true, status: "ok" })
});
if (require.main === module) app.run();

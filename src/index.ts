// @ts-nocheck — plain JavaScript in a .ts file: esbuild bundles it, nothing here is type-checked.
// Anim Studio — Astra plugin: install your own avatar animations without editing TOML by hand.
//
// It keeps ONE add-on animation pack, `animpacks/anim-studio/`, generated from `studio.json`, and
// lists it in `addons = [...]` of the characters you pick. The engine stacks an add-on on top of
// the character's own pack, so nothing of the user's pack is touched:
//   * every animation gets its own state `as_<id>` (preview it in Astra → Model → Animations,
//     bind it to events in Model → Triggers);
//   * "when bored" adds it to `idle` as a rare variant (merge = "extend");
//   * "to music" adds it to dance_slow / dance_mid / dance_fast (merge = "extend");
//   * "time of day" limits both to some of morning / day / evening / night. The engine has no clock,
//     so the pack is written for the part of the day it is now and rewritten when that changes.
// After a change the avatar engine is restarted (Astra brings it back by itself).
//
// Life: she stretches in the morning, waves when you come back, yawns in the evening and hints it
// is time to sleep after midnight. Animations and phrases go out as this plugin's triggers; the two
// Astra commands that act on them are created by the page (button "Create commands").
import * as import_node_fs from "node:fs";
import * as import_node_path from "node:path";
import * as import_node_zlib from "node:zlib";
import * as import_node_child_process from "node:child_process";
import { plugin, s, tool } from "astra-plugin-sdk";
import { FX_SPRITES } from "./fx_sprites";

var CFG = import_node_path.join(process.env.APPDATA || "", "astra", "astra", "config");
var PACK_ROOT = import_node_path.join(CFG, "companion", "pack");
var STUDIO = import_node_path.join(PACK_ROOT, "animpacks", "anim-studio");
var CLIPS = import_node_path.join(STUDIO, "clips");
var ORIG = import_node_path.join(CLIPS, "orig");
var DB_PATH = import_node_path.join(STUDIO, "studio.json");
var PACK_ID = "anim-studio";
var BANDS = ["slow", "mid", "fast"];
var EXTS = [".vrma", ".fbx", ".glb"];
// parts of the day, by the hour they start: morning 5–12, day 12–18, evening 18–24, night 0–5
var PERIODS = ["morning", "day", "evening", "night"];
var PERIOD_HOURS = { morning: [5, 12], day: [12, 18], evening: [18, 24], night: [0, 5] };

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

var sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function periodOf(hour) {
  return PERIODS.find((p) => hour >= PERIOD_HOURS[p][0] && hour < PERIOD_HOURS[p][1]);
}

function currentPeriod() {
  return periodOf(new Date().getHours());
}

// no `times` (added before 1.1) or all four ticked = at any time
function atTime(anim, period) {
  return !Array.isArray(anim.times) || !anim.times.length || anim.times.includes(period);
}

// ── studio.json ─────────────────────────────────────────────────────────────

// What she plays at each moment of the day: a state of the character's own pack (when it has them)
// or one of the studio's `as_<id>`; "" = nothing.
// Which character (one of her outfits) to wear by the part of the day and by the weather; "" = keep.
// A weather rule wins over the time one. `last` is what the rules asked for last time: she is changed
// only when that changes, so an outfit picked by hand stays until the next part of the day or weather.
var OUTFIT_DEFAULTS = { on: false, time: { morning: "", day: "", evening: "", night: "" },
  weather: { clear: "", cloud: "", rain: "", snow: "", storm: "" }, place: null, last: "" };
var LIFE_DEFAULTS = { on: true, voice: true, morning: "stretch", back: "hello", evening: "yawn", night: "yawn" };

function loadDb() {
  let db;
  try {
    db = JSON.parse(import_node_fs.readFileSync(DB_PATH, "utf8"));
    db.anims = db.anims || [];
  } catch {
    db = { version: 1, anims: [], reroll: [20, 35] };
  }
  db.life = { ...LIFE_DEFAULTS, ...db.life };
  db.smoothDance = db.smoothDance !== false;
  db.outfit = { ...OUTFIT_DEFAULTS, ...db.outfit, time: { ...OUTFIT_DEFAULTS.time, ...db.outfit?.time }, weather: { ...OUTFIT_DEFAULTS.weather, ...db.outfit?.weather } };
  return db;
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

// Same for glTF/VRMA: the hips' translation keys keep their height but take the first key's X/Z.
// `only` limits it to one animation of a multi-animation .glb. The BIN chunk is edited in place.
function gltfInPlace(b, only) {
  const jsonLen = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + jsonLen).toString("utf8"));
  const binStart = 20 + jsonLen + 8;
  const hips = new Set();
  const hb = json.extensions?.VRMC_vrm_animation?.humanoid?.humanBones?.hips?.node;
  if (Number.isInteger(hb)) hips.add(hb);
  (json.nodes || []).forEach((n, i) => {
    if (/(^|[:_\s])(hips|pelvis|root)$/i.test(n.name || "")) hips.add(i); // root motion lives on one of these
  });
  const out = Buffer.from(b);
  let fixed = 0;
  for (const anim of json.animations || []) {
    if (only && anim.name !== only) continue;
    for (const ch of anim.channels || []) {
      if (!hips.has(ch.target?.node) || ch.target?.path !== "translation") continue;
      const acc = json.accessors?.[anim.samplers?.[ch.sampler]?.output];
      if (!acc || acc.sparse || acc.componentType !== 5126 || acc.type !== "VEC3" || acc.bufferView === undefined) continue;
      const bv = json.bufferViews[acc.bufferView];
      if ((bv.buffer || 0) !== 0) continue;
      const start = binStart + (bv.byteOffset || 0) + (acc.byteOffset || 0);
      const stride = bv.byteStride || 12;
      const x0 = out.readFloatLE(start), z0 = out.readFloatLE(start + 8);
      for (let k = 1; k < acc.count; k++) {
        out.writeFloatLE(x0, start + k * stride);
        out.writeFloatLE(z0, start + k * stride + 8);
      }
      fixed++;
    }
  }
  return { buf: out, fixed };
}

// ── Mixamo FBX → VRMA, and touching up a VRMA: a face expression, relaxed fingers ─
// Ported from DotaHelper/tools/fbx2vrma.py. A VRMA keeps each bone's rest rotation on its node,
// and the player maps a key q onto the normalized (T-pose, world-aligned) bone as P·q·S⁻¹
// (P, S — the world rest rotations of the parent and the bone itself).

var GLB_FPS = 30;
var MIXAMO_HUMAN = {
  Hips: "hips", Spine: "spine", Spine1: "chest", Spine2: "upperChest", Neck: "neck", Head: "head",
  LeftShoulder: "leftShoulder", LeftArm: "leftUpperArm", LeftForeArm: "leftLowerArm", LeftHand: "leftHand",
  RightShoulder: "rightShoulder", RightArm: "rightUpperArm", RightForeArm: "rightLowerArm", RightHand: "rightHand",
  LeftUpLeg: "leftUpperLeg", LeftLeg: "leftLowerLeg", LeftFoot: "leftFoot", LeftToeBase: "leftToes",
  RightUpLeg: "rightUpperLeg", RightLeg: "rightLowerLeg", RightFoot: "rightFoot", RightToeBase: "rightToes"
};
var FINGERS = [["Index", "Index"], ["Middle", "Middle"], ["Ring", "Ring"], ["Pinky", "Little"]];
for (const side of ["Left", "Right"]) {
  const s = side.toLowerCase();
  Object.assign(MIXAMO_HUMAN, { [`${side}HandThumb1`]: `${s}ThumbMetacarpal`, [`${side}HandThumb2`]: `${s}ThumbProximal`, [`${side}HandThumb3`]: `${s}ThumbDistal` });
  for (const [fbx, vrm] of FINGERS) {
    Object.assign(MIXAMO_HUMAN, { [`${side}Hand${fbx}1`]: `${s}${vrm}Proximal`, [`${side}Hand${fbx}2`]: `${s}${vrm}Intermediate`, [`${side}Hand${fbx}3`]: `${s}${vrm}Distal` });
  }
}
var EXPRESSIONS = ["happy", "angry", "sad", "relaxed", "surprised"];

function qmul(a, b) {
  const [ax, ay, az, aw] = a, [bx, by, bz, bw] = b;
  return [aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz];
}
var qinv = (q) => [-q[0], -q[1], -q[2], q[3]];

function qaxis(axis, deg) {
  const h = (deg * Math.PI) / 360, v = [0, 0, 0, Math.cos(h)];
  v[axis] = Math.sin(h);
  return v;
}

// FBX eEulerXYZ: R = Rz·Ry·Rx (X is applied first)
var qeuler = (e) => qmul(qmul(qaxis(2, e[2]), qaxis(1, e[1])), qaxis(0, e[0]));

function sampleCurve([times, values], t) {
  if (t <= times[0]) return values[0];
  if (t >= times[times.length - 1]) return values[values.length - 1];
  let lo = 0, hi = times.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) lo = mid; else hi = mid;
  }
  return values[lo] + ((values[hi] - values[lo]) * (t - times[lo])) / (times[hi] - times[lo]);
}

function readGlb(b) {
  if (b.readUInt32LE(0) !== 0x46546c67) throw new Error("not a GLB/VRMA file");
  const jsonLen = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + jsonLen).toString("utf8"));
  const binAt = 20 + jsonLen;
  const bin = binAt + 8 <= b.length ? Buffer.from(b.subarray(binAt + 8, binAt + 8 + b.readUInt32LE(binAt))) : Buffer.alloc(0);
  return { json, bin };
}

function writeGlb(json, bin) {
  json.buffers = [{ byteLength: bin.length }];
  let js = Buffer.from(JSON.stringify(json));
  js = Buffer.concat([js, Buffer.alloc(-js.length % 4 & 3, 0x20)]);
  const pad = Buffer.concat([bin, Buffer.alloc(-bin.length % 4 & 3)]);
  const h = Buffer.alloc(12), jh = Buffer.alloc(8), bh = Buffer.alloc(8);
  h.writeUInt32LE(0x46546c67, 0); h.writeUInt32LE(2, 4); h.writeUInt32LE(12 + 8 + js.length + 8 + pad.length, 8);
  jh.writeUInt32LE(js.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  bh.writeUInt32LE(pad.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([h, jh, js, bh, pad]);
}

// Appends float data as a new accessor; `parts` collects the BIN pieces.
function glbAdder(json, bin) {
  const parts = [bin];
  let size = bin.length;
  json.accessors = json.accessors || [];
  json.bufferViews = json.bufferViews || [];
  return {
    add(data, type, minmax) {
      const flat = data.flat();
      const buf = Buffer.alloc(flat.length * 4);
      flat.forEach((x, k) => buf.writeFloatLE(x, k * 4));
      json.bufferViews.push({ buffer: 0, byteOffset: size, byteLength: buf.length });
      parts.push(buf);
      size += buf.length;
      const acc = { bufferView: json.bufferViews.length - 1, componentType: 5126, count: data.length, type };
      if (minmax) Object.assign(acc, { min: [Math.min(...flat)], max: [Math.max(...flat)] });
      json.accessors.push(acc);
      return json.accessors.length - 1;
    },
    bin: () => Buffer.concat(parts)
  };
}

function readAccessor(json, bin, index) {
  const acc = json.accessors[index];
  const n = { SCALAR: 1, VEC3: 3, VEC4: 4 }[acc.type];
  if (!n || acc.componentType !== 5126 || acc.sparse || acc.bufferView === undefined) return null;
  const bv = json.bufferViews[acc.bufferView];
  const start = (bv.byteOffset || 0) + (acc.byteOffset || 0), stride = bv.byteStride || n * 4;
  const out = [];
  for (let k = 0; k < acc.count; k++) {
    const v = [];
    for (let c = 0; c < n; c++) v.push(bin.readFloatLE(start + k * stride + c * 4));
    out.push(n === 1 ? v[0] : v);
  }
  return out;
}

function fbxToVrma(b, { inplace }) {
  const f = fbxRead(b);
  const { objs, conns, label } = fbxIndex(f);
  const models = new Map([...objs].filter(([, o]) => o.name === "Model"));
  const nameOf = (id) => label(models.get(id)).split(":").pop();
  const parent = new Map();
  for (const c of conns) if (c[0].toString() === "OO" && models.has(c[1]) && models.has(c[2])) parent.set(c[1], c[2]);
  const hips = [...models.keys()].find((id) => nameOf(id) === "Hips");
  if (hips === undefined) throw new Error("FBX: no Hips bone — not a humanoid (Mixamo) animation");
  const props70 = (node) => {
    const out = {};
    for (const ch of node.children) if (ch.name === "Properties70")
      for (const p of ch.children) out[p.props[0][1].toString("latin1")] = p.props.slice(4).map((x) => Number(x[1]));
    return out;
  };
  const curves = new Map(); // model → { T|R: { X|Y|Z: [times, values] } }
  for (const c of conns) {
    const what = c[3]?.toString();
    if (c[0].toString() !== "OP" || !models.has(c[2]) || (what !== "Lcl Translation" && what !== "Lcl Rotation")) continue;
    const kind = what === "Lcl Translation" ? "T" : "R";
    for (const c2 of conns) {
      const ax = c2[3]?.toString();
      if (c2[0].toString() !== "OP" || c2[2] !== c[1] || !["d|X", "d|Y", "d|Z"].includes(ax)) continue;
      const cv = objs.get(c2[1]);
      const kt = cv?.children.find((ch) => ch.name === "KeyTime")?.props[0][1];
      const kv = cv?.children.find((ch) => ch.name === "KeyValueFloat")?.props[0][1];
      if (!kt || !kv) continue;
      const m = curves.get(c[2]) || {};
      (m[kind] = m[kind] || {})[ax.slice(-1)] = [kt.map((x) => Number(x) / FBX_TICKS), kv];
      curves.set(c[2], m);
    }
  }
  let end = 0;
  for (const m of curves.values()) for (const k of Object.values(m)) for (const [ts] of Object.values(k)) end = Math.max(end, ts[ts.length - 1]);
  const frames = Array.from({ length: Math.floor(end * GLB_FPS) + 1 }, (_, i) => i / GLB_FPS);

  const nodes = [], index = new Map(), rest = new Map();
  const walk = (id) => {
    const p = props70(models.get(id));
    const t = p["Lcl Translation"] || [0, 0, 0], r = p["Lcl Rotation"] || [0, 0, 0], pre = p.PreRotation || [0, 0, 0];
    rest.set(id, { t, r, pre });
    index.set(id, nodes.length);
    const node = { name: nameOf(id), translation: t.map((x) => x / 100), rotation: qmul(qeuler(pre), qeuler(r)) };
    nodes.push(node);
    const kids = [...models.keys()].filter((j) => parent.get(j) === id);
    if (kids.length) node.children = [];
    for (const j of kids) {
      node.children.push(nodes.length);
      walk(j);
    }
  };
  walk(hips);

  const json = { asset: { version: "2.0", generator: "Anim Studio (fbx → vrma)" }, scene: 0, scenes: [{ nodes: [0] }], nodes };
  const glb = glbAdder(json, Buffer.alloc(0));
  const time = glb.add(frames, "SCALAR", true);
  const samplers = [], channels = [];
  for (const [id, i] of index) {
    const name = nameOf(id);
    if (!MIXAMO_HUMAN[name] || !curves.has(id)) continue;
    const { t, r, pre } = rest.get(id);
    const cr = curves.get(id).R;
    if (cr) {
      const qs = frames.map((fr) => qmul(qeuler(pre), qeuler([0, 1, 2].map((a) => (cr["XYZ"[a]] ? sampleCurve(cr["XYZ"[a]], fr) : r[a])))));
      for (let k = 1; k < qs.length; k++) if (qs[k].reduce((s, x, c) => s + x * qs[k - 1][c], 0) < 0) qs[k] = qs[k].map((x) => -x); // keep the sign continuous
      samplers.push({ input: time, output: glb.add(qs, "VEC4"), interpolation: "LINEAR" });
      channels.push({ sampler: samplers.length - 1, target: { node: i, path: "rotation" } });
    }
    const ct = curves.get(id).T;
    if (ct && name === "Hips") {
      const ts = frames.map((fr) => {
        const v = [0, 1, 2].map((a) => (ct["XYZ"[a]] ? sampleCurve(ct["XYZ"[a]], fr) : t[a]));
        if (inplace) [v[0], v[2]] = [t[0], t[2]];
        return v.map((x) => x / 100);
      });
      samplers.push({ input: time, output: glb.add(ts, "VEC3"), interpolation: "LINEAR" });
      channels.push({ sampler: samplers.length - 1, target: { node: i, path: "translation" } });
    }
  }
  const human = {};
  for (const [id, i] of index) if (MIXAMO_HUMAN[nameOf(id)]) human[MIXAMO_HUMAN[nameOf(id)]] = { node: i };
  json.extensionsUsed = ["VRMC_vrm_animation"];
  json.extensions = { VRMC_vrm_animation: { specVersion: "1.0", humanoid: { humanBones: human } } };
  json.animations = [{ name: "anim", samplers, channels }];
  return writeGlb(json, glb.bin());
}

// ── editing a VRMA: mirror, bone offsets, relaxed fingers, face keys, trim ──
// The clip is taken apart into tracks, edited in the normalized (T-pose, world-aligned) space where
// "raise the arm" means the same on every rig, and written back as a fresh GLB. Keys are in the
// clip's own time before the trim, so moving the trim never moves a key.
//
// edit: { mirror, trim: [start, end], bones: { <humanBone>: [[t, x°, y°, z°], …] },
//         face: { <expression>: [[t, weight], …] } }
// expr / exprWeight: a single expression that fades in over 0.3 s and out by the end (when no face keys);
// fingers: degrees each finger joint bends towards the palm, on top of what the clip does.

var mirrorBone = (name) => (name.startsWith("left") ? "right" + name.slice(4) : name.startsWith("right") ? "left" + name.slice(5) : name);

function qnorm(q) {
  const l = Math.hypot(...q) || 1;
  return q.map((x) => x / l);
}

function qrotate(q, v) {
  const r = qmul(qmul(q, [v[0], v[1], v[2], 0]), qinv(q));
  return [r[0], r[1], r[2]];
}

function sampleTrack(tr, t) {
  const { times, vals } = tr;
  if (t <= times[0]) return vals[0];
  const n = times.length - 1;
  if (t >= times[n]) return vals[n];
  let lo = 0, hi = n;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) lo = mid; else hi = mid;
  }
  const f = (t - times[lo]) / (times[hi] - times[lo]), a = vals[lo], b = vals[hi];
  if (typeof a === "number") return a + (b - a) * f;
  if (a.length === 4) {
    const s = a.reduce((acc, x, c) => acc + x * b[c], 0) < 0 ? -1 : 1; // the short way round
    return qnorm(a.map((x, c) => x + (s * b[c] - x) * f));
  }
  return a.map((x, c) => x + (b[c] - x) * f);
}

// [[t, ...values]] keys → the value at t, linear between keys, held past the ends
function sampleKeys(keys, t) {
  const k = [...keys].sort((x, y) => x[0] - y[0]);
  return sampleTrack({ times: k.map((x) => x[0]), vals: k.map((x) => (x.length === 2 ? x[1] : x.slice(1))) }, t);
}

function decodeVrma(b) {
  const { json, bin } = readGlb(b);
  const ext = json.extensions?.VRMC_vrm_animation;
  const anim = json.animations?.[0];
  if (!ext || !anim) throw new Error("not a VRM animation (no VRMC_vrm_animation)");
  const parentOf = new Map();
  json.nodes.forEach((n, i) => (n.children || []).forEach((c) => parentOf.set(c, i)));
  const memo = new Map();
  const world = (i) => {
    if (i === undefined) return [0, 0, 0, 1];
    if (!memo.has(i)) memo.set(i, qmul(world(parentOf.get(i)), json.nodes[i].rotation || [0, 0, 0, 1]));
    return memo.get(i);
  };
  const exprNode = new Map(); // node → [kind, name]
  for (const kind of ["preset", "custom"]) for (const [name, v] of Object.entries(ext.expressions?.[kind] || {})) exprNode.set(v.node, [kind, name]);
  const rot = new Map(), pos = new Map(), expr = new Map();
  let end = 0;
  for (const ch of anim.channels) {
    const smp = anim.samplers[ch.sampler];
    const node = ch.target?.node, path = ch.target?.path;
    if (node === undefined || !smp) continue;
    const times = readAccessor(json, bin, smp.input);
    let vals = readAccessor(json, bin, smp.output);
    if (!times || !vals) continue;
    if (smp.interpolation === "CUBICSPLINE") vals = vals.filter((_, k) => k % 3 === 1); // the values, not the tangents
    end = Math.max(end, times[times.length - 1]);
    if (exprNode.has(node) && path === "translation") expr.set(exprNode.get(node)[1], { kind: exprNode.get(node)[0], times, vals: vals.map((x) => x[0]) });
    else if (path === "rotation") rot.set(node, { times, vals });
    else if (path === "translation") pos.set(node, { times, vals });
  }
  return { json, ext, human: ext.humanoid?.humanBones || {}, parentOf, world, rot, pos, expr, end };
}

// what the editor needs to know about a clip
function vrmaInfo(b) {
  const v = decodeVrma(b);
  return { duration: Math.round(v.end * 1000) / 1000, bones: Object.keys(v.human), expressions: [...v.expr.keys()] };
}

// aliases: expression → the name the worn model keeps it under when that is not the standard one
// (VRM 0.x models often carry "Surprised" as a custom expression); the track is written under both.
function vrmaEdit(b, { expr, exprWeight = 1, fingers = 0, mirror, trim, bones, face, aliases = {} } = {}) {
  const hasBones = bones && Object.values(bones).some((k) => k?.length);
  const hasFace = face && Object.values(face).some((k) => k?.length);
  const hasTrim = Array.isArray(trim) && trim.length === 2;
  if (!expr && !fingers && !mirror && !hasBones && !hasFace && !hasTrim) return b;
  const v = decodeVrma(b);
  const { json, human, world, parentOf, end } = v;
  let { rot, pos, expr: exprs } = v;
  // strictly ascending, ending exactly at the end: the engine drops a channel with two keys at one time
  const frames = [];
  for (let i = 0; i / GLB_FPS < end - 1e-4; i++) frames.push(i / GLB_FPS);
  frames.push(end);
  if (frames.length < 2) frames.unshift(0);
  const nodeOf = (bone) => human[bone]?.node;
  const P = (node) => world(parentOf.get(node));
  const S = (node) => world(node);
  const humanNodes = new Set(Object.values(human).map((h) => h.node));
  // a bone without a track holds its rest pose
  const trackOf = (node) => rot.get(node) || { times: frames, vals: frames.map(() => json.nodes[node].rotation || [0, 0, 0, 1]) };

  if (mirror) {
    // n = P·q·S⁻¹ is the bone's normalized rotation; across the body's middle plane it becomes (x, −y, −z, w)
    const out = new Map();
    for (const [bone, { node }] of Object.entries(human)) {
      const src = rot.get(node), dst = nodeOf(mirrorBone(bone));
      if (!src || dst === undefined) continue;
      out.set(dst, {
        times: src.times,
        vals: src.vals.map((q) => {
          const n = qmul(qmul(P(node), q), qinv(S(node)));
          return qnorm(qmul(qmul(qinv(P(dst)), [n[0], -n[1], -n[2], n[3]]), S(dst)));
        })
      });
    }
    for (const [node, tr] of rot) if (!humanNodes.has(node)) out.set(node, tr);
    rot = out;
    const hips = nodeOf("hips");
    if (pos.has(hips)) {
      const Ph = P(hips), tr = pos.get(hips);
      pos.set(hips, { times: tr.times, vals: tr.vals.map((t) => { const w = qrotate(Ph, t); return qrotate(qinv(Ph), [-w[0], w[1], w[2]]); }) });
    }
  }

  // a rotation d(t) in the bone's normalized frame, on top of the clip: q' = q·S⁻¹·d·S
  const addOffset = (bone, dAt) => {
    const node = nodeOf(bone);
    if (node === undefined) return;
    const tr = trackOf(node), Sn = S(node), Si = qinv(Sn);
    rot.set(node, { times: tr.times, vals: tr.vals.map((q, k) => qnorm(qmul(q, qmul(qmul(Si, dAt(tr.times[k])), Sn)))) });
  };
  if (fingers) {
    for (const side of ["left", "right"]) {
      FINGERS.forEach(([, finger], fi) => {
        ["Proximal", "Intermediate", "Distal"].forEach((joint, ji) => {
          // a softer bend at the tip, a little more towards the little finger — a hand at rest
          const deg = fingers * [1, 1.1, 0.75][ji] * [0.85, 1, 1.08, 1.18][fi];
          // normalized T-pose: the left fingers point +X, the right −X; the palm faces down
          const d = qaxis(2, side === "left" ? -deg : deg);
          addOffset(`${side}${finger}${joint}`, () => d);
        });
      });
    }
  }
  if (hasBones) for (const [bone, keys] of Object.entries(bones)) if (keys?.length) addOffset(bone, (t) => qeuler(sampleKeys(keys, t)));

  if (hasFace) {
    for (const [name, keys] of Object.entries(face)) {
      if (!keys?.length) continue;
      const k = [...keys].sort((x, y) => x[0] - y[0]);
      exprs.set(name, { kind: EXPRESSIONS.includes(name) ? "preset" : "custom", times: k.map((x) => Math.max(0, x[0])), vals: k.map((x) => Math.max(0, Math.min(1, x[1]))) });
    }
  } else if (expr && EXPRESSIONS.includes(expr)) {
    const ramp = 0.3;
    exprs.set(expr, { kind: "preset", times: frames, vals: frames.map((t) => exprWeight * Math.max(0, Math.min(1, t / ramp, (end - t) / ramp))) });
  }

  if (hasTrim) {
    const s = Math.max(0, Math.min(trim[0], trim[1])), e = Math.min(end, Math.max(trim[0], trim[1]));
    if (e - s > 0.05) {
      const cut = (tr) => {
        const ts = [s, ...tr.times.filter((t) => t > s && t < e), e];
        return { ...tr, times: ts.map((t) => t - s), vals: ts.map((t) => sampleTrack(tr, t)) };
      };
      rot = new Map([...rot].map(([n, tr]) => [n, cut(tr)]));
      pos = new Map([...pos].map(([n, tr]) => [n, cut(tr)]));
      exprs = new Map([...exprs].map(([n, tr]) => [n, cut(tr)]));
    }
  }

  // write it back: the same skeleton, one fresh animation
  const nodes = json.nodes.map((n) => ({ ...n }));
  const exprMap = { preset: {}, custom: {} };
  for (const [name, tr] of exprs) {
    let ni = nodes.findIndex((n) => n.name === "expr_" + name);
    if (ni < 0) {
      ni = nodes.length;
      nodes.push({ name: "expr_" + name });
    }
    exprMap[tr.kind][name] = { node: ni };
    if (aliases[name] && aliases[name] !== name) exprMap.custom[aliases[name]] = { node: ni };
    tr.node = ni;
  }
  const scene = json.scenes?.[json.scene || 0]?.nodes || [];
  const roots = [...new Set([...scene, ...[...exprs.values()].map((tr) => tr.node)])];
  const out = { asset: { version: "2.0", generator: "Anim Studio" }, scene: 0, scenes: [{ nodes: roots }], nodes };
  const glb = glbAdder(out, Buffer.alloc(0));
  const samplers = [], channels = [];
  const inputs = new Map();
  const input = (times) => {
    const key = times.join(",");
    if (!inputs.has(key)) inputs.set(key, glb.add(times, "SCALAR", true));
    return inputs.get(key);
  };
  const push = (node, path, tr, type, map = (x) => x) => {
    // keys must go strictly forward in time (the engine skips the whole channel otherwise)
    const keep = tr.times.map((t, k) => k === 0 || t > tr.times[k - 1] + 1e-6);
    tr = { times: tr.times.filter((_, k) => keep[k]), vals: tr.vals.filter((_, k) => keep[k]) };
    if (tr.times.length < 1) return;
    samplers.push({ input: input(tr.times), output: glb.add(tr.vals.map(map), type), interpolation: "LINEAR" });
    channels.push({ sampler: samplers.length - 1, target: { node, path } });
  };
  for (const [node, tr] of rot) push(node, "rotation", tr, "VEC4");
  for (const [node, tr] of pos) push(node, "translation", tr, "VEC3");
  for (const tr of exprs.values()) push(tr.node, "translation", tr, "VEC3", (w) => [w, 0, 0]);
  const ext = { ...v.ext };
  delete ext.lookAt; // its node and track are not carried over
  const used = Object.fromEntries(Object.entries(exprMap).filter(([, m]) => Object.keys(m).length));
  if (Object.keys(used).length) ext.expressions = used; else delete ext.expressions;
  out.extensionsUsed = ["VRMC_vrm_animation"];
  out.extensions = { VRMC_vrm_animation: ext };
  out.animations = [{ name: json.animations[0].name || "anim", samplers, channels }];
  return writeGlb(out, glb.bin());
}

// ── inspecting a file the user picked ───────────────────────────────────────

function inspectFile(path) {
  const ext = import_node_path.extname(path).toLowerCase();
  if (!import_node_fs.existsSync(path)) throw new Error(`file not found: ${path}`);
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

// A face expression, relaxed fingers or an editor edit need a VRMA: a Mixamo FBX is converted for them.
var hasEdit = (e) => !!e && !!(e.mirror || Array.isArray(e.trim) || Object.values(e.bones || {}).some((k) => k?.length)
  || Object.values(e.face || {}).some((k) => k?.length));
var touchedUp = (anim) => anim.kind !== "glb" && !!(EXPRESSIONS.includes(anim.expr) || anim.fingers > 0 || hasEdit(anim.edit));
var editOf = (anim) => ({ expr: anim.expr, exprWeight: anim.exprWeight ?? 1, fingers: anim.fingers || 0, ...anim.edit, aliases: modelAliases() });

// What the worn model calls each standard expression. VRM 1.0 names them as VRMA does; VRM 0.x has
// joy / sorrow / fun / angry presets and no "surprised" one, so a model adds that as a custom group
// ("Surprised"). An expression the model has no preset for is matched by its name.
var EXPRESSION_NAMES = { happy: /^(happy|joy|smile)/i, sad: /^(sad|sorrow)/i, relaxed: /^(relax|fun)/i, angry: /^angry/i, surprised: /^surpris/i };
var VRM0_PRESETS = { joy: "happy", sorrow: "sad", fun: "relaxed", angry: "angry", surprised: "surprised" };
var aliasMemo = { key: "", value: {} };

function modelAliases() {
  try {
    const { file } = editorModel();
    const key = `${file}:${import_node_fs.statSync(file).mtimeMs}`;
    if (aliasMemo.key === key) return aliasMemo.value;
    // only the JSON chunk is needed, not the 20–75 MB of meshes
    const fd = import_node_fs.openSync(file, "r");
    let json;
    try {
      const head = Buffer.alloc(20);
      import_node_fs.readSync(fd, head, 0, 20, 0);
      const len = head.readUInt32LE(12);
      const buf = Buffer.alloc(len);
      import_node_fs.readSync(fd, buf, 0, len, 20);
      json = JSON.parse(buf.toString("utf8"));
    } finally {
      import_node_fs.closeSync(fd);
    }
    const presets = new Set(), custom = [];
    const v1 = json.extensions?.VRMC_vrm?.expressions;
    if (v1) {
      for (const n of Object.keys(v1.preset || {})) presets.add(n);
      custom.push(...Object.keys(v1.custom || {}));
    }
    for (const g of json.extensions?.VRM?.blendShapeMaster?.blendShapeGroups || []) {
      const p = VRM0_PRESETS[g.presetName];
      if (p) presets.add(p);
      else if (g.name) custom.push(g.name);
    }
    const value = {};
    for (const [name, re] of Object.entries(EXPRESSION_NAMES)) {
      if (presets.has(name)) continue;
      const hit = custom.find((c) => re.test(c));
      if (hit) value[name] = hit;
    }
    aliasMemo = { key, value };
    return value;
  } catch {
    return {};
  }
}

// The clip before any edit, as a VRMA: an FBX converted, locked in place when asked.
function rawVrma(anim) {
  const buf = import_node_fs.readFileSync(import_node_path.join(ORIG, anim.file));
  if (anim.kind === "fbx") return fbxToVrma(buf, { inplace: anim.inplace });
  if (anim.kind === "vrma") return anim.inplace ? gltfInPlace(buf).buf : buf;
  throw new Error("only FBX and VRMA animations can be edited");
}

// The file the pack plays: the original, or — "in place" on — a copy with the hips locked.
// Several animations can share one .glb, so a locked one gets a copy of its own.
function clipFileOf(anim) {
  if (anim.kind === "fbx" && touchedUp(anim)) return `${anim.id}.vrma`;
  return anim.kind === "glb" && anim.inplace ? `${anim.id}.glb` : anim.file;
}

function writeClipFile(anim, srcFile) {
  import_node_fs.mkdirSync(ORIG, { recursive: true });
  const orig = import_node_path.join(ORIG, anim.file);
  if (srcFile) import_node_fs.copyFileSync(srcFile, orig);
  const dst = import_node_path.join(CLIPS, clipFileOf(anim));
  let buf;
  if (touchedUp(anim)) buf = vrmaEdit(rawVrma(anim), editOf(anim));
  else {
    buf = import_node_fs.readFileSync(orig);
    if (anim.inplace) buf = (anim.kind === "fbx" ? fbxInPlace(buf) : gltfInPlace(buf, anim.kind === "glb" ? anim.source : undefined)).buf;
  }
  import_node_fs.writeFileSync(dst, buf);
  anim.clipFile = clipFileOf(anim);
}

function cleanTimes(times) {
  const t = PERIODS.filter((p) => Array.isArray(times) && times.includes(p));
  return t.length && t.length < PERIODS.length ? t : undefined;
}

function importFile({ path, picks, inplace, title, times, expr, fingers }) {
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
      inplace: inplace !== false, enabled: true, speed: 1, times: cleanTimes(times),
      expr: EXPRESSIONS.includes(expr) ? expr : undefined, exprWeight: 1, fingers: Math.max(0, Math.min(60, Number(fingers) || 0)),
      idle: { on: false, weight: 0.15 }, music: { slow: false, mid: false, fast: false }
    };
    writeClipFile(anim, i === 0 ? path : undefined);
    db.anims.push(anim);
    added.push(anim);
  });
  saveDb(db);
  return { added, humanoid: info.humanoid };
}

// ── generating the add-on pack ──────────────────────────────────────────────

// previewId: that animation replaces `greet` — what she plays the moment the avatar starts — so
// "Show" = write the pack with it, restart the avatar, and write the normal pack back right after it
// loaded (the engine reads the pack once on start, so the next start greets as usual).
// period: the part of the day the pack is for — "when bored" and "to music" only take the animations
// ticked for it. Every enabled one keeps its clip and its own state either way.
// quietGreet: a clip of the character's own idle to play instead of her greeting, for a restart
// she should not visibly react to (a new part of the day).
function buildToml(db, previewId, period = currentPeriod(), quietGreet = "", ownPack = !!basePackFile()) {
  const L = [
    "# Generated by the Anim Studio plugin from studio.json — edit animations in Astra → Anim Studio,",
    "# changes made here by hand are overwritten.",
    `# time of day: ${period}`,
    "[animpack]", 'kind = "vrm"', 'name = "Anim Studio"', `uid = "local:${PACK_ID}"`, ""
  ];
  const on = db.anims.filter((a) => a.enabled || a.id === previewId);
  const now = on.filter((a) => atTime(a, period));
  for (const a of on) {
    L.push("[[clips]]", `name = ${tomlStr("as_" + a.id)}   # ${String(a.title).replace(/[\r\n]/g, " ")}`,
      `file = ${tomlStr("clips/" + (a.clipFile || a.file))}`);
    if (a.source) L.push(`source = ${tomlStr(a.source)}`);
    L.push("loop = false", `fade = ${Math.max(0, Math.min(2, Number(a.fade ?? 0.5))).toFixed(2)}`);
    if (a.speed && a.speed !== 1) L.push(`speed = ${Number(a.speed).toFixed(2)}`);
    L.push("");
  }
  // idle and drag are always declared (as empty extensions when nothing is added): the engine checks
  // an add-on on its own too, and every state's `→ idle` / `→ drag` edge must name a state it knows.
  const idle = now.filter((a) => a.idle?.on);
  L.push("[states.idle]", 'merge = "extend"');
  for (const a of idle) L.push("[[states.idle.variants]]", `clip = ${tomlStr("as_" + a.id)}`, `weight = ${Math.max(0.005, Number(a.idle.weight) || 0.15).toFixed(3)}`);
  L.push("", "[states.drag]", 'merge = "extend"', "");
  const [lo, hi] = db.reroll || [20, 35];
  if (db.smoothDance !== false && !ownPack) L.push(...smoothDanceAddon(now, [lo, hi]));
  else for (const band of BANDS) {
    const list = now.filter((a) => a.music?.[band]);
    if (!list.length) continue;
    L.push(`[states.dance_${band}]`, 'merge = "extend"', 'pick = "random"', `reroll_secs = [${lo}, ${hi}]`);
    for (const a of list) L.push(`[[states.dance_${band}.variants]]`, `clip = ${tomlStr("as_" + a.id)}`);
    L.push("");
  }
  if (previewId || quietGreet) {
    L.push("[states.greet]", 'merge = "replace"', `clip = ${tomlStr(previewId ? "as_" + previewId : quietGreet)}`, "loop = false",
      "[[states.greet.transitions]]", 'on = "clip_finished"', 'to = "idle"',
      "[[states.greet.transitions]]", 'on = "dragged"', 'to = "drag"', "");
  }
  // an animation put in her own pack has its state there
  for (const a of on.filter((x) => !x.base)) {
    const st = "as_" + a.id;
    L.push(`[states.${st}]`, `clip = ${tomlStr(st)}`, "loop = false",
      `[[states.${st}.transitions]]`, 'on = "clip_finished"', 'to = "idle"',
      `[[states.${st}.transitions]]`, 'on = "dragged"', 'to = "drag"', "");
  }
  return L.join("\n");
}

function writePack(db, previewId, quietGreet) {
  import_node_fs.mkdirSync(CLIPS, { recursive: true });
  import_node_fs.writeFileSync(import_node_path.join(STUDIO, "animpack.toml"), buildToml(db, previewId, undefined, quietGreet));
  writeBaseFx(db, previewId);
}

// ── smooth dances ───────────────────────────────────────────────────────────
// A dance state with `start`/`end` (an intro and an outro, like the built-in dance_in / dance_out)
// replays them between two dances: she seems to stop, stand idle and start again. And a variant
// that is a `blend` (a loop paced by the music's bpm) never finishes, so the dance never changes.
// "Smooth dances" takes both out of the character's own dance states — each line it touches is kept
// as a comment with a marker, so turning the option off puts the pack back as it was — and gives
// the states a crossfade and a switch interval. A built-in pack cannot be edited: there the add-on
// replaces the dance states that have studio dances with ones made of those dances alone.
var SMOOTH_MARK = "# anim-studio smooth: ";
var SMOOTH_ADD = "   # anim-studio smooth";

function smoothDanceText(text, on, reroll = [20, 35]) {
  // undo first: the pack as it was, then smooth it again if asked
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/).filter((l) => !l.endsWith(SMOOTH_ADD)).map((l) => (l.startsWith(SMOOTH_MARK) ? l.slice(SMOOTH_MARK.length) : l));
  if (!on) return lines.join(eol);
  for (const band of BANDS) {
    const name = `dance_${band}`;
    const at = lines.findIndex((l) => l.trim() === `[states.${name}]`);
    if (at < 0) continue;
    let end = lines.findIndex((l, i) => i > at && /^\s*\[/.test(l) && !l.trim().startsWith(`[[states.${name}.`));
    if (end < 0) end = lines.length;
    const isTable = (l) => /^\s*\[/.test(l);
    let hasReroll = false, hasFade = false;
    for (let i = at + 1; i < end; i++) {
      const l = lines[i];
      if (isTable(l)) break; // the state's own keys end at its first sub-table
      if (/^\s*(start|end)\s*=/.test(l)) lines[i] = SMOOTH_MARK + l;
      if (/^\s*reroll_secs\s*=/.test(l)) hasReroll = true;
      if (/^\s*fade\s*=/.test(l)) hasFade = true;
    }
    // a `blend` variant: the whole [[...variants]] block goes
    for (let i = at + 1; i < end; i++) {
      if (lines[i].trim() !== `[[states.${name}.variants]]`) continue;
      let j = i + 1;
      while (j < end && !isTable(lines[j])) j++;
      if (lines.slice(i + 1, j).some((l) => /^\s*blend\s*=/.test(l))) {
        for (let k = i; k < j; k++) if (lines[k].trim() && !lines[k].trim().startsWith("#")) lines[k] = SMOOTH_MARK + lines[k];
      }
      i = j - 1;
    }
    const add = [];
    if (!hasReroll) add.push(`reroll_secs = [${reroll[0]}, ${reroll[1]}]${SMOOTH_ADD}`);
    if (!hasFade) add.push(`fade = 0.9${SMOOTH_ADD}`);
    lines.splice(at + 1, 0, ...add);
  }
  return lines.join(eol);
}

// A built-in pack: the dance states of the bands that have studio dances, made of those alone.
// Only edges to states the add-on itself declares — the engine checks an add-on on its own too.
function smoothDanceAddon(now, reroll) {
  const L = [];
  const bands = BANDS.filter((b) => now.some((a) => a.music?.[b]));
  for (const band of bands) {
    const st = `dance_${band}`;
    L.push(`[states.${st}]`, 'merge = "replace"', 'pick = "random"', `reroll_secs = [${reroll[0]}, ${reroll[1]}]`, "fade = 0.9");
    for (const a of now.filter((x) => x.music?.[band])) L.push(`[[states.${st}.variants]]`, `clip = ${tomlStr("as_" + a.id)}`);
    for (const other of bands) {
      if (other !== band) L.push(`[[states.${st}.transitions]]`, `on = "music_${other}"`, `to = "dance_${other}"`, "cut = true");
    }
    L.push(`[[states.${st}.transitions]]`, 'on = "music_stop"', 'to = "idle"',
      `[[states.${st}.transitions]]`, 'on = "dragged"', 'to = "drag"',
      `[[states.${st}.transitions]]`, 'on = "idle_timeout"', 'to = "idle"', "");
  }
  return L;
}

// ── a face and an icon over her head while an animation plays ───────────────
// The engine shows neither from a clip: a face comes from a pack effect's `face`, an icon from its
// particles. An effect shows while the body is in one of its `pet_states`, and the engine only
// reaches it through the effect `[interactions.none]` plays (the "hub"). And an add-on may not carry
// effects at all ("those come from the base pack only"), so the studio keeps a block of its own in
// the worn character's OWN pack — between two marker lines, rewritten each time — and adds its
// effects to that pack's hub. A state, not a clip, is what gates them: she has the face and the
// icon when the animation plays as itself (its state `as_<id>`), not as one of the random idle moves
// or dances.
var FX_ICONS = {
  hearts: { prop: "builtin:nayu-anims/heart.png", emit: { offset: [0, 0.02, 0.1], radius: 0.08, arc: [30, 150], depth: 0.05, rate: [3, 4], burst: 3, max: 16, life: [1.2, 1.8], speed: [0.05, 0.1], rise: 0.12, drag: 1, size: [0.045, 0.065], pop: 0.2, fade: 0.45, tilt: [-20, 20], sway: 12, sway_hz: 1.4 } },
  sparkle: { prop: "builtin:nayu-anims/sparkle.png", emit: { axes: "view", shape: "box", offset: [0, 0.08, 0.05], area: [0.42, 0.3], depth: 0.08, rate: [5, 7], burst: 4, max: 14, life: [0.5, 0.9], speed: [0, 0], rise: 0.03, size: [0.05, 0.08], pop: 0.25, fade: 0.25, tilt: [0, 0] } },
  sweat: { prop: "sweat", emit: { axes: "view", shape: "box", offset: [0.1, 0.08, 0.12], area: [0.01, 0.01], depth: 0, rate: [0.7, 0.9], burst: 1, max: 2, life: [1.6, 2], speed: [0, 0], rise: -0.03, size: [0.06, 0.07], pop: 0.15, fade: 0.4, tilt: [-10, -10] } },
  zzz: { prop: "zzz", emit: { axes: "view", shape: "box", offset: [0.1, 0.12, 0.12], area: [0.02, 0.02], depth: 0, rate: [1.2, 1.5], burst: 1, max: 5, life: [1.8, 2.2], speed: [0, 0], rise: 0.1, wind: [0.04, 0.06], size: [0.06, 0.09], pop: 0.2, fade: 0.5, tilt: [-15, 15], sway: 8, sway_hz: 0.8 } },
  question: { prop: "question", emit: { axes: "view", shape: "box", offset: [0, 0.22, 0.1], area: [0.16, 0.03], depth: 0, rate: [0.9, 1.2], burst: 1, max: 3, life: [1.5, 2], speed: [0, 0], rise: 0.03, size: [0.08, 0.1], pop: 0.3, fade: 0.4, tilt: [-15, 15], sway: 10, sway_hz: 1 } },
  tears: { prop: "builtin:nayu-anims/rain_drop.png", emit: { axes: "view", shape: "box", offset: [0, 0, 0.13], area: [0.07, 0.005], depth: 0, rate: [2.5, 3.5], max: 8, life: [0.6, 0.8], speed: [0, 0], rise: 0, fall: [0.25, 0.4], size: [0.035, 0.045], pop: 0, appear: 0.1, fade: 0.2, tilt: [0, 0] } },
  notes: { prop: "note", emit: { offset: [0, 0.06, 0.02], radius: 0.2, arc: [10, 170], depth: 0.05, rate: [1.5, 2.2], burst: 2, max: 8, life: [1.6, 2.2], speed: [0.02, 0.05], rise: 0.1, drag: 1, size: [0.06, 0.08], pop: 0.2, fade: 0.5, tilt: [-25, 25], sway: 15, sway_hz: 1.2 } },
  anger: { prop: "anger", emit: { axes: "view", shape: "box", offset: [0.11, 0.14, 0.14], area: [0.03, 0.03], depth: 0, rate: [1.6, 2], burst: 1, max: 2, life: [0.55, 0.7], speed: [0, 0], rise: 0, size: [0.1, 0.12], pop: 0.35, fade: 0.2, tilt: [-10, 10] } }
};
// counts are integers in the engine's schema, every other number a float (a TOML `1` is not a float)
var FX_INTS = new Set(["burst", "max"]);
var fnum = (x) => { const t = String(Math.round(Number(x) * 1000) / 1000); return t.includes(".") ? t : t + ".0"; };
var tomlVal = (v, k = "") => (typeof v === "string" ? tomlStr(v) : FX_INTS.has(k) ? String(Math.round(v))
  : Array.isArray(v) ? `[${v.map(fnum).join(", ")}]` : fnum(v));
var fxPropName = (p) => "as_fx_" + (p.startsWith("builtin:") ? p.replace(/^.*\/(\w+)\.png$/, "$1") : p);

// The face an effect can hold: one preset for the whole animation — the strongest of the editor's
// face keys when it has them (they are written into the VRMA too, which the engine does not show),
// else the expression picked in the list.
function fxFace(a) {
  let best = null;
  for (const [preset, keys] of Object.entries(a.edit?.face || {})) {
    if (!EXPRESSIONS.includes(preset)) continue;
    for (const [, w] of keys || []) if (!best || w > best.weight) best = { preset, weight: w };
  }
  if (best) return best.weight > 0 ? { preset: best.preset, weight: Math.min(1, best.weight) } : null;
  return EXPRESSIONS.includes(a.expr) ? { preset: a.expr, weight: Math.max(0.1, Math.min(1, Number(a.exprWeight) || 1)) } : null;
}

// the own pack a character plays from — null when it is built in or missing
function basePackFile(charId = activeCharacter()) {
  try {
    const c = readCharacter(charId);
    if (!c.animpack || c.animpack.includes(":")) return null;
    const f = import_node_path.join(PACK_ROOT, "animpacks", c.animpack, "animpack.toml");
    return import_node_fs.existsSync(f) ? f : null;
  } catch {
    return null;
  }
}

// ── a character's own pack ──────────────────────────────────────────────────
// A character on a built-in pack (compiled into Astra) cannot take animations into it, and a copy of
// the character still names that pack. It gets one of its own the way Astra's forks are made: the
// built-in pack's text, read from the avatar engine, every clip named by reference
// (builtin:<pack>/<clip> — the same bytes play), saved as a pack on disk beside the others.

// the pack a character plays: "" for none named, which for a VRM body is the built-in 3D one
const packOf = (c) => c.animpack || (c.kind === "vrm" ? "builtin:nayu-anims" : "");

// whether the worn character can be given its own pack (it is on disk and plays a built-in one)
function canMakeOwnPack(charId = activeCharacter()) {
  try {
    const c = readCharacter(charId);
    return c.kind === "vrm" && packOf(c).startsWith("builtin:");
  } catch {
    return false;
  }
}

// Astra's avatar engine, where the built-in packs live: next to Astra's own program (this plugin's
// parent), else where Astra installs itself
function engineFile() {
  const dirs = [];
  try {
    const exe = import_node_child_process.execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
      `(Get-CimInstance Win32_Process -Filter "ProcessId=${process.ppid}").ExecutablePath`],
      { encoding: "utf8", windowsHide: true, timeout: 20000 }).trim();
    if (exe) dirs.push(import_node_path.dirname(exe));
  } catch {}
  dirs.push(import_node_path.join(process.env.LOCALAPPDATA || "", "Programs", "Astra"));
  for (const d of dirs) {
    const f = import_node_path.join(d, "astra-avatar-engine.exe");
    if (import_node_fs.existsSync(f)) return f;
  }
  throw new Error("Не нашёл программу аватара Astra (astra-avatar-engine.exe)");
}

// In the engine each built-in pack is stored as its id, its name and its text, one after another,
// and every text opens with "# The built-in …".
function builtinPackText(pack) {
  const bin = import_node_fs.readFileSync(engineFile());
  const id = Buffer.from(pack), marker = Buffer.from("# The built-in ");
  const isText = (b) => b === 9 || b === 10 || b === 13 || (b >= 32 && b !== 127);
  for (let from = 0; ; ) {
    const at = bin.indexOf(id, from);
    if (at < 0) break;
    from = at + 1;
    const start = bin.indexOf(marker, at);
    if (start < 0 || start - at > 200) continue;
    let end = start;
    while (end < bin.length && isText(bin[end])) end++;
    const next = bin.indexOf(marker, start + 1);
    if (next > 0 && next < end) end = next;
    let text = bin.subarray(start, end).toString("utf8");
    // the next pack's id and name run on after this one's last line
    const nl = text.lastIndexOf("\n");
    if (nl > 0 && !/[=#\]]/.test(text.slice(nl + 1))) text = text.slice(0, nl + 1);
    if (/^\[animpack\]/m.test(text) && /^\[\[clips\]\]/m.test(text) && /^kind\s*=\s*"vrm"/m.test(text)) return text;
  }
  throw new Error("Не нашёл встроенный набор в Astra — возможно, у тебя другая версия Astra");
}

function makeOwnPack(charId = activeCharacter()) {
  const c = readCharacter(charId);
  const pack = packOf(c);
  if (c.kind !== "vrm" || !pack.startsWith("builtin:")) throw new Error("У этого персонажа уже свой набор анимаций");
  const base = builtinPackText(pack);
  const stem = (charId.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "character") + "-anims";
  let id = stem;
  for (let n = 2; import_node_fs.existsSync(import_node_path.join(PACK_ROOT, "animpacks", id)); n++) id = `${stem}-${n}`;
  const text = `# ${c.name}: its own copy of Astra's built-in pack "${pack}", made by Anim Studio. Every clip is\n`
    + `# taken from the built-in pack by reference (${pack}/<clip>), so it plays exactly the same; the studio's\n`
    + `# animations can be added to it.\n\n`
    + base.replace(/^(\s*file\s*=\s*")clips\//gm, `$1${pack}/`)
      .replace(/^(\[animpack\][\s\S]*?^name\s*=\s*)"[^"]*"/m, `$1${tomlStr(c.name + " (Anim Studio)")}\nuid = ${tomlStr("local:" + id)}`);
  const dir = import_node_path.join(PACK_ROOT, "animpacks", id);
  import_node_fs.mkdirSync(dir, { recursive: true });
  import_node_fs.writeFileSync(import_node_path.join(dir, "animpack.toml"), text);
  // the character plays it from now on; its file as it was is kept beside it
  const backup = c.file + ".before-own-pack";
  if (!import_node_fs.existsSync(backup)) import_node_fs.writeFileSync(backup, c.text);
  const next = /^\s*animpack\s*=/m.test(c.text)
    ? c.text.replace(/^(\s*animpack\s*=\s*)"[^"]*"/m, `$1${tomlStr(id)}`)
    : c.text.replace(/^(\s*kind\s*=\s*"[^"]*"[^\n]*\n)/m, `$1animpack = ${tomlStr(id)}\n`);
  import_node_fs.writeFileSync(c.file, next);
  return { id, name: c.name };
}

var FX_BEGIN = "# ── Anim Studio: faces and icons (written by the plugin, rewritten on every Apply) ──";
var FX_END = "# ── end of Anim Studio ──";
var FX_DIR = "clips/anim-studio-fx";

// The effect [interactions.none] plays in a pack — "" when it has none. No text: the worn one's pack.
function fxHub(text = "") {
  if (!text) {
    try {
      const f = basePackFile();
      text = f ? import_node_fs.readFileSync(f, "utf8") : "";
    } catch {
      text = "";
    }
  }
  const at = text.search(/^\[interactions\.none\]/m);
  if (at < 0) return "";
  const rest = text.slice(at + 1);
  const end = rest.search(/^\[/m);
  return /^\s*clip\s*=\s*"([^"]+)"/m.exec(end < 0 ? rest : rest.slice(0, end))?.[1] || "";
}

// the rows that give each animation its face and icon
function fxToml(anims, previewId = "") {
  const withFx = anims.filter((a) => FX_ICONS[a.fx] || fxFace(a));
  if (!withFx.length) return [];
  const L = [];
  const props = new Set(withFx.map((a) => FX_ICONS[a.fx]?.prop).filter(Boolean));
  if (withFx.some((a) => !FX_ICONS[a.fx])) props.add(FX_ICONS.hearts.prop); // a face alone still names a prop
  for (const p of props) L.push("[[props]]", `name = ${tomlStr(fxPropName(p))}`, `file = ${tomlStr(p.startsWith("builtin:") ? p : `${FX_DIR}/${p}.png`)}`, "");
  for (const a of withFx) {
    const fx = FX_ICONS[a.fx];
    const name = `as_fx_${a.id}`;
    // with no `emit` table nothing is thrown: the face alone
    // shown instead of the greeting (▶, a reaction, the time of day), it plays in `greet`
    const states = [`as_${a.id}`, ...(a.id === previewId ? ["greet"] : [])];
    L.push(`[effects.${name}]`, 'kind = "emit"', `prop = ${tomlStr(fxPropName(fx ? fx.prop : FX_ICONS.hearts.prop))}`,
      `pet_states = [${states.map(tomlStr).join(", ")}]`, "fade_in = 0.3", "fade_out = 0.6");
    if (fx) {
      L.push(`[effects.${name}.emit]`, 'bone = "head"');
      for (const [k, v] of Object.entries(fx.emit)) L.push(`${k} = ${tomlVal(v, k)}`);
    }
    const face = fxFace(a);
    if (face) L.push(`[effects.${name}.face]`, `preset = ${tomlStr(face.preset)}`, `weight = ${tomlVal(face.weight)}`);
    L.push("");
  }
  return L;
}

var reEscape = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
var BASE_DIR = "clips/anim-studio";

// "В набор персонажа": the animation as a clip and a state of her OWN pack, so Astra lists it (Model →
// Animations) and its triggers and commands cue it live — they only know the states of that pack.
// The clip is named `asb_<id>` (the add-on keeps `as_<id>` for its idle and dance variants); the
// state is the same `as_<id>` the add-on would have declared, so nothing that names it changes.
function baseToml(anims, text) {
  const L = [];
  const has = (st) => new RegExp(`^\\[states\\.${st}\\]`, "m").test(text);
  for (const a of anims.filter((x) => x.base)) {
    L.push("[[clips]]", `name = ${tomlStr("asb_" + a.id)}   # ${String(a.title).replace(/[\r\n]/g, " ")}`,
      `file = ${tomlStr(`${BASE_DIR}/${a.clipFile || a.file}`)}`);
    if (a.source) L.push(`source = ${tomlStr(a.source)}`);
    L.push("loop = false", `fade = ${Math.max(0, Math.min(2, Number(a.fade ?? 0.5))).toFixed(2)}`);
    if (a.speed && a.speed !== 1) L.push(`speed = ${Number(a.speed).toFixed(2)}`);
    const st = "as_" + a.id;
    L.push("", `[states.${st}]`, `clip = ${tomlStr("asb_" + a.id)}`, "loop = false");
    if (has("idle")) L.push(`[[states.${st}.transitions]]`, 'on = "clip_finished"', 'to = "idle"');
    if (has("drag")) L.push(`[[states.${st}.transitions]]`, 'on = "dragged"', 'to = "drag"');
    L.push("");
  }
  return L;
}

// A base pack's text with the studio's part as it should be: the old block cut out, "as_fx_…" names
// dropped from the hub's `with`, then today's put back. Faces and icons need the hub; animations put
// in the pack do not. "" when the pack can take nothing.
function withBaseFx(text, anims, previewId = "") {
  let t = text;
  const b = t.indexOf(FX_BEGIN);
  if (b >= 0) {
    const e = t.indexOf(FX_END, b);
    t = t.slice(0, b).replace(/\n+$/, "\n") + (e >= 0 ? t.slice(e + FX_END.length).replace(/^\n+/, "") : "");
  }
  const hub = fxHub(t);
  const head = hub ? new RegExp(`^\\[effects\\.${reEscape(hub)}\\][ \\t]*$`, "m").exec(t) : null;
  let fxRows = [];
  if (head) {
    const names = anims.filter((a) => FX_ICONS[a.fx] || fxFace(a)).map((a) => `as_fx_${a.id}`);
    const from = head.index + head[0].length;
    const next = t.slice(from).search(/^\[/m);
    const until = next < 0 ? t.length : from + next;
    let table = t.slice(from, until);
    const w = /^with\s*=\s*\[([^\]\n]*)\][ \t]*$/m.exec(table);
    const kept = w ? [...w[1].matchAll(/"([^"]*)"/g)].map((m) => m[1]).filter((n) => !n.startsWith("as_fx_")) : [];
    const all = [...kept, ...names];
    const line = all.length ? `with = [${all.map(tomlStr).join(", ")}]` : "";
    if (w) table = line ? table.replace(w[0], line) : table.replace(new RegExp(`${reEscape(w[0])}\\r?\\n?`), "");
    else if (line) table = `\n${line}${table}`;
    t = t.slice(0, from) + table + t.slice(until);
    fxRows = fxToml(anims, previewId);
  }
  if (!head && b < 0 && !anims.some((a) => a.base)) return "";
  const rows = [...baseToml(anims, t), ...fxRows];
  if (rows.length) t = `${t.replace(/\n+$/, "\n")}\n${FX_BEGIN}\n${rows.join("\n")}\n${FX_END}\n`;
  return t;
}

// Write the block into the own pack of every character wearing the studio (a pack two of them share
// gets it once), with the files it names: icons, and the clips of the animations put in it. The
// first time a pack is touched, a copy of it is kept beside it.
function writeBaseFx(db, previewId) {
  const anims = db.anims.filter((a) => a.enabled || a.id === previewId);
  const files = new Set();
  for (const c of listCharacters().list) {
    if (!c.attached) continue;
    const f = basePackFile(c.id);
    if (f) files.add(f);
  }
  for (const f of files) {
    try {
      const text = import_node_fs.readFileSync(f, "utf8");
      const next = smoothDanceText(withBaseFx(text, anims, previewId) || text, db.smoothDance !== false, db.reroll || [20, 35]);
      const root = import_node_path.dirname(f);
      // her clips first, so the pack never names a file that is not there yet
      const clipDir = import_node_path.join(root, ...BASE_DIR.split("/"));
      const want = new Set([...next.matchAll(new RegExp(`^file = "${reEscape(BASE_DIR)}/([^"]+)"`, "gm"))].map((m) => m[1]));
      if (want.size) import_node_fs.mkdirSync(clipDir, { recursive: true });
      for (const n of want) {
        const src = import_node_path.join(CLIPS, n), dst = import_node_path.join(clipDir, n);
        const s = import_node_fs.statSync(src);
        const d = import_node_fs.existsSync(dst) ? import_node_fs.statSync(dst) : null;
        if (!d || d.size !== s.size || d.mtimeMs < s.mtimeMs) import_node_fs.copyFileSync(src, dst);
      }
      if (next !== text) {
        const backup = `${f}.before-anim-studio`; // not *.toml: nothing should take it for a pack
        if (!import_node_fs.existsSync(backup)) import_node_fs.copyFileSync(f, backup);
        const dir = import_node_path.join(root, ...FX_DIR.split("/"));
        const used = [...next.matchAll(new RegExp(`^file = "${reEscape(FX_DIR)}/(\\w+)\\.png"`, "gm"))].map((m) => m[1]);
        if (used.length) import_node_fs.mkdirSync(dir, { recursive: true });
        for (const n of used) {
          const png = import_node_path.join(dir, `${n}.png`);
          if (!import_node_fs.existsSync(png)) import_node_fs.writeFileSync(png, Buffer.from(FX_SPRITES[n], "base64"));
        }
        import_node_fs.writeFileSync(f, next);
      }
      // clips of animations no longer in the pack go (only from the studio's own folder)
      if (import_node_fs.existsSync(clipDir)) {
        for (const n of import_node_fs.readdirSync(clipDir)) if (!want.has(n)) import_node_fs.rmSync(import_node_path.join(clipDir, n), { force: true });
      }
    } catch {
      // the pack stays as it was: these are not worth breaking her own pack for
    }
  }
}

// The first clip of the idle of the pack the worn character plays — "" when it is built in or unreadable.
function ownIdleClip() {
  try {
    const c = readCharacter(activeCharacter());
    if (!c.animpack || c.animpack.includes(":")) return "";
    const t = import_node_fs.readFileSync(import_node_path.join(PACK_ROOT, "animpacks", c.animpack, "animpack.toml"), "utf8");
    const at = t.search(/^\[states\.idle\]/m);
    if (at < 0) return "";
    const rest = t.slice(at + 1);
    const end = rest.search(/^\[(?!\[?states\.idle[.\]])/m);
    return /^\s*clip\s*=\s*"([^"]+)"/m.exec(end < 0 ? rest : rest.slice(0, end))?.[1] || "";
  } catch {
    return "";
  }
}

// the part of the day the pack on disk was written for ("" — none yet, or written before 1.1)
function packPeriod() {
  try {
    return /^# time of day: (\w+)/m.exec(import_node_fs.readFileSync(import_node_path.join(STUDIO, "animpack.toml"), "utf8"))?.[1] || "";
  } catch {
    return "";
  }
}

// Does moving from one part of the day to another change what she plays when bored / to music?
function timeMatters(db, from, to) {
  return db.anims.some((a) => a.enabled && (a.idle?.on || BANDS.some((b) => a.music?.[b])) && (from ? atTime(a, from) !== atTime(a, to) : !!cleanTimes(a.times)));
}

// first use: nobody wears the studio yet — attach it to the character worn now
function ensureAttached(db) {
  const chars = listCharacters();
  if (db.anims.length && !chars.list.some((c) => c.attached) && chars.list.some((c) => c.active)) setAttached(chars.active, true);
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
  return { id, file, text, name: get("name") || id, kind: get("kind"), animpack: get("animpack"), model: get("model"), addons };
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

// where the daemon log ends now, to read what it says from here on
function logMark() {
  try {
    const log = latestLog();
    return { log, start: import_node_fs.statSync(log).size };
  } catch {
    return null;
  }
}

function logSince(mark) {
  try {
    const fd = import_node_fs.openSync(mark.log, "r");
    const size = import_node_fs.fstatSync(fd).size;
    const buf = Buffer.alloc(Math.max(0, size - mark.start));
    import_node_fs.readSync(fd, buf, 0, buf.length, mark.start);
    import_node_fs.closeSync(fd);
    return buf.toString("utf8");
  } catch {
    return "";
  }
}

async function restartAvatar() {
  const mark = logMark();
  await powershell("Stop-Process -Name astra-avatar-engine -Force -ErrorAction SilentlyContinue").catch(() => {});
  if (!mark) return { ok: true, note: "" };
  // Astra spaces restarts out — 20-30 s after a few in a row — so the engine may take a while
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 750));
    const fresh = logSince(mark);
    const loaded = /\[manifest\] loaded .*playing '([^']*)' \((\d+) clips\)/.exec(fresh);
    if (loaded) {
      const problems = fresh.split(/\r?\n/).filter((l) => /as_|anim-studio/.test(l) && /(warn|error|invalid|unknown|cannot|refused|missing|skipped)/i.test(l))
        .map((l) => l.replace(/^.*?\[(anim|manifest|animpacks)\]/, "[$1]").slice(0, 300));
      return { ok: true, pack: loaded[1], clips: Number(loaded[2]), problems };
    }
  }
  return { ok: false, note: "timeout" };
}

// One avatar restart at a time: Apply, Show and the time-of-day switch all write the pack first.
var avatarBusy = false;

async function withAvatar(fn) {
  while (avatarBusy) await sleep(300);
  avatarBusy = true;
  try {
    return await fn();
  } finally {
    avatarBusy = false;
  }
}

// The avatar restart running for the page, if any: { id, done, result }.
var job = null;

function startJob(fn) {
  if (job && !job.done) return { id: job.id, busy: true };
  const j = { id: globalThis.crypto.randomUUID(), done: false, result: null };
  job = j;
  Promise.resolve().then(fn).then((r) => (j.result = r), (e) => (j.result = { ok: false, note: String(e?.message || e) }))
    .finally(() => (j.done = true));
  return { id: j.id };
}

// The engine plays `greet` the moment it starts: write the pack with this animation as the greeting,
// restart, and put the normal pack back once it has loaded.
function showInsteadOfGreeting(id) {
  return withAvatar(async () => {
    const db = loadDb();
    if (!db.anims.some((x) => x.id === id)) throw new Error("not found");
    ensureAttached(db);
    writePack(db, id);
    try {
      return await restartAvatar();
    } finally {
      writePack(db);
    }
  });
}

// ── watching activity: time since the last input and the foreground process ─
// Only these two are read — never the keys themselves. A long-lived PowerShell child reports them
// every 2 s; the same watcher drives Dota Coach's work mode.
var GAMES = new Set(["dota2", "cs2", "valorant", "valorant-win64-shipping", "deadlock", "project8", "genshinimpact",
  "cyberpunk2077", "robloxplayerbeta", "javaw", "eldenring"]);
var WATCH_PS = `
Add-Type 'using System;using System.Runtime.InteropServices;public class AI{[StructLayout(LayoutKind.Sequential)]public struct L{public uint cb;public uint t;}[DllImport("user32.dll")]public static extern bool GetLastInputInfo(ref L l);[DllImport("user32.dll")]public static extern IntPtr GetForegroundWindow();[DllImport("user32.dll")]public static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);}'
while ($true) {
  $l = New-Object AI+L; $l.cb = 8; [AI]::GetLastInputInfo([ref]$l) | Out-Null
  $idle = ([uint32]([Environment]::TickCount -band 0xFFFFFFFF) - $l.t) -band 0xFFFFFFFF
  $fp = 0; [AI]::GetWindowThreadProcessId([AI]::GetForegroundWindow(), [ref]$fp) | Out-Null
  $n = (Get-Process -Id $fp -ErrorAction SilentlyContinue).ProcessName
  [Console]::Out.WriteLine("$idle|$n"); [Console]::Out.Flush()
  Start-Sleep -Seconds 2
}`;
var activity = { idleSec: 0, proc: "", seen: false };

function startWatch(ctx) {
  const child = import_node_child_process.spawn("powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", WATCH_PS],
    { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
  child.unref(); // the watcher never keeps the plugin process alive by itself
  child.stdout.unref?.();
  let buf = "";
  child.stdout.on("data", (chunk) => {
    buf += chunk.toString();
    const lines = buf.split(/\r?\n/);
    buf = lines.pop();
    for (const line of lines) {
      const [idleStr, proc = ""] = line.trim().split("|");
      const idleSec = Number(idleStr) / 1000;
      if (!Number.isFinite(idleSec)) continue;
      activity = { idleSec, proc: proc.toLowerCase(), seen: true };
      lifeTick(ctx).catch(() => {});
    }
  });
  child.on("exit", () => setTimeout(() => startWatch(ctx), 10000).unref()); // died — start again
}

// ── time of day: rewrite the pack when the part of the day changes ──────────
// The engine reads the pack once on start, so a new part of the day costs an avatar restart. It waits
// until nobody has touched the computer for a minute, and her greeting is swapped for her own idle
// for that one start, so she does not wave at nobody.
var TIME_SWITCH_IDLE_SEC = 60;

async function timeTick() {
  if (avatarBusy) return;
  const db = loadDb();
  const now = currentPeriod();
  const was = packPeriod();
  const outfit = await outfitWanted(db, now).catch(() => "");
  const packChange = was !== now && timeMatters(db, was, now);
  if (!packChange && !outfit) return;
  const worn = listCharacters().list.some((c) => c.active && c.attached);
  if ((worn || outfit) && activity.seen && activity.idleSec < TIME_SWITCH_IDLE_SEC) return;
  await withAvatar(async () => {
    if (outfit) wearOutfit(db, outfit);
    const onNow = listCharacters().list.some((c) => c.active && c.attached);
    if (!onNow && !outfit) return writePack(db);
    writePack(db, undefined, ownIdleClip());
    try {
      await restartAvatar();
    } finally {
      writePack(db);
    }
  });
}

// ── outfit: another character (her other outfits) by the part of the day and the weather ──
// Weather comes from Open-Meteo (free, no key): only the coordinates of the place are sent. The place
// is Astra's own weather location when one is set, else the city typed on the page.
var WEATHER_EVERY_MS = 20 * 60000;
var weather = { at: 0, kind: "", key: "" };

function weatherKind(code) {
  if (code >= 95) return "storm";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if (code <= 1) return "clear";
  return "cloud"; // 2-3 cloudy, 45/48 fog
}

function weatherPlace(db) {
  try {
    const g = JSON.parse(import_node_fs.readFileSync(import_node_path.join(CFG, "settings.json"), "utf8")).general || {};
    if (g.weather_location_lat || g.weather_location_lon) return { name: g.weather_location_name || "Astra", lat: g.weather_location_lat, lon: g.weather_location_lon, fromAstra: true };
  } catch {}
  return db.outfit.place;
}

async function weatherNow(db) {
  const place = weatherPlace(db);
  if (!place) return "";
  const key = `${place.lat},${place.lon}`;
  if (weather.key === key && Date.now() - weather.at < WEATHER_EVERY_MS) return weather.kind;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${Number(place.lat).toFixed(3)}&longitude=${Number(place.lon).toFixed(3)}&current=weather_code`;
  const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
  const code = (await r.json())?.current?.weather_code;
  weather = { at: Date.now(), kind: Number.isFinite(code) ? weatherKind(code) : "", key };
  return weather.kind;
}

// the character the rules ask for now, when that differs from what they asked for last time; else ""
async function outfitWanted(db, period) {
  const o = db.outfit;
  if (!o.on) return "";
  const kind = Object.values(o.weather).some(Boolean) ? await weatherNow(db).catch(() => "") : "";
  const want = (kind && o.weather[kind]) || o.time[period] || "";
  if (!want || want === o.last) return "";
  if (want === activeCharacter()) {
    o.last = want;
    saveDb(db);
    return "";
  }
  return listCharacters().list.some((c) => c.id === want) ? want : "";
}

// companion.toml `[pet] character = "…"` — the one place the worn character is written
function wearOutfit(db, id) {
  const file = import_node_path.join(PACK_ROOT, "companion.toml");
  const text = import_node_fs.readFileSync(file, "utf8");
  const before = activeCharacter();
  if (!/^\s*character\s*=\s*"[^"]*"/m.test(text)) throw new Error("companion.toml has no `character =` line");
  if (!import_node_fs.existsSync(file + ".before-anim-studio")) import_node_fs.copyFileSync(file, file + ".before-anim-studio");
  import_node_fs.writeFileSync(file, text.replace(/^(\s*character\s*=\s*)"[^"]*"/m, `$1${tomlStr(id)}`));
  // the studio's animations go with her to the new outfit when the old one wore them
  const chars = listCharacters().list;
  if (chars.find((c) => c.id === before)?.attached && !chars.find((c) => c.id === id)?.attached) setAttached(id, true);
  db.outfit.last = id;
  saveDb(db);
}

// a city typed on the page → its coordinates (Open-Meteo geocoding)
async function findPlace(name) {
  const lang = /[а-яё]/i.test(name) ? "ru" : "en";
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=${lang}`;
  const hit = (await (await fetch(url, { signal: AbortSignal.timeout(10000) })).json())?.results?.[0];
  if (!hit) throw new Error("not found");
  return { name: [hit.name, hit.country].filter(Boolean).join(", "), lat: hit.latitude, lon: hit.longitude };
}

// ── life: behaviour by the time of day (moved here from Dota Coach) ─────────
// In the morning (the first time that day) she stretches and says good morning, after a long absence
// she waves, in the evening she yawns now and then, after midnight she yawns and hints it is time to
// sleep. Silent in games; in Dota Coach's work mode she only talks and does not get up.
var LIFE_PHRASES = {
  ru: {
    morning: ["Доброе утро! Потягушки — и за дела.", "Утро доброе! Я уже проснулась… почти.", "Привет! Как спалось?",
      "С добрым утром! Чай или кофе для начала?"],
    back: ["О, ты вернулся! Я скучала.", "С возвращением!", "А вот и ты. Без тебя тут скучно.", "Наконец-то! Я уже заждалась."],
    night: ["Уже поздно… может, спать?", "За полночь. Глаза не устали?", "Я зеваю — значит, и тебе пора отдыхать.",
      "Завтра будет новый день. Может, на сегодня хватит?", "Сова ты моя… Давай ещё чуть-чуть — и спать?"]
  },
  en: {
    morning: ["Good morning! A little stretch — and let's go.", "Morning! I'm awake… almost.", "Hi! Did you sleep well?",
      "Good morning! Tea or coffee to start?"],
    back: ["Oh, you're back! I missed you.", "Welcome back!", "There you are. It's boring here without you.", "Finally! I've been waiting."],
    night: ["It's late… maybe bed?", "Past midnight. Eyes not tired?", "I'm yawning — so you should rest too.",
      "Tomorrow is a new day. Maybe that's enough for today?", "My night owl… a little more and then sleep?"]
  }
};
var AWAY_SEC = 1200;
var WORK_FLAG = import_node_path.join(process.env.APPDATA || "", "astra", "work_mode.on");
var life = { away: true, morningDay: "", lastBack: 0, nextYawn: 0 };
var pick = (a) => a[Math.floor(Math.random() * a.length)];
var minutes = (lo, hi) => (lo + Math.random() * (hi - lo)) * 60000;

async function lifeReact(ctx, cfg, phrase, state) {
  const words = LIFE_PHRASES[ctx.language === "ru" ? "ru" : "en"];
  if (phrase && cfg.voice) await ctx.fireTrigger("anim_say", { text: pick(words[phrase]) }).catch(() => {});
  // in work mode she sits and types — standing up for a stretch would break that
  const working = import_node_fs.existsSync(WORK_FLAG) && activity.idleSec < 30;
  if (!state || working) return;
  // Astra's commands cue only the states of her own pack; a studio animation is shown the way Show does
  // it — a quick restart with it in place of her greeting (not awaited: the watcher must not stall)
  const inPack = loadDb().anims.some((a) => "as_" + a.id === state && a.base && a.enabled);
  if (state.startsWith("as_") && !inPack) showInsteadOfGreeting(state.slice(3)).catch(() => {});
  else await ctx.fireTrigger("anim_play", { state }).catch(() => {});
}

async function lifeTick(ctx) {
  const cfg = loadDb().life;
  if (!cfg.on) return;
  const { idleSec, proc } = activity;
  if (idleSec >= AWAY_SEC) {
    life.away = true;
    return;
  }
  if (idleSec > 60) return;
  const now = Date.now();
  const d = new Date();
  const h = d.getHours();
  const day = d.toDateString();
  if (GAMES.has(proc)) {
    life.away = false;
    return;
  }
  if (life.away) {
    life.away = false;
    if (periodOf(h) === "morning" && life.morningDay !== day) {
      life.morningDay = day;
      await lifeReact(ctx, cfg, "morning", cfg.morning);
    } else if (now - life.lastBack > 2 * 3600000) {
      life.lastBack = now;
      await lifeReact(ctx, cfg, "back", cfg.back);
    }
    return;
  }
  const late = periodOf(h) === "night";
  const evening = h >= 22;
  if (!late && !evening) {
    life.nextYawn = 0;
    return;
  }
  if (!life.nextYawn) {
    life.nextYawn = now + (late ? minutes(50, 70) : minutes(60, 90));
    return;
  }
  if (now < life.nextYawn) return;
  life.nextYawn = now + (late ? minutes(50, 70) : minutes(60, 90));
  if (late) await lifeReact(ctx, cfg, "night", cfg.night);
  else await lifeReact(ctx, cfg, "", cfg.evening);
}

// ── the two Astra commands that act on this plugin's triggers ───────────────
// Astra reads commands.json when it starts and does not write it back on its own, so the commands are
// added to the file and appear after Astra is restarted.
var COMMANDS = import_node_path.join(CFG, "commands.json");
var TRIGGER_PREFIX = "plugin__anim_studio__";

function commandSpecs(ru) {
  return [
    { trigger: "anim_play", name: ru ? "Anim Studio: сыграть анимацию" : "Anim Studio: play an animation",
      action: { mode: "state", state: "{state}", trigger: "", type: "companion_animation" } },
    { trigger: "anim_say", name: ru ? "Anim Studio: сказать фразу" : "Anim Studio: say a phrase",
      action: { text: "{text}", tts_pitch: 1, tts_speed: 0.85, type: "speak", use_settings_voice: false, voices: {} } }
  ];
}
var COMMAND_TRIGGERS = ["anim_play", "anim_say"];

function readCommands() {
  try {
    return JSON.parse(import_node_fs.readFileSync(COMMANDS, "utf8").replace(/^﻿/, ""));
  } catch {
    return null;
  }
}

function commandsStatus(ctx) {
  const list = readCommands() || [];
  const active = [...(ctx?.activeTriggers || [])];
  const out = {};
  for (const t of COMMAND_TRIGGERS) {
    const inFile = list.some((c) => (c.triggers || []).some((x) => x.handler_id === TRIGGER_PREFIX + t));
    out[t] = { inFile, listening: active.some((a) => a === t || a === TRIGGER_PREFIX + t) };
  }
  return out;
}

function createCommands(ctx) {
  const list = readCommands();
  if (!Array.isArray(list)) throw new Error(`cannot read ${COMMANDS}`);
  const have = commandsStatus(ctx);
  const stamp = new Date().toISOString();
  let added = 0;
  commandSpecs(ctx?.language === "ru").forEach((spec, i) => {
    if (have[spec.trigger].inFile) return;
    const handler = TRIGGER_PREFIX + spec.trigger;
    const t = Date.now() + i;
    const tn = `node_1_${t}`, an = `node_2_${t}`, edge = `xy-edge__${tn}-${an}`;
    list.push({
      actions: [spec.action], created_at: stamp, description: "Created by the Anim Studio plugin", editor_mode: "graph",
      enabled: true, execution: {}, id: globalThis.crypto.randomUUID(), name: spec.name, priority: 4,
      slash_description: "", slash_enabled: false, tags: [],
      triggers: [{ config: {}, handler_id: handler, type: "dynamic" }], updated_at: stamp,
      workflow: {
        edge_order: [edge],
        edges: { [edge]: { id: edge, source_node: tn, source_port: "default", target_node: an, target_port: "default" } },
        nodes: {
          [tn]: { data: { config: {}, trigger_type: handler }, id: tn, label: "", node_type: "trigger", position_x: 0, position_y: 0 },
          [an]: { data: { action: spec.action, action_type: spec.action.type, config: spec.action, wait_for_completion: "false" },
            id: an, label: "", node_type: "action", position_x: 360, position_y: 0 }
        }
      }
    });
    added++;
  });
  if (added) {
    if (!import_node_fs.existsSync(COMMANDS + ".before-anim-studio")) import_node_fs.copyFileSync(COMMANDS, COMMANDS + ".before-anim-studio");
    import_node_fs.writeFileSync(COMMANDS, JSON.stringify(list, null, 2));
  }
  return { added, commands: commandsStatus(ctx) };
}

// ── the editor: the page previews the clip on her own model ─────────────────
// Files go to the page in pieces (a model can be 75 MB): a blob is a token for a buffer or a file.
var blobs = new Map();
var BLOB_CHUNK = 1 << 20;

function putBlob(value) {
  const token = globalThis.crypto.randomUUID();
  blobs.set(token, value);
  if (blobs.size > 12) blobs.delete(blobs.keys().next().value); // the oldest previews go
  const size = Buffer.isBuffer(value) ? value.length : import_node_fs.statSync(value).size;
  return { token, size };
}

function readBlob({ token, offset = 0 }) {
  const v = blobs.get(String(token));
  if (v === undefined) throw new Error("expired");
  if (Buffer.isBuffer(v)) return { data: v.subarray(offset, offset + BLOB_CHUNK).toString("base64") };
  const fd = import_node_fs.openSync(v, "r");
  try {
    const buf = Buffer.alloc(BLOB_CHUNK);
    const n = import_node_fs.readSync(fd, buf, 0, BLOB_CHUNK, offset);
    return { data: buf.subarray(0, n).toString("base64") };
  } finally {
    import_node_fs.closeSync(fd);
  }
}

// the body of the worn character (or the first one wearing the studio)
function editorModel() {
  const chars = listCharacters();
  const id = chars.list.find((c) => c.active)?.id || chars.list.find((c) => c.attached)?.id;
  if (!id) throw new Error("no VRM character to preview on — create one in Astra → Model → Characters");
  const c = readCharacter(id);
  const file = import_node_path.resolve(PACK_ROOT, c.model);
  if (!import_node_fs.existsSync(file)) throw new Error(`model not found: ${file}`);
  return { file, name: c.name };
}

// what the editor may change, from what the page sent
function cleanEdit(e = {}) {
  const num = (x, lo, hi) => Math.max(lo, Math.min(hi, Number(x) || 0));
  const keys = (list, n) => (Array.isArray(list) ? list.filter((k) => Array.isArray(k) && k.length === n).map((k) => k.map(Number)).slice(0, 200) : []);
  const out = {};
  if (e.mirror) out.mirror = true;
  if (Array.isArray(e.trim) && e.trim.length === 2) out.trim = [num(e.trim[0], 0, 3600), num(e.trim[1], 0, 3600)];
  const bones = Object.fromEntries(Object.entries(e.bones || {}).map(([b, k]) => [b, keys(k, 4)]).filter(([b, k]) => /^[a-zA-Z]+$/.test(b) && k.length));
  if (Object.keys(bones).length) out.bones = bones;
  const face = Object.fromEntries(Object.entries(e.face || {}).map(([x, k]) => [x, keys(k, 2)]).filter(([x, k]) => /^[a-zA-Z0-9_]+$/.test(x) && k.length));
  if (Object.keys(face).length) out.face = face;
  return out;
}

// the anim as the editor would leave it: its own settings with the page's changes on top
function editedAnim(a, p = {}) {
  const b = { ...a };
  if ("fingers" in p) b.fingers = Math.max(0, Math.min(60, Number(p.fingers) || 0));
  if ("expr" in p) b.expr = EXPRESSIONS.includes(p.expr) ? p.expr : undefined;
  if ("inplace" in p) b.inplace = !!p.inplace;
  if ("edit" in p) b.edit = cleanEdit(p.edit);
  return b;
}

// ── state for the page ──────────────────────────────────────────────────────

function getState(ctx) {
  const db = loadDb();
  return {
    anims: db.anims, reroll: db.reroll || [20, 35], life: db.life, characters: listCharacters(), folder: STUDIO,
    period: currentPeriod(), periodHours: PERIOD_HOURS, commands: commandsStatus(ctx), outfit: db.outfit,
    fxIcons: Object.keys(FX_ICONS), fxHub: fxHub(), basePack: !!basePackFile(), ownPackable: !basePackFile() && canMakeOwnPack(),
    smoothDance: db.smoothDance
  };
}

export const app = plugin({
  id: "anim-studio",
  tools: {
    anim_studio_list: tool({
      description: "Anim Studio: lists the custom avatar animations the user installed and when each one plays (when bored / to music / its own state as_<id>). Список своих анимаций аватара и когда они играют.",
      input: s.object({}),
      run: async () => JSON.stringify(loadDb().anims.map((a) => ({
        title: a.title, state: "as_" + a.id, enabled: a.enabled, when_bored: a.idle?.on ? a.idle.weight : false,
        music: BANDS.filter((b) => a.music?.[b]), time_of_day: cleanTimes(a.times) || "any", in_character_pack: !!a.base
      })))
    })
  },
  triggers: {
    anim_play: { label: "Anim Studio: avatar plays a state ({state})", fields: [] },
    anim_say: { label: "Anim Studio: phrase to say ({text})", fields: [] }
  },
  onStart: async (ctx) => {
    startWatch(ctx);
    // Astra may have been closed since another part of the day began
    setTimeout(() => timeTick().catch(() => {}), 15000).unref();
    setInterval(() => timeTick().catch(() => {}), 30000).unref();
  },
  ui: {
    contributions: [{
      id: "anim-studio", slot: "page.custom", label: "Anim Studio",
      iconSvg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="4.5" r="2"/><path d="M12 7v6l-3 6M12 13l3 6M7 10l5-2 5 2"/></svg>',
      url: "index.html", width: 0, height: 0, transparent: true
    }],
    onCall: {
      getState: async (_p, ctx) => getState(ctx),
      pickFile: async () => ({
        // a top-most owner keeps the dialog in front of the Astra window
        path: await powershell("[Console]::OutputEncoding=[Text.Encoding]::UTF8; Add-Type -AssemblyName System.Windows.Forms; $o=New-Object System.Windows.Forms.Form -Property @{TopMost=$true;ShowInTaskbar=$false;WindowState='Minimized'}; $d=New-Object System.Windows.Forms.OpenFileDialog; $d.Filter='Animations (*.vrma;*.fbx;*.glb)|*.vrma;*.fbx;*.glb|All files (*.*)|*.*'; if($d.ShowDialog($o) -eq 'OK'){Write-Output $d.FileName}; $o.Dispose()", 600000)
      }),
      inspectFile: async (p) => inspectFile(String(p.path || "")),
      importFile: async (p) => importFile(p),
      updateAnim: async (p) => {
        const db = loadDb();
        const a = db.anims.find((x) => x.id === p.id);
        if (!a) throw new Error("not found");
        const before = JSON.stringify([a.inplace, a.expr, a.exprWeight, a.fingers]);
        const patch = p.patch || {};
        for (const k of ["title", "enabled", "speed", "inplace"]) if (k in patch) a[k] = patch[k];
        if ("base" in patch) a.base = !!patch.base;
        if ("times" in patch) a.times = cleanTimes(patch.times);
        if ("expr" in patch) a.expr = EXPRESSIONS.includes(patch.expr) ? patch.expr : undefined;
        if ("fx" in patch) a.fx = FX_ICONS[patch.fx] ? patch.fx : undefined;
        if ("exprWeight" in patch) a.exprWeight = Math.max(0.1, Math.min(1, Number(patch.exprWeight) || 1));
        if ("fingers" in patch) a.fingers = Math.max(0, Math.min(60, Number(patch.fingers) || 0));
        if (patch.idle) a.idle = { ...a.idle, ...patch.idle };
        if (patch.music) a.music = { ...a.music, ...patch.music };
        if (before !== JSON.stringify([a.inplace, a.expr, a.exprWeight, a.fingers])) {
          const old = a.clipFile || a.file;
          writeClipFile(a);
          if (old !== a.clipFile && old !== a.file) import_node_fs.rmSync(import_node_path.join(CLIPS, old), { force: true });
        }
        saveDb(db);
        return a;
      },
      deleteAnim: async (p) => {
        const db = loadDb();
        const a = db.anims.find((x) => x.id === p.id);
        db.anims = db.anims.filter((x) => x.id !== p.id);
        for (const k of ["morning", "back", "evening", "night"]) if (db.life[k] === "as_" + p.id) db.life[k] = LIFE_DEFAULTS[k];
        saveDb(db);
        writePack(db); // the pack must not keep naming a clip whose file is about to go
        const gone = a && a.clipFile && a.clipFile !== a.file ? [import_node_path.join(CLIPS, a.clipFile)] : [];
        if (a && !db.anims.some((x) => x.file === a.file)) gone.push(import_node_path.join(CLIPS, a.file), import_node_path.join(ORIG, a.file));
        for (const f of gone) {
          try {
            import_node_fs.rmSync(f, { force: true });
          } catch {} // still open somewhere: the entry is gone, the file is merely left behind
        }
        return true;
      },
      setSmooth: async (p) => {
        const db = loadDb();
        db.smoothDance = !!p.on;
        saveDb(db);
        return db.smoothDance;
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
      setOutfit: async (p) => {
        const db = loadDb();
        const patch = p.patch || {};
        const ids = new Set(listCharacters().list.map((c) => c.id));
        const pick = (v) => (ids.has(String(v)) ? String(v) : "");
        if ("on" in patch) db.outfit.on = !!patch.on;
        for (const k of Object.keys(OUTFIT_DEFAULTS.time)) if (patch.time && k in patch.time) db.outfit.time[k] = pick(patch.time[k]);
        for (const k of Object.keys(OUTFIT_DEFAULTS.weather)) if (patch.weather && k in patch.weather) db.outfit.weather[k] = pick(patch.weather[k]);
        if (patch.city !== undefined) {
          db.outfit.place = String(patch.city).trim() ? await findPlace(String(patch.city).trim().slice(0, 80)) : null;
          weather = { at: 0, kind: "", key: "" };
        }
        db.outfit.last = ""; // a new rule applies at the next check
        saveDb(db);
        return db.outfit;
      },
      outfitWeather: async () => {
        const db = loadDb();
        const place = weatherPlace(db);
        return { place, kind: place ? await weatherNow(db).catch(() => "") : "" };
      },
      setLife: async (p) => {
        const db = loadDb();
        const patch = p.patch || {};
        for (const k of ["on", "voice"]) if (k in patch) db.life[k] = !!patch[k];
        for (const k of ["morning", "back", "evening", "night"]) if (k in patch) db.life[k] = String(patch[k] || "").trim().slice(0, 64);
        saveDb(db);
        return db.life;
      },
      createCommands: async (_p, ctx) => createCommands(ctx),
      makeOwnPack: async () => makeOwnPack(),
      // editor: the clip as it is now, and before any edit (to compare), plus her model
      editorOpen: async (p) => {
        const a = loadDb().anims.find((x) => x.id === p.id);
        if (!a) throw new Error("not found");
        const raw = rawVrma(a);
        const model = editorModel();
        return {
          anim: a, info: vrmaInfo(raw), raw: putBlob(raw), clip: putBlob(touchedUp(a) ? vrmaEdit(raw, editOf(a)) : raw),
          model: { ...putBlob(model.file), name: model.name, file: import_node_path.basename(model.file) }
        };
      },
      editorBuild: async (p) => {
        const a = loadDb().anims.find((x) => x.id === p.id);
        if (!a) throw new Error("not found");
        const b = editedAnim(a, p);
        const raw = rawVrma(b);
        return touchedUp(b) ? putBlob(vrmaEdit(raw, editOf(b))) : putBlob(raw);
      },
      readBlob: async (p) => readBlob(p),
      editorSave: async (p) => {
        const db = loadDb();
        const i = db.anims.findIndex((x) => x.id === p.id);
        if (i < 0) throw new Error("not found");
        const a = editedAnim(db.anims[i], p);
        if ("speed" in p) a.speed = Math.max(0.25, Math.min(3, Number(p.speed) || 1));
        if ("fade" in p) a.fade = Math.max(0, Math.min(2, Number(p.fade) || 0));
        const old = db.anims[i].clipFile || db.anims[i].file;
        writeClipFile(a);
        if (old !== a.clipFile && old !== a.file) import_node_fs.rmSync(import_node_path.join(CLIPS, old), { force: true });
        if (touchedUp(a)) a.duration = Math.round(vrmaInfo(import_node_fs.readFileSync(import_node_path.join(CLIPS, a.clipFile))).duration * 100) / 100;
        db.anims[i] = a;
        saveDb(db);
        return a;
      },
      testLife: async (p, ctx) => {
        await lifeReact(ctx, { voice: true }, ["morning", "back", "night"].includes(p.phrase) ? p.phrase : "", String(p.state || ""));
        return true;
      },
      // A restart can outlast the page's call (Astra may wait 30 s before bringing the engine back), so
      // these answer at once and the page asks `job` how it went.
      apply: async () => startJob(() => withAvatar(async () => {
        const db = loadDb();
        writePack(db);
        ensureAttached(db);
        return restartAvatar();
      })),
      // Astra's commands only cue the states of her own pack, never an add-on's (CUE_STATE_UNKNOWN), so
      // showing a studio animation takes a restart with it in place of her greeting.
      preview: async (p) => startJob(() => showInsteadOfGreeting(String(p.id))),
      job: async () => job,
      openFolder: async () => {
        import_node_fs.mkdirSync(STUDIO, { recursive: true });
        import_node_child_process.spawn("explorer.exe", [STUDIO], { detached: true, stdio: "ignore" }).unref();
        return true;
      }
    }
  },
  healthCheck: () => ({ healthy: true, status: "ok" })
});
// for test/*.test.mjs
export const internals = { buildToml, fxToml, withBaseFx, smoothDanceText, periodOf, timeMatters, fbxToVrma, vrmaEdit, vrmaInfo, readGlb, readAccessor, LIFE_PHRASES, modelAliases, weatherKind };
if (require.main === module) app.run();

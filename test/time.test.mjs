// Time of day and the Astra commands, against a throwaway %APPDATA% — nothing here touches the real
// Astra config or restarts the avatar. Run: npm test (or bun run test).
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { test } from "node:test";

const appdata = fs.mkdtempSync(path.join(os.tmpdir(), "anim-studio-"));
process.env.APPDATA = appdata; // read when the plugin module loads
const cfg = path.join(appdata, "astra", "astra", "config");
fs.mkdirSync(cfg, { recursive: true });

const require = createRequire(import.meta.url);
const { app, internals } = require("./.build/plugin.cjs");
const { Harness } = require("astra-plugin-sdk/testing");
const { buildToml, periodOf, timeMatters } = internals;

const anim = (id, times, extra = {}) => ({
  id, title: id, file: `${id}.vrma`, kind: "vrma", enabled: true, times,
  idle: { on: true, weight: 0.2 }, music: { slow: false, mid: true, fast: false }, ...extra
});

test("parts of the day by the hour", () => {
  assert.deepEqual([0, 4, 5, 11, 12, 17, 18, 23].map(periodOf),
    ["night", "night", "morning", "morning", "day", "day", "evening", "evening"]);
});

test("when bored / to music only take the animations of that part of the day", () => {
  const db = { anims: [anim("morn", ["morning"]), anim("any", undefined)], reroll: [20, 35] };
  const day = buildToml(db, undefined, "day");
  const morning = buildToml(db, undefined, "morning");
  assert.match(day, /^# time of day: day$/m);
  assert.doesNotMatch(day, /\[\[states\.idle\.variants\]\]\nclip = "as_morn"/);
  assert.match(day, /\[\[states\.idle\.variants\]\]\nclip = "as_any"/);
  assert.match(morning, /\[\[states\.idle\.variants\]\]\nclip = "as_morn"/);
  assert.match(morning, /\[\[states\.dance_mid\.variants\]\]\nclip = "as_morn"/);
  // its clip and its own state stay at any time, for triggers and commands
  assert.match(day, /\[states\.as_morn\]/);
  assert.match(day, /name = "as_morn"/);
  // a restart nobody should notice greets with her own idle clip
  assert.match(buildToml(db, undefined, "day", "idle_breathe"), /\[states\.greet\]\nmerge = "replace"\nclip = "idle_breathe"/);
});

test("a new part of the day restarts the avatar only when it changes something", () => {
  const db = { anims: [anim("eve", ["evening", "night"])] };
  assert.equal(timeMatters(db, "evening", "night"), false);
  assert.equal(timeMatters(db, "day", "evening"), true);
  assert.equal(timeMatters(db, "", "day"), true); // a pack written before 1.1
  assert.equal(timeMatters({ anims: [anim("all", undefined)] }, "", "day"), false);
  assert.equal(timeMatters({ anims: [anim("off", ["day"], { enabled: false })] }, "day", "night"), false);
});

test("the page creates the two Astra commands once, keeping the others", async () => {
  const file = path.join(cfg, "commands.json");
  fs.writeFileSync(file, JSON.stringify([{ id: "x", name: "mine", triggers: [] }]));
  const h = await Harness.create(app).withLanguage("ru").start();
  const first = await h.callFromUi("createCommands");
  assert.equal(first.error, "");
  assert.equal(JSON.parse(first.resultJson).added, 2);
  const list = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(list.length, 3);
  assert.equal(list[0].name, "mine");
  assert.deepEqual(list.slice(1).map((c) => c.triggers[0].handler_id), ["plugin__anim_studio__anim_play", "plugin__anim_studio__anim_say"]);
  assert.deepEqual(list.slice(1).map((c) => c.actions[0].type), ["companion_animation", "speak"]);
  assert.ok(fs.existsSync(file + ".before-anim-studio"));
  assert.equal(JSON.parse((await h.callFromUi("createCommands")).resultJson).added, 0);
  assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).length, 3);
  // written, but Astra has not loaded them until it restarts
  let cmds = JSON.parse((await h.callFromUi("getState")).resultJson).commands;
  assert.deepEqual(cmds.anim_play, { inFile: true, listening: false });
  await h.activeTriggers(["plugin__anim_studio__anim_play", "plugin__anim_studio__anim_say"]);
  cmds = JSON.parse((await h.callFromUi("getState")).resultJson).commands;
  assert.deepEqual(cmds.anim_say, { inFile: true, listening: true });
});

test("a VRMA gets a face expression and bent fingers, the rest untouched", () => {
  const { readGlb, readAccessor, vrmaEdit } = internals;
  // a two-key VRMA: hips + left index proximal (no track on the finger yet)
  const times = [0, 1];
  const f32 = (a) => Buffer.from(new Float32Array(a).buffer);
  const bin = Buffer.concat([f32(times), f32([0, 0, 0, 1, 0, 0, 0, 1])]);
  const json = {
    asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }],
    nodes: [{ name: "Hips", children: [1] }, { name: "LeftHandIndex1" }],
    extensions: { VRMC_vrm_animation: { specVersion: "1.0", humanoid: { humanBones: { hips: { node: 0 }, leftIndexProximal: { node: 1 } } } } },
    animations: [{ samplers: [{ input: 0, output: 1, interpolation: "LINEAR" }], channels: [{ sampler: 0, target: { node: 0, path: "rotation" } }] }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 2, type: "SCALAR", min: [0], max: [1] },
      { bufferView: 1, componentType: 5126, count: 2, type: "VEC4" }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 8 }, { buffer: 0, byteOffset: 8, byteLength: 32 }]
  };
  const js = Buffer.from(JSON.stringify(json));
  const head = Buffer.alloc(20);
  head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(20 + js.length + 8 + bin.length, 8);
  head.writeUInt32LE(js.length, 12); head.writeUInt32LE(0x4e4f534a, 16);
  const binHead = Buffer.alloc(8);
  binHead.writeUInt32LE(bin.length, 0); binHead.writeUInt32LE(0x004e4942, 4);
  const src = Buffer.concat([head, js, binHead, bin]);

  const out = readGlb(vrmaEdit(src, { expr: "happy", fingers: 30 }));
  const anim = out.json.animations[0];
  const finger = anim.channels.find((c) => c.target.node === 1);
  const q = readAccessor(out.json, out.bin, anim.samplers[finger.sampler].output)[0];
  // left hand: towards the palm is a negative turn about Z, ~30° × 0.85 for the index
  assert.ok(q[2] < -0.2 && q[2] > -0.25, `finger turn ${q}`);
  const hips = readAccessor(out.json, out.bin, anim.samplers[anim.channels[0].sampler].output);
  assert.deepEqual(hips, [[0, 0, 0, 1], [0, 0, 0, 1]]);
  const face = out.json.extensions.VRMC_vrm_animation.expressions.preset.happy.node;
  assert.equal(out.json.nodes[face].name, "expr_happy");
  assert.ok(out.json.scenes[0].nodes.includes(face));
  assert.equal(vrmaEdit(src, {}), src); // nothing asked — the file stays as it is
  // every key time goes strictly forward — Astra's engine drops a channel with two keys at one time
  for (const smp of anim.samplers) {
    const t = readAccessor(out.json, out.bin, smp.input);
    assert.ok(t.every((x, k) => k === 0 || x > t[k - 1]), `times ${t.slice(-3)}`);
  }
});

test("the editor's mirror, bone offset and trim, in that order", () => {
  const { readGlb, readAccessor, vrmaEdit, vrmaInfo } = internals;
  const f32 = (a) => Buffer.from(new Float32Array(a).buffer);
  const zq = (deg) => [0, 0, Math.sin((deg * Math.PI) / 360), Math.cos((deg * Math.PI) / 360)];
  // hips with both upper arms (rest = identity); only the left arm moves: 0° → 20° → 40° about Z
  const bin = Buffer.concat([f32([0, 1, 2]), f32([...zq(0), ...zq(20), ...zq(40)])]);
  const json = {
    asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }],
    nodes: [{ name: "Hips", children: [1, 2] }, { name: "LeftArm" }, { name: "RightArm" }],
    extensions: { VRMC_vrm_animation: { specVersion: "1.0", humanoid: { humanBones: { hips: { node: 0 }, leftUpperArm: { node: 1 }, rightUpperArm: { node: 2 } } } } },
    animations: [{ samplers: [{ input: 0, output: 1, interpolation: "LINEAR" }], channels: [{ sampler: 0, target: { node: 1, path: "rotation" } }] }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "SCALAR", min: [0], max: [2] },
      { bufferView: 1, componentType: 5126, count: 3, type: "VEC4" }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 12 }, { buffer: 0, byteOffset: 12, byteLength: 48 }]
  };
  const js = Buffer.from(JSON.stringify(json));
  const head = Buffer.alloc(20);
  head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(20 + js.length + 8 + bin.length, 8);
  head.writeUInt32LE(js.length, 12); head.writeUInt32LE(0x4e4f534a, 16);
  const binHead = Buffer.alloc(8);
  binHead.writeUInt32LE(bin.length, 0); binHead.writeUInt32LE(0x004e4942, 4);
  const src = Buffer.concat([head, js, binHead, bin]);

  // mirrored, the RIGHT arm turns −20° at t=1; a +10° key on it leaves −10°; the trim makes t=1 the start
  const out = readGlb(vrmaEdit(src, { mirror: true, bones: { rightUpperArm: [[0, 0, 0, 10]] }, trim: [1, 2] }));
  const anim = out.json.animations[0];
  const right = anim.channels.find((c) => c.target.node === 2 && c.target.path === "rotation");
  assert.ok(right, "the right arm has the mirrored track");
  assert.ok(!anim.channels.some((c) => c.target.node === 1), "the left arm had nothing to mirror from");
  const q0 = readAccessor(out.json, out.bin, anim.samplers[right.sampler].output)[0];
  assert.ok(Math.abs(q0[2] - Math.sin((-10 * Math.PI) / 360)) < 1e-4, `right arm at the start ${q0}`);
  assert.equal(vrmaInfo(vrmaEdit(src, { trim: [1, 2] })).duration, 1);
});

test("a life reaction fires the phrase and the animation triggers", async () => {
  const h = await Harness.create(app).withLanguage("ru").start();
  await h.callFromUi("testLife", { phrase: "morning", state: "stretch" });
  const fired = h.host.firedTriggers();
  assert.deepEqual(fired.map((f) => f.triggerType), ["anim_say", "anim_play"]);
  assert.ok(internals.LIFE_PHRASES.ru.morning.includes(fired[0].payload.text), fired[0].payload.text);
  assert.deepEqual(fired[1].payload, { state: "stretch" });
});

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
  const db = { anims: [anim("morn", ["morning"]), anim("any", undefined)], reroll: [20, 35], beatSync: false };
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
  // a model that keeps "surprised" as its own custom expression gets the track under that name too
  const sur = readGlb(vrmaEdit(src, { expr: "surprised", aliases: { surprised: "Surprised" } })).json.extensions.VRMC_vrm_animation.expressions;
  assert.equal(sur.preset.surprised.node, sur.custom.Surprised.node);
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

test("weather codes (WMO) to the outfit's kinds of weather", () => {
  const { weatherKind } = internals;
  assert.deepEqual([0, 1, 2, 3, 45, 61, 81, 71, 86, 95, 99].map(weatherKind),
    ["clear", "clear", "cloud", "cloud", "cloud", "rain", "rain", "snow", "snow", "storm", "storm"]);
});

test("a life reaction fires the phrase and the animation triggers", async () => {
  const h = await Harness.create(app).withLanguage("ru").start();
  await h.callFromUi("testLife", { phrase: "morning", state: "stretch" });
  const fired = h.host.firedTriggers();
  assert.deepEqual(fired.map((f) => f.triggerType), ["anim_say", "anim_play"]);
  assert.ok(internals.LIFE_PHRASES.ru.morning.includes(fired[0].payload.text), fired[0].payload.text);
  assert.deepEqual(fired[1].payload, { state: "stretch" });
});

// the rows of one TOML table, up to the next table
const table = (toml, name) => {
  const at = toml.indexOf(`[${name}]\n`);
  assert.ok(at >= 0, `no [${name}]`);
  const rest = toml.slice(at + name.length + 3);
  const end = rest.search(/^\[/m);
  return end < 0 ? rest : rest.slice(0, end);
};

// a character's own pack, the way the studio finds it: [interactions.none] plays the hub effect
const BASE = `[animpack]
kind = "vrm"

[effects.ambient]
kind = "emit"
prop = "heart"
with = ["phone_texting", "face_laugh"]

[effects.face_laugh]
kind = "emit"
prop = "heart"

[interactions]
default = "none"

[interactions.none]
clip = "ambient"
`;

test("a face and an icon go in a block of the character's own pack, on its hub", () => {
  const { withBaseFx } = internals;
  const anims = [anim("kiss", undefined, { fx: "hearts", expr: "happy", exprWeight: 0.8 }), anim("think", undefined, { fx: "question" }), anim("plain")];
  const t = withBaseFx(BASE, anims);
  assert.match(table(t, "effects.ambient"), /^with = \["phone_texting", "face_laugh", "as_fx_kiss", "as_fx_think"\]$/m);
  assert.match(table(t, "effects.as_fx_kiss"), /pet_states = \["as_kiss"\]/);
  assert.match(table(t, "effects.as_fx_kiss.face"), /preset = "happy"\nweight = 0.8/);
  const emit = table(t, "effects.as_fx_kiss.emit");
  assert.match(emit, /^burst = 3$/m); // counts are integers
  assert.match(emit, /^rate = \[3.0, 4.0\]$/m); // and floats stay floats
  assert.match(t, /file = "clips\/anim-studio-fx\/question.png"/);
  assert.ok(t.startsWith(BASE.slice(0, BASE.indexOf("[effects.ambient]")))); // the rest of her pack is hers
  // written again: the same text, not a second block
  assert.equal(withBaseFx(t, anims), t);
  // nothing chosen any more: the pack is back to what it was
  assert.equal(withBaseFx(t, [anim("plain")]), BASE);
  // no hub: nothing to hang them on
  assert.equal(withBaseFx("[animpack]\nkind = \"vrm\"\n", anims), "");
});

test("a face with no icon still names a declared prop", () => {
  const t = internals.withBaseFx(BASE, [anim("smile", undefined, { expr: "happy" })]);
  assert.match(table(t, "effects.as_fx_smile"), /prop = "as_fx_heart"/);
  assert.match(t, /name = "as_fx_heart"\nfile = "builtin:nayu-anims\/heart.png"/);
  assert.ok(!t.includes("[effects.as_fx_smile.emit]"));
});

test("the editor's face keys give the effect its face: the strongest one", () => {
  const t = internals.withBaseFx(BASE, [anim("dance", undefined, { expr: "happy", edit: { face: { angry: [[1, 0.4], [3, 0.9]], sad: [[2, 0.5]] } } })]);
  assert.match(table(t, "effects.as_fx_dance.face"), /preset = "angry"\nweight = 0.9/);
});

test("shown instead of the greeting, its face and icon also show in `greet`; the add-on carries none", () => {
  const anims = [anim("kiss", undefined, { fx: "hearts" })];
  assert.match(table(internals.withBaseFx(BASE, anims, "kiss"), "effects.as_fx_kiss"), /pet_states = \["as_kiss", "greet"\]/);
  const t = buildToml({ anims, reroll: [20, 35], life: {} }, "kiss", "day", "");
  assert.match(table(t, "states.greet"), /clip = "as_kiss"/);
  assert.ok(!t.includes("[effects."), "the engine takes effects from the base pack only");
});

test("“into the character's pack”: a clip and a state of her own pack, not of the add-on", () => {
  const base = BASE.replace("[interactions]", "[states.idle]\nclip = \"idle\"\n\n[states.drag]\nclip = \"drag\"\n\n[interactions]");
  const anims = [anim("wave", undefined, { base: true, clipFile: "wave.vrma", speed: 1.2 }), anim("plain")];
  const t = internals.withBaseFx(base, anims);
  assert.match(t, /name = "asb_wave"   # wave\nfile = "clips\/anim-studio\/wave.vrma"\nloop = false\nfade = 0.50\nspeed = 1.20/);
  const st = table(t, "states.as_wave");
  assert.match(st, /clip = "asb_wave"/);
  assert.match(t, /\[\[states.as_wave.transitions\]\]\non = "clip_finished"\nto = "idle"/);
  // her pack had no hub entry to change: only the block was added
  assert.match(table(t, "effects.ambient"), /^with = \["phone_texting", "face_laugh"\]$/m);
  // the add-on keeps the clip for its idle and dance variants, but not the state
  const addon = buildToml({ anims, reroll: [20, 35], life: {} }, "", "day", "");
  assert.match(addon, /name = "as_wave"/);
  assert.ok(!addon.includes("[states.as_wave]"));
  assert.ok(addon.includes("[states.as_plain]"));
  // a pack with no hub still takes the animation; a pack missing `drag` gets no edge to it
  const bare = "[animpack]\nkind = \"vrm\"\n\n[states.idle]\nclip = \"idle\"\n";
  const t2 = internals.withBaseFx(bare, anims);
  assert.match(table(t2, "states.as_wave"), /clip = "asb_wave"/);
  assert.ok(!t2.includes('to = "drag"'));
  // taken out again: back to what it was
  assert.equal(internals.withBaseFx(t2, [anim("wave")]), bare);
});

// a dance state the way the built-in pack writes it: an intro and an outro, and a bpm-paced loop
const DANCE = `[states.dance_mid]
start = "dance_in"
end   = "dance_out"
pick = "random"
[[states.dance_mid.variants]]
loop  = false
blend = { param = "bpm", rate = "match", points = [{ clip = "dance_loop", at = 150.0 }] }
[[states.dance_mid.variants]]
clip = "twirl"
[[states.dance_mid.transitions]]
on = "music_stop"
to = "idle"

[states.idle]
start = "keep_me"
`;

test("smooth dances: no intro/outro, no endless blend, a fade and a switch interval — and back again", () => {
  const t = internals.smoothDanceText(DANCE, true, [20, 35]);
  const st = table(t, "states.dance_mid");
  assert.match(st, /^reroll_secs = \[20, 35\]/m);
  assert.match(st, /^fade = 0.9/m);
  assert.match(st, /^# anim-studio smooth: start = "dance_in"$/m);
  assert.match(t, /^# anim-studio smooth: blend = /m);
  assert.match(t, /^clip = "twirl"$/m); // an ordinary variant stays
  assert.match(t, /^on = "music_stop"$/m); // and so do the edges
  assert.match(t, /\[states.idle\]\nstart = "keep_me"/); // other states are not touched
  assert.equal(internals.smoothDanceText(t, true, [20, 35]), t); // smoothing twice changes nothing
  assert.equal(internals.smoothDanceText(t, false), DANCE); // off: exactly as it was
  // line endings are the pack's own
  const crlf = DANCE.replace(/\n/g, "\r\n");
  assert.equal(internals.smoothDanceText(internals.smoothDanceText(crlf, true), false), crlf);
});

test("smooth dances on a built-in pack: the add-on replaces the bands that have studio dances", () => {
  const db = { anims: [anim("samba"), anim("waltz", undefined, { music: { slow: true } })], reroll: [20, 35], life: {} };
  const t = buildToml(db, "", "day", "", false);
  const mid = table(t, "states.dance_mid");
  assert.match(mid, /merge = "replace"/);
  assert.match(mid, /fade = 0.9/);
  assert.ok(!t.includes('to = "air"') && !t.includes('to = "move"')); // only states the add-on declares
  assert.match(t, /\[\[states.dance_mid.transitions\]\]\non = "music_slow"\nto = "dance_slow"/);
  assert.ok(!t.includes("[states.dance_fast]")); // no studio dances there: the pack's own stays
  // with her own pack (smoothed in place) or the option off: the add-on only extends
  assert.match(table(buildToml(db, "", "day", "", true), "states.dance_mid"), /merge = "extend"/);
  assert.match(table(buildToml({ ...db, smoothDance: false }, "", "day", "", false), "states.dance_mid"), /merge = "extend"/);
});

// Needs Astra installed here: the built-in pack is read from its avatar engine.
const engine = path.join(process.env.LOCALAPPDATA || "", "Programs", "Astra", "astra-avatar-engine.exe");
test("a character on the built-in pack gets one of its own, clips by reference", { skip: !fs.existsSync(engine) }, async () => {
  const pack = path.join(cfg, "companion", "pack");
  const dir = path.join(pack, "characters", "my-girl");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(pack, "companion.toml"), 'character = "my-girl"\n');
  fs.writeFileSync(path.join(dir, "character.toml"), 'kind = "vrm"\nname = "Моя"\nmodel = "models/my.vrm"\nanimpack = "builtin:nayu-anims"\n');
  const h = await Harness.create(app).withLanguage("ru").start();
  assert.equal(JSON.parse((await h.callFromUi("getState")).resultJson).ownPackable, true);
  const r = await h.callFromUi("makeOwnPack");
  assert.equal(r.error, "");
  assert.equal(JSON.parse(r.resultJson).id, "my-girl-anims");
  const text = fs.readFileSync(path.join(pack, "animpacks", "my-girl-anims", "animpack.toml"), "utf8");
  assert.match(text, /^uid = "local:my-girl-anims"$/m);
  assert.match(text, /^name = "Моя \(Anim Studio\)"$/m);
  assert.doesNotMatch(text, /^\s*file\s*=\s*"clips\//m); // every clip by reference
  assert.ok((text.match(/^\s*file\s*=\s*"builtin:nayu-anims\//gm) || []).length > 20);
  assert.match(fs.readFileSync(path.join(dir, "character.toml"), "utf8"), /^animpack = "my-girl-anims"$/m);
  assert.ok(fs.existsSync(path.join(dir, "character.toml.before-own-pack")));
  const after = JSON.parse((await h.callFromUi("getState")).resultJson);
  assert.equal(after.basePack, true);
  assert.equal(after.ownPackable, false);
});

test("dances to the beat: one-point blends over bpm at the band's octave of their tempo, and `bpm` declared", () => {
  const { buildToml: build } = internals;
  const dance = (id, bpm, music) => ({ ...anim(id, undefined), bpmAuto: bpm, music, idle: { on: false } });
  const db = { beatSync: true, smoothDance: false, reroll: [20, 35],
    anims: [dance("fast_one", 157, { slow: true, mid: true, fast: true }), dance("slowish", 85, { slow: false, mid: true, fast: false }), dance("unknown", 0, { slow: false, mid: false, fast: true })] };
  const t = build(db, undefined, "day", "", true);
  const blend = (clip, at) => `loop = false
blend = { param = "bpm", rate = "match", max_rate = 1.6, points = [{ clip = "${clip}", at = ${at} }] }`;
  const part = (band) => t.slice(t.indexOf(`[states.dance_${band}]`)).split("\n\n")[0];
  assert.ok(t.includes('[parameters]\nbpm = { type = "float", default = 120.0 }'));
  // 157: double time in the slow band, itself in mid and fast; 85 stays 85 in mid
  assert.ok(part("slow").includes(blend("as_fast_one", "78.5")));
  assert.ok(part("mid").includes(blend("as_fast_one", "157.0")));
  assert.ok(part("mid").includes(blend("as_slowish", "85.0")));
  // no tempo found: 120
  assert.ok(part("fast").includes(blend("as_unknown", "120.0")));
  // off: plain clips as before, nothing declared
  const off = build({ ...db, beatSync: false }, undefined, "day", "", true);
  assert.ok(!off.includes("[parameters]") && !off.includes("blend ="));
  assert.ok(off.includes('[[states.dance_mid.variants]]\nclip = "as_slowish"'));
});

test("walks: the built-in walk turns ±90° by side, a studio walk has a clip of its own per side, the peek goes back to idle", () => {
  const { walkToml, cleanWalk, BUILTIN_WALK } = internals;
  const pack = "[states.idle]\nclip = \"x\"\n[states.drag]\nclip = \"y\"\n";
  const t = walkToml({ walks: [{ id: BUILTIN_WALK, speed: 1, builtin: true }, { id: "step", speed: 1.5 }], peek: 0.6 }, pack).join("\n");
  assert.ok(t.includes('[states.as_walk_builtin_right]') && t.includes('[states.as_walk_builtin_left]'));
  assert.ok(t.includes('file = "clips/anim-studio/walk_builtin.glb"\nsource = "Walk_Loop"\nrotate = 90'));
  assert.ok(t.includes('source = "Walk_Loop"\nrotate = -90'));
  assert.ok(t.includes('file = "clips/anim-studio/walk_step_left.vrma"') && t.includes("speed = 1.50"));
  assert.ok(t.includes('[states.as_peek]\nclip = "asw_peek"\nloop = false\n[[states.as_peek.transitions]]\non = "clip_finished"\nto = "idle"'));
  // the first test builds kept one walk in `anim`
  assert.deepEqual(cleanWalk({ anim: "step", flip: true }).styles, [{ id: "step", flip: false }]);
  assert.deepEqual(cleanWalk(undefined).styles, [{ id: BUILTIN_WALK, flip: false }]);
});

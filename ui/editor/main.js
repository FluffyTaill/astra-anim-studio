// Anim Studio editor: the clip on her own model, with a timeline and the edits the backend bakes into
// the VRMA (trim, mirror, bone offsets, relaxed fingers, face keys). Bundled into ui/editor.js with
// three.js and three-vrm; app.js loads it the first time the editor is opened.
//
// What is previewed is the very file Astra will play: every change asks the backend to build the
// clip (editorBuild) and the page plays that. Only the bone sliders, while they are moved and before
// a key is added, are shown live on top of it.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import { VRMAnimationLoaderPlugin, createVRMAnimationClip } from "@pixiv/three-vrm-animation";

const EXPRESSIONS = ["happy", "angry", "sad", "relaxed", "surprised"];
const BONES = [
  ["head", "Голова", "Head"], ["neck", "Шея", "Neck"], ["upperChest", "Верх груди", "Upper chest"], ["chest", "Грудь", "Chest"],
  ["spine", "Поясница", "Spine"], ["hips", "Бёдра", "Hips"],
  ["leftShoulder", "Левая ключица", "Left shoulder"], ["leftUpperArm", "Левое плечо", "Left upper arm"],
  ["leftLowerArm", "Левое предплечье", "Left forearm"], ["leftHand", "Левая кисть", "Left hand"],
  ["rightShoulder", "Правая ключица", "Right shoulder"], ["rightUpperArm", "Правое плечо", "Right upper arm"],
  ["rightLowerArm", "Правое предплечье", "Right forearm"], ["rightHand", "Правая кисть", "Right hand"],
  ["leftUpperLeg", "Левое бедро", "Left thigh"], ["leftLowerLeg", "Левая голень", "Left shin"], ["leftFoot", "Левая стопа", "Left foot"],
  ["rightUpperLeg", "Правое бедро", "Right thigh"], ["rightLowerLeg", "Правая голень", "Right shin"], ["rightFoot", "Правая стопа", "Right foot"]
];

const L = {
  ru: {
    title: "Редактор", loading: "Загружаю…", model: "Модель", clip: "Анимация", save: "Сохранить", saved: "Сохранено. Нажми «Применить», чтобы аватар её подхватил.",
    close: "Закрыть", reset: "Сбросить правки", original: "Оригинал", edited: "С правками", play: "▶", pause: "❚❚", loop: "По кругу",
    basics: "Основное", speed: "Скорость", fade: "Плавный вход и выход", inplace: "На месте", mirror: "Зеркально (левое ↔ правое)",
    fingers: "Пальцы к ладони", fingersOff: "как в анимации", trim: "Обрезка", start: "Начало", end: "Конец", trimHere: "сюда",
    face: "Мимика", faceHint: "Ключи: в эту секунду — такое выражение с такой силой. Между ключами плавно. Пока есть ключи, «Мимика» из списка анимаций не действует.",
    addKey: "＋ ключ сейчас", burst: "＋ вспышка эмоции здесь", none: "нет ключей",
    poses: "Позы костей", posesHint: "Поверни кость ползунками (видно сразу) и добавь ключ — поза поверх анимации, между ключами плавно.",
    bone: "Кость", x: "X — кивок / скрутка", y: "Y — поворот / мах вперёд-назад", z: "Z — наклон вбок / поднять-опустить",
    zero: "обнулить", unsaved: "Есть несохранённые правки — закрыть без сохранения?", yes: "Закрыть", no: "Остаться",
    building: "Собираю…", sec: "с", failed: "Не удалось", glb: "Этот формат (GLB с несколькими анимациями) в редакторе не поддерживается."
  },
  en: {
    title: "Editor", loading: "Loading…", model: "Model", clip: "Animation", save: "Save", saved: "Saved. Click “Apply” for the avatar to pick it up.",
    close: "Close", reset: "Reset edits", original: "Original", edited: "Edited", play: "▶", pause: "❚❚", loop: "Loop",
    basics: "Basics", speed: "Speed", fade: "Smooth in and out", inplace: "In place", mirror: "Mirrored (left ↔ right)",
    fingers: "Fingers to the palm", fingersOff: "as animated", trim: "Trim", start: "Start", end: "End", trimHere: "here",
    face: "Face", faceHint: "Keys: at this second — this expression at this strength. Smooth in between. While there are keys, the Face picked in the list does nothing.",
    addKey: "＋ key now", burst: "＋ a flash of emotion here", none: "no keys",
    poses: "Bone poses", posesHint: "Turn a bone with the sliders (shown at once) and add a key — a pose on top of the animation, smooth in between.",
    bone: "Bone", x: "X — nod / twist", y: "Y — turn / swing", z: "Z — tilt / raise-lower",
    zero: "zero", unsaved: "There are unsaved edits — close without saving?", yes: "Close", no: "Stay",
    building: "Building…", sec: "s", failed: "Failed", glb: "This format (a GLB with several animations) can't be edited."
  }
};

const CSS = `
.ed-bg{position:fixed;inset:0;background:var(--color-bg,#07090e);z-index:40;display:flex;flex-direction:column;color:var(--text);font-family:inherit}
.ed-top{display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid var(--line)}
.ed-top h3{margin:0;font-size:16px;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ed-main{flex:1;display:flex;min-height:0}
.ed-view{flex:1;position:relative;min-width:0}
.ed-view canvas{display:block;width:100%;height:100%}
.ed-msg{position:absolute;left:14px;top:12px;font-size:12px;color:var(--muted);pointer-events:none}
.ed-side{width:340px;max-width:44vw;overflow:auto;border-left:1px solid var(--line);background:var(--card);padding:12px 14px}
.ed-side section{border-bottom:1px solid var(--line);padding:10px 0}
.ed-side h4{margin:0 0 8px;font-size:13px}
.ed-row{display:flex;align-items:center;gap:8px;margin:6px 0;font-size:12px;flex-wrap:wrap}
.ed-row label{display:flex;align-items:center;gap:6px}
.ed-row input[type=range]{flex:1;min-width:90px;accent-color:var(--accent)}
.ed-row .v{color:var(--muted);min-width:44px;text-align:right}
.ed-keys{margin:6px 0;font-size:12px}
.ed-key{display:flex;align-items:center;gap:6px;padding:3px 0}
.ed-key .t{color:var(--accent-text);min-width:52px;cursor:pointer}
.ed-key input[type=range]{width:90px}
.ed-x{background:none;border:0;color:var(--bad);cursor:pointer;font-size:14px}
.ed-hint{color:var(--muted);font-size:11px;line-height:1.45;margin-bottom:6px}
.ed-bar{display:flex;align-items:center;gap:10px;padding:10px 16px;border-top:1px solid var(--line)}
.ed-bar input[type=range]{flex:1;accent-color:var(--accent2)}
.ed-time{font-variant-numeric:tabular-nums;color:var(--muted);font-size:12px;min-width:96px;text-align:right}
.ed-sel{background:var(--field);border:1px solid var(--line2);color:inherit;border-radius:8px;padding:5px 7px;font-size:12px}
.ed-num{width:62px}
.ed-seg{display:flex;border:1px solid var(--line2);border-radius:10px;overflow:hidden}
.ed-seg button{background:none;border:0;color:var(--muted);padding:7px 11px;cursor:pointer;font-weight:600;font-size:12px}
.ed-seg button.on{background:var(--accent-soft);color:var(--accent-text)}
`;

let cachedModel = null; // { key, vrm } — her body is loaded once per page

export async function open(anim, ctx) {
  const lang = L[ctx.lang] ? ctx.lang : "en";
  const T = (k) => L[lang][k];
  if (anim.kind === "glb") return ctx.toast(T("glb"));
  if (!document.getElementById("ed-css")) {
    const st = document.createElement("style");
    st.id = "ed-css";
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  const esc = ctx.esc;
  const bg = document.createElement("div");
  bg.className = "ed-bg";
  bg.innerHTML = `<div class="ed-top"><h3>${T("title")} · ${esc(anim.title)}</h3>
      <div class="ed-seg"><button data-v="edited" class="on">${T("edited")}</button><button data-v="original">${T("original")}</button></div>
      <button class="btn" data-a="reset">${T("reset")}</button>
      <button class="btn primary" data-a="save">${T("save")}</button>
      <button class="btn" data-a="close">${T("close")}</button></div>
    <div class="ed-main"><div class="ed-view"><div class="ed-msg">${T("loading")}</div></div><div class="ed-side"></div></div>
    <div class="ed-bar"><button class="btn" data-a="play">${T("pause")}</button>
      <input type="range" class="ed-scrub" min="0" max="1" step="0.01" value="0">
      <span class="ed-time">0.00 / 0.00 ${T("sec")}</span>
      <label class="muted"><input type="checkbox" class="ed-loop" checked> ${T("loop")}</label></div>`;
  document.body.appendChild(bg);
  const view = bg.querySelector(".ed-view"), side = bg.querySelector(".ed-side"), msg = bg.querySelector(".ed-msg");
  const scrub = bg.querySelector(".ed-scrub"), timeEl = bg.querySelector(".ed-time"), loopEl = bg.querySelector(".ed-loop");
  const say = (t) => (msg.textContent = t || "");

  // ── state: what the editor would save ──
  const e0 = anim.edit || {};
  const st = {
    speed: anim.speed || 1, fade: anim.fade ?? 0.5, inplace: !!anim.inplace, fingers: anim.fingers || 0, expr: anim.expr || "",
    mirror: !!e0.mirror, trim: e0.trim ? [...e0.trim] : null,
    face: Object.entries(e0.face || {}).flatMap(([x, keys]) => keys.map(([t, w]) => ({ t, x, w }))),
    bones: Object.entries(e0.bones || {}).flatMap(([b, keys]) => keys.map(([t, x, y, z]) => ({ t, b, r: [x, y, z] }))),
    bone: "head", live: [0, 0, 0]
  };
  let dirty = false, mode = "edited", playing = true, closed = false;
  const editOut = () => {
    const face = {}, bones = {};
    for (const k of st.face) (face[k.x] = face[k.x] || []).push([k.t, k.w]);
    for (const k of st.bones) (bones[k.b] = bones[k.b] || []).push([k.t, ...k.r]);
    return { mirror: st.mirror, trim: st.trim, face, bones };
  };
  const payload = () => ({ id: anim.id, edit: editOut(), fingers: st.fingers, inplace: st.inplace, expr: st.expr });

  // ── three.js ──
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  view.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
  camera.position.set(0, 1.25, 3.4);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1.0, 0);
  controls.enableDamping = true;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(1.5, 3, 2.5);
  scene.add(sun);
  // the floor grid in Astra's own colours (light or dark theme, the user's accent)
  const css = getComputedStyle(document.documentElement);
  const tone = (name, fallback) => new THREE.Color(css.getPropertyValue(name).trim() || fallback);
  const grid = new THREE.GridHelper(6, 24, tone("--color-accent", "#8b7cff"), tone("--color-text-muted", "#2a2f3d"));
  grid.material.opacity = 0.5;
  grid.material.transparent = true;
  scene.add(grid);
  const resize = () => {
    const w = view.clientWidth, h = view.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  };
  if (window.__AS_DEBUG) window.__animEditor = { camera, controls, get vrm() { return vrm; } }; // for poking at it from devtools
  const ro = new ResizeObserver(resize);
  ro.observe(view);
  resize();

  // ── files from the backend, in pieces ──
  async function fetchBlob({ token, size }, label) {
    const out = new Uint8Array(size);
    for (let off = 0; off < size;) {
      const { data } = await ctx.call("readBlob", { token, offset: off });
      const bin = atob(data);
      for (let i = 0; i < bin.length; i++) out[off + i] = bin.charCodeAt(i);
      if (!bin.length) break;
      off += bin.length;
      if (label) say(`${label}: ${Math.round((off / size) * 100)}%`);
    }
    return out.buffer;
  }
  const parse = (loader, buf) => new Promise((res, rej) => loader.parse(buf, "", res, rej));

  let vrm, mixer, action, clips = {}, duration = 1, info;
  try {
    const opened = await ctx.call("editorOpen", { id: anim.id });
    info = opened.info;
    const key = `${opened.model.file}:${opened.model.size}`;
    if (cachedModel?.key !== key) {
      const loader = new GLTFLoader();
      loader.register((p) => new VRMLoaderPlugin(p));
      const gltf = await parse(loader, await fetchBlob(opened.model, `${T("model")} ${opened.model.name}`));
      const v = gltf.userData.vrm;
      VRMUtils.removeUnnecessaryVertices(gltf.scene);
      VRMUtils.rotateVRM0(v);
      cachedModel = { key, vrm: v };
    }
    vrm = cachedModel.vrm;
    scene.add(vrm.scene);
    mixer = new THREE.AnimationMixer(vrm.scene);
    clips.original = await loadClip(opened.raw);
    clips.edited = await loadClip(opened.clip);
    play("edited", 0);
    say("");
  } catch (err) {
    say(`${T("failed")}: ${err.message || err}`);
  }

  async function loadClip(blob) {
    const loader = new GLTFLoader();
    loader.register((p) => new VRMAnimationLoaderPlugin(p));
    const gltf = await parse(loader, await fetchBlob(blob, T("clip")));
    return createVRMAnimationClip(gltf.userData.vrmAnimations[0], vrm);
  }

  function play(which, at) {
    if (!mixer || !clips[which]) return;
    mixer.stopAllAction();
    mixer.uncacheRoot(vrm.scene);
    action = mixer.clipAction(clips[which]);
    action.setLoop(loopEl.checked ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    action.clampWhenFinished = true;
    action.play();
    duration = clips[which].duration || 1;
    action.time = Math.min(at || 0, duration);
    action.paused = !playing;
    scrub.max = String(duration);
    mixer.update(0);
  }

  // the edited clip starts at the trim's start; keys are in the original clip's time
  const trimStart = () => (mode === "edited" && st.trim ? Math.min(...st.trim) : 0);
  const rawNow = () => Math.round(((action?.time || 0) + trimStart()) * 100) / 100;

  let buildTimer = 0, buildSeq = 0;
  function rebuild() {
    dirty = true;
    clearTimeout(buildTimer);
    buildTimer = setTimeout(async () => {
      const seq = ++buildSeq;
      say(T("building"));
      try {
        const blob = await ctx.call("editorBuild", payload());
        const clip = await loadClip(blob);
        if (seq !== buildSeq || closed) return;
        clips.edited = clip;
        if (mode === "edited") play("edited", action?.time || 0);
        say("");
      } catch (err) {
        say(`${T("failed")}: ${err.message || err}`);
      }
    }, 350);
  }

  // ── the loop ──
  const clock = new THREE.Clock();
  const dq = new THREE.Quaternion(), eu = new THREE.Euler();
  function frame() {
    if (closed) return;
    requestAnimationFrame(frame);
    const dt = clock.getDelta();
    if (mixer) {
      mixer.update(playing ? dt * st.speed : 0);
      // the bone sliders, live, before they become a key: a turn in the bone's normalized frame
      if (vrm && st.live.some((x) => x)) {
        const node = vrm.humanoid.getNormalizedBoneNode(st.bone);
        if (node) node.quaternion.multiply(dq.setFromEuler(eu.set(...st.live.map(THREE.MathUtils.degToRad), "XYZ")));
      }
      vrm?.update(dt);
      if (action) {
        scrub.value = String(action.time);
        timeEl.textContent = `${action.time.toFixed(2)} / ${duration.toFixed(2)} ${T("sec")}`;
      }
    }
    controls.update();
    renderer.render(scene, camera);
  }
  frame();

  // ── the panel ──
  const boneName = (b) => (BONES.find((x) => x[0] === b) || [b, b, b])[lang === "ru" ? 1 : 2];
  const bonesHere = () => BONES.map((x) => x[0]).filter((b) => !info || info.bones.includes(b));
  function panel() {
    const f = (x) => (Math.round(x * 100) / 100).toFixed(2);
    const faceKeys = [...st.face].map((k, i) => ({ ...k, i })).sort((a, b) => a.t - b.t);
    const boneKeys = [...st.bones].map((k, i) => ({ ...k, i })).sort((a, b) => a.t - b.t);
    side.innerHTML = `
      <section><h4>${T("basics")}</h4>
        <div class="ed-row">${T("speed")}<input type="range" min="25" max="300" value="${Math.round(st.speed * 100)}" data-k="speed"><span class="v">×${st.speed.toFixed(2)}</span></div>
        <div class="ed-row">${T("fade")}<input type="range" min="0" max="200" value="${Math.round(st.fade * 100)}" data-k="fade"><span class="v">${st.fade.toFixed(2)} ${T("sec")}</span></div>
        <div class="ed-row">${T("fingers")}<input type="range" min="0" max="60" value="${st.fingers}" data-k="fingers"><span class="v">${st.fingers ? st.fingers + "°" : T("fingersOff")}</span></div>
        <div class="ed-row"><label><input type="checkbox" data-k="inplace" ${st.inplace ? "checked" : ""}> ${T("inplace")}</label></div>
        <div class="ed-row"><label><input type="checkbox" data-k="mirror" ${st.mirror ? "checked" : ""}> ${T("mirror")}</label></div>
      </section>
      <section><h4>${T("trim")}</h4>
        <div class="ed-row">${T("start")} <input class="ed-sel ed-num" type="number" step="0.05" min="0" max="${info?.duration || 0}" value="${f(st.trim ? st.trim[0] : 0)}" data-k="trim0">
          <button class="btn" data-a="trim0">${T("trimHere")}</button>
          ${T("end")} <input class="ed-sel ed-num" type="number" step="0.05" min="0" max="${info?.duration || 0}" value="${f(st.trim ? st.trim[1] : info?.duration || 0)}" data-k="trim1">
          <button class="btn" data-a="trim1">${T("trimHere")}</button></div>
      </section>
      <section><h4>${T("face")}</h4><div class="ed-hint">${T("faceHint")}</div>
        <div class="ed-keys">${faceKeys.length ? faceKeys.map((k) => `<div class="ed-key">
          <span class="t" data-seek="${k.t}">${f(k.t)} ${T("sec")}</span>
          <select class="ed-sel" data-face="${k.i}" data-f="x">${EXPRESSIONS.map((x) => `<option ${x === k.x ? "selected" : ""}>${x}</option>`).join("")}</select>
          <input type="range" min="0" max="100" value="${Math.round(k.w * 100)}" data-face="${k.i}" data-f="w"><span class="v">${Math.round(k.w * 100)}%</span>
          <button class="ed-x" data-delface="${k.i}">×</button></div>`).join("") : `<div class="ed-hint">${T("none")}</div>`}</div>
        <div class="ed-row"><button class="btn" data-a="facekey">${T("addKey")}</button><button class="btn" data-a="burst">${T("burst")}</button></div>
      </section>
      <section><h4>${T("poses")}</h4><div class="ed-hint">${T("posesHint")}</div>
        <div class="ed-row">${T("bone")} <select class="ed-sel" data-k="bone">${bonesHere().map((b) => `<option value="${b}" ${b === st.bone ? "selected" : ""}>${esc(boneName(b))}</option>`).join("")}</select></div>
        ${["x", "y", "z"].map((ax, i) => `<div class="ed-row" title="${T(ax)}">${ax.toUpperCase()}<input type="range" min="-90" max="90" value="${st.live[i]}" data-live="${i}"><span class="v">${st.live[i]}°</span></div>`).join("")}
        <div class="ed-row"><button class="btn" data-a="bonekey">${T("addKey")}</button><button class="btn" data-a="zero">${T("zero")}</button></div>
        <div class="ed-keys">${boneKeys.length ? boneKeys.map((k) => `<div class="ed-key">
          <span class="t" data-seek="${k.t}">${f(k.t)} ${T("sec")}</span><span>${esc(boneName(k.b))}: ${k.r.map((x) => Math.round(x) + "°").join(" ")}</span>
          <button class="ed-x" data-delbone="${k.i}">×</button></div>`).join("") : `<div class="ed-hint">${T("none")}</div>`}</div>
      </section>`;
  }
  panel();

  side.addEventListener("input", (ev) => {
    const el = ev.target, k = el.dataset.k;
    if (el.dataset.live !== undefined) {
      st.live[+el.dataset.live] = +el.value;
      el.nextElementSibling.textContent = `${el.value}°`;
      return;
    }
    if (el.dataset.face !== undefined && el.dataset.f === "w") {
      st.face[+el.dataset.face].w = el.value / 100;
      el.nextElementSibling.textContent = `${el.value}%`;
      return;
    }
    if (k === "speed") { st.speed = el.value / 100; el.nextElementSibling.textContent = `×${st.speed.toFixed(2)}`; dirty = true; }
    if (k === "fade") { st.fade = el.value / 100; el.nextElementSibling.textContent = `${st.fade.toFixed(2)} ${T("sec")}`; dirty = true; }
    if (k === "fingers") el.nextElementSibling.textContent = +el.value ? `${el.value}°` : T("fingersOff");
  });
  side.addEventListener("change", (ev) => {
    const el = ev.target, k = el.dataset.k;
    if (k === "fingers") { st.fingers = +el.value; rebuild(); }
    else if (k === "inplace") { st.inplace = el.checked; rebuild(); }
    else if (k === "mirror") { st.mirror = el.checked; rebuild(); }
    else if (k === "trim0" || k === "trim1") {
      const t = st.trim ? [...st.trim] : [0, info?.duration || 0];
      t[k === "trim0" ? 0 : 1] = Math.max(0, Math.min(info?.duration || 0, Number(el.value) || 0));
      st.trim = t[0] === 0 && Math.abs(t[1] - (info?.duration || 0)) < 0.01 ? null : t;
      rebuild();
    } else if (k === "bone") { st.bone = el.value; st.live = [0, 0, 0]; panel(); }
    else if (el.dataset.face !== undefined) {
      if (el.dataset.f === "x") st.face[+el.dataset.face].x = el.value;
      rebuild();
    }
  });
  side.addEventListener("click", (ev) => {
    const el = ev.target;
    const a = el.dataset.a;
    if (el.dataset.seek !== undefined) return seekRaw(+el.dataset.seek);
    if (el.dataset.delface !== undefined) { st.face.splice(+el.dataset.delface, 1); panel(); return rebuild(); }
    if (el.dataset.delbone !== undefined) { st.bones.splice(+el.dataset.delbone, 1); panel(); return rebuild(); }
    if (a === "trim0" || a === "trim1") {
      const t = st.trim ? [...st.trim] : [0, info?.duration || 0];
      t[a === "trim0" ? 0 : 1] = rawNow();
      st.trim = t;
      panel();
      rebuild();
    } else if (a === "facekey") {
      st.face.push({ t: rawNow(), x: st.face.at(-1)?.x || st.expr || "happy", w: 1 });
      panel();
      rebuild();
    } else if (a === "burst") {
      const t = rawNow(), x = st.face.at(-1)?.x || st.expr || "happy";
      st.face.push({ t: Math.max(0, t - 0.3), x, w: 0 }, { t, x, w: 1 }, { t: t + 0.9, x, w: 0 });
      panel();
      rebuild();
    } else if (a === "bonekey") {
      st.bones.push({ t: rawNow(), b: st.bone, r: [...st.live] });
      st.live = [0, 0, 0];
      panel();
      rebuild();
    } else if (a === "zero") {
      st.live = [0, 0, 0];
      panel();
    }
  });

  function seekRaw(t) {
    if (!action) return;
    action.time = Math.max(0, Math.min(duration, t - trimStart()));
    mixer.update(0);
  }
  scrub.addEventListener("input", () => {
    if (!action) return;
    action.time = +scrub.value;
    mixer.update(0);
  });
  loopEl.addEventListener("change", () => play(mode, action?.time || 0));

  const top = bg.querySelector(".ed-top");
  // Esc closes it too (the avatar's own window may sit over the Close button)
  const onKey = (ev) => {
    if (ev.key === "Escape" && !document.querySelector(".modal-bg")) top.querySelector("[data-a=close]").click();
  };
  document.addEventListener("keydown", onKey);
  top.querySelector(".ed-seg").addEventListener("click", (ev) => {
    const v = ev.target.dataset.v;
    if (!v || v === mode) return;
    mode = v;
    top.querySelectorAll(".ed-seg button").forEach((b) => b.classList.toggle("on", b.dataset.v === v));
    play(v, 0);
  });
  bg.querySelector(".ed-bar [data-a=play]").addEventListener("click", (ev) => {
    playing = !playing;
    if (action) action.paused = !playing;
    if (playing && action && !loopEl.checked && action.time >= duration - 0.01) action.time = 0;
    ev.target.textContent = playing ? T("pause") : T("play");
  });
  top.addEventListener("click", async (ev) => {
    const a = ev.target.dataset.a;
    if (a === "reset") {
      Object.assign(st, { mirror: false, trim: null, face: [], bones: [], fingers: 0, live: [0, 0, 0] });
      panel();
      rebuild();
    } else if (a === "save") {
      ev.target.disabled = true;
      try {
        await ctx.call("editorSave", { ...payload(), speed: st.speed, fade: st.fade });
        dirty = false;
        ctx.toast(T("saved"));
        ctx.onSaved();
      } catch (err) {
        say(`${T("failed")}: ${err.message || err}`);
      }
      ev.target.disabled = false;
    } else if (a === "close") {
      if (dirty && !(await ctx.ask(T("unsaved"), T("yes")))) return;
      closed = true;
      document.removeEventListener("keydown", onKey);
      ro.disconnect();
      controls.dispose();
      mixer?.stopAllAction();
      if (vrm) scene.remove(vrm.scene); // her model stays cached for the next opening
      renderer.dispose();
      bg.remove();
    }
  });
}

window.AnimEditor = { open };

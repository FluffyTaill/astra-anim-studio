// Anim Studio page. Talks to the plugin through window.astra.callBackend(method, params).
const I18N = {
  ru: {
    sub: "Свои анимации аватара: добавь файл и выбери, когда она его играет",
    add: "＋ Добавить анимацию", apply: "Применить", applying: "Применяю…", folder: "Папка",
    chars: "Кто носит анимации студии", charsHint: "Отметь персонажей — студия подключается к ним как дополнение, их собственный набор не меняется.",
    builtin: "Сейчас надет встроенный персонаж — к нему нельзя подключить дополнение. В Astra → Модель → Персонажи нажми «Добавить персонажа» (копия встроенного) и надень её, затем отметь её здесь.",
    noChars: "Персонажей VRM не найдено. Создай персонажа в Astra → Модель → Персонажи.",
    active: "сейчас надет",
    anims: "Анимации", none: "Пока пусто. Нажми «Добавить анимацию» — подойдут .vrma, .fbx (Mixamo) и .glb.",
    enabled: "Включена", bored: "Сама, от скуки", rare: "редко", often: "часто", music: "Под музыку",
    slow: "медленная", mid: "средняя", fast: "быстрая", inplace: "На месте", speed: "Скорость", del: "Удалить",
    state: "состояние", stateHint: "Нажми, чтобы скопировать. Посмотреть: Astra → Модель → Анимации → «Показать». Реакция на событие: Модель → Триггеры.",
    copied: "Скопировано", sec: "с",
    dirty: "Есть изменения — нажми «Применить», аватар перезапустится на пару секунд.",
    applied: (r) => `Готово: набор «${r.pack}» загружен, ${r.clips} анимаций.`,
    problems: "Движок сообщил о проблемах:", timeout: "Аватар не ответил за 30 с — проверь, что Astra запущена.",
    confirmDel: (t) => `Удалить «${t}»?`,
    imp: "Добавить анимацию", impTitle: "Название", impPick: "Какие анимации взять из файла", impInplace: "Закрепить на месте (не уходит за край окна) — рекомендуется для танцев",
    impNotHuman: "В файле не найден человеческий скелет (Hips). Анимация может не подойти аватару.",
    impOk: "Добавить", cancel: "Отмена", added: (n) => `Добавлено: ${n}. Теперь выбери, когда играть, и нажми «Применить».`,
    unsupported: "Этот файл не подходит: нужен .vrma, .fbx (Binary) или .glb с анимациями.",
    settings: "Танцы под музыку", reroll: "Менять танец каждые", to: "–",
    help: "Где взять анимации и как это работает",
    helpBody: `<ul>
<li><b>Mixamo</b> (бесплатно, вход через Adobe): <a href="https://www.mixamo.com" target="_blank">mixamo.com</a> → Animations → Download: <i>FBX Binary, Without Skin, 30 fps</i>.</li>
<li><b>VRoid</b>: бесплатный набор VRMA-движений на BOOTH (VRoid Project).</li>
<li><b>Quaternius Universal Animation Library</b> (CC0): .glb с десятками анимаций — при добавлении выбери нужные.</li>
<li>Unity-файлы <code>.anim</code> не подходят.</li>
</ul>
<p>Каждая анимация получает своё состояние <code>as_…</code>: его видно в Astra → Модель → Анимации (кнопка «Показать»), его можно привязать к событиям в Модель → Триггеры и к командам (действие «Анимация компаньона», режим state).</p>
<p>«От скуки» — она сама иногда играет анимацию, когда стоит без дела. «Под музыку» — когда Astra слышит музыку нужного темпа.</p>`
  },
  en: {
    sub: "Your own avatar animations: add a file and choose when she plays it",
    add: "＋ Add animation", apply: "Apply", applying: "Applying…", folder: "Folder",
    chars: "Who wears the studio animations", charsHint: "Tick characters — the studio is attached to them as an add-on, their own pack stays untouched.",
    builtin: "A built-in character is worn now — add-ons can't be attached to it. In Astra → Model → Characters click “Add character” (a copy of the built-in), wear it, then tick it here.",
    noChars: "No VRM characters found. Create one in Astra → Model → Characters.",
    active: "worn now",
    anims: "Animations", none: "Nothing yet. Click “Add animation” — .vrma, .fbx (Mixamo) and .glb work.",
    enabled: "Enabled", bored: "On her own, when bored", rare: "rare", often: "often", music: "To music",
    slow: "slow", mid: "mid", fast: "fast", inplace: "In place", speed: "Speed", del: "Delete",
    state: "state", stateHint: "Click to copy. Preview: Astra → Model → Animations → “Show”. React to an event: Model → Triggers.",
    copied: "Copied", sec: "s",
    dirty: "There are changes — click “Apply”, the avatar restarts for a couple of seconds.",
    applied: (r) => `Done: pack “${r.pack}” loaded, ${r.clips} animations.`,
    problems: "The engine reported problems:", timeout: "The avatar did not answer in 30 s — check that Astra is running.",
    confirmDel: (t) => `Delete “${t}”?`,
    imp: "Add animation", impTitle: "Title", impPick: "Which animations to take from the file", impInplace: "Lock in place (does not slide out of the window) — recommended for dances",
    impNotHuman: "No humanoid skeleton (Hips) found in the file. It may not fit the avatar.",
    impOk: "Add", cancel: "Cancel", added: (n) => `Added: ${n}. Now choose when to play it and click “Apply”.`,
    unsupported: "This file won't work: use .vrma, .fbx (Binary) or .glb with animations.",
    settings: "Dancing to music", reroll: "Switch dance every", to: "–",
    help: "Where to get animations and how it works",
    helpBody: `<ul>
<li><b>Mixamo</b> (free, Adobe sign-in): <a href="https://www.mixamo.com" target="_blank">mixamo.com</a> → Animations → Download: <i>FBX Binary, Without Skin, 30 fps</i>.</li>
<li><b>VRoid</b>: the free VRMA motion set on BOOTH (VRoid Project).</li>
<li><b>Quaternius Universal Animation Library</b> (CC0): .glb with dozens of animations — pick the ones you want when adding.</li>
<li>Unity <code>.anim</code> files don't work.</li>
</ul>
<p>Each animation gets its own state <code>as_…</code>: see it in Astra → Model → Animations (“Show”), bind it to events in Model → Triggers and to commands (action “Companion animation”, mode state).</p>
<p>“When bored” — she sometimes plays it by herself while idle. “To music” — when Astra hears music of that tempo.</p>`
  }
};
let lang = (() => {
  try { return localStorage.getItem("as-lang") || (navigator.language || "ru").slice(0, 2); } catch { return "ru"; }
})();
if (!I18N[lang]) lang = "en";
const T = (k) => I18N[lang][k];

let st = { anims: [], characters: { list: [] }, reroll: [20, 35] };
let dirty = false;
let banner = null; // {cls, text}
let busy = false;

const call = (m, p = {}) => window.astra.callBackend(m, p);
const esc = (x) => String(x ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function toast(t) {
  const el = document.getElementById("toast");
  el.textContent = t;
  el.style.display = "block";
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (el.style.display = "none"), 2600);
}
const weightToSlider = (w) => Math.round(Math.log(w / 0.005) / Math.log(30) * 100);
const sliderToWeight = (v) => Math.round(0.005 * Math.pow(30, v / 100) * 1000) / 1000;

async function refresh() {
  st = await call("getState");
  render();
}

function render() {
  const ch = st.characters;
  const root = document.getElementById("root");
  root.innerHTML = `
  <div class="top">
    <div><h1><span>Anim Studio</span></h1><div class="sub">${T("sub")}</div></div>
    <div class="row">
      <button class="btn" onclick="toggleLang()">${lang === "ru" ? "EN" : "RU"}</button>
      <button class="btn" onclick="call('openFolder')">${T("folder")}</button>
      <button class="btn primary" onclick="startImport()">${T("add")}</button>
      <button class="btn apply ${dirty ? "dirty" : ""}" id="applyBtn" onclick="apply()" ${busy ? "disabled" : ""}>${busy ? T("applying") : T("apply")}</button>
    </div>
  </div>
  ${banner ? `<div class="${banner.cls}">${banner.html ?? esc(banner.text)}</div>` : dirty ? `<div class="notice">${T("dirty")}</div>` : ""}
  <div class="card">
    <h2>${T("chars")}</h2>
    <div class="muted" style="margin-bottom:10px">${T("charsHint")}</div>
    ${ch.activeIsBuiltin ? `<div class="notice">${T("builtin")}</div>` : ""}
    ${ch.list.length ? `<div class="chars">${ch.list.map((c) => `
      <div class="char ${c.attached ? "on" : ""}" onclick="setChar('${esc(c.id)}', ${!c.attached})">
        <div class="switch ${c.attached ? "on" : ""}"></div>
        <div>${esc(c.name)} ${c.active ? `<small>· ${T("active")}</small>` : ""}</div>
      </div>`).join("")}</div>` : `<div class="muted">${T("noChars")}</div>`}
  </div>
  <div class="card">
    <h2>${T("anims")}</h2>
    ${st.anims.length ? st.anims.map(animRow).join("") : `<div class="empty">${T("none")}</div>`}
  </div>
  <div class="card">
    <h2>${T("settings")}</h2>
    <div class="row">${T("reroll")}
      <input class="text" style="width:70px" type="number" min="5" value="${st.reroll[0]}" onchange="setReroll(this.value, null)"> ${T("to")}
      <input class="text" style="width:70px" type="number" min="6" value="${st.reroll[1]}" onchange="setReroll(null, this.value)"> ${T("sec")}
    </div>
  </div>
  <div class="card"><details><summary>${T("help")}</summary>${T("helpBody")}</details></div>`;
}

function animRow(a) {
  const w = a.idle?.weight ?? 0.04;
  return `<div class="anim ${a.enabled ? "" : "off"}">
    <div>
      <input class="title" value="${esc(a.title)}" onchange="upd('${a.id}', {title: this.value})">
      <div class="meta">${esc(a.kind.toUpperCase())}${a.source ? ` · ${esc(a.source)}` : ""} · ${a.duration || "?"} ${T("sec")} ·
        ${T("state")} <code title="${esc(T("stateHint"))}" onclick="copyState('as_${a.id}')">as_${esc(a.id)}</code></div>
    </div>
    <div class="row">
      <div class="opt"><div class="switch ${a.enabled ? "on" : ""}" onclick="upd('${a.id}', {enabled: ${!a.enabled}})"></div>${T("enabled")}</div>
      <button class="btn danger" onclick="del('${a.id}')">${T("del")}</button>
    </div>
    <div class="opts">
      <div class="opt"><div class="switch ${a.idle?.on ? "on" : ""}" onclick="upd('${a.id}', {idle: {on: ${!a.idle?.on}}})"></div>${T("bored")}
        ${a.idle?.on ? `<span class="muted">${T("rare")}</span><input type="range" min="0" max="100" value="${weightToSlider(w)}" onchange="upd('${a.id}', {idle: {weight: sliderToWeight(this.value)}})"><span class="muted">${T("often")}</span>` : ""}
      </div>
      <div class="opt">${T("music")}:
        ${["slow", "mid", "fast"].map((b) => `<span class="chip ${a.music?.[b] ? "on" : ""}" onclick="upd('${a.id}', {music: {${b}: ${!a.music?.[b]}}})">${T(b)}</span>`).join("")}
      </div>
      ${a.kind === "fbx" ? `<div class="opt"><div class="switch ${a.inplace ? "on" : ""}" onclick="upd('${a.id}', {inplace: ${!a.inplace}})"></div>${T("inplace")}</div>` : ""}
      <div class="opt">${T("speed")} <input type="range" min="50" max="150" value="${Math.round((a.speed || 1) * 100)}" onchange="upd('${a.id}', {speed: this.value / 100})"><span class="muted">×${(a.speed || 1).toFixed(2)}</span></div>
    </div>
  </div>`;
}

async function upd(id, patch) {
  await call("updateAnim", { id, patch });
  dirty = true;
  banner = null;
  await refresh();
}
async function del(id) {
  const a = st.anims.find((x) => x.id === id);
  if (!confirm(T("confirmDel")(a?.title || id))) return;
  await call("deleteAnim", { id });
  dirty = true;
  await refresh();
}
async function setChar(id, on) {
  await call("setCharacter", { id, on });
  dirty = true;
  banner = null;
  await refresh();
}
async function setReroll(lo, hi) {
  await call("setReroll", { lo: lo ?? st.reroll[0], hi: hi ?? st.reroll[1] });
  dirty = true;
  await refresh();
}
function copyState(s) {
  navigator.clipboard?.writeText(s).catch(() => {});
  toast(`${T("copied")}: ${s}`);
}
function toggleLang() {
  lang = lang === "ru" ? "en" : "ru";
  try { localStorage.setItem("as-lang", lang); } catch {}
  render();
}

async function apply() {
  busy = true;
  render();
  try {
    const r = await call("apply");
    if (!r.ok) banner = { cls: "err", text: T("timeout") };
    else if (r.problems?.length) banner = { cls: "err", text: `${T("problems")}\n${r.problems.join("\n")}` };
    else banner = { cls: "ok", text: T("applied")(r) };
    dirty = false;
  } catch (e) {
    banner = { cls: "err", text: e.message };
  }
  busy = false;
  await refresh();
}

// ── import dialog ──
async function startImport() {
  const { path } = await call("pickFile");
  if (!path) return;
  let info;
  try {
    info = await call("inspectFile", { path });
  } catch {
    banner = { cls: "err", text: T("unsupported") };
    return render();
  }
  const name = path.split(/[\\/]/).pop().replace(/\.[^.]+$/, "");
  const bg = document.createElement("div");
  bg.className = "modal-bg";
  bg.innerHTML = `<div class="modal">
    <h3>${T("imp")}</h3>
    <div class="muted" style="margin-bottom:10px">${esc(path)}</div>
    ${info.humanoid ? "" : `<div class="notice">${T("impNotHuman")}</div>`}
    ${info.kind === "glb" ? `<div class="muted">${T("impPick")}</div>
      <div style="max-height:300px;overflow:auto;margin:6px 0 10px">${info.animations.map((a, i) => `
        <label><input type="checkbox" class="pick" value="${esc(a.name)}" ${i < 1 ? "checked" : ""}> ${esc(a.name)} <span class="muted">${a.duration} ${T("sec")}</span></label>`).join("")}</div>`
      : `<div class="muted">${T("impTitle")}</div><input class="text" id="impTitle" value="${esc(name)}" style="margin:6px 0 10px">`}
    ${info.kind === "fbx" ? `<label><input type="checkbox" id="impInplace" checked> ${T("impInplace")}</label>` : ""}
    <div class="row" style="justify-content:flex-end;margin-top:14px">
      <button class="btn" id="impCancel">${T("cancel")}</button>
      <button class="btn primary" id="impOk">${T("impOk")}</button>
    </div></div>`;
  document.body.appendChild(bg);
  bg.querySelector("#impCancel").onclick = () => bg.remove();
  bg.querySelector("#impOk").onclick = async () => {
    const picks = [...bg.querySelectorAll(".pick:checked")].map((x) => x.value);
    const params = { path, title: bg.querySelector("#impTitle")?.value, inplace: bg.querySelector("#impInplace")?.checked };
    if (info.kind === "glb") {
      if (!picks.length) return;
      params.picks = picks;
    }
    bg.querySelector("#impOk").disabled = true;
    try {
      const r = await call("importFile", params);
      banner = { cls: "ok", text: T("added")(r.added.length) };
      dirty = true;
    } catch (e) {
      banner = { cls: "err", text: e.message };
    }
    bg.remove();
    await refresh();
  };
}

refresh().catch((e) => {
  document.getElementById("root").innerHTML = `<div class="err">Anim Studio: ${esc(e.message)}</div>`;
});

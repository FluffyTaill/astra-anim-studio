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
    show: "▶ Показать", showing: "Показываю…", shown: "Аватар перезапущен и играет анимацию (вместо приветствия). Изменения применены.",
    enabled: "Включена", bored: "Сама, от скуки", rare: "редко", often: "часто", music: "Под музыку",
    slow: "медленная", mid: "средняя", fast: "быстрая", inplace: "На месте", speed: "Скорость", del: "Удалить",
    state: "состояние", stateHint: "Нажми, чтобы скопировать. Посмотреть: Astra → Модель → Анимации → «Показать». Реакция на событие: Модель → Триггеры.",
    copied: "Скопировано", sec: "с",
    dirty: "Есть изменения — нажми «Применить», аватар перезапустится на пару секунд.",
    applied: (r) => `Готово: набор «${r.pack}» загружен, ${r.clips} анимаций.`,
    problems: "Движок сообщил о проблемах:", timeout: "Аватар не ответил за 90 с — проверь, что Astra запущена.",
    confirmDel: (t) => `Удалить «${t}»?`,
    imp: "Добавить анимацию", impTitle: "Название", impPick: "Какие анимации взять из файла", impInplace: "Закрепить на месте (не уходит за край окна) — рекомендуется для танцев",
    impNotHuman: "В файле не найден человеческий скелет (Hips). Анимация может не подойти аватару.",
    impOk: "Добавить", cancel: "Отмена", added: (n) => `Добавлено: ${n}. Теперь выбери, когда играть, и нажми «Применить».`,
    unsupported: "Этот файл не подходит: нужен .vrma, .fbx (Binary) или .glb с анимациями.",
    settings: "Танцы под музыку", reroll: "Менять танец каждые", to: "–",
    times: "Время", morning: "утро", day: "день", evening: "вечер", night: "ночь", anyTime: "в любое время",
    impTimes: "Когда играть (от скуки и под музыку)", lastTime: "Хотя бы одна часть суток должна остаться",
    timesHint: "утро 5–12 · день 12–18 · вечер 18–24 · ночь 0–5. Когда наступает другая часть суток, аватар перезапускается сам — как только ты минуту не трогаешь компьютер.",
    outfit: "Наряд", outfitOn: "Менять наряд по времени суток и погоде",
    outfitHint: "Выбери, какой из её вариантов (персонажей) надевать. Погода важнее времени. Если переоденешь её сам, твой выбор остаётся до следующей смены времени суток или погоды.",
    outfitByTime: "По времени суток", outfitByWeather: "По погоде", outfitKeep: "— не менять —",
    outfitCity: "Город для погоды", outfitFind: "Найти", outfitFromAstra: "из настроек Astra", outfitNow: "сейчас", outfitNotFound: "Такой город не найден.",
    outfitRestart: "Переодевание — это перезапуск аватара: он ждёт, пока ты минуту не трогаешь компьютер. Погода — Open-Meteo, туда уходят только координаты города.",
    wx_clear: "ясно", wx_cloud: "облачно", wx_rain: "дождь", wx_snow: "снег", wx_storm: "гроза",
    now: "сейчас", faceKeys: "по ключам редактора", faceKeysClear: "Сбросить ключи", expand: "Открыть настройки", collapse: "Свернуть",
    edit: "✎ Редактор", face: "Мимика", faceNone: "нет", happy: "радость", angry: "злость", sad: "грусть", relaxed: "спокойствие", surprised: "удивление",
    inPack: "В набор персонажа", inPackShort: "в наборе персонажа",
    inPackHint: "Анимация станет обычным состоянием её собственного набора: появится в Astra → Модель → Анимации, её можно повесить на триггеры и команды Astra, и она запускается сразу, без перезапуска аватара. Лицо и значок тоже работают. После включения нажми «Применить».",
    inPackNone: "У надетого персонажа встроенный набор — в него ничего не добавить. Сделай копию персонажа (Модель → Персонажи).",
    smooth: "Плавные танцы",
    smoothHint: "Танцы сменяют друг друга плавно, без стойки ожидания между ними: из танцевальных состояний набора убираются «вход» и «выход» (dance_in / dance_out) и бесконечный танец под темп, добавляются плавный переход и смена танца по интервалу ниже. Свой набор персонажа правится обратимо — выключи, и он станет как был. После изменения нажми «Применить».",
    fxLbl: "Значок", fxNone: "нет", fx_hearts: "💕 сердечки", fx_sparkle: "✨ искорки", fx_sweat: "💧 капля пота", fx_zzz: "💤 Z z z", fx_question: "❓ вопросики", fx_tears: "😢 слёзки", fx_notes: "🎵 ноты", fx_anger: "💢 злость",
    fxHint: "Лицо и значок над головой видны, когда анимация играет сама: «▶ Показать», поведение по времени суток, реакции на события. В случайных движениях от скуки и в танцах движок не различает, какой клип играет, — там их нет.",
    fxNoHub: "Набор этого персонажа не даёт подключить лицо и значок: в нём нет эффекта [interactions.none].",
    fingersLbl: "Пальцы", fingersStraight: "как в анимации", fingersHint: "Насколько согнуть пальцы к ладони поверх анимации — у Mixamo они часто прямые, как доска.",
    impFace: "Мимика лица (FBX станет VRMA)", impFingers: "Расслабить пальцы",
    life: "Время суток", lifeOn: "Поведение по времени суток", lifeVoice: "Говорить фразы",
    lifeHint: "Утром потягивается и здоровается, после долгого отсутствия машет, вечером иногда зевает, после полуночи зевает и намекает, что пора спать. В играх молчит.",
    lifeMorning: "Утро, первый раз за день", lifeBack: "Вернулся после 20+ минут", lifeEvening: "Вечер, после 22:00", lifeNight: "После полуночи",
    lifeNone: "— ничего —", lifeOwn: "из набора персонажа", lifeTest: "▶",
    cmds: "Команды Astra", cmdsOk: "Команды на месте — аватар будет реагировать и говорить.",
    cmdsMissing: "Чтобы аватар реагировал и говорил, нужны две команды Astra. Плагин может создать их сам.",
    cmdsRestart: "Команды записаны. Перезапусти Astra (значок в трее → Выход, затем открой снова), чтобы она их подхватила. До перезапуска не меняй команды в Astra — она перезапишет файл.",
    cmdsCreate: "Создать команды", cmdsCreated: (n) => `Создано команд: ${n}. Перезапусти Astra.`,
    help: "Где взять анимации и как это работает",
    helpBody: `<ul>
<li><b>Mixamo</b> (бесплатно, вход через Adobe): <a href="https://www.mixamo.com" target="_blank">mixamo.com</a> → Animations → Download: <i>FBX Binary, Without Skin, 30 fps</i>.</li>
<li><b>VRoid</b>: бесплатный набор VRMA-движений на BOOTH (VRoid Project).</li>
<li><b>Quaternius Universal Animation Library</b> (CC0): .glb с десятками анимаций — при добавлении выбери нужные.</li>
<li>Unity-файлы <code>.anim</code> не подходят.</li>
</ul>
<p>Каждая анимация получает своё состояние <code>as_…</code>: его видно в Astra → Модель → Анимации (кнопка «Показать»), его можно привязать к событиям в Модель → Триггеры. Команды Astra («Анимация компаньона») запускают только состояния набора самого персонажа, поэтому «Показать» и реакции со своими анимациями работают через быстрый перезапуск аватара.</p>
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
    show: "▶ Show", showing: "Showing…", shown: "The avatar restarted and plays the animation (instead of the greeting). Changes applied.",
    enabled: "Enabled", bored: "On her own, when bored", rare: "rare", often: "often", music: "To music",
    slow: "slow", mid: "mid", fast: "fast", inplace: "In place", speed: "Speed", del: "Delete",
    state: "state", stateHint: "Click to copy. Preview: Astra → Model → Animations → “Show”. React to an event: Model → Triggers.",
    copied: "Copied", sec: "s",
    dirty: "There are changes — click “Apply”, the avatar restarts for a couple of seconds.",
    applied: (r) => `Done: pack “${r.pack}” loaded, ${r.clips} animations.`,
    problems: "The engine reported problems:", timeout: "The avatar did not answer in 90 s — check that Astra is running.",
    confirmDel: (t) => `Delete “${t}”?`,
    imp: "Add animation", impTitle: "Title", impPick: "Which animations to take from the file", impInplace: "Lock in place (does not slide out of the window) — recommended for dances",
    impNotHuman: "No humanoid skeleton (Hips) found in the file. It may not fit the avatar.",
    impOk: "Add", cancel: "Cancel", added: (n) => `Added: ${n}. Now choose when to play it and click “Apply”.`,
    unsupported: "This file won't work: use .vrma, .fbx (Binary) or .glb with animations.",
    settings: "Dancing to music", reroll: "Switch dance every", to: "–",
    times: "Time", morning: "morning", day: "day", evening: "evening", night: "night", anyTime: "any time",
    impTimes: "When to play it (when bored and to music)", lastTime: "At least one part of the day has to stay",
    timesHint: "morning 5–12 · day 12–18 · evening 18–24 · night 0–5. When another part of the day begins the avatar restarts by itself — once you leave the computer alone for a minute.",
    outfit: "Outfit", outfitOn: "Change her outfit by the time of day and the weather",
    outfitHint: "Pick which of her versions (characters) to wear. The weather wins over the time. If you change her yourself, your pick stays until the next part of the day or weather.",
    outfitByTime: "By the time of day", outfitByWeather: "By the weather", outfitKeep: "— keep —",
    outfitCity: "City for the weather", outfitFind: "Find", outfitFromAstra: "from Astra's settings", outfitNow: "now", outfitNotFound: "No such city found.",
    outfitRestart: "Changing her outfit restarts the avatar: it waits until you leave the computer alone for a minute. Weather is Open-Meteo; only the city's coordinates are sent.",
    wx_clear: "clear", wx_cloud: "cloudy", wx_rain: "rain", wx_snow: "snow", wx_storm: "storm",
    now: "now", faceKeys: "by the editor’s keys", faceKeysClear: "Clear the keys", expand: "Open the settings", collapse: "Collapse",
    edit: "✎ Editor", face: "Face", faceNone: "none", happy: "happy", angry: "angry", sad: "sad", relaxed: "relaxed", surprised: "surprised",
    inPack: "Into the character's pack", inPackShort: "in the character's pack",
    inPackHint: "The animation becomes an ordinary state of her own pack: it shows in Astra → Model → Animations, Astra's triggers and commands can play it, and it starts at once, with no avatar restart. The face and the icon work too. Click “Apply” after turning it on.",
    inPackNone: "The character worn now has a built-in pack — nothing can be added to it. Make a copy of the character (Model → Characters).",
    smooth: "Smooth dances",
    smoothHint: "Dances flow into each other with no idle stance between them: the intro and outro (dance_in / dance_out) and the endless tempo-paced dance are taken out of the pack's dance states, and a crossfade and the switch interval below are added. Her own pack is edited reversibly — turn it off and it is as it was. Click “Apply” after changing it.",
    fxLbl: "Icon", fxNone: "none", fx_hearts: "💕 hearts", fx_sparkle: "✨ sparkles", fx_sweat: "💧 sweat drop", fx_zzz: "💤 Z z z", fx_question: "❓ question marks", fx_tears: "😢 tears", fx_notes: "🎵 notes", fx_anger: "💢 anger",
    fxHint: "The face and the icon over her head show while the animation plays as itself: “▶ Show”, behaviour by the time of day, reactions to events. Among the random idle moves and the dances the engine can't tell which clip plays, so they don't show there.",
    fxNoHub: "This character's pack has no [interactions.none] effect to attach a face and an icon to.",
    fingersLbl: "Fingers", fingersStraight: "as animated", fingersHint: "How far the fingers bend towards the palm on top of the animation — Mixamo often leaves them straight as a board.",
    impFace: "Face expression (an FBX becomes a VRMA)", impFingers: "Relax the fingers",
    life: "Time of day", lifeOn: "Behaviour by the time of day", lifeVoice: "Say phrases",
    lifeHint: "In the morning she stretches and says hello, after a long absence she waves, in the evening she yawns now and then, after midnight she yawns and hints it is time to sleep. Silent in games.",
    lifeMorning: "Morning, first time that day", lifeBack: "Back after 20+ minutes", lifeEvening: "Evening, after 22:00", lifeNight: "After midnight",
    lifeNone: "— nothing —", lifeOwn: "from the character's pack", lifeTest: "▶",
    cmds: "Astra commands", cmdsOk: "The commands are in place — the avatar will react and talk.",
    cmdsMissing: "For the avatar to react and talk, two Astra commands are needed. The plugin can create them.",
    cmdsRestart: "The commands are written. Restart Astra (tray icon → Exit, then open it again) so it picks them up. Don't change commands in Astra before that — it would overwrite the file.",
    cmdsCreate: "Create commands", cmdsCreated: (n) => `Commands created: ${n}. Restart Astra.`,
    help: "Where to get animations and how it works",
    helpBody: `<ul>
<li><b>Mixamo</b> (free, Adobe sign-in): <a href="https://www.mixamo.com" target="_blank">mixamo.com</a> → Animations → Download: <i>FBX Binary, Without Skin, 30 fps</i>.</li>
<li><b>VRoid</b>: the free VRMA motion set on BOOTH (VRoid Project).</li>
<li><b>Quaternius Universal Animation Library</b> (CC0): .glb with dozens of animations — pick the ones you want when adding.</li>
<li>Unity <code>.anim</code> files don't work.</li>
</ul>
<p>Each animation gets its own state <code>as_…</code>: see it in Astra → Model → Animations (“Show”), bind it to events in Model → Triggers. Astra commands (“Companion animation”) only cue the states of the character’s own pack, so Show and reactions with studio animations go through a quick avatar restart.</p>
<p>“When bored” — she sometimes plays it by herself while idle. “To music” — when Astra hears music of that tempo.</p>`
  }
};
let lang = (() => {
  try { return localStorage.getItem("as-lang") || (navigator.language || "ru").slice(0, 2); } catch { return "ru"; }
})();
if (!I18N[lang]) lang = "en";
const T = (k) => I18N[lang][k];

let st = { anims: [], characters: { list: [] }, reroll: [20, 35], life: {}, commands: {} };
const PERIODS = ["morning", "day", "evening", "night"];
const EXPRESSIONS = ["happy", "angry", "sad", "relaxed", "surprised"];
const OWN_STATES = { morning: "stretch", back: "hello", evening: "yawn", night: "yawn" };
// no `times` = all four parts of the day
const timesOf = (a) => (Array.isArray(a.times) && a.times.length ? a.times : PERIODS);
let dirty = false;
let banner = null; // {cls, text}
let busy = false;
let previewing = null;

const call = (m, p = {}) => window.astra.callBackend(m, p);
const esc = (x) => String(x ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function toast(t) {
  const el = document.getElementById("toast");
  el.textContent = t;
  el.style.display = "block";
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (el.style.display = "none"), 2600);
}
// 0.01 … 1.0 (a plain idle pose weighs 1.0)
const weightToSlider = (w) => Math.max(0, Math.min(100, Math.round(Math.log(w / 0.01) / Math.log(100) * 100)));
const sliderToWeight = (v) => Math.round(0.01 * Math.pow(100, v / 100) * 1000) / 1000;

async function refresh() {
  st = await call("getState");
  render();
  if (st.outfit?.on && !wx) {
    wx = { place: null, kind: "" };
    call("outfitWeather").then((w) => { wx = w; render(); }).catch(() => {});
  }
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
  ${lifeCard()}
  ${outfitCard()}
  <div class="card">
    <h2>${T("settings")}</h2>
    <div class="opts" style="margin-bottom:10px">
      <div class="opt" title="${esc(T("smoothHint"))}"><div class="switch ${st.smoothDance !== false ? "on" : ""}" onclick="setSmooth(${st.smoothDance === false})"></div>${T("smooth")}</div>
    </div>
    <div class="row">${T("reroll")}
      <input class="text" style="width:70px" type="number" min="5" value="${st.reroll[0]}" onchange="setReroll(this.value, null)"> ${T("to")}
      <input class="text" style="width:70px" type="number" min="6" value="${st.reroll[1]}" onchange="setReroll(null, this.value)"> ${T("sec")}
    </div>
  </div>
  <div class="card"><details><summary>${T("help")}</summary>${T("helpBody")}</details></div>`;
}

// One open at a time: a click on an animation's header opens its settings under it, a second closes them.
let openAnim = (() => {
  try { return localStorage.getItem("as-open") || null; } catch { return null; }
})();
function toggleAnim(id) {
  openAnim = openAnim === id ? null : id;
  try { localStorage.setItem("as-open", openAnim || ""); } catch {}
  render();
}

// what the closed header says about when she plays it
function animSummary(a) {
  const parts = [];
  if (a.base) parts.push(T("inPackShort"));
  if (a.idle?.on) parts.push(T("bored"));
  const bands = ["slow", "mid", "fast"].filter((b) => a.music?.[b]);
  if (bands.length) parts.push(`${T("music")}: ${bands.map((b) => T(b)).join(", ")}`);
  const times = timesOf(a);
  parts.push(times.length === PERIODS.length ? T("anyTime") : times.map((p) => T(p)).join(", "));
  if (hasFaceKeys(a)) parts.push(T("faceKeys"));
  else if (a.expr) parts.push(T(a.expr));
  if (a.fx) parts.push(T("fx_" + a.fx));
  return parts.join(" · ");
}

// face keys set in the editor take the place of the expression picked in the list
const hasFaceKeys = (a) => Object.values(a.edit?.face || {}).some((k) => k?.length);
async function clearFaceKeys(id) {
  const a = st.anims.find((x) => x.id === id);
  try {
    await call("editorSave", { id, edit: { ...(a.edit || {}), face: {} } });
    dirty = true;
    banner = null;
  } catch (e) {
    banner = { cls: "err", text: e.message };
  }
  await refresh();
}

function animRow(a) {
  const w = a.idle?.weight ?? 0.15;
  const open = openAnim === a.id;
  // a click on a control inside the header must not open or close the settings
  const stop = "event.stopPropagation();";
  return `<div class="anim ${a.enabled ? "" : "off"} ${open ? "open" : ""}">
    <div class="anim-head" onclick="toggleAnim('${a.id}')" title="${esc(T(open ? "collapse" : "expand"))}">
      <span class="caret">${open ? "▾" : "▸"}</span>
      <div class="anim-name">
        <div class="name">${esc(a.title)}</div>
        <div class="meta">${esc(a.kind.toUpperCase())} · ${a.duration || "?"} ${T("sec")} · ${esc(animSummary(a))}</div>
      </div>
      <div class="row" onclick="${stop}">
        <button class="btn primary" onclick="preview('${a.id}')" ${busy ? "disabled" : ""}>${previewing === a.id ? T("showing") : T("show")}</button>
        ${a.kind === "glb" ? "" : `<button class="btn" onclick="openEditor('${a.id}')">${T("edit")}</button>`}
        <div class="switch ${a.enabled ? "on" : ""}" title="${esc(T("enabled"))}" onclick="upd('${a.id}', {enabled: ${!a.enabled}})"></div>
      </div>
    </div>
    ${open ? `<div class="anim-body">
      <div class="opts">
        <div class="opt">${T("impTitle")} <input class="text" style="width:260px" value="${esc(a.title)}" onchange="upd('${a.id}', {title: this.value})"></div>
        <div class="opt muted">${T("state")} <code title="${esc(T("stateHint"))}" onclick="copyState('as_${a.id}')">as_${esc(a.id)}</code>${a.source ? ` · ${esc(a.source)}` : ""}</div>
      </div>
      <div class="opts">
        <div class="opt"><div class="switch ${a.idle?.on ? "on" : ""}" onclick="upd('${a.id}', {idle: {on: ${!a.idle?.on}}})"></div>${T("bored")}
          ${a.idle?.on ? `<span class="muted">${T("rare")}</span><input type="range" min="0" max="100" value="${weightToSlider(w)}" onchange="upd('${a.id}', {idle: {weight: sliderToWeight(this.value)}})"><span class="muted">${T("often")}</span>` : ""}
        </div>
        <div class="opt">${T("music")}:
          ${["slow", "mid", "fast"].map((b) => `<span class="chip ${a.music?.[b] ? "on" : ""}" onclick="upd('${a.id}', {music: {${b}: ${!a.music?.[b]}}})">${T(b)}</span>`).join("")}
        </div>
        <div class="opt" title="${esc(T("timesHint"))}">${T("times")}:
          ${PERIODS.map((p) => `<span class="chip ${timesOf(a).includes(p) ? "on" : ""}" onclick="toggleTime('${a.id}', '${p}')">${T(p)}</span>`).join("")}
        </div>
      </div>
      <div class="opts">
        <div class="opt"><div class="switch ${a.inplace ? "on" : ""}" onclick="upd('${a.id}', {inplace: ${!a.inplace}})"></div>${T("inplace")}</div>
        <div class="opt" title="${esc(T(st.basePack ? "inPackHint" : "inPackNone"))}"><div class="switch ${a.base ? "on" : ""} ${st.basePack ? "" : "disabled"}" onclick="${st.basePack ? `upd('${a.id}', {base: ${!a.base}})` : ""}"></div>${T("inPack")}</div>
        <div class="opt">${T("speed")} <input type="range" min="50" max="150" value="${Math.round((a.speed || 1) * 100)}" onchange="upd('${a.id}', {speed: this.value / 100})"><span class="muted">×${(a.speed || 1).toFixed(2)}</span></div>
        ${a.kind === "glb" ? "" : `
        <div class="opt">${T("face")}
          ${hasFaceKeys(a) ? `<span class="muted">${T("faceKeys")}</span><button class="btn" onclick="clearFaceKeys('${a.id}')">${T("faceKeysClear")}</button>` : `
          <select class="text" style="width:auto" onchange="upd('${a.id}', {expr: this.value})">
            ${["", ...EXPRESSIONS].map((e) => `<option value="${e}" ${(a.expr || "") === e ? "selected" : ""}>${e ? T(e) : T("faceNone")}</option>`).join("")}
          </select>`}</div>
        <div class="opt" title="${esc(T(st.fxHub ? "fxHint" : "fxNoHub"))}">${T("fxLbl")}
          <select class="text" style="width:auto" ${st.fxHub ? "" : "disabled"} onchange="upd('${a.id}', {fx: this.value})">
            ${["", ...(st.fxIcons || [])].map((f) => `<option value="${f}" ${(a.fx || "") === f ? "selected" : ""}>${f ? T("fx_" + f) : T("fxNone")}</option>`).join("")}
          </select></div>
        <div class="opt" title="${esc(T("fingersHint"))}">${T("fingersLbl")} <input type="range" min="0" max="60" value="${a.fingers || 0}" onchange="upd('${a.id}', {fingers: Number(this.value)})"><span class="muted">${a.fingers ? `${a.fingers}°` : T("fingersStraight")}</span></div>`}
      </div>
      <div class="row" style="justify-content:flex-end">
        <button class="btn" onclick="toggleAnim('${a.id}')">${T("collapse")}</button>
        <button class="btn danger" onclick="del('${a.id}')">${T("del")}</button>
      </div>
    </div>` : ""}
  </div>`;
}

// ── outfit: which character (her outfits) by the part of the day and the weather ──
let wx = null; // { place, kind } — asked for once per refresh while the rules are on
function outfitCard() {
  const o = st.outfit || { time: {}, weather: {} };
  const chars = st.characters?.list || [];
  const sel = (group, k) => `<select class="text" style="width:auto;min-width:190px" onchange="setOutfit({${group}: {${k}: this.value}})">
      <option value="">${T("outfitKeep")}</option>
      ${chars.map((c) => `<option value="${esc(c.id)}" ${o[group]?.[k] === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}
    </select>`;
  const row = (label, html) => `<div class="opt" style="justify-content:space-between;min-width:min(460px,100%)"><span>${label}</span>${html}</div>`;
  const place = wx?.place;
  return `<div class="card">
    <h2>${T("outfit")}</h2>
    <div class="muted" style="margin-bottom:10px">${T("outfitHint")}</div>
    <div class="opts" style="margin-bottom:10px">
      <div class="opt"><div class="switch ${o.on ? "on" : ""}" onclick="setOutfit({on: ${!o.on}})"></div>${T("outfitOn")}</div>
    </div>
    ${o.on ? `
    <div style="display:grid;gap:8px;margin-bottom:12px">
      <div class="muted">${T("outfitByTime")}</div>
      ${PERIODS.map((p) => row(T(p), sel("time", p))).join("")}
    </div>
    <div style="display:grid;gap:8px">
      <div class="muted">${T("outfitByWeather")}</div>
      <div class="row">
        ${place?.fromAstra ? `<span class="muted">${esc(place.name)} (${T("outfitFromAstra")})</span>` : `
        <input class="text" id="outfitCity" style="width:220px" placeholder="${esc(T("outfitCity"))}" value="${esc(o.place?.name || "")}">
        <button class="btn" onclick="setOutfit({city: document.getElementById('outfitCity').value})">${T("outfitFind")}</button>`}
        ${place ? `<span class="muted">${T("outfitNow")}: ${wx?.kind ? T("wx_" + wx.kind) : "…"}</span>` : ""}
      </div>
      ${["clear", "cloud", "rain", "snow", "storm"].map((k) => row(T("wx_" + k), sel("weather", k))).join("")}
    </div>
    <div class="muted" style="margin-top:10px">${T("outfitRestart")}</div>` : ""}
  </div>`;
}
async function setOutfit(patch) {
  try {
    await call("setOutfit", { patch });
    banner = null;
  } catch (e) {
    banner = { cls: "err", text: patch.city !== undefined ? T("outfitNotFound") : e.message };
  }
  wx = null;
  await refresh();
}

function lifeCard() {
  const L = st.life || {};
  const c = st.commands || {};
  const all = ["anim_play", "anim_say"];
  const listening = all.every((t) => c[t]?.listening);
  const inFile = all.every((t) => c[t]?.inFile);
  const cmds = listening ? `<div class="ok">${T("cmdsOk")}</div>`
    : inFile ? `<div class="notice">${T("cmdsRestart")}</div>`
    : `<div class="notice">${T("cmdsMissing")} <button class="btn primary" style="margin-left:8px" onclick="createCommands()">${T("cmdsCreate")}</button></div>`;
  // what she can play: the state her own pack has for it, or any of the studio's animations
  const select = (k) => {
    const opts = [[OWN_STATES[k], `${OWN_STATES[k]} (${T("lifeOwn")})`], ["", T("lifeNone")], ...st.anims.map((a) => [`as_${a.id}`, a.title])];
    if (L[k] && !opts.some(([v]) => v === L[k])) opts.push([L[k], L[k]]);
    return `<select class="text" style="width:auto;min-width:200px" onchange="setLife({${k}: this.value})">
      ${opts.map(([v, t]) => `<option value="${esc(v)}" ${v === (L[k] ?? "") ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>`;
  };
  const row = (k, label, phrase) => `<div class="opt" style="justify-content:space-between;min-width:min(460px,100%)">
    <span>${label}</span><span class="row">${select(k)}<button class="btn" title="${esc(label)}" onclick="testLife('${phrase}', '${k}')">${T("lifeTest")}</button></span></div>`;
  return `<div class="card">
    <h2>${T("life")} <span class="muted">· ${T("now")}: ${T(st.period || "day")}</span></h2>
    <div class="muted" style="margin-bottom:10px">${T("lifeHint")}</div>
    ${cmds}
    <div class="opts" style="margin-bottom:10px">
      <div class="opt"><div class="switch ${L.on ? "on" : ""}" onclick="setLife({on: ${!L.on}})"></div>${T("lifeOn")}</div>
      <div class="opt"><div class="switch ${L.voice ? "on" : ""}" onclick="setLife({voice: ${!L.voice}})"></div>${T("lifeVoice")}</div>
    </div>
    ${L.on ? `<div style="display:grid;gap:8px">
      ${row("morning", T("lifeMorning"), "morning")}${row("back", T("lifeBack"), "back")}
      ${row("evening", T("lifeEvening"), "")}${row("night", T("lifeNight"), "night")}</div>` : ""}
    <div class="muted" style="margin-top:10px">${T("timesHint")}</div>
  </div>`;
}

async function toggleTime(id, p) {
  const a = st.anims.find((x) => x.id === id);
  const cur = timesOf(a);
  const next = cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p];
  if (!next.length) return toast(T("lastTime"));
  await upd(id, { times: next });
}
async function setLife(patch) {
  await call("setLife", { patch });
  await refresh();
}
async function testLife(phrase, k) {
  await call("testLife", { phrase, state: st.life?.[k] || "" });
}
async function createCommands() {
  try {
    const r = await call("createCommands");
    banner = { cls: "ok", text: T("cmdsCreated")(r.added) };
  } catch (e) {
    banner = { cls: "err", text: e.message };
  }
  await refresh();
}

async function upd(id, patch) {
  await call("updateAnim", { id, patch });
  dirty = true;
  banner = null;
  await refresh();
}
// Astra shows plugin pages in a sandboxed frame where window.confirm() is blocked (it silently
// answers "no"), so questions are asked with an in-page dialog.
function ask(text, okLabel) {
  return new Promise((resolve) => {
    const bg = document.createElement("div");
    bg.className = "modal-bg";
    bg.innerHTML = `<div class="modal"><h3>${esc(text)}</h3>
      <div class="row" style="justify-content:flex-end;margin-top:14px">
        <button class="btn" data-a="0">${T("cancel")}</button>
        <button class="btn danger" data-a="1">${esc(okLabel)}</button>
      </div></div>`;
    bg.onclick = (e) => {
      const a = e.target.dataset?.a;
      if (a === undefined && e.target !== bg) return;
      bg.remove();
      resolve(a === "1");
    };
    document.body.appendChild(bg);
  });
}

// The editor (three.js + three-vrm, ~0.8 MB) is loaded the first time it is opened.
function loadEditor() {
  if (window.AnimEditor) return Promise.resolve(window.AnimEditor);
  return (loadEditor.p ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "editor.js";
    s.onload = () => resolve(window.AnimEditor);
    s.onerror = () => reject(new Error("editor.js did not load"));
    document.head.appendChild(s);
  }));
}
async function openEditor(id) {
  const a = st.anims.find((x) => x.id === id);
  try {
    const ed = await loadEditor();
    await ed.open(a, {
      lang, call, esc, toast, ask,
      onSaved: () => { dirty = true; banner = null; refresh(); }
    });
  } catch (e) {
    banner = { cls: "err", text: e.message };
    render();
  }
}

async function del(id) {
  const a = st.anims.find((x) => x.id === id);
  if (!(await ask(T("confirmDel")(a?.title || id), T("del")))) return;
  try {
    await call("deleteAnim", { id });
    dirty = true;
    banner = null;
  } catch (e) {
    banner = { cls: "err", text: e.message };
  }
  await refresh();
}
async function setChar(id, on) {
  await call("setCharacter", { id, on });
  dirty = true;
  banner = null;
  await refresh();
}
async function setSmooth(on) {
  await call("setSmooth", { on });
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

// Apply and Show restart the avatar, which can take longer than a call may wait (Astra brings the
// engine back after up to 30 s when it was restarted a few times in a row): the backend answers at
// once with a job, and the page asks how it went.
async function runJob(method, params) {
  const started = await call(method, params);
  for (let i = 0; i < 150; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const j = await call("job");
    if (j && j.id === started.id && j.done) return j.result;
  }
  return { ok: false, note: "timeout" };
}

async function apply() {
  busy = true;
  render();
  try {
    const r = await runJob("apply");
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

async function preview(id) {
  busy = true;
  previewing = id;
  render();
  try {
    const r = await runJob("preview", { id });
    banner = r.ok ? (r.problems?.length ? { cls: "err", text: `${T("problems")}\n${r.problems.join("\n")}` } : { cls: "ok", text: T("shown") })
      : { cls: "err", text: T("timeout") };
  } catch (e) {
    banner = { cls: "err", text: e.message };
  }
  busy = false;
  previewing = null;
  await refresh();
}

// ── import dialog ──
async function startImport() {
  const { path } = await call("pickFile");
  if (!path) return;
  let info;
  try {
    info = await call("inspectFile", { path });
  } catch (e) {
    const why = String(e?.message || "");
    banner = { cls: "err", text: /unsupported|noanims/.test(why) ? T("unsupported") : `${T("unsupported")}
${why}` };
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
    <div class="muted">${T("impTimes")}</div>
    <div class="row" style="margin:6px 0 4px">${PERIODS.map((p) => `<span class="chip on" data-time="${p}">${T(p)}</span>`).join("")}</div>
    <div class="muted" style="margin-bottom:10px">${T("timesHint")}</div>
    ${info.kind === "glb" ? "" : `
    <div class="row" style="margin:6px 0">${T("impFace")}
      <select class="text" style="width:auto" id="impExpr">${["", ...EXPRESSIONS].map((e) => `<option value="${e}">${e ? T(e) : T("faceNone")}</option>`).join("")}</select></div>
    <label><input type="checkbox" id="impFingers" checked> ${T("impFingers")}</label>`}
    <label><input type="checkbox" id="impInplace" checked> ${T("impInplace")}</label>
    <div class="row" style="justify-content:flex-end;margin-top:14px">
      <button class="btn" id="impCancel">${T("cancel")}</button>
      <button class="btn primary" id="impOk">${T("impOk")}</button>
    </div></div>`;
  document.body.appendChild(bg);
  bg.querySelector("#impCancel").onclick = () => bg.remove();
  for (const chip of bg.querySelectorAll("[data-time]")) {
    chip.onclick = () => {
      if (chip.classList.contains("on") && bg.querySelectorAll("[data-time].on").length === 1) return toast(T("lastTime"));
      chip.classList.toggle("on");
    };
  }
  bg.querySelector("#impOk").onclick = async () => {
    const picks = [...bg.querySelectorAll(".pick:checked")].map((x) => x.value);
    const times = [...bg.querySelectorAll("[data-time].on")].map((x) => x.dataset.time);
    const params = { path, title: bg.querySelector("#impTitle")?.value, inplace: bg.querySelector("#impInplace")?.checked, times,
      expr: bg.querySelector("#impExpr")?.value || undefined, fingers: bg.querySelector("#impFingers")?.checked ? 20 : 0 };
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

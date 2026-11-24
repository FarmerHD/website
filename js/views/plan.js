import { html, useMemo, useState, useRef, useEffect } from "../lib/preact.js";
import { write, newId } from "../lib/offline.js";
import { mergeLines, canMerge } from "../lib/categorize.js";
import { CATEGORY_STYLE, WEEKDAYS } from "../lib/constants.js";
import { startOfWeek, toDateKey, addWeeks, formatWeekRange, relativeWeekLabel } from "../lib/format.js";
import { IconCart, IconCalendar, IconSearch } from "../lib/icons.js";

const UNASSIGNED = "";
const SHORT_DAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

function dayDate(weekStartKey, idx) {
  const d = new Date(weekStartKey + "T00:00:00");
  d.setDate(d.getDate() + idx);
  return d;
}

// Ziehen per Pointer Events: funktioniert mit Maus, Finger und Stift.
// Gezogen wird am Griff (touch-action:none), damit die Seite sonst normal
// scrollt. Antippen ohne Ziehen öffnet stattdessen die Tagesauswahl — das
// ist zugleich der Weg ohne Ziehen (Tastatur, Screenreader).
function useDragMove(onDrop) {
  const st = useRef(null);
  const lastDragEnd = useRef(0);
  const dropRef = useRef(onDrop);
  dropRef.current = onDrop;
  const [dragId, setDragId] = useState(null);
  const [over, setOver] = useState(null);

  function hit(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    const item = el.closest("[data-plan-item]");
    if (item && item.getAttribute("data-plan-item") !== st.current.id) return { item: item.getAttribute("data-plan-item") };
    const day = el.closest("[data-plan-day]");
    if (day) return { day: day.getAttribute("data-plan-day") };
    return null;
  }
  function cleanup() {
    const s = st.current;
    if (!s) return;
    if (s.ghost) s.ghost.remove();
    if (s.timer) clearInterval(s.timer);
    document.body.classList.remove("plan-dragging");
    st.current = null;
    setDragId(null);
    setOver(null);
  }
  useEffect(() => cleanup, []);

  function onPointerDown(e, id) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    st.current = { id, card: e.currentTarget.closest("[data-plan-item]"), x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, active: false };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
  }
  function onPointerMove(e) {
    const s = st.current;
    if (!s) return;
    s.x = e.clientX; s.y = e.clientY;
    if (!s.active) {
      if (Math.hypot(s.x - s.x0, s.y - s.y0) < 6) return;
      s.active = true;
      const r = s.card.getBoundingClientRect();
      s.dx = s.x0 - r.left; s.dy = s.y0 - r.top;
      const g = s.card.cloneNode(true);
      g.classList.add("plan-drag-ghost");
      g.removeAttribute("data-plan-item");
      g.style.width = r.width + "px";
      document.body.appendChild(g);
      s.ghost = g;
      document.body.classList.add("plan-dragging");
      setDragId(s.id);
      // Am Bildschirmrand automatisch scrollen (wichtig am Handy).
      s.timer = setInterval(() => {
        const edge = 70, h = window.innerHeight;
        if (s.y < edge) window.scrollBy(0, -Math.ceil((edge - s.y) / 4));
        else if (s.y > h - edge) window.scrollBy(0, Math.ceil((s.y - (h - edge)) / 4));
      }, 16);
    }
    e.preventDefault();
    s.ghost.style.transform = `translate(${s.x - s.dx}px, ${s.y - s.dy}px) rotate(1.5deg)`;
    const h = hit(s.x, s.y);
    const key = h ? (h.item || "day:" + h.day) : null;
    if (key !== s.overKey) { s.overKey = key; s.over = h; setOver(h); }
  }
  function onPointerUp() {
    const s = st.current;
    if (!s) return;
    if (!s.active) { st.current = null; return; }
    const h = s.over, id = s.id;
    cleanup();
    lastDragEnd.current = Date.now();
    if (h) dropRef.current(id, h);
  }
  // Klick direkt nach dem Loslassen gehört noch zum Ziehen.
  function wasDrag() {
    const r = Date.now() - lastDragEnd.current < 350;
    lastDragEnd.current = 0;
    return r;
  }
  return {
    dragId, over, wasDrag,
    handleProps: (id) => ({ onPointerDown: (e) => onPointerDown(e, id), onPointerMove, onPointerUp, onPointerCancel: cleanup }),
  };
}

function WeekBoard({ items, weekStart, editable, onMove, onSwap }) {
  const [openId, setOpenId] = useState(null);
  const drag = useDragMove((id, target) => {
    if (target.item) onSwap(id, target.item);
    else if (target.day !== undefined) onMove(id, target.day);
  });
  const todayKey = toDateKey(new Date());
  const byDay = new Map([...WEEKDAYS, UNASSIGNED].map((d) => [d, []]));
  for (const item of items) {
    const d = item.weekday && byDay.has(item.weekday) ? item.weekday : UNASSIGNED;
    byDay.get(d).push(item);
  }
  const days = byDay.get(UNASSIGNED).length > 0 ? [...WEEKDAYS, UNASSIGNED] : WEEKDAYS;

  function chip(it) {
    const open = openId === it.id;
    const isOver = drag.over && drag.over.item === it.id;
    if (!editable) return html`<span class="chip plan-view-chip" key=${it.id}>${it.recipe_name} · ${it.portions}×</span>`;
    return html`
      <div class="plan-item ${drag.dragId === it.id ? "is-dragging" : ""} ${isOver ? "is-over" : ""}" key=${it.id} data-plan-item=${it.id}>
        <div class="plan-item-row">
          <button type="button" class="plan-item-handle" aria-label=${it.recipe_name + " verschieben"} aria-expanded=${open}
            title="Ziehen zum Verschieben, antippen für Tagesauswahl"
            ...${drag.handleProps(it.id)}
            onClick=${() => { if (!drag.wasDrag()) setOpenId(open ? null : it.id); }}>
            <svg viewBox="0 0 24 24" aria-hidden="true">${[[9, 6], [15, 6], [9, 12], [15, 12], [9, 18], [15, 18]].map(([cx, cy]) => html`<circle cx=${cx} cy=${cy} r="1.5" fill="currentColor" />`)}</svg>
          </button>
          <button type="button" class="plan-item-name" onClick=${() => setOpenId(open ? null : it.id)}>
            <span class="n">${it.recipe_name}</span><span class="p">${it.portions}×</span>
          </button>
        </div>
        ${open && html`
          <div class="plan-move" role="group" aria-label="Verschieben nach">
            ${WEEKDAYS.map((d, i) => html`
              <button type="button" class="plan-move-btn ${(it.weekday || "") === d ? "on" : ""}" disabled=${(it.weekday || "") === d}
                aria-label=${d} onClick=${() => { onMove(it.id, d); setOpenId(null); }}>${SHORT_DAYS[i]}</button>
            `)}
            <button type="button" class="plan-move-btn wide ${!it.weekday ? "on" : ""}" disabled=${!it.weekday}
              onClick=${() => { onMove(it.id, UNASSIGNED); setOpenId(null); }}>Ohne Tag</button>
          </div>
        `}
      </div>
    `;
  }

  return html`
    <div class="plan-week plan-week-view">
      ${days.map((day) => {
        const idx = WEEKDAYS.indexOf(day);
        const date = idx >= 0 && weekStart ? dayDate(weekStart, idx) : null;
        const isToday = date && toDateKey(date) === todayKey;
        const isOver = drag.over && drag.over.day === day;
        return html`
          <div class="plan-day-row ${isOver ? "is-over" : ""} ${isToday ? "is-today" : ""}" key=${day || "none"} data-plan-day=${day}>
            <span class="plan-day-label ${day ? "" : "muted"}">
              ${day || "Ohne Tag"}
              ${date && html`<small>${isToday ? "Heute" : `${date.getDate()}.${date.getMonth() + 1}.`}</small>`}
            </span>
            <div class="plan-day-items">
              ${byDay.get(day).length === 0 ? html`<span class="plan-day-empty">–</span>` : byDay.get(day).map(chip)}
            </div>
          </div>
        `;
      })}
    </div>
  `;
}

function PlanHistory({ planSnapshot }) {
  const [shown, setShown] = useState(6);
  const weeks = useMemo(() => {
    const m = new Map();
    for (const it of planSnapshot) {
      if (!it.week_start) continue;
      if (!m.has(it.week_start)) m.set(it.week_start, []);
      m.get(it.week_start).push(it);
    }
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [planSnapshot]);
  const top = useMemo(() => {
    const since = toDateKey(addWeeks(startOfWeek(new Date()), -8));
    const c = new Map();
    for (const it of planSnapshot) {
      if (!it.week_start || it.week_start < since) continue;
      const cur = c.get(it.recipe_name) || { name: it.recipe_name, n: 0, last: it.week_start };
      cur.n += 1;
      if (it.week_start > cur.last) cur.last = it.week_start;
      c.set(it.recipe_name, cur);
    }
    return [...c.values()].sort((a, b) => b.n - a.n || (a.last < b.last ? 1 : -1)).slice(0, 5);
  }, [planSnapshot]);

  if (weeks.length === 0) return html`
    <div class="empty-state">
      <${IconCalendar} />
      <h3>Noch kein Verlauf</h3>
      <p>Sobald du eine Einkaufsliste erstellst, wird die Woche hier gespeichert. So siehst du später, was es wann gab.</p>
    </div>
  `;
  const dayIdx = (w) => (w && WEEKDAYS.indexOf(w) >= 0 ? WEEKDAYS.indexOf(w) : 99);
  return html`
    <div class="plan-history">
      ${top.length > 1 && html`
        <div class="card card-pad plan-history-top">
          <h3 class="section-title" style="margin-top:0">Am häufigsten geplant (letzte 8 Wochen)</h3>
          ${top.map((t) => html`<div class="plan-history-line" key=${t.name}><span class="n">${t.name}</span><span class="m">${t.n}×</span></div>`)}
        </div>
      `}
      ${weeks.slice(0, shown).map(([wk, items]) => html`
        <div class="card plan-history-week" key=${wk}>
          <div class="plan-history-head">
            <b>${relativeWeekLabel(wk) || formatWeekRange(wk).split(" · ")[0]}</b>
            <span>${formatWeekRange(wk)}</span>
          </div>
          ${[...items].sort((a, b) => dayIdx(a.weekday) - dayIdx(b.weekday)).map((it) => html`
            <div class="plan-history-line" key=${it.id}>
              <span class="d">${it.weekday ? SHORT_DAYS[dayIdx(it.weekday)] + " " + (() => { const d = dayDate(wk, dayIdx(it.weekday)); return `${d.getDate()}.${d.getMonth() + 1}.`; })() : "–"}</span>
              <span class="n">${it.recipe_name}</span>
              <span class="m">${it.portions}×</span>
            </div>
          `)}
        </div>
      `)}
      ${weeks.length > shown && html`<button type="button" class="btn btn-ghost" onClick=${() => setShown((n) => n + 6)}>Ältere Wochen anzeigen</button>`}
    </div>
  `;
}

export function PlanView({ recipes, planItems, onPlanChange, shoppingItems, onShoppingChange, planSnapshot, onPlanSnapshotChange, showToast, userId }) {
  const [generating, setGenerating] = useState(false);
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState("plan"); // "plan" | "view" — je Fenster/Tab unabhängig, bewusst nicht gespeichert
  // Für welche Woche gerade geplant wird. Standard ist die laufende Woche;
  // wer sonntags die kommende Woche plant, blättert einmal weiter.
  const [weekStart, setWeekStart] = useState(() => toDateKey(startOfWeek(new Date())));

  // Die Momentaufnahme gehört zu genau einer Woche — das Datum steht in jeder
  // ihrer Zeilen. Ältere Einträge (vor Einführung der Spalte) haben keins.
  // Seit es den Verlauf gibt, bleiben alle Wochen gespeichert. "Ansicht"
  // zeigt eine davon — standardmäßig die laufende, sonst die neueste.
  const snapshotWeeks = useMemo(() => [...new Set(planSnapshot.map((it) => it.week_start).filter(Boolean))].sort(), [planSnapshot]);
  const [viewWeek, setViewWeek] = useState(null);
  const currentWeekKey = toDateKey(startOfWeek(new Date()));
  const snapshotWeek = viewWeek && snapshotWeeks.includes(viewWeek) ? viewWeek
    : snapshotWeeks.includes(currentWeekKey) ? currentWeekKey
    : snapshotWeeks.length ? snapshotWeeks[snapshotWeeks.length - 1] : null;
  const viewItems = snapshotWeek ? planSnapshot.filter((it) => it.week_start === snapshotWeek) : planSnapshot.filter((it) => !it.week_start);
  const weekPos = snapshotWeeks.indexOf(snapshotWeek);

  // Fertige Woche nachträglich ändern: Zeile löschen und mit neuem Tag neu
  // anlegen (nutzt nur die Rechte, die das Erstellen der Woche ohnehin braucht).
  async function saveSnapshotItems(changed) {
    if (changed.length === 0) return;
    const byId = new Map(changed.map((c) => [c.id, c]));
    onPlanSnapshotChange(planSnapshot.map((it) => byId.get(it.id) || it));
    for (const it of changed) {
      const { error: delErr } = await write("plan_snapshot_items", "delete", null, { id: it.id });
      const { error: insErr } = delErr ? { error: null } : await write("plan_snapshot_items", "insert", it);
      const err = delErr || insErr;
      if (err) { showToast("Konnte Änderung nicht speichern: " + err.message, "error"); return; }
    }
  }
  function moveSnapshotItem(id, weekday) {
    const it = planSnapshot.find((x) => x.id === id);
    if (!it || (it.weekday || "") === (weekday || "")) return;
    saveSnapshotItems([{ ...it, weekday: weekday || null }]);
    showToast(`${it.recipe_name} → ${weekday || "ohne Tag"}`, "success");
  }
  function swapSnapshotItems(idA, idB) {
    const a = planSnapshot.find((x) => x.id === idA), b = planSnapshot.find((x) => x.id === idB);
    if (!a || !b || (a.weekday || "") === (b.weekday || "")) return;
    saveSnapshotItems([{ ...a, weekday: b.weekday || null }, { ...b, weekday: a.weekday || null }]);
    showToast(`${a.recipe_name} und ${b.recipe_name} getauscht`, "success");
  }

  const rows = useMemo(() => recipes.map((r) => {
    const p = planItems.find((pi) => pi.recipe_id === r.id);
    return { recipe: r, selected: p ? p.selected : false, portions: p ? p.portions : r.portions, weekday: p ? p.weekday || "" : "" };
  }), [recipes, planItems]);

  // Ausgewählte immer oben: Sonst rutschen sie beim Scrollen durch eine
  // längere Rezeptliste aus dem Blick, obwohl man sie gerade zusammenstellt.
  // Die Suche daneben macht die Liste ab ein paar Dutzend Rezepten erst
  // benutzbar.
  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => r.selected || q === "" || r.recipe.name.toLowerCase().includes(q))
      .sort((a, b) => (a.selected === b.selected ? 0 : a.selected ? -1 : 1));
  }, [rows, search]);

  const selectedRows = [...rows.filter((r) => r.selected)].sort((a, b) => {
    const ia = a.weekday ? WEEKDAYS.indexOf(a.weekday) : 99;
    const ib = b.weekday ? WEEKDAYS.indexOf(b.weekday) : 99;
    return ia - ib;
  });
  const totalPortions = selectedRows.reduce((sum, r) => sum + (Number(r.portions) || 0), 0);

  async function upsertPlan(recipeId, patch) {
    const existing = planItems.find((p) => p.recipe_id === recipeId);
    const base = existing || { recipe_id: recipeId, portions: recipes.find((r) => r.id === recipeId)?.portions || 4, selected: false, weekday: "" };
    const next = { ...base, ...patch };
    const payload = { recipe_id: recipeId, user_id: userId, selected: next.selected, portions: next.portions, weekday: next.weekday || null };
    onPlanChange(existing ? planItems.map((p) => (p.recipe_id === recipeId ? next : p)) : [...planItems, next]);
    const { error } = await write("plan_items", "upsert", payload);
    if (error) showToast("Konnte Planung nicht speichern: " + error.message, "error");
  }

  function toggle(recipe) {
    const p = planItems.find((pi) => pi.recipe_id === recipe.id);
    upsertPlan(recipe.id, { selected: !(p ? p.selected : false), portions: p ? p.portions : recipe.portions });
  }

  function setPortions(recipeId, portions) {
    upsertPlan(recipeId, { portions: Math.max(1, portions) });
  }

  function setWeekday(recipeId, weekday) {
    upsertPlan(recipeId, { weekday });
  }

  async function generateShoppingList() {
    if (selectedRows.length === 0) return;
    setGenerating(true);

    const rawLines = [];
    for (const { recipe, portions } of selectedRows) {
      const ratio = (Number(portions) || 1) / (Number(recipe.portions) || 1);
      for (const ing of recipe.ingredients || []) {
        rawLines.push({
          name: ing.name,
          amount: Math.round((Number(ing.amount) || 0) * ratio * 100) / 100,
          unit: ing.unit,
          fromRecipe: recipe.name,
        });
      }
    }

    // Manuell hinzugefügte Artikel gehen als Basis mit ein, damit sie wie
    // gewohnt mit gleichnamigen Rezept-Zutaten zusammengeführt werden.
    // Die komplette Liste wird danach frisch aus dem AKTUELLEN Plan
    // berechnet (nicht auf die bestehenden Mengen draufaddiert) — sonst
    // würde ein erneuter Klick auf "Einkaufsliste erstellen" (z. B. nach
    // Hinzufügen eines weiteren Rezepts) bereits enthaltene Mengen ein
    // zweites Mal aufaddieren.
    const manualBase = shoppingItems
      .filter((it) => !it.from_recipes || it.from_recipes.length === 0)
      .map((it) => ({ name: it.name, amount: it.amount, unit: it.unit }));
    const freshLines = mergeLines([...manualBase, ...rawLines]);

    const usedOldIds = new Set();
    const next = freshLines.map((line) => {
      const match = shoppingItems.find((it) => !usedOldIds.has(it.id) && canMerge(it, line));
      if (match) {
        usedOldIds.add(match.id);
        return { ...match, amount: line.amount, unit: line.unit, from_recipes: line.from_recipes };
      }
      return { id: newId(), user_id: userId, name: line.name, amount: line.amount, unit: line.unit, checked: false, from_recipes: line.from_recipes };
    });
    const removed = shoppingItems.filter((it) => !usedOldIds.has(it.id));

    for (const item of next) {
      const old = shoppingItems.find((it) => it.id === item.id);
      if (!old) {
        const { error } = await write("shopping_items", "insert", item);
        if (error) showToast("Fehler beim Hinzufügen: " + error.message, "error");
      } else if (old.amount !== item.amount || old.unit !== item.unit || JSON.stringify(old.from_recipes) !== JSON.stringify(item.from_recipes)) {
        const patch = { amount: item.amount, unit: item.unit, from_recipes: item.from_recipes };
        const { error } = await write("shopping_items", "update", patch, { id: item.id });
        if (error) showToast("Fehler beim Aktualisieren: " + error.message, "error");
      }
    }
    for (const item of removed) {
      const { error } = await write("shopping_items", "delete", null, { id: item.id });
      if (error) showToast("Fehler beim Entfernen: " + error.message, "error");
    }
    onShoppingChange(next);

    // Aktuellen Plan als Momentaufnahme in "Ansicht" einfrieren, dann
    // "Planen" leeren — bereit für die nächste Woche, ohne dass die
    // gerade erstellte Woche aus der Ansicht verschwindet.
    const snapshotRows = selectedRows.map(({ recipe, portions, weekday }) => ({
      id: newId(), user_id: userId, recipe_name: recipe.name, category: recipe.category,
      weekday: weekday || null, portions, week_start: weekStart,
    }));
    // Nur dieselbe Woche ersetzen (erneutes Erstellen), alle anderen Wochen
    // bleiben als Verlauf erhalten. Alte Einträge ohne Woche (aus der Zeit
    // vor der Wochen-Spalte) werden dabei aufgeräumt.
    const { error: delErr } = await write("plan_snapshot_items", "delete", null, { user_id: userId, week_start: weekStart });
    if (delErr) showToast("Konnte alte Wochenansicht nicht löschen: " + delErr.message, "error");
    for (const legacy of planSnapshot.filter((it) => !it.week_start)) {
      await write("plan_snapshot_items", "delete", null, { id: legacy.id });
    }
    if (snapshotRows.length > 0) {
      const { error: insErr } = await write("plan_snapshot_items", "insert", snapshotRows);
      if (insErr) showToast("Konnte Wochenansicht nicht speichern: " + insErr.message, "error");
    }
    onPlanSnapshotChange([...planSnapshot.filter((it) => it.week_start && it.week_start !== weekStart), ...snapshotRows]);
    setViewWeek(weekStart);

    const clearedPlanItems = planItems.map((p) => (p.selected ? { ...p, selected: false, weekday: null } : p));
    const clearedRows = planItems.filter((p) => p.selected).map((p) => ({ recipe_id: p.recipe_id, user_id: userId, selected: false, portions: p.portions, weekday: null }));
    if (clearedRows.length > 0) {
      const { error: clearErr } = await write("plan_items", "upsert", clearedRows);
      if (clearErr) showToast("Konnte Planung nicht leeren: " + clearErr.message, "error");
    }
    onPlanChange(clearedPlanItems);

    setGenerating(false);
    showToast(`Einkaufsliste aktualisiert (${next.length} Artikel).`, "success");
  }

  return html`
    <div>
      <div class="desktop-header"><h1>Wochenplan</h1></div>

      <div class="auth-tabs plan-mode-tabs">
        <button class=${mode === "plan" ? "active" : ""} onClick=${() => setMode("plan")}>Planen</button>
        <button class=${mode === "view" ? "active" : ""} onClick=${() => setMode("view")}>Ansicht</button>
        <button class=${mode === "history" ? "active" : ""} onClick=${() => setMode("history")}>Verlauf</button>
      </div>

      ${mode === "history" ? html`<${PlanHistory} planSnapshot=${planSnapshot} />` : mode === "view" ? html`
        ${viewItems.length === 0 ? html`
          <div class="empty-state">
            <${IconCalendar} />
            <h3>Noch nichts geplant</h3>
            <p>Wechsle zu „Planen“, wähle Rezepte aus und erstelle die Einkaufsliste — die Woche erscheint danach hier.</p>
          </div>
        ` : html`
          ${snapshotWeek && html`
            <div class="week-picker week-picker-view">
              <button type="button" class="btn btn-icon btn-ghost" aria-label="Frühere Woche" disabled=${weekPos <= 0}
                onClick=${() => setViewWeek(snapshotWeeks[weekPos - 1])}>‹</button>
              <div class="week-heading">
                <b>${relativeWeekLabel(snapshotWeek) || "Geplante Woche"}</b>
                <span>${formatWeekRange(snapshotWeek)}</span>
              </div>
              <button type="button" class="btn btn-icon btn-ghost" aria-label="Spätere Woche" disabled=${weekPos >= snapshotWeeks.length - 1}
                onClick=${() => setViewWeek(snapshotWeeks[weekPos + 1])}>›</button>
            </div>
          `}
          <p class="hint plan-move-hint">Rezept am Griff auf einen anderen Tag ziehen oder antippen, um den Tag zu ändern. Auf ein anderes Rezept ziehen tauscht beide.</p>
          <${WeekBoard} items=${viewItems} weekStart=${snapshotWeek} editable=${true}
            onMove=${moveSnapshotItem} onSwap=${swapSnapshotItems} />
        `}
      ` : html`
        <div class="card card-pad plan-summary">
          <div class="week-picker">
            <button type="button" class="btn btn-icon btn-ghost" aria-label="Woche zurück"
              onClick=${() => setWeekStart(toDateKey(addWeeks(new Date(weekStart + "T00:00:00"), -1)))}>−</button>
            <div class="week-picker-label">
              <b>${relativeWeekLabel(weekStart) || "Woche"}</b>
              <span>${formatWeekRange(weekStart)}</span>
            </div>
            <button type="button" class="btn btn-icon btn-ghost" aria-label="Woche vor"
              onClick=${() => setWeekStart(toDateKey(addWeeks(new Date(weekStart + "T00:00:00"), 1)))}>+</button>
          </div>
          <div class="plan-summary-head">
            <div class="plan-total">
              <b>${selectedRows.length}</b> Rezept${selectedRows.length === 1 ? "" : "e"} ausgewählt
              ${selectedRows.length > 0 && html` · <b>${totalPortions}</b> Portionen gesamt`}
            </div>
          </div>
          <button class="btn btn-accent btn-block" disabled=${selectedRows.length === 0 || generating} onClick=${generateShoppingList}>
            <${IconCart} strokeWidth="2.2" /> ${generating ? "Erstellt Einkaufsliste …" : "Einkaufsliste erstellen"}
          </button>
        </div>

        ${recipes.length === 0 ? html`
          <div class="empty-state">
            <${IconCalendar} />
            <h3>Noch keine Rezepte zum Planen</h3>
            <p>Lege zuerst ein paar Rezepte an, dann kannst du hier deine Woche zusammenstellen.</p>
          </div>
        ` : html`
          <div class="filter-bar">
            <div class="search-input">
              <${IconSearch} strokeWidth="2.2" />
              <input class="input" placeholder="Rezepte durchsuchen …" value=${search} onInput=${(e) => setSearch(e.target.value)} />
            </div>
          </div>
          ${visibleRows.length === 0 && html`<p class="hint" style="margin-bottom:18px">Kein Rezept gefunden.</p>`}
          <div class="plan-list">
            ${visibleRows.map(({ recipe, selected, portions, weekday }) => html`
              <div class="plan-row ${selected ? "selected" : ""}" key=${recipe.id}>
                <label class="checkbox-row" style="flex:0">
                  <input type="checkbox" class="check" checked=${selected} onChange=${() => toggle(recipe)} />
                </label>
                <div class="plan-row-name">
                  <span class="n">${recipe.name}</span>
                  <span class="c" style="color:var(--${CATEGORY_STYLE[recipe.category] || "tag-7"})">${recipe.category}</span>
                </div>
                ${selected && html`
                  <div class="plan-row-controls">
                    <select class="select plan-weekday-select" value=${weekday} onChange=${(e) => setWeekday(recipe.id, e.target.value)}>
                      <option value="">Kein Tag</option>
                      ${WEEKDAYS.map((d) => html`<option value=${d}>${d}</option>`)}
                    </select>
                    <div class="stepper">
                      <button type="button" onClick=${() => setPortions(recipe.id, portions - 1)}>−</button>
                      <span class="stepper-val">${portions}</span>
                      <button type="button" onClick=${() => setPortions(recipe.id, portions + 1)}>+</button>
                    </div>
                  </div>
                `}
              </div>
            `)}
          </div>
        `}
      `}
    </div>
  `;
}

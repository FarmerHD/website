import { html, useMemo, useState } from "../lib/preact.js";
import { write, newId } from "../lib/offline.js";
import { mergeLines, canMerge } from "../lib/categorize.js";
import { CATEGORY_STYLE, WEEKDAYS } from "../lib/constants.js";
import { IconCart, IconCalendar } from "../lib/icons.js";

function renderSnapshotWeek(items) {
  const byDay = new Map(WEEKDAYS.map((d) => [d, []]));
  const unassigned = [];
  for (const item of items) {
    if (item.weekday && byDay.has(item.weekday)) byDay.get(item.weekday).push(item);
    else unassigned.push(item);
  }
  return html`
    <div class="plan-week plan-week-view">
      ${WEEKDAYS.map((day) => html`
        <div class="plan-day-row" key=${day}>
          <span class="plan-day-label">${day}</span>
          <div class="plan-day-items">
            ${byDay.get(day).length === 0 ? html`<span class="plan-day-empty">–</span>` : byDay.get(day).map((it) => html`
              <span class="chip plan-view-chip" key=${it.id}>${it.recipe_name} · ${it.portions}×</span>
            `)}
          </div>
        </div>
      `)}
      ${unassigned.length > 0 && html`
        <div class="plan-day-row">
          <span class="plan-day-label muted">Ohne Tag</span>
          <div class="plan-day-items">
            ${unassigned.map((it) => html`<span class="chip plan-view-chip" key=${it.id}>${it.recipe_name} · ${it.portions}×</span>`)}
          </div>
        </div>
      `}
    </div>
  `;
}

export function PlanView({ recipes, planItems, onPlanChange, shoppingItems, onShoppingChange, planSnapshot, onPlanSnapshotChange, showToast, userId }) {
  const [generating, setGenerating] = useState(false);
  const [mode, setMode] = useState("plan"); // "plan" | "view" — je Fenster/Tab unabhängig, bewusst nicht gespeichert

  const rows = useMemo(() => recipes.map((r) => {
    const p = planItems.find((pi) => pi.recipe_id === r.id);
    return { recipe: r, selected: p ? p.selected : false, portions: p ? p.portions : r.portions, weekday: p ? p.weekday || "" : "" };
  }), [recipes, planItems]);

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
      weekday: weekday || null, portions,
    }));
    const { error: delErr } = await write("plan_snapshot_items", "delete", null, { user_id: userId });
    if (delErr) showToast("Konnte alte Wochenansicht nicht löschen: " + delErr.message, "error");
    if (snapshotRows.length > 0) {
      const { error: insErr } = await write("plan_snapshot_items", "insert", snapshotRows);
      if (insErr) showToast("Konnte Wochenansicht nicht speichern: " + insErr.message, "error");
    }
    onPlanSnapshotChange(snapshotRows);

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
      </div>

      ${mode === "view" ? html`
        ${planSnapshot.length === 0 ? html`
          <div class="empty-state">
            <${IconCalendar} />
            <h3>Noch nichts geplant</h3>
            <p>Wechsle zu „Planen“, wähle Rezepte aus und erstelle die Einkaufsliste — die Woche erscheint danach hier.</p>
          </div>
        ` : renderSnapshotWeek(planSnapshot)}
      ` : html`
        <div class="card card-pad plan-summary">
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
          <div class="plan-list">
            ${rows.map(({ recipe, selected, portions, weekday }) => html`
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

import { html, useMemo, useState } from "../lib/preact.js";
import { write, newId } from "../lib/offline.js";
import { mergeLines, canMerge, mergedAmountUnit } from "../lib/categorize.js";
import { CATEGORY_STYLE } from "../lib/constants.js";
import { IconX, IconCart, IconCalendar } from "../lib/icons.js";

export function PlanView({ recipes, planItems, onPlanChange, shoppingItems, onShoppingChange, showToast, goToShopping, userId }) {
  const [generating, setGenerating] = useState(false);

  const rows = useMemo(() => recipes.map((r) => {
    const p = planItems.find((pi) => pi.recipe_id === r.id);
    return { recipe: r, selected: p ? p.selected : false, portions: p ? p.portions : r.portions };
  }), [recipes, planItems]);

  const selectedRows = rows.filter((r) => r.selected);
  const totalPortions = selectedRows.reduce((sum, r) => sum + (Number(r.portions) || 0), 0);

  async function upsertPlan(recipeId, patch) {
    const existing = planItems.find((p) => p.recipe_id === recipeId);
    const base = existing || { recipe_id: recipeId, portions: recipes.find((r) => r.id === recipeId)?.portions || 4, selected: false };
    const next = { ...base, ...patch };
    const payload = { recipe_id: recipeId, user_id: userId, selected: next.selected, portions: next.portions };
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
    const merged = mergeLines(rawLines);

    let current = shoppingItems;
    for (const line of merged) {
      const existing = current.find((it) => canMerge(it, line));
      if (existing) {
        const { amount, unit } = mergedAmountUnit(existing, line);
        const from_recipes = [...new Set([...(existing.from_recipes || []), ...line.from_recipes])];
        const payload = { amount, unit, from_recipes };
        current = current.map((it) => (it.id === existing.id ? { ...it, ...payload } : it));
        const { error } = await write("shopping_items", "update", payload, { id: existing.id });
        if (error) showToast("Fehler beim Zusammenführen: " + error.message, "error");
      } else {
        const id = newId();
        const payload = { id, user_id: userId, name: line.name, amount: line.amount, unit: line.unit, checked: false, from_recipes: line.from_recipes };
        current = [...current, payload];
        const { error } = await write("shopping_items", "insert", payload);
        if (error) showToast("Fehler beim Hinzufügen: " + error.message, "error");
      }
    }
    onShoppingChange(current);
    setGenerating(false);
    showToast(`Einkaufsliste aktualisiert (${merged.length} Zutat${merged.length === 1 ? "" : "en"}).`, "success");
    if (goToShopping) goToShopping();
  }

  return html`
    <div>
      <div class="desktop-header"><h1>Wochenplan</h1></div>

      <div class="card card-pad plan-summary">
        <div class="plan-summary-head">
          <div class="plan-total">
            <b>${selectedRows.length}</b> Rezept${selectedRows.length === 1 ? "" : "e"} ausgewählt
            ${selectedRows.length > 0 && html` · <b>${totalPortions}</b> Portionen gesamt`}
          </div>
        </div>
        ${selectedRows.length > 0 && html`
          <div class="plan-chips">
            ${selectedRows.map(({ recipe, portions }) => html`
              <span class="chip" key=${recipe.id}>
                ${recipe.name} · ${portions}×
                <button onClick=${() => upsertPlan(recipe.id, { selected: false })} aria-label="Entfernen"><${IconX} strokeWidth="2.4" style="width:13px;height:13px" /></button>
              </span>
            `)}
          </div>
        `}
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
          ${rows.map(({ recipe, selected, portions }) => html`
            <div class="plan-row ${selected ? "selected" : ""}" key=${recipe.id}>
              <label class="checkbox-row" style="flex:0">
                <input type="checkbox" class="check" checked=${selected} onChange=${() => toggle(recipe)} />
              </label>
              <div class="plan-row-name">
                <span class="n">${recipe.name}</span>
                <span class="c" style="color:var(--${CATEGORY_STYLE[recipe.category] || "tag-7"})">${recipe.category}</span>
              </div>
              ${selected && html`
                <div class="stepper">
                  <button type="button" onClick=${() => setPortions(recipe.id, portions - 1)}>−</button>
                  <span class="stepper-val">${portions}</span>
                  <button type="button" onClick=${() => setPortions(recipe.id, portions + 1)}>+</button>
                </div>
              `}
            </div>
          `)}
        </div>
      `}
    </div>
  `;
}

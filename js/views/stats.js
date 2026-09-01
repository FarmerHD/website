import { html, useMemo } from "../lib/preact.js";
import { write } from "../lib/offline.js";
import { formatRelativeDate } from "../lib/format.js";
import { IconChartBar, IconTrash } from "../lib/icons.js";

export function StatsView({ cookLog, onCookLogChange, showToast }) {
  const ranking = useMemo(() => {
    const byRecipe = new Map();
    for (const entry of cookLog) {
      const key = entry.recipe_id || entry.recipe_name;
      const cur = byRecipe.get(key) || { key, recipe_name: entry.recipe_name, count: 0, lastCookedAt: entry.cooked_at };
      cur.count += 1;
      if (entry.cooked_at > cur.lastCookedAt) cur.lastCookedAt = entry.cooked_at;
      byRecipe.set(key, cur);
    }
    return [...byRecipe.values()].sort((a, b) => b.count - a.count);
  }, [cookLog]);

  const recent = useMemo(() => [...cookLog].sort((a, b) => (a.cooked_at < b.cooked_at ? 1 : -1)).slice(0, 20), [cookLog]);

  async function removeEntry(entry) {
    onCookLogChange(cookLog.filter((e) => e.id !== entry.id));
    const { error } = await write("cook_log", "delete", null, { id: entry.id });
    if (error) showToast("Löschen fehlgeschlagen: " + error.message, "error");
  }

  return html`
    <div>
      <div class="desktop-header"><h1>Statistik &amp; Rückblick</h1></div>

      ${cookLog.length === 0 ? html`
        <div class="empty-state">
          <${IconChartBar} />
          <h3>Noch nichts gekocht</h3>
          <p>Markiere ein Rezept in der Detailansicht als „Heute gekocht“ — dann erscheint hier deine Historie.</p>
        </div>
      ` : html`
        <div class="recipe-meta-row">
          <div class="meta-tile"><span class="n">${cookLog.length}</span><span class="l">Mal gekocht</span></div>
          <div class="meta-tile"><span class="n">${ranking.length}</span><span class="l">Verschiedene Rezepte</span></div>
        </div>

        <h3 class="section-title">Meistgekocht</h3>
        <div class="plan-list">
          ${ranking.slice(0, 8).map((r) => html`
            <div class="plan-row" key=${r.key}>
              <div class="plan-row-name"><span class="n">${r.recipe_name}</span></div>
              <span class="badge" style="background:var(--primary-soft);color:var(--primary-dark)">${r.count}×</span>
            </div>
          `)}
        </div>

        <h3 class="section-title">Zuletzt gekocht</h3>
        <div class="plan-list">
          ${recent.map((entry) => html`
            <div class="plan-row" key=${entry.id}>
              <div class="plan-row-name"><span class="n">${entry.recipe_name}</span></div>
              <div class="plan-row-controls">
                <span class="hint">${formatRelativeDate(entry.cooked_at)}</span>
                <button class="btn btn-icon btn-ghost" onClick=${() => removeEntry(entry)} aria-label="Eintrag entfernen"><${IconTrash} strokeWidth="2.2" /></button>
              </div>
            </div>
          `)}
        </div>
      `}
    </div>
  `;
}

import { html, useMemo, useState } from "../lib/preact.js";
import { write, newId } from "../lib/offline.js";
import { assignShoppingGroup, canMerge, mergedAmountUnit } from "../lib/categorize.js";
import { SHOPPING_GROUPS, UNITS } from "../lib/constants.js";
import { IconPlus, IconEdit, IconTrash, IconPrint, IconCart, IconCheck, IconX } from "../lib/icons.js";

function ShoppingItemRow({ item, onToggle, onSave, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ name: item.name, amount: item.amount, unit: item.unit });

  if (editing) {
    return html`
      <div class="shop-item">
        <div class="shop-item-body" style="display:flex;gap:8px;flex-wrap:wrap">
          <input class="input" style="flex:2;min-width:100px" value=${draft.name} onInput=${(e) => setDraft({ ...draft, name: e.target.value })} />
          <input class="input" type="number" step="0.01" style="flex:1;min-width:70px" value=${draft.amount} onInput=${(e) => setDraft({ ...draft, amount: e.target.value })} />
          <select class="select" style="flex:1;min-width:90px" value=${draft.unit} onChange=${(e) => setDraft({ ...draft, unit: e.target.value })}>
            ${UNITS.map((u) => html`<option value=${u}>${u}</option>`)}
          </select>
        </div>
        <div class="shop-item-actions">
          <button class="btn btn-icon btn-ghost" onClick=${() => { onSave(item.id, { name: draft.name.trim() || item.name, amount: Number(draft.amount) || 0, unit: draft.unit }); setEditing(false); }} aria-label="Speichern"><${IconCheck} strokeWidth="2.4" /></button>
          <button class="btn btn-icon btn-ghost" onClick=${() => setEditing(false)} aria-label="Abbrechen"><${IconX} strokeWidth="2.4" /></button>
        </div>
      </div>
    `;
  }

  return html`
    <div class="shop-item ${item.checked ? "checked" : ""}">
      <input type="checkbox" class="check" checked=${item.checked} onChange=${() => onToggle(item)} />
      <div class="shop-item-body">
        <div class="shop-item-name">${item.name}</div>
        <div class="shop-item-amt">${item.amount} ${item.unit}</div>
        <div class="shop-item-src">${item.from_recipes && item.from_recipes.length ? "aus: " + item.from_recipes.join(", ") : "manuell hinzugefügt"}</div>
      </div>
      <div class="shop-item-actions">
        <button class="btn btn-icon btn-ghost" onClick=${() => setEditing(true)} aria-label="Bearbeiten"><${IconEdit} strokeWidth="2.2" /></button>
        <button class="btn btn-icon btn-ghost" onClick=${() => onDelete(item)} aria-label="Löschen"><${IconTrash} strokeWidth="2.2" /></button>
      </div>
    </div>
  `;
}

export function ShoppingView({ shoppingItems: items, onShoppingChange: onChange, showToast, userId }) {
  const [addForm, setAddForm] = useState({ name: "", amount: "", unit: "Stück" });

  const grouped = useMemo(() => {
    const byGroup = new Map(SHOPPING_GROUPS.map((g) => [g.key, []]));
    for (const item of items) byGroup.get(assignShoppingGroup(item).key).push(item);
    return SHOPPING_GROUPS.map((g) => ({ group: g, items: byGroup.get(g.key) })).filter((g) => g.items.length > 0);
  }, [items]);

  const doneCount = items.filter((i) => i.checked).length;
  const total = items.length;
  const pct = total === 0 ? 0 : Math.round((doneCount / total) * 100);

  async function toggle(item) {
    const patch = { checked: !item.checked };
    onChange(items.map((i) => (i.id === item.id ? { ...i, ...patch } : i)));
    const { error } = await write("shopping_items", "update", patch, { id: item.id });
    if (error) showToast("Konnte nicht speichern: " + error.message, "error");
  }

  async function save(id, patch) {
    onChange(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    const { error } = await write("shopping_items", "update", patch, { id });
    if (error) showToast("Konnte nicht speichern: " + error.message, "error");
  }

  async function remove(item) {
    onChange(items.filter((i) => i.id !== item.id));
    const { error } = await write("shopping_items", "delete", null, { id: item.id });
    if (error) showToast("Löschen fehlgeschlagen: " + error.message, "error");
    else showToast("Artikel gelöscht.", "success");
  }

  async function clearChecked() {
    const checked = items.filter((i) => i.checked);
    if (checked.length === 0) return;
    onChange(items.filter((i) => !i.checked));
    for (const item of checked) {
      const { error } = await write("shopping_items", "delete", null, { id: item.id });
      if (error) showToast("Fehler beim Aufräumen: " + error.message, "error");
    }
    showToast(`${checked.length} erledigte Artikel gelöscht.`, "success");
  }

  async function addManual(e) {
    e.preventDefault();
    if (!addForm.name.trim()) return;
    const candidate = { name: addForm.name.trim(), amount: Number(addForm.amount) || 1, unit: addForm.unit };
    const existing = items.find((i) => canMerge(i, candidate));
    if (existing) {
      const { amount, unit } = mergedAmountUnit(existing, candidate);
      onChange(items.map((i) => (i.id === existing.id ? { ...i, amount, unit } : i)));
      const { error } = await write("shopping_items", "update", { amount, unit }, { id: existing.id });
      if (error) showToast("Konnte nicht zusammenführen: " + error.message, "error");
      else showToast(`Menge bei „${existing.name}“ zusammengeführt.`, "success");
    } else {
      const id = newId();
      const payload = { id, user_id: userId, name: candidate.name, amount: candidate.amount, unit: candidate.unit, checked: false, from_recipes: [] };
      onChange([...items, payload]);
      const { error } = await write("shopping_items", "insert", payload);
      if (error) showToast("Hinzufügen fehlgeschlagen: " + error.message, "error");
    }
    setAddForm({ name: "", amount: "", unit: "Stück" });
  }

  return html`
    <div>
      <div class="desktop-header"><h1>Einkaufsliste</h1></div>

      <div class="shop-progress">
        <div class="shop-progress-top">
          <b>${doneCount} von ${total} erledigt</b>
          <span class="hint">${pct}%</span>
        </div>
        <div class="progress-bar"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
        ${grouped.length > 0 && html`
          <div class="shop-cat-breakdown">
            ${grouped.map(({ group, items: gi }) => html`
              <span class="shop-cat-chip" style="background:var(--${group.style}-soft);color:var(--${group.style})" key=${group.key}>
                ${group.label} · ${gi.filter((i) => i.checked).length}/${gi.length}
              </span>
            `)}
          </div>
        `}
      </div>

      <form class="add-item-form" onSubmit=${addManual}>
        <input class="input" placeholder="Artikel hinzufügen …" value=${addForm.name} onInput=${(e) => setAddForm({ ...addForm, name: e.target.value })} />
        <input class="input" type="number" step="0.01" min="0" placeholder="Menge" value=${addForm.amount} onInput=${(e) => setAddForm({ ...addForm, amount: e.target.value })} />
        <select class="select" value=${addForm.unit} onChange=${(e) => setAddForm({ ...addForm, unit: e.target.value })}>
          ${UNITS.map((u) => html`<option value=${u}>${u}</option>`)}
        </select>
        <button class="btn btn-primary" type="submit"><${IconPlus} strokeWidth="2.4" /> Hinzufügen</button>
      </form>

      ${grouped.length === 0 ? html`
        <div class="empty-state">
          <${IconCart} />
          <h3>Einkaufsliste ist leer</h3>
          <p>Erstelle sie aus deinem Wochenplan oder füge oben einen Artikel manuell hinzu.</p>
        </div>
      ` : html`
        ${grouped.map(({ group, items: gi }) => html`
          <div class="shop-group" key=${group.key}>
            <div class="shop-group-head">
              <span class="sw" style="background:var(--${group.style})"></span>
              <h3>${group.label}</h3>
              <span class="count">${gi.filter((i) => i.checked).length}/${gi.length}</span>
            </div>
            ${gi.map((item) => html`<${ShoppingItemRow} key=${item.id} item=${item} onToggle=${toggle} onSave=${save} onDelete=${remove} />`)}
          </div>
        `)}
        <div class="shop-actions">
          <button class="btn btn-secondary" onClick=${clearChecked} disabled=${doneCount === 0}><${IconTrash} strokeWidth="2.2" /> Erledigt löschen</button>
          <button class="btn btn-secondary" onClick=${() => window.print()}><${IconPrint} strokeWidth="2.2" /> Drucken</button>
        </div>
      `}
    </div>
  `;
}

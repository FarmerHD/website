import { html, useMemo, useState } from "../lib/preact.js";
import { write, newId } from "../lib/offline.js";
import { canMerge, mergedAmountUnit } from "../lib/categorize.js";
import { PANTRY_LOCATIONS, PANTRY_LOCATION_STYLE, UNITS } from "../lib/constants.js";
import { IconPlus, IconEdit, IconTrash, IconCheck, IconX, IconBox } from "../lib/icons.js";

function PantryItemRow({ item, onSave, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ name: item.name, amount: item.amount, unit: item.unit, location: item.location });

  if (editing) {
    return html`
      <div class="shop-item">
        <div class="shop-item-body" style="display:flex;gap:8px;flex-wrap:wrap">
          <input class="input" style="flex:2;min-width:100px" value=${draft.name} onInput=${(e) => setDraft({ ...draft, name: e.target.value })} />
          <input class="input" type="number" step="0.01" style="flex:1;min-width:70px" value=${draft.amount} onInput=${(e) => setDraft({ ...draft, amount: e.target.value })} />
          <select class="select" style="flex:1;min-width:90px" value=${draft.unit} onChange=${(e) => setDraft({ ...draft, unit: e.target.value })}>
            ${UNITS.map((u) => html`<option value=${u}>${u}</option>`)}
          </select>
          <select class="select" style="flex:1;min-width:110px" value=${draft.location} onChange=${(e) => setDraft({ ...draft, location: e.target.value })}>
            ${PANTRY_LOCATIONS.map((l) => html`<option value=${l}>${l}</option>`)}
          </select>
        </div>
        <div class="shop-item-actions">
          <button class="btn btn-icon btn-ghost" onClick=${() => { onSave(item.id, { name: draft.name.trim() || item.name, amount: Number(draft.amount) || 0, unit: draft.unit, location: draft.location }); setEditing(false); }} aria-label="Speichern"><${IconCheck} strokeWidth="2.4" /></button>
          <button class="btn btn-icon btn-ghost" onClick=${() => setEditing(false)} aria-label="Abbrechen"><${IconX} strokeWidth="2.4" /></button>
        </div>
      </div>
    `;
  }

  return html`
    <div class="shop-item">
      <div class="shop-item-body">
        <div class="shop-item-name">${item.name}</div>
        <div class="shop-item-amt">${item.amount} ${item.unit}</div>
      </div>
      <div class="shop-item-actions">
        <button class="btn btn-icon btn-ghost" onClick=${() => setEditing(true)} aria-label="Bearbeiten"><${IconEdit} strokeWidth="2.2" /></button>
        <button class="btn btn-icon btn-ghost" onClick=${() => onDelete(item)} aria-label="Löschen"><${IconTrash} strokeWidth="2.2" /></button>
      </div>
    </div>
  `;
}

export function PantryView({ pantryItems: items, onPantryChange: onChange, showToast, userId }) {
  const [addForm, setAddForm] = useState({ name: "", amount: "", unit: "Stück", location: PANTRY_LOCATIONS[0] });

  const grouped = useMemo(() => {
    const byLoc = new Map(PANTRY_LOCATIONS.map((l) => [l, []]));
    for (const item of items) {
      const loc = byLoc.has(item.location) ? item.location : "Sonstiges";
      byLoc.get(loc).push(item);
    }
    return PANTRY_LOCATIONS.map((l) => ({ location: l, items: byLoc.get(l) })).filter((g) => g.items.length > 0);
  }, [items]);

  async function save(id, patch) {
    onChange(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    const { error } = await write("pantry_items", "update", patch, { id });
    if (error) showToast("Konnte nicht speichern: " + error.message, "error");
  }

  async function remove(item) {
    onChange(items.filter((i) => i.id !== item.id));
    const { error } = await write("pantry_items", "delete", null, { id: item.id });
    if (error) showToast("Löschen fehlgeschlagen: " + error.message, "error");
    else showToast("Aus dem Vorrat entfernt.", "success");
  }

  async function addManual(e) {
    e.preventDefault();
    if (!addForm.name.trim()) return;
    const candidate = { name: addForm.name.trim(), amount: Number(addForm.amount) || 1, unit: addForm.unit, location: addForm.location };
    const existing = items.find((i) => i.location === candidate.location && canMerge(i, candidate));
    if (existing) {
      const { amount, unit } = mergedAmountUnit(existing, candidate);
      onChange(items.map((i) => (i.id === existing.id ? { ...i, amount, unit } : i)));
      const { error } = await write("pantry_items", "update", { amount, unit }, { id: existing.id });
      if (error) showToast("Konnte nicht zusammenführen: " + error.message, "error");
      else showToast(`Menge bei „${existing.name}“ zusammengeführt.`, "success");
    } else {
      const id = newId();
      const payload = { id, user_id: userId, name: candidate.name, amount: candidate.amount, unit: candidate.unit, location: candidate.location };
      onChange([...items, payload]);
      const { error } = await write("pantry_items", "insert", payload);
      if (error) showToast("Hinzufügen fehlgeschlagen: " + error.message, "error");
    }
    setAddForm({ ...addForm, name: "", amount: "" });
  }

  return html`
    <div>
      <div class="desktop-header"><h1>Vorrat</h1></div>

      <form class="add-item-form" onSubmit=${addManual}>
        <input class="input" placeholder="Artikel hinzufügen …" value=${addForm.name} onInput=${(e) => setAddForm({ ...addForm, name: e.target.value })} />
        <input class="input" type="number" step="0.01" min="0" placeholder="Menge" value=${addForm.amount} onInput=${(e) => setAddForm({ ...addForm, amount: e.target.value })} />
        <select class="select" value=${addForm.unit} onChange=${(e) => setAddForm({ ...addForm, unit: e.target.value })}>
          ${UNITS.map((u) => html`<option value=${u}>${u}</option>`)}
        </select>
        <select class="select select-location" value=${addForm.location} onChange=${(e) => setAddForm({ ...addForm, location: e.target.value })}>
          ${PANTRY_LOCATIONS.map((l) => html`<option value=${l}>${l}</option>`)}
        </select>
        <button class="btn btn-primary" type="submit"><${IconPlus} strokeWidth="2.4" /> Hinzufügen</button>
      </form>

      ${grouped.length === 0 ? html`
        <div class="empty-state">
          <${IconBox} />
          <h3>Noch nichts eingetragen</h3>
          <p>Trag oben ein, was du gerade im Kühlschrank, Gefrierschrank, Keller oder in der Küche hast.</p>
        </div>
      ` : grouped.map(({ location, items: gi }) => html`
        <div class="shop-group" key=${location}>
          <div class="shop-group-head">
            <span class="sw" style="background:var(--${PANTRY_LOCATION_STYLE[location]})"></span>
            <h3>${location}</h3>
            <span class="count">${gi.length}</span>
          </div>
          ${gi.map((item) => html`<${PantryItemRow} key=${item.id} item=${item} onSave=${save} onDelete=${remove} />`)}
        </div>
      `)}
    </div>
  `;
}

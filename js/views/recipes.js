import { html, useState, useMemo, useRef } from "../lib/preact.js";
import { supabaseClient as sb } from "../config.js";
import { write, newId } from "../lib/offline.js";
import { CATEGORIES, CATEGORY_STYLE, UNITS } from "../lib/constants.js";
import { parseRecipeText } from "../lib/parser.js";
import { formatRelativeDate } from "../lib/format.js";
import {
  IconSearch, IconPlus, IconX, IconEdit, IconTrash, IconClock, IconUsers,
  IconCamera, IconLeaf, IconSparkle, IconFlame,
} from "../lib/icons.js";

function round2(n) {
  return Math.round(n * 100) / 100;
}

function RecipeCard({ recipe, onOpen }) {
  return html`
    <button class="recipe-card" onClick=${() => onOpen(recipe)}>
      <div class="recipe-thumb">
        ${recipe.image_url
          ? html`<img src=${recipe.image_url} alt="" loading="lazy" />`
          : html`<${IconLeaf} />`}
      </div>
      <div class="recipe-card-body">
        <div class="badge" style="background:var(--${CATEGORY_STYLE[recipe.category] || "tag-7"}-soft);color:var(--${CATEGORY_STYLE[recipe.category] || "tag-7"})">${recipe.category}</div>
        <div class="recipe-card-name">${recipe.name}</div>
        <div class="recipe-card-meta">
          ${(recipe.prep_time || recipe.cook_time) && html`<span><${IconClock} strokeWidth="2.2" /> ${(Number(recipe.prep_time) || 0) + (Number(recipe.cook_time) || 0)} Min.</span>`}
          <span><${IconUsers} strokeWidth="2.2" /> ${recipe.portions}</span>
        </div>
      </div>
    </button>
  `;
}

function IngredientEditor({ ingredients, onChange }) {
  function update(i, patch) {
    const next = ingredients.map((row, idx) => (idx === i ? { ...row, ...patch } : row));
    onChange(next);
  }
  function remove(i) {
    onChange(ingredients.filter((_, idx) => idx !== i));
  }
  function add() {
    onChange([...ingredients, { name: "", amount: "", unit: "Stück" }]);
  }
  return html`
    <div>
      ${ingredients.map((row, i) => html`
        <div class="ing-edit-row" key=${i}>
          <input class="input" placeholder="Zutat" value=${row.name} onInput=${(e) => update(i, { name: e.target.value })} />
          <input class="input" type="number" step="0.01" min="0" placeholder="Menge" value=${row.amount} onInput=${(e) => update(i, { amount: e.target.value })} />
          <select class="select" value=${row.unit} onChange=${(e) => update(i, { unit: e.target.value })}>
            ${UNITS.map((u) => html`<option value=${u}>${u}</option>`)}
          </select>
          <button type="button" class="ing-row-remove" onClick=${() => remove(i)} aria-label="Zutat entfernen"><${IconX} strokeWidth="3" /></button>
        </div>
      `)}
      <button type="button" class="btn btn-secondary btn-sm" onClick=${add}><${IconPlus} strokeWidth="2.4" /> Zutat hinzufügen</button>
    </div>
  `;
}

function emptyForm() {
  return {
    name: "", category: "Sonstiges", portions: 4, prep_time: "", cook_time: "",
    notes: "", ingredients: [], stepsText: "", image_url: "", imageFile: null, imagePreview: "",
  };
}

function RecipeForm({ recipe, onClose, onSaved, showToast, userId }) {
  const isEdit = !!recipe;
  const [form, setForm] = useState(() => recipe
    ? {
      name: recipe.name, category: recipe.category, portions: recipe.portions,
      prep_time: recipe.prep_time ?? "", cook_time: recipe.cook_time ?? "", notes: recipe.notes || "",
      ingredients: (recipe.ingredients || []).map((i) => ({ ...i })),
      stepsText: (recipe.steps || []).join("\n\n"),
      image_url: recipe.image_url || "", imageFile: null, imagePreview: recipe.image_url || "",
    }
    : emptyForm());
  const [importText, setImportText] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [importHint, setImportHint] = useState(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  function runImport() {
    if (!importText.trim()) return;
    const parsed = parseRecipeText(importText);
    setForm((f) => ({
      ...f,
      name: parsed.name || f.name,
      portions: parsed.portions || f.portions,
      prep_time: parsed.prepTime ?? f.prep_time,
      cook_time: parsed.cookTime ?? f.cook_time,
      ingredients: parsed.ingredients.length ? parsed.ingredients : f.ingredients,
      stepsText: parsed.steps.length ? parsed.steps.join("\n\n") : f.stepsText,
    }));
    setImportHint(parsed.hasIngredientsSection
      ? "Übernommen. Bitte kurz prüfen und bei Bedarf korrigieren."
      : "Kein Abschnitt „Zutaten“ gefunden — nur Name/Portionen/Zeiten übernommen. Zutaten und Zubereitung bitte von Hand ergänzen.");
  }

  function onPickFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setForm((f) => ({ ...f, imageFile: file, imagePreview: URL.createObjectURL(file) }));
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);

    let imageUrl = form.image_url;
    if (form.imageFile) {
      if (!navigator.onLine) {
        showToast("Kein Foto-Upload ohne Verbindung — Rezept wird ohne neues Foto gespeichert.", "error");
      } else {
        const path = `${crypto.randomUUID()}-${form.imageFile.name}`.replace(/\s+/g, "_");
        const { error: upErr } = await sb.storage.from("recipe-photos").upload(path, form.imageFile, { upsert: true });
        if (upErr) {
          showToast("Foto-Upload fehlgeschlagen: " + upErr.message, "error");
        } else {
          imageUrl = sb.storage.from("recipe-photos").getPublicUrl(path).data.publicUrl;
        }
      }
    }

    const payload = {
      name: form.name.trim(),
      category: form.category,
      portions: Number(form.portions) || 1,
      prep_time: form.prep_time === "" ? null : Number(form.prep_time),
      cook_time: form.cook_time === "" ? null : Number(form.cook_time),
      notes: form.notes,
      ingredients: form.ingredients.filter((i) => i.name.trim()).map((i) => ({ name: i.name.trim(), amount: Number(i.amount) || 0, unit: i.unit })),
      steps: form.stepsText.split(/\n\s*\n/).map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean),
      image_url: imageUrl || null,
    };

    if (isEdit) {
      const { error, queued } = await write("recipes", "update", payload, { id: recipe.id });
      setSaving(false);
      if (error) { showToast("Speichern fehlgeschlagen: " + error.message, "error"); return; }
      onSaved({ ...recipe, ...payload }, queued);
    } else {
      const id = newId();
      payload.id = id;
      payload.user_id = userId;
      const { error, queued } = await write("recipes", "insert", payload);
      setSaving(false);
      if (error) { showToast("Speichern fehlgeschlagen: " + error.message, "error"); return; }
      onSaved(payload, queued);
    }
  }

  return html`
    <div class="overlay" onClick=${(e) => e.target === e.currentTarget && onClose()}>
      <div class="sheet wide">
        <div class="sheet-header">
          <button class="btn btn-icon btn-ghost" onClick=${onClose} aria-label="Schließen"><${IconX} /></button>
          <h2>${isEdit ? "Rezept bearbeiten" : "Neues Rezept"}</h2>
        </div>
        <form onSubmit=${submit}>
          <div class="sheet-body">
            ${!isEdit && html`
              <details class="import-box" open=${importOpen} onToggle=${(e) => setImportOpen(e.target.open)}>
                <summary><${IconSparkle} strokeWidth="2.2" style="width:16px;height:16px" /> Rezepttext einfügen & automatisch ausfüllen</summary>
                <textarea class="textarea" rows="6" placeholder="Rezepttext hier einfügen (am besten mit den Überschriften „Zutaten“ und „Zubereitung“) …" value=${importText} onInput=${(e) => setImportText(e.target.value)}></textarea>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;gap:10px;flex-wrap:wrap">
                  <span class="hint">Nichts wird automatisch gespeichert — du kannst danach alles anpassen.</span>
                  <button type="button" class="btn btn-primary btn-sm" onClick=${runImport}>Übernehmen</button>
                </div>
                ${importHint && html`<p class="hint" style="margin-top:8px;color:var(--primary-dark)">${importHint}</p>`}
              </details>
            `}

            <div class="field">
              <label>Foto (optional)</label>
              <label class="photo-drop" style="cursor:pointer">
                ${form.imagePreview ? html`<img src=${form.imagePreview} />` : html`<div class="photo-drop-placeholder"><${IconCamera} /></div>`}
                <div style="flex:1">
                  <span class="btn btn-secondary btn-sm">Foto auswählen</span>
                  <p class="hint" style="margin-top:6px">Upload benötigt eine Internetverbindung.</p>
                </div>
                <input ref=${fileRef} type="file" accept="image/*" style="display:none" onChange=${onPickFile} />
              </label>
            </div>

            <div class="field">
              <label>Name</label>
              <input class="input" required value=${form.name} onInput=${(e) => setForm({ ...form, name: e.target.value })} placeholder="z. B. Kürbissuppe mit Ingwer" />
            </div>

            <div class="field-row">
              <div class="field">
                <label>Kategorie</label>
                <select class="select" value=${form.category} onChange=${(e) => setForm({ ...form, category: e.target.value })}>
                  ${CATEGORIES.map((c) => html`<option value=${c}>${c}</option>`)}
                </select>
              </div>
              <div class="field">
                <label>Portionen</label>
                <div class="stepper">
                  <button type="button" onClick=${() => setForm({ ...form, portions: Math.max(1, Number(form.portions) - 1) })}>−</button>
                  <span class="stepper-val">${form.portions}</span>
                  <button type="button" onClick=${() => setForm({ ...form, portions: Number(form.portions) + 1 })}>+</button>
                </div>
              </div>
            </div>

            <div class="field-row">
              <div class="field">
                <label>Vorbereitungszeit (Min.)</label>
                <input class="input" type="number" min="0" value=${form.prep_time} onInput=${(e) => setForm({ ...form, prep_time: e.target.value })} />
              </div>
              <div class="field">
                <label>Kochzeit (Min.)</label>
                <input class="input" type="number" min="0" value=${form.cook_time} onInput=${(e) => setForm({ ...form, cook_time: e.target.value })} />
              </div>
            </div>

            <div class="field">
              <label>Zutaten</label>
              <${IngredientEditor} ingredients=${form.ingredients} onChange=${(ingredients) => setForm({ ...form, ingredients })} />
            </div>

            <div class="field">
              <label>Zubereitung</label>
              <textarea class="textarea" rows="6" placeholder="Ein Schritt pro Absatz (Leerzeile trennt Schritte) …" value=${form.stepsText} onInput=${(e) => setForm({ ...form, stepsText: e.target.value })}></textarea>
            </div>

            <div class="field">
              <label>Notizen</label>
              <textarea class="textarea" rows="3" placeholder="Freie Notizen …" value=${form.notes} onInput=${(e) => setForm({ ...form, notes: e.target.value })}></textarea>
            </div>
          </div>
          <div class="sheet-foot">
            <button type="button" class="btn btn-secondary" onClick=${onClose}>Abbrechen</button>
            <button type="submit" class="btn btn-primary" disabled=${saving}>${saving ? "Speichert …" : "Rezept speichern"}</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function RecipeDetail({ recipe, onClose, onEdit, onDelete, onMarkCooked, lastCookedAt }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [portions, setPortions] = useState(recipe.portions);
  const totalTime = (Number(recipe.prep_time) || 0) + (Number(recipe.cook_time) || 0);
  const ratio = portions / (Number(recipe.portions) || 1);
  return html`
    <div class="overlay" onClick=${(e) => e.target === e.currentTarget && onClose()}>
      <div class="sheet wide">
        <div class="sheet-header">
          <button class="btn btn-icon btn-ghost" onClick=${onClose} aria-label="Schließen"><${IconX} /></button>
          <h2 style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${recipe.name}</h2>
          <button class="btn btn-icon btn-ghost" onClick=${() => onEdit(recipe)} aria-label="Bearbeiten"><${IconEdit} /></button>
          <button class="btn btn-icon btn-ghost" onClick=${() => setConfirmDelete(true)} aria-label="Löschen"><${IconTrash} /></button>
        </div>
        <div class="sheet-body">
          ${confirmDelete && html`
            <div class="auth-msg error" style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
              <span>„${recipe.name}“ wirklich löschen? Das kann nicht rückgängig gemacht werden.</span>
              <span style="display:flex;gap:8px">
                <button class="btn btn-secondary btn-sm" onClick=${() => setConfirmDelete(false)}>Abbrechen</button>
                <button class="btn btn-danger btn-sm" onClick=${() => onDelete(recipe)}>Löschen</button>
              </span>
            </div>
          `}
          <div class="recipe-detail-photo">
            ${recipe.image_url ? html`<img src=${recipe.image_url} />` : html`<${IconLeaf} />`}
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px">
            <div class="badge" style="background:var(--${CATEGORY_STYLE[recipe.category] || "tag-7"}-soft);color:var(--${CATEGORY_STYLE[recipe.category] || "tag-7"})">${recipe.category}</div>
            <div style="display:flex;align-items:center;gap:10px">
              ${lastCookedAt && html`<span class="hint">Zuletzt gekocht: ${formatRelativeDate(lastCookedAt)}</span>`}
              <button type="button" class="btn btn-secondary btn-sm" onClick=${() => onMarkCooked(recipe)}><${IconFlame} strokeWidth="2.2" /> Heute gekocht</button>
            </div>
          </div>
          <div class="recipe-meta-row">
            <div class="meta-tile">
              <div class="stepper" style="margin-bottom:2px">
                <button type="button" onClick=${() => setPortions((p) => Math.max(1, p - 1))}>−</button>
                <span class="stepper-val">${portions}</span>
                <button type="button" onClick=${() => setPortions((p) => p + 1)}>+</button>
              </div>
              <span class="l">Portionen</span>
            </div>
            ${recipe.prep_time ? html`<div class="meta-tile"><span class="n">${recipe.prep_time} Min.</span><span class="l">Vorbereitung</span></div>` : ""}
            ${recipe.cook_time ? html`<div class="meta-tile"><span class="n">${recipe.cook_time} Min.</span><span class="l">Kochzeit</span></div>` : ""}
            ${totalTime > 0 ? html`<div class="meta-tile"><span class="n">${totalTime} Min.</span><span class="l">Gesamt</span></div>` : ""}
          </div>
          ${portions !== recipe.portions && html`<p class="hint" style="margin:-8px 0 14px">Mengen unten umgerechnet für ${portions} Portion${portions === 1 ? "" : "en"} (Originalrezept: ${recipe.portions}).</p>`}

          <h3 class="section-title">Zutaten</h3>
          ${(recipe.ingredients || []).length === 0 ? html`<p class="hint">Keine Zutaten hinterlegt.</p>` : (recipe.ingredients || []).map((i, idx) => html`
            <div class="ingredient-row" key=${idx}>
              <span>${i.name}</span>
              <span class="ingredient-amt">${round2((Number(i.amount) || 0) * ratio)} ${i.unit}</span>
            </div>
          `)}

          <h3 class="section-title">Zubereitung</h3>
          ${(recipe.steps || []).length === 0 ? html`<p class="hint">Keine Schritte hinterlegt.</p>` : (recipe.steps || []).map((s, idx) => html`
            <div class="step-row" key=${idx}>
              <span class="step-num">${idx + 1}</span>
              <p>${s}</p>
            </div>
          `)}

          ${recipe.notes && html`
            <h3 class="section-title">Notizen</h3>
            <div class="notes-box">${recipe.notes}</div>
          `}
        </div>
      </div>
    </div>
  `;
}

export function RecipesView({ recipes, onCreate, onUpdate, onDelete, cookLog, onCookLogChange, showToast, userId }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Alle");
  const [openForm, setOpenForm] = useState(null); // null | 'new' | recipe
  const [openDetail, setOpenDetail] = useState(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return recipes.filter((r) =>
      (category === "Alle" || r.category === category) &&
      (q === "" || r.name.toLowerCase().includes(q))
    );
  }, [recipes, search, category]);

  const lastCookedByRecipe = useMemo(() => {
    const map = new Map();
    for (const entry of cookLog) {
      if (!entry.recipe_id) continue;
      const cur = map.get(entry.recipe_id);
      if (!cur || entry.cooked_at > cur) map.set(entry.recipe_id, entry.cooked_at);
    }
    return map;
  }, [cookLog]);

  function handleSaved(recipe, queued) {
    if (openForm && openForm !== "new") onUpdate(recipe); else onCreate(recipe);
    setOpenForm(null);
    showToast(queued ? "Gespeichert — wird synchronisiert, sobald wieder online." : "Rezept gespeichert.", "success");
    if (openDetail) setOpenDetail(recipe);
  }

  async function handleDelete(recipe) {
    setOpenDetail(null);
    onDelete(recipe.id);
    const { error, queued } = await write("recipes", "delete", null, { id: recipe.id });
    if (error) showToast("Löschen fehlgeschlagen: " + error.message, "error");
    else showToast(queued ? "Gelöscht — wird synchronisiert." : "Rezept gelöscht.", "success");
  }

  async function markCooked(recipe) {
    const entry = { id: newId(), user_id: userId, recipe_id: recipe.id, recipe_name: recipe.name, cooked_at: new Date().toISOString() };
    onCookLogChange([entry, ...cookLog]);
    const { error } = await write("cook_log", "insert", entry);
    if (error) showToast("Konnte nicht speichern: " + error.message, "error");
    else showToast(`„${recipe.name}“ als gekocht vermerkt.`, "success");
  }

  return html`
    <div>
      <div class="desktop-header">
        <h1>Rezepte</h1>
        <span class="topbar-spacer"></span>
        <button class="btn btn-accent" onClick=${() => setOpenForm("new")}><${IconPlus} strokeWidth="2.4" /> Neues Rezept</button>
      </div>

      <div class="filter-bar">
        <div class="search-input">
          <${IconSearch} strokeWidth="2.2" />
          <input class="input" placeholder="Rezepte durchsuchen …" value=${search} onInput=${(e) => setSearch(e.target.value)} />
        </div>
      </div>
      <div class="category-scroll" style="margin-bottom:18px">
        <button class="cat-pill ${category === "Alle" ? "active" : ""}" onClick=${() => setCategory("Alle")}>Alle</button>
        ${CATEGORIES.map((c) => html`<button class="cat-pill ${category === c ? "active" : ""}" onClick=${() => setCategory(c)}>${c}</button>`)}
      </div>

      ${filtered.length === 0 ? html`
        <div class="empty-state">
          <${IconLeaf} />
          <h3>${recipes.length === 0 ? "Noch keine Rezepte" : "Nichts gefunden"}</h3>
          <p>${recipes.length === 0 ? "Lege dein erstes Rezept an — von Hand oder per Text-Import." : "Versuch es mit einem anderen Suchbegriff oder Filter."}</p>
        </div>
      ` : html`
        <div class="recipe-grid">
          ${filtered.map((r) => html`<${RecipeCard} key=${r.id} recipe=${r} onOpen=${setOpenDetail} />`)}
        </div>
      `}

      <button class="fab" onClick=${() => setOpenForm("new")} aria-label="Neues Rezept"><${IconPlus} strokeWidth="2.4" /></button>

      ${openForm && html`
        <${RecipeForm}
          recipe=${openForm === "new" ? null : openForm}
          onClose=${() => setOpenForm(null)}
          onSaved=${handleSaved}
          showToast=${showToast}
          userId=${userId}
        />
      `}
      ${openDetail && !openForm && html`
        <${RecipeDetail}
          recipe=${openDetail}
          onClose=${() => setOpenDetail(null)}
          onEdit=${(r) => setOpenForm(r)}
          onDelete=${handleDelete}
          onMarkCooked=${markCooked}
          lastCookedAt=${lastCookedByRecipe.get(openDetail.id)}
        />
      `}
    </div>
  `;
}

import { html, useState, useEffect, useMemo, useRef } from "../lib/preact.js";
import { supabaseClient as sb } from "../config.js";
import { write, newId } from "../lib/offline.js";
import { CATEGORIES, CATEGORY_STYLE, UNITS } from "../lib/constants.js";
import { canMerge, mergedAmountUnit } from "../lib/categorize.js";
import { parseRecipeText, splitStepsText } from "../lib/parser.js";
import { formatRelativeDate } from "../lib/format.js";
import {
  IconSearch, IconPlus, IconX, IconEdit, IconTrash, IconClock, IconUsers,
  IconCamera, IconLeaf, IconSparkle, IconFlame, IconPlay, IconTimer, IconLink, IconHeart, IconCart,
  IconArrowUp, IconArrowDown, IconPrint, IconShare,
} from "../lib/icons.js";

function round2(n) {
  return Math.round(n * 100) / 100;
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])';

// Offene Dialoge in Öffnungsreihenfolge. Aus der Detailansicht heraus lässt
// sich der Kochmodus öffnen; ohne diesen Stapel würde Escape dann beide auf
// einmal schließen, statt nur den obersten.
const modalStack = [];

// Gemeinsames Verhalten aller Overlays: Escape schließt, die Seite dahinter
// scrollt nicht mit, der Fokus startet im Dialog und bleibt beim Tabben
// darin. Gibt die Referenz zurück, die an das Dialog-Element gehört.
function useModal(onClose) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const token = {};
    modalStack.push(token);

    function onKey(e) {
      if (modalStack[modalStack.length - 1] !== token) return;
      if (e.key === "Escape") {
        closeRef.current();
        return;
      }
      if (e.key !== "Tab" || !ref.current) return;
      const items = [...ref.current.querySelectorAll(FOCUSABLE)].filter((el) => el.getClientRects().length > 0);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const previouslyFocused = document.activeElement;
    if (ref.current) ref.current.focus();

    return () => {
      document.removeEventListener("keydown", onKey);
      const i = modalStack.indexOf(token);
      if (i >= 0) modalStack.splice(i, 1);
      document.body.style.overflow = prevOverflow;
      if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus();
    };
  }, []);

  return ref;
}

// Baut das Lesezeichen-Tool ("Bookmarklet"), mit dem sich Rezepte von
// beliebigen Webseiten importieren lassen — ganz ohne eigenen Server:
// Das Bookmarklet läuft im Kontext der fremden Rezeptseite (kein
// CORS-Problem, da kein Cross-Origin-Fetch nötig) und sammelt dort nur die
// rohen JSON-LD-Textblöcke (schema.org/Recipe) ein. Die eigentliche
// Auswertung passiert danach hier in der App (lib/jsonld.js) — bewusst
// nicht im Bookmarklet dupliziert, damit die Logik zentral bleibt, testbar
// ist und sich ohne neues Bookmarklet weiterentwickeln lässt.
//
// Die Übergabe läuft über postMessage zwischen den beiden Tabs, NICHT über
// einen URL-Parameter: reale Rezeptseiten (z.B. Chefkoch) bündeln ihre
// JSON-LD-Daten oft zusammen mit Kommentaren, Video- und
// Breadcrumb-Metadaten in einem einzigen, teils sehr großen Textblock —
// das sprengt zuverlässig jede URL-Längengrenze ("414 URI Too Long").
// postMessage kennt diese Grenze nicht.
//
// App-URL und -Origin werden zur Laufzeit aus dem aktuellen Standort
// ermittelt, damit das Bookmarklet unabhängig von der tatsächlichen
// Domain funktioniert.
function buildImportBookmarklet() {
  const appUrl = window.location.origin + window.location.pathname;
  const appOrigin = window.location.origin;
  const code = "(function(){"
    + "var scripts=document.querySelectorAll('script[type=\"application/ld+json\"]');"
    + "var matched=[];var all=[];"
    + "scripts.forEach(function(s){var t=s.textContent||'';all.push(t);"
    + "if(/\"@type\"\\s*:\\s*(?:\\[\\s*)?\"?\\s*Recipe/i.test(t))matched.push(t)});"
    + "var out=matched.length?matched:all.slice(0,5);"
    + "if(!out.length){alert('Keine strukturierten Rezeptdaten (JSON-LD) auf dieser Seite gefunden.');return}"
    + "var win=window.open('" + appUrl + "?importld=1','_blank');"
    + "if(!win){alert('Popup wurde blockiert. Bitte Popups fuer diese Seite erlauben und erneut versuchen.');return}"
    + "var sent=false;"
    + "function send(){if(sent)return;sent=true;win.postMessage({source:'meine-rezepte-import',blocks:out},'" + appOrigin + "')}"
    + "window.addEventListener('message',function(e){"
    + "if(e.source===win&&e.data&&e.data.source==='meine-rezepte-import-ready')send()"
    + "});"
    + "setTimeout(send,1500)"
    + "})();";
  return "javascript:" + encodeURIComponent(code);
}

const PHOTO_MAX_EDGE = 1600;
const PHOTO_QUALITY = 0.82;

// Handyfotos sind schnell 3–8 MB groß. Unverkleinert hochgeladen dauert das
// über Mobilfunk spürbar und füllt den Speicherplatz unnötig — für ein
// Rezeptbild reichen 1600 px lange Kante. Schlägt das Umwandeln fehl (altes
// Gerät, exotisches Format), wird die Originaldatei hochgeladen.
async function shrinkImage(file) {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 600 * 1024) {
      bitmap.close();
      return file;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", PHOTO_QUALITY));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

// Sucht in einem Zubereitungsschritt nach einer Zeitangabe ("10 Minuten",
// "1 Std.", "1 Stunde 30 Min.") für den Pro-Schritt-Timer im Kochmodus.
function extractStepMinutes(text) {
  const h = text.match(/(\d+)\s*(?:std\.?|stunden?|h\b)/i);
  const m = text.match(/(\d+)\s*(?:min\.?|minuten?)/i);
  const total = (h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0);
  return total > 0 ? total : null;
}

function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
    osc.onended = () => ctx.close();
  } catch {
    // Web Audio nicht verfügbar — Timer funktioniert trotzdem, nur stumm.
  }
}

// Der Timer rechnet gegen einen festen Ziel-Zeitpunkt statt sekundenweise
// herunterzuzählen: Browser drosseln Timer in Hintergrund-Tabs stark (oft
// auf einmal pro Minute), und genau das passiert beim Kochen ständig —
// eine Zähl-Schleife würde dann deutlich nachgehen. So stimmt die
// Restzeit auch nach einem Ausflug in eine andere App.
function StepTimer({ minutes }) {
  const total = minutes * 60;
  const [remaining, setRemaining] = useState(total);
  const [running, setRunning] = useState(false);
  const deadlineRef = useRef(null);

  useEffect(() => {
    if (!running) return;
    function tick() {
      const left = Math.max(0, Math.round((deadlineRef.current - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) {
        setRunning(false);
        beep();
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      }
    }
    tick();
    const iv = setInterval(tick, 500);
    // Beim Zurückkehren in die App sofort neu rechnen, statt bis zum
    // nächsten Intervall eine veraltete Zeit anzuzeigen.
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [running]);

  function start() {
    deadlineRef.current = Date.now() + remaining * 1000;
    setRunning(true);
  }

  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");
  const finished = !running && remaining === 0;

  return html`
    <div class="step-timer ${finished ? "done" : ""}" onClick=${(e) => e.stopPropagation()}>
      <${IconTimer} strokeWidth="2.2" style="width:14px;height:14px" />
      <span class="step-timer-time">${mm}:${ss}</span>
      ${finished
        ? html`<span>Fertig!</span>`
        : html`
          <button type="button" class="btn-link" onClick=${() => (running ? setRunning(false) : start())}>${running ? "Pause" : remaining === total ? "Start" : "Weiter"}</button>
          ${remaining !== total && html`<button type="button" class="btn-link" onClick=${() => { setRunning(false); setRemaining(total); }}>Reset</button>`}
        `}
    </div>
  `;
}

function CookMode({ recipe, ratio, onClose, onMarkCooked }) {
  const steps = recipe.steps || [];
  const [checked, setChecked] = useState(() => steps.map(() => false));
  const wakeLockRef = useRef(null);
  const dialogRef = useModal(onClose);

  useEffect(() => {
    let cancelled = false;
    async function acquire() {
      if (!("wakeLock" in navigator)) return;
      try {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
      } catch {
        // Berechtigung verweigert oder nicht unterstützt — Kochmodus
        // funktioniert trotzdem, der Bildschirm schaltet sich dann ggf.
        // von selbst ab.
      }
    }
    acquire();
    function onVisible() {
      if (document.visibilityState === "visible" && !cancelled) acquire();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (wakeLockRef.current) wakeLockRef.current.release().catch(() => {});
    };
  }, []);

  function toggle(i) {
    setChecked((c) => c.map((v, idx) => (idx === i ? !v : v)));
  }

  const doneCount = checked.filter(Boolean).length;

  return html`
    <div class="cookmode-overlay" role="dialog" aria-modal="true" aria-label=${`Kochmodus: ${recipe.name}`} tabindex="-1" ref=${dialogRef}>
      <div class="cookmode-header">
        <button class="btn btn-icon btn-ghost" onClick=${onClose} aria-label="Kochmodus verlassen"><${IconX} /></button>
        <span class="cookmode-title">${recipe.name}</span>
        ${steps.length > 0 && html`<span class="cookmode-progress">${doneCount}/${steps.length}</span>`}
      </div>
      <div class="cookmode-body">
        ${(recipe.ingredients || []).length > 0 && html`
          <details class="cookmode-ingredients">
            <summary>Zutaten (${recipe.ingredients.length})</summary>
            ${recipe.ingredients.map((i, idx) => html`
              <div class="ingredient-row" key=${idx}>
                <span>${i.name}</span>
                <span class="ingredient-amt">${round2((Number(i.amount) || 0) * ratio)} ${i.unit}</span>
              </div>
            `)}
          </details>
        `}
        ${steps.length === 0 ? html`<p class="hint">Keine Schritte hinterlegt.</p>` : steps.map((s, i) => {
          const mins = extractStepMinutes(s);
          return html`
            <label class="cookmode-step ${checked[i] ? "done" : ""}" key=${i}>
              <input type="checkbox" class="check" checked=${checked[i]} onChange=${() => toggle(i)} />
              <div class="cookmode-step-body">
                <span class="step-num">${i + 1}</span>
                <div>
                  <p>${s}</p>
                  ${mins && html`<${StepTimer} minutes=${mins} />`}
                </div>
              </div>
            </label>
          `;
        })}
      </div>
      <div class="cookmode-foot">
        <button class="btn btn-primary btn-block" onClick=${() => { onMarkCooked(recipe); onClose(); }}><${IconFlame} strokeWidth="2.2" /> Fertig gekocht</button>
      </div>
    </div>
  `;
}

// Gesucht wird über Name, Zutaten und Notizen — "was kann ich mit Zucchini
// kochen?" ist die häufigste Frage an eine Rezeptsammlung, und die
// beantwortet ein reiner Namensvergleich nicht.
function matchesQuery(recipe, q) {
  if ((recipe.name || "").toLowerCase().includes(q)) return true;
  if ((recipe.ingredients || []).some((i) => (i.name || "").toLowerCase().includes(q))) return true;
  return (recipe.notes || "").toLowerCase().includes(q);
}

function RecipeCard({ recipe, onOpen, onToggleFavorite }) {
  return html`
    <div class="recipe-card-wrap">
    <button
      class="fav-btn ${recipe.is_favorite ? "on" : ""}"
      onClick=${() => onToggleFavorite(recipe)}
      aria-pressed=${recipe.is_favorite ? "true" : "false"}
      aria-label=${recipe.is_favorite ? `„${recipe.name}“ aus den Favoriten entfernen` : `„${recipe.name}“ zu den Favoriten`}
    ><${IconHeart} strokeWidth="2.2" /></button>
    <button class="recipe-card" onClick=${() => onOpen(recipe)}>
      <div class="recipe-thumb ${recipe.image_url ? "" : "empty"}">
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
          ${recipe.calories ? html`<span>${recipe.calories} kcal</span>` : ""}
        </div>
      </div>
    </button>
    </div>
  `;
}

// Verschiebt einen Eintrag um eine Position; außerhalb der Liste passiert
// nichts. Ohne das ließ sich ein vergessener Schritt nur durch Neutippen
// an die richtige Stelle bringen.
function moveItem(list, from, to) {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function ReorderButtons({ index, count, onMove, label }) {
  return html`
    <div class="reorder">
      <button type="button" onClick=${() => onMove(index, index - 1)} disabled=${index === 0}
        aria-label=${`${label} nach oben`}><${IconArrowUp} strokeWidth="2.6" /></button>
      <button type="button" onClick=${() => onMove(index, index + 1)} disabled=${index === count - 1}
        aria-label=${`${label} nach unten`}><${IconArrowDown} strokeWidth="2.6" /></button>
    </div>
  `;
}

function StepEditor({ steps, onChange }) {
  function update(i, value) {
    onChange(steps.map((s, idx) => (idx === i ? value : s)));
  }
  function remove(i) {
    onChange(steps.filter((_, idx) => idx !== i));
  }
  function move(from, to) {
    onChange(moveItem(steps, from, to));
  }
  function add() {
    onChange([...steps, ""]);
  }
  function handlePaste(i, e) {
    const text = e.clipboardData.getData("text");
    if (!text || !text.includes("\n")) return; // einzelne Zeile: normales Einfügen
    const pasted = splitStepsText(text);
    if (pasted.length <= 1) return;
    e.preventDefault();
    const next = [...steps];
    next.splice(i, 1, ...pasted);
    onChange(next);
  }
  return html`
    <div>
      ${steps.map((s, i) => html`
        <div class="step-edit-row" key=${i}>
          <span class="step-num">${i + 1}</span>
          <textarea class="textarea" rows="2" placeholder="Schritt beschreiben …" value=${s} onInput=${(e) => update(i, e.target.value)} onPaste=${(e) => handlePaste(i, e)}></textarea>
          <${ReorderButtons} index=${i} count=${steps.length} onMove=${move} label="Schritt" />
          <button type="button" class="ing-row-remove" onClick=${() => remove(i)} aria-label="Schritt entfernen"><${IconX} strokeWidth="3" /></button>
        </div>
      `)}
      <button type="button" class="btn btn-secondary btn-sm" onClick=${add}><${IconPlus} strokeWidth="2.4" /> Schritt hinzufügen</button>
    </div>
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
  function move(from, to) {
    onChange(moveItem(ingredients, from, to));
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
          <${ReorderButtons} index=${i} count=${ingredients.length} onMove=${move} label="Zutat" />
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
    calories: "", protein_g: "", carbs_g: "", fat_g: "",
    notes: "", ingredients: [], steps: [], image_url: "", imageFile: null, imagePreview: "",
  };
}

// Übernimmt Felder aus einem geparsten Rezept (Text-Import oder
// URL-Import) in den Formular-Zustand — nur was tatsächlich erkannt
// wurde, der Rest bleibt unverändert. Von runImport() und dem
// URL-Import (RecipeForm-Init) gemeinsam genutzt.
function applyParsedFields(base, parsed) {
  return {
    ...base,
    name: parsed.name || base.name,
    portions: parsed.portions || base.portions,
    prep_time: parsed.prepTime ?? base.prep_time,
    cook_time: parsed.cookTime ?? base.cook_time,
    calories: parsed.calories ?? base.calories,
    protein_g: parsed.protein_g ?? base.protein_g,
    carbs_g: parsed.carbs_g ?? base.carbs_g,
    fat_g: parsed.fat_g ?? base.fat_g,
    ingredients: parsed.ingredients && parsed.ingredients.length ? parsed.ingredients : base.ingredients,
    steps: parsed.steps && parsed.steps.length ? parsed.steps : base.steps,
    image_url: parsed.image || base.image_url,
    imagePreview: parsed.image || base.imagePreview,
  };
}

function RecipeForm({ recipe, initialImportData, onClose, onSaved, showToast, userId }) {
  const isEdit = !!recipe;
  const [form, setForm] = useState(() => recipe
    ? {
      name: recipe.name, category: recipe.category, portions: recipe.portions,
      prep_time: recipe.prep_time ?? "", cook_time: recipe.cook_time ?? "", notes: recipe.notes || "",
      calories: recipe.calories ?? "", protein_g: recipe.protein_g ?? "", carbs_g: recipe.carbs_g ?? "", fat_g: recipe.fat_g ?? "",
      ingredients: (recipe.ingredients || []).map((i) => ({ ...i })),
      steps: [...(recipe.steps || [])],
      image_url: recipe.image_url || "", imageFile: null, imagePreview: recipe.image_url || "",
    }
    : initialImportData ? applyParsedFields(emptyForm(), initialImportData) : emptyForm());
  const [importText, setImportText] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [importHint, setImportHint] = useState(null);
  const [saving, setSaving] = useState(false);
  const bookmarkletHref = useMemo(() => buildImportBookmarklet(), []);

  // Schutz vor versehentlichem Verwerfen: Ein Klick neben das Formular hat
  // vorher wortlos alle Eingaben weggeworfen. Verglichen wird gegen den
  // Anfangszustand, damit reines Öffnen und Schließen nicht nachfragt.
  // Die Datei selbst lässt sich nicht serialisieren — ihr Name genügt zur
  // Erkennung, weil er sich beim Auswählen eines Fotos mitändert.
  const snapshot = (f, text) => JSON.stringify({ ...f, imageFile: f.imageFile ? f.imageFile.name : null, importText: text });
  const initialSnapshot = useRef(null);
  if (initialSnapshot.current === null) initialSnapshot.current = snapshot(form, "");

  function requestClose() {
    const dirty = snapshot(form, importText) !== initialSnapshot.current;
    if (dirty && !window.confirm("Änderungen verwerfen? Deine Eingaben gehen verloren.")) return;
    onClose();
  }

  const dialogRef = useModal(requestClose);

  function runImport() {
    if (!importText.trim()) return;
    const parsed = parseRecipeText(importText);
    setForm((f) => applyParsedFields(f, parsed));
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
        const file = await shrinkImage(form.imageFile);
        const path = `${crypto.randomUUID()}-${file.name}`.replace(/\s+/g, "_");
        const { error: upErr } = await sb.storage.from("recipe-photos").upload(path, file, { upsert: true });
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
      calories: form.calories === "" ? null : Number(form.calories),
      protein_g: form.protein_g === "" ? null : Number(form.protein_g),
      carbs_g: form.carbs_g === "" ? null : Number(form.carbs_g),
      fat_g: form.fat_g === "" ? null : Number(form.fat_g),
      notes: form.notes,
      ingredients: form.ingredients.filter((i) => i.name.trim()).map((i) => ({ name: i.name.trim(), amount: Number(i.amount) || 0, unit: i.unit })),
      steps: form.steps.map((s) => s.trim()).filter(Boolean),
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
    <div class="overlay" onClick=${(e) => e.target === e.currentTarget && requestClose()}>
      <div class="sheet wide" role="dialog" aria-modal="true" aria-label=${isEdit ? "Rezept bearbeiten" : "Neues Rezept"} tabindex="-1" ref=${dialogRef}>
        <div class="sheet-header">
          <button class="btn btn-icon btn-ghost" onClick=${requestClose} aria-label="Schließen"><${IconX} /></button>
          <h2>${isEdit ? "Rezept bearbeiten" : "Neues Rezept"}</h2>
        </div>
        <form onSubmit=${submit}>
          <div class="sheet-body">
            ${initialImportData && html`
              <p class="hint" style="margin-bottom:16px;color:var(--primary-dark)">Von der Rezeptseite übernommen. Bitte kurz prüfen und bei Bedarf korrigieren.</p>
            `}
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
              <details class="import-box">
                <summary><${IconLink} strokeWidth="2.2" style="width:16px;height:16px" /> Von einer Rezeptseite importieren (Lesezeichen-Tool)</summary>
                <p class="hint">Ziehe diesen Link in deine Lesezeichenleiste. Öffne dann auf einer Rezeptseite (mit strukturierten Rezeptdaten) das Lesezeichen — das Rezept wird hier automatisch vorausgefüllt, in einem neuen Tab.</p>
                <a class="btn btn-secondary btn-sm" style="display:inline-flex" href=${bookmarkletHref} onClick=${(e) => e.preventDefault()}><${IconLink} strokeWidth="2.2" /> Rezept importieren</a>
                <p class="hint" style="margin-top:8px">Funktioniert nur bei Seiten, die strukturierte Rezeptdaten (schema.org) einbetten — die meisten größeren Rezeptseiten tun das. Falls sich ein Popup-Blocker meldet, bitte Popups für die Rezeptseite erlauben und erneut versuchen.</p>
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
                <input type="file" accept="image/*" style="display:none" onChange=${onPickFile} />
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

            <label class="hint" style="display:block;margin-bottom:8px">Nährwerte pro Portion (optional)</label>
            <div class="field-row">
              <div class="field">
                <label>Kalorien (kcal)</label>
                <input class="input" type="number" min="0" value=${form.calories} onInput=${(e) => setForm({ ...form, calories: e.target.value })} />
              </div>
              <div class="field">
                <label>Eiweiß (g)</label>
                <input class="input" type="number" min="0" step="0.1" value=${form.protein_g} onInput=${(e) => setForm({ ...form, protein_g: e.target.value })} />
              </div>
            </div>
            <div class="field-row">
              <div class="field">
                <label>Kohlenhydrate (g)</label>
                <input class="input" type="number" min="0" step="0.1" value=${form.carbs_g} onInput=${(e) => setForm({ ...form, carbs_g: e.target.value })} />
              </div>
              <div class="field">
                <label>Fett (g)</label>
                <input class="input" type="number" min="0" step="0.1" value=${form.fat_g} onInput=${(e) => setForm({ ...form, fat_g: e.target.value })} />
              </div>
            </div>

            <div class="field">
              <label>Zutaten</label>
              <${IngredientEditor} ingredients=${form.ingredients} onChange=${(ingredients) => setForm({ ...form, ingredients })} />
            </div>

            <div class="field">
              <label>Zubereitung</label>
              <${StepEditor} steps=${form.steps} onChange=${(steps) => setForm({ ...form, steps })} />
            </div>

            <div class="field">
              <label>Notizen</label>
              <textarea class="textarea" rows="3" placeholder="Freie Notizen …" value=${form.notes} onInput=${(e) => setForm({ ...form, notes: e.target.value })}></textarea>
            </div>
          </div>
          <div class="sheet-foot">
            <button type="button" class="btn btn-secondary" onClick=${requestClose}>Abbrechen</button>
            <button type="submit" class="btn btn-primary" disabled=${saving}>${saving ? "Speichert …" : "Rezept speichern"}</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

// Rezept als schlichter Text — für "Teilen" (WhatsApp, Mail) und als
// Rückfallebene zum Kopieren. Die App hat keine öffentlichen Rezept-Links,
// also wird der Inhalt selbst weitergegeben, nicht eine Adresse.
function recipeToText(recipe, portions, ratio) {
  const lines = [recipe.name, ""];
  lines.push(`Für ${portions} Portion${portions === 1 ? "" : "en"}`);
  const total = (Number(recipe.prep_time) || 0) + (Number(recipe.cook_time) || 0);
  if (total > 0) lines.push(`Zeit: ${total} Min.`);
  const ings = recipe.ingredients || [];
  if (ings.length > 0) {
    lines.push("", "Zutaten");
    for (const i of ings) lines.push(`- ${round2((Number(i.amount) || 0) * ratio)} ${i.unit} ${i.name}`);
  }
  const steps = recipe.steps || [];
  if (steps.length > 0) {
    lines.push("", "Zubereitung");
    steps.forEach((s, idx) => lines.push(`${idx + 1}. ${s}`));
  }
  if (recipe.notes) lines.push("", "Notizen", recipe.notes);
  return lines.join("\n");
}

function RecipeDetail({ recipe, onClose, onEdit, onDelete, onMarkCooked, onToggleFavorite, onAddToShopping, onShare, lastCookedAt }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [portions, setPortions] = useState(recipe.portions);
  const [cookModeOpen, setCookModeOpen] = useState(false);
  const dialogRef = useModal(onClose);
  const totalTime = (Number(recipe.prep_time) || 0) + (Number(recipe.cook_time) || 0);
  const ratio = portions / (Number(recipe.portions) || 1);
  if (cookModeOpen) {
    return html`<${CookMode} recipe=${recipe} ratio=${ratio} onClose=${() => setCookModeOpen(false)} onMarkCooked=${onMarkCooked} />`;
  }
  return html`
    <div class="overlay" onClick=${(e) => e.target === e.currentTarget && onClose()}>
      <div class="sheet wide" role="dialog" aria-modal="true" aria-label=${recipe.name} tabindex="-1" ref=${dialogRef}>
        <div class="sheet-header">
          <button class="btn btn-icon btn-ghost" onClick=${onClose} aria-label="Schließen"><${IconX} /></button>
          <h2 style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${recipe.name}</h2>
          <button
            class="btn btn-icon btn-ghost fav-icon ${recipe.is_favorite ? "on" : ""}"
            onClick=${() => onToggleFavorite(recipe)}
            aria-pressed=${recipe.is_favorite ? "true" : "false"}
            aria-label=${recipe.is_favorite ? "Aus den Favoriten entfernen" : "Zu den Favoriten"}
          ><${IconHeart} /></button>
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
          <div class="recipe-detail-photo ${recipe.image_url ? "" : "empty"}">
            ${recipe.image_url ? html`<img src=${recipe.image_url} />` : html`<${IconLeaf} />`}
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px">
            <div class="badge" style="background:var(--${CATEGORY_STYLE[recipe.category] || "tag-7"}-soft);color:var(--${CATEGORY_STYLE[recipe.category] || "tag-7"})">${recipe.category}</div>
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
              ${lastCookedAt && html`<span class="hint">Zuletzt gekocht: ${formatRelativeDate(lastCookedAt)}</span>`}
              <button type="button" class="btn btn-secondary btn-sm" onClick=${() => onAddToShopping(recipe, ratio)}><${IconCart} strokeWidth="2.2" /> Auf die Einkaufsliste</button>
              <button type="button" class="btn btn-secondary btn-sm btn-icon-sm" onClick=${() => onShare(recipe, portions, ratio)}
                title="Rezept teilen" aria-label="Rezept teilen"><${IconShare} strokeWidth="2.2" /></button>
              <button type="button" class="btn btn-secondary btn-sm btn-icon-sm" onClick=${() => window.print()}
                title="Rezept drucken" aria-label="Rezept drucken"><${IconPrint} strokeWidth="2.2" /></button>
              <button type="button" class="btn btn-secondary btn-sm" onClick=${() => onMarkCooked(recipe)}><${IconFlame} strokeWidth="2.2" /> Heute gekocht</button>
              ${(recipe.steps || []).length > 0 && html`<button type="button" class="btn btn-accent btn-sm" onClick=${() => setCookModeOpen(true)}><${IconPlay} strokeWidth="2.2" /> Kochmodus</button>`}
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
            ${recipe.calories ? html`<div class="meta-tile"><span class="n">${recipe.calories}</span><span class="l">kcal / Portion</span></div>` : ""}
            ${recipe.protein_g ? html`<div class="meta-tile"><span class="n">${recipe.protein_g} g</span><span class="l">Eiweiß</span></div>` : ""}
            ${recipe.carbs_g ? html`<div class="meta-tile"><span class="n">${recipe.carbs_g} g</span><span class="l">Kohlenhydrate</span></div>` : ""}
            ${recipe.fat_g ? html`<div class="meta-tile"><span class="n">${recipe.fat_g} g</span><span class="l">Fett</span></div>` : ""}
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

export function RecipesView({ recipes, onCreate, onUpdate, onDelete, cookLog, onCookLogChange, shoppingItems, onShoppingChange, urlImportRecipe, onUrlImportConsumed, showToast, userId }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Alle");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [openForm, setOpenForm] = useState(null); // null | 'new' | recipe
  const [openDetail, setOpenDetail] = useState(null);

  useEffect(() => {
    if (!urlImportRecipe) return;
    setOpenForm("new");
  }, [urlImportRecipe]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return recipes.filter((r) =>
      (category === "Alle" || r.category === category) &&
      (!favoritesOnly || r.is_favorite) &&
      (q === "" || matchesQuery(r, q))
    );
  }, [recipes, search, category, favoritesOnly]);

  const lastCookedByRecipe = useMemo(() => {
    const map = new Map();
    for (const entry of cookLog) {
      if (!entry.recipe_id) continue;
      const cur = map.get(entry.recipe_id);
      if (!cur || entry.cooked_at > cur) map.set(entry.recipe_id, entry.cooked_at);
    }
    return map;
  }, [cookLog]);

  function closeForm() {
    setOpenForm(null);
    if (urlImportRecipe) onUrlImportConsumed();
  }

  function handleSaved(recipe, queued) {
    if (openForm && openForm !== "new") onUpdate(recipe); else onCreate(recipe);
    closeForm();
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

  // Zutaten direkt aufs Einkaufszettel legen, ohne den Umweg über den
  // Wochenplan. Gleichnamiges wird wie dort zusammengeführt, damit nicht
  // zwei Zeilen "Mehl" nebeneinander stehen.
  async function addToShopping(recipe, ratio) {
    const lines = (recipe.ingredients || [])
      .filter((i) => (i.name || "").trim())
      .map((i) => ({ name: i.name.trim(), amount: round2((Number(i.amount) || 0) * ratio), unit: i.unit }));
    if (lines.length === 0) {
      showToast("Dieses Rezept hat keine Zutaten hinterlegt.", "error");
      return;
    }

    let next = [...shoppingItems];
    const writes = [];
    let merged = 0;
    for (const line of lines) {
      const existing = next.find((it) => canMerge(it, line));
      if (existing) {
        const { amount, unit } = mergedAmountUnit(existing, line);
        const from_recipes = existing.from_recipes && existing.from_recipes.includes(recipe.name)
          ? existing.from_recipes
          : [...(existing.from_recipes || []), recipe.name];
        next = next.map((it) => (it.id === existing.id ? { ...it, amount, unit, from_recipes } : it));
        writes.push(["update", { amount, unit, from_recipes }, { id: existing.id }]);
        merged++;
      } else {
        const item = { id: newId(), user_id: userId, name: line.name, amount: line.amount, unit: line.unit, checked: false, from_recipes: [recipe.name] };
        next = [...next, item];
        writes.push(["insert", item, null]);
      }
    }
    onShoppingChange(next);

    let failed = 0;
    for (const [op, payload, match] of writes) {
      const { error } = await write("shopping_items", op, payload, match);
      if (error) failed++;
    }
    if (failed > 0) {
      showToast(`${failed} von ${writes.length} Artikeln konnten nicht gespeichert werden.`, "error");
      return;
    }
    showToast(merged > 0
      ? `${lines.length} Zutaten übernommen (${merged} zusammengeführt).`
      : `${lines.length} Zutaten auf die Einkaufsliste gelegt.`, "success");
  }

  // Auf dem Handy öffnet das die native Teilen-Auswahl, am Rechner gibt es
  // die meist nicht — dort landet der Text in der Zwischenablage.
  async function shareRecipe(recipe, portions, ratio) {
    const text = recipeToText(recipe, portions, ratio);
    if (navigator.share) {
      try {
        await navigator.share({ title: recipe.name, text });
        return;
      } catch (err) {
        if (err && err.name === "AbortError") return; // vom Nutzer abgebrochen
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      showToast("Rezept in die Zwischenablage kopiert.", "success");
    } catch {
      showToast("Teilen wird von diesem Browser nicht unterstützt.", "error");
    }
  }

  async function toggleFavorite(recipe) {
    const is_favorite = !recipe.is_favorite;
    onUpdate({ ...recipe, is_favorite });
    if (openDetail && openDetail.id === recipe.id) setOpenDetail({ ...openDetail, is_favorite });
    const { error } = await write("recipes", "update", { is_favorite }, { id: recipe.id });
    if (error) {
      onUpdate({ ...recipe, is_favorite: !is_favorite });
      showToast("Konnte Favorit nicht speichern: " + error.message, "error");
    }
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
          <input class="input" placeholder="Rezept, Zutat oder Notiz suchen …" value=${search} onInput=${(e) => setSearch(e.target.value)} />
        </div>
      </div>
      <div class="category-scroll" style="margin-bottom:18px">
        <button class="cat-pill ${category === "Alle" ? "active" : ""}" onClick=${() => setCategory("Alle")}>Alle</button>
        <button class="cat-pill fav-pill ${favoritesOnly ? "active" : ""}" onClick=${() => setFavoritesOnly((v) => !v)} aria-pressed=${favoritesOnly ? "true" : "false"}>
          <${IconHeart} strokeWidth="2.4" /> Favoriten
        </button>
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
          ${filtered.map((r) => html`<${RecipeCard} key=${r.id} recipe=${r} onOpen=${setOpenDetail} onToggleFavorite=${toggleFavorite} />`)}
        </div>
      `}

      <button class="fab" onClick=${() => setOpenForm("new")} aria-label="Neues Rezept"><${IconPlus} strokeWidth="2.4" /></button>

      ${openForm && html`
        <${RecipeForm}
          recipe=${openForm === "new" ? null : openForm}
          initialImportData=${openForm === "new" ? urlImportRecipe : null}
          onClose=${closeForm}
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
          onToggleFavorite=${toggleFavorite}
          onAddToShopping=${addToShopping}
          onShare=${shareRecipe}
          lastCookedAt=${lastCookedByRecipe.get(openDetail.id)}
        />
      `}
    </div>
  `;
}

import { parseIngredientLine, splitStepsText } from "./parser.js";

// Verarbeitet die von schema.org/Recipe strukturierten Daten, wie sie auf
// den meisten Rezeptseiten in einem <script type="application/ld+json">
// stehen. Die eigentliche Extraktion aus der fremden Seite passiert im
// Lesezeichen-Tool (siehe recipes.js) — das Bookmarklet holt dort bewusst
// nur die rohen JSON-LD-Textblöcke, damit die ganze inhaltliche Auswertung
// hier zentral, getestet und wartbar bleibt, statt im Bookmarklet dupliziert
// zu werden.

export function parseJsonLdBlocks(rawTexts) {
  const blocks = [];
  for (const raw of rawTexts || []) {
    try {
      blocks.push(JSON.parse(raw));
    } catch {
      // einzelner kaputter/unvollständiger Block — überspringen, Rest weiter versuchen
    }
  }
  return blocks;
}

function collectNodes(data, out) {
  if (!data) return;
  if (Array.isArray(data)) {
    for (const d of data) collectNodes(d, out);
    return;
  }
  if (typeof data !== "object") return;
  if (data["@graph"]) collectNodes(data["@graph"], out);
  out.push(data);
}

function isRecipeType(node) {
  const t = node["@type"];
  if (!t) return false;
  const types = Array.isArray(t) ? t : [t];
  return types.some((x) => typeof x === "string" && x.toLowerCase() === "recipe");
}

function findRecipeNode(blocks) {
  const nodes = [];
  for (const block of blocks) collectNodes(block, nodes);
  return nodes.find(isRecipeType) || null;
}

// ISO-8601-Dauer ("PT1H30M", "PT15M") in Minuten.
export function parseIsoDuration(iso) {
  if (!iso || typeof iso !== "string") return null;
  const m = iso.match(/^P(?:\d+D)?T?(?:(\d+)H)?(?:(\d+)M)?/i);
  if (!m) return null;
  const total = Number(m[1] || 0) * 60 + Number(m[2] || 0);
  return total > 0 ? total : null;
}

function extractNumber(val) {
  if (val == null) return null;
  if (typeof val === "number") return Number.isFinite(val) ? val : null;
  const m = String(val).match(/[\d.,]+/);
  if (!m) return null;
  const n = parseFloat(m[0].replace(",", "."));
  return Number.isNaN(n) ? null : n;
}

function extractYield(val) {
  if (val == null) return null;
  const arr = Array.isArray(val) ? val : [val];
  for (const v of arr) {
    const s = typeof v === "object" && v !== null ? (v.value ?? v["@value"] ?? "") : v;
    const m = String(s).match(/\d+/);
    if (m) return Number(m[0]);
  }
  return null;
}

function extractImage(val) {
  if (!val) return null;
  if (typeof val === "string") return val;
  if (Array.isArray(val)) {
    for (const v of val) {
      const r = extractImage(v);
      if (r) return r;
    }
    return null;
  }
  if (typeof val === "object") return val.url || val["@id"] || null;
  return null;
}

function extractIngredients(val) {
  const arr = Array.isArray(val) ? val : (val ? [val] : []);
  return arr.map((s) => parseIngredientLine(String(s))).filter(Boolean);
}

function collectInstructionTexts(val, out) {
  if (!val) return;
  if (typeof val === "string") {
    out.push(val);
    return;
  }
  if (Array.isArray(val)) {
    for (const v of val) collectInstructionTexts(v, out);
    return;
  }
  if (typeof val === "object") {
    if (val.itemListElement) {
      collectInstructionTexts(val.itemListElement, out);
      return;
    }
    const text = val.text || val.name;
    if (text) out.push(text);
  }
}

function extractSteps(val) {
  const raw = [];
  collectInstructionTexts(val, raw);
  if (raw.length === 1) {
    // Manche Seiten liefern die komplette Zubereitung als einen
    // zusammenhängenden String statt als Liste — dieselbe Aufteilungslogik
    // wie beim Text-Import anwenden, statt alles in einem Schritt zu lassen.
    return splitStepsText(raw[0]);
  }
  return raw.map((s) => s.trim()).filter(Boolean);
}

function extractNutrition(node) {
  const n = node.nutrition;
  if (!n || typeof n !== "object") return {};
  return {
    calories: extractNumber(n.calories),
    protein_g: extractNumber(n.proteinContent),
    carbs_g: extractNumber(n.carbohydrateContent),
    fat_g: extractNumber(n.fatContent),
  };
}

// Nimmt eine Liste geparster JSON-LD-Blöcke (aus parseJsonLdBlocks) und
// liefert, falls ein Recipe-Objekt gefunden wurde, ein Objekt in derselben
// Form wie parseRecipeText() zurück — oder null, wenn kein Rezept gefunden
// wurde (z.B. Seite ohne strukturierte Rezeptdaten).
export function extractRecipeFromJsonLd(blocks) {
  const node = findRecipeNode(blocks);
  if (!node) return null;
  return {
    name: typeof node.name === "string" ? node.name.trim() : "",
    portions: extractYield(node.recipeYield),
    prepTime: parseIsoDuration(node.prepTime),
    cookTime: parseIsoDuration(node.cookTime),
    ingredients: extractIngredients(node.recipeIngredient || node.ingredients),
    steps: extractSteps(node.recipeInstructions),
    image: extractImage(node.image),
    ...extractNutrition(node),
  };
}

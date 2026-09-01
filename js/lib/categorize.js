import { SHOPPING_GROUPS } from "./constants.js";

const MASS = { g: 1, kg: 1000 };
const VOLUME = { ml: 1, l: 1000 };

export function unitBase(unit) {
  if (unit in MASS) return { group: "mass", factor: MASS[unit], base: "g" };
  if (unit in VOLUME) return { group: "volume", factor: VOLUME[unit], base: "ml" };
  return null;
}

// Grobe Singular/Plural-Normalisierung für deutsche Zutatennamen (Heuristik,
// kein vollständiger Stemmer — reicht für "Karotte"/"Karotten" etc.).
export function normalizeName(name) {
  let n = (name || "").trim().toLowerCase();
  n = n.replace(/[.,;]+$/, "");
  for (const suffix of ["nen", "en", "e", "n", "s"]) {
    if (n.length - suffix.length >= 3 && n.endsWith(suffix)) {
      return n.slice(0, -suffix.length);
    }
  }
  return n;
}

export function canMerge(a, b) {
  if (normalizeName(a.name) !== normalizeName(b.name)) return false;
  if (a.unit === b.unit) return true;
  const ba = unitBase(a.unit);
  const bb = unitBase(b.unit);
  return !!(ba && bb && ba.group === bb.group);
}

export function mergedAmountUnit(a, b) {
  if (a.unit === b.unit) return { amount: round2(a.amount + b.amount), unit: a.unit };
  const ba = unitBase(a.unit);
  const grams = a.amount * ba.factor + b.amount * unitBase(b.unit).factor;
  return { amount: round2(grams), unit: ba.base };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// Führt eine Liste roher Zutaten-/Artikelzeilen (name, amount, unit,
// fromRecipe?) zu zusammengefassten Zeilen zusammen. fromRecipe wird als
// from_recipes-Array pro Zeile mitgeführt.
export function mergeLines(lines) {
  const result = [];
  for (const line of lines) {
    const amount = Number(line.amount) || 0;
    const fromRecipes = line.fromRecipe ? [line.fromRecipe] : (line.fromRecipes || []);
    const candidate = { name: line.name.trim(), amount, unit: line.unit };
    const existing = result.find((r) => canMerge(r, candidate));
    if (existing) {
      const merged = mergedAmountUnit(existing, candidate);
      existing.amount = merged.amount;
      existing.unit = merged.unit;
      for (const r of fromRecipes) {
        if (!existing.from_recipes.includes(r)) existing.from_recipes.push(r);
      }
    } else {
      result.push({ name: candidate.name, amount: candidate.amount, unit: candidate.unit, from_recipes: [...fromRecipes] });
    }
  }
  return result;
}

// Sehr kurze Muster (z.B. "ei" für Eier) matchen sonst als Teilstring in
// unverwandten Wörtern ("Reis", "Weizenmehl") — dafür an Wortgrenzen
// gebunden. Längere Muster bleiben bewusst Teilstring-Treffer, damit
// deutsche Wortzusammensetzungen ("Zwiebelringe", "Goudakäse") weiter
// erkannt werden.
// "ei" als Teilstring trifft sonst auch unverwandte Wörter wie "Reis"
// oder "Weizenmehl" — deshalb an Wortgrenzen gebunden. Andere kurze
// Muster wie "öl" bleiben bewusst Teilstring-Treffer, weil sie als
// Kompositum-Suffix vorkommen ("Rapsöl", "Olivenöl") und dort keine
// vergleichbaren Kollisionen bekannt sind.
const BOUNDARY_PATTERNS = new Set(["ei", "eier"]);

function matchesPattern(name, pattern) {
  if (BOUNDARY_PATTERNS.has(pattern)) {
    return new RegExp(`(?<![\\p{L}\\p{N}])${pattern}(?![\\p{L}\\p{N}])`, "iu").test(name);
  }
  return name.includes(pattern);
}

export function assignShoppingGroup(item) {
  const name = (item.name || "").toLowerCase();
  for (const group of SHOPPING_GROUPS) {
    if (!group.namePatterns) continue;
    if (group.namePatterns.some((p) => matchesPattern(name, p))) return group;
  }
  for (const group of SHOPPING_GROUPS) {
    if (!group.unitPatterns) continue;
    if (group.unitPatterns.includes(item.unit)) return group;
  }
  return SHOPPING_GROUPS[SHOPPING_GROUPS.length - 1];
}

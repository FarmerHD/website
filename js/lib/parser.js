import { UNITS } from "./constants.js";

// Browser-seitiger Text-Heuristik-Parser für eingefügte Rezepttexte
// (2.1). Kein Server-/KI-Aufruf — reine Mustererkennung. Ergebnis füllt
// nur die Formularfelder, es wird nichts automatisch gespeichert.

const FRACTIONS = { "½": 0.5, "⅓": 1 / 3, "⅔": 2 / 3, "¼": 0.25, "¾": 0.75, "⅕": 0.2, "⅛": 0.125 };
const UNIT_ALIASES = {
  el: "EL", "essl.": "EL", esslöffel: "EL",
  tl: "TL", teel: "TL", teelöffel: "TL",
  stk: "Stück", "stk.": "Stück", stück: "Stück", stange: "Stück",
  g: "g", gramm: "g",
  kg: "kg", kilo: "kg", kilogramm: "kg",
  ml: "ml", milliliter: "ml",
  l: "l", liter: "l",
};
const UNIT_LOOKUP = new Map(UNITS.map((u) => [u.toLowerCase(), u]));
for (const [alias, unit] of Object.entries(UNIT_ALIASES)) UNIT_LOOKUP.set(alias, unit);

function parseNumberToken(token) {
  if (!token) return null;
  token = token.trim();
  if (token in FRACTIONS) return FRACTIONS[token];
  // Gemischte Zahl "1½" oder "1 ½"
  const mixed = token.match(/^(\d+)\s*([½⅓⅔¼¾⅕⅛])$/);
  if (mixed) return Number(mixed[1]) + FRACTIONS[mixed[2]];
  const asciiFraction = token.match(/^(\d+)\/(\d+)$/);
  if (asciiFraction) return Number(asciiFraction[1]) / Number(asciiFraction[2]);
  const decimal = token.replace(",", ".");
  const n = parseFloat(decimal);
  return Number.isNaN(n) ? null : n;
}

const AMOUNT_RE = /^\s*(\d+[.,]?\d*\s*[½⅓⅔¼¾⅕⅛]|\d+\/\d+|[½⅓⅔¼¾⅕⅛]|\d+[.,]?\d*)\s*/;

function stripBullet(line) {
  return line.replace(/^[\s*•\-–—▪]+/, "").trim();
}

export function parseIngredientLine(rawLine) {
  const line = stripBullet(rawLine);
  if (!line) return null;
  const amtMatch = line.match(AMOUNT_RE);
  let rest = line;
  let amount = null;
  if (amtMatch) {
    amount = parseNumberToken(amtMatch[1].replace(/\s+/g, " "));
    rest = line.slice(amtMatch[0].length).trim();
  }
  // Zusammengeschriebene Mengen wie "200g" fallen bereits durch AMOUNT_RE
  // (nur Ziffern), Einheit steckt am Wortanfang von `rest`.
  let unit = null;
  const unitMatch = rest.match(/^([a-zA-Zäöüß.]+)\.?\b/);
  if (unitMatch) {
    const key = unitMatch[1].toLowerCase().replace(/\.$/, "");
    const found = UNIT_LOOKUP.get(key) || UNIT_LOOKUP.get(key + ".");
    if (found) {
      unit = found;
      rest = rest.slice(unitMatch[0].length).trim();
    }
  }
  rest = rest.replace(/^[,-]\s*/, "");
  if (amount === null && !rest) return null;
  return {
    name: rest || rawLine.trim(),
    amount: amount === null ? 1 : Math.round(amount * 100) / 100,
    unit: unit || "Stück",
  };
}

// Zerlegt einen Zubereitungstext in einzelne Schritte. Durch Leerzeilen
// getrennte Absätze zählen als je ein Schritt; ohne Leerzeilen werden
// durchnummerierte/mit Bullet versehene Zeilen gruppiert; gibt es gar
// keine Nummerierung, wird jede nicht-leere Zeile als eigener Schritt
// behandelt (der häufigste Fall bei zeilenweise, aber ohne Leerzeilen
// kopierten Zubereitungsschritten — sonst würde alles in einem einzigen
// Schritt landen).
export function splitStepsText(text) {
  const normalized = (text || "").replace(/\r\n/g, "\n");
  const paragraphs = normalized.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length > 1) {
    return paragraphs
      .map((p) => p.split("\n").map((l) => l.replace(/^(?:\d+[.)]|[-•*])\s*/, "").trim()).join(" ").trim())
      .filter(Boolean);
  }
  const lines = normalized.split("\n").map((l) => l.trim()).filter(Boolean);
  const steps = [];
  let buffer = "";
  for (const l of lines) {
    const marked = l.match(/^(?:\d+[.)]|[-•*])\s*(.*)$/);
    if (marked) {
      if (buffer) steps.push(buffer.trim());
      buffer = marked[1];
    } else if (buffer) {
      buffer = `${buffer} ${l}`;
    } else {
      steps.push(l);
    }
  }
  if (buffer) steps.push(buffer.trim());
  return steps.filter(Boolean);
}

function findSectionIndex(lines, keywords) {
  return lines.findIndex((l) => {
    const t = l.trim().toLowerCase().replace(/:$/, "");
    return keywords.includes(t);
  });
}

function extractNumberNear(text, keywordRe) {
  const m = text.match(keywordRe);
  return m ? Number(m[1]) : null;
}

export function parseRecipeText(text) {
  const rawLines = text.replace(/\r\n/g, "\n").split("\n").map((l) => l.trim());
  const lines = rawLines.filter((l) => l.length > 0);

  const zutatenIdx = findSectionIndex(lines, ["zutaten"]);
  const zubereitungIdx = findSectionIndex(lines, ["zubereitung", "zubereitungsschritte", "anleitung"]);

  const headerLines = lines.slice(0, zutatenIdx >= 0 ? zutatenIdx : lines.length);
  const headerText = headerLines.join("\n");

  const name = headerLines.find((l) => {
    const low = l.toLowerCase();
    return l.length > 1 && l.length < 120 && !/^\d/.test(l) && !low.includes("portion") && !low.includes("minuten") && !low.includes("zeit");
  }) || headerLines[0] || "";

  const portions = extractNumberNear(headerText, /(\d+)\s*(?:portionen|personen|servings)/i);
  const prepTime = extractNumberNear(headerText, /vorbereitung[a-zäöü]*\s*(?:zeit)?\D{0,12}(\d+)\s*min/i)
    ?? extractNumberNear(headerText, /vorbereitung\D{0,12}(\d+)/i);
  const cookTime = extractNumberNear(headerText, /(?:koch|back|gar)[a-zäöü]*zeit\D{0,12}(\d+)\s*min/i)
    ?? extractNumberNear(headerText, /(?:koch|back|gar)zeit\D{0,12}(\d+)/i);

  const result = {
    name: name.trim(),
    portions: portions || null,
    prepTime: prepTime || null,
    cookTime: cookTime || null,
    ingredients: [],
    steps: [],
    hasIngredientsSection: zutatenIdx >= 0,
  };

  if (zutatenIdx < 0) return result;

  const ingredientEnd = zubereitungIdx >= 0 && zubereitungIdx > zutatenIdx ? zubereitungIdx : lines.length;
  const ingredientLines = lines.slice(zutatenIdx + 1, ingredientEnd);
  result.ingredients = ingredientLines
    .map(parseIngredientLine)
    .filter(Boolean);

  if (zubereitungIdx >= 0) {
    const stepLines = lines.slice(zubereitungIdx + 1);
    result.steps = splitStepsText(stepLines.join("\n"));
  }

  return result;
}

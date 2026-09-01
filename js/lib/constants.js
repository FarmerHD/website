// Feste Listen laut Funktions- und Datenspezifikation (Abschnitt 2.1).
// Nicht verändern ohne die Spezifikation anzupassen — Kategorisierung,
// Formulare und die Supabase-Tabellen gehen von genau diesen Werten aus.

export const CATEGORIES = [
  "Frühstück",
  "Mittagessen",
  "Abendessen",
  "Snack",
  "Dessert",
  "Backen",
  "Sonstiges",
];

export const CATEGORY_STYLE = {
  "Frühstück": "tag-1",
  "Mittagessen": "tag-2",
  "Abendessen": "tag-3",
  "Snack": "tag-4",
  "Dessert": "tag-5",
  "Backen": "tag-6",
  "Sonstiges": "tag-7",
};

export const UNITS = ["g", "kg", "ml", "l", "Stück", "EL", "TL"];

// Wochentage für die Zuordnung im Wochenplan.
export const WEEKDAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

export const WEEKDAY_SHORT = {
  "Montag": "Mo", "Dienstag": "Di", "Mittwoch": "Mi", "Donnerstag": "Do",
  "Freitag": "Fr", "Samstag": "Sa", "Sonntag": "So",
};

// Lagerorte für den Vorrat, auf Wunsch fest vorgegeben.
export const PANTRY_LOCATIONS = ["Kühlschrank", "Gefrierschrank", "Keller", "Küche", "Sonstiges"];

export const PANTRY_LOCATION_STYLE = {
  "Kühlschrank": "tag-8",
  "Gefrierschrank": "tag-5",
  "Keller": "tag-6",
  "Küche": "tag-2",
  "Sonstiges": "tag-7",
};

// Warengruppen für die Einkaufsliste, in Zuordnungsreihenfolge (2.3).
export const SHOPPING_GROUPS = [
  {
    key: "fleisch-fisch",
    label: "Fleisch & Fisch",
    style: "tag-2",
    namePatterns: ["hähnchen", "rind", "schwein", "hack", "wurst", "schinken", "lachs", "thunfisch", "fleisch", "fisch"],
  },
  {
    key: "milchprodukte",
    label: "Milchprodukte",
    style: "tag-1",
    namePatterns: ["milch", "käse", "joghurt", "sahne", "butter", "quark", "ei", "eier"],
  },
  {
    key: "gemuese-obst",
    label: "Gemüse & Obst",
    style: "tag-3",
    namePatterns: ["zwiebel", "knoblauch", "karotte", "paprika", "tomate", "salat", "gurke", "apfel", "banane", "zitrone", "kartoffel", "brokkoli", "spinat"],
    unitPatterns: ["Zehe", "Bund"],
  },
  {
    key: "gewuerze-oele",
    label: "Gewürze & Öle",
    style: "tag-6",
    namePatterns: ["salz", "pfeffer", "öl", "essig", "zucker", "gewürz", "oregano", "basilikum", "zimt", "paprikapulver", "kurkuma"],
    unitPatterns: ["EL", "TL", "Prise"],
  },
  {
    key: "trockenware",
    label: "Trockenware",
    style: "tag-4",
    namePatterns: ["pasta", "nudel", "reis", "mehl", "linse", "bohne", "erbse", "couscous", "haferflocken"],
  },
  {
    key: "konserven",
    label: "Konserven",
    style: "tag-8",
    namePatterns: ["dose", "konserv"],
    unitPatterns: ["Dose"],
  },
  {
    key: "extras",
    label: "Extras",
    style: "tag-7",
  },
];

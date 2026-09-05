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

// "Prise", "Zehe", "Bund" und "Dose" sind in deutschen Rezepten sehr
// gängig. Fehlten sie, landete die Einheit im Zutatennamen ("Prise Salz",
// Menge 1 Stück) — und die danach filternden Warengruppen unten liefen ins
// Leere, weil es die Einheiten gar nicht geben konnte.
export const UNITS = ["g", "kg", "ml", "l", "Stück", "EL", "TL", "Prise", "Zehe", "Bund", "Dose"];

// Wochentage für die Zuordnung im Wochenplan.
export const WEEKDAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

export const WEEKDAY_SHORT = {
  "Montag": "Mo", "Dienstag": "Di", "Mittwoch": "Mi", "Donnerstag": "Do",
  "Freitag": "Fr", "Samstag": "Sa", "Sonntag": "So",
};

// Lagerorte für den Vorrat, auf Wunsch fest vorgegeben.
export const PANTRY_LOCATIONS = ["Kühlschrank", "Gefrierschrank", "Keller", "Küche", "Sonstiges"];

// Ab wie vielen Tagen vor Ablauf der Mindesthaltbarkeit ein Vorrats-Artikel
// als "läuft bald ab" markiert wird.
export const EXPIRY_WARNING_DAYS = 3;

export const PANTRY_LOCATION_STYLE = {
  "Kühlschrank": "tag-8",
  "Gefrierschrank": "tag-5",
  "Keller": "tag-6",
  "Küche": "tag-2",
  "Sonstiges": "tag-7",
};

// Warengruppen für die Einkaufsliste, in Zuordnungsreihenfolge (2.3).
// Die Muster greifen als Teilstring, damit deutsche Zusammensetzungen
// ("Hähnchenbrust", "Blumenkohl", "Haselnuss") mit abgedeckt sind. Deshalb
// sind bewusst NICHT enthalten: "olive" (steckt in "Olivenöl", das in die
// Öle gehört) und "ente" (steckt in "Studentenfutter").
export const SHOPPING_GROUPS = [
  {
    key: "fleisch-fisch",
    label: "Fleisch & Fisch",
    style: "tag-2",
    namePatterns: [
      "hähnchen", "hühner", "pute", "rind", "schwein", "lamm", "hack", "gulasch", "steak", "schnitzel", "filet",
      "wurst", "würst", "schinken", "speck", "salami", "bacon", "chorizo",
      "lachs", "thunfisch", "forelle", "kabeljau", "hering", "sardine", "sardelle", "garnele", "krabbe", "muschel",
      "fleisch", "fisch",
    ],
  },
  {
    key: "milchprodukte",
    label: "Milchprodukte",
    style: "tag-1",
    namePatterns: [
      "milch", "käse", "feta", "mozzarella", "parmesan", "gouda", "camembert", "halloumi", "mascarpone", "ricotta",
      "joghurt", "skyr", "kefir", "sahne", "schmand", "crème fraîche", "creme fraiche", "butter", "quark", "ei", "eier",
    ],
  },
  {
    key: "gemuese-obst",
    label: "Gemüse & Obst",
    style: "tag-3",
    namePatterns: [
      "zwiebel", "knoblauch", "lauch", "porree", "karotte", "möhre", "paprika", "tomate", "salat", "rucola", "gurke",
      "kürbis", "zucchini", "aubergine", "kohl", "brokkoli", "spinat", "sellerie", "fenchel", "spargel", "radieschen",
      "pastinake", "rote bete", "kartoffel", "pilz", "champignon", "mais", "ingwer",
      "petersilie", "schnittlauch", "minze", "koriander", "dill", "kräuter",
      "apfel", "äpfel", "birne", "banane", "zitrone", "limette", "orange", "traube", "beere", "pfirsich", "pflaume",
      "melone", "ananas", "kiwi", "mango", "avocado",
    ],
    unitPatterns: ["Zehe", "Bund"],
  },
  {
    key: "gewuerze-oele",
    label: "Gewürze & Öle",
    style: "tag-6",
    namePatterns: [
      "salz", "pfeffer", "öl", "essig", "balsamico", "zucker", "honig", "senf", "sojasauce", "sojasoße", "brühe",
      "gewürz", "oregano", "basilikum", "thymian", "rosmarin", "lorbeer", "zimt", "vanille", "muskat", "kümmel",
      "curry", "chili", "paprikapulver", "kurkuma", "safran", "kardamom",
    ],
    unitPatterns: ["EL", "TL", "Prise"],
  },
  {
    key: "trockenware",
    label: "Trockenware",
    style: "tag-4",
    namePatterns: [
      "pasta", "nudel", "spaghetti", "penne", "gnocchi", "reis", "couscous", "bulgur", "quinoa", "polenta", "grieß",
      "mehl", "stärke", "hefe", "backpulver", "semmelbrösel", "haferflocken", "müsli", "cornflakes",
      "linse", "bohne", "erbse", "kichererbse",
      "brot", "brötchen", "toast", "zwieback", "tortilla", "cracker", "chips",
      "nuss", "nüsse", "mandel", "cashew", "rosine", "kokos", "schokolade", "kakao",
    ],
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

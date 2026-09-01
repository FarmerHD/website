# Meine Rezepte

Private Rezeptverwaltung mit Wochenplanung, automatisch abgeleiteter
Einkaufsliste und einem Vorrats-Reiter für Kühlschrank, Gefrierschrank,
Keller und Küche. Läuft komplett im Browser, ohne eigenen Server —
gehostet über GitHub Pages, Daten liegen in Supabase.

## Funktionen

- **Rezepte** — anlegen, bearbeiten, löschen, durchsuchen, nach Kategorie
  filtern. Rezepttext von einer Kochseite einfügen und automatisch in
  Name/Portionen/Zeiten/Zutaten/Zubereitung zerlegen lassen (rein
  browserseitige Text-Heuristik, kein Server-/KI-Aufruf).
- **Wochenplan** — Rezepte auswählen, Portionen unabhängig von der
  Basis-Portionenzahl anpassen, daraus mit einem Klick die Einkaufsliste
  erstellen (Mengen werden im Verhältnis hochgerechnet).
- **Einkaufsliste** — automatische Zuordnung zu Warengruppen (Fleisch &
  Fisch, Milchprodukte, Gemüse & Obst, Gewürze & Öle, Trockenware,
  Konserven, Extras), gleiche Artikel werden zusammengeführt (inkl.
  g/kg- und ml/l-Umrechnung), manuelles Hinzufügen, Fortschrittsanzeige,
  Drucken.
- **Vorrat** — was gerade zu Hause ist, nach Lagerort (Kühlschrank,
  Gefrierschrank, Keller, Küche, Sonstiges) gruppiert.
- **Login** — Passwort, Login-Link per E-Mail, Passwort-Reset-Flow.
- **Offline** — als PWA installierbar, App-Grundgerüst und letzter
  Datenstand werden lokal gecacht, Änderungen ohne Verbindung landen in
  einer Warteschlange und werden automatisch synchronisiert, sobald
  wieder Internet da ist.

## Technik

- **Preact + [htm](https://github.com/developit/htm)** für die UI-Komponenten
  (JSX-ähnliche Syntax über Template-Literals, kein Build-Schritt nötig).
- **[Supabase](https://supabase.com)** als Backend — Postgres mit
  Row-Level-Security, Auth und Storage, direkt aus dem Browser
  angesprochen.
- **Service Worker** (`sw.js`) cacht das App-Grundgerüst für Offline-Start.
- Preact, htm und der Supabase-JS-Client liegen lokal unter `js/vendor/`
  (kein CDN zur Laufzeit — siehe `js/vendor/README.md`).
- Reines statisches Hosting, kein eigener Server, kein Build-Schritt.

## Projektstruktur

```
index.html              App-Shell
css/styles.css          Design-System (Design-Tokens, alle Komponenten)
manifest.json           PWA-Manifest
sw.js                   Service Worker (App-Shell-Cache)
js/
  config.js             Supabase-Client
  auth.js                Login/Passwort-Reset
  app.js                 Root-Komponente, Navigation, Datenladen
  lib/
    preact.js            Preact/htm-Bindung (zeigt auf js/vendor/)
    constants.js          Kategorien, Einheiten, Lagerorte, Warengruppen
    parser.js             Rezepttext-Import-Parser
    categorize.js         Warengruppen-Zuordnung, Zusammenführungs-Logik
    offline.js             Lokaler Cache + Offline-Warteschlange
    icons.js               SVG-Icons
  views/
    recipes.js             Rezepte
    plan.js                 Wochenplan
    shopping.js             Einkaufsliste
    pantry.js               Vorrat
  vendor/                  Lokal eingebundene Third-Party-Bibliotheken
impressum.html / datenschutz.html   Rechtliche Pflichtseiten
```

## Datenmodell (Supabase)

Vier Tabellen, jede Zeile gehört per `user_id` genau einer Person, Zugriff
ausschließlich über Row-Level-Security (`auth.uid() = user_id` für
select/insert/update/delete):

- `recipes` — Rezepte (Name, Kategorie, Portionen, Zeiten, Zutaten als
  JSONB-Array, Schritte, Fotolink)
- `plan_items` — Wochenplan-Auswahl je Rezept (`recipe_id` als
  Primärschlüssel, `on delete cascade` auf `recipes`)
- `shopping_items` — Einkaufslisten-Artikel
- `pantry_items` — Vorrat, zusätzlich mit `location`

Ein Rezeptfoto-Bucket (`recipe-photos`) im Supabase Storage rundet das
Ganze ab.

## Lokal entwickeln

Kein Build-Schritt nötig — ein beliebiger statischer Webserver reicht:

```bash
python3 -m http.server 8080
```

Dann `http://localhost:8080` öffnen. Für Supabase-Zugriff sind die
Zugangsdaten in `js/config.js` hinterlegt (öffentlicher „publishable"-Key,
Sicherheit läuft über RLS, nicht über Geheimhaltung des Keys).

## Deployment

Push auf `main` löst automatisch `.github/workflows/static.yml` aus, das
den kompletten Repo-Inhalt zu GitHub Pages deployt.

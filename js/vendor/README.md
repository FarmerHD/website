Lokal eingebundene Third-Party-Bibliotheken (unverändert bis auf einen
gepatchten Import-Pfad in hooks.module.js), damit die App ohne externes
CDN auskommt — läuft dadurch zuverlässiger offline und lädt keine
App-Grundgerüst-Dateien von Drittservern nach:

- preact.module.js  — Preact 10.19.6 (MIT, siehe LICENSE.preact)
- hooks.module.js   — @preact/hooks 10.19.6 (MIT, siehe LICENSE.preact)
- htm.module.js     — htm 3.1.1 (Apache-2.0, siehe LICENSE.htm)
- supabase.min.js   — @supabase/supabase-js 2.112.4, UMD-Build, mit
  terser nachminifiziert (MIT, siehe LICENSE.supabase-js)

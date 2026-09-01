// Offline-Unterstützung (2.5): letzter Datenstand wird lokal
// zwischengespeichert, Änderungen ohne Verbindung landen in einer
// Warteschlange und werden automatisch synchronisiert, sobald wieder
// Internet da ist. Framework-unabhängig (reines Pub/Sub), damit sowohl
// die App-Logik als auch die UI-Komponenten es nutzen können.

const CACHE_PREFIX = "mr_cache_";
const QUEUE_KEY = "mr_queue";

const listeners = new Set();
let state = {
  online: navigator.onLine,
  syncing: false,
  pending: loadQueue().length,
};

function notify() {
  for (const cb of listeners) cb(state);
}

function setState(patch) {
  state = { ...state, ...patch };
  notify();
}

export function subscribe(cb) {
  listeners.add(cb);
  cb(state);
  return () => listeners.delete(cb);
}

export function getStatus() {
  return state;
}

export function getCache(key) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setCache(key, data) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(data));
  } catch {
    // Speicher voll o.ä. — Cache ist ein reines Komfort-Feature, kein Fehler wert.
  }
}

function loadQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveQueue(queue) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  setState({ pending: queue.length });
}

let seq = 0;
export function queueMutation(table, type, payload, match) {
  const queue = loadQueue();
  queue.push({ id: `${Date.now()}_${seq++}`, table, type, payload: payload ?? null, match: match ?? null });
  saveQueue(queue);
}

let supabaseRef = null;
let flushing = false;

async function applyMutation(m) {
  const client = supabaseRef;
  if (m.type === "insert") {
    const { error } = await client.from(m.table).insert(m.payload);
    if (error) throw error;
  } else if (m.type === "update") {
    let q = client.from(m.table).update(m.payload);
    for (const [k, v] of Object.entries(m.match)) q = q.eq(k, v);
    const { error } = await q;
    if (error) throw error;
  } else if (m.type === "upsert") {
    const { error } = await client.from(m.table).upsert(m.payload);
    if (error) throw error;
  } else if (m.type === "delete") {
    let q = client.from(m.table).delete();
    for (const [k, v] of Object.entries(m.match)) q = q.eq(k, v);
    const { error } = await q;
    if (error) throw error;
  }
}

function isNetworkError(err) {
  const msg = (err && (err.message || err.toString())) || "";
  return /fetch|network|failed to fetch/i.test(msg) || !navigator.onLine;
}

export async function flushQueue() {
  if (flushing || !supabaseRef || !navigator.onLine) return;
  const queue = loadQueue();
  if (queue.length === 0) return;
  flushing = true;
  setState({ syncing: true });
  let remaining = [...queue];
  while (remaining.length > 0) {
    const m = remaining[0];
    try {
      await applyMutation(m);
      remaining = remaining.slice(1);
      saveQueue(remaining);
    } catch (err) {
      if (isNetworkError(err)) {
        break; // weiterhin offline — Rest bleibt in der Warteschlange
      }
      // Nicht-Netzwerkfehler (z.B. Zeile existiert nicht mehr): überspringen,
      // damit die Warteschlange nicht dauerhaft blockiert.
      console.warn("Sync übersprungen:", m, err);
      remaining = remaining.slice(1);
      saveQueue(remaining);
    }
  }
  flushing = false;
  setState({ syncing: false });
}

// Schreibt direkt, wenn online; sammelt sonst (oder bei Netzwerkfehler)
// in der Warteschlange und wendet die Änderung sofort optimistisch auf
// die übergebenen lokalen Daten an, damit die UI ohne Wartezeit reagiert.
export async function write(table, type, payload, match) {
  if (navigator.onLine && supabaseRef) {
    try {
      await applyMutation({ table, type, payload, match });
      return { queued: false, error: null };
    } catch (err) {
      if (!isNetworkError(err)) return { queued: false, error: err };
      queueMutation(table, type, payload, match);
      return { queued: true, error: null };
    }
  }
  queueMutation(table, type, payload, match);
  return { queued: true, error: null };
}

export function newId() {
  return crypto.randomUUID();
}

export function initSync(client) {
  supabaseRef = client;
  window.addEventListener("online", () => {
    setState({ online: true });
    flushQueue();
  });
  window.addEventListener("offline", () => setState({ online: false }));
  if (navigator.onLine) flushQueue();
  setInterval(() => {
    if (navigator.onLine) flushQueue();
  }, 20000);
}

import { html, render, useState, useEffect, useCallback } from "./lib/preact.js";
import { supabaseClient as sb } from "./config.js";
import { useAuth, AuthScreen, SetNewPasswordScreen } from "./auth.js";
import { getCache, setCache, subscribe as subscribeSync, initSync } from "./lib/offline.js";
import { RecipesView } from "./views/recipes.js";
import { PlanView } from "./views/plan.js";
import { ShoppingView } from "./views/shopping.js";
import { IconBook, IconCalendar, IconCart, IconLeaf, IconLogOut, IconWifiOff, IconCloud, IconCheck, IconX } from "./lib/icons.js";

initSync(sb);

const TABS = [
  { key: "recipes", label: "Rezepte", icon: IconBook },
  { key: "plan", label: "Wochenplan", icon: IconCalendar },
  { key: "shopping", label: "Einkaufsliste", icon: IconCart },
];

function useSyncStatus() {
  const [status, setStatus] = useState(() => ({ online: navigator.onLine, syncing: false, pending: 0 }));
  useEffect(() => subscribeSync(setStatus), []);
  return status;
}

function SyncPill({ status }) {
  if (status.online && !status.syncing && status.pending === 0) return null;
  if (!status.online) return html`<span class="sync-pill offline"><span class="dot"></span><${IconWifiOff} strokeWidth="2.2" style="width:14px;height:14px" /> Offline</span>`;
  if (status.syncing) return html`<span class="sync-pill syncing"><span class="dot"></span>Wird synchronisiert …</span>`;
  return html`<span class="sync-pill"><span class="dot"></span>${status.pending} in Warteschlange</span>`;
}

function useToasts() {
  const [toasts, setToasts] = useState([]);
  const show = useCallback((text, type = "info") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  }, []);
  return [toasts, show];
}

function App() {
  const { session, loading, recoveryMode, setRecoveryMode } = useAuth();
  const [tab, setTab] = useState("recipes");
  const [recipes, setRecipes] = useState(() => getCache("recipes") || []);
  const [planItems, setPlanItems] = useState(() => getCache("plan") || []);
  const [shoppingItems, setShoppingItems] = useState(() => getCache("shopping") || []);
  const status = useSyncStatus();
  const [toasts, showToast] = useToasts();

  const userId = session && session.user ? session.user.id : null;

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    async function loadAll() {
      const [r, p, s] = await Promise.all([
        sb.from("recipes").select("*").order("created_at", { ascending: false }),
        sb.from("plan_items").select("*"),
        sb.from("shopping_items").select("*").order("created_at", { ascending: true }),
      ]);
      if (cancelled) return;
      if (!r.error && r.data) { setRecipes(r.data); setCache("recipes", r.data); }
      if (!p.error && p.data) { setPlanItems(p.data); setCache("plan", p.data); }
      if (!s.error && s.data) { setShoppingItems(s.data); setCache("shopping", s.data); }
    }
    loadAll();
    return () => { cancelled = true; };
  }, [session]);

  useEffect(() => { setCache("recipes", recipes); }, [recipes]);
  useEffect(() => { setCache("plan", planItems); }, [planItems]);
  useEffect(() => { setCache("shopping", shoppingItems); }, [shoppingItems]);

  if (loading) return html`<div class="spinner-page"><div class="spinner"></div></div>`;
  if (recoveryMode) return html`<${SetNewPasswordScreen} onDone=${() => setRecoveryMode(false)} />`;
  if (!session) return html`<${AuthScreen} />`;

  function removeRecipe(id) {
    setRecipes((rs) => rs.filter((r) => r.id !== id));
    setPlanItems((ps) => ps.filter((p) => p.recipe_id !== id));
  }

  const viewProps = {
    recipes, planItems, shoppingItems, userId, showToast,
    onCreate: (r) => setRecipes((rs) => [r, ...rs]),
    onUpdate: (r) => setRecipes((rs) => rs.map((x) => (x.id === r.id ? { ...x, ...r } : x))),
    onDelete: removeRecipe,
    onPlanChange: setPlanItems,
    onShoppingChange: setShoppingItems,
    goToShopping: () => setTab("shopping"),
  };

  return html`
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark"><${IconLeaf} /></div>
          <span class="brand-name">Meine Rezepte</span>
        </div>
        <nav class="sidebar-nav">
          ${TABS.map((t) => html`
            <button key=${t.key} class="sidebar-link ${tab === t.key ? "active" : ""}" onClick=${() => setTab(t.key)}>
              <${t.icon} strokeWidth="2" /> ${t.label}
            </button>
          `)}
        </nav>
        <div class="sidebar-foot">
          <${SyncPill} status=${status} />
          <button class="btn btn-ghost" style="justify-content:flex-start" onClick=${() => sb.auth.signOut()}>
            <${IconLogOut} strokeWidth="2" /> Abmelden
          </button>
          <div style="display:flex;gap:10px;font-size:12px;padding:2px 14px;color:var(--ink-faint)">
            <a href="impressum.html">Impressum</a>
            <a href="datenschutz.html">Datenschutz</a>
          </div>
        </div>
      </aside>

      <div class="main-col">
        <header class="topbar">
          <span class="topbar-title font-display">Meine Rezepte</span>
          <span class="topbar-spacer"></span>
          <${SyncPill} status=${status} />
          <button class="btn btn-icon btn-ghost" onClick=${() => sb.auth.signOut()} aria-label="Abmelden"><${IconLogOut} strokeWidth="2" /></button>
        </header>

        <main class="view-container">
          ${tab === "recipes" && html`<${RecipesView} ...${viewProps} />`}
          ${tab === "plan" && html`<${PlanView} ...${viewProps} />`}
          ${tab === "shopping" && html`<${ShoppingView} ...${viewProps} />`}
          <footer class="site-footer" style="display:block">
            <a href="impressum.html">Impressum</a><span style="color:var(--border-strong)">|</span><a href="datenschutz.html">Datenschutz</a>
          </footer>
        </main>

        <nav class="tabbar">
          ${TABS.map((t) => html`
            <button key=${t.key} class="tabbar-item ${tab === t.key ? "active" : ""}" onClick=${() => setTab(t.key)}>
              <${t.icon} strokeWidth="2" /> ${t.label}
            </button>
          `)}
        </nav>
      </div>

      <div class="toast-stack">
        ${toasts.map((t) => html`
          <div class="toast ${t.type}" key=${t.id}>
            ${t.type === "success" && html`<${IconCheck} strokeWidth="2.4" />`}
            ${t.type === "error" && html`<${IconX} strokeWidth="2.4" />`}
            ${t.type !== "success" && t.type !== "error" && html`<${IconCloud} strokeWidth="2.2" />`}
            <span>${t.text}</span>
          </div>
        `)}
      </div>
    </div>
  `;
}

render(html`<${App} />`, document.getElementById("root"));

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

import { html, useState, useEffect } from "./lib/preact.js";
import { supabaseClient as sb } from "./config.js";
import { IconMail, IconLock, IconLeaf, IconArrowLeft } from "./lib/icons.js";

export function useAuth() {
  const [session, setSession] = useState(undefined); // undefined = lädt noch
  const [recoveryMode, setRecoveryMode] = useState(false);

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = sb.auth.onAuthStateChange((event, s) => {
      if (event === "PASSWORD_RECOVERY") setRecoveryMode(true);
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, loading: session === undefined, recoveryMode, setRecoveryMode };
}

const MODE_PASSWORD = "password";
const MODE_MAGIC = "magic";
const MODE_FORGOT = "forgot";

export function AuthScreen() {
  const [mode, setMode] = useState(MODE_PASSWORD);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // {type, text}

  async function submitPassword(e) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const { error } = await sb.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setMsg({ type: "error", text: "Anmeldung fehlgeschlagen: " + error.message });
  }

  async function submitMagic(e) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin + window.location.pathname } });
    setBusy(false);
    if (error) setMsg({ type: "error", text: "Konnte Link nicht senden: " + error.message });
    else setMsg({ type: "success", text: "Login-Link wurde an " + email + " gesendet. Bitte E-Mails prüfen." });
  }

  async function submitForgot(e) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + window.location.pathname });
    setBusy(false);
    if (error) setMsg({ type: "error", text: "Konnte E-Mail nicht senden: " + error.message });
    else setMsg({ type: "success", text: "Falls ein Konto zu dieser Adresse existiert, wurde ein Link zum Zurücksetzen gesendet." });
  }

  return html`
    <div class="auth-wrap">
      <div class="auth-card">
        <div class="auth-logo">
          <div class="brand-mark"><${IconLeaf} /></div>
          <h1 class="font-display">Meine Rezepte</h1>
          <p>Private Rezeptverwaltung, Wochenplan & Einkaufsliste</p>
        </div>

        ${mode !== MODE_FORGOT && html`
          <div class="auth-tabs">
            <button class=${mode === MODE_PASSWORD ? "active" : ""} onClick=${() => { setMode(MODE_PASSWORD); setMsg(null); }}>Passwort</button>
            <button class=${mode === MODE_MAGIC ? "active" : ""} onClick=${() => { setMode(MODE_MAGIC); setMsg(null); }}>Login-Link</button>
          </div>
        `}

        ${msg && html`<div class="auth-msg ${msg.type}">${msg.text}</div>`}

        ${mode === MODE_FORGOT && html`
          <button class="btn-link" style="margin-bottom:14px;display:inline-flex;align-items:center;gap:5px" onClick=${() => { setMode(MODE_PASSWORD); setMsg(null); }}>
            <${IconArrowLeft} strokeWidth="2.4" style="width:15px;height:15px" /> Zurück zum Login
          </button>
          <form onSubmit=${submitForgot}>
            <div class="field">
              <label>E-Mail-Adresse</label>
              <input class="input" type="email" required value=${email} onInput=${(e) => setEmail(e.target.value)} placeholder="du@beispiel.de" />
            </div>
            <button class="btn btn-primary btn-block" type="submit" disabled=${busy}>Link zum Zurücksetzen senden</button>
          </form>
        `}

        ${mode === MODE_PASSWORD && html`
          <form onSubmit=${submitPassword}>
            <div class="field">
              <label>E-Mail-Adresse</label>
              <input class="input" type="email" required value=${email} onInput=${(e) => setEmail(e.target.value)} placeholder="du@beispiel.de" />
            </div>
            <div class="field">
              <label>Passwort</label>
              <input class="input" type="password" required value=${password} onInput=${(e) => setPassword(e.target.value)} placeholder="••••••••" />
            </div>
            <button class="btn btn-primary btn-block" type="submit" disabled=${busy}>Anmelden</button>
            <div class="auth-foot">
              <button type="button" class="btn-link" onClick=${() => { setMode(MODE_FORGOT); setMsg(null); }}>Passwort vergessen?</button>
            </div>
          </form>
        `}

        ${mode === MODE_MAGIC && html`
          <form onSubmit=${submitMagic}>
            <div class="field">
              <label>E-Mail-Adresse</label>
              <input class="input" type="email" required value=${email} onInput=${(e) => setEmail(e.target.value)} placeholder="du@beispiel.de" />
            </div>
            <button class="btn btn-primary btn-block" type="submit" disabled=${busy}><${IconMail} strokeWidth="2.2" /> Login-Link senden</button>
          </form>
        `}
      </div>
    </div>
  `;
}

export function SetNewPasswordScreen({ onDone }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function submit(e) {
    e.preventDefault();
    if (password.length < 8) { setMsg({ type: "error", text: "Das Passwort muss mindestens 8 Zeichen lang sein." }); return; }
    if (password !== confirm) { setMsg({ type: "error", text: "Die Passwörter stimmen nicht überein." }); return; }
    setBusy(true); setMsg(null);
    const { error } = await sb.auth.updateUser({ password });
    setBusy(false);
    if (error) { setMsg({ type: "error", text: error.message }); return; }
    await sb.auth.signOut();
    onDone();
  }

  return html`
    <div class="auth-wrap">
      <div class="auth-card">
        <div class="auth-logo">
          <div class="brand-mark"><${IconLock} /></div>
          <h1 class="font-display">Neues Passwort</h1>
          <p>Bitte lege ein neues Passwort für dein Konto fest.</p>
        </div>
        ${msg && html`<div class="auth-msg ${msg.type}">${msg.text}</div>`}
        <form onSubmit=${submit}>
          <div class="field">
            <label>Neues Passwort</label>
            <input class="input" type="password" required value=${password} onInput=${(e) => setPassword(e.target.value)} placeholder="mind. 8 Zeichen" />
          </div>
          <div class="field">
            <label>Passwort bestätigen</label>
            <input class="input" type="password" required value=${confirm} onInput=${(e) => setConfirm(e.target.value)} placeholder="••••••••" />
          </div>
          <button class="btn btn-primary btn-block" type="submit" disabled=${busy}>Passwort speichern</button>
        </form>
      </div>
    </div>
  `;
}

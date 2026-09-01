// Supabase-Zugangsdaten (öffentlicher "publishable"-Schlüssel, siehe
// Datenspezifikation Abschnitt 3 — Zugriff wird über Row-Level-Security
// pro Nutzer eingeschränkt, nicht über die Geheimhaltung dieses Keys).
export const supabaseClient = supabase.createClient(
  "https://pzkmjqaxyaxsfjyqfzyb.supabase.co",
  "sb_publishable_a1pWjnZrcl1aeH-sYQxigA_E5_asZOv"
);
window.supabaseClient = supabaseClient;

import { html } from "./preact.js";

// Jede Icon-Definition liefert eine Funktion, die bei jedem Aufruf frische
// Preact-Vnodes erzeugt (ein Icon kann an mehreren Stellen gleichzeitig
// gerendert werden, z.B. Sidebar + Tabbar — geteilte Vnode-Objekte würden
// sich dabei gegenseitig die DOM-Referenz streitig machen).
const wrap = (pathsFn) => (props = {}) => html`
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${props.strokeWidth || 2}"
       stroke-linecap="round" stroke-linejoin="round" ...${props}>${pathsFn()}</svg>
`;

export const IconLeaf = wrap(() => html`<path d="M12 22c6-2 9-7 9-13 0-2-1-4-2-5-4 1-8 3-11 8-2 4-1 8 4 10Z"/><path d="M8 17 20 5"/>`);
export const IconBook = wrap(() => html`<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/>`);
export const IconCalendar = wrap(() => html`<rect x="3" y="4.5" width="18" height="16" rx="2.5"/><path d="M8 2.5v4M16 2.5v4M3 9.5h18"/>`);
export const IconCart = wrap(() => html`<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2.5 3h2.2l2.2 12.1a2 2 0 0 0 2 1.6h8.5a2 2 0 0 0 2-1.6L21 7H6"/>`);
export const IconSearch = wrap(() => html`<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>`);
export const IconPlus = wrap(() => html`<path d="M12 5v14M5 12h14"/>`);
export const IconX = wrap(() => html`<path d="M18 6 6 18M6 6l12 12"/>`);
export const IconEdit = wrap(() => html`<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>`);
export const IconTrash = wrap(() => html`<path d="M3 6h18"/><path d="M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6"/><path d="M19 6l-1 14.5A1.5 1.5 0 0 1 16.5 22h-9A1.5 1.5 0 0 1 6 20.5L5 6"/><path d="M10 11v6M14 11v6"/>`);
export const IconClock = wrap(() => html`<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>`);
export const IconUsers = wrap(() => html`<circle cx="9" cy="8" r="3.2"/><path d="M2.5 20c0-3.6 3-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.3a3.2 3.2 0 0 1 0 6.2"/><path d="M18.5 14.2c2.4.6 4 2.7 4 5.8"/>`);
export const IconCamera = wrap(() => html`<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.2l1-1.8A1.5 1.5 0 0 1 10 4.5h4a1.5 1.5 0 0 1 1.3.8L16.3 7h2.2A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5Z"/><circle cx="12" cy="13" r="3.3"/>`);
export const IconPrint = wrap(() => html`<path d="M6 9V3.5A.5.5 0 0 1 6.5 3h11a.5.5 0 0 1 .5.5V9"/><rect x="3" y="9" width="18" height="8" rx="1.5"/><path d="M6 14h12v7.5H6Z"/>`);
export const IconCheck = wrap(() => html`<path d="M20 6 9 17l-5-5"/>`);
export const IconChevronDown = wrap(() => html`<path d="m6 9 6 6 6-6"/>`);
export const IconLogOut = wrap(() => html`<path d="M9 21H5.5A1.5 1.5 0 0 1 4 19.5v-15A1.5 1.5 0 0 1 5.5 3H9"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>`);
export const IconMail = wrap(() => html`<rect x="2.5" y="4.5" width="19" height="15" rx="2"/><path d="m3 6 9 6.5L21 6"/>`);
export const IconLock = wrap(() => html`<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>`);
export const IconWifiOff = wrap(() => html`<path d="M2 8.5a17 17 0 0 1 5-3"/><path d="M22 8.5a17 17 0 0 0-8-4"/><path d="M6.5 12.5a10 10 0 0 1 4-2"/><path d="M12 16.5a5 5 0 0 1 3 1"/><path d="M9.5 16.2a5 5 0 0 1 2.5-.7"/><path d="M2 2l20 20"/><circle cx="12" cy="20" r="1"/>`);
export const IconCloud = wrap(() => html`<path d="M7 18a4.5 4.5 0 0 1-.5-9c.4-2.6 2.7-4.5 5.4-4.5 2.5 0 4.6 1.6 5.3 3.9A4 4 0 0 1 17 18H7Z"/>`);
export const IconArrowLeft = wrap(() => html`<path d="M19 12H5"/><path d="m11 18-6-6 6-6"/>`);
export const IconSparkle = wrap(() => html`<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/>`);
export const IconImage = wrap(() => html`<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="1.7"/><path d="m21 16.5-5-4.5-9 7.5"/>`);
export const IconBox = wrap(() => html`<path d="M3.5 8 12 3.5 20.5 8v8L12 20.5 3.5 16Z"/><path d="M3.5 8 12 12.5 20.5 8"/><path d="M12 12.5v8"/>`);

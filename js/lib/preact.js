// Zentrale Preact/htm-Bindung, damit alle App-Module dieselbe Instanz
// verwenden (keine doppelten Hook-Kontexte) und nur an einer Stelle auf
// das CDN verweisen.
import { h, render, Fragment, createContext } from "../vendor/preact.module.js";
import { useState, useEffect, useRef, useMemo, useCallback, useContext } from "../vendor/hooks.module.js";
import htmModule from "../vendor/htm.module.js";

export const html = htmModule.bind(h);
export { h, render, Fragment, createContext, useState, useEffect, useRef, useMemo, useCallback, useContext };

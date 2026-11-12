import { useSyncExternalStore } from 'react';
import { applyOp, emptyData } from './logic';
import type { AppData, Op } from './types';

export interface Config {
  url: string;
  code: string;
}

export type SyncStatus = 'local' | 'ok' | 'syncing' | 'offline' | 'error';

export interface Snapshot {
  data: AppData;
  status: SyncStatus;
  error: string;
  pending: number;
  lastSync: number;
  config: Config | null;
}

const K_CONFIG = 'rc.config';
const K_SERVER = 'rc.server';
const K_OUTBOX = 'rc.outbox';
const POLL_MS = 20_000;
const RETRY_MS = 10_000;
const TIMEOUT_MS = 30_000;

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* stockage indisponible (navigation privée) : l'appli marche quand même */
  }
}

export const ERRORS: Record<string, string> = {
  code: 'Code refusé par le Sheet. Vérifie le code dans Réglages.',
  'code-non-defini': "Le code n'a pas été changé dans le script du Sheet (CHANGE-MOI).",
};

/** Envoie des modifications au script du Sheet et récupère l'état complet. */
export async function callScript(config: Config, ops: Op[]): Promise<AppData> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    // text/plain : requête « simple », sans pré-vérification CORS (Apps Script ne la gère pas)
    const res = await fetch(config.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ code: config.code, ops }),
      redirect: 'follow',
      signal: ctrl.signal,
    });
    if (!res.ok) throw new ScriptError(`Réponse ${res.status} du script`);
    let json: { ok: boolean; error?: string; state?: AppData };
    try {
      json = await res.json();
    } catch {
      throw new ScriptError("L'adresse ne répond pas comme le script (vérifie l'URL et l'accès « Tout le monde »).");
    }
    if (!json.ok || !json.state) throw new ScriptError(ERRORS[json.error ?? ''] ?? json.error ?? 'Erreur du script');
    return json.state;
  } finally {
    clearTimeout(timer);
  }
}

/** Erreur renvoyée par le script lui-même (réessayer ne sert à rien), par opposition à une coupure réseau. */
export class ScriptError extends Error {}

let config: Config | null = load<Config | null>(K_CONFIG, null);
let server: AppData = { ...emptyData(), ...load<Partial<AppData>>(K_SERVER, {}) };
let outbox: Op[] = load<Op[]>(K_OUTBOX, []);
let status: SyncStatus = config ? 'syncing' : 'local';
let error = '';
let lastSync = 0;
let busy = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let snapshot: Snapshot = compute();
const listeners = new Set<() => void>();

function compute(): Snapshot {
  return { data: outbox.reduce(applyOp, server), status, error, pending: outbox.length, lastSync, config };
}

function emit() {
  snapshot = compute();
  listeners.forEach((l) => l());
}

function schedule(ms: number) {
  clearTimeout(timer);
  timer = setTimeout(() => void sync(), ms);
}

/** Envoie la file d'attente (ou relit simplement le Sheet si elle est vide). */
export async function sync(): Promise<void> {
  if (!config || busy) return;
  if (document.visibilityState === 'hidden' && !outbox.length) return;
  busy = true;
  clearTimeout(timer);
  const used = config;
  const batch = outbox.slice();
  if (batch.length || status !== 'ok') {
    status = 'syncing';
    emit();
  }
  try {
    const state = await callScript(used, batch);
    if (config !== used) return;
    server = { ...emptyData(), ...state };
    outbox = outbox.slice(batch.length);
    save(K_SERVER, server);
    save(K_OUTBOX, outbox);
    status = 'ok';
    error = '';
    lastSync = Date.now();
    schedule(outbox.length ? 0 : POLL_MS);
  } catch (e) {
    if (config !== used) return;
    if (e instanceof ScriptError) {
      status = 'error';
      error = e.message;
      schedule(POLL_MS * 3);
    } else {
      status = 'offline';
      error = '';
      schedule(RETRY_MS);
    }
  } finally {
    busy = false;
    emit();
  }
}

export function dispatch(op: Op) {
  if (!config) {
    server = applyOp(server, op);
    save(K_SERVER, server);
  } else {
    outbox = [...outbox, op];
    save(K_OUTBOX, outbox);
    schedule(500); // regroupe les appuis rapprochés (boutons + / −)
  }
  emit();
}

export function setConfig(next: Config | null, state?: AppData) {
  config = next;
  save(K_CONFIG, next);
  outbox = [];
  save(K_OUTBOX, outbox);
  if (state) {
    server = { ...emptyData(), ...state };
    save(K_SERVER, server);
  }
  status = next ? 'ok' : 'local';
  error = '';
  lastSync = next ? Date.now() : 0;
  emit();
  if (next) schedule(POLL_MS);
}

export function useStore(): Snapshot {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => snapshot,
  );
}

/** Lien à ouvrir sur l'autre téléphone pour le relier au même Sheet. */
export function configLink(c: Config): string {
  const payload = btoa(unescape(encodeURIComponent(JSON.stringify(c))));
  return `${location.origin}${location.pathname}#c=${encodeURIComponent(payload)}`;
}

export function readConfigLink(hash: string): Config | null {
  const m = /[#&]c=([^&]+)/.exec(hash);
  if (!m) return null;
  try {
    const c = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(m[1]))))) as Config;
    return typeof c.url === 'string' && typeof c.code === 'string' ? c : null;
  } catch {
    return null;
  }
}

export function startSync() {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void sync();
  });
  window.addEventListener('online', () => void sync());
  window.addEventListener('focus', () => void sync());
  void sync();
}

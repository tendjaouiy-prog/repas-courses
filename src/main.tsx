import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { startSync } from './lib/store';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

startSync();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }));
}

/**
 * Sur iPhone, l'appli de l'écran d'accueil reprend souvent là où elle était sans se recharger.
 * À chaque ouverture, on regarde si une nouvelle version est publiée et on recharge si oui
 * (les modifications en attente sont gardées dans le téléphone, rien n'est perdu).
 */
async function checkForUpdate() {
  if (!import.meta.env.PROD || !navigator.onLine) return;
  try {
    const res = await fetch(`./?maj=${Date.now()}`, { cache: 'no-store' });
    const latest = (await res.text()).match(/assets\/index-[\w-]+\.js/)?.[0];
    const current = document.querySelector<HTMLScriptElement>('script[type="module"][src*="assets/index-"]')?.src ?? '';
    if (!latest || current.includes(latest)) return;
    // une seule tentative par version, pour ne jamais recharger en boucle
    if (sessionStorage.getItem('rc.maj') === latest) return;
    sessionStorage.setItem('rc.maj', latest);
    (await navigator.serviceWorker?.getRegistration())?.update().catch(() => {});
    location.reload();
  } catch {
    /* hors ligne ou stockage indisponible : on garde la version actuelle */
  }
}

void checkForUpdate();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void checkForUpdate();
});

import { useEffect, useMemo, useState } from 'react';
import { buildShoppingList } from './lib/logic';
import { readConfigLink, sync, useStore, type Snapshot } from './lib/store';
import Planning from './screens/Planning';
import Recettes from './screens/Recettes';
import Courses from './screens/Courses';
import Reglages from './screens/Reglages';

type Tab = 'planning' | 'recettes' | 'courses' | 'reglages';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'planning', label: 'Planning', icon: '📅' },
  { id: 'recettes', label: 'Recettes', icon: '🍲' },
  { id: 'courses', label: 'Courses', icon: '🛒' },
  { id: 'reglages', label: 'Réglages', icon: '⚙️' },
];

function SyncBadge({ s, onClick }: { s: Snapshot; onClick: () => void }) {
  const label =
    s.status === 'local'
      ? 'Non relié au Sheet'
      : s.status === 'error'
        ? 'Erreur'
        : s.status === 'offline'
          ? s.pending
            ? `Hors ligne · ${s.pending} en attente`
            : 'Hors ligne'
          : s.status === 'syncing' || s.pending
            ? 'Envoi…'
            : 'À jour';
  return (
    <button className={`sync sync-${s.pending && s.status === 'ok' ? 'syncing' : s.status}`} onClick={onClick}>
      <i />
      {label}
    </button>
  );
}

export default function App() {
  const s = useStore();
  const [tab, setTab] = useState<Tab>(() => (readConfigLink(location.hash) ? 'reglages' : 'planning'));
  const [editRecipe, setEditRecipe] = useState<string | null>(null);
  const left = useMemo(() => buildShoppingList(s.data).items.filter((i) => i.state === '').length, [s.data]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [tab]);

  return (
    <div className="app">
      <header className="top">
        <h1>{TABS.find((t) => t.id === tab)!.label}</h1>
        <SyncBadge s={s} onClick={() => (s.status === 'local' || s.status === 'error' ? setTab('reglages') : void sync())} />
      </header>
      <main>
        {tab === 'planning' && (
          <Planning
            data={s.data}
            onNewRecipe={() => {
              setEditRecipe('');
              setTab('recettes');
            }}
          />
        )}
        {tab === 'recettes' && <Recettes data={s.data} editing={editRecipe} setEditing={setEditRecipe} />}
        {tab === 'courses' && <Courses data={s.data} onPlan={() => setTab('planning')} />}
        {tab === 'reglages' && <Reglages s={s} />}
      </main>
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={t.id === tab ? 'on' : ''} onClick={() => setTab(t.id)} aria-current={t.id === tab}>
            <span className="tab-icon">
              {t.icon}
              {t.id === 'courses' && left > 0 && <b>{left}</b>}
            </span>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

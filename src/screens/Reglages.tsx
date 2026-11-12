import { useMemo, useState } from 'react';
import script from '../../apps-script/Code.gs?raw';
import { dispatch, callScript, configLink, readConfigLink, setConfig, sync, type Config, type Snapshot } from '../lib/store';
import { copy, share } from '../lib/share';
import { knownRayons, qtyLabel } from '../lib/logic';
import { ArticleForm } from './Courses';

const randomCode = () => Array.from(crypto.getRandomValues(new Uint8Array(9)), (b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');

// localhost : faux script de tools/mock-server.ts, pour les essais
const isScriptUrl = (u: string) => /^(https:\/\/script\.google\.com\/.+|http:\/\/localhost:\d+)\/exec$/.test(u.trim());

function Connect({ initial, fromLink }: { initial: Config; fromLink: boolean }) {
  const [code, setCode] = useState(initial.code);
  const [url, setUrl] = useState(initial.url);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const cleanCode = code.trim().replace(/['\\\s]/g, '');

  const connect = async () => {
    setBusy(true);
    setError('');
    const config = { url: url.trim(), code: cleanCode };
    try {
      setConfig(config, await callScript(config, []));
      history.replaceState(null, '', location.pathname);
    } catch (e) {
      setError(e instanceof Error && e.name !== 'TypeError' && e.name !== 'AbortError' ? e.message : "Impossible de joindre le script. Vérifie l'adresse et la connexion. Le plus souvent, l'accès du déploiement n'est pas « Tout le monde » : Déployer → Gérer les déploiements → crayon → Qui a accès : Tout le monde, Version : Nouvelle version.");
    } finally {
      setBusy(false);
    }
  };

  const button = (
    <>
      {error && <p className="error">{error}</p>}
      <button className="btn primary wide" disabled={busy || !cleanCode || !isScriptUrl(url)} onClick={connect}>
        {busy ? 'Connexion…' : 'Relier au Sheet'}
      </button>
    </>
  );

  if (fromLink)
    return (
      <section className="card pad">
        <h3>Relier ce téléphone</h3>
        <p>Le lien reçu contient l'adresse et le code du Sheet « Repas course ».</p>
        {button}
      </section>
    );

  return (
    <section className="card pad">
      <h3>Relier au Google Sheet</h3>
      <p>À faire une seule fois, depuis un ordinateur de préférence. L'autre téléphone se relie ensuite avec un simple lien.</p>
      <ol className="steps">
        <li>
          <strong>Choisis un code</strong> (il protège l'accès au Sheet).
          <input className="input" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Code" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
        </li>
        <li>
          <strong>Copie le script</strong>, le code y est déjà inscrit.
          <button
            className="btn ghost"
            disabled={!cleanCode}
            onClick={async () => {
              setCopied(await copy(script.replace("var CODE = 'CHANGE-MOI';", `var CODE = '${cleanCode}';`)));
              setTimeout(() => setCopied(false), 2500);
            }}
          >
            {copied ? 'Script copié ✓' : 'Copier le script'}
          </button>
        </li>
        <li>
          Dans le Sheet « Repas course » : <strong>Extensions → Apps Script</strong>. Remplace tout le contenu par le script copié, puis enregistre.
        </li>
        <li>
          <strong>Déployer → Nouveau déploiement</strong>, type « Application Web ». Exécuter en tant que : <strong>Moi</strong>. Qui a accès : <strong>Tout le monde</strong> (pas « Tous les utilisateurs disposant d'un compte Google »). Autorise quand Google le demande.
        </li>
        <li>
          <strong>Colle ici l'URL de l'application Web</strong> (elle finit par /exec).
          <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/…/exec" aria-label="URL du script" inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
          {url.trim() !== '' && !isScriptUrl(url) && <em className="error">L'adresse doit commencer par https://script.google.com/ et finir par /exec.</em>}
        </li>
      </ol>
      {button}
      <p className="hint">Tant que l'appli n'est pas reliée, ce que tu saisis reste sur ce téléphone et sera remplacé par le contenu du Sheet.</p>
    </section>
  );
}

export default function Reglages({ s }: { s: Snapshot }) {
  const linked = useMemo(() => readConfigLink(location.hash), []);
  const initial = useMemo<Config>(() => linked ?? { url: '', code: randomCode() }, [linked]);
  const [msg, setMsg] = useState('');
  const [stock, setStock] = useState('');
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const exclus = [...s.data.exclus].sort((a, b) => a.localeCompare(b, 'fr'));
  const rayons = useMemo(() => knownRayons(s.data), [s.data]);
  const moveRayon = (i: number, dir: -1 | 1) => {
    const next = [...rayons];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    dispatch({ type: 'setRayons', rayons: next });
  };

  const addStock = () => {
    if (!stock.trim()) return;
    dispatch({ type: 'setExclu', name: stock, on: true });
    setStock('');
  };

  return (
    <>
      {!s.config || (linked && linked.url !== s.config.url) ? (
        <Connect initial={initial} fromLink={!!linked} />
      ) : (
        <section className="card pad">
          <h3>Google Sheet</h3>
          <p className={`state state-${s.status}`}>
            {s.status === 'error'
              ? s.error
              : s.status === 'offline'
                ? `Hors ligne. ${s.pending ? `${s.pending} modification${s.pending > 1 ? 's' : ''} en attente, envoyée${s.pending > 1 ? 's' : ''} dès que le réseau revient.` : 'Nouvel essai automatique.'}`
                : `Relié${s.lastSync ? `, à jour à ${new Date(s.lastSync).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : ''}.`}
          </p>
          <div className="actions">
            <button className="btn ghost" onClick={() => void sync()}>
              Actualiser
            </button>
            <button
              className="btn primary"
              onClick={async () => {
                setMsg((await share('Repas & courses', configLink(s.config!))) || '');
                setTimeout(() => setMsg(''), 2500);
              }}
            >
              {msg || "Relier l'autre téléphone"}
            </button>
          </div>
          <p className="hint">Envoie le lien à l'autre téléphone (message, WhatsApp) : en l'ouvrant, il se relie au même Sheet. Ne le partage avec personne d'autre.</p>
          {confirmUnlink ? (
            <div className="actions">
              <button className="btn ghost" onClick={() => setConfirmUnlink(false)}>
                Annuler
              </button>
              <button className="btn danger" onClick={() => (setConfig(null), setConfirmUnlink(false))}>
                Délier ce téléphone
              </button>
            </div>
          ) : (
            <button className="link" onClick={() => setConfirmUnlink(true)}>
              Délier ce téléphone
            </button>
          )}
        </section>
      )}

      <section className="card pad">
        <h3>Articles habituels</h3>
        <p>Proposés à chaque nouvelle liste de courses : tu coches ceux à ajouter (lait, pain, yaourts…).</p>
        <div className="list bordered">
          {s.data.habituels.map((h) => (
            <div className="item muted" key={h.name + '|' + h.unit}>
              <div className="item-main">
                <span>
                  {h.name} <span className="qty">{qtyLabel(h.qty, h.unit)}</span>
                </span>
                {h.rayon && <small className="sub">{h.rayon}</small>}
              </div>
              <button className="icon-btn" onClick={() => dispatch({ type: 'removeHabitual', name: h.name, unit: h.unit })} aria-label={`Retirer ${h.name}`}>
                ✕
              </button>
            </div>
          ))}
        </div>
        <ArticleForm data={s.data} label="Ajouter" onAdd={(item) => dispatch({ type: 'setHabitual', item })} />
      </section>

      <section className="card pad">
        <h3>Ordre des rayons</h3>
        <p>Range les rayons dans l'ordre de ton parcours au magasin : la liste de courses suit cet ordre.</p>
        {rayons.length ? (
          <div className="list bordered">
            {rayons.map((r, i) => (
              <div className="item muted" key={r}>
                <div className="item-main">
                  <span>{r}</span>
                </div>
                <button className="icon-btn" disabled={i === 0} onClick={() => moveRayon(i, -1)} aria-label={`Monter ${r}`}>
                  ↑
                </button>
                <button className="icon-btn" disabled={i === rayons.length - 1} onClick={() => moveRayon(i, 1)} aria-label={`Descendre ${r}`}>
                  ↓
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="hint">Les rayons apparaîtront ici dès qu'une recette ou un article en aura un.</p>
        )}
      </section>

      <section className="card pad">
        <h3>Toujours en stock</h3>
        <p>Ces ingrédients ne sont jamais ajoutés à la liste de courses (sel, huile…).</p>
        <div className="bar">
          <input className="input" value={stock} placeholder="Ajouter un ingrédient" onChange={(e) => setStock(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addStock()} />
          <button className="btn ghost" onClick={addStock} disabled={!stock.trim()}>
            Ajouter
          </button>
        </div>
        <div className="chips">
          {exclus.map((e) => (
            <button className="chip" key={e} onClick={() => dispatch({ type: 'setExclu', name: e, on: false })} aria-label={`Retirer ${e}`}>
              {e} ✕
            </button>
          ))}
        </div>
      </section>

      <section className="card pad">
        <h3>Installer l'appli</h3>
        <p>
          <strong>iPhone</strong> : ouvre cette page dans Safari, bouton Partager, puis « Sur l'écran d'accueil ».
        </p>
        <p>
          <strong>Samsung</strong> : ouvre cette page dans Chrome, menu ⋮, puis « Ajouter à l'écran d'accueil ».
        </p>
      </section>
    </>
  );
}

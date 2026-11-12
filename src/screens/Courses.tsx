import { useMemo, useState } from 'react';
import { addDays, rangeLabel, today } from '../lib/dates';
import { LIST_DAYS, buildShoppingList, findIngredient, groupByRayon, itemKey, knownValues, parseQty, qtyLabel, shoppingText } from '../lib/logic';
import { share } from '../lib/share';
import { dispatch } from '../lib/store';
import type { AppData, Article, ItemState, ShoppingItem } from '../lib/types';
import { Empty, Sheet } from '../ui';

const setState = (i: ShoppingItem, state: ItemState) => dispatch({ type: 'setState', name: i.name, unit: i.unit, state, qty: state === 'achete' ? i.need : 0 });

function Sources({ i }: { i: ShoppingItem }) {
  const parts = [...i.sources, ...(i.extra ? ['ajout'] : [])];
  return parts.length ? <small className="sub">{parts.join(' · ')}</small> : null;
}

/** Saisie d'un article (ajout à la liste ou habituel), avec unité et rayon préremplis si connus. */
export function ArticleForm({ data, onAdd, label }: { data: AppData; onAdd: (a: Article) => void; label: string }) {
  const [draft, setDraft] = useState({ name: '', qty: '', unit: '', rayon: '' });
  const rayons = useMemo(() => knownValues(data, 'rayon'), [data]);
  const units = useMemo(() => knownValues(data, 'unit'), [data]);
  const names = useMemo(() => knownValues(data, 'name'), [data]);
  const id = label.replace(/\W/g, '');
  const submit = () => {
    if (!draft.name.trim()) return;
    onAdd({ name: draft.name, qty: parseQty(draft.qty), unit: draft.unit, rayon: draft.rayon });
    setDraft({ name: '', qty: '', unit: '', rayon: '' });
  };
  const prefill = () => {
    const k = findIngredient(data, draft.name);
    if (k) setDraft((d) => ({ ...d, unit: d.unit || k.unit, rayon: d.rayon || k.rayon }));
  };
  return (
    <div className="ing add">
      <input className="input ing-name" list={`${id}-n`} placeholder="Article (ex. Lait)" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} onBlur={prefill} onKeyDown={(e) => e.key === 'Enter' && submit()} aria-label="Article" />
      <button className="btn primary" onClick={submit} disabled={!draft.name.trim()}>
        {label}
      </button>
      <input className="input" inputMode="decimal" placeholder="Qté" value={draft.qty} onChange={(e) => setDraft({ ...draft, qty: e.target.value })} aria-label="Quantité" />
      <input className="input" list={`${id}-u`} placeholder="Unité" value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} aria-label="Unité" />
      <input className="input" list={`${id}-r`} placeholder="Rayon" value={draft.rayon} onChange={(e) => setDraft({ ...draft, rayon: e.target.value })} aria-label="Rayon" />
      <datalist id={`${id}-n`}>{names.map((v) => <option key={v} value={v} />)}</datalist>
      <datalist id={`${id}-u`}>{units.map((v) => <option key={v} value={v} />)}</datalist>
      <datalist id={`${id}-r`}>{rayons.map((v) => <option key={v} value={v} />)}</datalist>
    </div>
  );
}

function NewList({ data, onClose }: { data: AppData; onClose: () => void }) {
  const t = today();
  const [start, setStart] = useState(addDays(t, 1));
  const [end, setEnd] = useState(addDays(t, LIST_DAYS));
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const valid = !!start && !!end && end >= start;
  const meals = useMemo(() => (valid ? buildShoppingList({ ...data, list: { start, end }, extras: [] }).meals : 0), [data, start, end, valid]);
  const toggle = (k: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  return (
    <Sheet title="Nouvelle liste de courses" onClose={onClose} full>
      <div className="dates">
        <label className="field">
          <span>Repas du</span>
          <input
            className="input"
            type="date"
            value={start}
            onChange={(e) => {
              setStart(e.target.value);
              if (e.target.value && (!end || end < e.target.value)) setEnd(addDays(e.target.value, LIST_DAYS - 1));
            }}
          />
        </label>
        <label className="field">
          <span>au</span>
          <input className="input" type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
        </label>
      </div>
      <p className="hint">{valid ? `${meals} repas planifié${meals > 1 ? 's' : ''} ${rangeLabel(start, end)}` : 'La date de fin doit suivre la date de début.'}</p>

      <div className="field">
        <span>Habituels à ajouter</span>
        {data.habituels.length ? (
          <div className="card list">
            {data.habituels.map((h) => {
              const k = itemKey(h.name, h.unit);
              return (
                <label className="check-row" key={k}>
                  <input type="checkbox" checked={picked.has(k)} onChange={() => toggle(k)} />
                  <span>
                    {h.name} <span className="qty">{qtyLabel(h.qty, h.unit)}</span>
                  </span>
                </label>
              );
            })}
          </div>
        ) : (
          <p className="hint">Aucun article habituel : ils se créent dans Réglages.</p>
        )}
      </div>

      {data.list.start && <p className="hint">Les coches, « déjà dispo » et ajouts de la liste actuelle sont effacés.</p>}
      <div className="actions sticky">
        <button
          className="btn primary grow"
          disabled={!valid}
          onClick={() => {
            dispatch({ type: 'newList', start, end, extras: data.habituels.filter((h) => picked.has(itemKey(h.name, h.unit))) });
            onClose();
          }}
        >
          Créer la liste
        </button>
      </div>
    </Sheet>
  );
}

export default function Courses({ data, onPlan }: { data: AppData; onPlan: () => void }) {
  const { items, exclus, meals } = useMemo(() => buildShoppingList(data), [data]);
  const [menu, setMenu] = useState<ShoppingItem | null>(null);
  const [adding, setAdding] = useState(false);
  const [creating, setCreating] = useState(false);
  const [shared, setShared] = useState('');
  const todo = items.filter((i) => i.status === 'todo');
  const dispo = items.filter((i) => i.status === 'dispo');
  const done = items.filter((i) => i.status === 'done');
  const habitual = (i: ShoppingItem) => data.habituels.some((h) => itemKey(h.name, h.unit) === i.key);

  const doShare = async () => {
    setShared(await share('Liste de courses', shoppingText(items)));
    setTimeout(() => setShared(''), 2500);
  };

  if (!data.list.start)
    return (
      <>
        <Empty title="Pas encore de liste de courses">Le jour des grosses courses, crée la liste : elle reprend les repas planifiés sur les jours que tu choisis.</Empty>
        <button className="btn primary wide" onClick={() => setCreating(true)}>
          Nouvelle liste
        </button>
        {creating && <NewList data={data} onClose={() => setCreating(false)} />}
      </>
    );

  return (
    <>
      <div className="summary card">
        <div className="summary-head">
          <div>
            <small className="sub">
              Liste {rangeLabel(data.list.start, data.list.end)} · {meals} repas
            </small>
            <strong>{todo.length}</strong> à acheter
            <small className="sub">
              {done.length} dans le caddie · {dispo.length} déjà dispo
            </small>
          </div>
        </div>
        <div className="progress" aria-hidden>
          <i style={{ width: `${items.length ? ((items.length - todo.length) / items.length) * 100 : 0}%` }} />
        </div>
        <div className="actions">
          <button className="btn ghost" onClick={() => setAdding((a) => !a)}>
            + Article
          </button>
          <button className="btn ghost" onClick={doShare} disabled={!todo.length}>
            {shared || 'Partager'}
          </button>
          <button className="btn ghost" onClick={() => setCreating(true)}>
            Nouvelle liste
          </button>
        </div>
        {adding && <ArticleForm data={data} label="Ajouter" onAdd={(extra) => dispatch({ type: 'setExtra', extra })} />}
      </div>

      {!items.length && (
        <Empty title="La liste est vide">
          Aucun repas planifié sur cette période.{' '}
          <button className="link" onClick={onPlan}>
            Ouvrir le planning
          </button>
        </Empty>
      )}
      {items.length > 0 && !todo.length && <Empty title="Tout est pris 🎉">Pour la petite course, rouvre cette liste : ce qui reste à acheter réapparaîtra ici.</Empty>}

      {groupByRayon(todo).map(([rayon, list]) => (
        <section key={rayon}>
          <h3 className="rayon">{rayon}</h3>
          <div className="card list">
            {list.map((i) => (
              <div className="item" key={i.key}>
                <button className="check" onClick={() => setState(i, 'achete')} aria-label={`Cocher ${i.name}`} />
                <button className="item-main" onClick={() => setState(i, 'achete')}>
                  <span>
                    {i.name} <span className="qty">{i.bought ? '+ ' : ''}{qtyLabel(i.toBuy, i.unit)}</span>
                  </span>
                  {i.bought ? <small className="sub warn">complément · {qtyLabel(i.bought, i.unit)} déjà pris</small> : <Sources i={i} />}
                </button>
                <button className="chip" onClick={() => setState(i, 'dispo')} aria-label={`${i.name} déjà dispo`}>
                  Déjà dispo
                </button>
                <button className="icon-btn" onClick={() => setMenu(i)} aria-label={`Plus d'actions pour ${i.name}`}>
                  ⋯
                </button>
              </div>
            ))}
          </div>
        </section>
      ))}

      {dispo.length > 0 && (
        <section>
          <h3 className="rayon">Déjà dispo à la maison ({dispo.length})</h3>
          <div className="card list">
            {dispo.map((i) => (
              <div className="item muted" key={i.key}>
                <span className="home" aria-hidden>
                  🏠
                </span>
                <div className="item-main">
                  <span>
                    {i.name} <span className="qty">{qtyLabel(i.need, i.unit)}</span>
                  </span>
                </div>
                <button className="chip" onClick={() => setState(i, '')} aria-label={`Remettre ${i.name} dans la liste`}>
                  À acheter
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {done.length > 0 && (
        <section>
          <h3 className="rayon">Dans le caddie ({done.length})</h3>
          <div className="card list">
            {done.map((i) => (
              <div className="item done" key={i.key}>
                <button className="check on" onClick={() => setState(i, '')} aria-label={`Décocher ${i.name}`}>
                  ✓
                </button>
                <button className="item-main" onClick={() => setState(i, '')}>
                  <span>
                    {i.name} <span className="qty">{qtyLabel(i.need, i.unit)}</span>
                  </span>
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {exclus.length > 0 && (
        <details className="stock">
          <summary>Toujours en stock, non listés ({exclus.length})</summary>
          <div className="card list">
            {exclus.map((i) => (
              <div className="item muted" key={i.key}>
                <div className="item-main">
                  <span>
                    {i.name} <span className="qty">{qtyLabel(i.need, i.unit)}</span>
                  </span>
                </div>
                <button className="chip" onClick={() => dispatch({ type: 'setExclu', name: i.name, on: false })}>
                  Remettre dans la liste
                </button>
              </div>
            ))}
          </div>
        </details>
      )}

      {menu && (
        <Sheet title={menu.name} onClose={() => setMenu(null)}>
          <div className="list">
            <button className="row-btn" onClick={() => (setState(menu, 'dispo'), setMenu(null))}>
              <span>
                Déjà dispo
                <small className="sub">Sort de la liste jusqu'à la prochaine liste</small>
              </span>
            </button>
            {menu.sources.length > 0 && (
              <button className="row-btn" onClick={() => (dispatch({ type: 'setExclu', name: menu.name, on: true }), setMenu(null))}>
                <span>
                  Toujours en stock
                  <small className="sub">Ne plus jamais le proposer (modifiable dans Réglages)</small>
                </span>
              </button>
            )}
            {menu.extra && (
              <button className="row-btn" onClick={() => (dispatch({ type: 'removeExtra', name: menu.name, unit: menu.unit }), setMenu(null))}>
                <span>
                  Retirer l'ajout
                  {menu.sources.length > 0 && <small className="sub">La part venant des recettes reste dans la liste</small>}
                </span>
              </button>
            )}
            {menu.extra && !menu.sources.length && !habitual(menu) && (
              <button
                className="row-btn"
                onClick={() => {
                  const x = data.extras.find((e) => itemKey(e.name, e.unit) === menu.key);
                  if (x) dispatch({ type: 'setHabitual', item: x });
                  setMenu(null);
                }}
              >
                <span>
                  Ajouter aux habituels
                  <small className="sub">Pour le cocher en un geste à la prochaine liste</small>
                </span>
              </button>
            )}
          </div>
          {menu.sources.length > 0 && <p className="hint">Pour : {menu.sources.join(', ')}</p>}
        </Sheet>
      )}
      {creating && <NewList data={data} onClose={() => setCreating(false)} />}
    </>
  );
}

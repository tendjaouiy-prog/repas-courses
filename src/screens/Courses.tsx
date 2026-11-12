import { useMemo, useState } from 'react';
import { buildShoppingList, findIngredient, formatQty, groupByRayon, knownValues, parseQty, shoppingText } from '../lib/logic';
import { dispatch } from '../lib/store';
import type { AppData, ItemState, ShoppingItem } from '../lib/types';
import { Empty, Sheet } from '../ui';
import { share } from '../lib/share';

const setState = (i: ShoppingItem, state: ItemState) => dispatch({ type: 'setState', name: i.name, unit: i.unit, state });

function Qty({ i }: { i: ShoppingItem }) {
  const q = formatQty(i.qty);
  return q ? (
    <span className="qty">
      {q}
      {i.unit ? ` ${i.unit}` : ''}
    </span>
  ) : null;
}

function Sources({ i }: { i: ShoppingItem }) {
  const parts = [...i.sources, ...(i.extra ? ['ajout'] : [])];
  return parts.length ? <small className="sub">{parts.join(' · ')}</small> : null;
}

export default function Courses({ data, onPlan }: { data: AppData; onPlan: () => void }) {
  const { items, exclus } = useMemo(() => buildShoppingList(data), [data]);
  const [menu, setMenu] = useState<ShoppingItem | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: '', qty: '', unit: '', rayon: '' });
  const [shared, setShared] = useState('');
  const todo = items.filter((i) => i.state === '');
  const dispo = items.filter((i) => i.state === 'dispo');
  const done = items.filter((i) => i.state === 'achete');
  const rayons = useMemo(() => knownValues(data, 'rayon'), [data]);
  const units = useMemo(() => knownValues(data, 'unit'), [data]);
  const names = useMemo(() => knownValues(data, 'name'), [data]);

  const addExtra = () => {
    if (!draft.name.trim()) return;
    dispatch({ type: 'setExtra', extra: { name: draft.name, qty: parseQty(draft.qty), unit: draft.unit, rayon: draft.rayon } });
    setDraft({ name: '', qty: '', unit: '', rayon: '' });
  };
  const prefill = () => {
    const k = findIngredient(data, draft.name);
    if (k) setDraft((d) => ({ ...d, unit: d.unit || k.unit, rayon: d.rayon || k.rayon }));
  };
  const doShare = async () => {
    setShared(await share('Liste de courses', shoppingText(items)));
    setTimeout(() => setShared(''), 2500);
  };

  return (
    <>
      <div className="summary card">
        <div>
          <strong>{todo.length}</strong> à acheter
          <small className="sub">
            {done.length} dans le caddie · {dispo.length} déjà dispo
          </small>
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
        </div>
        {adding && (
          <div className="ing add">
            <input className="input ing-name" list="dl-c-names" placeholder="Article (ex. Essuie-tout)" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} onBlur={prefill} onKeyDown={(e) => e.key === 'Enter' && addExtra()} />
            <button className="btn primary" onClick={addExtra} disabled={!draft.name.trim()}>
              Ajouter
            </button>
            <input className="input" inputMode="decimal" placeholder="Qté" value={draft.qty} onChange={(e) => setDraft({ ...draft, qty: e.target.value })} aria-label="Quantité" />
            <input className="input" list="dl-c-units" placeholder="Unité" value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} aria-label="Unité" />
            <input className="input" list="dl-c-rayons" placeholder="Rayon" value={draft.rayon} onChange={(e) => setDraft({ ...draft, rayon: e.target.value })} aria-label="Rayon" />
            <datalist id="dl-c-names">{names.map((v) => <option key={v} value={v} />)}</datalist>
            <datalist id="dl-c-units">{units.map((v) => <option key={v} value={v} />)}</datalist>
            <datalist id="dl-c-rayons">{rayons.map((v) => <option key={v} value={v} />)}</datalist>
          </div>
        )}
      </div>

      {!items.length && (
        <Empty title="La liste est vide">
          Planifie des repas pour la remplir.{' '}
          <button className="link" onClick={onPlan}>
            Ouvrir le planning
          </button>
        </Empty>
      )}
      {items.length > 0 && !todo.length && <Empty title="Tout est pris 🎉" />}

      {groupByRayon(todo).map(([rayon, list]) => (
        <section key={rayon}>
          <h3 className="rayon">{rayon}</h3>
          <div className="card list">
            {list.map((i) => (
              <div className="item" key={i.key}>
                <button className="check" onClick={() => setState(i, 'achete')} aria-label={`Cocher ${i.name}`} />
                <button className="item-main" onClick={() => setState(i, 'achete')}>
                  <span>
                    {i.name} <Qty i={i} />
                  </span>
                  <Sources i={i} />
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
                    {i.name} <Qty i={i} />
                  </span>
                </div>
                <button className="chip" onClick={() => setState(i, '')} aria-label={`Remettre ${i.name} dans la liste`}>
                  À acheter
                </button>
                <button className="icon-btn" onClick={() => setMenu(i)} aria-label={`Plus d'actions pour ${i.name}`}>
                  ⋯
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {done.length > 0 && (
        <section>
          <div className="rayon-head">
            <h3 className="rayon">Dans le caddie ({done.length})</h3>
          </div>
          <div className="card list">
            {done.map((i) => (
              <div className="item done" key={i.key}>
                <button className="check on" onClick={() => setState(i, '')} aria-label={`Décocher ${i.name}`}>
                  ✓
                </button>
                <button className="item-main" onClick={() => setState(i, '')}>
                  <span>
                    {i.name} <Qty i={i} />
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
                    {i.name} <Qty i={i} />
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

      {(dispo.length > 0 || done.length > 0) && (
        <button className="btn ghost wide" onClick={() => dispatch({ type: 'clearStates' })}>
          Tout remettre à acheter
        </button>
      )}

      {menu && (
        <Sheet title={menu.name} onClose={() => setMenu(null)}>
          <div className="list">
            {menu.state !== 'dispo' && (
              <button className="row-btn" onClick={() => (setState(menu, 'dispo'), setMenu(null))}>
                <span>
                  Déjà dispo cette semaine
                  <small className="sub">Sort de la liste jusqu'à la prochaine semaine</small>
                </span>
              </button>
            )}
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
                  Retirer l'ajout manuel
                  {menu.sources.length > 0 && <small className="sub">La part venant des recettes reste dans la liste</small>}
                </span>
              </button>
            )}
          </div>
          {menu.sources.length > 0 && <p className="hint">Pour : {menu.sources.join(', ')}</p>}
        </Sheet>
      )}
    </>
  );
}

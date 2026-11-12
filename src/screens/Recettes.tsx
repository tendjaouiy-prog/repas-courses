import { useMemo, useState } from 'react';
import { findIngredient, formatQty, knownValues, norm, parseQty, portionsByRecipe } from '../lib/logic';
import { dispatch } from '../lib/store';
import type { AppData, Recipe } from '../lib/types';
import { Empty, Sheet } from '../ui';

const RAYONS = ['Fruits & légumes', 'Boucherie', 'Poissonnerie', 'Crèmerie', 'Épicerie', 'Épices', 'Boulangerie', 'Surgelés', 'Boissons', 'Maison'];
const UNITS = ['g', 'kg', 'ml', 'cl', 'L', 'pièce', 'c. à soupe', 'c. à café', 'pot', 'brique', 'boîte', 'sachet', 'tranche'];

interface Row {
  id: number;
  name: string;
  qty: string;
  unit: string;
  rayon: string;
}

let rowId = 0;
const blankRow = (): Row => ({ id: ++rowId, name: '', qty: '', unit: '', rayon: '' });

function Editor({ data, original, onClose }: { data: AppData; original: Recipe | null; onClose: () => void }) {
  const [name, setName] = useState(original?.name ?? '');
  const [notes, setNotes] = useState(original?.notes ?? '');
  const [base, setBase] = useState(1);
  const [rows, setRows] = useState<Row[]>(() =>
    original?.ingredients.length
      ? original.ingredients.map((i) => ({ id: ++rowId, name: i.name, qty: formatQty(i.qty), unit: i.unit, rayon: i.rayon }))
      : [blankRow()],
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const names = useMemo(() => knownValues(data, 'name'), [data]);
  const units = useMemo(() => [...new Set([...knownValues(data, 'unit'), ...UNITS])], [data]);
  const rayons = useMemo(() => [...new Set([...knownValues(data, 'rayon'), ...RAYONS])], [data]);

  const trimmed = name.trim();
  const duplicate = trimmed !== '' && norm(trimmed) !== norm(original?.name ?? '') && data.recipes.some((r) => norm(r.name) === norm(trimmed));
  const filled = rows.filter((r) => r.name.trim());
  const canSave = trimmed !== '' && !duplicate;

  const update = (id: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  /** Ingrédient déjà connu : on reprend son unité et son rayon. */
  const prefill = (row: Row) => {
    const k = findIngredient(data, row.name);
    if (k) update(row.id, { unit: row.unit || k.unit, rayon: row.rayon || k.rayon });
  };

  const saveRecipe = () => {
    dispatch({
      type: 'saveRecipe',
      oldName: original?.name ?? '',
      recipe: { name: trimmed, notes, ingredients: filled.map((r) => ({ name: r.name, qty: parseQty(r.qty) / base, unit: r.unit, rayon: r.rayon })) },
    });
    onClose();
  };

  return (
    <Sheet title={original ? 'Modifier la recette' : 'Nouvelle recette'} onClose={onClose} full>
      <label className="field">
        <span>Nom</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Gratin de courgettes" autoFocus={!original} />
        {duplicate && <em className="error">Une recette porte déjà ce nom.</em>}
      </label>

      <div className="field">
        <span>Ingrédients</span>
        <div className="base">
          Quantités saisies pour
          <select value={base} onChange={(e) => setBase(Number(e.target.value))} aria-label="Nombre de personnes des quantités saisies">
            {[1, 2, 3, 4, 5, 6, 8, 10, 12].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          personne{base > 1 ? 's' : ''}
        </div>
        {rows.map((r, idx) => (
          <div className="ing" key={r.id}>
            <input className="input ing-name" list="dl-names" value={r.name} placeholder={`Ingrédient ${idx + 1}`} onChange={(e) => update(r.id, { name: e.target.value })} onBlur={() => prefill(r)} />
            <button className="icon-btn" onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.id !== r.id) : [blankRow()]))} aria-label={`Retirer ${r.name || 'la ligne'}`}>
              ✕
            </button>
            <input className="input" inputMode="decimal" value={r.qty} placeholder="Qté" onChange={(e) => update(r.id, { qty: e.target.value })} aria-label="Quantité" />
            <input className="input" list="dl-units" value={r.unit} placeholder="Unité" onChange={(e) => update(r.id, { unit: e.target.value })} aria-label="Unité" />
            <input className="input" list="dl-rayons" value={r.rayon} placeholder="Rayon" onChange={(e) => update(r.id, { rayon: e.target.value })} aria-label="Rayon" />
          </div>
        ))}
        <button className="btn ghost" onClick={() => setRows((rs) => [...rs, blankRow()])}>
          + Ajouter un ingrédient
        </button>
        <datalist id="dl-names">{names.map((v) => <option key={v} value={v} />)}</datalist>
        <datalist id="dl-units">{units.map((v) => <option key={v} value={v} />)}</datalist>
        <datalist id="dl-rayons">{rayons.map((v) => <option key={v} value={v} />)}</datalist>
      </div>

      <label className="field">
        <span>Notes, étapes ou lien</span>
        <textarea className="input" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>

      <div className="actions sticky">
        {original && (
          <button className="btn danger-ghost" onClick={() => setConfirmDelete(true)}>
            Supprimer
          </button>
        )}
        <button className="btn primary grow" disabled={!canSave} onClick={saveRecipe}>
          Enregistrer
        </button>
      </div>

      {confirmDelete && original && (
        <Sheet title={`Supprimer « ${original.name} » ?`} onClose={() => setConfirmDelete(false)}>
          <p>La recette est retirée de la liste et du planning de la semaine.</p>
          <div className="actions">
            <button className="btn ghost" onClick={() => setConfirmDelete(false)}>
              Annuler
            </button>
            <button
              className="btn danger"
              onClick={() => {
                dispatch({ type: 'deleteRecipe', name: original.name });
                onClose();
              }}
            >
              Supprimer
            </button>
          </div>
        </Sheet>
      )}
    </Sheet>
  );
}

export default function Recettes({ data, editing, setEditing }: { data: AppData; editing: string | null; setEditing: (name: string | null) => void }) {
  const [query, setQuery] = useState('');
  const portions = useMemo(() => portionsByRecipe(data), [data]);
  const list = useMemo(
    () => data.recipes.filter((r) => norm(r.name).includes(norm(query)) || r.ingredients.some((i) => norm(i.name).includes(norm(query)))).sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    [data.recipes, query],
  );
  const original = editing ? (data.recipes.find((r) => norm(r.name) === norm(editing)) ?? null) : null;

  return (
    <>
      <div className="bar">
        <input className="input" type="search" placeholder="Chercher une recette ou un ingrédient" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button className="btn primary" onClick={() => setEditing('')}>
          + Recette
        </button>
      </div>
      <div className="card list">
        {list.map((r) => (
          <button className="row-btn" key={r.name} onClick={() => setEditing(r.name)}>
            <span>
              {r.name}
              <small className="sub">{r.ingredients.map((i) => i.name).join(', ') || 'Aucun ingrédient'}</small>
            </span>
            {portions.has(norm(r.name)) && <b className="pill">cette semaine</b>}
          </button>
        ))}
        {!list.length && <Empty title={data.recipes.length ? 'Aucune recette ne correspond' : 'Pas encore de recette'}>{data.recipes.length ? undefined : 'Ajoute la première avec « + Recette ».'}</Empty>}
      </div>
      {editing !== null && <Editor key={editing} data={data} original={original} onClose={() => setEditing(null)} />}
    </>
  );
}

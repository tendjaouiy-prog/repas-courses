import { useMemo, useState } from 'react';
import { addDays, dayMonth, dayShort, dayTitle, mondayOf, today, weekDates, weekLabel } from '../lib/dates';
import { DEFAULT_PERSONS, RESTES_DAYS, allTags, newId, norm, recipeUsage, restesCandidates, restesPersons } from '../lib/logic';
import { dispatch } from '../lib/store';
import type { AppData, Entry, Meal } from '../lib/types';
import { Empty, Sheet, Stepper } from '../ui';

const MEALS: { id: Meal; label: string; icon: string }[] = [
  { id: 'midi', label: 'Midi', icon: '☀️' },
  { id: 'soir', label: 'Soir', icon: '🌙' },
];
const QUICK_TEXTS = ['Resto', 'Chez des amis', 'Livraison', 'Sandwich'];
const mealLabel = (m: Meal) => (m === 'midi' ? 'midi' : 'soir');

type Mode = 'recette' | 'restes' | 'texte';

function weekTitle(monday: string, current: string): string {
  const diff = Math.round((Date.parse(monday) - Date.parse(current)) / (7 * 86_400_000));
  if (diff === 0) return 'Cette semaine';
  if (diff === 1) return 'Semaine prochaine';
  if (diff === -1) return 'Semaine dernière';
  return diff > 0 ? `Dans ${diff} semaines` : `Il y a ${-diff} semaines`;
}

function Picker({ data, date, meal, onClose, onNewRecipe }: { data: AppData; date: string; meal: Meal; onClose: () => void; onNewRecipe: () => void }) {
  const [mode, setMode] = useState<Mode>('recette');
  const [persons, setPersons] = useState(DEFAULT_PERSONS);
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [favOnly, setFavOnly] = useState(false);
  const [oldFirst, setOldFirst] = useState(false);
  const [text, setText] = useState('');
  const t = today();
  const usage = useMemo(() => recipeUsage(data.entries, t), [data.entries, t]);
  const tags = useMemo(() => allTags(data.recipes), [data.recipes]);
  const recipes = useMemo(() => {
    const q = norm(query);
    return data.recipes
      .filter((r) => (!q || norm(r.name).includes(q) || r.ingredients.some((i) => norm(i.name).includes(q))) && (!tag || r.tags.some((x) => norm(x) === norm(tag))) && (!favOnly || r.favorite))
      .sort((a, b) => {
        if (oldFirst) {
          const d = (usage.get(norm(a.name))?.last ?? '').localeCompare(usage.get(norm(b.name))?.last ?? '');
          if (d) return d;
        } else if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
        return a.name.localeCompare(b.name, 'fr');
      });
  }, [data.recipes, query, tag, favOnly, oldFirst, usage]);
  const candidates = useMemo(() => restesCandidates(data.entries, date, meal, addDays(date, -RESTES_DAYS)), [data.entries, date, meal]);

  const add = (kind: Entry['kind'], label: string, source = '') => {
    dispatch({ type: 'setEntry', entry: { id: newId(), date, meal, kind, label, persons: kind === 'texte' ? 0 : persons, source } });
    onClose();
  };
  const usageText = (name: string) => {
    const u = usage.get(norm(name));
    return u ? `${u.count} fois · dernière le ${dayMonth(u.last)}` : 'Jamais faite';
  };

  return (
    <Sheet title={`${dayTitle(date)} · ${mealLabel(meal)}`} onClose={onClose} full>
      <div className="segment" role="tablist">
        {(
          [
            ['recette', 'Recette'],
            ['restes', 'Restes'],
            ['texte', 'Autre'],
          ] as [Mode, string][]
        ).map(([m, l]) => (
          <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>
            {l}
          </button>
        ))}
      </div>

      {mode !== 'texte' && (
        <div className="persons-line">
          <span>{mode === 'restes' ? 'Restes pour' : 'Pour'}</span>
          <Stepper label="Nombre de personnes" value={persons} onChange={setPersons} />
        </div>
      )}

      {mode === 'recette' && (
        <>
          <input className="input" type="search" placeholder="Chercher une recette ou un ingrédient" value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="chips scroll">
            <button className={`chip${oldFirst ? ' on' : ''}`} onClick={() => setOldFirst((v) => !v)}>
              Pas faites depuis longtemps
            </button>
            <button className={`chip${favOnly ? ' on' : ''}`} onClick={() => setFavOnly((v) => !v)}>
              ⭐ Favoris
            </button>
            {tags.map((x) => (
              <button key={x} className={`chip${tag === x ? ' on' : ''}`} onClick={() => setTag(tag === x ? null : x)}>
                {x}
              </button>
            ))}
          </div>
          <div className="list">
            {recipes.map((r) => (
              <button key={r.name} className="row-btn" onClick={() => add('recette', r.name)}>
                <span>
                  {r.favorite && <span aria-label="favori">⭐ </span>}
                  {r.name}
                  <small className="sub">
                    {usageText(r.name)}
                    {r.tags.length > 0 && ` · ${r.tags.join(', ')}`}
                  </small>
                </span>
              </button>
            ))}
            {!recipes.length && <Empty title={data.recipes.length ? 'Aucune recette ne correspond' : 'Pas encore de recette'} />}
          </div>
          <button
            className="btn ghost"
            onClick={() => {
              onClose();
              onNewRecipe();
            }}
          >
            + Nouvelle recette
          </button>
        </>
      )}

      {mode === 'restes' && (
        <>
          <p className="hint">Le repas d'origine sera compté pour {persons} personne{persons > 1 ? 's' : ''} de plus dans les courses.</p>
          <div className="list">
            {candidates.map((e) => (
              <button key={e.id} className="row-btn" onClick={() => add('restes', e.label, e.id)}>
                <span>
                  {e.label}
                  <small className="sub">
                    cuisiné {dayShort(e.date)} {mealLabel(e.meal)} pour {e.persons}
                  </small>
                </span>
              </button>
            ))}
            {!candidates.length && <Empty title="Aucun repas cuisiné juste avant">Les restes se choisissent parmi les recettes planifiées les {RESTES_DAYS} jours précédents.</Empty>}
          </div>
        </>
      )}

      {mode === 'texte' && (
        <>
          <p className="hint">Pour un repas sans courses : il apparaît dans le planning et l'historique, sans rien ajouter à la liste.</p>
          <div className="chips">
            {QUICK_TEXTS.map((x) => (
              <button key={x} className="chip" onClick={() => add('texte', x)}>
                {x}
              </button>
            ))}
          </div>
          <div className="bar">
            <input className="input" placeholder="Autre (ex. Chez mamie)" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && text.trim() && add('texte', text)} />
            <button className="btn primary" disabled={!text.trim()} onClick={() => add('texte', text)}>
              Ajouter
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}

function CopyWeek({ data, monday, onClose }: { data: AppData; monday: string; onClose: () => void }) {
  const [done, setDone] = useState('');
  const weeks = useMemo(() => {
    const m = new Map<string, Entry[]>();
    for (const e of data.entries) {
      const w = mondayOf(e.date);
      if (w !== monday) m.set(w, [...(m.get(w) ?? []), e]);
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12);
  }, [data.entries, monday]);

  const copy = (from: string, rows: Entry[]) => {
    const shift = Math.round((Date.parse(monday) - Date.parse(from)) / 86_400_000);
    const taken = new Set(data.entries.map((e) => `${e.date}|${e.meal}`));
    const ids = new Map<string, string>();
    let n = 0;
    for (const e of rows) {
      const date = addDays(e.date, shift);
      if (taken.has(`${date}|${e.meal}`)) continue; // case déjà remplie avant la copie
      if (e.kind === 'restes' && !ids.has(e.source)) continue;
      const id = newId() + n;
      ids.set(e.id, id);
      dispatch({ type: 'setEntry', entry: { ...e, id, date, source: e.kind === 'restes' ? ids.get(e.source)! : '' } });
      n++;
    }
    setDone(`${from}|${n ? `${n} élément${n > 1 ? 's' : ''} recopié${n > 1 ? 's' : ''} ✓` : 'Aucune case libre'}`);
  };

  return (
    <Sheet title="Recopier une autre semaine" onClose={onClose} full>
      <p className="hint">Les repas sont recopiés dans les cases encore vides de la semaine {weekLabel(monday)}.</p>
      {!weeks.length && <Empty title="Aucune autre semaine planifiée" />}
      {weeks.map(([w, rows]) => (
        <section className="card pad" key={w}>
          <h3>Semaine {weekLabel(w)}</h3>
          <div className="hist">
            {weekDates(w)
              .filter((d) => rows.some((e) => e.date === d))
              .map((d) => (
                <div key={d}>
                  <b>{dayShort(d)}</b>
                  {rows
                    .filter((e) => e.date === d)
                    .map((e) => (
                      <span key={e.id}>
                        {e.meal === 'midi' ? '☀️' : '🌙'} {e.kind === 'restes' ? `Restes : ${e.label}` : e.label}
                      </span>
                    ))}
                </div>
              ))}
          </div>
          <button className="btn ghost" onClick={() => copy(w, rows)}>
            {done.startsWith(w + '|') ? done.split('|')[1] : 'Recopier ici'}
          </button>
        </section>
      ))}
    </Sheet>
  );
}

export default function Planning({ data, onNewRecipe }: { data: AppData; onNewRecipe: () => void }) {
  const t = today();
  const [monday, setMonday] = useState(() => mondayOf(t));
  const [pick, setPick] = useState<{ date: string; meal: Meal } | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const known = useMemo(() => new Set(data.recipes.map((r) => norm(r.name))), [data.recipes]);
  const extra = useMemo(() => restesPersons(data.entries), [data.entries]);
  const days = weekDates(monday);
  const { start, end } = data.list;
  const inList = (d: string) => !!start && d >= start && d <= end;
  const slot = (d: string, m: Meal) => data.entries.filter((e) => e.date === d && e.meal === m);
  const planned = data.entries.filter((e) => e.date >= monday && e.date <= days[6]).length;

  const setPersons = (e: Entry, persons: number) => dispatch({ type: 'setEntry', entry: { ...e, persons } });

  return (
    <>
      <div className="week-nav">
        <button className="icon-btn" onClick={() => setMonday(addDays(monday, -7))} aria-label="Semaine précédente">
          ‹
        </button>
        <div>
          <strong>{weekTitle(monday, mondayOf(t))}</strong>
          <small>{weekLabel(monday)}</small>
        </div>
        <button className="icon-btn" onClick={() => setMonday(addDays(monday, 7))} aria-label="Semaine suivante">
          ›
        </button>
      </div>
      {monday !== mondayOf(t) && (
        <button className="link center" onClick={() => setMonday(mondayOf(t))}>
          Revenir à cette semaine
        </button>
      )}

      {days.map((d) => (
        <section className={`card day${d < t ? ' past' : ''}${d === t ? ' today' : ''}`} key={d}>
          <h3>
            {dayTitle(d)}
            {d === t && <b className="pill">aujourd'hui</b>}
            {inList(d) && (
              <b className="pill soft" title="Compté dans la liste de courses en cours">
                🛒 dans la liste
              </b>
            )}
          </h3>
          {MEALS.map((m) => (
            <div className="meal" key={m.id}>
              <span className="meal-label" aria-hidden>
                {m.icon}
              </span>
              <div className="meal-items">
                {slot(d, m.id).map((e) => (
                  <div className={`entry entry-${e.kind}`} key={e.id}>
                    <div className="entry-name">
                      <span>{e.kind === 'restes' ? `♻️ Restes : ${e.label}` : e.kind === 'texte' ? `🍽️ ${e.label}` : e.label}</span>
                      {e.kind === 'recette' && !known.has(norm(e.label)) && <em>Recette introuvable</em>}
                      {e.kind === 'recette' && extra.get(e.id) ? <small>+{extra.get(e.id)} pour les restes</small> : null}
                    </div>
                    {e.kind !== 'texte' && <Stepper small label={`Personnes ${e.label}`} value={e.persons} onChange={(p) => setPersons(e, p)} />}
                    <button
                      className="icon-btn"
                      onClick={() => dispatch({ type: 'removeEntry', id: e.id })}
                      aria-label={`Retirer ${e.label}${extra.get(e.id) ? ' et ses restes' : ''}`}
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button className="add-entry" onClick={() => setPick({ date: d, meal: m.id })} aria-label={`Ajouter ${dayTitle(d)} ${m.label}`}>
                  {slot(d, m.id).length ? '+ Ajouter' : `+ ${m.label}`}
                </button>
              </div>
            </div>
          ))}
        </section>
      ))}

      <button className="btn ghost wide" onClick={() => setCopyOpen(true)}>
        Recopier une autre semaine
      </button>
      {!planned && <p className="hint center">Rien de planifié cette semaine.</p>}

      {pick && <Picker data={data} date={pick.date} meal={pick.meal} onClose={() => setPick(null)} onNewRecipe={onNewRecipe} />}
      {copyOpen && <CopyWeek data={data} monday={monday} onClose={() => setCopyOpen(false)} />}
    </>
  );
}

import { useMemo, useState } from 'react';
import { DAYS, historyWeeks, norm, recipeUsage, weekLabel, weekStamp } from '../lib/logic';
import { dispatch } from '../lib/store';
import type { AppData, HistoryRow, Meal } from '../lib/types';
import { Empty, Sheet, Stepper } from '../ui';

const MEALS: { id: Meal; label: string; icon: string }[] = [
  { id: 'midi', label: 'Midi', icon: '☀️' },
  { id: 'soir', label: 'Soir', icon: '🌙' },
];

export default function Planning({ data, onNewRecipe }: { data: AppData; onNewRecipe: () => void }) {
  const [pick, setPick] = useState<{ day: number; meal: Meal } | null>(null);
  const [query, setQuery] = useState('');
  const [confirmNew, setConfirmNew] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [oldFirst, setOldFirst] = useState(false);
  const [copied, setCopied] = useState('');
  const usage = useMemo(() => recipeUsage(data), [data]);
  const weeks = useMemo(() => historyWeeks(data), [data]);
  const planned = data.plan.reduce((n, d) => n + (d.midi.recipe ? 1 : 0) + (d.soir.recipe ? 1 : 0), 0);
  const known = useMemo(() => new Set(data.recipes.map((r) => norm(r.name))), [data.recipes]);
  const recipes = useMemo(
    () =>
      data.recipes
        .filter((r) => norm(r.name).includes(norm(query)))
        .sort((a, b) => {
          // « pas faites depuis longtemps » : jamais planifiées d'abord, puis les plus anciennes
          const byAge = oldFirst ? (usage.get(norm(a.name))?.last ?? '').localeCompare(usage.get(norm(b.name))?.last ?? '') : 0;
          return byAge || a.name.localeCompare(b.name, 'fr');
        }),
    [data.recipes, query, oldFirst, usage],
  );
  const usageText = (name: string) => {
    const u = usage.get(norm(name));
    return u ? `${u.count} fois · dernière : ${weekLabel(u.last).replace(/ \d{4}$/, '')}` : weeks.length ? 'Jamais planifiée' : '';
  };
  /** Remet les repas d'une semaine passée dans les cases encore libres du planning. */
  const reuse = (week: string, rows: HistoryRow[]) => {
    let n = 0;
    for (const h of rows) {
      const day = DAYS.indexOf(h.day);
      if (day < 0 || data.plan[day][h.meal].recipe || !known.has(norm(h.recipe))) continue;
      dispatch({ type: 'setPlan', day, meal: h.meal, recipe: h.recipe, persons: h.persons });
      n++;
    }
    setCopied(`${week}|${n ? `${n} repas repris ✓` : 'Aucune case libre'}`);
    setTimeout(() => setCopied(''), 2500);
  };

  const close = () => {
    setPick(null);
    setQuery('');
  };
  const choose = (recipe: string) => {
    if (pick) dispatch({ type: 'setPlan', day: pick.day, meal: pick.meal, recipe });
    close();
  };
  const current = pick ? data.plan[pick.day][pick.meal].recipe : '';

  return (
    <>
      <p className="lead">
        {planned ? `${planned} repas planifié${planned > 1 ? 's' : ''} cette semaine.` : 'Choisis une recette pour chaque repas : la liste de courses se construit toute seule.'}
      </p>
      {data.plan.map((d, day) => (
        <section className="card day" key={d.day}>
          <h3>{d.day}</h3>
          {MEALS.map((m) => {
            const slot = d[m.id];
            const missing = slot.recipe !== '' && !known.has(norm(slot.recipe));
            return (
              <div className="meal" key={m.id}>
                <span className="meal-label" aria-hidden>
                  {m.icon}
                </span>
                <button className={`meal-pick${slot.recipe ? '' : ' none'}`} onClick={() => setPick({ day, meal: m.id })} aria-label={`${d.day} ${m.label} : ${slot.recipe || 'choisir'}`}>
                  <small>{m.label}</small>
                  <span>{slot.recipe || 'Choisir une recette'}</span>
                  {missing && <em>Recette introuvable</em>}
                </button>
                <Stepper label={`Personnes ${d.day} ${m.label}`} value={slot.persons} onChange={(persons) => dispatch({ type: 'setPlan', day, meal: m.id, persons })} />
              </div>
            );
          })}
        </section>
      ))}
      <div className="actions two">
        <button className="btn ghost" onClick={() => setShowHistory(true)}>
          Historique
        </button>
        <button className="btn ghost" onClick={() => setConfirmNew(true)} disabled={!planned && !data.states.length && !data.extras.length}>
          Nouvelle semaine
        </button>
      </div>

      {pick && (
        <Sheet title={`${data.plan[pick.day].day} · ${pick.meal === 'midi' ? 'Midi' : 'Soir'}`} onClose={close}>
          {data.recipes.length > 6 && <input className="input" type="search" placeholder="Chercher une recette" value={query} onChange={(e) => setQuery(e.target.value)} />}
          {weeks.length > 0 && data.recipes.length > 1 && (
            <div className="chips">
              <button className={`chip${oldFirst ? '' : ' on'}`} onClick={() => setOldFirst(false)}>
                De A à Z
              </button>
              <button className={`chip${oldFirst ? ' on' : ''}`} onClick={() => setOldFirst(true)}>
                Pas faites depuis longtemps
              </button>
            </div>
          )}
          <div className="list">
            {recipes.map((r) => (
              <button key={r.name} className={`row-btn${norm(r.name) === norm(current) ? ' sel' : ''}`} onClick={() => choose(r.name)}>
                <span>
                  {r.name}
                  {usageText(r.name) && <small className="sub">{usageText(r.name)}</small>}
                </span>
                <small>{r.ingredients.length} ingr.</small>
              </button>
            ))}
            {!recipes.length && <Empty title={data.recipes.length ? 'Aucune recette ne correspond' : 'Pas encore de recette'} />}
          </div>
          <div className="actions">
            {current && (
              <button className="btn danger-ghost" onClick={() => choose('')}>
                Retirer du planning
              </button>
            )}
            <button
              className="btn ghost"
              onClick={() => {
                close();
                onNewRecipe();
              }}
            >
              + Nouvelle recette
            </button>
          </div>
        </Sheet>
      )}

      {showHistory && (
        <Sheet title="Historique des repas" onClose={() => setShowHistory(false)} full>
          {!weeks.length && <Empty title="Pas encore d'historique">Chaque « Nouvelle semaine » range ici les repas qui étaient planifiés.</Empty>}
          {weeks.map(({ week, rows }) => (
            <section className="card pad" key={week}>
              <h3>Semaine archivée le {weekLabel(week)}</h3>
              <div className="hist">
                {DAYS.filter((d) => rows.some((h) => h.day === d)).map((d) => (
                  <div key={d}>
                    <b>{d}</b>
                    {rows
                      .filter((h) => h.day === d)
                      .map((h) => (
                        <span key={h.meal}>
                          {h.meal === 'midi' ? '☀️' : '🌙'} {h.recipe} <small>· {h.persons} pers.</small>
                        </span>
                      ))}
                  </div>
                ))}
              </div>
              <button className="btn ghost" onClick={() => reuse(week, rows)}>
                {copied.startsWith(week + '|') ? copied.split('|')[1] : 'Reprendre dans les cases libres'}
              </button>
            </section>
          ))}
        </Sheet>
      )}

      {confirmNew && (
        <Sheet title="Nouvelle semaine ?" onClose={() => setConfirmNew(false)}>
          <p>Les repas de cette semaine sont rangés dans l'historique, puis le planning est vidé, ainsi que les coches et les ajouts de la liste de courses. Les recettes et le nombre de personnes par repas sont gardés.</p>
          <div className="actions">
            <button className="btn ghost" onClick={() => setConfirmNew(false)}>
              Annuler
            </button>
            <button
              className="btn primary"
              onClick={() => {
                dispatch({ type: 'newWeek', date: weekStamp() });
                setConfirmNew(false);
              }}
            >
              Archiver et vider
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}

import type { AppData, DayPlan, HistoryRow, Ingredient, ItemState, Op, Recipe, ShoppingItem } from './types';

export const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
export const DEFAULT_PERSONS = 2;
export const MAX_PERSONS = 20;
export const SANS_RAYON = 'Divers';
/** nombre de repas gardés dans l'historique (environ 2 ans) ; même valeur dans Code.gs */
export const HISTORY_MAX = 1500;

export const norm = (s: string) => s.trim().toLowerCase();
export const itemKey = (name: string, unit: string) => `${norm(name)}|${norm(unit)}`;

export function emptyData(): AppData {
  return {
    recipes: [],
    plan: DAYS.map((day) => ({
      day,
      midi: { recipe: '', persons: DEFAULT_PERSONS },
      soir: { recipe: '', persons: DEFAULT_PERSONS },
    })),
    exclus: [],
    states: [],
    extras: [],
    history: [],
  };
}

const round4 = (n: number) => Math.round(n * 10000) / 10000;

function cleanIngredient(i: Ingredient): Ingredient {
  return {
    name: i.name.trim(),
    qty: Number.isFinite(i.qty) ? round4(i.qty) : 0,
    unit: i.unit.trim(),
    rayon: i.rayon.trim(),
  };
}

export function cleanRecipe(r: Recipe): Recipe {
  return {
    name: r.name.trim(),
    notes: r.notes.trim(),
    ingredients: r.ingredients.map(cleanIngredient).filter((i) => i.name),
  };
}

/**
 * Applique une modification aux données. Le script du Sheet (apps-script/Code.gs)
 * fait la même chose côté Google : les deux doivent rester alignés
 * (vérifié par src/lib/script.test.ts).
 */
export function applyOp(data: AppData, op: Op): AppData {
  switch (op.type) {
    case 'setPlan': {
      const plan = data.plan.map((d, i): DayPlan => {
        if (i !== op.day) return d;
        const slot = { ...d[op.meal] };
        if (op.recipe !== undefined) slot.recipe = op.recipe.trim();
        if (op.persons !== undefined) slot.persons = op.persons;
        return { ...d, [op.meal]: slot };
      });
      return { ...data, plan };
    }
    case 'saveRecipe': {
      const recipe = cleanRecipe(op.recipe);
      if (!recipe.name) return data;
      const old = norm(op.oldName || recipe.name);
      const target = norm(recipe.name);
      let placed = false;
      const recipes: Recipe[] = [];
      for (const r of data.recipes) {
        const n = norm(r.name);
        if (n === old || n === target) {
          if (!placed) recipes.push(recipe);
          placed = true;
        } else recipes.push(r);
      }
      if (!placed) recipes.push(recipe);
      const rename = (s: string) => (s && norm(s) === old ? recipe.name : s);
      const plan = data.plan.map((d) => ({
        ...d,
        midi: { ...d.midi, recipe: rename(d.midi.recipe) },
        soir: { ...d.soir, recipe: rename(d.soir.recipe) },
      }));
      return { ...data, recipes, plan };
    }
    case 'deleteRecipe': {
      const n = norm(op.name);
      const drop = (s: string) => (norm(s) === n ? '' : s);
      return {
        ...data,
        recipes: data.recipes.filter((r) => norm(r.name) !== n),
        plan: data.plan.map((d) => ({
          ...d,
          midi: { ...d.midi, recipe: drop(d.midi.recipe) },
          soir: { ...d.soir, recipe: drop(d.soir.recipe) },
        })),
      };
    }
    case 'setState': {
      const key = itemKey(op.name, op.unit);
      const states = data.states.filter((s) => itemKey(s.name, s.unit) !== key);
      if (op.state) states.push({ name: op.name.trim(), unit: op.unit.trim(), state: op.state });
      return { ...data, states };
    }
    case 'clearStates':
      return { ...data, states: [] };
    case 'setExclu': {
      const n = norm(op.name);
      const exclus = data.exclus.filter((e) => norm(e) !== n);
      if (op.on && n) exclus.push(op.name.trim());
      return { ...data, exclus };
    }
    case 'setExtra': {
      const e = cleanIngredient(op.extra);
      if (!e.name) return data;
      const key = itemKey(e.name, e.unit);
      const extras = data.extras.filter((x) => itemKey(x.name, x.unit) !== key);
      extras.push(e);
      return { ...data, extras };
    }
    case 'removeExtra': {
      const key = itemKey(op.name, op.unit);
      return { ...data, extras: data.extras.filter((x) => itemKey(x.name, x.unit) !== key) };
    }
    case 'newWeek': {
      // les repas planifiés partent dans l'historique avant que la semaine soit vidée
      const archived: HistoryRow[] = [];
      for (const d of data.plan)
        for (const meal of ['midi', 'soir'] as const)
          if (d[meal].recipe) archived.push({ week: op.date, day: d.day, meal, recipe: d[meal].recipe, persons: d[meal].persons });
      return {
        ...data,
        history: [...data.history, ...archived].slice(-HISTORY_MAX),
        plan: data.plan.map((d) => ({
          ...d,
          midi: { ...d.midi, recipe: '' },
          soir: { ...d.soir, recipe: '' },
        })),
        states: [],
        extras: [],
      };
    }
  }
}

/** « AAAA-MM-JJ HH:MM » en heure locale : identifiant d'une semaine archivée. */
export function weekStamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function weekLabel(week: string): string {
  const d = new Date(week.replace(' ', 'T'));
  if (isNaN(d.getTime())) return week;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Semaines archivées, la plus récente d'abord. */
export function historyWeeks(data: AppData): { week: string; rows: HistoryRow[] }[] {
  const m = new Map<string, HistoryRow[]>();
  for (const h of data.history) m.set(h.week, [...(m.get(h.week) ?? []), h]);
  return [...m.entries()].map(([week, rows]) => ({ week, rows })).sort((a, b) => b.week.localeCompare(a.week));
}

/** Pour chaque recette : nombre de fois planifiée dans l'historique et dernière semaine. */
export function recipeUsage(data: AppData): Map<string, { count: number; last: string }> {
  const m = new Map<string, { count: number; last: string }>();
  for (const h of data.history) {
    const k = norm(h.recipe);
    const u = m.get(k) ?? { count: 0, last: '' };
    m.set(k, { count: u.count + 1, last: h.week > u.last ? h.week : u.last });
  }
  return m;
}

/** Nombre de personnes servies par recette sur la semaine. */
export function portionsByRecipe(data: AppData): Map<string, number> {
  const m = new Map<string, number>();
  for (const d of data.plan)
    for (const slot of [d.midi, d.soir]) {
      if (!slot.recipe) continue;
      const k = norm(slot.recipe);
      m.set(k, (m.get(k) ?? 0) + (slot.persons || 0));
    }
  return m;
}

/** Liste de courses : ingrédients des recettes planifiées × personnes, plus les ajouts manuels. */
export function buildShoppingList(data: AppData): { items: ShoppingItem[]; exclus: ShoppingItem[] } {
  const portions = portionsByRecipe(data);
  const stateOf = new Map<string, ItemState>(data.states.map((s) => [itemKey(s.name, s.unit), s.state]));
  const excl = new Set(data.exclus.map(norm));
  const map = new Map<string, ShoppingItem>();

  const add = (i: Ingredient, qty: number, source: string | null) => {
    const key = itemKey(i.name, i.unit);
    let it = map.get(key);
    if (!it) {
      it = {
        key,
        name: i.name,
        unit: i.unit,
        rayon: i.rayon || SANS_RAYON,
        qty: 0,
        state: stateOf.get(key) ?? '',
        sources: [],
        extra: false,
      };
      map.set(key, it);
    }
    if (it.rayon === SANS_RAYON && i.rayon) it.rayon = i.rayon;
    it.qty = round4(it.qty + qty);
    if (source === null) it.extra = true;
    else if (!it.sources.includes(source)) it.sources.push(source);
  };

  for (const r of data.recipes) {
    const p = portions.get(norm(r.name));
    if (!p) continue;
    for (const i of r.ingredients) add(i, i.qty * p, r.name);
  }
  for (const e of data.extras) add(e, e.qty, null);

  const all = [...map.values()].sort(
    (a, b) => a.rayon.localeCompare(b.rayon, 'fr') || a.name.localeCompare(b.name, 'fr'),
  );
  // un ajout manuel reste dans la liste même si l'ingrédient est « toujours en stock »
  const isExclu = (i: ShoppingItem) => excl.has(norm(i.name)) && !i.extra;
  return { items: all.filter((i) => !isExclu(i)), exclus: all.filter(isExclu) };
}

export function groupByRayon(items: ShoppingItem[]): [string, ShoppingItem[]][] {
  const m = new Map<string, ShoppingItem[]>();
  for (const i of items) m.set(i.rayon, [...(m.get(i.rayon) ?? []), i]);
  return [...m.entries()];
}

export function formatQty(n: number): string {
  if (!n) return '';
  const r = Math.round(n * 100) / 100;
  return String(r).replace('.', ',');
}

export function parseQty(s: string): number {
  const n = parseFloat(s.replace(',', '.').replace(/\s/g, ''));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function itemLabel(i: { name: string; qty: number; unit: string }): string {
  const q = formatQty(i.qty);
  return q ? `${i.name} : ${q}${i.unit ? ' ' + i.unit : ''}` : i.name;
}

export function shoppingText(items: ShoppingItem[]): string {
  const todo = items.filter((i) => i.state === '');
  return groupByRayon(todo)
    .map(([rayon, list]) => `${rayon}\n${list.map((i) => `- ${itemLabel(i)}`).join('\n')}`)
    .join('\n\n');
}

/** Valeurs déjà utilisées, les plus fréquentes d'abord (suggestions de saisie). */
export function knownValues(data: AppData, field: 'unit' | 'rayon' | 'name'): string[] {
  const count = new Map<string, number>();
  for (const i of [...data.recipes.flatMap((r) => r.ingredients), ...data.extras]) {
    const v = i[field];
    if (v) count.set(v, (count.get(v) ?? 0) + 1);
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr')).map((e) => e[0]);
}

/** Dernière définition connue d'un ingrédient (unité, rayon) pour préremplir la saisie. */
export function findIngredient(data: AppData, name: string): Ingredient | undefined {
  const n = norm(name);
  if (!n) return undefined;
  return data.recipes.flatMap((r) => r.ingredients).find((i) => norm(i.name) === n);
}

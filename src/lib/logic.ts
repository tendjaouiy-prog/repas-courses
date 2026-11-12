import type { AppData, Article, Entry, Ingredient, ItemState, Op, Recipe, ShoppingItem } from './types';

export const DEFAULT_PERSONS = 2;
export const MAX_PERSONS = 20;
export const SANS_RAYON = 'Divers';
/** durée proposée pour une nouvelle liste de courses */
export const LIST_DAYS = 7;
/** les restes peuvent venir d'un repas cuisiné jusqu'à ce nombre de jours avant */
export const RESTES_DAYS = 3;

export const norm = (s: string) => String(s ?? '').trim().toLowerCase();
export const itemKey = (name: string, unit: string) => `${norm(name)}|${norm(unit)}`;

export function emptyData(): AppData {
  return {
    recipes: [],
    entries: [],
    list: { start: '', end: '' },
    states: [],
    extras: [],
    habituels: [],
    rayons: [],
    exclus: [],
    coursesHash: '',
  };
}

const round4 = (n: number) => Math.round(n * 10000) / 10000;
const num = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? n : 0);

// Les fonctions « clean » ci-dessous ont leur jumelle dans apps-script/Code.gs : même résultat attendu.

export function cleanArticle(i: Article | Ingredient): Article {
  return { name: String(i.name ?? '').trim(), qty: round4(num(i.qty)), unit: String(i.unit ?? '').trim(), rayon: String(i.rayon ?? '').trim() };
}

export function cleanTags(tags: string[]): string[] {
  const out: string[] = [];
  for (const t of tags) {
    const v = String(t ?? '').trim();
    if (v && !out.some((x) => norm(x) === norm(v))) out.push(v);
  }
  return out;
}

export function cleanRecipe(r: Recipe): Recipe {
  return {
    name: String(r.name ?? '').trim(),
    notes: String(r.notes ?? '').trim(),
    tags: cleanTags(r.tags ?? []),
    favorite: !!r.favorite,
    ingredients: (r.ingredients ?? []).map(cleanArticle).filter((i) => i.name),
  };
}

export function cleanEntry(e: Entry): Entry {
  const kind = e.kind === 'texte' || e.kind === 'restes' ? e.kind : 'recette';
  const p = Math.round(num(e.persons));
  return {
    id: String(e.id ?? '').trim(),
    date: String(e.date ?? '').trim(),
    meal: e.meal === 'soir' ? 'soir' : 'midi',
    kind,
    label: String(e.label ?? '').trim(),
    persons: kind === 'texte' ? 0 : p >= 1 ? p : 1,
    source: kind === 'restes' ? String(e.source ?? '').trim() : '',
  };
}

/** Tri par date puis midi/soir ; l'ordre d'ajout est gardé dans une même case. */
export function sortEntries(list: Entry[]): Entry[] {
  return list
    .map((e, i) => ({ e, i }))
    .sort((a, b) => (a.e.date < b.e.date ? -1 : a.e.date > b.e.date ? 1 : 0) || (a.e.meal === b.e.meal ? 0 : a.e.meal === 'midi' ? -1 : 1) || a.i - b.i)
    .map((x) => x.e);
}

function upsertArticle(list: Article[], a: Article): Article[] {
  const key = itemKey(a.name, a.unit);
  return [...list.filter((x) => itemKey(x.name, x.unit) !== key), a];
}

/**
 * Applique une modification aux données. Le script du Sheet (apps-script/Code.gs) fait
 * la même chose côté Google : src/lib/script.test.ts vérifie que les deux donnent le même
 * résultat. Chaque modification doit pouvoir être rejouée sans effet (renvoi après coupure).
 */
export function applyOp(data: AppData, op: Op): AppData {
  switch (op.type) {
    case 'setEntry': {
      const e = cleanEntry(op.entry);
      if (!e.id || !e.date || !e.label) return data;
      const exists = data.entries.some((x) => x.id === e.id);
      const entries = exists ? data.entries.map((x) => (x.id === e.id ? e : x)) : [...data.entries, e];
      return { ...data, entries: sortEntries(entries) };
    }
    case 'removeEntry':
      return { ...data, entries: data.entries.filter((x) => x.id !== op.id && x.source !== op.id) };
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
      const entries = data.entries.map((e) => (e.kind !== 'texte' && norm(e.label) === old ? { ...e, label: recipe.name } : e));
      return { ...data, recipes, entries };
    }
    case 'deleteRecipe': {
      const n = norm(op.name);
      const gone = new Set(data.entries.filter((e) => e.kind === 'recette' && norm(e.label) === n && e.date >= op.from).map((e) => e.id));
      return {
        ...data,
        recipes: data.recipes.filter((r) => norm(r.name) !== n),
        entries: data.entries.filter((e) => !gone.has(e.id) && !gone.has(e.source)),
      };
    }
    case 'setFavorite': {
      const n = norm(op.name);
      return { ...data, recipes: data.recipes.map((r) => (norm(r.name) === n ? { ...r, favorite: !!op.on } : r)) };
    }
    case 'newList': {
      if (!op.start || !op.end || op.end < op.start) return data;
      const extras = op.extras.map(cleanArticle).filter((a) => a.name).reduce(upsertArticle, [] as Article[]);
      return { ...data, list: { start: op.start, end: op.end }, states: [], extras };
    }
    case 'setState': {
      const key = itemKey(op.name, op.unit);
      const states = data.states.filter((s) => itemKey(s.name, s.unit) !== key);
      if (op.state) states.push({ name: op.name.trim(), unit: op.unit.trim(), state: op.state, qty: op.state === 'achete' ? round4(num(op.qty)) : 0 });
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
      const e = cleanArticle(op.extra);
      return e.name ? { ...data, extras: upsertArticle(data.extras, e) } : data;
    }
    case 'removeExtra': {
      const key = itemKey(op.name, op.unit);
      return { ...data, extras: data.extras.filter((x) => itemKey(x.name, x.unit) !== key) };
    }
    case 'setHabitual': {
      const h = cleanArticle(op.item);
      return h.name ? { ...data, habituels: upsertArticle(data.habituels, h) } : data;
    }
    case 'removeHabitual': {
      const key = itemKey(op.name, op.unit);
      return { ...data, habituels: data.habituels.filter((x) => itemKey(x.name, x.unit) !== key) };
    }
    case 'setRayons':
      return { ...data, rayons: cleanTags(op.rayons) };
    case 'writeCourses':
      return { ...data, coursesHash: op.hash };
    default:
      return data; // modification d'une ancienne version de l'appli : ignorée
  }
}

// ---------- planning ----------

/** Personnes ajoutées à chaque repas cuisiné par les restes prévus (id d'origine → personnes). */
export function restesPersons(entries: Entry[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of entries) if (e.kind === 'restes' && e.source) m.set(e.source, (m.get(e.source) ?? 0) + e.persons);
  return m;
}

/** Repas cuisinés qui peuvent fournir des restes pour la case (date, repas). */
export function restesCandidates(entries: Entry[], date: string, meal: 'midi' | 'soir', fromDate: string): Entry[] {
  return entries
    .filter((e) => e.kind === 'recette' && e.date >= fromDate && (e.date < date || (e.date === date && e.meal === 'midi' && meal === 'soir')))
    .reverse();
}

/** Pour chaque recette : nombre de fois planifiée jusqu'à `until` et dernière date. */
export function recipeUsage(entries: Entry[], until: string): Map<string, { count: number; last: string }> {
  const m = new Map<string, { count: number; last: string }>();
  for (const e of entries) {
    if (e.kind !== 'recette' || e.date > until) continue;
    const k = norm(e.label);
    const u = m.get(k) ?? { count: 0, last: '' };
    m.set(k, { count: u.count + 1, last: e.date > u.last ? e.date : u.last });
  }
  return m;
}

export function allTags(recipes: Recipe[]): string[] {
  return cleanTags(recipes.flatMap((r) => r.tags)).sort((a, b) => a.localeCompare(b, 'fr'));
}

// ---------- liste de courses ----------

/** Rayons connus : d'abord ceux rangés dans l'ordre du magasin, puis les autres. */
export function knownRayons(data: AppData): string[] {
  const placed = new Set(data.rayons.map(norm));
  const others = cleanTags([...data.recipes.flatMap((r) => r.ingredients), ...data.habituels, ...data.extras].map((i) => i.rayon)).filter((r) => !placed.has(norm(r)));
  return [...data.rayons, ...others.sort((a, b) => a.localeCompare(b, 'fr'))];
}

function rayonRank(rayons: string[]) {
  const idx = new Map(rayons.map((r, i) => [norm(r), i]));
  return (r: string) => idx.get(norm(r)) ?? (norm(r) === norm(SANS_RAYON) ? 2000 : 1000);
}

export function sortItems<T extends { rayon: string; name: string }>(items: T[], rayons: string[]): T[] {
  const rank = rayonRank(rayons);
  return [...items].sort((a, b) => rank(a.rayon) - rank(b.rayon) || a.rayon.localeCompare(b.rayon, 'fr') || a.name.localeCompare(b.name, 'fr'));
}

/**
 * Liste de courses de la liste en cours : recettes planifiées sur la période × personnes
 * (restes compris), plus les ajouts. Un article coché dont le besoin a augmenté depuis
 * revient avec le complément à racheter.
 */
export function buildShoppingList(data: AppData): { items: ShoppingItem[]; exclus: ShoppingItem[]; meals: number } {
  const { start, end } = data.list;
  if (!start) return { items: [], exclus: [], meals: 0 };
  const recipes = new Map(data.recipes.map((r) => [norm(r.name), r]));
  const extraPersons = restesPersons(data.entries);
  const map = new Map<string, ShoppingItem>();
  const slots = new Set<string>();

  const add = (i: Article, qty: number, source: string | null) => {
    const key = itemKey(i.name, i.unit);
    let it = map.get(key);
    if (!it) {
      it = { key, name: i.name, unit: i.unit, rayon: i.rayon || SANS_RAYON, need: 0, toBuy: 0, bought: 0, status: 'todo', sources: [], extra: false };
      map.set(key, it);
    }
    if (it.rayon === SANS_RAYON && i.rayon) it.rayon = i.rayon;
    it.need = round4(it.need + qty);
    if (source === null) it.extra = true;
    else if (!it.sources.includes(source)) it.sources.push(source);
  };

  for (const e of data.entries) {
    if (e.kind !== 'recette' || e.date < start || e.date > end) continue;
    const r = recipes.get(norm(e.label));
    if (!r) continue;
    slots.add(`${e.date}|${e.meal}`);
    const persons = e.persons + (extraPersons.get(e.id) ?? 0);
    for (const i of r.ingredients) add(i, i.qty * persons, r.name);
  }
  for (const x of data.extras) add(x, x.qty, null);

  const states = new Map(data.states.map((s) => [itemKey(s.name, s.unit), s]));
  for (const it of map.values()) {
    const s = states.get(it.key);
    if (s?.state === 'dispo') it.status = 'dispo';
    else if (s?.state === 'achete' && it.need <= s.qty + 1e-9) it.status = 'done';
    else {
      it.status = 'todo';
      it.bought = s?.state === 'achete' ? s.qty : 0;
      it.toBuy = round4(it.need - it.bought);
    }
  }

  const excl = new Set(data.exclus.map(norm));
  // un ajout manuel reste dans la liste même si l'ingrédient est « toujours en stock »
  const isExclu = (i: ShoppingItem) => excl.has(norm(i.name)) && !i.extra;
  const all = sortItems([...map.values()], data.rayons);
  return { items: all.filter((i) => !isExclu(i)), exclus: all.filter(isExclu), meals: slots.size };
}

export function groupByRayon<T extends { rayon: string }>(items: T[]): [string, T[]][] {
  const m = new Map<string, T[]>();
  for (const i of items) m.set(i.rayon, [...(m.get(i.rayon) ?? []), i]);
  return [...m.entries()];
}

export function formatQty(n: number): string {
  if (!n) return '';
  return String(Math.round(n * 100) / 100).replace('.', ',');
}

export function parseQty(s: string): number {
  const n = parseFloat(s.replace(',', '.').replace(/\s/g, ''));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function qtyLabel(qty: number, unit: string): string {
  const q = formatQty(qty);
  return q ? `${q}${unit ? ' ' + unit : ''}` : '';
}

export function shoppingText(items: ShoppingItem[]): string {
  return groupByRayon(items.filter((i) => i.status === 'todo'))
    .map(([rayon, list]) => `${rayon}\n${list.map((i) => `- ${i.name}${qtyLabel(i.toBuy, i.unit) ? ' : ' + qtyLabel(i.toBuy, i.unit) : ''}`).join('\n')}`)
    .join('\n\n');
}

const STATUS_LABEL = { todo: 'À acheter', done: 'Dans le caddie', dispo: 'Déjà dispo' };

/** Lignes de l'onglet Courses du Sheet (copie lisible de la liste en cours). */
export function coursesRows(data: AppData): (string | number)[][] {
  return buildShoppingList(data).items.map((i) => [
    i.rayon,
    i.name,
    (i.status === 'todo' ? i.toBuy : i.need) || '',
    i.unit,
    i.status === 'todo' && i.bought ? 'Complément' : STATUS_LABEL[i.status],
    [...i.sources, ...(i.extra ? ['ajout'] : [])].join(', '),
  ]);
}

export function hashText(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function coursesHash(data: AppData): string {
  return hashText(JSON.stringify([data.list, coursesRows(data)]));
}

// ---------- suggestions de saisie ----------

/** Valeurs déjà utilisées, les plus fréquentes d'abord. */
export function knownValues(data: AppData, field: 'unit' | 'rayon' | 'name'): string[] {
  const count = new Map<string, number>();
  for (const i of [...data.recipes.flatMap((r) => r.ingredients), ...data.extras, ...data.habituels]) {
    const v = i[field];
    if (v) count.set(v, (count.get(v) ?? 0) + 1);
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr')).map((e) => e[0]);
}

/** Dernière définition connue d'un ingrédient ou article (unité, rayon) pour préremplir la saisie. */
export function findIngredient(data: AppData, name: string): Article | undefined {
  const n = norm(name);
  if (!n) return undefined;
  return [...data.recipes.flatMap((r) => r.ingredients), ...data.habituels, ...data.extras].find((i) => norm(i.name) === n);
}

export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export function stateOf(data: AppData, name: string, unit: string): ItemState {
  return data.states.find((s) => itemKey(s.name, s.unit) === itemKey(name, unit))?.state ?? '';
}

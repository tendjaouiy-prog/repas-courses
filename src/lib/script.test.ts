import { describe, expect, it } from 'vitest';
import source from '../../apps-script/Code.gs?raw';
import { addDays, mondayOf, rangeLabel, weekLabel } from './dates';
import { FakeSpreadsheet, sampleSpreadsheet } from './fakeSheet';
import { applyOp, buildShoppingList, coursesHash, coursesRows, formatQty, parseQty, recipeUsage, restesCandidates, shoppingText } from './logic';
import type { AppData, Entry, Op } from './types';

/** Charge Code.gs avec un faux Sheet et renvoie une fonction qui joue des requêtes de l'appli. */
function server(ss: FakeSpreadsheet, code = 'secret') {
  const load = new Function(
    'SpreadsheetApp',
    'LockService',
    'ContentService',
    'Utilities',
    `${source.replace("var CODE = 'CHANGE-MOI';", `var CODE = '${code}';`)}; return { doPost: doPost };`,
  );
  const api = load(
    { getActiveSpreadsheet: () => ss, flush: () => {} },
    { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    { MimeType: { JSON: 'json' }, createTextOutput: (text: string) => ({ text, setMimeType() { return this; } }) },
    { formatDate: () => '' },
  );
  return (body: unknown) => JSON.parse(api.doPost({ postData: { contents: JSON.stringify(body) } }).text);
}

const post = (ss: FakeSpreadsheet, ops: Op[]) => {
  const res = server(ss)({ code: 'secret', ops });
  expect(res.ok, res.error).toBe(true);
  return res.state as AppData;
};

const entry = (id: string, date: string, meal: 'midi' | 'soir', label: string, persons = 2, kind: Entry['kind'] = 'recette', source = ''): Op => ({
  type: 'setEntry',
  entry: { id, date, meal, kind, label, persons, source },
});

describe('script du Sheet', () => {
  it('lit le Sheet et crée les onglets manquants', () => {
    const ss = sampleSpreadsheet();
    const state = post(ss, []);
    expect(state.recipes.map((r) => r.name)).toEqual(['Pâtes bolognaise', 'Poulet curry riz', 'Omelette salade']);
    expect(state.recipes[0]).toMatchObject({ notes: '', tags: [], favorite: false });
    expect(state.recipes[1].ingredients).toHaveLength(5);
    expect(state.entries).toEqual([]);
    expect(state.list).toEqual({ start: '', end: '' });
    expect(state.exclus).toEqual(['Sel', "Huile d'olive"]);
    expect(ss.getSheets().map((s) => s.name)).toEqual(['📖 Recettes', 'Courses', 'Exclus', 'Liste', 'Repas', 'Habituels', 'Rayons']);
  });

  it('refuse un mauvais code, et un code laissé par défaut', () => {
    expect(server(sampleSpreadsheet())({ code: 'faux', ops: [] })).toEqual({ ok: false, error: 'code' });
    expect(server(sampleSpreadsheet(), 'CHANGE-MOI')({ code: 'CHANGE-MOI', ops: [] }).error).toBe('code-non-defini');
  });

  it("donne le même résultat que l'appli, modification après modification", () => {
    const ops: Op[] = [
      entry('a', '2026-11-17', 'soir', 'Poulet curry riz', 2),
      entry('b', '2026-11-16', 'midi', 'Pâtes bolognaise', 4),
      entry('c', '2026-11-16', 'midi', 'Omelette salade', 2),
      entry('d', '2026-11-18', 'midi', 'Poulet curry riz', 2, 'restes', 'a'),
      entry('e', '2026-11-19', 'soir', ' Resto ', 5, 'texte'),
      entry('b', '2026-11-16', 'midi', 'Pâtes bolognaise', 3),
      entry('f', '2026-11-20', 'midi', 'Omelette salade', 0),
      { type: 'removeEntry', id: 'f' },
      {
        type: 'saveRecipe',
        oldName: '',
        recipe: {
          name: ' Gratin dauphinois ',
          notes: 'four 180°\n1 h',
          tags: ['Four', ' hiver ', 'four', ''],
          favorite: true,
          ingredients: [
            { name: 'Pommes de terre', qty: 250, unit: 'g', rayon: 'Fruits & légumes' },
            { name: '', qty: 1, unit: 'g', rayon: '' },
            { name: 'Crème', qty: 0.123456, unit: 'L', rayon: 'Crèmerie' },
          ],
        },
      },
      { type: 'saveRecipe', oldName: 'Poulet curry riz', recipe: { name: 'Poulet curry', notes: '', tags: ['rapide'], favorite: false, ingredients: [{ name: 'Blanc de poulet', qty: 150, unit: 'g', rayon: 'Boucherie' }, { name: 'Riz', qty: 80, unit: 'g', rayon: 'Épicerie' }] } },
      { type: 'setFavorite', name: 'omelette salade', on: true },
      { type: 'setFavorite', name: 'Gratin dauphinois', on: false },
      { type: 'newList', start: '2026-11-15', end: '2026-11-21', extras: [{ name: 'Lait', qty: 2, unit: 'L', rayon: 'Crèmerie' }, { name: 'lait', qty: 3, unit: 'L', rayon: 'Crèmerie' }, { name: '', qty: 1, unit: '', rayon: '' }] },
      { type: 'setState', name: 'Oignon', unit: 'pièce', state: 'dispo', qty: 9 },
      { type: 'setState', name: 'Pâtes', unit: 'g', state: 'achete', qty: 375 },
      { type: 'setState', name: 'riz', unit: 'g', state: 'achete', qty: 320 },
      { type: 'setState', name: 'Pâtes', unit: 'g', state: '', qty: 0 },
      { type: 'setExtra', extra: { name: 'Essuie-tout', qty: 0, unit: '', rayon: 'Maison' } },
      { type: 'removeExtra', name: 'lait', unit: 'l' },
      { type: 'setHabitual', item: { name: 'Pain', qty: 1, unit: 'pièce', rayon: 'Boulangerie' } },
      { type: 'setHabitual', item: { name: 'Yaourts', qty: 8, unit: '', rayon: 'Crèmerie' } },
      { type: 'removeHabitual', name: 'pain', unit: 'pièce' },
      { type: 'setRayons', rayons: ['Fruits & légumes', ' Boucherie', 'fruits & légumes', 'Crèmerie'] },
      { type: 'setExclu', name: 'Curry', on: true },
      { type: 'setExclu', name: 'sel', on: false },
      { type: 'deleteRecipe', name: 'omelette salade', from: '2026-11-17' },
      { type: 'deleteRecipe', name: 'Poulet curry', from: '2026-11-17' },
      { type: 'writeCourses', rows: [['Épicerie', 'Riz', 160, 'g', 'À acheter', 'Poulet curry']], hash: 'abc' },
      { type: 'clearStates' },
      { type: 'newList', start: '2026-11-20', end: '2026-11-19', extras: [] },
    ];
    const ss = sampleSpreadsheet();
    let local = post(ss, []);
    for (const op of ops) {
      local = applyOp(local, op);
      expect(post(ss, [op]), `après ${JSON.stringify(op)}`).toEqual(local);
    }
    expect(local.entries.map((e) => e.id)).toEqual(['b', 'c', 'e']);
    expect(local.recipes.find((r) => r.name === 'Gratin dauphinois')).toMatchObject({ tags: ['Four', 'hiver'], favorite: false });
    expect(local.coursesHash).toBe('abc');
    expect(ss.getSheetByName('Courses')!.get(2, 2)).toBe('Riz');

    // rejouer des modifications déjà appliquées (réseau coupé avant la réponse) ne change rien
    const ss2 = sampleSpreadsheet();
    const once = post(ss2, ops.slice(0, 20));
    expect(post(ss2, ops.slice(10, 20))).toEqual(once);
  });

  it('agrandit la feuille quand elle est pleine', () => {
    const ss = sampleSpreadsheet();
    const ops: Op[] = Array.from({ length: 60 }, (_, i) => entry(`id${i}`, addDays('2026-01-05', i), 'midi', 'Omelette salade'));
    expect(post(ss, ops).entries).toHaveLength(60);
  });

  it('relit un planning tapé à la main dans le Sheet', () => {
    const ss = sampleSpreadsheet();
    post(ss, []);
    ss.getSheetByName('Repas')!.fill([['2026-11-16', 'soir', 'recette', 'Omelette salade', '', '', ''], ['2026-11-16', 'Midi', 'Texte', 'Resto', 3, '', '']], 2);
    const state = post(ss, []);
    expect(state.entries[1]).toEqual({ id: 'feuille-2026-11-16-1', date: '2026-11-16', meal: 'midi', kind: 'texte', label: 'Resto', persons: 0, source: '' });
    expect(state.entries.map((e) => [e.meal, e.kind, e.persons])).toEqual([
      ['soir', 'recette', 2],
      ['midi', 'texte', 0],
    ]);
  });
});

describe('liste de courses', () => {
  const base = () => post(sampleSpreadsheet(), []);
  const plan = (d: AppData, ops: Op[]) => ops.reduce(applyOp, d);

  it('compte les repas de la période, restes compris', () => {
    const d = plan(base(), [
      entry('a', '2026-11-14', 'soir', 'Pâtes bolognaise', 2), // avant la période
      entry('b', '2026-11-15', 'midi', 'Pâtes bolognaise', 4),
      entry('c', '2026-11-16', 'soir', 'Poulet curry riz', 2),
      entry('d', '2026-11-17', 'midi', 'Poulet curry riz', 2, 'restes', 'c'),
      entry('e', '2026-11-15', 'midi', 'Resto', 0, 'texte'),
      entry('f', '2026-11-22', 'midi', 'Omelette salade', 2), // après la période
      { type: 'newList', start: '2026-11-15', end: '2026-11-21', extras: [] },
    ]);
    const { items, meals } = buildShoppingList(d);
    const get = (n: string) => items.find((i) => i.name === n)!;
    expect(meals).toBe(2);
    expect(get('Pâtes').need).toBe(500);
    expect(get('Blanc de poulet').need).toBe(600); // 2 + 2 pour les restes
    expect(get('Oignon').need).toBe(2);
    expect(items.find((i) => i.name === 'Œufs')).toBeUndefined();
    expect(buildShoppingList({ ...d, list: { start: '', end: '' } }).items).toEqual([]);
  });

  it('affiche le complément quand le besoin augmente après les grosses courses', () => {
    let d = plan(base(), [entry('b', '2026-11-15', 'midi', 'Pâtes bolognaise', 2), { type: 'newList', start: '2026-11-15', end: '2026-11-21', extras: [] }]);
    d = applyOp(d, { type: 'setState', name: 'Pâtes', unit: 'g', state: 'achete', qty: 250 });
    expect(buildShoppingList(d).items.find((i) => i.name === 'Pâtes')).toMatchObject({ status: 'done' });
    d = applyOp(d, entry('x', '2026-11-18', 'soir', 'Pâtes bolognaise', 1));
    expect(buildShoppingList(d).items.find((i) => i.name === 'Pâtes')).toMatchObject({ status: 'todo', need: 375, toBuy: 125, bought: 250 });
    expect(coursesRows(d).find((r) => r[1] === 'Pâtes')).toEqual(['Épicerie', 'Pâtes', 125, 'g', 'Complément', 'Pâtes bolognaise']);
  });

  it("range par ordre du magasin, écarte le stock, garde états et ajouts", () => {
    let d = plan(base(), [
      entry('a', '2026-11-15', 'midi', 'Omelette salade', 2),
      { type: 'newList', start: '2026-11-15', end: '2026-11-21', extras: [{ name: 'Œufs', qty: 6, unit: 'pièce', rayon: '' }, { name: 'Éponges', qty: 0, unit: '', rayon: '' }] },
      { type: 'setRayons', rayons: ['Fruits & légumes', 'Crèmerie'] },
      { type: 'setExclu', name: 'tomates', on: true },
      { type: 'setState', name: 'Œufs', unit: 'pièce', state: 'dispo', qty: 0 },
    ]);
    const { items, exclus } = buildShoppingList(d);
    expect(items.map((i) => i.name)).toEqual(['Salade', 'Œufs', 'Éponges']);
    expect(exclus.map((i) => i.name)).toEqual(['Tomates']);
    expect(items[1]).toMatchObject({ need: 12, status: 'dispo', extra: true, rayon: 'Crèmerie' });
    expect(shoppingText(items)).toBe('Fruits & légumes\n- Salade : 0,5 pièce\n\nDivers\n- Éponges');
    const h = coursesHash(d);
    d = applyOp(d, { type: 'setState', name: 'Salade', unit: 'pièce', state: 'achete', qty: 0.5 });
    expect(coursesHash(d)).not.toBe(h);
  });

  it('propose les restes des trois derniers jours, le plus récent en premier', () => {
    const d = plan(base(), [
      entry('a', '2026-11-12', 'soir', 'Pâtes bolognaise'),
      entry('b', '2026-11-14', 'soir', 'Poulet curry riz'),
      entry('c', '2026-11-15', 'midi', 'Omelette salade'),
      entry('d', '2026-11-15', 'soir', 'Pâtes bolognaise'),
      entry('e', '2026-11-15', 'midi', 'Resto', 0, 'texte'),
    ]);
    expect(restesCandidates(d.entries, '2026-11-15', 'soir', '2026-11-12').map((e) => e.id)).toEqual(['c', 'b', 'a']);
    expect(restesCandidates(d.entries, '2026-11-15', 'midi', '2026-11-13').map((e) => e.id)).toEqual(['b']);
    const usage = recipeUsage(d.entries, '2026-11-14');
    expect(usage.get('pâtes bolognaise')).toEqual({ count: 1, last: '2026-11-12' });
    expect(usage.get('omelette salade')).toBeUndefined();
  });
});

describe('dates et quantités', () => {
  it('calcule les semaines et les libellés', () => {
    expect(mondayOf('2026-11-15')).toBe('2026-11-09');
    expect(mondayOf('2026-11-16')).toBe('2026-11-16');
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
    expect(weekLabel('2026-11-30')).toBe('du 30 nov. au 6 déc.');
    expect(rangeLabel('2026-11-14', '2026-11-20')).toBe('du sam. 14 au ven. 20 nov.');
  });

  it('formate et relit les quantités à la française', () => {
    expect(formatQty(0.25)).toBe('0,25');
    expect(formatQty(1.3333)).toBe('1,33');
    expect(parseQty('0,5')).toBe(0.5);
    expect(parseQty('abc')).toBe(0);
  });
});

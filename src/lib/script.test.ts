import { describe, expect, it } from 'vitest';
import { applyOp, buildShoppingList, formatQty, historyWeeks, parseQty, recipeUsage, shoppingText, weekLabel, weekStamp } from './logic';
import { FakeSpreadsheet, sampleSpreadsheet } from './fakeSheet';
import type { AppData, Op } from './types';
import source from '../../apps-script/Code.gs?raw';

/** Charge Code.gs avec un faux Sheet et renvoie une fonction qui joue des requêtes de l'appli. */
function server(ss: FakeSpreadsheet, code = 'secret') {
  const load = new Function(
    'SpreadsheetApp',
    'LockService',
    'ContentService',
    `${source.replace("var CODE = 'CHANGE-MOI';", `var CODE = '${code}';`)}; return { doPost: doPost, doGet: doGet };`,
  );
  const api = load(
    { getActiveSpreadsheet: () => ss, flush: () => {} },
    { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    {
      MimeType: { JSON: 'json' },
      createTextOutput: (text: string) => ({ text, setMimeType() { return this; } }),
    },
  );
  return (body: unknown) => JSON.parse(api.doPost({ postData: { contents: JSON.stringify(body) } }).text);
}

const post = (ss: FakeSpreadsheet, ops: Op[]) => {
  const res = server(ss)({ code: 'secret', ops });
  expect(res.ok, res.error).toBe(true);
  return res.state as AppData;
};

describe('script du Sheet', () => {
  it('lit le Sheet existant', () => {
    const state = post(sampleSpreadsheet(), []);
    expect(state.recipes.map((r) => r.name)).toEqual(['Pâtes bolognaise', 'Poulet curry riz', 'Omelette salade']);
    expect(state.recipes[1].ingredients).toHaveLength(5);
    expect(state.recipes[0].ingredients[2]).toEqual({ name: 'Sauce tomate', qty: 0.25, unit: 'pot', rayon: 'Épicerie' });
    expect(state.plan).toHaveLength(7);
    expect(state.plan[0]).toEqual({ day: 'Lundi', midi: { recipe: '', persons: 2 }, soir: { recipe: '', persons: 2 } });
    expect(state.exclus).toEqual(['Sel', "Huile d'olive"]);
    expect(state.states).toEqual([]);
    expect(state.extras).toEqual([]);
    expect(state.history).toEqual([]);
  });

  it('refuse un mauvais code, et un code laissé par défaut', () => {
    expect(server(sampleSpreadsheet())({ code: 'faux', ops: [] })).toEqual({ ok: false, error: 'code' });
    expect(server(sampleSpreadsheet(), 'CHANGE-MOI')({ code: 'CHANGE-MOI', ops: [] }).error).toBe('code-non-defini');
  });

  it("donne le même résultat que l'appli, modification après modification", () => {
    const ops: Op[] = [
      { type: 'setPlan', day: 0, meal: 'midi', recipe: 'Pâtes bolognaise', persons: 4 },
      { type: 'setPlan', day: 0, meal: 'soir', recipe: 'Omelette salade' },
      { type: 'setPlan', day: 2, meal: 'soir', recipe: 'Poulet curry riz', persons: 3 },
      { type: 'setPlan', day: 6, meal: 'midi', persons: 6 },
      { type: 'setState', name: 'Oignon', unit: 'pièce', state: 'dispo' },
      { type: 'setState', name: 'Pâtes', unit: 'g', state: 'achete' },
      { type: 'setState', name: 'oignon', unit: 'pièce', state: 'achete' },
      { type: 'setState', name: 'Pâtes', unit: 'g', state: '' },
      {
        type: 'saveRecipe',
        oldName: '',
        recipe: {
          name: ' Gratin dauphinois ',
          notes: 'four 180°\n1 h',
          ingredients: [
            { name: 'Pommes de terre', qty: 250, unit: 'g', rayon: 'Fruits & légumes' },
            { name: '', qty: 1, unit: 'g', rayon: '' },
            { name: 'Crème', qty: 0.123456, unit: 'L', rayon: 'Crèmerie' },
          ],
        },
      },
      { type: 'saveRecipe', oldName: 'Recette vide', recipe: { name: 'Recette vide', notes: '', ingredients: [] } },
      {
        type: 'saveRecipe',
        oldName: 'Pâtes bolognaise',
        recipe: { name: 'Pâtes bolo', notes: 'https://exemple.fr', ingredients: [{ name: 'Pâtes', qty: 100, unit: 'g', rayon: 'Épicerie' }] },
      },
      { type: 'deleteRecipe', name: 'omelette salade' },
      { type: 'setExclu', name: 'Curry', on: true },
      { type: 'setExclu', name: 'sel', on: false },
      { type: 'setExtra', extra: { name: 'Essuie-tout', qty: 0, unit: '', rayon: 'Maison' } },
      { type: 'setExtra', extra: { name: 'Lait', qty: 2, unit: 'L', rayon: 'Crèmerie' } },
      { type: 'setExtra', extra: { name: 'lait', qty: 3, unit: 'L', rayon: 'Crèmerie' } },
      { type: 'removeExtra', name: 'Essuie-tout', unit: '' },
      { type: 'clearStates' },
      { type: 'setState', name: 'Riz', unit: 'g', state: 'dispo' },
      { type: 'newWeek', date: '2026-11-09 20:15' },
      { type: 'newWeek', date: '2026-11-09 20:16' },
      { type: 'setPlan', day: 4, meal: 'soir', recipe: 'Pâtes bolo', persons: 5 },
      { type: 'newWeek', date: '2026-11-16 19:00' },
    ];
    const ss = sampleSpreadsheet();
    let local = post(ss, []);
    for (const op of ops) {
      local = applyOp(local, op);
      expect(post(ss, [op]), `après ${JSON.stringify(op)}`).toEqual(local);
    }
    // rejouer une modification déjà appliquée (réseau coupé avant la réponse) ne change rien
    const ss2 = sampleSpreadsheet();
    const once = post(ss2, ops.slice(0, 12));
    expect(post(ss2, ops.slice(0, 12).slice(-3))).toEqual(once);
  });

  it('ne touche jamais aux colonnes de formules F et H ni aux notes des exclus', () => {
    const ss = sampleSpreadsheet();
    post(ss, [
      { type: 'deleteRecipe', name: 'Poulet curry riz' },
      { type: 'setExclu', name: 'Poivre', on: true },
    ]);
    const recettes = ss.getSheetByName('📖 Recettes')!;
    expect(recettes.get(2, 6)).toBe('=FORMULE');
    expect(recettes.get(2, 8)).toBe('=FORMULE');
    expect(recettes.get(7, 1)).toBe('Omelette salade');
    expect(recettes.get(11, 2)).toBe('');
    expect(ss.getSheetByName('Exclus')!.get(2, 2)).toBe('toujours en stock');
    expect(ss.getSheetByName('Exclus')!.get(4, 1)).toBe('Poivre');
  });

  it('agrandit la feuille quand elle est pleine', () => {
    const ss = sampleSpreadsheet();
    const ops: Op[] = Array.from({ length: 30 }, (_, i) => ({
      type: 'saveRecipe',
      oldName: '',
      recipe: { name: `R${i}`, notes: '', ingredients: [{ name: 'A', qty: 1, unit: 'g', rayon: '' }, { name: 'B', qty: 1, unit: 'g', rayon: '' }] },
    }));
    expect(post(ss, ops).recipes).toHaveLength(33);
  });
});

describe('historique', () => {
  it('archive la semaine avant de la vider, sans doublon si la demande est rejouée', () => {
    const ss = sampleSpreadsheet();
    const week: Op[] = [
      { type: 'setPlan', day: 0, meal: 'midi', recipe: 'Pâtes bolognaise', persons: 4 },
      { type: 'setPlan', day: 5, meal: 'soir', recipe: 'Omelette salade' },
      { type: 'newWeek', date: '2026-11-09 20:15' },
    ];
    post(ss, week);
    const state = post(ss, [{ type: 'newWeek', date: '2026-11-09 20:15' }]);
    expect(state.history).toEqual([
      { week: '2026-11-09 20:15', day: 'Lundi', meal: 'midi', recipe: 'Pâtes bolognaise', persons: 4 },
      { week: '2026-11-09 20:15', day: 'Samedi', meal: 'soir', recipe: 'Omelette salade', persons: 2 },
    ]);
    expect(state.plan.every((d) => !d.midi.recipe && !d.soir.recipe)).toBe(true);
    expect(state.plan[0].midi.persons).toBe(4);
    expect(ss.getSheetByName('Historique')!.get(2, 3)).toBe('Midi');

    const later = post(ss, [
      { type: 'setPlan', day: 2, meal: 'midi', recipe: 'Pâtes bolognaise' },
      { type: 'newWeek', date: '2026-11-16 19:00' },
    ]);
    expect(historyWeeks(later).map((w) => [w.week, w.rows.length])).toEqual([['2026-11-16 19:00', 1], ['2026-11-09 20:15', 2]]);
    expect(recipeUsage(later).get('pâtes bolognaise')).toEqual({ count: 2, last: '2026-11-16 19:00' });
    expect(weekLabel('2026-11-09 20:15')).toBe('9 novembre 2026');
    expect(weekStamp(new Date(2026, 0, 5, 7, 3))).toBe('2026-01-05 07:03');
  });
});

describe('liste de courses', () => {
  const base = () => post(sampleSpreadsheet(), []);

  it('multiplie par le nombre de personnes et regroupe par ingrédient', () => {
    let d = base();
    d = applyOp(d, { type: 'setPlan', day: 0, meal: 'midi', recipe: 'Pâtes bolognaise', persons: 4 });
    d = applyOp(d, { type: 'setPlan', day: 1, meal: 'soir', recipe: 'Poulet curry riz', persons: 2 });
    d = applyOp(d, { type: 'setPlan', day: 3, meal: 'midi', recipe: 'Pâtes bolognaise', persons: 2 });
    const { items } = buildShoppingList(d);
    const get = (n: string) => items.find((i) => i.name === n)!;
    expect(get('Pâtes').qty).toBe(750);
    expect(get('Oignon').qty).toBe(2);
    expect(get('Oignon').sources).toEqual(['Pâtes bolognaise', 'Poulet curry riz']);
    expect(get('Riz').qty).toBe(160);
    expect(items.map((i) => i.rayon)).toEqual([...items.map((i) => i.rayon)].sort((a, b) => a.localeCompare(b, 'fr')));
  });

  it('écarte les ingrédients toujours en stock, garde les états et les ajouts', () => {
    let d = base();
    d = applyOp(d, { type: 'setPlan', day: 0, meal: 'midi', recipe: 'Omelette salade', persons: 2 });
    d = applyOp(d, { type: 'setExclu', name: 'tomates', on: true });
    d = applyOp(d, { type: 'setState', name: 'Œufs', unit: 'pièce', state: 'dispo' });
    d = applyOp(d, { type: 'setExtra', extra: { name: 'Œufs', qty: 6, unit: 'pièce', rayon: '' } });
    d = applyOp(d, { type: 'setExtra', extra: { name: 'Éponges', qty: 0, unit: '', rayon: '' } });
    const { items, exclus } = buildShoppingList(d);
    expect(exclus.map((i) => i.name)).toEqual(['Tomates']);
    expect(items.find((i) => i.name === 'Œufs')).toMatchObject({ qty: 12, state: 'dispo', extra: true, rayon: 'Crèmerie' });
    expect(items.find((i) => i.name === 'Éponges')).toMatchObject({ rayon: 'Divers', sources: [] });
    expect(shoppingText(items)).toBe('Divers\n- Éponges\n\nFruits & légumes\n- Salade : 0,5 pièce');
  });

  it('formate et relit les quantités à la française', () => {
    expect(formatQty(0.25)).toBe('0,25');
    expect(formatQty(1.3333)).toBe('1,33');
    expect(formatQty(750)).toBe('750');
    expect(parseQty('0,5')).toBe(0.5);
    expect(parseQty('abc')).toBe(0);
  });
});

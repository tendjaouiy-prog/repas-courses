/**
 * Repas & courses : passerelle entre l'appli et ce Google Sheet.
 *
 * Installation (une seule fois) : suivre l'onglet Réglages de l'appli, qui fournit ce
 * script avec le code d'accès déjà inscrit à la place de CHANGE-MOI.
 *  1. Dans le Sheet : Extensions > Apps Script. Remplacer tout le contenu par ce fichier.
 *  2. Déployer > Nouveau déploiement > type « Application Web »,
 *     Exécuter en tant que : Moi, Qui a accès : Tout le monde. Autoriser.
 *  3. Copier l'URL (elle finit par /exec) et la coller dans l'appli.
 *
 * Après une modification de ce fichier : Déployer > Gérer les déploiements >
 * crayon > Version : Nouvelle version > Déployer (l'URL ne change pas).
 *
 * Onglets : Recettes, Repas (planning daté, sert d'historique), Courses (copie lisible
 * de la liste en cours), Habituels, Rayons (ordre du magasin), Exclus (toujours en stock),
 * Liste (technique : période, coches, ajouts). Les onglets absents sont créés.
 */
var CODE = 'CHANGE-MOI';

var VERSION = 2;
var DEFAULT_PERSONS = 2;

var TABS = {
  repas: ['Repas', ['Date', 'Repas', 'Type', 'Recette / texte', 'Pers.', 'Restes de', 'Id']],
  courses: ['Courses', ['Rayon', 'Article', 'Quantité', 'Unité', 'État', 'Pour']],
  habituels: ['Habituels', ['Article', 'Quantité', 'Unité', 'Rayon']],
  rayons: ['Rayons', ['Rayon (ordre du magasin)']],
  exclus: ['Exclus', ['🚫 À ne pas envoyer', '📝 Note']],
  liste: ['Liste', ['Du', 'Au', 'Empreinte', '', 'Article', 'Unité', 'État', 'Qté prise', '', 'Ajout', 'Quantité', 'Unité', 'Rayon']],
};
var RECETTES_HEADER = ['🍲 Recette', '🥕 Ingrédient', '⚖️ Qté / 1 portion', 'Unité', '🛒 Rayon', '📝 Notes / lien', '🏷️ Étiquettes', '⭐ Favori'];

var MEAL_LABEL = { midi: 'Midi', soir: 'Soir' };
var KIND_LABEL = { recette: 'Recette', texte: 'Texte', restes: 'Restes' };
var STATE_LABEL = { dispo: 'Déjà dispo', achete: 'Dans le caddie' };

function doGet() {
  return out({ ok: true, service: 'repas-courses', version: VERSION });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  var locked = false;
  try {
    var req = JSON.parse(e.postData.contents);
    if (CODE === 'CHANGE-MOI') return out({ ok: false, error: 'code-non-defini' });
    if (req.code !== CODE) return out({ ok: false, error: 'code' });
    lock.waitLock(20000);
    locked = true;
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var ops = req.ops || [];
    for (var i = 0; i < ops.length; i++) applyOp(ss, ops[i]);
    if (ops.length) SpreadsheetApp.flush();
    return out({ ok: true, version: VERSION, state: readState(ss) });
  } catch (err) {
    return out({ ok: false, error: String(err && err.message ? err.message : err) });
  } finally {
    if (locked) lock.releaseLock();
  }
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------- outils ----------

function norm(s) {
  return String(s == null ? '' : s).trim().toLowerCase();
}

function itemKey(name, unit) {
  return norm(name) + '|' + norm(unit);
}

function str(v) {
  return String(v == null ? '' : v).trim();
}

function num(v) {
  var n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return isFinite(n) ? n : 0;
}

function round4(n) {
  return Math.round(n * 10000) / 10000;
}

function isDate(v) {
  return Object.prototype.toString.call(v) === '[object Date]';
}

/** Date saisie à la main dans le Sheet (objet Date) ou texte AAAA-MM-JJ. */
function dateText(ss, v) {
  return isDate(v) ? Utilities.formatDate(v, ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd') : str(v);
}

function tab(ss, id) {
  var def = TABS[id];
  var sh = ss.getSheetByName(def[0]);
  if (!sh) {
    sh = ss.insertSheet(def[0]);
    sh.getRange(1, 1, 1, def[1].length).setValues([def[1]]);
    sh.setFrozenRows(1);
    // dates gardées en texte, sinon Sheets les transforme
    if (id === 'repas') sh.getRange(1, 1, sh.getMaxRows(), 1).setNumberFormat('@');
    if (id === 'liste') sh.getRange(1, 1, sh.getMaxRows(), 2).setNumberFormat('@');
  }
  return sh;
}

function recipesSheet(ss) {
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var n = sheets[i].getName();
    if (n.indexOf('Recettes') !== -1 && n.indexOf('Liste') === -1) return sheets[i];
  }
  var sh = ss.insertSheet('📖 Recettes');
  sh.getRange(1, 1, 1, RECETTES_HEADER.length).setValues([RECETTES_HEADER]);
  sh.setFrozenRows(1);
  return sh;
}

/** Lignes non vides à partir de la ligne 2, sur ncols colonnes à partir de col. */
function readRows(sh, col, ncols) {
  var max = sh.getMaxRows();
  if (max < 2) return [];
  var values = sh.getRange(2, col, max - 1, ncols).getValues();
  var last = values.length;
  while (last > 0 && values[last - 1].join('') === '') last--;
  return values.slice(0, last);
}

/** Remplace le contenu à partir de la ligne 2 (les colonnes voisines ne sont pas touchées). */
function writeRows(sh, col, ncols, rows) {
  var max = sh.getMaxRows();
  if (rows.length + 1 > max) {
    sh.insertRowsAfter(max, rows.length + 1 - max);
    max = sh.getMaxRows();
  }
  if (max > 1) sh.getRange(2, col, max - 1, ncols).clearContent();
  if (rows.length) sh.getRange(2, col, rows.length, ncols).setValues(rows);
}

// ---------- nettoyage (mêmes règles que src/lib/logic.ts) ----------

function cleanArticle(i) {
  return { name: str(i.name), qty: round4(num(i.qty)), unit: str(i.unit), rayon: str(i.rayon) };
}

function cleanTags(tags) {
  var res = [];
  (tags || []).forEach(function (t) {
    var v = str(t);
    if (v && !res.some(function (x) { return norm(x) === norm(v); })) res.push(v);
  });
  return res;
}

function cleanEntry(e) {
  var kind = e.kind === 'texte' || e.kind === 'restes' ? e.kind : 'recette';
  var p = Math.round(num(e.persons));
  return {
    id: str(e.id),
    date: str(e.date),
    meal: e.meal === 'soir' ? 'soir' : 'midi',
    kind: kind,
    label: str(e.label),
    persons: kind === 'texte' ? 0 : p >= 1 ? p : 1,
    source: kind === 'restes' ? str(e.source) : '',
  };
}

function sortEntries(list) {
  return list
    .map(function (e, i) { return { e: e, i: i }; })
    .sort(function (a, b) {
      if (a.e.date !== b.e.date) return a.e.date < b.e.date ? -1 : 1;
      if (a.e.meal !== b.e.meal) return a.e.meal === 'midi' ? -1 : 1;
      return a.i - b.i;
    })
    .map(function (x) { return x.e; });
}

function upsertArticle(list, a) {
  var key = itemKey(a.name, a.unit);
  return list.filter(function (x) { return itemKey(x.name, x.unit) !== key; }).concat([a]);
}

// ---------- lecture ----------

function readRecipes(ss) {
  var rows = readRows(recipesSheet(ss), 1, 8);
  var recipes = [];
  var cur = null;
  rows.forEach(function (r) {
    var name = str(r[0]);
    if (name) {
      var fav = norm(r[7]);
      cur = { name: name, notes: '', tags: cleanTags(str(r[6]).split(',')), favorite: fav !== '' && fav !== 'non' && fav !== 'false' && fav !== '0', ingredients: [] };
      recipes.push(cur);
    }
    if (!cur) return;
    if (str(r[1])) cur.ingredients.push(cleanArticle({ name: r[1], qty: num(r[2]), unit: r[3], rayon: r[4] }));
    var note = str(r[5]);
    if (note) cur.notes = cur.notes ? cur.notes + '\n' + note : note;
  });
  return recipes;
}

function writeRecipes(ss, recipes) {
  var rows = [];
  recipes.forEach(function (r, i) {
    if (i > 0) rows.push(['', '', '', '', '', '', '', '']);
    var n = Math.max(1, r.ingredients.length);
    for (var j = 0; j < n; j++) {
      var ing = r.ingredients[j];
      rows.push([
        j === 0 ? r.name : '',
        ing ? ing.name : '',
        ing ? ing.qty : '',
        ing ? ing.unit : '',
        ing ? ing.rayon : '',
        j === 0 ? r.notes : '',
        j === 0 ? r.tags.join(', ') : '',
        j === 0 && r.favorite ? '⭐' : '',
      ]);
    }
  });
  writeRows(recipesSheet(ss), 1, 8, rows);
}

function kindFrom(v) {
  var n = norm(v);
  return n === 'texte' ? 'texte' : n === 'restes' ? 'restes' : 'recette';
}

function readEntries(ss) {
  return readRows(tab(ss, 'repas'), 1, 7)
    .filter(function (r) { return str(r[3]) && dateText(ss, r[0]); })
    .map(function (r, i) {
      return cleanEntry({
        id: str(r[6]) || 'feuille-' + dateText(ss, r[0]) + '-' + i,
        date: dateText(ss, r[0]),
        meal: norm(r[1]) === 'soir' ? 'soir' : 'midi',
        kind: kindFrom(r[2]),
        label: r[3],
        persons: str(r[4]) === '' ? DEFAULT_PERSONS : num(r[4]),
        source: r[5],
      });
    });
}

function writeEntries(ss, entries) {
  writeRows(tab(ss, 'repas'), 1, 7, sortEntries(entries).map(function (e) {
    return [e.date, MEAL_LABEL[e.meal], KIND_LABEL[e.kind], e.label, e.kind === 'texte' ? '' : e.persons, e.source, e.id];
  }));
}

function readArticles(sh, col) {
  return readRows(sh, col, 4)
    .filter(function (r) { return str(r[0]); })
    .map(function (r) { return cleanArticle({ name: r[0], qty: num(r[1]), unit: r[2], rayon: r[3] }); });
}

function articleRows(list) {
  return list.map(function (a) { return [a.name, a.qty || '', a.unit, a.rayon]; });
}

function stateFrom(v) {
  var n = norm(v);
  return n === 'déjà dispo' || n === 'dispo' ? 'dispo' : n === 'dans le caddie' || n === 'achete' ? 'achete' : '';
}

function readListe(ss) {
  var sh = tab(ss, 'liste');
  var head = sh.getRange(2, 1, 1, 3).getValues()[0];
  var states = readRows(sh, 5, 4)
    .filter(function (r) { return str(r[0]) && stateFrom(r[2]); })
    .map(function (r) { var s = stateFrom(r[2]); return { name: str(r[0]), unit: str(r[1]), state: s, qty: s === 'achete' ? round4(num(r[3])) : 0 }; });
  return { list: { start: dateText(ss, head[0]), end: dateText(ss, head[1]) }, hash: str(head[2]), states: states, extras: readArticles(sh, 10) };
}

function writeStates(ss, states) {
  writeRows(tab(ss, 'liste'), 5, 4, states.map(function (s) { return [s.name, s.unit, STATE_LABEL[s.state], s.state === 'achete' ? s.qty || '' : '']; }));
}

function readNames(sh) {
  return readRows(sh, 1, 1).map(function (r) { return str(r[0]); }).filter(function (s) { return s; });
}

function readState(ss) {
  var liste = readListe(ss);
  return {
    recipes: readRecipes(ss),
    entries: readEntries(ss),
    list: liste.list.start ? liste.list : { start: '', end: '' },
    states: liste.states,
    extras: liste.extras,
    habituels: readArticles(tab(ss, 'habituels'), 1),
    rayons: readNames(tab(ss, 'rayons')),
    exclus: readNames(tab(ss, 'exclus')),
    coursesHash: liste.hash,
  };
}

// ---------- modifications (mêmes règles que applyOp dans l'appli) ----------

function applyOp(ss, op) {
  switch (op.type) {
    case 'setEntry': {
      var e = cleanEntry(op.entry || {});
      if (!e.id || !e.date || !e.label) return;
      var entries = readEntries(ss);
      var found = false;
      entries = entries.map(function (x) { if (x.id === e.id) { found = true; return e; } return x; });
      if (!found) entries.push(e);
      writeEntries(ss, entries);
      return;
    }
    case 'removeEntry':
      writeEntries(ss, readEntries(ss).filter(function (x) { return x.id !== op.id && x.source !== op.id; }));
      return;
    case 'saveRecipe': {
      var src = op.recipe || {};
      var recipe = {
        name: str(src.name),
        notes: str(src.notes),
        tags: cleanTags(src.tags),
        favorite: !!src.favorite,
        ingredients: (src.ingredients || []).map(cleanArticle).filter(function (i) { return i.name; }),
      };
      if (!recipe.name) return;
      var old = norm(op.oldName || recipe.name);
      var target = norm(recipe.name);
      var placed = false;
      var next = [];
      readRecipes(ss).forEach(function (r) {
        var n = norm(r.name);
        if (n === old || n === target) {
          if (!placed) next.push(recipe);
          placed = true;
        } else next.push(r);
      });
      if (!placed) next.push(recipe);
      writeRecipes(ss, next);
      var changed = false;
      var renamed = readEntries(ss).map(function (x) {
        if (x.kind !== 'texte' && norm(x.label) === old && x.label !== recipe.name) { changed = true; x.label = recipe.name; }
        return x;
      });
      if (changed) writeEntries(ss, renamed);
      return;
    }
    case 'deleteRecipe': {
      var gone = norm(op.name);
      writeRecipes(ss, readRecipes(ss).filter(function (r) { return norm(r.name) !== gone; }));
      var all = readEntries(ss);
      var ids = {};
      all.forEach(function (x) { if (x.kind === 'recette' && norm(x.label) === gone && x.date >= str(op.from)) ids[x.id] = true; });
      if (Object.keys(ids).length) writeEntries(ss, all.filter(function (x) { return !ids[x.id] && !ids[x.source]; }));
      return;
    }
    case 'setFavorite': {
      var fn = norm(op.name);
      writeRecipes(ss, readRecipes(ss).map(function (r) { if (norm(r.name) === fn) r.favorite = !!op.on; return r; }));
      return;
    }
    case 'newList': {
      var start = str(op.start);
      var end = str(op.end);
      if (!start || !end || end < start) return;
      var extras = [];
      (op.extras || []).map(cleanArticle).filter(function (a) { return a.name; }).forEach(function (a) { extras = upsertArticle(extras, a); });
      var sh = tab(ss, 'liste');
      sh.getRange(2, 1, 1, 2).setValues([[start, end]]);
      writeStates(ss, []);
      writeRows(sh, 10, 4, articleRows(extras));
      return;
    }
    case 'setState': {
      var key = itemKey(op.name, op.unit);
      var states = readListe(ss).states.filter(function (s) { return itemKey(s.name, s.unit) !== key; });
      if (op.state === 'dispo' || op.state === 'achete') states.push({ name: str(op.name), unit: str(op.unit), state: op.state, qty: op.state === 'achete' ? round4(num(op.qty)) : 0 });
      writeStates(ss, states);
      return;
    }
    case 'clearStates':
      writeStates(ss, []);
      return;
    case 'setExclu': {
      var ex = tab(ss, 'exclus');
      var n = norm(op.name);
      var kept = readRows(ex, 1, 2).filter(function (r) { return norm(r[0]) !== n; });
      if (op.on && n) kept.push([str(op.name), '']);
      writeRows(ex, 1, 2, kept);
      return;
    }
    case 'setExtra':
    case 'removeExtra':
    case 'setHabitual':
    case 'removeHabitual': {
      var isExtra = op.type === 'setExtra' || op.type === 'removeExtra';
      var target2 = isExtra ? tab(ss, 'liste') : tab(ss, 'habituels');
      var col = isExtra ? 10 : 1;
      var list = readArticles(target2, col);
      if (op.type === 'setExtra' || op.type === 'setHabitual') {
        var a = cleanArticle(op.type === 'setExtra' ? op.extra : op.item);
        if (!a.name) return;
        list = upsertArticle(list, a);
      } else {
        var rk = itemKey(op.name, op.unit);
        list = list.filter(function (x) { return itemKey(x.name, x.unit) !== rk; });
      }
      writeRows(target2, col, 4, articleRows(list));
      return;
    }
    case 'setRayons':
      writeRows(tab(ss, 'rayons'), 1, 1, cleanTags(op.rayons).map(function (r) { return [r]; }));
      return;
    case 'writeCourses':
      writeRows(tab(ss, 'courses'), 1, 6, (op.rows || []).map(function (r) { return [0, 1, 2, 3, 4, 5].map(function (i) { return r[i] == null ? '' : r[i]; }); }));
      tab(ss, 'liste').getRange(2, 3).setValue(str(op.hash));
      return;
  }
}

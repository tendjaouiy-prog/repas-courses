/**
 * Repas & courses : passerelle entre l'appli et ce Google Sheet.
 *
 * Installation (une seule fois) :
 *  1. Dans le Sheet : Extensions > Apps Script. Remplacer tout le contenu par ce fichier.
 *  2. Changer CODE ci-dessous (un mot de passe au choix, sans espace).
 *  3. Déployer > Nouveau déploiement > type « Application Web »,
 *     Exécuter en tant que : Moi, Qui a accès : Tout le monde. Autoriser.
 *  4. Copier l'URL (elle finit par /exec) et la coller dans l'appli, avec le code.
 *
 * Après une modification de ce fichier : Déployer > Gérer les déploiements >
 * crayon > Version : Nouvelle version > Déployer (l'URL ne change pas).
 */
var CODE = 'CHANGE-MOI';

var VERSION = 2;
var TAB_PLANNING = 'Planning';
var TAB_EXCLUS = 'Exclus';
var TAB_ETATS = 'État courses';
var TAB_AJOUTS = 'Ajouts';
var TAB_HISTORIQUE = 'Historique';
var HISTORY_MAX = 1500;
var DEFAULT_PERSONS = 2;

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

function recipesSheet(ss) {
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var n = sheets[i].getName();
    if (n.indexOf('Recettes') !== -1 && n.indexOf('Liste') === -1) return sheets[i];
  }
  throw new Error("Onglet « Recettes » introuvable");
}

function sheetOrCreate(ss, name, header) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, header.length).setValues([header]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function etatsSheet(ss) {
  return sheetOrCreate(ss, TAB_ETATS, ['Ingrédient', 'Unité', 'État']);
}

function ajoutsSheet(ss) {
  return sheetOrCreate(ss, TAB_AJOUTS, ['Article', 'Quantité', 'Unité', 'Rayon']);
}

function historySheet(ss) {
  var existed = ss.getSheetByName(TAB_HISTORIQUE);
  var sh = sheetOrCreate(ss, TAB_HISTORIQUE, ['Semaine archivée le', 'Jour', 'Repas', 'Recette', 'Pers.']);
  // colonne A en texte, sinon Sheets transforme « 2026-11-12 21:40 » en date
  if (!existed) sh.getRange(1, 1, sh.getMaxRows(), 1).setNumberFormat('@');
  return sh;
}

function weekText(ss, v) {
  if (Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm');
  return str(v);
}

function readHistory(ss) {
  return readRows(historySheet(ss), 1, 5)
    .filter(function (r) { return str(r[3]); })
    .map(function (r) {
      return { week: weekText(ss, r[0]), day: str(r[1]), meal: norm(r[2]) === 'soir' ? 'soir' : 'midi', recipe: str(r[3]), persons: num(r[4]) || DEFAULT_PERSONS };
    })
    .slice(-HISTORY_MAX);
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

// ---------- lecture ----------

function readRecipes(ss) {
  var rows = readRows(recipesSheet(ss), 1, 7); // A à G (F = total auto, ignoré)
  var recipes = [];
  var cur = null;
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var name = str(r[0]);
    var ing = str(r[1]);
    var note = str(r[6]);
    if (name) {
      cur = { name: name, notes: '', ingredients: [] };
      recipes.push(cur);
    }
    if (!cur) continue;
    if (ing) cur.ingredients.push({ name: ing, qty: num(r[2]), unit: str(r[3]), rayon: str(r[4]) });
    if (note) cur.notes = cur.notes ? cur.notes + '\n' + note : note;
  }
  return recipes;
}

function writeRecipes(ss, recipes) {
  var ae = [];
  var g = [];
  for (var i = 0; i < recipes.length; i++) {
    var r = recipes[i];
    if (i > 0) {
      ae.push(['', '', '', '', '']);
      g.push(['']);
    }
    var n = Math.max(1, r.ingredients.length);
    for (var j = 0; j < n; j++) {
      var ing = r.ingredients[j];
      ae.push([j === 0 ? r.name : '', ing ? ing.name : '', ing ? ing.qty : '', ing ? ing.unit : '', ing ? ing.rayon : '']);
      g.push([j === 0 ? r.notes : '']);
    }
  }
  var sh = recipesSheet(ss);
  // F (total) et H (recette) sont des formules : on n'écrit que A à E et G
  writeRows(sh, 1, 5, ae);
  writeRows(sh, 7, 1, g);
}

function readPlan(ss) {
  var v = ss.getSheetByName(TAB_PLANNING).getRange(2, 1, 7, 5).getValues();
  var plan = [];
  for (var i = 0; i < 7; i++) {
    plan.push({
      day: str(v[i][0]),
      midi: { recipe: str(v[i][1]), persons: num(v[i][2]) || DEFAULT_PERSONS },
      soir: { recipe: str(v[i][3]), persons: num(v[i][4]) || DEFAULT_PERSONS },
    });
  }
  return plan;
}

function readState(ss) {
  var exclus = readRows(ss.getSheetByName(TAB_EXCLUS), 1, 1)
    .map(function (r) { return str(r[0]); })
    .filter(function (s) { return s; });
  var states = readRows(etatsSheet(ss), 1, 3)
    .filter(function (r) { return str(r[0]) && str(r[2]); })
    .map(function (r) { return { name: str(r[0]), unit: str(r[1]), state: str(r[2]) }; });
  var extras = readRows(ajoutsSheet(ss), 1, 4)
    .filter(function (r) { return str(r[0]); })
    .map(function (r) { return { name: str(r[0]), qty: num(r[1]), unit: str(r[2]), rayon: str(r[3]) }; });
  return { recipes: readRecipes(ss), plan: readPlan(ss), exclus: exclus, states: states, extras: extras, history: readHistory(ss) };
}

// ---------- modifications (mêmes règles que applyOp dans l'appli) ----------

function cleanIngredient(i) {
  return { name: str(i.name), qty: Math.round(num(i.qty) * 10000) / 10000, unit: str(i.unit), rayon: str(i.rayon) };
}

function applyOp(ss, op) {
  var planning = ss.getSheetByName(TAB_PLANNING);
  switch (op.type) {
    case 'setPlan': {
      if (!(op.day >= 0 && op.day <= 6)) return;
      var col = op.meal === 'soir' ? 4 : 2;
      if (op.recipe !== undefined) planning.getRange(2 + op.day, col).setValue(str(op.recipe));
      if (op.persons !== undefined) planning.getRange(2 + op.day, col + 1).setValue(num(op.persons));
      return;
    }
    case 'saveRecipe': {
      var recipe = {
        name: str(op.recipe.name),
        notes: str(op.recipe.notes),
        ingredients: (op.recipe.ingredients || []).map(cleanIngredient).filter(function (i) { return i.name; }),
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
      replaceInPlan(planning, old, recipe.name);
      return;
    }
    case 'deleteRecipe': {
      var gone = norm(op.name);
      writeRecipes(ss, readRecipes(ss).filter(function (r) { return norm(r.name) !== gone; }));
      replaceInPlan(planning, gone, '');
      return;
    }
    case 'setState': {
      var key = itemKey(op.name, op.unit);
      var sh = etatsSheet(ss);
      var rows = readRows(sh, 1, 3).filter(function (r) { return itemKey(r[0], r[1]) !== key; });
      if (op.state) rows.push([str(op.name), str(op.unit), str(op.state)]);
      writeRows(sh, 1, 3, rows);
      return;
    }
    case 'clearStates':
      writeRows(etatsSheet(ss), 1, 3, []);
      return;
    case 'setExclu': {
      var ex = ss.getSheetByName(TAB_EXCLUS);
      var n = norm(op.name);
      var kept = readRows(ex, 1, 2).filter(function (r) { return norm(r[0]) !== n; });
      if (op.on && n) kept.push([str(op.name), '']);
      writeRows(ex, 1, 2, kept);
      return;
    }
    case 'setExtra': {
      var e = cleanIngredient(op.extra);
      if (!e.name) return;
      var k = itemKey(e.name, e.unit);
      var aj = ajoutsSheet(ss);
      var list = readRows(aj, 1, 4).filter(function (r) { return itemKey(r[0], r[2]) !== k; });
      list.push([e.name, e.qty || '', e.unit, e.rayon]);
      writeRows(aj, 1, 4, list);
      return;
    }
    case 'removeExtra': {
      var rk = itemKey(op.name, op.unit);
      var sheet = ajoutsSheet(ss);
      writeRows(sheet, 1, 4, readRows(sheet, 1, 4).filter(function (r) { return itemKey(r[0], r[2]) !== rk; }));
      return;
    }
    case 'newWeek': {
      // les repas planifiés partent dans l'historique avant que la semaine soit vidée
      var hist = historySheet(ss);
      var lines = readRows(hist, 1, 5).map(function (r) { return [weekText(ss, r[0]), r[1], r[2], r[3], r[4]]; });
      var before = lines.length;
      readPlan(ss).forEach(function (d) {
        if (d.midi.recipe) lines.push([str(op.date), d.day, 'Midi', d.midi.recipe, d.midi.persons]);
        if (d.soir.recipe) lines.push([str(op.date), d.day, 'Soir', d.soir.recipe, d.soir.persons]);
      });
      if (lines.length > before) writeRows(hist, 1, 5, lines.slice(-HISTORY_MAX));
      planning.getRange(2, 2, 7, 1).clearContent();
      planning.getRange(2, 4, 7, 1).clearContent();
      writeRows(etatsSheet(ss), 1, 3, []);
      writeRows(ajoutsSheet(ss), 1, 4, []);
      return;
    }
  }
}

/** Renomme (ou retire, si to = '') une recette dans les cases Midi et Soir du planning. */
function replaceInPlan(planning, fromNorm, to) {
  [2, 4].forEach(function (col) {
    var range = planning.getRange(2, col, 7, 1);
    var values = range.getValues();
    var changed = false;
    for (var i = 0; i < values.length; i++) {
      var v = str(values[i][0]);
      if (v && norm(v) === fromNorm && v !== to) {
        values[i][0] = to;
        changed = true;
      }
    }
    if (changed) range.setValues(values);
  });
}

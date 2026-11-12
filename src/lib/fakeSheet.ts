// Faux Google Sheet en mémoire, juste assez pour exécuter apps-script/Code.gs dans les tests.
type Cell = string | number;

class FakeRange {
  constructor(private sh: FakeSheet, private row: number, private col: number, private nr: number, private nc: number) {}
  getValues(): Cell[][] {
    const out: Cell[][] = [];
    for (let r = 0; r < this.nr; r++) {
      const line: Cell[] = [];
      for (let c = 0; c < this.nc; c++) line.push(this.sh.get(this.row + r, this.col + c));
      out.push(line);
    }
    return out;
  }
  setValues(values: Cell[][]) {
    if (values.length !== this.nr || values.some((v) => v.length !== this.nc)) throw new Error('dimensions');
    values.forEach((line, r) => line.forEach((v, c) => this.sh.set(this.row + r, this.col + c, v)));
    return this;
  }
  setValue(v: Cell) {
    this.sh.set(this.row, this.col, v);
    return this;
  }
  setNumberFormat() {
    return this;
  }
  clearContent() {
    for (let r = 0; r < this.nr; r++) for (let c = 0; c < this.nc; c++) this.sh.set(this.row + r, this.col + c, '');
    return this;
  }
}

export class FakeSheet {
  cells = new Map<string, Cell>();
  constructor(public name: string, public maxRows = 50) {}
  getName() {
    return this.name;
  }
  getMaxRows() {
    return this.maxRows;
  }
  insertRowsAfter(_after: number, n: number) {
    this.maxRows += n;
  }
  setFrozenRows() {}
  get(r: number, c: number): Cell {
    return this.cells.get(`${r},${c}`) ?? '';
  }
  set(r: number, c: number, v: Cell) {
    if (r > this.maxRows) throw new Error('hors feuille');
    this.cells.set(`${r},${c}`, v);
  }
  getRange(row: number, col: number, nr = 1, nc = 1) {
    return new FakeRange(this, row, col, nr, nc);
  }
  fill(rows: Cell[][], firstRow = 1) {
    rows.forEach((line, r) => line.forEach((v, c) => this.set(firstRow + r, c + 1, v)));
    return this;
  }
}

export class FakeSpreadsheet {
  sheets: FakeSheet[] = [];
  getSheets() {
    return this.sheets;
  }
  getSheetByName(name: string) {
    return this.sheets.find((s) => s.name === name) ?? null;
  }
  insertSheet(name: string) {
    const s = new FakeSheet(name);
    this.sheets.push(s);
    return s;
  }
}

/** Le Sheet « Repas course » après sa mise à jour pour la version 2 (recettes d'exemple). */
export function sampleSpreadsheet(): FakeSpreadsheet {
  const ss = new FakeSpreadsheet();
  ss.insertSheet('📖 Recettes').fill([
    ['🍲 Recette', '🥕 Ingrédient', '⚖️ Qté / 1 portion', 'Unité', '🛒 Rayon', '📝 Notes / lien', '🏷️ Étiquettes', '⭐ Favori'],
    ['Pâtes bolognaise', 'Pâtes', 125, 'g', 'Épicerie'],
    ['', 'Bœuf haché', 100, 'g', 'Boucherie'],
    ['', 'Sauce tomate', 0.25, 'pot', 'Épicerie'],
    ['', 'Oignon', 0.25, 'pièce', 'Fruits & légumes'],
    [],
    ['Poulet curry riz', 'Blanc de poulet', 150, 'g', 'Boucherie'],
    ['', 'Riz', 80, 'g', 'Épicerie'],
    ['', 'Lait de coco', 0.25, 'brique', 'Épicerie'],
    ['', 'Oignon', 0.25, 'pièce', 'Fruits & légumes'],
    ['', 'Curry', 0.5, 'c. à soupe', 'Épices'],
    [],
    ['Omelette salade', 'Œufs', 3, 'pièce', 'Crèmerie'],
    ['', 'Salade', 0.25, 'pièce', 'Fruits & légumes'],
    ['', 'Tomates', 1, 'pièce', 'Fruits & légumes'],
  ]);
  ss.insertSheet('Courses').fill([['Rayon', 'Article', 'Quantité', 'Unité', 'État', 'Pour']]);
  ss.insertSheet('Exclus').fill([
    ['🚫 À ne pas envoyer', '📝 Note'],
    ['Sel', 'toujours en stock'],
    ["Huile d'olive", 'toujours en stock'],
  ]);
  return ss;
}

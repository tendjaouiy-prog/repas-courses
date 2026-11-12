export interface Ingredient {
  name: string;
  /** quantité pour 1 personne */
  qty: number;
  unit: string;
  rayon: string;
}

export interface Recipe {
  name: string;
  notes: string;
  tags: string[];
  favorite: boolean;
  ingredients: Ingredient[];
}

export type Meal = 'midi' | 'soir';

/** recette : à cuisiner ; texte : « Resto », sans courses ; restes : reprend un repas cuisiné plus tôt */
export type EntryKind = 'recette' | 'texte' | 'restes';

/** Un élément planifié dans une case du planning (une case peut en avoir plusieurs). */
export interface Entry {
  id: string;
  /** AAAA-MM-JJ */
  date: string;
  meal: Meal;
  kind: EntryKind;
  /** nom de la recette (recette, restes) ou texte libre */
  label: string;
  /** 0 pour un texte */
  persons: number;
  /** restes : id de l'élément « recette » d'origine */
  source: string;
}

/** Article hors recette : ajout à la liste ou article habituel. */
export interface Article {
  name: string;
  qty: number;
  unit: string;
  rayon: string;
}

/** '' = à acheter, 'dispo' = déjà à la maison, 'achete' = dans le caddie */
export type ItemState = '' | 'dispo' | 'achete';

export interface StateRow {
  name: string;
  unit: string;
  state: ItemState;
  /** quantité prise au moment de cocher (pour afficher un complément si le besoin augmente) */
  qty: number;
}

export interface ShopList {
  /** AAAA-MM-JJ, '' tant qu'aucune liste n'a été créée */
  start: string;
  end: string;
}

export interface AppData {
  recipes: Recipe[];
  entries: Entry[];
  list: ShopList;
  states: StateRow[];
  extras: Article[];
  habituels: Article[];
  /** ordre des rayons dans le magasin */
  rayons: string[];
  /** ingrédients toujours en stock : jamais dans la liste */
  exclus: string[];
  /** empreinte de la liste recopiée dans l'onglet Courses du Sheet */
  coursesHash: string;
}

export type Op =
  | { type: 'setEntry'; entry: Entry }
  | { type: 'removeEntry'; id: string }
  | { type: 'saveRecipe'; oldName: string; recipe: Recipe }
  | { type: 'deleteRecipe'; name: string; from: string }
  | { type: 'setFavorite'; name: string; on: boolean }
  | { type: 'newList'; start: string; end: string; extras: Article[] }
  | { type: 'setState'; name: string; unit: string; state: ItemState; qty: number }
  | { type: 'clearStates' }
  | { type: 'setExclu'; name: string; on: boolean }
  | { type: 'setExtra'; extra: Article }
  | { type: 'removeExtra'; name: string; unit: string }
  | { type: 'setHabitual'; item: Article }
  | { type: 'removeHabitual'; name: string; unit: string }
  | { type: 'setRayons'; rayons: string[] }
  | { type: 'writeCourses'; rows: (string | number)[][]; hash: string };

export type ItemStatus = 'todo' | 'dispo' | 'done';

export interface ShoppingItem {
  key: string;
  name: string;
  unit: string;
  rayon: string;
  /** quantité nécessaire sur la période */
  need: number;
  /** reste à acheter (le complément si une partie a déjà été prise) */
  toBuy: number;
  /** quantité déjà prise, quand un complément est à racheter */
  bought: number;
  status: ItemStatus;
  /** recettes qui en ont besoin */
  sources: string[];
  extra: boolean;
}

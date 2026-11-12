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
  ingredients: Ingredient[];
}

export interface Slot {
  recipe: string;
  persons: number;
}

export type Meal = 'midi' | 'soir';

export interface DayPlan {
  day: string;
  midi: Slot;
  soir: Slot;
}

/** '' = à acheter, 'dispo' = déjà à la maison, 'achete' = dans le caddie */
export type ItemState = '' | 'dispo' | 'achete';

export interface StateRow {
  name: string;
  unit: string;
  state: ItemState;
}

export interface Extra {
  name: string;
  qty: number;
  unit: string;
  rayon: string;
}

/** Un repas d'une semaine passée, archivé par « Nouvelle semaine ». */
export interface HistoryRow {
  /** date et heure de l'archivage, « AAAA-MM-JJ HH:MM » : identifie la semaine */
  week: string;
  day: string;
  meal: Meal;
  recipe: string;
  persons: number;
}

export interface AppData {
  recipes: Recipe[];
  plan: DayPlan[];
  /** ingrédients toujours en stock : jamais dans la liste */
  exclus: string[];
  states: StateRow[];
  extras: Extra[];
  history: HistoryRow[];
}

export type Op =
  | { type: 'setPlan'; day: number; meal: Meal; recipe?: string; persons?: number }
  | { type: 'saveRecipe'; oldName: string; recipe: Recipe }
  | { type: 'deleteRecipe'; name: string }
  | { type: 'setState'; name: string; unit: string; state: ItemState }
  | { type: 'clearStates' }
  | { type: 'setExclu'; name: string; on: boolean }
  | { type: 'setExtra'; extra: Extra }
  | { type: 'removeExtra'; name: string; unit: string }
  | { type: 'newWeek'; date: string };

export interface ShoppingItem {
  key: string;
  name: string;
  unit: string;
  rayon: string;
  qty: number;
  state: ItemState;
  /** recettes qui en ont besoin (vide pour un ajout manuel seul) */
  sources: string[];
  extra: boolean;
}

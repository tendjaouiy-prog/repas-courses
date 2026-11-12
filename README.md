# Repas & courses

Appli web installable (iPhone et Android) pour le foyer : recettes, planning de la semaine et liste de courses, partagés entre deux téléphones. Toutes les données vivent dans le Google Sheet « Repas course » ; ce dépôt ne contient que le code.

## Ce que fait l'appli

- **Recettes** : créer, modifier, supprimer, avec étiquettes (rapide, végé…) et favoris. Quantités saisies pour le nombre de personnes voulu, enregistrées pour 1 personne.
- **Planning daté** : semaine par semaine avec des flèches, midi et soir. Une case peut contenir plusieurs recettes (chacune avec son nombre de personnes), un mot libre sans courses (« Resto ») ou des restes d'un repas des 3 jours précédents (le repas d'origine est alors compté pour plus de personnes). Les semaines passées servent d'historique et peuvent être recopiées.
- **Idées** : favoris en premier, filtre par étiquette, tri « pas faites depuis longtemps ».
- **Courses** : « Nouvelle liste » le jour des grosses courses (repas des 7 jours suivants, période modifiable, articles habituels à cocher). Rangée dans l'ordre du magasin. Chaque article peut être coché, marqué « déjà dispo » jusqu'à la liste suivante, ou « toujours en stock ». Pour la petite course, ce qui n'est pas coché est ce qui manque ; si un besoin augmente après les grosses courses, seul le complément s'affiche.
- **Hors ligne** : les coches faites sans réseau partent dès qu'il revient.

## Comment ça marche

```
téléphones (appli web)  ⇄  script Apps Script du Sheet  ⇄  Google Sheet
```

`apps-script/Code.gs` est collé dans le Sheet et déployé en « Application Web ». L'appli lui envoie de petites modifications (`setPlan`, `saveRecipe`, `setState`…) et reçoit l'état complet. Un code choisi à l'installation protège l'accès.

Onglets : `📖 Recettes` (A recette, B ingrédient, C quantité pour 1, D unité, E rayon, F notes, G étiquettes, H favori), `Repas` (une ligne par élément planifié : date, midi/soir, type, recette ou texte, personnes, restes de, id), `Courses` (copie lisible de la liste en cours, écrite par l'appli), `Habituels`, `Rayons` (ordre du magasin), `Exclus` (toujours en stock) et `Liste` (technique : période, coches, ajouts). Les onglets absents sont créés par le script.

## Mise en route

1. Dépôt GitHub : Settings → Pages → Source : **GitHub Actions**. Chaque push sur `main` publie l'appli.
2. Ouvrir l'appli → Réglages, et suivre les 5 étapes (copier le script, le déployer dans le Sheet, coller l'URL).
3. Réglages → « Relier l'autre téléphone » : envoyer le lien, l'ouvrir sur l'autre téléphone.
4. Sur chaque téléphone, ajouter la page à l'écran d'accueil.

Si `apps-script/Code.gs` change : le recoller dans le Sheet puis Déployer → Gérer les déploiements → crayon → Nouvelle version.

## Développement

```
npm install
npm test          # logique + vrai Code.gs exécuté sur un faux Sheet
npm run dev
npx vite-node tools/mock-server.ts   # faux script : URL http://localhost:8787/exec, code « test »
```

`applyOp` (`src/lib/logic.ts`) et `applyOp` de `Code.gs` appliquent les mêmes règles ; `src/lib/script.test.ts` vérifie qu'ils donnent le même résultat. Toute nouvelle modification doit rester rejouable sans effet (elle peut être renvoyée après une coupure réseau).

# Repas & courses

Appli web installable (iPhone et Android) pour le foyer : recettes, planning de la semaine et liste de courses, partagés entre deux téléphones. Toutes les données vivent dans le Google Sheet « Repas course » ; ce dépôt ne contient que le code.

## Ce que fait l'appli

- **Recettes** : créer, modifier, supprimer. Quantités saisies pour le nombre de personnes voulu, enregistrées pour 1 personne.
- **Planning** : une recette par repas (midi, soir) sur 7 jours, avec le nombre de personnes de chaque repas.
- **Historique** : « Nouvelle semaine » archive les repas planifiés avant de vider le planning. On peut relire les semaines passées, en reprendre les repas, et trier les recettes par « pas faites depuis longtemps » pour trouver des idées.
- **Courses** : liste calculée depuis le planning, regroupée par rayon. Chaque article peut être coché (dans le caddie), marqué « déjà dispo » pour la semaine, ou « toujours en stock » (jamais proposé). Ajouts manuels possibles.
- **Hors ligne** : les coches faites sans réseau partent dès qu'il revient.

## Comment ça marche

```
téléphones (appli web)  ⇄  script Apps Script du Sheet  ⇄  Google Sheet
```

`apps-script/Code.gs` est collé dans le Sheet et déployé en « Application Web ». L'appli lui envoie de petites modifications (`setPlan`, `saveRecipe`, `setState`…) et reçoit l'état complet. Un code choisi à l'installation protège l'accès.

Onglets utilisés : `Planning` (B à E), `📖 Recettes` (A à E et G ; F et H sont des formules, jamais écrites), `Exclus` (toujours en stock). Le script crée `État courses` (coches et « déjà dispo »), `Ajouts` (articles manuels) et `Historique` (une ligne par repas archivé). L'onglet `Courses` du Sheet continue de fonctionner tout seul.

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

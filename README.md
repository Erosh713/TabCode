# TabCode

**Un éditeur de code façon VS Code pour tablette et téléphone — hors ligne, gratuit et open source.**
*A VS Code–style code editor for tablets and phones — offline, free and open source. [English below](#english).*

👉 **Ouvrir l'appli : https://erosh713.github.io/TabCode/**

---

## Ce que fait TabCode

- **Le moteur d'édition de VS Code** (Monaco) : coloration, autocomplétion, erreurs soulignées, multi-curseurs, Ctrl+P, Ctrl+Shift+P…
- **Emmet** : `!`, `link:css`, `div.carte`, `ul>li*3`… puis <kbd>Tab</kbd>.
- **Aperçu en direct** à côté du code + **Live Server** dans une fenêtre séparée (parfait en écran partagé).
- **Console** intégrée : `console.log`, erreurs, et tu peux exécuter du JavaScript dans la page.
- **Fonctionne hors ligne** et **s'installe** comme une vraie appli (écran d'accueil).
- **Extensions** activables : Prettier, Auto Rename Tag, Error Lens, indent-rainbow, Material Icon Theme, Path Intellisense, Color Highlight, CSS Peek, Image Preview, Snippets perso, thèmes (One Dark Pro, Dracula, Monokai, GitHub…).
- **GitHub** : chaque projet dans un dépôt privé, synchro tablette ↔ téléphone, choix fichier par fichier en cas de conflit, bouton **Publier mon site** (GitHub Pages).
- **Corbeille** de 30 jours, plusieurs projets, import/export `.zip`.
- **Tablette, téléphone, clavier physique ou tactile** : barre de touches spéciales (Tab, Échap, `< > { }`…) quand le clavier à l'écran est ouvert.
- Interface en **français** et en **anglais**.

## L'installer sur ta tablette ou ton téléphone

1. Ouvre **https://erosh713.github.io/TabCode/** dans Chrome, Brave, Edge ou Samsung Internet.
2. Menu du navigateur (⋮) → **Installer l'application** / **Ajouter à l'écran d'accueil**.
3. C'est tout : TabCode s'ouvre ensuite depuis son icône, même sans internet.

## Connecter GitHub (facultatif)

Dans TabCode : icône **GitHub** à gauche → **Se connecter avec un jeton**, puis suis les étapes affichées.
Le jeton se crée ici : <https://github.com/settings/personal-access-tokens/new>

| Réglage | Valeur |
|---|---|
| Repository access | All repositories |
| Permissions → Administration | Read and write |
| Permissions → Contents | Read and write |
| Permissions → Pages | Read and write |

Le jeton reste sur ton appareil et n'est envoyé qu'à `api.github.com`.

## Confidentialité

TabCode ne collecte aucune donnée et n'a pas de serveur : tes projets restent dans ton navigateur (IndexedDB). Rien n'est envoyé ailleurs que vers GitHub, et seulement quand tu synchronises ou publies.

## Développement

Aucune étape de compilation : ce sont des fichiers statiques (HTML, CSS, modules JavaScript).

```bash
python3 tools/build.py          # liste des fichiers hors ligne + nouvelle version du service worker
python3 -m http.server 8000     # puis ouvre http://localhost:8000/
python3 tools/i18n-keys.py --check   # vérifie que toutes les traductions anglaises existent
```

| Fichier | Rôle |
|---|---|
| `js/app.js` | projets, éditeur, explorateur, aperçu, console, commandes |
| `js/extensions.js` | onglet Extensions et les extensions |
| `js/github.js` | synchro GitHub, conflits, publication |
| `js/keybar.js` | barre de touches pour le clavier tactile |
| `js/themes.js` | thèmes de couleur |
| `js/i18n-en.js` | traduction anglaise |
| `sw.js` | hors ligne + Live Server |

## Licences

TabCode est sous licence **MIT** (voir [LICENSE](LICENSE)). Les bibliothèques incluses dans `vendor/` gardent leur licence : voir [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).
TabCode n'est pas affilié à Microsoft ni à Visual Studio Code.

---

## English

**TabCode** is a free, open-source, offline-capable code editor for tablets and phones, built on Monaco (the editor that powers VS Code).

- Emmet, live preview, Live Server window, built-in console
- Installable PWA that works offline
- Extensions you can toggle: Prettier, Auto Rename Tag, Error Lens, indent-rainbow, Material Icon Theme, Path Intellisense, Color Highlight, CSS Peek, Image Preview, custom snippets, color themes
- GitHub: one private repository per project, sync between devices with per-file conflict resolution, one-click publishing to GitHub Pages
- 30-day trash, multiple projects, `.zip` import/export
- Touch key bar (Tab, Esc, brackets…) for on-screen keyboards
- French and English interface (Settings → Language)

**Open it:** https://erosh713.github.io/TabCode/ — then use your browser's “Install app” menu.

No build step: static files only. Run `python3 tools/build.py` before each release to refresh the offline file list and the service worker version.

MIT licensed. Third-party licenses: [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md). Not affiliated with Microsoft or Visual Studio Code.

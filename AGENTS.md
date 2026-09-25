# AGENTS.md

Guidance for coding agents working in this repository. Human contributors should start with [CONTRIBUTING.md](CONTRIBUTING.md).

Tags Color Files is an Obsidian community plugin. It colors files in the file explorer by the tags they contain, following rules the user creates. It can also color file names in Bases views and wikilinks inside notes.


## Commands

```
npm install
npm run dev      # watching build: rebuilds main.js on every change
npm run build    # tsc type-check + production bundle
npm run lint     # eslint (TypeScript) + stylelint (styles.css)
```

Both linters run the rule sets of Obsidian's community plugin review: ESLint uses `eslint-plugin-obsidianmd`'s recommended preset (type-aware, see `eslint.config.mjs`), stylelint uses `stylelint-config-obsidianmd`. A warning here is one the review would report, so fix it rather than disabling the rule.

There are no automated tests. Before calling a change done, `npm run build` and `npm run lint` must both pass. Neither of them runs the plugin, so say what you could not check inside Obsidian and what the user should try by hand.


## Layout

| File | What it holds |
| --- | --- |
| `main.ts` | The whole plugin: coloring of the explorer, Bases and links, the editor extension, and the settings tab. |
| `styles.css` | All styles. Its comments record the CSS specificity each rule has to beat. |
| `changelog.ts` | The in-app changelog window and the "what's new" notice at the top of the settings. |
| `locales/en.ts`, `locales/ru.ts`, `locales-list.ts` | Interface strings and the `t()` lookup. |
| `CHANGELOG_RU.md`, `CHANGELOG.md` | The changelogs. Both are bundled into `main.js` and shown inside the plugin. |
| `manifest.json`, `versions.json` | Plugin metadata. `minAppVersion` is 1.13.0. |

`main.js` and `data.json` are build output and user data, and both are gitignored. Do not commit them.


## Obsidian API

- Check an API against `node_modules/obsidian/obsidian.d.ts` before using it, including its `@since` tag against `minAppVersion`.
- Popout windows share the plugin's JavaScript context. Do not assume `document` is the only document: `getDocuments()` in `main.ts` lists them all. Use Obsidian's `el.doc` / `el.win` rather than globals.
- The settings tab is built with the declarative API (`getSettingDefinitions()`). It hosts a single render-only row, into which the plugin draws its own DOM.


## How coloring works

Performance and stability depend on the rules below. Keep them intact.

1. **Colors are cached per note path.** Everything that shows a note's color — explorer rows, Bases, reading-view links, editor links — reads it through `getFileColors()`. `onFileChanged()` depends on this: a note missing from the cache is shown nowhere, so its change can be skipped. Never compute colors around the cache. `normalizeRules()` clears the cache whenever the rules change.
2. **Metadata changes are handled per file.** A metadata `changed` event recomputes only that note, and stops if its colors are the same as before. Do not turn it back into a full recolor: that event fires on every autosave while the user types.
3. **Explorer rows are colored when they are rendered.** `explorerObserver` watches only file-explorer leaves and colors rows inside the MutationObserver callback, before the browser paints. Do not add a debounce there, or rows appear uncolored for a moment. Do not observe `body` for explorer rows.
4. **Redrawing a row is skipped when nothing changed.** `colorExplorerRow()` stores what the row shows in `data-tag-colors` and returns early when that matches. Anything that changes how a row looks (strategy, dot size, dot position, colors) must be part of that string.
5. **The observers must not react to the plugin's own output.** Coloring changes only classes and custom properties, which the observers do not watch. The one exception is the dots container, which the explorer callback skips. Any new DOM the plugin adds inside an observed tree must be skipped the same way.
6. **A full recolor (`refreshAll()`) runs only** on settings save, rename, note create or delete, and once when the metadata cache first finishes loading. Bursts go through the `requestRefresh` debounce. `refreshAll()` also dispatches to every open editor, so keep it off hot paths.
7. **Editor links** are a CodeMirror `ViewPlugin` (`buildLinkColorExtension`). It rebuilds on document, viewport or syntax-tree changes, and when it receives the `refreshLinkColors` effect. Marks are shared per color through `getLinkMark()`.

In the settings tab, `saveSettings()` replaces the `generalRules` array. Rule rows capture that array in closures, so rows have to be rebuilt (`rerender()`) after a save. See the drag handlers and `saveReorder`.


## Conventions

- **Code style.** Tabs, double quotes. Comments explain why, in full sentences; match the density of the surrounding code.
- **Interface strings** go through `t()`. Add every new key to both `locales/en.ts` and `locales/ru.ts`.
- **CSS.** Rules are checked by `stylelint-config-obsidianmd` against Electron 39. Many rules exist to out-rank a specific Obsidian selector; read the comment above a rule before changing or reordering it.
- **Versions.** Do not bump them unless asked. CI (`.github/workflows/main.yml`) releases automatically when `manifest.json`'s version changes on `main`. It requires `package.json` to carry the same version, and takes the release notes from that version's section in `CHANGELOG.md`.


## Changelogs

- `CHANGELOG_RU.md` is the authoritative changelog; `CHANGELOG.md` is its English translation. Write new entries in Russian first, then mirror them in English. When the two differ, change the English to match.
- The newest version heading in both files is the upcoming release. Add entries under it rather than starting a new version.
- Section headings: «Новые функции» / "New features" and «Улучшения и исправления багов» / "Improvements and bug fixes".
- List only changes a user can notice. A fix to something that has never been released is not a changelog entry.

Writing Russian text (changelog, `locales/ru.ts`, `README_RU.md`):

- Write natural Russian, not a word-for-word translation of English.
- Avoid repeating a root within one sentence.
- Use Obsidian's own Russian interface terms. Check them in the installed app bundle instead of guessing: «Динамический просмотр», «Исходный код», «режим просмотра», «Открыть в новом окне».
- Quote setting and command names exactly as in `locales/ru.ts`, in «ёлочки».
- Typography: «» quotes, an em dash (—), and the letter ё.
- A bug is «баг», never «ошибка»: «Исправлен баг: …», «Исправлен баг, из-за которого …». «Ошибка» stays only where it means an error message the plugin shows («сообщение об ошибке»).
- Preferred words: «блок», not «карточка»; «переводы интерфейса»; «магазин плагинов»; «проводник» for the file explorer.
- Contributor credits are gender-neutral: «Первый вклад @user в проект — PR #3».

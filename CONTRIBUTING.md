# Contributing

I am open to suggestions and new ideas that expand the plugin's functionality.


## Ways to contribute

1. **Report a bug or suggest a feature.** Open an issue in the [repository](https://github.com/pan4ratte/obsidian-tags-color-files/issues) and describe what happened or what you would like the plugin to do. If you are reporting a bug, please mention your Obsidian version, your platform and the coloring method you were using.

2. **Send a pull request.** Fixes and new features are welcome.

3. **Add a translation.** The plugin's interface is fully localized. To add a language, copy `locales/en.ts`, translate the values, and register the new file in `locales-list.ts`. Any string left untranslated falls back to English. The changelog shown inside the plugin can be translated too: add the translated file to the `CHANGELOGS` map in `changelog.ts`.


## Development setup

The plugin is written in TypeScript and bundled with esbuild.

1. Clone the repository into the `.obsidian/plugins/` folder of a test vault.

2. Install the dependencies:

   ```
   npm install
   ```

3. Start a watching build. It rebuilds `main.js` on every change, so the plugin can be reloaded straight in the test vault:

   ```
   npm run dev
   ```

4. Before opening a pull request, make sure the linter and the production build both pass. `npm run build` also type-checks the project:

   ```
   npm run lint
   npm run build
   ```


## Pull requests

- **Describe user-facing changes in the changelog.** Add an entry under the newest version in `CHANGELOG.md`. `CHANGELOG_RU.md` is the main changelog and `CHANGELOG.md` is translated from it: if you write Russian, add the entry there too; if not, I will translate it. Both files are shown inside the plugin, so write for its users.
- **Leave the version numbers alone.** A release is published automatically when the version in `manifest.json` changes on `main`, so versions are bumped only when a release is made.
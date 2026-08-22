# Contributing

I am open to suggestions and new ideas that expand the plugin's functionality.


## Ways to contribute

1. **Report a bug or suggest a feature.** Open an issue in the [repository](https://github.com/pan4ratte/obsidian-tags-color-files/issues) and describe what happened or what you would like the plugin to do. If you are reporting a bug, please mention your Obsidian version, your platform and the coloring method you were using.

2. **Send a pull request.** Fixes and new features are welcome — the roadmap below lists what is currently planned.

3. **Add a translation.** The plugin's interface is fully localized. To add a language, copy `locales/en.ts`, translate the values, and register the new file in `locales-list.ts`.


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
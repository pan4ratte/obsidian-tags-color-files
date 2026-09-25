import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
	{
		// Lint the TypeScript source only. Build config (*.mjs), data (*.json) and
		// build output (*.js) aren't plugin source, and the preset's type-aware
		// rules can't run on them (they're outside tsconfig's project, so there
		// are no parser services).
		ignores: ["node_modules/**", "**/*.mjs", "**/*.json", "**/*.js"],
	},
	// Obsidian's plugin guideline preset: the rules the community plugin review
	// runs, including the type-checked @typescript-eslint ruleset and the
	// obsidianmd/* rules.
	...obsidianmd.configs.recommended,
	{
		files: ["**/*.ts"],
		languageOptions: {
			parser: tsparser,
			parserOptions: {
				project: "./tsconfig.json",
				tsconfigRootDir: import.meta.dirname,
			},
		},
		// Project-specific overrides.
		rules: {
			"@typescript-eslint/no-explicit-any": "warn",
			"@typescript-eslint/no-unused-vars": [
				"error",
				{ args: "none", caughtErrorsIgnorePattern: "^_" },
			],
			"@typescript-eslint/ban-ts-comment": "error",
			"no-prototype-builtins": "warn",
		},
	},
]);

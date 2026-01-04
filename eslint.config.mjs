// eslint.config.mjs
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals'; // <--- NEU

export default tseslint.config(
  {
	ignores: ["node_modules/", "dist/", "build/", "coverage/", "main.js", "manifest.json", "versions.json"]
  },

  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...obsidianmd.configs.recommended,

  {
	files: ["**/*.ts", "**/*.tsx"],
	languageOptions: {
	  parser: tseslint.parser,
	  parserOptions: {
		project: "./tsconfig.json",
		tsconfigRootDir: import.meta.dirname,
	  },
	  // --- NEU: Globals definieren ---
	  globals: {
		...globals.browser, // Kennt 'console', 'document', 'window'
		...globals.node,    // Kennt 'require', 'process'
	  }
	},
	rules: {
	  "obsidianmd/sample-names": "off",
	  "obsidianmd/prefer-file-manager-trash-file": "error",
	  "@typescript-eslint/no-explicit-any": "warn",
	  "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
	  "obsidianmd/ui/sentence-case": [
		  "warn", 
		  { 
			"brands": ["Recursive Note Deleter"] 
		  }
		],
	  
	  // OPTIONAL: Wenn du console.log benutzen willst, schalte die Warnung ab:
	  // "no-console": "off" 
	},
  }
);

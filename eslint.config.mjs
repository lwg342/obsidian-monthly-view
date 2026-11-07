import { defineConfig, globalIgnores } from 'eslint/config';
import obsidianmd from 'eslint-plugin-obsidianmd';
export default defineConfig([
  globalIgnores(['node_modules/**', 'dist/**', 'main.js', '.test-vault/**', '.test-profile/**', '.preview/**', 'tests/**', 'scripts/**', 'eslint.config.mjs']),
  ...obsidianmd.configs.recommended,
  { languageOptions: { parserOptions: { projectService: true } } },
]);

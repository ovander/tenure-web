// @ts-check
import tseslint from 'typescript-eslint'
import vue from 'eslint-plugin-vue'
import vueParser from 'vue-eslint-parser'

export default tseslint.config(
  { ignores: ['dist/**', 'dev-dist/**', 'node_modules/**', 'src/api/schema.d.ts', 'test-results/**', 'playwright-report/**'] },
  ...tseslint.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: { parser: vueParser, parserOptions: { parser: tseslint.parser, sourceType: 'module', extraFileExtensions: ['.vue'] } },
  },
  {
    rules: {
      // No token, no inline script, no eval (RENT-FE-001 §7 security).
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'vue/no-v-html': 'error',
      'no-restricted-globals': ['error', { name: 'localStorage', message: 'Nothing durable in the browser: use the API (sessionStorage only for per-tab conveniences).' }],
      // PrimeVue's Tooltip writes a style attribute, which the CSP refuses
      // (no nonce applies to attributes): use the title attribute (Q-W1).
      'no-restricted-imports': ['error', { paths: [{ name: 'primevue/tooltip', message: 'Sets a style attribute the CSP blocks; use :title (Q-W1).' }] }],
      'no-restricted-syntax': [
        'error',
        { selector: "Literal[value=/^Bearer /]", message: 'The app never holds a token: the BFF session does.' },
      ],
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off',
      'vue/attribute-hyphenation': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
)

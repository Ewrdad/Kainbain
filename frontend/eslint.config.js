import security from 'eslint-plugin-security';
import noUnsanitized from 'eslint-plugin-no-unsanitized';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

// Use the react plugin's native flat config (v7.37+) as the rule source.
const reactRecommendedRules = react.configs.flat.recommended.rules;

// A handful of react rules still rely on the legacy context API and crash with
// the installed ESLint version (e.g. `contextOrFilename.getFilename is not a
// function`). Filter them out of the flat recommended set. TODO: revisit and
// remove this filter once eslint-plugin-react ships a fully flat-config-
// compatible release. Retested 2026-10-05 with eslint-plugin-react 7.37.5
// (latest) on ESLint 10.12.0: still crashes (`getReactVersionFromContext`
// in version.js) — the plugin targets ESLint <=9, so the filter stays.
// See DEPRECATIONS.md row 11.
const brokenReactRules = [
  'react/display-name',
  'react/jsx-uses-react',
  'react/jsx-uses-vars',
  'react/react-in-jsx-scope',
  'react/prop-types',
  'react/no-direct-mutation-state',
  'react/no-deprecated',
  'react/no-find-dom-node',
  'react/no-is-mounted',
  'react/no-render-return-value',
  'react/no-string-refs',
  'react/no-unescaped-entities',
  'react/no-unknown-property',
  'react/no-unsafe',
  'react/require-render-return',
];

const workingReactRules = Object.fromEntries(
  Object.entries(reactRecommendedRules).filter(([key]) => !brokenReactRules.includes(key)),
);

const reactHooksRecommended = reactHooks.configs.flat['recommended-latest'];

// Static JSX-a11y coverage (WCAG regression gate, Phase 1.2). The recommended
// set applies to shipped source. Test files (`*.test.jsx`) get a narrower
// override below: they render scaffolding `<div onClick>` / custom `role`
// props that are never shipped, so interaction and role rules are relaxed
// there while real assertions (alt text, aria props, labels) still apply.
const jsxA11yRecommendedRules = jsxA11y.flatConfigs.recommended.rules;

export default [
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.vitest,
      },
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    plugins: {
      security,
      'no-unsanitized': noUnsanitized,
      react,
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      ...security.configs['recommended-legacy'].rules,
      ...noUnsanitized.configs['recommended-legacy'].rules,
      ...workingReactRules,
      ...reactHooksRecommended.rules,
      ...jsxA11yRecommendedRules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      // Fast structural guards duplicated by the pre-CI check:
      'no-redeclare': 'error',
      'no-duplicate-imports': 'error',
      // Initial focus on user action (dialog open, inline editor shown) is the
      // WCAG-correct pattern and is owned by Modal.jsx plus per-site handlers;
      // the blanket ban stays on so each remaining use carries a rationale.
      'jsx-a11y/no-autofocus': 'error',
    },
  },
  {
    // Test scaffolding is never shipped: interaction/role static rules that
    // misfire on test doubles and custom-component props stay off here.
    files: ['**/*.test.{js,jsx}'],
    rules: {
      'jsx-a11y/aria-role': 'off',
      'jsx-a11y/click-events-have-key-events': 'off',
      'jsx-a11y/no-static-element-interactions': 'off',
      'jsx-a11y/no-noninteractive-element-interactions': 'off',
      'jsx-a11y/interactive-supports-focus': 'off',
      'jsx-a11y/no-autofocus': 'off',
    },
  },
  {
    ignores: ['dist/'],
  },
  prettier,
];

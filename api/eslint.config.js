import security from "eslint-plugin-security";
import n from "eslint-plugin-n";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default [
	{
		files: ["**/*.js"],
		languageOptions: {
			ecmaVersion: "latest",
			sourceType: "module",
			globals: {
				...globals.node,
				...globals.jest,
				...globals.vitest,
			},
		},
		plugins: {
			security,
			n,
		},
		rules: {
			...security.configs["recommended-legacy"].rules,
			...n.configs.recommended.rules,
			"n/no-process-exit": "off",
			"n/no-unpublished-import": "off",
			"n/no-unsupported-features/node-builtins": "off",
		},
	},
	prettier,
];

/** @type {import('@types/eslint').Linter.BaseConfig} */
module.exports = {
  root: true,
  extends: [
    "@remix-run/eslint-config",
    "@remix-run/eslint-config/node",
    "prettier",
  ],
  globals: {
    shopify: "readonly"
  },
 // rules: {    
  //  'no-console': ['error', { allow: ['warn', 'error'] }], 
 // },
  overrides: [
    {
      files: ['**/*.test.{js,jsx}', '**/*.spec.{js,jsx}'],
      env: {
        jest: true, 
      },
      rules: {
        'no-console': 'off',
      },
    },
  ],
};
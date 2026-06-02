module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs'],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
  },
  overrides: [
    {
      // Tests and the vitest setup file legitimately use `any` for mocks/stubs.
      files: ['**/*.test.ts', '**/*.test.tsx', 'src/test/setup.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
      },
    },
    {
      // shadcn/ui generated components export both the component and helpers
      // (e.g. buttonVariants), which is standard and intentional.
      files: ['src/components/ui/**'],
      rules: {
        'react-refresh/only-export-components': 'off',
      },
    },
  ],
}

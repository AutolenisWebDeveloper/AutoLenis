import nextConfig from "eslint-config-next"
import tseslint from "typescript-eslint"

export default [
  ...nextConfig,

  // ── TypeScript type-aware rules (applied to .ts/.tsx only) ──────────
  //
  // Enforcement staging:
  //   "error"  → enforced now, violations fail lint and CI
  //   "warn"   → staged, tracked for cleanup, does not fail CI
  //
  // Migration path: after each batch cleanup, promote warn → error.
  //
  {
    files: ["**/*.ts", "**/*.tsx"],
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // ── ENFORCED (error) ───────────────────────────────────────────

      // Await only thenables — few violations, catches real bugs
      "@typescript-eslint/await-thenable": "error",

      // ── STAGED (warn) — promote to error after cleanup ─────────────

      // No explicit `any` — ~857 existing violations
      "@typescript-eslint/no-explicit-any": "warn",

      // No floating promises — ~164 existing violations
      "@typescript-eslint/no-floating-promises": ["warn", {
        ignoreVoid: true,        // allow `void fn()` as explicit discard
        ignoreIIFE: false,
      }],

      // No misused promises — ~8 existing violations
      "@typescript-eslint/no-misused-promises": ["warn", {
        checksVoidReturn: {
          attributes: false,     // allow promise in JSX event handlers
        },
      }],

      // Require await in async functions
      "@typescript-eslint/require-await": "warn",

      // No unsafe any operations — depends on no-explicit-any cleanup
      "@typescript-eslint/no-unsafe-assignment": "warn",
      "@typescript-eslint/no-unsafe-member-access": "warn",
      "@typescript-eslint/no-unsafe-call": "warn",
      "@typescript-eslint/no-unsafe-return": "warn",
      "@typescript-eslint/no-unsafe-argument": "warn",
    },
  },

  // ── Cross-boundary import restrictions ──────────────────────────────
  {
    files: ["app/**/*.ts", "app/**/*.tsx", "lib/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          {
            group: ["prisma", "@prisma/client"],
            importNamePattern: "^PrismaClient$",
            message: "Import prisma from '@/lib/db' instead of creating PrismaClient directly.",
          },
        ],
      }],
    },
  },

  // ── Existing rule overrides ─────────────────────────────────────────
  {
    rules: {
      "react/no-unescaped-entities": "off",
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/immutability": "warn",
      "@next/next/no-img-element": "off",
      "@next/next/no-head-element": "warn",
      "import/no-anonymous-default-export": "off",
    },
  },

  // ── Ignores ─────────────────────────────────────────────────────────
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "scripts/**",
      "__tests__/**",
      "e2e/**",
      "migrations/**",
      "supabase/**",
      "*.config.*",
    ],
  },
]

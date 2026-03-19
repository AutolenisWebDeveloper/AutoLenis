import nextConfig from "eslint-config-next"

export default [
  ...nextConfig,
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
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "scripts/**",
      "__tests__/**",
      "e2e/**",
      "migrations/**",
    ],
  },
]

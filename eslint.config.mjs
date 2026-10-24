import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  {
    rules: {
      // AI output and user text are always rendered as plain text (CLAUDE.md security rule 9).
      "react/no-danger": "error",
    },
  },
  {
    // Pages and components never talk to the database (docs/folder-structure.md §2).
    // They call domain queries and commands in src/server/<domain>/ instead.
    files: ["src/app/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}", "src/lib/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/server/db", "@/server/db/*", "**/server/db", "**/server/db/*"],
              message:
                "Pages and components must not import the database. Call a query or command in src/server/<domain>/.",
            },
            {
              group: ["drizzle-orm/*", "pg"],
              message: "Database libraries are only used inside src/server/.",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "drizzle/**",
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;

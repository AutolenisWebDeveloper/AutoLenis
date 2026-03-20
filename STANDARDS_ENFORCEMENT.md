# Standards Enforcement Status

> Last updated: 2026-03-20

## Enforcement Summary

| Standard | Enforcement Level | Mechanism | Violations |
|---|---|---|---|
| `await-thenable` | **ERROR** (blocks CI) | ESLint `@typescript-eslint/await-thenable` | 0 |
| `no-explicit-any` | **WARN** (tracked) | ESLint `@typescript-eslint/no-explicit-any` | ~857 |
| `no-floating-promises` | **WARN** (tracked) | ESLint `@typescript-eslint/no-floating-promises` | ~164 |
| `no-misused-promises` | **WARN** (tracked) | ESLint `@typescript-eslint/no-misused-promises` | ~8 |
| `no-unsafe-*` (5 rules) | **WARN** (tracked) | ESLint `@typescript-eslint/no-unsafe-*` | ~21K total |
| `require-await` | **WARN** (tracked) | ESLint `@typescript-eslint/require-await` | tracked |
| Direct PrismaClient import | **ERROR** (blocks CI) | ESLint `no-restricted-imports` | 0 |
| Buyer route auth | **ERROR** (blocks CI) | `check-architecture.ts` | 0 |
| Admin route auth | **WARN** (tracked) | `check-architecture.ts` | 41 |
| Direct Prisma in app/ | **ERROR** (blocks CI) | `check-architecture.ts` | 0 |
| Sensitive data logging | **ERROR** (blocks CI) | `check-architecture.ts` | 0 |
| Service-role in user routes | **WARN** (tracked) | `check-architecture.ts` | 0 |
| Workspace scoping | **WARN** (tracked) | `check-architecture.ts` | 14 |
| Route error handling | **WARN** (tracked) | `check-architecture.ts` | 27 |
| TypeScript strict mode | **ERROR** (blocks CI) | `tsconfig.json` strict: true | 0 |
| TypeScript strictNullChecks | **ERROR** (blocks CI) | `tsconfig.json` | 0 |
| TypeScript noImplicitReturns | **ERROR** (blocks CI) | `tsconfig.json` | 0 |
| TypeScript noFallthroughCases | **ERROR** (blocks CI) | `tsconfig.json` | 0 |
| TypeScript noImplicitOverride | **ERROR** (blocks CI) | `tsconfig.json` | 0 |

## What Blocks CI

The following checks must pass for CI to succeed:

1. **`pnpm lint`** — ESLint with 0 errors (warnings allowed, tracked)
2. **`pnpm typecheck`** — TypeScript strict compilation
3. **`pnpm check:architecture`** — Architecture governance (0 errors required)
4. **`pnpm check:schema-contract`** — Schema contract enforcement
5. **`pnpm test:unit`** — All unit tests pass

## What Is Staged (Warnings, Not Yet Blocking)

These violations exist in the current codebase and are tracked for cleanup:

- **`no-explicit-any`**: ~857 violations. Fix by replacing `any` with proper types.
- **`no-floating-promises`**: ~164 violations. Fix by awaiting, `.catch()`-ing, or `void`-prefixing.
- **`no-unsafe-*`**: ~21K violations. These resolve naturally as `any` types are removed.
- **Route error handling**: 27 routes missing try/catch.
- **Workspace scoping**: 14 services without workspace_id filtering.
- **Admin auth patterns**: 41 admin routes without explicit admin role checks.

## Promotion Path

To promote a staged warning to a blocking error:

1. Fix all violations for that rule
2. In `eslint.config.mjs`, change `"warn"` → `"error"` for the rule
3. Update the warning budget in `scripts/governance/check-standards-summary.ts`

## TypeScript Strictness — Not Yet Enabled

| Setting | Error Count | Status |
|---|---|---|
| `noUncheckedIndexedAccess` | 552 | Too many to enable safely |
| `noUnusedLocals` | 196 (combined) | Too many to enable safely |
| `noUnusedParameters` | (combined above) | Too many to enable safely |

These settings are correct to enable eventually but require dedicated cleanup sprints.

## Commands

```bash
pnpm lint                  # ESLint (warnings + errors)
pnpm lint:strict           # ESLint with --max-warnings 0 (target state)
pnpm typecheck             # TypeScript strict compilation
pnpm check:architecture    # Architecture governance checks
pnpm check:schema-contract # Schema contract enforcement
pnpm test:unit             # Unit tests
```

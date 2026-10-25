# SpendCraft Agent Instructions

## General approach

- Investigate the cause of a problem before changing code.
- Prefer fixing the underlying problem rather than suppressing an error or warning.
- Keep changes focused on the requested task.
- Do not perform unrelated refactoring while fixing another problem.
- Do not upgrade unrelated dependencies.
- Preserve existing behavior unless the task explicitly requires changing it.
- For significant architectural changes, explain the proposed approach before making the change.
- When uncertain about intended behavior, ask rather than making a broad assumption.

## Coding style

- Use two spaces for indentation in JavaScript and TypeScript.
- Follow the existing coding style in surrounding code.
- Prefer strong TypeScript typing over type assertions.
- Do not use `any` merely to silence a TypeScript error.
- Do not add `@ts-ignore`, `@ts-expect-error`, ESLint suppressions, or similar workarounds unless there is a specific reason and that reason is documented.
- Prefer types that express the actual constraints of the code. For example, prefer `keyof T` over broad index signatures when accessing known properties of a generic type.

## Project architecture

SpendCraft is a web application with:

- AdonisJS backend
- React frontend
- TypeScript
- Vite
- Node.js
- npm

The primary source directories include:

- `app/` — server application code
- `client-src/` — React client application
- `common/` — code and types shared by server and client

Shared code in `common/` may therefore be type-checked in both the server and client TypeScript projects.

## TypeScript configuration

There are two TypeScript projects.

The server project is configured by:

    tsconfig.json

The client project is configured by:

    client-src/tsconfig.json

The server uses Node-compatible module resolution.

The client is built by Vite and uses bundler module resolution. TypeScript does not emit the client build.

Do not assume that a TypeScript configuration change appropriate for one project is appropriate for the other.

### Server import aliases

Server package import aliases such as:

    #controllers/*
    #models/*
    #services/*
    #validators/*
    #common/*

are defined by the `imports` map in `package.json`.

`package.json` is the source of truth for these aliases.

Do not duplicate these mappings using `compilerOptions.paths` in the root `tsconfig.json` unless there is a demonstrated need.

## Type checking

After changing server TypeScript code, run:

    npx tsc --noEmit -p tsconfig.json

After changing client TypeScript code, run:

    npx tsc --noEmit -p client-src/tsconfig.json

If a change affects shared code in `common/`, run both.

Do not consider a TypeScript-related task complete until the relevant type checks pass.

## Testing and builds

For changes that could affect application behavior, run the relevant tests.

For changes that could affect the client build, run:

    npm run client-build

For changes that could affect the server build, run:

    npm run server-build

Run broader verification when a change affects configuration, dependencies, shared code, or both sides of the application.

Report any failing checks rather than hiding or bypassing them.

## Dependencies

- Treat major dependency upgrades as migrations rather than routine updates.
- Upgrade dependencies individually or in small related groups so failures can be attributed to a specific change.
- Check migration guides or release notes before major-version upgrades.
- Do not use `--force` or `--legacy-peer-deps` to bypass npm dependency conflicts unless explicitly requested and the consequences have been explained.
- Do not run `npm audit fix --force` without explicit approval.
- Avoid changing working dependency versions merely because newer major versions exist.

## React and client code

- Follow existing React patterns in the project.
- Preserve type safety for component props, state, hooks, and API responses.
- Avoid unnecessary casts of data returned from APIs.
- When runtime validation is required, prefer a proper type guard or validation mechanism rather than asserting that unknown data has a particular type.

## Error investigation

When investigating a compiler, build, runtime, or dependency error:

1. Reproduce or inspect the error.
2. Trace the relevant types, imports, configuration, or call chain.
3. Identify the underlying cause.
4. Make the smallest appropriate correction.
5. Run the relevant verification commands.
6. Report what changed and why.

Do not make speculative changes to several unrelated files or dependencies at once.

## Git

- Do not discard or overwrite unrelated working-tree changes.
- Do not reset, clean, rebase, force-push, or otherwise perform destructive Git operations unless explicitly requested.
- Do not create commits unless explicitly requested.
- Before a substantial migration, preserve the ability to distinguish the migration changes from unrelated work.

## Operator database scripts

- Place audit and other script-generated output under the project's `script-output/` directory. Create unique per-run subdirectories there when applicable; preserve earlier output and print the absolute output path before work begins.
- Scripts requested for production or `spendcraft_sandbox` must read connection settings from a `.env` file using `PG_HOST`, `PG_PORT`, `PG_USER`, `PG_PASSWORD`, and `PG_DB_NAME`.
- These scripts must automatically create a unique output directory and print its absolute path to standard output immediately after creation, before database work begins, following `scripts/auditTransactionCategoryCents.mjs`. Preserve existing output files; never overwrite a previous run's results.
- Do not print credentials or commit environment files. Preparing a script does not authorize executing it against a database.

## Task Scope and Efficiency

Follow these rules for every task unless explicitly overridden.

1. **Minimum necessary work.** Perform only the work required to satisfy the user's stated objective. Do not expand scope to adjacent issues.

2. **Prefer simple solutions.** Modify existing code when practical. Avoid new abstractions, frameworks, utilities, or scripts unless clearly necessary.

3. **No unsolicited improvements.** Do not refactor unrelated code, modernize dependencies, expand architecture, or fix unrelated defects.

4. **Stop on scope expansion.** If completing the task requires substantial additional work, a product decision, or changes outside the requested scope, stop and explain the issue before proceeding.

5. **Proportionate testing.** Run focused tests and checks relevant to the changes. Reserve full-suite verification for major changes or explicit requests.

6. **Minimal documentation.** Update only documentation directly affected by the task. Do not create new design or verification documents unless requested.

7. **Time efficiency.** Prefer the shortest reliable path to completion. Do not repeatedly investigate the same issue or pursue speculative edge cases.

8. **Preserve existing work.** Do not discard, overwrite, stage, or commit unrelated user changes.

9. **Concise reporting.** Report what changed, what was verified, and any remaining blockers. Avoid lengthy inventories unless requested.

10. **Safety boundaries remain mandatory.** Never weaken database, security, deployment, or financial safeguards to reduce effort.
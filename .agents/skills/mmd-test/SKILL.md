---
name: mmd-test
description: Select and run the smallest sufficient MMD_modoki verification set after code or configuration changes, then separate new failures from known baselines. Use for test requests, pre-commit checks, or deciding among lint, unit, typecheck, smoke, E2E, and manual verification. Do not use for packaging or release publication.
---

# MMD_modoki Test Selection

Verify the requested change with the narrowest set of checks that gives meaningful confidence. Follow the repository `AGENTS.md`; do not treat this skill as a replacement for it.

## Establish scope

1. Confirm the working directory is the MMD_modoki repository and inspect `package.json` for the current scripts.
2. Inspect `git status` and the relevant diff. Preserve unrelated user changes and untracked files.
3. Determine whether the user requested verification only, diagnosis, or implementation. Verification does not authorize fixes.
4. Identify the changed behavior, affected execution path, and the cheapest layer that can observe it.

## Select checks

Run only checks justified by the change.

| Change | Checks to consider |
| --- | --- |
| Markdown or insight cards only | link/front matter validation when applicable, then `git diff --check`; normally skip npm checks |
| TypeScript application code | `npm.cmd run lint` |
| Pure helper, Action, Command, diff, mergeKey, project conversion | focused unit test, then `npm.cmd run test:unit` |
| Types, runtime boundaries, exporter, catch paths | `npm.cmd run typecheck` and `npm.cmd run typecheck:critical` when useful; distinguish the non-blocking baseline from critical undefined-name errors |
| Main, preload, renderer startup, initialization, WebGPU startup | `npm.cmd run smoke:launch` in addition to lint |
| UI routes, menus, mode switches, registration operations | the narrowest relevant `npm.cmd run test:e2e -- <spec>`; use the full suite only when the change warrants it |
| Rendering quality or physics behavior | automated checks for logic/startup plus focused manual or user-device confirmation; do not claim visual correctness from smoke/E2E alone |
| Build/release configuration | validate the changed config and hand off packaging/publication to the appropriate workflow |

Read these only when the corresponding test layer is relevant:

- Unit-test strategy: [testing-strategy-proposal.md](../../../docs/testing-strategy-proposal.md)
- Electron startup checks: [electron-local-smoke-test-plan.md](../../../docs/electron-local-smoke-test-plan.md)
- UI/runtime E2E: [playwright-electron-e2e-operation-guide.md](../../../docs/playwright-electron-e2e-operation-guide.md)

## Execute and interpret

- Prefer a focused test before a broad suite while iterating.
- Do not run concurrent Electron/WebGPU checks that can compete for processes or GPU state.
- Do not use local PMX, PMD, VMD, texture, or other private assets unless the user explicitly authorizes those files for this verification.
- If a command fails, capture the command, exit status, and the smallest useful error excerpt.
- Compare typecheck and other known baselines before calling a failure new.
- Do not extend timeouts or fixed sleeps merely to make a flaky check pass; inspect the observable ready state and teardown first.
- Stop when the selected evidence is sufficient, a required environment is unavailable, or continuing would require new authorization.

## Report

Lead with the overall result, then list:

- checks passed;
- checks failed, separated into new failures and known baseline failures;
- checks not run and why;
- manual or user-device confirmation still required.

Never describe an unrun check as passing. Do not commit, push, package, or publish unless the user separately requests it.

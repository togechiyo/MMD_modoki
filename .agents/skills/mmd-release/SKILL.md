---
name: mmd-release
description: Prepare or execute an MMD_modoki version release by reconciling version files, feedback ledger, release notes, verification, CI packages, tags, and GitHub Release assets. Use for release planning, preflight, version bumps, tag publication, or release completion; do not use for an ordinary commit/push or a local package build alone.
---

# MMD_modoki Release

Move a requested release through explicit, auditable stages with human checkpoints between preparation and publication. Skill activation does not authorize commit, push, workflow dispatch, tag creation, tag push, or GitHub Release publication.

## Load the current release contract

Read before acting:

- [release-process.md](../../../docs/release-process.md)
- [package.json](../../../package.json)
- [build-zips.yml](../../../.github/workflows/build-zips.yml)
- the feedback ledger and release-note document for the target version, when present.

Treat the current files as authoritative over remembered commands. Confirm the requested target version rather than guessing a patch, minor, or major bump.

## Stage 1: Read-only preflight

1. Inspect branch, upstream, worktree status, recent tags, and commits since the previous release.
2. Keep unrelated modified and untracked files out of the release scope.
3. Compare `package.json` and `package-lock.json` versions.
4. Check the target feedback ledger for fixed, open, deferred, and unconfirmed reports.
5. Check whether release notes exist and whether their claims are supported by the diff, ledger, tests, or explicit owner decisions.
6. Identify all supported UI locales from `src/i18n.ts` and the locale resources. Parse every locale JSON, compare their complete key sets, and report missing, extra, or blank translations. For non-English resources, also review values identical to English and distinguish deliberate technical terms or proper names from untranslated user-facing copy. Do not rely on key parity or the English fallback as evidence that a locale is complete.
7. Confirm that the intended release tag does not already exist locally or remotely before creating it.

Report blockers before mutating files or external state.

### Human checkpoint A: release scope

Stop after the read-only preflight. Summarize the target version, included changes, open/deferred reports, worktree state, expected file edits, and any blockers. Ask the project owner whether to proceed with release-file preparation. Do not begin Stage 2 until the owner answers affirmatively, even when the initial request was broadly phrased as “do the release,” unless the owner explicitly waived intermediate checkpoints.

## Stage 2: Prepare release files

Only when requested, update the version files, release notes, ledger, public documentation, and known-issue text needed for the target release.

- Do not promote an external request to a roadmap commitment without an explicit owner decision.
- Separate shipped fixes, known issues, deferred items, and experimental changes.
- Avoid release-note claims based only on implementation intent; require observable behavior or documented evidence.
- Keep version changes consistent across lockfiles and generated metadata without creating a tag as a side effect.

## Stage 3: Verify

Choose verification using the repository `AGENTS.md` and the `mmd-test` skill when available.

At minimum, reconcile the release scope with the checks required by the current workflow. The release workflow currently runs lint, unit tests, critical typecheck, and platform package builds. Local verification does not replace CI platform builds.

Before publication, switch the running UI through every supported language mode. Check the common shell (menu bar, toolbar, timeline, and bottom panel) and every dialog, settings screen, export screen, toast, or error path whose text changed in the release. Record separately:

- locale resource parsing, key parity, and blank-value results;
- locales and screens visually checked;
- raw translation keys, unintended fallback text, mojibake, obvious mistranslations, clipping, overlap, or other blocking layout defects;
- any lower-severity wording issue deliberately carried as a known issue.

Treat missing translations and interaction-blocking locale layout defects as release blockers unless the project owner makes a different informed decision. A successful dictionary check does not replace the UI pass.

If required checks fail, stop before tag publication unless the user explicitly makes a different, informed decision. Distinguish known non-blocking typecheck baseline errors from critical failures.

### Human checkpoint B: publication readiness

Stop after local verification and any authorized CI preflight have produced enough evidence for a publication decision. Summarize passed, failed, skipped, and manually unverified checks; release-note status; expected artifacts; and remaining known issues. Ask whether to proceed to commit/tag/publication operations. Do not infer approval from successful tests or builds.

## Stage 4: Build and publish

- Local `package` or `make` commands are supplemental checks for the current OS only.
- The canonical cross-platform artifacts come from `.github/workflows/build-zips.yml`.
- The normal release path is to create and push the requested `vX.Y.Z` tag after local verification and publication approval. The tag push triggers the four platform builds and GitHub prerelease publication.
- Do not require a separate GitHub CLI login or `workflow_dispatch` merely to start a normal release when authenticated `git push` is available.
- `workflow_dispatch` is an optional preflight for workflow, dependency, or packaging-risk changes. It is not a mandatory step for every release, creates workflow artifacts only, and requires explicit authorization when used.
- After tag push, confirm the Windows ZIP, macOS ZIP, macOS arm64 DMG, Linux ZIP, and `Publish GitHub Release Assets` jobs before reporting completion.
- Do not treat a successful local or optional preflight build as permission to commit, push, or tag.

## Stage 5: Commit and publish gates

After checkpoint B is approved, confirm each external or repository-history mutation is covered by the user's current instruction:

1. commit release preparation;
2. push the branch or `main`;
3. optionally dispatch a preflight workflow when explicitly requested or warranted by packaging-risk changes;
4. create the version tag;
5. push the tag, which starts the canonical build and prerelease publication;
6. inspect the workflow jobs, generated assets, and GitHub prerelease;
7. edit the generated prerelease body only when separately authorized and needed.

Checkpoint approval covers only the stages and mutations described in the checkpoint summary. When the owner explicitly authorizes the complete remaining release sequence, proceed through the listed mutation gates without repeatedly asking. Stop and ask again on new blockers, failed checks, changed release scope, target ambiguity, or unexpected external state.

The tag must use `vX.Y.Z`. Tag push triggers the canonical package workflow and GitHub prerelease asset publication. Do not run `npm publish`.

An explicit owner request such as “タグとビルド” covers tag creation, tag push, the triggered build, and release-result inspection. Proceed through those operations without adding an unrelated GitHub CLI authentication requirement. It does not by itself authorize changing an existing tag, deleting a release, or editing release text.

## Completion report

State:

- released version and tag;
- commit and branch used;
- verification results;
- locale dictionary audit and per-language UI verification results;
- workflow run result;
- expected and observed assets;
- prerelease status;
- remaining known issues or manual platform checks.

If the task stops before publication, state the exact completed stage and next authorized action. Never report a release as complete from a local build alone.

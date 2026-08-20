---
name: mmd-insight-curation
description: Curate reusable MMD_modoki knowledge from completed work, explicit owner decisions, verification results, docs, and diffs into insights cards and indexes. Use when asked to extract, record, update, or validate insights or human decisions; do not turn ordinary progress or unadopted external feedback into project policy.
---

# MMD_modoki Insight Curation

Keep `insights/` useful as a compact decision layer without duplicating the human-facing detail in `docs/`.

## Load the contract

Read these before editing cards:

- [Insights operation guide](../../../insights/README.md)
- [Main insights index](../../../insights/index.md)
- [Human decisions index](../../../insights/decision-index.md)
- [Low-priority index](../../../insights/low-priority-index.md)

Then search existing cards and canonical docs for the current topic. Do not create a new card until an existing card cannot represent the knowledge cleanly.

## Classify evidence

- Use `observation` for a reproducible lead or hypothesis that still needs confirmation.
- Use `verified` only when tests, logs, current primary documentation, or explicit user-device confirmation support the result.
- Use `policy` only for a decision rule that has held across conditions or is an established repository default.
- Use `decision` only for an explicit project-owner adoption, rejection, deferral, confirmation, or constraint.
- Use `retired` when assumptions changed or another card supersedes the guidance.

Treat statements such as “fixed” or “still broken” as technical evidence. Treat statements such as “proceed this way,” “do not add this,” or “defer this” as owner decisions. Keep technical truth and owner choice in separate cards when both are present.

External requests, issue reports, X posts, implemented code, and ambiguous conversation do not establish a project-owner decision by themselves.

## Edit narrowly

1. Keep detailed history, implementation, and comparisons in a canonical `docs/` file.
2. Add or update only the card content that changes a future decision.
3. Preserve the required front matter and headings from the operation guide.
4. Add the card to exactly one appropriate index:
   - human decisions in `decision-index.md`;
   - `priority: low` cards in `low-priority-index.md`;
   - other active cards in `index.md`.
5. When replacing guidance, retain the old record as `retired` or link the replacement instead of deleting the decision history.
6. Never include local absolute paths, private asset details, secrets, or unsupported claims.

## Validate

Run the bundled deterministic validator from the repository root:

```powershell
node .agents/skills/mmd-insight-curation/scripts/validate-insights.mjs
```

Also run `git diff --check`. Fix validation errors before reporting completion. The validator checks structure and references; it does not prove that the classification or judgment is correct.

## Report

State which cards were added, updated, or retired; identify the evidence class; and mention index/validation results. Do not commit or push unless explicitly requested.

# Lexora Roadmap

This roadmap describes product capabilities and public-safe verification. It
does not contain private workbook titles, page mappings, exercise text, or
source-derived acceptance data.

## Completed foundation

- PDF upload, page rasterization, and persisted page-processing state.
- Source-faithful Classic Mode with zoom, rotation, navigation, and recovery.
- Normalized interaction geometry shared across rendering scales.
- Deterministic local-development detectors for FillBlank, Choice, ChoiceGrid,
  SentenceOrdering, Matching, and FreeText.
- A viewport-native Interactive Mode projected from persisted analysis.
- Local answer persistence with interaction fingerprints and stale-data guards.
- Source-grounded correction with explicit unresolved and unavailable states.
- Keyboard, narrow-viewport, reduced-motion, and WCAG A/AA browser coverage.

## Public portfolio release

- Validated multimodal analysis in the local/private runtime; the public
  production topology contains an internal-only AI-help service with no
  published port. Document analysis, OCR, and model downloads remain private.
- Read-only synthetic demo initialized server-side with precomputed analysis.
- No anonymous upload, processing, or extraction path; explicit optional AI
  assistance is provider-bound and protected by verification and quotas.
- Public landing, current product screenshots, social preview,
  recruiter-oriented README, and production runbook.
- Security headers, proxy limits, loopback-only public binding, health checks,
  migration validation, and restart/persistence proof.
- Public assets and examples generated only from the curated synthetic demo.

## Interaction-family limits

### FillBlank

- Supports horizontal answer lines and conservative short-suffix blanks.
- Rejects dense tables and occupied structural rules where evidence is weak.
- Does not support curved, dotted, vertical, boxed, or handwritten answers.

### Choice

- Supports hollow circular targets and reliable numbered legends.
- A target without a trustworthy legend remains visible but not answerable.
- Filled marks, arbitrary icons, and semantic correctness are out of scope.

### ChoiceGrid

- Supports empty cells under short, aligned headers with one choice per row.
- Static tables and pre-filled cells are rejected.
- Dotted separators and multi-line headers remain conservative edge cases.

### SentenceOrdering

- Supports printed fragment sequences with stable item identity.
- Wrapped and two-column layouts are handled only when geometry is unambiguous.
- Prompts requiring conjugation or rewriting are not misrepresented as pure
  ordering; a transformation-capable interaction is future work.

### Matching

- Supports one-to-one pairs with printed anchor evidence.
- One-to-many, image-to-text, and anchorless layouts are not supported.
- Ambiguous or heavily interleaved layouts fail closed.

### FreeText

- Supports isolated writing lines and aligned multi-line response areas.
- Single unprompted rules, form-like fields, and dense boxed regions are
  intentionally rejected to avoid false positives.
- Learner text is local and true open responses remain ungraded by deterministic
  correction; after completion, optional Ask Lexora can provide AI-assisted,
  non-source-backed feedback.

## Verification policy

Automated tests generate their own public-safe geometry, OCR spans, analysis,
and answers. The curated demo covers all six interaction families plus Classic
Mode, correction, navigation, progress, responsive layouts, and recovery. Local
private-source compatibility may be checked separately through ignored local
configuration and process-local environment variables; results and source
material must never become tracked fixtures or public assets.

## Next product capabilities

- Vocabulary capture and click-to-translate.
- More explicit grammar explanations grounded in source evidence.
- Additional transformation-aware interaction types.
- Optional user accounts and cross-device progress, only with a deliberate
  privacy and abuse-control design.
- Production observability, backup/restore drills, and live deployment runbooks.

Public deployment, domain/DNS, live TLS, authentication policy, and a real
provider smoke remain operational launch work rather than repository fixtures.

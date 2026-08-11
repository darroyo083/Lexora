# Lexora

Lexora turns scanned language workbooks into focused interactive lessons while keeping the original page one click away. It is a portfolio-ready MVP built around a simple trust rule: transform what the source supports, and fail closed when it does not.

[![Lexora demo video: real product evidence from the public demo](frontend/public/release/lexora-demo-poster.png)](frontend/public/release/lexora-demo.mp4)

**Current release candidate:** a read-only public demo built from real OpenCode Go / MiMo V2.5 output, plus a separate local/private AI runtime for owner PDFs. The public server runs no AI service, holds no provider credential, and makes no inference call. Its four-page source workbook is original synthetic material created for Lexora.

## See it

- **66-second product film:** [watch or download the caption-led MP4](frontend/public/release/lexora-demo.mp4).
- **Real precomputed demo:** run the public stack below, then open `http://127.0.0.1:8088/demo`.
- **Source:** this repository. A real public URL remains a deployment-time decision.

The demo runs the real product against deliberately created content. It cannot upload, process, delete, or expose arbitrary books, and opening it does not call the external provider.

| Interactive lesson | Classic page fidelity |
|---|---|
| ![Interactive lesson](frontend/public/release/lexora-interactive.webp) | ![Classic Mode reader](frontend/public/release/lexora-classic.webp) |

## Why two readers?

| Mode | Job | Trust boundary |
|---|---|---|
| **Interactive** | Projects persisted page analysis into one responsive lesson step at a time. | Supported structures become native controls; correction is authoritative only when the backend resolves a source mapping. |
| **Classic** | Preserves the original PDF, geometry-aligned overlays, and exercise rail. | Unsupported or ambiguous material remains attached to the source instead of being invented. |

Interactive covers context, fill blank, choice, choice grid, sentence ordering, matching, and free text. Answers are stored in the current browser and shared across both modes.

## What is technically interesting?

- **Real AI once, deterministic public behavior after it.** The synthetic PDF was processed through PDFBox rasterization and OpenCode Go / MiMo V2.5, validated as `PageAnalysis` v0.2.0, and committed with safe provenance.
- **No AI component in public production.** Public Compose runs only Nginx/React, Spring Boot, and PostgreSQL. It requires no `OPENCODE_GO_API_KEY` and cannot invoke OCR or external inference.
- **Source-preserving projection.** The React lesson projector carries page, span, interaction, geometry, confidence, and processor provenance into the learner experience.
- **Fail-closed correction.** Only resolved backend mappings can produce correct or incorrect feedback. Ambiguous, unmapped, stale, or failed correction remains neutral.
- **Bounded public cost.** The public demo is pre-analyzed and read-only. Server-side filters block mutations, arbitrary book reads, and any public analysis trigger, so anonymous visitors cannot create provider spend.
- **A real fallback.** PDF.js is lazy-loaded only when Classic Mode is requested; it is not decorative duplicate UI.

## Architecture

```mermaid
flowchart LR
    Page[Synthetic demo PDF] --> Contract[Frozen real MiMo<br/>PageAnalysis]
    Contract --> Projection[Deterministic lesson projection]
    Projection --> Interactive[Interactive renderer]
    Interactive --> Correction[Authoritative correction<br/>fail closed]
    Page --> Classic[Classic PDF.js reader<br/>source-faithful overlays]
```

The public runtime is three containers: Nginx/React, Spring Boot, and PostgreSQL. The local/private workflow adds FastAPI for real provider analysis. See [the architecture reference](docs/architecture.md) for both topologies and [the public release runbook](docs/public-release.md) for exact commands and security proofs.

| Layer | Technology | Responsibility |
|---|---|---|
| Frontend | React 19, TypeScript 7, Vite 8, PDF.js 6 | Landing, native lessons, browser-local answers, lazy Classic reader |
| Backend | Java 21, Spring Boot 4.1, PostgreSQL 18, PDFBox | Books, page orchestration, profiles, correction authority, public-demo enforcement |
| AI service | Python 3.12, FastAPI, OpenCode Go Vision (MiMo V2.5) | Local/private bounded image analysis and strict contract validation; absent publicly |
| Development analysis | PaddleOCR 3.7, OpenCV 4.10 | Optional local compatibility path; absent from the public runtime |

## Quick start: public demo

Prerequisite: Docker Desktop with Compose. No AI credential is required.

```powershell
$env:POSTGRES_PASSWORD = '<strong-random-secret>'
$env:LEXORA_HTTP_PORT = '8088' # optional
docker compose -p lexora-public -f compose.production.yml up -d --build --wait
```

Open `http://127.0.0.1:8088` for the landing or `/demo` for the reader. The default binding is loopback-only. Stop this stack with:

```powershell
docker compose -p lexora-public -f compose.production.yml down
```

Production Compose enables the precomputed public-demo boundary and contains no `ai-service`, provider variable, upload path, or analysis dependency. It binds to loopback by default. Configure the owner-approved reverse proxy, TLS, and domain before deliberately changing that binding.

## Local/private AI runtime

This workflow keeps arbitrary PDF upload and real MiMo analysis in the same repository while binding privileged services to `127.0.0.1` by default:

```powershell
Copy-Item .env.example .env
# Add OPENCODE_GO_API_KEY to .env locally; never commit it.
$env:LEXORA_ANALYSIS_PROVIDER = 'opencode-go'
$env:LEXORA_AI_DOCKER_TARGET = 'production'
$env:LEXORA_PROVIDER_TIMEOUT_SECONDS = '240'
docker compose -p lexora-private -f docker-compose.yml up -d --build --wait
```

Open `http://127.0.0.1:5173`. Upload and page processing are enabled here; the owner-provided key is passed only to the private FastAPI container. Stop it with `docker compose -p lexora-private -f docker-compose.yml down`.

## Local development

Development Compose also retains the optional local OCR compatibility provider:

```powershell
Copy-Item .env.example .env
./scripts/dev-up.ps1
./scripts/dev-status.ps1
```

Open `http://localhost:5173`. Stop the stack with `./scripts/dev-down.ps1`. Private books belong only in ignored local storage and must never become fixtures, screenshots, logs, or release assets. To attach a page profile to a specific private upload during development, set `LEXORA_BOOK_PROFILE_CHECKSUM` and `LEXORA_BOOK_PROFILE_EDITION_KEY`; the repository itself ships no source-specific profile.

## Verification

```powershell
# AI service: production-safe suite without PaddleOCR
docker compose --profile test run --rm --build ai-test

# Backend
cd backend
./mvnw.cmd test

# Frontend
cd ../frontend
npm ci
npm test -- --run
npm run build
npm run test:e2e
npm run test:e2e:production
```

The mocked browser suite uses generated public-safe data. The opt-in full-stack suite accepts book IDs and representative pages only through process-local environment variables; see [the release runbook](docs/public-release.md#verification) rather than committing private identifiers.

## Reproduce the public assets

With the production stack at `http://127.0.0.1:18088`:

```powershell
cd frontend
$env:LEXORA_CAPTURE_BASE_URL = 'http://127.0.0.1:18088'
npm run capture:release

cd ../video
npm ci
npm run render
npm run poster
```

The capture script first verifies that `/api/public-demo` declares real precomputed provider provenance, is read-only, and cannot trigger analysis. Remotion renders a 66-second 1080p H.264 film from those real UI states with a two-worker memory boundary.

## Public versus private

Safe, intentional release material lives in:

- `backend/src/main/resources/demo/` — original synthetic PDF, real normalized MiMo analyses, provenance, and public answer-key data;
- `frontend/public/release/` — selected screenshots, social image, poster, and final MP4;
- `video/public/evidence/` — real curated-demo states used by Remotion.

The private workbook, derived page captures, OCR dumps, answer-key dumps, provider payloads, local storage, credentials, and temporary browser/render output are not public assets and are not included.

## Current limits

- No authentication, accounts, cloud answer sync, vocabulary system, translation, book chat, or generated explanations.
- Not every publisher layout or answer-key shape is supported; unresolved content stays explicit.
- Public deployment, domain/DNS, and TLS remain deployment-time operations.
- No license has been selected. Adding one is an owner/legal decision; until then, all rights are reserved.

# Public precomputed demo and private AI runbook

Lexora has two deliberately separate runtime modes. The public portfolio serves a frozen real MiMo dataset with no inference capability. The local/private runtime keeps upload and real OpenCode Go processing available to the owner from the same repository.

## Choose the runtime

| Runtime | Services | Provider credential | Upload/process | Default exposure |
|---|---|---:|---:|---|
| Public demo | `frontend`, `backend`, `postgres` | Not present | Blocked | `127.0.0.1:8088` |
| Local/private AI | Public services plus `ai-service` | Required locally | Enabled | Loopback-only ports |
| Local OCR development | Four development services | Not required | Enabled | Loopback-only ports |

The public mode is NOT a fake fixture: its committed `PageAnalysis` files are the normalized, validated results of a bounded real OpenCode Go / MiMo V2.5 run over the exact committed PDF. Runtime inference is unnecessary because that work has already happened once.

## Public demo

```powershell
$env:POSTGRES_PASSWORD = '<strong-random-secret>'
$env:LEXORA_HTTP_PORT = '8088' # optional
docker compose -p lexora-public -f compose.production.yml up -d --build --wait
```

Open `http://127.0.0.1:8088` or `http://127.0.0.1:8088/demo`.

Expected boundary:

- `compose.production.yml` contains no `ai-service` and no OpenCode Go environment variable;
- `GET /api/public-demo` reports `precomputed-real-read-only`, `opencode-go`, `mimo-v2.5`, and `analysisTriggering: false`;
- Classic streams `demo/lexora-synthetic-workbook.pdf`;
- Interactive reads the four committed `page-analysis-*.json` projections;
- upload, processing, answer-key extraction, mutations, and non-demo UUIDs are rejected;
- browsing never creates an outbound provider request.

Stop only this isolated stack with:

```powershell
docker compose -p lexora-public -f compose.production.yml down
```

Do not add `-v`; the database and storage volumes are intentionally preserved.

## Local/private AI mode

Copy the example environment once, then add the authorized key only to the ignored local `.env`:

```powershell
Copy-Item .env.example .env
# Edit .env locally: OPENCODE_GO_API_KEY=<authorized key>
$env:LEXORA_ANALYSIS_PROVIDER = 'opencode-go'
$env:LEXORA_AI_DOCKER_TARGET = 'production'
$env:LEXORA_PROVIDER_TIMEOUT_SECONDS = '240'
docker compose -p lexora-private -f docker-compose.yml up -d --build --wait
```

Open `http://127.0.0.1:5173`. The exact workflow is:

```text
owner PDF upload
  -> PDFBox rasterization (160 DPI default)
  -> private FastAPI service
  -> OpenCode Go / MiMo V2.5
  -> strict PageAnalysis validation and choice normalization
  -> PostgreSQL persistence
  -> Interactive or Classic reader
```

Required environment:

| Variable | Requirement |
|---|---|
| `OPENCODE_GO_API_KEY` | Required; local `.env` or process environment only |
| `LEXORA_ANALYSIS_PROVIDER` | `opencode-go` |
| `LEXORA_AI_DOCKER_TARGET` | `production` avoids installing local OCR dependencies |
| `OPENCODE_GO_MODEL` | Optional; defaults to `mimo-v2.5` |
| `OPENCODE_GO_BASE_URL` | Optional; defaults to the OpenCode Go chat-completions endpoint |
| `LEXORA_PROVIDER_TIMEOUT_SECONDS` | Optional; `240` is recommended for the bounded Vision request |

This mode requires Internet access and is therefore called **local/private AI runtime**, not offline mode. Never publish its frontend, backend, AI, or database ports.

## Frozen dataset and provenance

| Artifact | Purpose |
|---|---|
| `backend/src/main/resources/demo/lexora-synthetic-workbook.pdf` | Original four-page public source |
| `backend/src/main/resources/demo/page-analysis-1.json` through `page-analysis-4.json` | Validated normalized MiMo output |
| `backend/src/main/resources/demo/provenance.json` | Provider, model, endpoint, schema, source SHA-256, accepted timestamps, and bounded attempt count |
| `backend/src/main/resources/demo/answer-key.json` | Public correction authority for the synthetic exercises |

`scripts/freeze-public-demo-analysis.py` performs no inference. It only reads already persisted `READY` pages from a private run, verifies provider/schema metadata, applies the same deterministic same-row choice normalization as the live provider, and writes the safe fixtures. Raw provider envelopes, authorization headers, and credentials are never stored.

## Security verification

Verify the public stack through its published Nginx port:

- allowed: landing assets, public metadata, demo book, source PDF, demo pages, correction reads;
- blocked: upload, page processing/reanalysis, answer-key extraction, deletion/mutation, non-demo UUIDs, encoded non-demo paths, and method override attempts;
- malformed UUIDs must produce a client error without exposing book data;
- `docker compose ... config` and container inspection must show no `OPENCODE_GO_API_KEY` in the public service environment;
- the public project must contain exactly three services and no AI container.

Because anonymous inference does not exist, CAPTCHA or Turnstile is unnecessary. Normal Nginx request limits and security headers remain.

## Verification commands

```powershell
# AI service (light suite, no PaddleOCR)
cd ai-service
python -m pytest --ignore=tests/test_ocr.py

# Backend
cd ../backend
./mvnw.cmd test

# Frontend
cd ../frontend
npm ci
npm test -- --run
npm run build
npm run test:e2e
npm run test:e2e:production

# Repository secret scan
cd ..
gitleaks git --redact
```

Run production Docker and live public-boundary/browser proofs with the isolated `lexora-public` project before pushing. Do not use destructive volume cleanup to obtain a clean test.

## Go-live boundary

Repository completion does not deploy a VPS or change DNS/TLS. A future deployment should use the exact green commit, a strong PostgreSQL password outside Git, the loopback-bound Compose stack behind the approved reverse proxy, and another read-only smoke through the real public URL.

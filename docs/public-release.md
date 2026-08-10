# Public release runbook

This runbook describes the safe handoff from the repository release candidate to a future public deployment. It does not authorize or perform deployment, DNS, TLS, account, secret, or infrastructure changes.

## Runtime modes

| Mode | Provider | Upload/process surface | Intended use |
|---|---|---|---|
| Development Compose | `local-ocr` | Available for local private work | OCR compatibility and product development |
| Production Compose | `openai` | Curated demo is read-only | Public portfolio runtime and deployment smoke |

`compose.production.yml` is the production source of truth. Its AI image contains the provider client and image/contract code only; it does not contain PaddleOCR, PaddlePaddle, OpenCV, local OCR modules, model caches, or a CPU fallback.

## Required production configuration

| Variable | Required | Purpose |
|---|---:|---|
| `POSTGRES_PASSWORD` | Yes | Database credential; choose a strong external value |
| `OPENAI_API_KEY` | Yes | Authorized server-side provider credential |
| `OPENAI_VISION_MODEL` | No | Defaults to `gpt-5.4-mini` |
| `OPENAI_API_BASE_URL` | No | Defaults to the HTTPS Responses endpoint |
| `LEXORA_HTTP_PORT` | No | Loopback port, default `8088` |
| `LEXORA_BIND_ADDRESS` | No | Default `127.0.0.1`; changing this is a deliberate deployment action |
| `LEXORA_PROVIDER_TIMEOUT_SECONDS` | No | Provider deadline, default `90` |
| `LEXORA_MAX_IMAGE_BYTES` | No | Provider image limit, default 10 MiB |

Never place real values in `.env.example`, Compose files, screenshots, logs, test fixtures, shell history shared in reports, or Git.

## Local production proof

```powershell
$env:POSTGRES_PASSWORD = '<strong-random-secret>'
$env:OPENAI_API_KEY = '<authorized-provider-key>'
$env:LEXORA_HTTP_PORT = '8088'
docker compose -f compose.production.yml up -d --build --wait
docker compose -f compose.production.yml ps
```

Expected checks:

- `GET /health` reaches the Nginx health endpoint;
- `GET /api/public-demo` reports `curated-read-only` and `analysisTriggering: false`;
- `GET /api/books` contains only the synthetic demo book;
- demo book/page/source reads work;
- upload, process, delete, correction mutation, and non-demo book reads are blocked;
- landing, `/demo`, Classic Mode, and Interactive Mode work through the published Nginx port;
- AI-service logs show no provider request when browsing the curated demo.

The reverse proxy must terminate real TLS, preserve forwarded headers, enforce the intended host/domain, and keep backend, AI, database, and storage private. Domain, DNS, certificates, authentication decisions, and VPS changes remain outside this repository task.

## Verification

Run the regular suites from the README, then verify the built production images and stack. The opt-in private full-stack suite accepts configuration only through local environment variables:

```powershell
$env:LEXORA_E2E_BASE_URL = 'http://127.0.0.1:5173'
$env:LEXORA_E2E_BOOK_ID = '<local-profiled-book-id>'
$env:LEXORA_E2E_RESOLVED_PAGE = '<resolved-page>'
$env:LEXORA_E2E_CHOICE_PAGE = '<choice-page>'
$env:LEXORA_E2E_GRID_PAGE = '<choice-grid-page>'
$env:LEXORA_E2E_ORDERING_PAGE = '<ordering-page>'
$env:LEXORA_E2E_MATCHING_PAGE = '<matching-page>'
$env:LEXORA_E2E_FREE_TEXT_PAGE = '<free-text-page>'
$env:LEXORA_E2E_UNSUPPORTED_PAGE = '<unsupported-page>'
cd frontend
npm run test:e2e:full-stack
```

Do not paste those values into tracked configuration or CI.

## Provider smoke boundary

A real provider smoke is deliberately small: one external Vision request, one synthetic public-safe image, no private source, and no retained raw provider payload. Run it only when an already-authorized credential is available through the intended project environment. A missing credential is a predeployment validation item; it is not a reason to weaken startup validation or add a local OCR production fallback.

## Public asset inventory

- `frontend/public/release/lexora-interactive.webp`
- `frontend/public/release/lexora-classic.webp`
- `frontend/public/release/lexora-mobile.webp`
- `frontend/public/release/lexora-landing.webp`
- `frontend/public/release/lexora-social.png`
- `frontend/public/release/lexora-demo-poster.png`
- `frontend/public/release/lexora-demo.mp4`
- `video/public/evidence/*.webp`

These assets come from the synthetic curated demo. Temporary Playwright results, Remotion review frames, private workbook media, OCR/answer-key dumps, and raw provider responses are not release assets.

## Go-live preflight

- Use real production secrets outside Git.
- Run the bounded real-provider smoke with synthetic input.
- Verify the exact deployed commit and green CI.
- Configure the owner-approved domain, DNS, TLS, reverse proxy, and authentication/abuse controls.
- Re-run landing, demo, Classic, Interactive, health, security-header, and mutation-blocking smoke tests through the real public URL.
- Confirm logs and observability do not retain private page or provider payload content.

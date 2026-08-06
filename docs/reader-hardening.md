# Reader hardening (lifecycle / reliability pass)

Branch: `reader-hardening` — runs in parallel with PoC 5 Matching. Scope is
frontend reader lifecycle reliability only. No interaction types were added,
no detectors were touched, no roadmap status was changed.

## Concrete bugs found and fixed

1. **Stale restoration clobbering a newer upload**
   The F5 restore effect runs three fetches with no ownership token. If the
   user uploads a book while a restoration is still in flight, the late
   restore completion overwrote the freshly uploaded book (and a late restore
   *failure* removed `lexora.currentBookId` and dropped the app back to
   `idle`, evicting the uploaded book). Fixed with a monotonic
   `uploadTokenRef` checked after every await in `handleUpload` and in the
   restore effect (success and catch paths). Last user action always wins.

2. **Overlapping uploads resolving out of order**
   Two rapid uploads could apply in reverse order (the first upload's late
   `POST`/`arrayBuffer` completion overwrote the second book's state). The
   same `uploadTokenRef` makes uploads last-write-wins.

3. **Previous page's rotation drawn on the target page during navigation**
   `selectPage` cleared the interaction but left `rotation` at the old page's
   value. The canvas render effect draws with the stale rotation while the
   page resource fetch is still pending, so the new page could briefly appear
   at the old page's rotation (canvas is hidden by `.page-container-loading`
   until ready, then revealed rotated until `showPage` applies the target's
   rotation). Fixed by preloading the target page's saved rotation
   (`readPageRotation`) inside `selectPage`, so the canvas is never drawn
   with the previous page's geometry.

3b. **Rotation of unprocessed pages lost on navigation and F5**
   For a page with no backend resource row (never processed), the pages fetch
   resolves without it and `showPage(null)` unconditionally reset rotation to
   0 — so rotating an unprocessed page and navigating away/back (or reloading)
   silently discarded the rotation, even though the rotation store held it.
   `showPage` now only applies a rotation read when a page resource exists;
   otherwise the rotation state (preloaded by `selectPage`/restore) is left
   untouched. Restore also preloads the restored page's rotation. Reproduced
   live in the browser before fixing.

4. **Polling all pages during processing**
   The in-flight processing poll called `getBookPages` (full book, every page
   analysis re-parsed) every 250 ms, including ticks while the target page
   was not the visible page. Now the poll skips ticks when the target page is
   not visible and fetches only the target page via the dedicated
   `GET /api/books/{bookId}/pages/{pageNumber}` endpoint (`getBookPage`).
   A 404 is tolerated (the backend may not have inserted the page row yet).

5. **Stuck processing shell after F5**
   After a refresh during processing, the backend job keeps running but no
   browser request tracks it; the restored page could stay in a processing
   shell forever even after the backend finished. Added a bounded, read-only
   tracker poll (`useProcessingRecoveryTracker`, 1 s interval, max 60 ticks)
   that follows an active-stage current page to its terminal state when no
   user-initiated request is in flight. The interval self-terminates at the
   tick cap even if a tick's request never settles, is cleared on READY/
   FAILED, and every response is checked against the current page before
   applying. Transient in-flight UI is still never persisted; the backend
   page status remains authoritative.

6. **One corrupted analysis JSON breaking the whole page list**
   `parsePage` ran `JSON.parse(page.analysis)` unguarded, so a single
   unparseable analysis string rejected the entire `getBookPages` promise and
   left the reader unable to load any page state. `parsePage` now treats an
   unparseable analysis as absent (with a `console.warn`), keeping the rest
   of the list usable.

7. **Preference readers crashing on storage access**
   `readBooleanPreference` / `readOrderingModePreference` could throw when
   storage access itself fails (e.g. disabled storage), crashing the app at
   mount. Both now fall back to their defaults.

8. **Failed `Update analysis` blanked out a working page**
   The backend contract retains the previous analysis on a failed forced
   refresh (`BookPage.markFailed` keeps `analysis`;
   `forcedRefreshFailureRetainsPreviousAnalysis` covers it), but `showPage`
   only accepted analysis for READY pages, so a failed refresh erased the
   page's overlays and answers. `showPage` now also surfaces retained analysis
   on FAILED pages (active stages still render no overlays, preserving the
   accepted processing behavior).

## Audit conclusions (no change needed)

- **Page fetch effect is race-free.** The `selectedPage` effect aborts its
  controller in cleanup and React flushes discrete-event updates
  synchronously, so a stale fetch completion can never `showPage` for a page
  that is no longer requested. Guarded by lifecycle, not global state.
- **PDF.js render lifecycle is sound.** Render tasks are cancelled on effect
  teardown; `RenderingCancelledException` and post-cancellation rejections are
  suppressed by the per-effect `cancelled` flag; `useLayoutEffect` resets
  canvas readiness on `[pdfDoc, pageNumber, zoom, rotation]`; the document is
  destroyed via `loadingTask.destroy()` on replace/unmount; `.page-container-
  loading` hides the container while not ready, so stale canvas writes are
  never visible.
- **Processing target identity is correct.** `processingTarget` carries
  `{bookId, pageNumber}`; `currentPageStage` never derives a processing stage
  for a page that is not the target; completion/poll results are dropped when
  `activePage` no longer matches. Single-flight is enforced by
  `processingInFlight`.
- **Answers are page/book isolated** with geometry+schema fingerprints;
  stale fingerprints are ignored. Cleared answers are dropped, not restored.
- **Zoom persists and validates** (whitelisted options, defaults on garbage).
- **Rotation store validates** every value through `isPageRotation`.
- **No listener/timer/observer leaks** found: ChoiceSelector window
  listeners, reduced-motion media query, processing-position scroll/resize/
  ResizeObserver, ProcessingDetail interval, persist timer and beforeunload
  flush all have correct teardown.

## Lifecycle guarantees

- A result for book A / page 33 can never overwrite visible state for
  book A / page 39 (token guards for document selection; active-page checks
  for processing; effect cleanup + abort for page fetches; cancelled flags +
  render task cancellation for PDF work).
- Navigation is never blocked; processing runs in the background; unrelated
  pages stay readable and never inherit a processing shell.
- Unprocessed pages keep the Process affordance even while their resource is
  still loading (a null page resource is a legitimate "never processed"
  state, so the button is intentionally not disabled during the fetch).
- After F5, persisted backend page status is authoritative. Only
  intentionally persisted state (book id, page, zoom, per-page rotation,
  per-page answers, ordering mode) survives; in-flight request UI does not.

## Tests added

- `frontend/src/__tests__/App.test.tsx` (new, jsdom + Testing Library):
  - stale restoration cannot clobber a newer upload;
  - stale restoration failure cannot evict a freshly uploaded book;
  - the later of two overlapping uploads wins;
  - navigation applies the target page's saved rotation immediately
    (regression for the rotation flash);
  - rotation of an unprocessed page survives navigating away and back;
  - F5 restore preloads the saved rotation of an unprocessed page;
  - unprocessed pages keep the Process affordance while the resource loads;
  - a FAILED page keeps its retained analysis visible after a failed
    Update analysis.
- `frontend/src/api/__tests__/client.test.ts`:
  - `getBookPage` hits the single-page endpoint and parses it;
  - 404 surfaces its HTTP status on the error;
  - one corrupted analysis JSON cannot break the page list.
- `frontend/src/state/__tests__/preferences.test.ts`:
  - boolean/ordering-mode readers fall back when storage access throws.
- `frontend/src/reader/__tests__/useProcessingRecovery.test.tsx` (new):
  - no polling without an active stage / while a user request owns
    processing / when disabled;
  - fetches only the current book and page;
  - stops promptly on READY and FAILED;
  - self-terminates at the tick cap while the page stays active, including
    when a tick request never settles;
  - a response for a page the user left is never applied;
  - navigation away stops the poll; unmount aborts the in-flight request.

## Known remaining reader limitations

- **F5 during processing**: the tracker poll covers the normal case (backend
  finishes within ~60 s); a job that runs longer than the cap leaves the
  page shell until the user navigates away and back.
- **A READY page whose analysis JSON is corrupted** (handled without crashing
  the list) shows as READY-without-analysis: the Process/Update button is
  disabled (`'none'` action) and no in-app recovery exists. Requires a
  backend refresh contract change.

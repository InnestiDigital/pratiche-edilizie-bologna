# CLAUDE.md — pratiche-edilizie-bologna

Guidance for Claude / contributors working in this repo. Read once before touching code.

## What this app is

Offline browser for **Comune di Bologna building-permit open data**. A user in Bologna picks the
quartieri (districts), filing types, and topic tags they care about; the app syncs the matching permits
from `opendata.comune.bologna.it` into a **local SQLite database** and shows them in a feed that works
fully offline. A background task periodically re-syncs and fires a **local** push notification when new
or updated permits land.

- **No backend, no accounts, no analytics.** Everything runs on-device. The only network calls are
  read-only GETs to the Bologna open-data API.
- On the App Store: v1.0.0 already approved by Apple, so the `1.0.0` version train is **closed** — ship
  updates as `1.0.1`+. Bundle id `it.innesti.praticheediliziebologna` (iOS + Android). Owner/EAS account:
  `mottaviani.dev` (InnestiDigital).
- Italian-only UI (hardcoded copy — there is no runtime i18n framework; `assets/lang/it.json` is only the
  iOS `InfoPlist` localization).

## Stack

- **Expo SDK 54**, React Native 0.81, React 19, **expo-router** v6 (file-based routing under `app/`).
- **expo-sqlite** for local storage; **NativeWind** (Tailwind) for styling.
- **expo-background-fetch** + **expo-task-manager** for periodic background sync; **expo-notifications**
  for local notifications.
- **zod** for validating the open-data payload at the sync ingress boundary.
- **vitest** for unit tests (pure `lib/` logic only — no native modules, no Metro).

## Commands

```bash
npm start          # Expo dev server (do NOT run in an unattended/headless loop — it never exits)
npm run test       # vitest run (the pure lib/ suite) — this is the green-before-ship gate
npm run test:watch # vitest in watch mode
npm run lint       # eslint + prettier -c  (must exit 0 before shipping)
npm run format     # eslint --fix + prettier --write
npx tsc --noEmit   # typecheck
```

Do **not** boot a simulator / Metro to verify a change in CI or a headless run — the test + lint + tsc
trio is the gate. `npm start`, `expo run:*`, and EAS builds are interactive/heavy and out of scope there.

### Seeing the UI without a device (web screenshot build)

The app has no CI screenshot step and a headless loop can't boot a simulator, so **UI regressions
went unseen**. The fix: the app can be exported to **web** and screenshotted with headless Chromium.

`npx expo export --platform web` renders the *real* screens (through the real expo-router + NativeWind)
using **fixture data**, so every screen shows populated, representative content — no SQLite, no network,
no simulator. This works because of the **`lib/*.web.ts` platform shims** (Metro resolves `X.web.ts` over
`X.ts` *only* for the web platform; iOS/Android and vitest keep the plain `X.ts` and never load them):

- `db.web.ts` — the native `db.ts` imports `expo-sqlite`, whose wasm worker breaks the web bundle; the
  shim returns a no-op db handle.
- `queries.web.ts` / `preferences.web.ts` — return the `screenshot-fixtures.ts` permits and an
  "already onboarded" preference set instead of querying SQLite.
- `sync.web.ts` / `background-sync.web.ts` / `notifications.web.ts` — no-op the native-only modules.
- `screenshot-fixtures.ts` — the deterministic sample permits (imported **only** by the `*.web.ts` shims).

These files are **web-only and inert on device** — do not import them from a `.ts` module, and keep their
export surface in sync with the native `.ts` (tsc guards drift). The screenshot runner itself lives in the
git-excluded `.loop/screenshot/` (headless Chromium via `playwright-core`, phone viewport); it writes PNGs
to `.loop/screenshots/`. This is a **UI-review tool, not a web product** — the app does not ship to web.

## Deploy (EAS)

Manual EAS from a dev machine today (owner `mottaviani.dev`); no CI yet. `.github/workflows/eas.yml`
(manual `workflow_dispatch`) exists but is **dormant** until the CI setup below is done.

```bash
eas build  --platform ios --profile production --non-interactive --wait   # cloud build → .ipa
eas submit --platform ios --profile production --latest                   # → App Store Connect (interactive: Apple 2FA)
```

Gotchas — each one cost a rebuild this session, read before shipping:

- **EAS builds from the git commit, not the working tree** — commit `app.json` / `eas.json` changes
  *before* `eas build`, or they won't be in the binary.
- **Version fields live in `app.json`**: `version` = CFBundleShortVersionString, iOS `buildNumber` =
  CFBundleVersion, Android `versionCode`. Both are baked into the `.ipa`, so changing either needs a rebuild.
- **App Store rejects (90062 / 90186):** `buildNumber` must be unique *within a version train*, and an
  approved `version` train is *closed*. Same version + new build → bump `buildNumber`; closed/new version →
  bump `version` (e.g. `1.0.0` → `1.0.1`).
- `autoIncrement: true` with `appVersionSource: "local"` bumps `buildNumber` and writes it back to
  `app.json` (dirty tree) — commit the writeback.
- **Submit auth:** interactive uses Apple 2FA; headless/CI needs an **App Store Connect API key** stored on
  EAS (`eas credentials`), not the `appleId` path (which requires 2FA).
- App Store listing (screenshots, description, "Novità"/release-notes, privacy) is edited in App Store
  Connect — EAS only uploads the binary; you still create the version + Submit for Review by hand.

To enable CI (`eas.yml`): (1) add `EXPO_TOKEN` GitHub secret; (2) store the ASC API key on EAS; (3) flip
`eas.json` → `appVersionSource: "remote"` + run `eas build:version:set` to init the counter — local
`autoIncrement` does **not** persist across runners, so CI would collide. Then Actions → Run workflow does
build + `--auto-submit` server-side.

## Layout

```
app/                     expo-router routes
  _layout.tsx            root stack; DB init + onboarding gate + background-sync registration
  (tabs)/                tab navigator
    index.tsx            permit feed (filters, search, sort, infinite scroll, mark-seen)
    sync.tsx             manual sync screen (recent / full) with progress
    settings.tsx         preferences: zones, filing types, tags, notifications toggle
  permit/[id].tsx        permit detail (opens the Bologna portal record in a web browser)
  onboarding.tsx         first-run zone/filing-type picker
  +not-found.tsx         catch-all for unmatched routes / stale deep links
lib/                     all non-UI logic (this is where tests live)
assets/                  icons, splash, fonts, lang/it.json (iOS InfoPlist strings)
```

## Data layer (`lib/`) — the important part

The sync pipeline is intentionally split into **small pure modules** so the brittle bits are unit-tested
without a device. Layering, ingress → storage:

- `constants.ts` — the three datasets (PDC / SCIA / CILA), their ODS slugs, API base URL + `API_LIMIT`,
  quartieri list, status/tag label maps.
- `fetch-page.ts` — HTTP transport for one page. Validates **beyond `.ok`** (content-type + JSON body),
  `AbortController` timeout + caller-signal cancellation. Throws typed `SyncFetchError` / `SyncTimeoutError`.
- `schemas.ts` — **zod** schema for the ODS response. `parsePage` validates the wire payload at ingress and
  throws typed `SyncIngressError` on shape mismatch — do not trust field shapes off the network.
- `retry.ts` — `withRetry` + `isRetryableSyncError` + full-jitter backoff. Retries transient failures
  (timeout / network / 429 / 5xx); **fails fast** on permanent ones (404/410/4xx, `SyncIngressError`, abort).
- `paginate.ts` — pure offset-pagination walk (`walkPages`) with the ODS `MAX_OFFSET` (9900) hard cap, plus
  `recentYears` / `fullScanYears` window helpers. The ODS API refuses `offset > 9900`, so large datasets are
  swept per-year via the `richiesta_anno_prot` refine.
- `normalize.ts` — one raw ODS record → `NormalizedPermit` (stable `source_id`, status/tag derivation,
  zone from `codvia`, portal source link).
- `upsert-classify.ts` — pure `classifyUpsert`: single source of truth for insert / update / unchanged. Reads
  the `INSERT OR IGNORE` `changes` count so a raced duplicate `source_id` does **not** inflate the new count.
- `sync.ts` — orchestrates `syncRecent` (last 2 years) and `syncFull`, calling the above. DB-coupled glue.
- `db.ts` — SQLite singleton + schema (`permits`, `preferences`, `sync_log`) + generic pref get/set.
- `queries.ts` — feed query builder (dynamic WHERE/IN, sort map, pagination), stats, `getPermitById`,
  `markAllSeen`. Note: tag filtering is post-filtered in JS after the SQL `LIMIT/OFFSET` (SQLite JSON).
- `preferences.ts` / `preferences-decode.ts` — typed user prefs over the `preferences` table; decode side is
  hardened (safe `JSON.parse` + domain-enum validation) so corrupt/legacy stored prefs can't crash load.
- `background-sync.ts` — the `TaskManager` background task: sync → summarize → notify. Gated on the
  notifications pref + OS permission.
- `background-result.ts` — pure `summarizeSyncResults` (totalNew / totalUpdated / hasChanges); sanitizes
  negative / NaN / Infinity / fractional counts so a malformed `SyncResult` can't fire a spurious notification.
- `notification-message.ts` — pure Italian-plural notification body builder (null when nothing changed).
- `notifications.ts` — expo-notifications permission + send wrappers.

**Pattern to follow:** when logic is worth testing but sits inside a device-coupled function, extract the
pure core into its own `lib/*.ts` with a focused `*.test.ts` and have the coupled caller delegate to it.
That is how most of `lib/` was built.

## Engineering rules (TypeScript)

Follow these; don't copy existing violations — fix or flag them.

- **Typed `Error` subclasses**, never mutate an `Error`; callers branch on `instanceof`. See
  `SyncFetchError` / `SyncTimeoutError` / `SyncIngressError`.
- **One error channel per failure.** Prefer rejecting/throwing over dual callback+throw.
- **Validate across the network boundary with a zod schema**, not just TS types (`schemas.ts` at ingress).
- **No `as` to force correctness** — narrow with type guards or a schema parse. (In tests, a single documented
  `as unknown as SQLite.SQLiteDatabase` fake is the accepted boundary exception.)
- **Never silently swallow exceptions** — the one deliberate empty `catch` is the background task returning
  `BackgroundFetchResult.Failed`; that is the OS contract, not a swallow.
- **Parse once at the boundary, pass the typed value down.** Single source of truth per decision (e.g.
  `classifyUpsert`, `summarizeSyncResults`).

## Conventions

- Prettier + eslint (`eslint-config-expo`) enforced; run `npm run format` before committing.
- Italian UI copy lives inline in the screens; keep tone consistent with `onboarding.tsx`.
- Version bumps: `app.json` (`version`, iOS `buildNumber`, Android `versionCode`) — not just `package.json`.
- Tests are Node-only (`vitest`); never import a native Expo module into a test — test the extracted pure core.

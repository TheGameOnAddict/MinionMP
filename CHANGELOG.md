# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.0.8] — 2026-07-23

### Added
- **Aircraft Catalog Folders & Carousel Library** — Aircraft catalog library with folder tabs (`PA-28 WARRIOR`, `PA-34 SENECA`, `GENERAL & ENGINES`) and folder creation in Admin mode.
- **Smart Index & Subpart Editor Auto-Docking** — Auto-docks panel to Top or Bottom based on figure Y-location to prevent obscuring PDF drawing.
- **GPU Docking Motion Choreography** — Smooth 60fps CSS keyframe animation sequence (slides out right and glides in from left).
- **Sidebar-Aware Dynamic Alignment** — Editor panel dynamically shifts left/right to respect left Chapters/Search panel and right Draft Request drawer.
- **Minimize / Expand Floating Status Bar** — Collapses editor into a slim 36px floating status bar for 100% unblocked view.
- **Technician Handoff Safety (`Clear Info`)** — Added `Clear Info` button that purges mechanic info while automatically resetting focus to Mechanic Name input.

### Changed
- **Mouse Scroll & Keyboard Navigation** — `Shift + Mouse Scroll` cycles index blocks while standard mouse wheel scrolls the catalog page normally.
- **Precision Chip Navigation** — `IDX` chips jump & start Index Mode; `FIG` & `PG` chips jump in Normal / Select Mode without activating Index Mode.
- **Brand Palette & Icon Standardization** — Unified brand color token to Minion Yellow (`#F5E050` / `#FAE96F`) and standardized Lucide SVG icons across all toolbar headers and buttons.

---

## [0.0.3] — 2026-03-03

### Added
- **Suggestion & Bug Report system** — A new `MessageSquarePlus` icon button in the Mechanic View header opens a modal where mechanics can submit a 💡 Suggestion or 🐛 Bug Report. The mechanic's name is attached automatically if they've filled it in. Reports are stored in a separate SQLite database (`feedback.db`) in the app's user-data directory, completely isolated from the parts request database.
- **Settings gear menu in Parts Dashboard** — A `Settings2` gear icon button added to the top-right header. Clicking it opens a dropdown panel. The gear icon rotates 45° when the menu is open. The dropdown closes automatically on outside click.
- **View Reports viewer** — Under the settings gear menu, a "View Reports" option opens a full modal listing all submitted suggestions and bug reports. Each entry shows the report type badge, submitting mechanic's name (if provided), timestamp, and message body. Reports can be individually deleted with the trash icon. A count badge on the menu item shows the number of reports on load.
- `FeedbackClient` class (`electron/lib/feedback-client.ts`) — Dedicated SQLite client that creates and manages `feedback.db`. Exposes `addFeedback`, `getFeedback`, and `deleteFeedback` methods.
- Three new IPC channels: `submit-feedback`, `get-feedback`, `delete-feedback` — registered in `electron/main.ts` and added to the preload allowlist in `electron/preload.ts`.

### Added
- **Admin password gate on DB path change** — The database file picker in the Parts Dashboard is now locked behind an admin password. Clicking the DB path button opens an authentication modal; the file browser only opens after a correct password is entered. Incorrect attempts show an inline error without dismissing the modal.
- Admin password stored as a salted SHA-256 hash in `paris-air-settings.json` (`adminPasswordHash` + `adminPasswordSalt`). A cryptographically random 16-byte salt is generated on first run and persisted immediately, making the hash immune to rainbow-table attacks. Defaults to password `admin`.
- Small `Lock` icon added to the DB path button as a visual indicator that the action requires authorization.
- `adminPasswordHash` and `adminPasswordSalt` fields added to the `AppSettings` interface. `loadSettings()` migrates old unsalted settings files by generating a new salt and resetting to the default password on next launch.

### Changed
- **Database path button moved into Settings menu** — The "Change Database" option is no longer a standalone button in the dashboard header. It now lives as a menu item inside the Settings gear dropdown, showing the current database filename as a subtitle and a `Lock` icon on the right edge.
- **Change password always accessible** — The Admin Authentication modal now always shows a "Change password" link, regardless of whether the default password is still active. Previously the link only appeared when the default password was detected. When the default password is active the existing amber "Default password is active. Change it" warning is shown; otherwise a subtle gray "Change password" link is shown instead.
- Dashboard "Ready" action button now only appears when a request's status is `Processing` or `Ready` and none of its line items remain in `New` status, preventing premature status transitions.
- Browser `alert()` dialogs replaced with non-blocking toast notifications in the Mechanic View.
- Toast notifications now animate in and out.
- Number input spinners hidden via CSS for a cleaner appearance.
- Form fields given `min-w-0` to prevent content overflow in flex/grid layouts.
- LaunchPad version string is now read directly from `package.json` at build time via Vite's JSON import, so it no longer needs to be manually updated.

### Fixed
- IPC parser: group header lines that also contain a trailing part entry (e.g. `-54 W123456`) were previously skipped entirely; they are now correctly parsed as part items while still updating the active group context.
- Auto-refresh interval in the Mechanic View mini-dashboard could leak if the component unmounted while the `get-refresh-intervals` IPC call was still in-flight. A `cancelled` flag now prevents the interval from being created after cleanup.
- `handlePickLine` in the Parts Dashboard updated React state unconditionally, even when the underlying IPC writes failed. State is now only updated after both `update-line-filled-qty` and `update-line-status` return success.
- `handleLineFilledQtyChange` in the Parts Dashboard did not check the result of the second `update-line-status` IPC call before updating state, leaving the UI out of sync with the database on failure.
- `change-admin-password` IPC handler accepted empty or whitespace-only strings as a new password. The handler now rejects them before verifying the current password.

### Removed
- Residual `postcss.config.cjs` left over from the Tailwind v4 migration in v0.0.2 (the file had no effect but was unused clutter).

---

## [0.0.2] — 2026-02-20

### Added
- **Excel Export** — Parts Dashboard now includes an Export button that saves the currently visible requests to a `.xlsx` file with a formatted header row, frozen pane, and auto-filter. The containing folder opens automatically after saving.
- **`exceljs`** added as a production dependency and formally declared in `package.json`

### Changed
- Application renamed from **Minion Manager** to **Paris Air Parts Picker**
- Package name changed from `minion-manager` to `paris-air-parts-picker`
- `electron-builder.json5` `appId` updated from `com.minion.manager` to `com.parisair.partspicker`
- Linux `artifactName` changed from a hardcoded string to `${productName}-Setup-${version}.${ext}` (consistent with other platforms)
- Excel export workbook creator metadata updated to match new app name
- SQLite `busy_timeout` set to 5 000 ms on connection open, preventing silent `SQLITE_BUSY` failures under concurrent write load
- **Electron** upgraded from 30 → 40
- **React / React DOM** upgraded from 18 → 19
- **Vite** upgraded from 5 → 7
- **Tailwind CSS** upgraded from 3 → 4 (CSS-first config, no longer uses `tailwind.config.cjs`)
- **ESLint** upgraded from 8 → 9 (flat config — `.eslintrc.cjs` replaced by `eslint.config.js`)
- **TypeScript** upgraded from 5.2 → 5.9
- **electron-builder** upgraded from 24 → 26
- **`@electron/rebuild`** upgraded 3.7.2 → 4.0.3; added as an explicit devDependency so `npm run rebuild` compiles `better-sqlite3` against the correct Electron Node.js runtime
- **`globals`** upgraded 16.5.0 → 17.3.0
- ESLint held at v9 — `eslint-plugin-react-hooks` has no stable release supporting ESLint 10; both will be upgraded together once a stable peer-compatible release is published
- All other dependencies updated to latest stable compatible versions
- Tailwind custom theme colors (`minion-*` palette) migrated from `tailwind.config.cjs` to `@theme {}` block in `src/index.css`
- ESLint linting now uses the `typescript-eslint` meta-package instead of the legacy separate `@typescript-eslint/eslint-plugin` + `@typescript-eslint/parser`
- Tailwind Vite integration now uses `@tailwindcss/vite` plugin instead of PostCSS
- `npm run lint` command simplified (removed legacy `--ext` and `--max-warnings` flags, not supported by ESLint v9)
- Added `npm run install:full` script that handles the complete fresh-install sequence in one command: `npm install --ignore-scripts`, download the Electron binary, then rebuild `better-sqlite3`

### Removed
- `autoprefixer` devDependency (bundled in Tailwind v4)
- `postcss` devDependency (no longer needed; Tailwind v4 uses the Vite plugin)
- `tailwind.config.cjs` (replaced by `@theme {}` in CSS)
- `postcss.config.cjs` (no longer needed)
- `.eslintrc.cjs` (replaced by `eslint.config.js`)
- `electron/lib/excel-client.ts` (leftover file from Excel migration that caused TypeScript errors)

### Fixed
- `electron/preload.ts` — IPC channel allowlist still referenced `get-excel-path` and `change-excel-path` from the previous Excel backend. Updated to `get-db-path` and `change-db-path`, matching the SQLite migration. Without this fix, the database file picker in the Parts Dashboard would throw a runtime error.
- `src/main.tsx` — Removed a leftover `ipcRenderer.on('main-process-message', ...)` listener that referenced a channel not in the preload allowlist, causing a runtime throw on startup.
- `src/components/MechanicForm.tsx` — `text-minion-DEFAULT` is not a valid Tailwind class. Fixed to `text-minion-500`.
- `electron/main.ts` — `let appSettings` changed to `const`; the variable is never reassigned (properties are mutated in-place).
- `electron/main.ts` — `cell` callback parameter in `ws.getRow(1).eachCell(...)` now explicitly typed as `ExcelJS.Cell`, resolving a TypeScript implicit-`any` error.

---

## [0.1.0] — Initial Release

### Added
- Electron + React + TypeScript desktop application for managing parts requests
- **Mechanic View** — submit parts requests by pasting IPC/PDF text or manually entering part numbers
- **Parts Dashboard** — view, filter, and update the status of all open requests
- **LaunchPad** — window picker to open either interface independently
- SQLite backend via `better-sqlite3` for local data persistence (`~/Documents/parts_requests.db`)
- IPC text parser (`src/utils/parser.ts`) that extracts part numbers, quantities, nomenclature, and index groups from pasted IPC/PDF content
- Per-mechanic mini dashboard panel in the Mechanic View for tracking order status
- Order status workflow: New → Processing → Picked → Ready → Fulfilled / Canceled / On Order
- Edit request flow: mechanics can request quantity or cancellation changes on submitted orders
- Settings system (refresh intervals, show/hide manual entry) persisted to `~/Library/Application Support/Paris Air Parts Picker/` (macOS) or equivalent
- Windows installer (NSIS) and portable executable targets via `electron-builder`
- Minion yellow (`#F5E050`) brand color palette

### Fixed
- Parser bug: group header lines (e.g., `-54`, `-48d`) were being processed as part items, causing part numbers to fall back to `'Unknown'`. Added an early `return` after the group header is captured.

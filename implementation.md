# Antigravity IDE Usage Tracker - Implementation Log

## Status Overview

| Milestone | Status | Notes |
|-----------|--------|-------|
| 1. Foundation — Types & Storage | COMPLETE | Types, StorageManager, tests all created |
| 2. Core Tracker | COMPLETE | UsageTracker, ManualDetector, tests |
| 3. Status Bar UI & Extension Wiring | COMPLETE | StatusBar, extension.ts rewrite, package.json |
| 4. Log File Detector | COMPLETE | LogFileDetector, wiring |
| 5. Dashboard Webview | COMPLETE | Message protocol, DashboardPanel, wiring |
| 6. Polish & Packaging | COMPLETE | CompletionDetector, esbuild, integration tests, README, metadata |
| 7. GitHub Open Source Setup | COMPLETE | Community docs, issue templates, repo settings |
| 8. CI/CD & Versioning | NOT STARTED | GitHub Actions, CHANGELOG, semantic versioning |
| 9. VS Code & Antigravity Marketplace Publishing | NOT STARTED | Publisher accounts, .vscodeignore, first publish |
| 10. Documentation & Release Readiness | NOT STARTED | Screenshots, badges, .vscode config, 1.0.0 checklist |

---

## Milestone 1: COMPLETE

### Files Created

#### `src/core/entities/types.ts`
All TypeScript interfaces and types defined:
- `DetectionSource` — union type: `'output-channel' | 'log-file' | 'completion-event' | 'inline-chat' | 'manual'`
- `UsageType` — union type: `'completion' | 'chat' | 'inline-edit' | 'unknown'`
- `RateLimitStatus` — union type: `'ok' | 'warning' | 'critical' | 'unknown'`
- `DetectedEvent` — raw detection event from strategies
- `UsageEvent` — canonical tracked event with id, model, type, source
- `RateLimitSnapshot` — remaining, limit, resetAt, percentUsed
- `DailySummary` — aggregated daily stats (date, totalRequests, byModel, byType, peakRequestsPerMinute)
- `PersistedUsageData` — top-level persisted structure (version, events[], dailySummaries[], lastKnownRateLimit)
- `GlobalSettings` — user preferences (thresholds, limits, tracking toggle, strategies list)
- `UsageSummary` — computed rolling summary for display
- `DetectionStrategy` — interface for pluggable detectors (source, onDetected event, start(), dispose())

#### `src/infrastructure/storage/storage-manager.ts`
`StorageManager` class with:
- Constructor takes `vscode.ExtensionContext`, extracts `workspaceState` and `globalState`
- `loadUsageData()` — reads from workspaceState with caching, returns defaults if empty
- `saveUsageData()` — updates cache, triggers debounced write (5-second debounce)
- `loadSettings()` — reads from globalState, merges with `vscode.workspace.getConfiguration('antigravity')`
- `saveSettings()` — writes to globalState
- `appendEvent()` — adds event to cached data, stores rateLimitSnapshot, triggers save
- `pruneOldData()` — removes events >7 days old, creates DailySummary entries, trims summaries >90 days
- `clearAllData()` — resets to empty defaults
- `dispose()` — clears timer, flushes pending writes
- `migrate()` — schema migration stub (currently v1)
- Storage keys: `antigravity.usageData` (workspace), `antigravity.settings` (global)
- Schema version constant: `SCHEMA_VERSION = 1`

#### `src/test/unit/infrastructure/storage-manager.test.ts`
Tests using MockMemento (in-memory vscode.Memento implementation):
- Loading empty state returns valid defaults
- appendEvent persists data correctly
- appendEvent stores rateLimitSnapshot as lastKnownRateLimit
- pruneOldData removes events older than 7 days
- pruneOldData creates DailySummary from pruned events
- clearAllData resets to empty state
- loadSettings returns defaults when no settings stored
- saveSettings and loadSettings round-trip

### Important Implementation Details
- The `loadSettings()` method merges stored globalState settings with `vscode.workspace.getConfiguration('antigravity')` values, where VSCode config takes precedence for the 4 numeric config properties
- Events use `UsageEvent` type with UUID ids, timestamps, model strings, source tracking
- Debounce uses `setTimeout` with 5-second delay; `dispose()` forces flush
- `pruneOldData()` groups old events by date string (YYYY-MM-DD), calculates peak RPM per minute bucket

---

## Milestone 2: COMPLETE — Core Tracker

### Task 2.1: Implement UsageTracker
**File**: `src/core/services/usage-tracker.service.ts`
- Create `UsageTracker` class implementing `vscode.Disposable`
- Accept `StorageManager` as constructor dependency
- Maintain in-memory rolling windows: last 60s (per-min), last 60min (per-hour), current day
- Implement `registerStrategy(strategy: DetectionStrategy): void` — subscribes to strategy events
- Implement event deduplication (same timestamp window + source correlation, ~500ms window)
- Implement `processDetectedEvent(event: DetectedEvent): UsageEvent` — converts raw detection to canonical event, assigns UUID
- Create `vscode.EventEmitter<UsageSummary>` and expose `onUsageUpdated` event
- Implement `computeSummary(): UsageSummary` — aggregates rolling windows into summary
- Set up 10-second refresh timer to recompute summary (for display freshness even without new events)
- Implement `getRecentEvents(count: number): UsageEvent[]` — for dashboard display
- Implement `dispose()` — cleans up all strategies, timers, and listeners
- **UUID generation**: Use `crypto.randomUUID()` or a simple random string (no external deps needed)
- **Rolling window implementation**: Store events in arrays, filter by timestamp on computation
- **Settings access**: Get thresholds from `StorageManager.loadSettings()` for rateLimitStatus computation

### Task 2.2: Implement Manual Detection Strategy
**File**: `src/infrastructure/detection/manual-detector.ts`
- Create `ManualDetector` class implementing `DetectionStrategy`
- Has `source: 'manual'`
- Uses `vscode.EventEmitter<DetectedEvent>` internally
- Expose `logEvent(): void` method that emits a `DetectedEvent` with source `'manual'`, timestamp `Date.now()`
- `start()` is a no-op (manual detector is always ready)
- `dispose()` disposes the event emitter

### Task 2.3: Write UsageTracker Tests
**File**: `src/test/unit/core/usage-tracker.test.ts`
- Test: processing a DetectedEvent produces correct UsageEvent
- Test: rolling window correctly counts events in last 60 seconds
- Test: rolling window correctly counts events in last 60 minutes
- Test: daily count resets at day boundary
- Test: duplicate events within 500ms window are deduplicated
- Test: summary computation produces correct rateLimitStatus based on thresholds
- Test: events are persisted via StorageManager
- Test: dispose() cleans up all resources
- **Testing approach**: Use MockMemento from storageManager.test.ts (consider extracting to shared test utility)

---

## Milestone 3: COMPLETE — Status Bar UI & Extension Wiring

### Task 3.1: Implement Status Bar Component
**File**: `src/presentation/components/status-bar/status-bar.component.ts`
- Create `StatusBarComponent` class implementing `vscode.Disposable`
- Accept `UsageTracker` as constructor dependency
- Create `StatusBarItem` with `vscode.StatusBarAlignment.Right`, priority 100
- Subscribe to `usageTracker.onUsageUpdated` event
- Text format: `$(zap) AG: {perMin}/min | {dayTotal} today`
- Color-coding via `statusBarItem.backgroundColor`:
  - Default: undefined (no special background)
  - Warning (>warningThresholdPercent): `new vscode.ThemeColor('statusBarItem.warningBackground')`
  - Critical (>criticalThresholdPercent): `new vscode.ThemeColor('statusBarItem.errorBackground')`
- Tooltip: `vscode.MarkdownString` with detailed breakdown (per-min, per-hour, per-day, session total, rate limit %)
- Click command: `antigravity-model-usage.showDashboard`
- `dispose()` disposes status bar item and event subscription

### Task 3.2: Update Extension Entry Point
**File**: `src/extension.ts`
- Remove ALL hello-world stub code
- Import StorageManager, UsageTracker, ManualDetector, StatusBarComponent
- In `activate()`:
  - Instantiate `StorageManager` with context
  - Instantiate `UsageTracker` with StorageManager
  - Instantiate `ManualDetector` and register with UsageTracker
  - Instantiate `StatusBarComponent` with UsageTracker
  - Register commands:
    - `antigravity-model-usage.showDashboard` — placeholder initially (opens info message until Milestone 5)
    - `antigravity-model-usage.resetUsageData` — calls `storageManager.clearAllData()` then shows confirmation
    - `antigravity-model-usage.toggleTracking` — toggles settings.trackingEnabled, saves, shows status
    - `antigravity-model-usage.logManualUsage` — calls `manualDetector.logEvent()`
  - Push all disposables into `context.subscriptions`
- `deactivate()` — minimal, storage flush happens via dispose chain

### Task 3.3: Update package.json
- Change `activationEvents` to `["onStartupFinished"]`
- Replace hello-world command with 4 actual commands
- Add `contributes.configuration` section with `antigravity` properties:
  - `antigravity.estimatedDailyLimit` (number, default 1500, description)
  - `antigravity.estimatedPerMinuteLimit` (number, default 30, description)
  - `antigravity.warningThresholdPercent` (number, default 70, description)
  - `antigravity.criticalThresholdPercent` (number, default 90, description)

### Task 3.4: Verify End-to-End
- Run `npm run compile` — no TypeScript errors
- Run `npm run lint` — no lint errors

---

## Milestone 4: COMPLETE — Log File Detector

### Task 4.1: Discovery
- This is exploratory — need to find where Antigravity IDE extension writes logs
- Known paths to check: `~/.vscode/extensions/`, extension `globalStorageUri`, platform-specific
- Document findings in code comments

### Task 4.2: Implement Log File Detector
**File**: `src/infrastructure/detection/log-file-detector.ts`
- Create `LogFileDetector` class implementing `DetectionStrategy`
- `source: 'log-file'`
- Log path discovery: check known locations, support configurable override via settings
- Use `vscode.workspace.createFileSystemWatcher()` on discovered log directory
- File tailing: track `lastReadPosition` per file, read only new content on `onDidChange`
- Regex-based log line parser (configurable patterns)
- Extract model name, token counts, rate limit info
- Emit `DetectedEvent` for each detected model request
- Handle log rotation (file truncated/replaced — detect via size comparison)
- `start()` — begins watching
- `dispose()` — disposes file watcher

### Task 4.3: Wire into Extension
- In `src/extension.ts`, instantiate `LogFileDetector` and register with UsageTracker
- Graceful fallback if log files not found (log warning, continue)

---

## Milestone 5: COMPLETE — Dashboard Webview

### Files Created

#### `src/presentation/components/dashboard/types.ts`
Message protocol types for extension↔webview communication:
- `DashboardData` — extends `UsageSummary` with `events`, `dailySummaries`, `lastKnownRateLimit`
- `ExtensionToWebviewMessage` — union: `{ type: 'update', data: DashboardData }` | `{ type: 'settings', data: GlobalSettings }`
- `WebviewToExtensionMessage` — union: `{ type: 'updateSettings', data: Partial<GlobalSettings> }` | `{ type: 'resetData' }` | `{ type: 'requestRefresh' }`

#### `src/presentation/components/dashboard/dashboard.component.ts`
`DashboardPanel` class implementing `vscode.Disposable`:
- **Singleton pattern**: static `currentPanel`, static `show()` creates or reveals panel
- **Dependencies**: `UsageTracker`, `StorageManager`, `vscode.ExtensionUri`
- Creates `vscode.window.createWebviewPanel('antigravityDashboard', 'Antigravity Usage', ViewColumn.One, { enableScripts: true })`
- **Live updates**: subscribes to `usageTracker.onUsageUpdated` → posts `'update'` message to webview
- **Message handling** (`onDidReceiveMessage`):
  - `'requestRefresh'` → sends full update + settings
  - `'resetData'` → calls `storageManager.clearAllData()`, sends fresh update
  - `'updateSettings'` → merges partial settings, saves, sends confirmation
- **Panel disposal**: cleans up subscriptions, sets `currentPanel = undefined`
- **HTML generation** (`getHtmlContent`):
  - CSP: `default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-...'`
  - All styles inline using VSCode CSS variables for theme compatibility
  - **Stats cards row**: Per-minute, Per-hour, Today, Session counts
  - **Rate limit gauge**: Color-coded progress bar (green/yellow/red based on `rateLimitStatus`)
  - **Hourly breakdown**: Inline SVG bar chart showing last 24 hours of activity
  - **Daily trend**: Inline SVG sparkline for last 7 days from `dailySummaries`
  - **Recent events table**: Last 50 events with time, model, source, type columns
  - **Settings section**: Editable daily limit, per-minute limit, warning/critical thresholds with Save button
  - **Action buttons**: Save Settings, Reset All Data, Refresh
- **Webview JavaScript** (inline, nonce-protected):
  - Listens for `message` events, dispatches to `renderUpdate()` and `renderSettings()`
  - `renderUpdate()`: updates stats cards, gauge, SVG charts, events table
  - `renderHourlyChart()`: builds SVG bar chart with 24 buckets
  - `renderDailyChart()`: builds SVG sparkline with 7-day data points
  - `renderEvents()`: populates table with reversed (most recent first) events
  - `escapeHtml()`: XSS prevention for model names
  - Posts messages back for settings changes, reset, refresh
- Helper: `getNonce()` generates 32-char random string for CSP

### Files Modified

#### `src/extension.ts`
- Added import for `DashboardPanel` from `presentation/components/dashboard/dashboard.component.js`
- Replaced placeholder `showDashboard` command (`showInformationMessage`) with `DashboardPanel.show(usageTracker, storageManager, context.extensionUri)`

### Verification
- `npm run compile` — no TypeScript errors

---

## Milestone 6: COMPLETE — Polish & Packaging

### Files Created

#### `src/infrastructure/detection/completion-detector.ts`
`CompletionDetector` class implementing `DetectionStrategy`:
- `source: 'completion-event'`
- Monitors `vscode.workspace.onDidChangeTextDocument` for AI-characteristic insertions
- Detects multi-line inserts (>=5 lines) — typical of AI code completions
- Filters non-file schemes (output channels, git, settings)
- 2-second cooldown to avoid rapid-fire emission from chunked inserts
- Estimates tokens at ~4 chars per token
- `start()` subscribes to document change events
- `dispose()` cleans up listener and emitter

#### `esbuild.js`
Production bundling configuration:
- Entry: `src/extension.ts` → `out/extension.js`
- Externals: `vscode`
- Format: `cjs`, platform: `node`, target: `ES2022`
- Production mode: minified, no sourcemaps
- Dev mode: sourcemaps included

### Files Modified

#### `package.json`
- `displayName`: "Antigravity Model Usage Tracker"
- `description`: Updated with detailed feature description
- `categories`: Added "AI"
- `keywords`: Added google-antigravity, usage-tracking, rate-limiting, ai-assistant, model-usage, api-monitoring
- `scripts.vscode:prepublish`: Changed from `npm run compile` to `npm run package`
- `scripts.package`: Added `node esbuild.js --production`
- `devDependencies`: Added `esbuild`

#### `README.md`
Replaced template content with full documentation:
- Features list (status bar, dashboard, detection strategies, configuration, persistence)
- Installation instructions (from source, from VSIX)
- Usage: commands table, status bar behavior, dashboard sections
- Configuration: all `antigravity.*` settings with defaults
- Development commands
- Architecture overview (CLEAN architecture)

#### `src/extension.ts`
- Added import for `CompletionDetector`
- Instantiate and register `CompletionDetector` with `UsageTracker`

#### `src/test/integration/extension.test.ts`
Replaced placeholder test with real integration tests:
- Extension is present and activates
- All 4 commands are registered (showDashboard, logManualUsage, resetUsageData, toggleTracking)
- logManualUsage command executes without error

### Verification
- `npm run compile` — no TypeScript errors
- `npm run lint` — no lint errors
- `npm run package` — esbuild production bundle succeeds

---

## Project Structure (CLEAN Architecture)

```
src/
├── core/                          # Domain layer - Pure business logic (no external dependencies)
│   ├── entities/                  # Core types and interfaces
│   │   └── types.ts               # All domain entities and value objects
│   ├── interfaces/                # Contracts for repositories and services
│   │   ├── storage.interface.ts   # Storage repository contract
│   │   └── detection-strategy.interface.ts
│   └── services/                  # Domain services (business logic)
│       └── usage-tracker.service.ts
│
├── infrastructure/                # Infrastructure layer - External concerns
│   ├── storage/                   # Persistence implementations
│   │   └── storage-manager.ts     # VSCode state storage implementation
│   └── detection/                 # Detection strategy implementations
│       ├── manual-detector.ts
│       ├── log-file-detector.ts
│       └── completion-detector.ts
│
├── presentation/                  # Presentation layer - UI and user interaction
│   ├── controllers/               # Controllers - Handle user input and call use cases
│   │   └── command.controller.ts  # VSCode command handlers
│   └── components/                # Presenters/View components
│       ├── status-bar/
│       │   └── status-bar.component.ts
│       └── dashboard/
│           └── dashboard.component.ts
│
├── test/                          # Tests mirroring the structure
│   ├── unit/
│   │   ├── core/
│   │   └── infrastructure/
│   ├── integration/
│   └── helpers/
│       └── mock-memento.ts
│
└── extension.ts                   # Composition root - Dependency injection and wiring
```

**Architecture Principles**:
- **Core (Domain)**: Contains pure business logic with no dependencies on VSCode API or external frameworks
  - Entities: Core data types (UsageEvent, RateLimitSnapshot, etc.)
  - Interfaces: Contracts for repositories and external services
  - Services: Business logic for tracking and aggregation
- **Infrastructure**: Implements interfaces defined in Core, handles external concerns
  - Storage: VSCode Memento persistence
  - Detection: Log file readers, completion monitors
- **Presentation (Interface Adapters)**: UI and user interaction
  - Controllers: Handle VSCode commands, call use cases
  - Components: Status bar, dashboard webviews (presenters)
- **Dependency Rule**: Dependencies point inward (Presentation → Core ← Infrastructure)
- **Extension.ts**: Composition root where all dependencies are wired together

---

## Architecture Notes

### Data Flow
```
DetectionStrategy (log file, completion, manual)
  → emits DetectedEvent
  → UsageTracker.processDetectedEvent()
  → deduplication check (500ms window)
  → creates UsageEvent (with UUID)
  → StorageManager.appendEvent() (debounced persistence)
  → fires onUsageUpdated event
  → StatusBarComponent updates display
  → DashboardPanel receives live update
```

### Key Design Decisions
1. **Debounced storage writes**: 5-second debounce prevents excessive disk I/O
2. **In-memory rolling windows**: Events stored in arrays, filtered by timestamp for computations
3. **Pluggable detection**: `DetectionStrategy` interface allows adding new detection methods
4. **VSCode config precedence**: `loadSettings()` lets VSCode workspace config override stored settings
5. **Event deduplication**: 500ms window prevents duplicate counting from multiple detection sources

### Import Path Examples (CLEAN Architecture)
- Domain entities: `import { UsageEvent } from '../../core/entities/types.js';`
- Storage interface: `import { IStorageRepository } from '../../core/interfaces/storage.interface.js';`
- Storage implementation: `import { StorageManager } from '../../infrastructure/storage/storage-manager.js';`
- Detection strategy: `import { ManualDetector } from '../../infrastructure/detection/manual-detector.js';`
- Components: `import { StatusBarComponent } from '../../presentation/components/status-bar/status-bar.component.js';`

### Core Interfaces to Create
Before Milestone 2, create these interface files:

**File**: `src/core/interfaces/storage.interface.ts`
- `IStorageRepository` interface with methods: `loadUsageData()`, `saveUsageData()`, `appendEvent()`, `pruneOldData()`, `clearAllData()`
- `ISettingsRepository` interface with methods: `loadSettings()`, `saveSettings()`

**File**: `src/core/interfaces/detection-strategy.interface.ts`
- Move `DetectionStrategy` interface from types.ts to this file
- This interface is the port for all detection implementations

### Existing Project State
- **package.json**: Currently has hello-world command, needs full replacement in Milestone 3
- **tsconfig.json**: Properly configured (ES2022, Node16, strict, sourceMap)
- **eslint.config.mjs**: Standard TypeScript ESLint config (curly, eqeqeq, semi warnings)
- **Test framework**: Mocha + @vscode/test-electron, test runner is `vscode-test` CLI
- **No .vscode directory**: No launch.json or tasks.json exists yet
- **Module resolution**: Uses `.js` extensions in imports (required by Node16 module resolution)

---

## Milestone 7: COMPLETE — GitHub Open Source Project Setup

Establishes the project as a professional open source repository with community guidelines, contributor documentation, and GitHub configuration.

**Prerequisites**: None (can be done in parallel with code milestones)

### Task 7.1: Create CONTRIBUTING.md
**File**: `CONTRIBUTING.md`
- Development setup: clone repo, `npm install`, press F5 to launch Extension Development Host
- Code style: follow existing TypeScript ESLint config, use `.js` extensions in imports (Node16 module resolution)
- Testing requirements: all new features must have unit tests, run `npm test` before submitting
- PR process: fork → feature branch → descriptive commits → reference issue numbers
- Branch naming: `feature/description`, `bugfix/description`, `docs/description`
- Commit message format: conventional commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`)
- Link to Code of Conduct and Security Policy

### Task 7.2: Create CODE_OF_CONDUCT.md
**File**: `CODE_OF_CONDUCT.md`
- Use Contributor Covenant v2.1 (https://www.contributor-covenant.org/version/2/1/code_of_conduct/)
- Update contact email for enforcement with maintainer's email
- Sections: Our Pledge, Our Standards, Enforcement Responsibilities, Scope, Enforcement, Enforcement Guidelines, Attribution

### Task 7.3: Create Issue Templates
**Directory**: `.github/ISSUE_TEMPLATE/`

**File**: `.github/ISSUE_TEMPLATE/bug_report.yml`
- YAML-based form template (not markdown)
- Fields: Extension version, VS Code version, OS, Description, Steps to Reproduce, Expected Behavior, Actual Behavior, Logs/Screenshots
- Auto-labels: `bug`, `needs-triage`

**File**: `.github/ISSUE_TEMPLATE/feature_request.yml`
- Fields: Problem Description, Proposed Solution, Alternatives Considered, Additional Context, Willing to Contribute (checkbox)
- Auto-labels: `enhancement`, `needs-triage`

**File**: `.github/ISSUE_TEMPLATE/config.yml`
- Contact links: documentation, Google AI Developers Forum, security policy for vulnerability reports

### Task 7.4: Create Pull Request Template
**File**: `.github/pull_request_template.md`
- Sections: Description, Related Issue (`Fixes #...`), Type of Change (checkboxes), Testing, Checklist (tests pass, lint passes, no breaking changes)
- Keep concise (under 30 lines)

### Task 7.5: Create SECURITY.md
**File**: `SECURITY.md`
- Supported versions table (initially latest 0.x.x)
- Vulnerability reporting via GitHub Security Advisories (private disclosure)
- Response timeline: acknowledge within 48 hours, weekly updates
- Security best practices: don't commit API keys, report privately first

### Task 7.6: Rewrite README.md
**File**: `README.md` (replace current VSCode template content)
- Badges: version, build status, license, PRs welcome, marketplace installs
- Project description: single paragraph explaining purpose
- Features: real-time tracking, status bar, rate limit warnings, dashboard, pluggable detectors
- Installation: from VS Code Marketplace, from VSIX, from source
- Usage: commands, dashboard, configuration
- Configuration: list all `antigravity.*` settings
- Screenshots placeholder (reference `images/` directory)
- Contributing link → CONTRIBUTING.md
- License: Apache 2.0

### Task 7.7: Configure GitHub Repository Settings
**Via GitHub Web UI** (not code):
- Description: "VSCode extension to track Google Antigravity IDE model usage and rate limits"
- Topics: `vscode-extension`, `google-antigravity`, `rate-limiting`, `usage-tracker`, `ai-tools`, `developer-tools`, `typescript`
- Enable Issues, Discussions (optional), disable Wiki
- Enable Dependabot alerts and security updates
- PR settings: allow squash merging, use PR title for merge commits

### Task 7.8: Configure Branch Protection for `main`
**Via GitHub Web UI** (Settings → Branches → Branch protection rules):
- Require pull request before merging (1 approval, or 0 for solo maintainer initially)
- Dismiss stale approvals on new commits
- Require status checks: `build-and-test` (created in Milestone 8)
- Require branches up to date before merging
- Require conversation resolution before merging

---

## Milestone 8: TODO — CI/CD & Versioning

Automated build, test, and release pipelines using GitHub Actions, plus semantic versioning and changelog management.

**Prerequisites**: Milestone 7 (GitHub repo configured)

### Task 8.1: Create Build and Test Workflow
**File**: `.github/workflows/ci.yml`
- Name: "Build and Test"
- Triggers: `push` to `main`, `pull_request` to `main`
- Matrix strategy: `ubuntu-latest`, `macos-latest`, `windows-latest`
- Node version: 22.x
- Steps: checkout → setup Node → `npm ci` → `npm run lint` → `npm run compile` → `npm test`
- Cache `node_modules` with `actions/cache@v4`
- Concurrency: cancel in-progress runs for same PR

### Task 8.2: Create VSIX Packaging Workflow
**File**: `.github/workflows/package.yml`
- Name: "Package Extension"
- Triggers: `pull_request`, `workflow_dispatch` (manual)
- Steps: checkout → setup Node → `npm ci` → `npm run compile` → `npx vsce package`
- Upload `.vsix` as artifact (`actions/upload-artifact@v4`, 30-day retention)
- Validates packaging on every PR without publishing
- **Dependency**: add `@vscode/vsce` to devDependencies

### Task 8.3: Create Release Workflow
**File**: `.github/workflows/release.yml`
- Name: "Release and Publish"
- Trigger: `push` tags matching `v*.*.*`
- **Job 1 — create-release**:
  - Checkout (full history: `fetch-depth: 0`)
  - `npm ci` → `npm run compile` → `npm test` → `npx vsce package`
  - Extract version from tag: `${GITHUB_REF#refs/tags/v}`
  - Create GitHub Release via `softprops/action-gh-release@v2`
  - Upload `.vsix` as release asset
  - Extract CHANGELOG section for release body
  - Mark pre-release if version contains `-beta`, `-alpha`, `-rc`
- **Job 2 — publish-marketplace** (depends on create-release):
  - Publish to VS Code Marketplace: `npx vsce publish -p $VSCE_PAT`
  - Publish to OpenVSX: `npx ovsx publish -p $OVSX_PAT`
  - **Secrets required**: `VSCE_PAT`, `OVSX_PAT` (see Infrastructure Checklist)

### Task 8.4: Create CHANGELOG.md
**File**: `CHANGELOG.md`
- Format: Keep a Changelog (https://keepachangelog.com/en/1.1.0/)
- Initial content:
  ```
  # Changelog
  All notable changes to this project will be documented in this file.
  Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
  adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

  ## [Unreleased]
  ### Added
  - Initial development in progress

  ## [0.0.1] - YYYY-MM-DD
  ### Added
  - Project structure and TypeScript setup
  - StorageManager for persistent state
  - Type definitions for usage tracking
  ```
- Sections per release: Added, Changed, Deprecated, Removed, Fixed, Security

### Task 8.5: Add Version & Release Scripts to package.json
**File**: `package.json`
- Add scripts:
  - `"version:patch": "npm version patch -m 'chore: release v%s'"`
  - `"version:minor": "npm version minor -m 'chore: release v%s'"`
  - `"version:major": "npm version major -m 'chore: release v%s'"`
  - `"postversion": "git push && git push --tags"` (auto-push after version bump)
- Add devDependencies:
  - `@vscode/vsce` — package and publish to VS Code Marketplace
  - `ovsx` — publish to OpenVSX Registry (Antigravity IDE compatibility)

### Task 8.6: Define Git Tag & Branch Strategy
- **Tags**: `v{major}.{minor}.{patch}` (e.g., `v1.0.0`), pre-release: `v1.0.0-beta.1`
- **Branch strategy**: GitHub Flow (single `main` branch + feature branches)
  - `main`: always deployable, protected
  - Feature branches merged via PR
  - Release: tag commits on main, no separate release branch
  - Hotfix: branch from tag, merge to main, new patch tag
- **Release workflow**: update CHANGELOG → `npm version <patch|minor|major>` → push tags → GitHub Actions handles the rest

---

## Milestone 9: TODO — VS Code & Antigravity Marketplace Publishing

Prepares and publishes the extension to the VS Code Marketplace and OpenVSX Registry (for Antigravity IDE compatibility).

**Prerequisites**: Milestone 6 (esbuild bundling), Milestone 8 (release workflow)

### Task 9.1: Create Azure DevOps Organization and PAT
**Infrastructure setup** (external, one-time):
1. Visit https://dev.azure.com → sign in with Microsoft account → create organization
2. Create Personal Access Token:
   - User icon → Personal Access Tokens → New Token
   - Name: "VSCode Marketplace Publishing"
   - Organization: **All accessible organizations** (required)
   - Scopes: Custom defined → Marketplace → **Manage**
   - Expiration: 1 year (set calendar reminder to renew)
   - **Copy token immediately** — cannot view again
3. Store as GitHub Secret: repo Settings → Secrets → Actions → `VSCE_PAT`

### Task 9.2: Create VS Code Marketplace Publisher
**Infrastructure setup** (external, one-time):
- **Option A (web)**: Visit https://marketplace.visualstudio.com/manage/createpublisher
  - Publisher ID: unique lowercase identifier (e.g., `aaditya-muley`), **cannot change later**
  - Display name, contact email
- **Option B (CLI)**: `npx vsce create-publisher <publisher-id>` (enter PAT when prompted)
- Add `"publisher": "<publisher-id>"` to `package.json`

### Task 9.3: Create OpenVSX Account and Namespace
**Infrastructure setup** (external, one-time) — needed for Antigravity IDE:
1. Visit https://open-vsx.org → sign in with GitHub
2. Request namespace: create issue at https://github.com/EclipseFdn/open-vsx.org/issues
   - Provide publisher name (same as VS Code Marketplace for consistency)
   - **Approval time: 1-3 business days** — request early
3. Generate access token at https://open-vsx.org/user-settings/tokens
4. Store as GitHub Secret: `OVSX_PAT`

### Task 9.4: Create .vscodeignore
**File**: `.vscodeignore`
- Exclude from packaged VSIX:
  ```
  .vscode/**
  .vscode-test/**
  src/**
  out/test/**
  .github/**
  .git/**
  .gitignore
  .DS_Store
  **/*.map
  **/*.ts
  !**/*.d.ts
  tsconfig.json
  eslint.config.mjs
  vsc-extension-quickstart.md
  implementation.md
  CLAUDE.md
  node_modules/**
  package-lock.json
  *.vsix
  ```
- Verify with `npx vsce ls` to list files that would be packaged

### Task 9.5: Update package.json Marketplace Metadata
**File**: `package.json`
- `"publisher": "<publisher-id>"` (from Task 9.2)
- `"displayName": "Antigravity Model Usage Tracker"`
- `"description": "Track Google Antigravity IDE model usage, rate limits, and API consumption with real-time monitoring and visual dashboards."`
- `"repository": { "type": "git", "url": "https://github.com/<username>/antigravity-model-usage.git" }`
- `"homepage": "https://github.com/<username>/antigravity-model-usage#readme"`
- `"bugs": "https://github.com/<username>/antigravity-model-usage/issues"`
- `"categories": ["AI", "Other"]`
- `"keywords": ["google-antigravity", "usage-tracking", "rate-limiting", "ai-assistant", "model-usage", "api-monitoring"]`
- `"icon": "images/icon.png"`
- `"galleryBanner": { "color": "#1e1e1e", "theme": "dark" }`

### Task 9.6: Create Extension Icon
**File**: `images/icon.png`
- Requirements: 128x128 pixels, PNG format
- Design: simple, recognizable at small sizes, related to usage tracking/metrics
- Tools: Figma (free), Canva (free), GIMP, Inkscape, or AI generation
- Can use placeholder initially, replace with professional design later

### Task 9.7: Test Packaging Locally
1. `npx vsce package` → produces `antigravity-model-usage-X.X.X.vsix`
2. `npx vsce ls` → verify no unwanted files included
3. Install VSIX: Command Palette → "Install from VSIX" → test extension loads
4. Check file size (<5MB, ideally <1MB after esbuild bundling)

### Task 9.8: Manual First Publish
1. Update version: `npm version 0.1.0 -m "chore: prepare for initial release"`
2. Update CHANGELOG.md with 0.1.0 release notes
3. Publish to VS Code Marketplace: `npx vsce publish -p <VSCE_PAT>`
4. Publish to OpenVSX: `npx ovsx publish -p <OVSX_PAT>`
5. Verify listings:
   - https://marketplace.visualstudio.com/items?itemName=`<publisher>`.antigravity-model-usage
   - https://open-vsx.org/extension/`<publisher>`/antigravity-model-usage
6. Test marketplace installation: VS Code Extensions → search → install → verify
7. Future releases automated via GitHub Actions release workflow (Task 8.3)

---

## Milestone 10: TODO — Documentation & Release Readiness

Final documentation polish, developer experience setup, and 1.0.0 release preparation.

**Prerequisites**: All previous milestones complete

### Task 10.1: Add Screenshots to README
**Directory**: `images/`
- Capture screenshots of key features:
  - `status-bar.png` — status bar in normal, warning, critical states
  - `dashboard-overview.png` — full dashboard webview
  - `settings.png` — VS Code settings with `antigravity.*` configuration
  - `commands.png` — Command Palette showing extension commands
- Optimize PNGs (ImageOptim, TinyPNG, or `pngquant`), max 1200px width
- Update README.md Features section with inline images

### Task 10.2: Configure .vscode Directory
**File**: `.vscode/launch.json`
- "Run Extension" config: extensionHost launch with `--extensionDevelopmentPath`, preLaunchTask `npm: watch`
- "Extension Tests" config: extensionHost with `--extensionTestsPath`

**File**: `.vscode/tasks.json`
- `npm: watch` (background, default build task)
- `npm: compile` (build group)

**File**: `.vscode/extensions.json`
- Recommendations: `dbaeumer.vscode-eslint`

**File**: `.vscode/settings.json`
- `editor.formatOnSave`, `eslint.validate`, `typescript.tsdk`

### Task 10.3: Add README Badges
**File**: `README.md` (top of file)
- Marketplace version: `https://img.shields.io/visual-studio-marketplace/v/<publisher>.antigravity-model-usage`
- Installs: `https://img.shields.io/visual-studio-marketplace/i/<publisher>.antigravity-model-usage`
- Rating: `https://img.shields.io/visual-studio-marketplace/r/<publisher>.antigravity-model-usage`
- Build status: GitHub Actions workflow badge
- License: `https://img.shields.io/github/license/<username>/antigravity-model-usage`
- PRs Welcome badge

### Task 10.4: 1.0.0 Release Checklist
**Functionality**:
- [ ] All detection strategies implemented and tested
- [ ] Status bar updates correctly (normal, warning, critical)
- [ ] Dashboard webview functional with charts
- [ ] Settings persistence working
- [ ] All commands functional (manual usage, reset data, toggle tracking, show dashboard)
- [ ] All unit tests passing
- [ ] Integration tests passing

**Documentation**:
- [ ] README.md complete with screenshots
- [ ] CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md in place
- [ ] CHANGELOG.md updated with 1.0.0 notes

**Quality**:
- [ ] No TypeScript errors: `npm run compile`
- [ ] No lint errors: `npm run lint`
- [ ] All tests passing: `npm test`
- [ ] VSIX packages successfully: `npx vsce package`
- [ ] Manual testing in clean VS Code install
- [ ] Tested on macOS, Windows, Linux (if possible)

**Release**:
- [ ] `npm version 1.0.0`
- [ ] CHANGELOG.md updated with release date
- [ ] `git push && git push --tags`
- [ ] GitHub Actions publishes to marketplaces
- [ ] Verify marketplace listings updated
- [ ] Announce: social media, relevant communities

---

## Infrastructure & Accounts Checklist

All external accounts, tokens, and infrastructure needed for Milestones 7-10.

### Required Accounts

| Account | Purpose | URL | Cost |
|---------|---------|-----|------|
| GitHub | Repo hosting, Actions CI/CD, issue tracking | https://github.com/signup | Free |
| Azure DevOps | Generate PAT for VS Code Marketplace publishing | https://dev.azure.com | Free |
| VS Code Marketplace Publisher | Publish extension to marketplace | https://marketplace.visualstudio.com/manage/createpublisher | Free |
| OpenVSX (Eclipse Foundation) | Publish for Antigravity IDE compatibility | https://open-vsx.org | Free |

### Required Secrets (GitHub Actions)

| Secret Name | Source | Used By | Purpose |
|-------------|--------|---------|---------|
| `VSCE_PAT` | Azure DevOps Personal Access Token | `release.yml` | Publish to VS Code Marketplace |
| `OVSX_PAT` | OpenVSX Access Token | `release.yml` | Publish to OpenVSX Registry |

**How to add**: Repository → Settings → Secrets and variables → Actions → New repository secret

### Azure DevOps PAT Setup (Step-by-Step)
1. Sign in at https://dev.azure.com with Microsoft account
2. Click user icon (top right) → Personal Access Tokens → + New Token
3. Name: "VSCode Marketplace Publishing"
4. Organization: **All accessible organizations** (critical — must select this)
5. Scopes: Custom defined → Marketplace → **Manage** (check this box)
6. Expiration: 1 year (set calendar reminder to renew before expiry)
7. Click Create → **copy token immediately** (cannot view again after closing)
8. Store in GitHub Secrets as `VSCE_PAT`

### OpenVSX Setup (Step-by-Step)
1. Sign in at https://open-vsx.org with GitHub account
2. Request namespace: file issue at https://github.com/EclipseFdn/open-vsx.org/issues (allow 1-3 business days for approval)
3. After approval: user settings → Access Tokens → Generate New Token
4. Copy token → store in GitHub Secrets as `OVSX_PAT`

### Dev Dependencies to Add

```bash
npm install -D @vscode/vsce ovsx
```

| Package | Purpose |
|---------|---------|
| `@vscode/vsce` | Package `.vsix` files and publish to VS Code Marketplace |
| `ovsx` | Publish to OpenVSX Registry (Antigravity IDE) |

---

## Milestone Dependencies

```
Milestones 1-6 (Code Implementation)
       │
       ├── Milestone 7 (GitHub OSS Setup)        ← can start in parallel with code
       │        │
       │        ▼
       │   Milestone 8 (CI/CD & Versioning)      ← needs GitHub repo configured
       │        │
       ▼        ▼
   Milestone 9 (Marketplace Publishing)          ← needs bundling (M6) + CI/CD (M8)
                │
                ▼
   Milestone 10 (Docs & Release Readiness)       ← needs all prior milestones
                │
                ▼
          1.0.0 Release
```

**Critical path tip**: Request the OpenVSX namespace (Task 9.3) early — it takes 1-3 business days for approval and can be done while working on code milestones.

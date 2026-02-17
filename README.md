# Antigravity Model Usage Tracker

A VS Code extension that tracks Google Antigravity IDE model usage and rate limits, giving developers real-time visibility into their API consumption.

## Features

- **Real-time status bar** — See per-minute and daily usage counts at a glance, with color-coded warnings when approaching rate limits
- **Interactive dashboard** — Full webview panel with stats cards, rate limit gauge, hourly/daily charts, and a recent events table
- **Pluggable detection** — Multiple detection strategies working together:
  - **Log file monitoring** — Tails Antigravity IDE log files for API call patterns
  - **Completion detection** — Identifies AI-generated code insertions via document change analysis
  - **Manual logging** — Log events manually when automatic detection isn't available
- **Configurable thresholds** — Set your own daily/per-minute limits and warning/critical percentages
- **Persistent storage** — Usage data persists across sessions with automatic pruning of old events

## Installation

### From Source
```bash
git clone https://github.com/<username>/antigravity-model-usage.git
cd antigravity-model-usage
npm install
```
Press **F5** in VS Code to launch the Extension Development Host.

### From VSIX
1. Download the `.vsix` file from [Releases](https://github.com/<username>/antigravity-model-usage/releases)
2. In VS Code: Command Palette → **Install from VSIX...**

## Usage

### Commands

Open the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`) and search for:

| Command | Description |
|---------|-------------|
| **Antigravity: Show Usage Dashboard** | Open the interactive dashboard webview |
| **Antigravity: Log Manual Usage** | Record a manual usage event |
| **Antigravity: Reset Usage Data** | Clear all tracked usage data |
| **Antigravity: Toggle Usage Tracking** | Enable or disable usage tracking |

### Status Bar

The status bar item (right side) shows `AG: X/min | Y today`. Click it to open the dashboard.

- **Default background** — usage is within normal range
- **Yellow background** — usage exceeds the warning threshold
- **Red background** — usage exceeds the critical threshold

### Dashboard

The dashboard displays:
- **Stats cards** — per-minute, per-hour, today, and session counts
- **Rate limit gauge** — color-coded progress bar showing daily limit usage
- **Hourly chart** — bar chart of requests over the last 24 hours
- **Daily trend** — sparkline of the last 7 days
- **Recent events** — table of the last 50 detected events
- **Settings** — edit thresholds and limits directly from the dashboard

## Configuration

All settings are available under `antigravity.*` in VS Code Settings:

| Setting | Default | Description |
|---------|---------|-------------|
| `antigravity.estimatedDailyLimit` | `1500` | Estimated daily request limit for your plan |
| `antigravity.estimatedPerMinuteLimit` | `30` | Estimated per-minute request limit |
| `antigravity.warningThresholdPercent` | `70` | Percentage of daily limit to trigger a warning |
| `antigravity.criticalThresholdPercent` | `90` | Percentage of daily limit to trigger a critical alert |

## Development

```bash
npm install          # Install dependencies
npm run compile      # Compile TypeScript
npm run watch        # Watch mode
npm run lint         # Run ESLint
npm test             # Run tests
npm run package      # Bundle with esbuild and package VSIX
```

## Architecture

This extension follows **CLEAN Architecture** with dependencies pointing inward:

```
Presentation → Core ← Infrastructure
```

- **Core** (`src/core/`) — Domain types and business logic (no VS Code dependencies)
- **Infrastructure** (`src/infrastructure/`) — Storage and detection implementations
- **Presentation** (`src/presentation/`) — Status bar, dashboard, and command handlers
- **Composition root** (`src/extension.ts`) — Dependency wiring

## License

[Apache 2.0](LICENSE)

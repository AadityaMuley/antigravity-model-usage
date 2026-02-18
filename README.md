# Antigravity Model Usage Tracker

[![License](https://img.shields.io/github/license/AadityaMuley/antigravity-model-usage)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

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

<!-- Screenshots: uncomment when images are added
![Status Bar](images/status-bar.png)
![Dashboard](images/dashboard-overview.png)
-->

## Installation

### From VS Code Marketplace

Search for **Antigravity Model Usage Tracker** in the Extensions panel.

### From VSIX

1. Download the `.vsix` file from [Releases](https://github.com/AadityaMuley/antigravity-model-usage/releases)
2. In VS Code: Command Palette → **Install from VSIX...**

### From Source

```bash
git clone https://github.com/AadityaMuley/antigravity-model-usage.git
cd antigravity-model-usage
npm install
```

Press **F5** in VS Code to launch the Extension Development Host.

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

### Running Locally for Debugging

1. Open this project in VS Code or Antigravity IDE
2. Run `npm install` if you haven't already
3. Press `fn+F5` (Mac) or `F5` (Windows/Linux) to launch the **Extension Development Host**
   - Alternatively: `Cmd+Shift+P` → **"Debug: Start Debugging"** → select **"Run Extension"**
4. A new IDE window opens with the extension loaded — look for `AG: 0/min | 0 today` in the bottom-right status bar
5. Test the extension:
   - `Cmd+Shift+P` → **"Antigravity: Log Manual Usage"** — run a few times to generate events
   - `Cmd+Shift+P` → **"Antigravity: Show Usage Dashboard"** — opens the dashboard webview
   - Watch the status bar update in real time
6. Stop debugging with `Shift+F5`

> **Note**: Log file detection depends on finding Antigravity IDE log files on your system. Use the **Log Manual Usage** command to generate test events if no logs are detected automatically.

## Architecture

This extension follows **CLEAN Architecture** with dependencies pointing inward:

```
Presentation → Core ← Infrastructure
```

- **Core** (`src/core/`) — Domain types and business logic (no VS Code dependencies)
- **Infrastructure** (`src/infrastructure/`) — Storage and detection implementations
- **Presentation** (`src/presentation/`) — Status bar, dashboard, and command handlers
- **Composition root** (`src/extension.ts`) — Dependency wiring

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, code style, and PR guidelines.

## License

[Apache 2.0](LICENSE)

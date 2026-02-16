import * as vscode from 'vscode';
import { UsageTracker } from '../../../core/services/usage-tracker.service.js';
import { StorageManager } from '../../../infrastructure/storage/storage-manager.js';
import { GlobalSettings, UsageEvent } from '../../../core/entities/types.js';
import { DashboardData, WebviewToExtensionMessage } from './types.js';

export class DashboardPanel implements vscode.Disposable {
    private static currentPanel?: DashboardPanel;

    private readonly panel: vscode.WebviewPanel;
    private readonly usageTracker: UsageTracker;
    private readonly storageManager: StorageManager;
    private readonly extensionUri: vscode.Uri;
    private readonly disposables: vscode.Disposable[] = [];

    static show(
        usageTracker: UsageTracker,
        storageManager: StorageManager,
        extensionUri: vscode.Uri,
    ): void {
        if (DashboardPanel.currentPanel) {
            DashboardPanel.currentPanel.panel.reveal(vscode.ViewColumn.One);
            return;
        }
        DashboardPanel.currentPanel = new DashboardPanel(usageTracker, storageManager, extensionUri);
    }

    private constructor(
        usageTracker: UsageTracker,
        storageManager: StorageManager,
        extensionUri: vscode.Uri,
    ) {
        this.usageTracker = usageTracker;
        this.storageManager = storageManager;
        this.extensionUri = extensionUri;

        this.panel = vscode.window.createWebviewPanel(
            'antigravityDashboard',
            'Antigravity Usage',
            vscode.ViewColumn.One,
            { enableScripts: true },
        );

        this.panel.webview.html = this.getHtmlContent(this.panel.webview);

        this.panel.onDidDispose(() => {
            DashboardPanel.currentPanel = undefined;
            this.dispose();
        }, null, this.disposables);

        this.panel.webview.onDidReceiveMessage(
            (msg: WebviewToExtensionMessage) => this.handleMessage(msg),
            null,
            this.disposables,
        );

        const usageListener = usageTracker.onUsageUpdated(() => {
            this.sendUpdate();
        });
        this.disposables.push(usageListener);

        // Send initial data
        this.sendUpdate();
        this.sendSettings();
    }

    dispose(): void {
        DashboardPanel.currentPanel = undefined;
        for (const d of this.disposables) {
            d.dispose();
        }
        this.disposables.length = 0;
        this.panel.dispose();
    }

    private async handleMessage(msg: WebviewToExtensionMessage): Promise<void> {
        switch (msg.type) {
            case 'requestRefresh':
                this.sendUpdate();
                this.sendSettings();
                break;
            case 'resetData':
                await this.storageManager.clearAllData();
                this.sendUpdate();
                break;
            case 'updateSettings': {
                const current = this.storageManager.loadSettings();
                const merged: GlobalSettings = { ...current, ...msg.data };
                await this.storageManager.saveSettings(merged);
                this.sendSettings();
                this.sendUpdate();
                break;
            }
        }
    }

    private sendUpdate(): void {
        const summary = this.usageTracker.computeSummary();
        const events = this.usageTracker.getRecentEvents(50);
        // We load usage data synchronously from cache for daily summaries
        const settings = this.storageManager.loadSettings();
        void this.storageManager.loadUsageData().then(persisted => {
            const data: DashboardData = {
                ...summary,
                events,
                dailySummaries: persisted.dailySummaries,
                lastKnownRateLimit: persisted.lastKnownRateLimit,
            };
            void this.panel.webview.postMessage({ type: 'update', data });
        });
    }

    private sendSettings(): void {
        const settings = this.storageManager.loadSettings();
        void this.panel.webview.postMessage({ type: 'settings', data: settings });
    }

    private getHtmlContent(webview: vscode.Webview): string {
        const nonce = getNonce();

        return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy"
          content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <title>Antigravity Usage Dashboard</title>
    <style>
        :root {
            --bg: var(--vscode-editor-background);
            --fg: var(--vscode-editor-foreground);
            --card-bg: var(--vscode-editorWidget-background, var(--vscode-sideBar-background, #252526));
            --border: var(--vscode-widget-border, #454545);
            --accent: var(--vscode-focusBorder, #007acc);
            --green: #4ec9b0;
            --yellow: #dcdcaa;
            --red: #f44747;
            --muted: var(--vscode-descriptionForeground, #999);
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: var(--vscode-font-family, system-ui, sans-serif);
            font-size: var(--vscode-font-size, 13px);
            color: var(--fg);
            background: var(--bg);
            padding: 20px;
        }
        h1 { font-size: 1.4em; margin-bottom: 16px; }
        h2 { font-size: 1.1em; margin-bottom: 8px; color: var(--muted); font-weight: 500; }

        .cards {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
            gap: 12px;
            margin-bottom: 20px;
        }
        .card {
            background: var(--card-bg);
            border: 1px solid var(--border);
            border-radius: 6px;
            padding: 14px;
            text-align: center;
        }
        .card .value {
            font-size: 1.8em;
            font-weight: 700;
            line-height: 1.2;
        }
        .card .label {
            color: var(--muted);
            font-size: 0.85em;
            margin-top: 4px;
        }

        .gauge-container {
            background: var(--card-bg);
            border: 1px solid var(--border);
            border-radius: 6px;
            padding: 14px;
            margin-bottom: 20px;
        }
        .gauge-bar {
            width: 100%;
            height: 20px;
            background: var(--border);
            border-radius: 10px;
            overflow: hidden;
            margin-top: 8px;
        }
        .gauge-fill {
            height: 100%;
            border-radius: 10px;
            transition: width 0.3s ease, background-color 0.3s ease;
        }
        .gauge-label {
            display: flex;
            justify-content: space-between;
            margin-top: 4px;
            font-size: 0.85em;
            color: var(--muted);
        }

        .chart-section {
            background: var(--card-bg);
            border: 1px solid var(--border);
            border-radius: 6px;
            padding: 14px;
            margin-bottom: 20px;
        }
        .chart-section svg {
            width: 100%;
            display: block;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 0.9em;
        }
        th, td {
            text-align: left;
            padding: 6px 10px;
            border-bottom: 1px solid var(--border);
        }
        th { color: var(--muted); font-weight: 500; }
        tr:hover { background: rgba(255,255,255,0.03); }

        .settings-section {
            background: var(--card-bg);
            border: 1px solid var(--border);
            border-radius: 6px;
            padding: 14px;
            margin-bottom: 20px;
        }
        .settings-row {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 10px;
        }
        .settings-row label {
            flex: 0 0 200px;
            color: var(--muted);
        }
        .settings-row input {
            flex: 1;
            max-width: 200px;
            padding: 4px 8px;
            background: var(--vscode-input-background, #3c3c3c);
            color: var(--vscode-input-foreground, #ccc);
            border: 1px solid var(--vscode-input-border, #555);
            border-radius: 3px;
        }
        .btn {
            padding: 6px 14px;
            border: none;
            border-radius: 3px;
            cursor: pointer;
            font-size: 0.9em;
        }
        .btn-primary {
            background: var(--accent);
            color: #fff;
        }
        .btn-danger {
            background: var(--red);
            color: #fff;
        }
        .btn-row {
            display: flex;
            gap: 10px;
            margin-top: 12px;
        }
    </style>
</head>
<body>
    <h1>Antigravity Usage Dashboard</h1>

    <!-- Stats Cards -->
    <div class="cards">
        <div class="card">
            <div class="value" id="perMinute">0</div>
            <div class="label">Per Minute</div>
        </div>
        <div class="card">
            <div class="value" id="perHour">0</div>
            <div class="label">Per Hour</div>
        </div>
        <div class="card">
            <div class="value" id="today">0</div>
            <div class="label">Today</div>
        </div>
        <div class="card">
            <div class="value" id="session">0</div>
            <div class="label">Session</div>
        </div>
    </div>

    <!-- Rate Limit Gauge -->
    <div class="gauge-container">
        <h2>Rate Limit Usage</h2>
        <div class="gauge-bar">
            <div class="gauge-fill" id="gaugeFill" style="width:0%; background:var(--green);"></div>
        </div>
        <div class="gauge-label">
            <span id="gaugePercent">0%</span>
            <span id="gaugeStatus">OK</span>
        </div>
    </div>

    <!-- Hourly Breakdown Chart -->
    <div class="chart-section">
        <h2>Last 24 Hours</h2>
        <svg id="hourlyChart" viewBox="0 0 720 120" preserveAspectRatio="none"></svg>
    </div>

    <!-- Daily Trend Chart -->
    <div class="chart-section">
        <h2>Daily Trend (7 Days)</h2>
        <svg id="dailyChart" viewBox="0 0 720 100" preserveAspectRatio="none"></svg>
    </div>

    <!-- Recent Events Table -->
    <div class="chart-section">
        <h2>Recent Events</h2>
        <table>
            <thead>
                <tr><th>Time</th><th>Model</th><th>Source</th><th>Type</th></tr>
            </thead>
            <tbody id="eventsBody"></tbody>
        </table>
    </div>

    <!-- Settings -->
    <div class="settings-section">
        <h2>Settings</h2>
        <div class="settings-row">
            <label for="setDailyLimit">Estimated Daily Limit</label>
            <input type="number" id="setDailyLimit" min="1" />
        </div>
        <div class="settings-row">
            <label for="setPerMinuteLimit">Estimated Per-Minute Limit</label>
            <input type="number" id="setPerMinuteLimit" min="1" />
        </div>
        <div class="settings-row">
            <label for="setWarningThreshold">Warning Threshold (%)</label>
            <input type="number" id="setWarningThreshold" min="1" max="100" />
        </div>
        <div class="settings-row">
            <label for="setCriticalThreshold">Critical Threshold (%)</label>
            <input type="number" id="setCriticalThreshold" min="1" max="100" />
        </div>
        <div class="btn-row">
            <button class="btn btn-primary" id="saveSettingsBtn">Save Settings</button>
            <button class="btn btn-danger" id="resetDataBtn">Reset All Data</button>
            <button class="btn btn-primary" id="refreshBtn">Refresh</button>
        </div>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();

        // DOM refs
        const perMinuteEl = document.getElementById('perMinute');
        const perHourEl = document.getElementById('perHour');
        const todayEl = document.getElementById('today');
        const sessionEl = document.getElementById('session');
        const gaugeFill = document.getElementById('gaugeFill');
        const gaugePercent = document.getElementById('gaugePercent');
        const gaugeStatus = document.getElementById('gaugeStatus');
        const hourlyChart = document.getElementById('hourlyChart');
        const dailyChart = document.getElementById('dailyChart');
        const eventsBody = document.getElementById('eventsBody');

        // Settings inputs
        const setDailyLimit = document.getElementById('setDailyLimit');
        const setPerMinuteLimit = document.getElementById('setPerMinuteLimit');
        const setWarningThreshold = document.getElementById('setWarningThreshold');
        const setCriticalThreshold = document.getElementById('setCriticalThreshold');

        // Message handler
        window.addEventListener('message', (event) => {
            const msg = event.data;
            switch (msg.type) {
                case 'update':
                    renderUpdate(msg.data);
                    break;
                case 'settings':
                    renderSettings(msg.data);
                    break;
            }
        });

        function renderUpdate(data) {
            // Stats cards
            perMinuteEl.textContent = data.currentMinuteCount;
            perHourEl.textContent = data.currentHourCount;
            todayEl.textContent = data.currentDayCount;
            sessionEl.textContent = data.sessionCount;

            // Gauge
            const pct = Math.min(data.rateLimitPercentUsed, 100);
            gaugeFill.style.width = pct + '%';
            gaugePercent.textContent = pct.toFixed(1) + '%';

            let color = 'var(--green)';
            let statusText = 'OK';
            if (data.rateLimitStatus === 'critical') {
                color = 'var(--red)';
                statusText = 'CRITICAL';
            } else if (data.rateLimitStatus === 'warning') {
                color = 'var(--yellow)';
                statusText = 'WARNING';
            }
            gaugeFill.style.backgroundColor = color;
            gaugeStatus.textContent = statusText;

            // Hourly breakdown bar chart
            renderHourlyChart(data.events);

            // Daily trend sparkline
            renderDailyChart(data.dailySummaries, data.currentDayCount);

            // Events table
            renderEvents(data.events);
        }

        function renderHourlyChart(events) {
            const now = Date.now();
            const buckets = new Array(24).fill(0);
            for (const e of events) {
                const hoursAgo = Math.floor((now - e.timestamp) / 3600000);
                if (hoursAgo >= 0 && hoursAgo < 24) {
                    buckets[23 - hoursAgo]++;
                }
            }
            const max = Math.max(...buckets, 1);
            const barW = 720 / 24 - 4;
            let svg = '';
            for (let i = 0; i < 24; i++) {
                const h = (buckets[i] / max) * 100;
                const x = i * (720 / 24) + 2;
                const y = 120 - h;
                svg += '<rect x="' + x + '" y="' + y + '" width="' + barW + '" height="' + h + '" rx="2" fill="var(--accent)" opacity="0.8"/>';
            }
            // X-axis labels (every 6 hours)
            for (let i = 0; i < 24; i += 6) {
                const x = i * (720 / 24) + barW / 2;
                const label = (i - 23) === 0 ? 'now' : (i - 23) + 'h';
                svg += '<text x="' + x + '" y="116" fill="var(--muted)" font-size="9" text-anchor="middle">' + label + '</text>';
            }
            hourlyChart.innerHTML = svg;
        }

        function renderDailyChart(dailySummaries, todayCount) {
            // Build last 7 days of data
            const days = [];
            const today = new Date();
            for (let i = 6; i >= 0; i--) {
                const d = new Date(today);
                d.setDate(d.getDate() - i);
                const key = d.toISOString().slice(0, 10);
                const match = dailySummaries.find(s => s.date === key);
                if (i === 0) {
                    days.push({ date: key, count: todayCount });
                } else {
                    days.push({ date: key, count: match ? match.totalRequests : 0 });
                }
            }
            const max = Math.max(...days.map(d => d.count), 1);
            const points = days.map((d, i) => {
                const x = (i / 6) * 680 + 20;
                const y = 80 - (d.count / max) * 70;
                return x + ',' + y;
            }).join(' ');

            let svg = '<polyline points="' + points + '" fill="none" stroke="var(--accent)" stroke-width="2" />';
            // Dots and labels
            days.forEach((d, i) => {
                const x = (i / 6) * 680 + 20;
                const y = 80 - (d.count / max) * 70;
                svg += '<circle cx="' + x + '" cy="' + y + '" r="3" fill="var(--accent)" />';
                svg += '<text x="' + x + '" y="95" fill="var(--muted)" font-size="9" text-anchor="middle">' + d.date.slice(5) + '</text>';
            });
            dailyChart.innerHTML = svg;
        }

        function renderEvents(events) {
            const reversed = events.slice().reverse();
            let html = '';
            for (const e of reversed) {
                const time = new Date(e.timestamp).toLocaleTimeString();
                html += '<tr><td>' + time + '</td><td>' + escapeHtml(e.model) + '</td><td>' + e.source + '</td><td>' + e.type + '</td></tr>';
            }
            eventsBody.innerHTML = html || '<tr><td colspan="4" style="color:var(--muted);text-align:center;">No events recorded</td></tr>';
        }

        function renderSettings(settings) {
            setDailyLimit.value = settings.estimatedDailyLimit;
            setPerMinuteLimit.value = settings.estimatedPerMinuteLimit;
            setWarningThreshold.value = settings.warningThresholdPercent;
            setCriticalThreshold.value = settings.criticalThresholdPercent;
        }

        function escapeHtml(str) {
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        }

        // Button handlers
        document.getElementById('saveSettingsBtn').addEventListener('click', () => {
            vscode.postMessage({
                type: 'updateSettings',
                data: {
                    estimatedDailyLimit: parseInt(setDailyLimit.value, 10),
                    estimatedPerMinuteLimit: parseInt(setPerMinuteLimit.value, 10),
                    warningThresholdPercent: parseInt(setWarningThreshold.value, 10),
                    criticalThresholdPercent: parseInt(setCriticalThreshold.value, 10),
                },
            });
        });

        document.getElementById('resetDataBtn').addEventListener('click', () => {
            vscode.postMessage({ type: 'resetData' });
        });

        document.getElementById('refreshBtn').addEventListener('click', () => {
            vscode.postMessage({ type: 'requestRefresh' });
        });
    </script>
</body>
</html>`;
    }
}

function getNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let nonce = '';
    for (let i = 0; i < 32; i++) {
        nonce += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return nonce;
}

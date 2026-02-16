import * as vscode from 'vscode';
import { PersistedUsageData, GlobalSettings, UsageEvent, DailySummary, UsageType } from '../../core/entities/types.js';

const USAGE_DATA_KEY = 'antigravity.usageData';
const SETTINGS_KEY = 'antigravity.settings';
const SCHEMA_VERSION = 1;
const DEBOUNCE_MS = 5000;
const MAX_EVENT_AGE_DAYS = 7;

function defaultUsageData(): PersistedUsageData {
    return {
        version: SCHEMA_VERSION,
        events: [],
        dailySummaries: [],
    };
}

function defaultSettings(): GlobalSettings {
    return {
        version: SCHEMA_VERSION,
        warningThresholdPercent: 70,
        criticalThresholdPercent: 90,
        estimatedDailyLimit: 1500,
        estimatedPerMinuteLimit: 30,
        trackingEnabled: true,
        detectionStrategies: ['log-file', 'completion-event', 'manual'],
    };
}

export class StorageManager implements vscode.Disposable {
    private workspaceState: vscode.Memento;
    private globalState: vscode.Memento;
    private cachedData: PersistedUsageData | undefined;
    private debounceTimer: ReturnType<typeof setTimeout> | undefined;
    private pendingSave = false;

    constructor(context: vscode.ExtensionContext) {
        this.workspaceState = context.workspaceState;
        this.globalState = context.globalState;
    }

    async loadUsageData(): Promise<PersistedUsageData> {
        if (this.cachedData) {
            return this.cachedData;
        }
        const raw = this.workspaceState.get<PersistedUsageData>(USAGE_DATA_KEY);
        if (!raw) {
            this.cachedData = defaultUsageData();
            return this.cachedData;
        }
        this.cachedData = this.migrate(raw);
        return this.cachedData;
    }

    saveUsageData(data: PersistedUsageData): void {
        this.cachedData = data;
        this.scheduleSave();
    }

    loadSettings(): GlobalSettings {
        const config = vscode.workspace.getConfiguration('antigravity');
        const stored = this.globalState.get<GlobalSettings>(SETTINGS_KEY);
        const defaults = defaultSettings();

        return {
            ...defaults,
            ...stored,
            // VSCode configuration overrides stored settings
            estimatedDailyLimit: config.get<number>('estimatedDailyLimit', defaults.estimatedDailyLimit),
            estimatedPerMinuteLimit: config.get<number>('estimatedPerMinuteLimit', defaults.estimatedPerMinuteLimit),
            warningThresholdPercent: config.get<number>('warningThresholdPercent', defaults.warningThresholdPercent),
            criticalThresholdPercent: config.get<number>('criticalThresholdPercent', defaults.criticalThresholdPercent),
        };
    }

    async saveSettings(settings: GlobalSettings): Promise<void> {
        await this.globalState.update(SETTINGS_KEY, settings);
    }

    async appendEvent(event: UsageEvent): Promise<void> {
        const data = await this.loadUsageData();
        data.events.push(event);
        if (event.rateLimitSnapshot) {
            data.lastKnownRateLimit = event.rateLimitSnapshot;
        }
        this.saveUsageData(data);
    }

    async pruneOldData(): Promise<void> {
        const data = await this.loadUsageData();
        const cutoff = Date.now() - (MAX_EVENT_AGE_DAYS * 24 * 60 * 60 * 1000);

        const oldEvents = data.events.filter(e => e.timestamp < cutoff);
        const newEvents = data.events.filter(e => e.timestamp >= cutoff);

        // Group old events by date and create daily summaries
        const byDate = new Map<string, UsageEvent[]>();
        for (const event of oldEvents) {
            const date = new Date(event.timestamp).toISOString().slice(0, 10);
            const existing = byDate.get(date) || [];
            existing.push(event);
            byDate.set(date, existing);
        }

        for (const [date, events] of byDate) {
            // Skip if we already have a summary for this date
            if (data.dailySummaries.some(s => s.date === date)) {
                continue;
            }

            const byModel: Record<string, number> = {};
            const byType: Record<UsageType, number> = { completion: 0, chat: 0, 'inline-edit': 0, unknown: 0 };

            for (const event of events) {
                byModel[event.model] = (byModel[event.model] || 0) + 1;
                byType[event.type] = (byType[event.type] || 0) + 1;
            }

            // Calculate peak requests per minute
            const minuteBuckets = new Map<number, number>();
            for (const event of events) {
                const minuteKey = Math.floor(event.timestamp / 60000);
                minuteBuckets.set(minuteKey, (minuteBuckets.get(minuteKey) || 0) + 1);
            }
            const peakRequestsPerMinute = minuteBuckets.size > 0
                ? Math.max(...minuteBuckets.values())
                : 0;

            const summary: DailySummary = {
                date,
                totalRequests: events.length,
                byModel,
                byType,
                peakRequestsPerMinute,
            };
            data.dailySummaries.push(summary);
        }

        // Keep only the last 90 days of summaries
        const summaryCutoff = new Date();
        summaryCutoff.setDate(summaryCutoff.getDate() - 90);
        const summaryCutoffStr = summaryCutoff.toISOString().slice(0, 10);
        data.dailySummaries = data.dailySummaries.filter(s => s.date >= summaryCutoffStr);

        data.events = newEvents;
        this.saveUsageData(data);
    }

    async clearAllData(): Promise<void> {
        this.cachedData = defaultUsageData();
        await this.workspaceState.update(USAGE_DATA_KEY, this.cachedData);
    }

    dispose(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = undefined;
        }
        // Flush any pending writes synchronously
        if (this.pendingSave && this.cachedData) {
            this.workspaceState.update(USAGE_DATA_KEY, this.cachedData);
            this.pendingSave = false;
        }
    }

    private migrate(data: PersistedUsageData): PersistedUsageData {
        // Currently at version 1 — future migrations go here
        if (!data.version || data.version < SCHEMA_VERSION) {
            data.version = SCHEMA_VERSION;
            data.events = data.events || [];
            data.dailySummaries = data.dailySummaries || [];
        }
        return data;
    }

    private scheduleSave(): void {
        this.pendingSave = true;
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        this.debounceTimer = setTimeout(() => {
            this.flushSave();
        }, DEBOUNCE_MS);
    }

    private flushSave(): void {
        if (this.cachedData) {
            this.workspaceState.update(USAGE_DATA_KEY, this.cachedData);
            this.pendingSave = false;
        }
    }
}

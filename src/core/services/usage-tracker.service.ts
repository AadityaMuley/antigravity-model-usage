import * as vscode from 'vscode';
import {
    DetectedEvent,
    UsageEvent,
    UsageSummary,
    DetectionStrategy,
    RateLimitStatus,
    RateLimitSnapshot,
} from '../entities/types.js';
import { StorageManager } from '../../infrastructure/storage/storage-manager.js';

const DEDUP_WINDOW_MS = 500;
const REFRESH_INTERVAL_MS = 10_000;
const ONE_MINUTE_MS = 60_000;
const ONE_HOUR_MS = 3_600_000;

export class UsageTracker implements vscode.Disposable {
    private readonly storageManager: StorageManager;
    private readonly strategies: DetectionStrategy[] = [];
    private readonly strategyListeners: vscode.Disposable[] = [];
    private readonly events: UsageEvent[] = [];
    private refreshTimer: ReturnType<typeof setInterval> | undefined;
    private sessionStart: number;

    private readonly _onUsageUpdated = new vscode.EventEmitter<UsageSummary>();
    public readonly onUsageUpdated: vscode.Event<UsageSummary> = this._onUsageUpdated.event;

    constructor(storageManager: StorageManager) {
        this.storageManager = storageManager;
        this.sessionStart = Date.now();
        this.refreshTimer = setInterval(() => {
            this._onUsageUpdated.fire(this.computeSummary());
        }, REFRESH_INTERVAL_MS);
    }

    registerStrategy(strategy: DetectionStrategy): void {
        this.strategies.push(strategy);
        const listener = strategy.onDetected((event) => {
            this.handleDetectedEvent(event);
        });
        this.strategyListeners.push(listener);
        strategy.start();
    }

    computeSummary(): UsageSummary {
        const now = Date.now();
        const settings = this.storageManager.loadSettings();

        const minuteAgo = now - ONE_MINUTE_MS;
        const hourAgo = now - ONE_HOUR_MS;
        const startOfDay = new Date(now);
        startOfDay.setHours(0, 0, 0, 0);
        const dayStart = startOfDay.getTime();

        const currentMinuteCount = this.events.filter(e => e.timestamp >= minuteAgo).length;
        const currentHourCount = this.events.filter(e => e.timestamp >= hourAgo).length;
        const currentDayCount = this.events.filter(e => e.timestamp >= dayStart).length;
        const sessionCount = this.events.length;

        const rateLimitPercentUsed = settings.estimatedDailyLimit > 0
            ? (currentDayCount / settings.estimatedDailyLimit) * 100
            : 0;

        let rateLimitStatus: RateLimitStatus = 'ok';
        if (rateLimitPercentUsed >= settings.criticalThresholdPercent) {
            rateLimitStatus = 'critical';
        } else if (rateLimitPercentUsed >= settings.warningThresholdPercent) {
            rateLimitStatus = 'warning';
        }

        const lastEvent = this.events.length > 0 ? this.events[this.events.length - 1] : undefined;

        return {
            currentMinuteCount,
            currentHourCount,
            currentDayCount,
            sessionCount,
            rateLimitStatus,
            rateLimitPercentUsed,
            lastEventTimestamp: lastEvent?.timestamp,
        };
    }

    getRecentEvents(count: number): UsageEvent[] {
        return this.events.slice(-count);
    }

    dispose(): void {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = undefined;
        }
        for (const listener of this.strategyListeners) {
            listener.dispose();
        }
        this.strategyListeners.length = 0;
        for (const strategy of this.strategies) {
            strategy.dispose();
        }
        this.strategies.length = 0;
        this._onUsageUpdated.dispose();
    }

    private handleDetectedEvent(detected: DetectedEvent): void {
        if (this.isDuplicate(detected)) {
            return;
        }

        const usageEvent = this.processDetectedEvent(detected);
        this.events.push(usageEvent);
        this.storageManager.appendEvent(usageEvent);

        this._onUsageUpdated.fire(this.computeSummary());
    }

    private processDetectedEvent(detected: DetectedEvent): UsageEvent {
        let rateLimitSnapshot: RateLimitSnapshot | undefined;
        if (detected.rateLimitInfo?.remaining !== undefined
            && detected.rateLimitInfo?.limit !== undefined
            && detected.rateLimitInfo?.resetAt !== undefined
            && detected.rateLimitInfo?.percentUsed !== undefined) {
            rateLimitSnapshot = detected.rateLimitInfo as RateLimitSnapshot;
        }

        return {
            id: crypto.randomUUID(),
            timestamp: detected.timestamp,
            model: detected.modelHint ?? 'unknown',
            type: 'unknown',
            source: detected.source,
            tokenEstimate: detected.tokenEstimate,
            rateLimitSnapshot,
        };
    }

    private isDuplicate(detected: DetectedEvent): boolean {
        for (let i = this.events.length - 1; i >= 0; i--) {
            const existing = this.events[i];
            const timeDiff = Math.abs(detected.timestamp - existing.timestamp);
            if (timeDiff > DEDUP_WINDOW_MS) {
                break;
            }
            if (existing.source === detected.source) {
                return true;
            }
        }
        return false;
    }
}

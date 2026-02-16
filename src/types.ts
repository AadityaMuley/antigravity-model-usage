import * as vscode from 'vscode';

export type DetectionSource = 'output-channel' | 'log-file' | 'completion-event' | 'inline-chat' | 'manual';

export type UsageType = 'completion' | 'chat' | 'inline-edit' | 'unknown';

export type RateLimitStatus = 'ok' | 'warning' | 'critical' | 'unknown';

export interface DetectedEvent {
    timestamp: number;
    source: DetectionSource;
    modelHint?: string;
    tokenEstimate?: number;
    rateLimitInfo?: Partial<RateLimitSnapshot>;
}

export interface UsageEvent {
    id: string;
    timestamp: number;
    model: string;
    type: UsageType;
    source: DetectionSource;
    tokenEstimate?: number;
    rateLimitSnapshot?: RateLimitSnapshot;
}

export interface RateLimitSnapshot {
    remaining: number;
    limit: number;
    resetAt: number;
    percentUsed: number;
}

export interface DailySummary {
    date: string; // YYYY-MM-DD
    totalRequests: number;
    byModel: Record<string, number>;
    byType: Record<UsageType, number>;
    peakRequestsPerMinute: number;
}

export interface PersistedUsageData {
    version: number;
    events: UsageEvent[];
    dailySummaries: DailySummary[];
    lastKnownRateLimit?: RateLimitSnapshot;
}

export interface GlobalSettings {
    version: number;
    warningThresholdPercent: number;
    criticalThresholdPercent: number;
    estimatedDailyLimit: number;
    estimatedPerMinuteLimit: number;
    trackingEnabled: boolean;
    detectionStrategies: DetectionSource[];
}

export interface UsageSummary {
    currentMinuteCount: number;
    currentHourCount: number;
    currentDayCount: number;
    sessionCount: number;
    rateLimitStatus: RateLimitStatus;
    rateLimitPercentUsed: number;
    lastEventTimestamp?: number;
}

export interface DetectionStrategy extends vscode.Disposable {
    readonly source: DetectionSource;
    readonly onDetected: vscode.Event<DetectedEvent>;
    start(): void;
}

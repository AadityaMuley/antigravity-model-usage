import {
    UsageSummary,
    UsageEvent,
    DailySummary,
    RateLimitSnapshot,
    GlobalSettings,
} from '../../../core/entities/types.js';

// Data sent from extension to webview on each update
export interface DashboardData extends UsageSummary {
    events: UsageEvent[];
    dailySummaries: DailySummary[];
    lastKnownRateLimit?: RateLimitSnapshot;
}

// Extension → Webview messages
export type ExtensionToWebviewMessage =
    | { type: 'update'; data: DashboardData }
    | { type: 'settings'; data: GlobalSettings };

// Webview → Extension messages
export type WebviewToExtensionMessage =
    | { type: 'updateSettings'; data: Partial<GlobalSettings> }
    | { type: 'resetData' }
    | { type: 'requestRefresh' };

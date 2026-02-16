import * as vscode from 'vscode';
import { UsageSummary } from '../../../core/entities/types.js';
import { UsageTracker } from '../../../core/services/usage-tracker.service.js';

export class StatusBarComponent implements vscode.Disposable {
    private readonly statusBarItem: vscode.StatusBarItem;
    private readonly subscription: vscode.Disposable;

    constructor(usageTracker: UsageTracker) {
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100,
        );
        this.statusBarItem.command = 'antigravity-model-usage.showDashboard';
        this.statusBarItem.show();

        this.update(usageTracker.computeSummary());

        this.subscription = usageTracker.onUsageUpdated((summary) => {
            this.update(summary);
        });
    }

    dispose(): void {
        this.subscription.dispose();
        this.statusBarItem.dispose();
    }

    private update(summary: UsageSummary): void {
        this.statusBarItem.text = `$(zap) AG: ${summary.currentMinuteCount}/min | ${summary.currentDayCount} today`;

        if (summary.rateLimitStatus === 'critical') {
            this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        } else if (summary.rateLimitStatus === 'warning') {
            this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        } else {
            this.statusBarItem.backgroundColor = undefined;
        }

        const tooltip = new vscode.MarkdownString();
        tooltip.appendMarkdown(`**Antigravity Usage**\n\n`);
        tooltip.appendMarkdown(`| Metric | Value |\n|---|---|\n`);
        tooltip.appendMarkdown(`| Per minute | ${summary.currentMinuteCount} |\n`);
        tooltip.appendMarkdown(`| Per hour | ${summary.currentHourCount} |\n`);
        tooltip.appendMarkdown(`| Today | ${summary.currentDayCount} |\n`);
        tooltip.appendMarkdown(`| Session | ${summary.sessionCount} |\n`);
        tooltip.appendMarkdown(`| Rate limit | ${summary.rateLimitPercentUsed.toFixed(1)}% |\n`);
        this.statusBarItem.tooltip = tooltip;
    }
}

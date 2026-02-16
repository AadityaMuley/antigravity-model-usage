import * as vscode from 'vscode';
import { StorageManager } from './infrastructure/storage/storage-manager.js';
import { UsageTracker } from './core/services/usage-tracker.service.js';
import { ManualDetector } from './infrastructure/detection/manual-detector.js';
import { LogFileDetector } from './infrastructure/detection/log-file-detector.js';
import { StatusBarComponent } from './presentation/components/status-bar/status-bar.component.js';

export function activate(context: vscode.ExtensionContext) {
    const storageManager = new StorageManager(context);
    const usageTracker = new UsageTracker(storageManager);

    const manualDetector = new ManualDetector();
    usageTracker.registerStrategy(manualDetector);

    const logFileDetector = new LogFileDetector();
    usageTracker.registerStrategy(logFileDetector);

    const statusBar = new StatusBarComponent(usageTracker);

    context.subscriptions.push(
        vscode.commands.registerCommand('antigravity-model-usage.showDashboard', () => {
            vscode.window.showInformationMessage('Antigravity Usage Dashboard coming soon.');
        }),

        vscode.commands.registerCommand('antigravity-model-usage.resetUsageData', async () => {
            await storageManager.clearAllData();
            vscode.window.showInformationMessage('Antigravity usage data has been reset.');
        }),

        vscode.commands.registerCommand('antigravity-model-usage.toggleTracking', async () => {
            const settings = storageManager.loadSettings();
            settings.trackingEnabled = !settings.trackingEnabled;
            await storageManager.saveSettings(settings);
            vscode.window.showInformationMessage(
                `Antigravity tracking ${settings.trackingEnabled ? 'enabled' : 'disabled'}.`,
            );
        }),

        vscode.commands.registerCommand('antigravity-model-usage.logManualUsage', () => {
            manualDetector.logEvent();
            vscode.window.showInformationMessage('Manual usage event logged.');
        }),

        statusBar,
        usageTracker,
        storageManager,
    );
}

export function deactivate() {}

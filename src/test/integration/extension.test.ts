import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Integration Tests', () => {
    const extensionId = 'undefined_publisher.antigravity-model-usage';

    test('extension is present', () => {
        const ext = vscode.extensions.all.find(e => e.id === extensionId);
        assert.ok(ext, 'Extension should be installed');
    });

    test('extension activates successfully', async () => {
        const ext = vscode.extensions.getExtension(extensionId);
        if (ext && !ext.isActive) {
            await ext.activate();
        }
        assert.ok(ext?.isActive, 'Extension should be active');
    });

    test('showDashboard command is registered', async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(
            commands.includes('antigravity-model-usage.showDashboard'),
            'showDashboard command should be registered',
        );
    });

    test('logManualUsage command is registered', async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(
            commands.includes('antigravity-model-usage.logManualUsage'),
            'logManualUsage command should be registered',
        );
    });

    test('resetUsageData command is registered', async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(
            commands.includes('antigravity-model-usage.resetUsageData'),
            'resetUsageData command should be registered',
        );
    });

    test('toggleTracking command is registered', async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(
            commands.includes('antigravity-model-usage.toggleTracking'),
            'toggleTracking command should be registered',
        );
    });

    test('logManualUsage command executes without error', async () => {
        await vscode.commands.executeCommand('antigravity-model-usage.logManualUsage');
        // If we get here without throwing, the command executed successfully
        assert.ok(true);
    });
});

import * as assert from 'assert';
import { StorageManager } from '../../../infrastructure/storage/storage-manager.js';
import { UsageEvent } from '../../../core/entities/types.js';
import { makeMockContext } from '../../helpers/mock-memento.js';

function makeEvent(overrides: Partial<UsageEvent> = {}): UsageEvent {
    return {
        id: `evt-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: Date.now(),
        model: 'gemini-2.5-pro',
        type: 'completion',
        source: 'manual',
        ...overrides,
    };
}

suite('StorageManager', () => {
    test('loading empty state returns valid defaults', async () => {
        const ctx = makeMockContext();
        const sm = new StorageManager(ctx);

        const data = await sm.loadUsageData();
        assert.strictEqual(data.version, 1);
        assert.deepStrictEqual(data.events, []);
        assert.deepStrictEqual(data.dailySummaries, []);

        sm.dispose();
    });

    test('appendEvent persists data correctly', async () => {
        const ctx = makeMockContext();
        const sm = new StorageManager(ctx);

        const event = makeEvent();
        await sm.appendEvent(event);

        const data = await sm.loadUsageData();
        assert.strictEqual(data.events.length, 1);
        assert.strictEqual(data.events[0].id, event.id);

        sm.dispose();
    });

    test('appendEvent stores rateLimitSnapshot as lastKnownRateLimit', async () => {
        const ctx = makeMockContext();
        const sm = new StorageManager(ctx);

        const event = makeEvent({
            rateLimitSnapshot: { remaining: 50, limit: 100, resetAt: Date.now() + 60000, percentUsed: 50 },
        });
        await sm.appendEvent(event);

        const data = await sm.loadUsageData();
        assert.ok(data.lastKnownRateLimit);
        assert.strictEqual(data.lastKnownRateLimit!.remaining, 50);

        sm.dispose();
    });

    test('pruneOldData removes events older than 7 days', async () => {
        const ctx = makeMockContext();
        const sm = new StorageManager(ctx);

        const oldTimestamp = Date.now() - (8 * 24 * 60 * 60 * 1000); // 8 days ago
        const recentTimestamp = Date.now() - (1 * 60 * 60 * 1000); // 1 hour ago

        await sm.appendEvent(makeEvent({ id: 'old', timestamp: oldTimestamp }));
        await sm.appendEvent(makeEvent({ id: 'recent', timestamp: recentTimestamp }));

        await sm.pruneOldData();

        const data = await sm.loadUsageData();
        assert.strictEqual(data.events.length, 1);
        assert.strictEqual(data.events[0].id, 'recent');

        sm.dispose();
    });

    test('pruneOldData creates DailySummary from pruned events', async () => {
        const ctx = makeMockContext();
        const sm = new StorageManager(ctx);

        const eightDaysAgo = Date.now() - (8 * 24 * 60 * 60 * 1000);
        await sm.appendEvent(makeEvent({ timestamp: eightDaysAgo, model: 'gemini-2.5-pro', type: 'completion' }));
        await sm.appendEvent(makeEvent({ timestamp: eightDaysAgo + 1000, model: 'gemini-2.5-pro', type: 'chat' }));

        await sm.pruneOldData();

        const data = await sm.loadUsageData();
        assert.strictEqual(data.dailySummaries.length, 1);
        assert.strictEqual(data.dailySummaries[0].totalRequests, 2);
        assert.strictEqual(data.dailySummaries[0].byModel['gemini-2.5-pro'], 2);

        sm.dispose();
    });

    test('clearAllData resets to empty state', async () => {
        const ctx = makeMockContext();
        const sm = new StorageManager(ctx);

        await sm.appendEvent(makeEvent());
        await sm.clearAllData();

        const data = await sm.loadUsageData();
        assert.strictEqual(data.events.length, 0);
        assert.deepStrictEqual(data.dailySummaries, []);

        sm.dispose();
    });

    test('loadSettings returns defaults when no settings stored', () => {
        const ctx = makeMockContext();
        const sm = new StorageManager(ctx);

        const settings = sm.loadSettings();
        assert.strictEqual(settings.warningThresholdPercent, 70);
        assert.strictEqual(settings.criticalThresholdPercent, 90);
        assert.strictEqual(settings.estimatedDailyLimit, 1500);
        assert.strictEqual(settings.trackingEnabled, true);

        sm.dispose();
    });

    test('saveSettings and loadSettings round-trip', async () => {
        const ctx = makeMockContext();
        const sm = new StorageManager(ctx);

        const settings = sm.loadSettings();
        settings.trackingEnabled = false;
        settings.estimatedDailyLimit = 2000;
        await sm.saveSettings(settings);

        // Create a new StorageManager to test persistence
        const sm2 = new StorageManager(ctx);
        const loaded = sm2.loadSettings();
        assert.strictEqual(loaded.trackingEnabled, false);

        sm.dispose();
        sm2.dispose();
    });
});

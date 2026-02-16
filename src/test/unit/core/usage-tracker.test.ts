import * as assert from 'assert';
import * as vscode from 'vscode';
import { UsageTracker } from '../../../core/services/usage-tracker.service.js';
import { StorageManager } from '../../../infrastructure/storage/storage-manager.js';
import { ManualDetector } from '../../../infrastructure/detection/manual-detector.js';
import { DetectedEvent, DetectionStrategy, UsageSummary } from '../../../core/entities/types.js';
import { makeMockContext } from '../../helpers/mock-memento.js';

/** Test helper: a detector that lets you fire events with arbitrary timestamps */
class MockDetector implements DetectionStrategy {
    readonly source = 'manual' as const;
    private readonly _emitter = new vscode.EventEmitter<DetectedEvent>();
    readonly onDetected = this._emitter.event;

    start(): void {}
    dispose(): void { this._emitter.dispose(); }

    fire(timestamp: number): void {
        this._emitter.fire({ timestamp, source: this.source });
    }
}

suite('UsageTracker', () => {
    let tracker: UsageTracker;
    let storage: StorageManager;

    setup(() => {
        const ctx = makeMockContext();
        storage = new StorageManager(ctx);
        tracker = new UsageTracker(storage);
    });

    teardown(() => {
        tracker.dispose();
        storage.dispose();
    });

    test('processing a DetectedEvent produces correct UsageEvent', () => {
        const detector = new ManualDetector();
        tracker.registerStrategy(detector);

        let received: UsageSummary | undefined;
        tracker.onUsageUpdated((summary) => { received = summary; });

        detector.logEvent();

        const events = tracker.getRecentEvents(10);
        assert.strictEqual(events.length, 1);
        assert.strictEqual(events[0].source, 'manual');
        assert.strictEqual(events[0].model, 'unknown');
        assert.strictEqual(events[0].type, 'unknown');
        assert.ok(events[0].id);
        assert.ok(received);
    });

    test('rolling window correctly counts events in last 60 seconds', () => {
        const detector = new ManualDetector();
        tracker.registerStrategy(detector);

        detector.logEvent();
        // Small delay to avoid dedup
        const summary = tracker.computeSummary();
        assert.strictEqual(summary.currentMinuteCount, 1);
    });

    test('rolling window correctly counts events in last 60 minutes', () => {
        const detector = new ManualDetector();
        tracker.registerStrategy(detector);

        detector.logEvent();
        const summary = tracker.computeSummary();
        assert.strictEqual(summary.currentHourCount, 1);
    });

    test('daily count reflects events from today', () => {
        const detector = new ManualDetector();
        tracker.registerStrategy(detector);

        detector.logEvent();
        const summary = tracker.computeSummary();
        assert.strictEqual(summary.currentDayCount, 1);
    });

    test('duplicate events within 500ms window are deduplicated', (done) => {
        const detector = new ManualDetector();
        tracker.registerStrategy(detector);

        detector.logEvent();
        // Fire again immediately — same source, within 500ms
        detector.logEvent();

        const events = tracker.getRecentEvents(10);
        assert.strictEqual(events.length, 1);
        done();
    });

    test('events from different sources within 500ms are not deduplicated', () => {
        // Create two detectors with different sources
        const manualDetector = new ManualDetector();
        tracker.registerStrategy(manualDetector);

        const logDetector: any = {
            source: 'log-file',
            _emitter: new vscode.EventEmitter<DetectedEvent>(),
            get onDetected() { return this._emitter.event; },
            start() {},
            dispose() { this._emitter.dispose(); },
        };
        tracker.registerStrategy(logDetector);

        manualDetector.logEvent();
        logDetector._emitter.fire({ timestamp: Date.now(), source: 'log-file' });

        const events = tracker.getRecentEvents(10);
        assert.strictEqual(events.length, 2);
    });

    test('summary computation produces correct rateLimitStatus based on thresholds', () => {
        const detector = new ManualDetector();
        tracker.registerStrategy(detector);

        // Default daily limit is 1500, warning at 70% (1050), critical at 90% (1350)
        // A single event is well below threshold
        detector.logEvent();
        const summary = tracker.computeSummary();
        assert.strictEqual(summary.rateLimitStatus, 'ok');
        assert.ok(summary.rateLimitPercentUsed < 1);
    });

    test('events are persisted via StorageManager', async () => {
        const detector = new ManualDetector();
        tracker.registerStrategy(detector);

        detector.logEvent();

        const data = await storage.loadUsageData();
        assert.strictEqual(data.events.length, 1);
        assert.strictEqual(data.events[0].source, 'manual');
    });

    test('dispose cleans up all resources', () => {
        const detector = new ManualDetector();
        tracker.registerStrategy(detector);

        tracker.dispose();

        // After dispose, firing the detector should not cause errors
        // (listeners are cleaned up)
        detector.logEvent();
        const events = tracker.getRecentEvents(10);
        assert.strictEqual(events.length, 0);
    });

    test('getRecentEvents returns the requested count', () => {
        const detector = new MockDetector();
        tracker.registerStrategy(detector);

        // Fire events with distinct timestamps to avoid dedup
        const now = Date.now();
        for (let i = 0; i < 5; i++) {
            detector.fire(now + (i * 1000));
        }

        const last3 = tracker.getRecentEvents(3);
        assert.strictEqual(last3.length, 3);
        assert.ok(last3[0].timestamp <= last3[1].timestamp);
    });

    test('sessionCount tracks all events in session', () => {
        const detector = new MockDetector();
        tracker.registerStrategy(detector);

        const now = Date.now();
        for (let i = 0; i < 3; i++) {
            detector.fire(now + (i * 1000));
        }

        const summary = tracker.computeSummary();
        assert.strictEqual(summary.sessionCount, 3);
    });
});

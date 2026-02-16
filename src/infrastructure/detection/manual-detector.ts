import * as vscode from 'vscode';
import { DetectedEvent, DetectionStrategy } from '../../core/entities/types.js';

export class ManualDetector implements DetectionStrategy {
    readonly source = 'manual' as const;

    private readonly _onDetected = new vscode.EventEmitter<DetectedEvent>();
    readonly onDetected: vscode.Event<DetectedEvent> = this._onDetected.event;

    start(): void {
        // Manual detector is always ready — no-op
    }

    logEvent(): void {
        this._onDetected.fire({
            timestamp: Date.now(),
            source: 'manual',
        });
    }

    dispose(): void {
        this._onDetected.dispose();
    }
}

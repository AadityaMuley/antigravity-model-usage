import * as vscode from 'vscode';
import { DetectedEvent, DetectionStrategy } from '../../core/entities/types.js';

const MIN_LINES_FOR_AI = 5;
const COOLDOWN_MS = 2000;

export class CompletionDetector implements DetectionStrategy {
    readonly source = 'completion-event' as const;

    private readonly _onDetected = new vscode.EventEmitter<DetectedEvent>();
    readonly onDetected: vscode.Event<DetectedEvent> = this._onDetected.event;

    private listener: vscode.Disposable | undefined;
    private lastEmitTimestamp = 0;

    start(): void {
        this.listener = vscode.workspace.onDidChangeTextDocument((event) => {
            this.analyzeChanges(event);
        });
    }

    dispose(): void {
        this.listener?.dispose();
        this._onDetected.dispose();
    }

    private analyzeChanges(event: vscode.TextDocumentChangeEvent): void {
        // Ignore output channels, git, settings, etc.
        if (event.document.uri.scheme !== 'file') {
            return;
        }

        for (const change of event.contentChanges) {
            const insertedLines = change.text.split('\n').length - 1;

            // AI completions typically insert multiple lines at once
            if (insertedLines >= MIN_LINES_FOR_AI) {
                this.emitIfCooledDown(change.text.length);
            }
        }
    }

    private emitIfCooledDown(charCount: number): void {
        const now = Date.now();
        if (now - this.lastEmitTimestamp < COOLDOWN_MS) {
            return;
        }
        this.lastEmitTimestamp = now;

        this._onDetected.fire({
            timestamp: now,
            source: 'completion-event',
            tokenEstimate: Math.ceil(charCount / 4),
        });
    }
}

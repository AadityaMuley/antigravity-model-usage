import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DetectedEvent, DetectionStrategy } from '../../core/entities/types.js';

/**
 * Log file discovery notes (Task 4.1):
 *
 * Antigravity IDE (VS Code fork by Google) writes extension logs to:
 *   macOS:   ~/Library/Application Support/Antigravity/logs/<timestamp>/window1/exthost/google.antigravity/Antigravity.log
 *   Linux:   ~/.config/Antigravity/logs/<timestamp>/window1/exthost/google.antigravity/Antigravity.log
 *   Windows: %APPDATA%/Antigravity/logs/<timestamp>/window1/exthost/google.antigravity/Antigravity.log
 *
 * Log lines that indicate a model request contain the streamGenerateContent URL:
 *   2026-02-15 19:07:54.257 [info] ... URL: https://daily-cloudcode-pa.googleapis.com/v1internal:streamGenerateContent ...
 *
 * Rate limit responses appear as:
 *   rateLimits={"gemini-antigravity:antigravity-gemini-3-pro":"734s"}
 *   HTTP 429 / RESOURCE_EXHAUSTED
 */

// Matches a streamGenerateContent API call log line
const API_CALL_PATTERN = /(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}).*URL:\s*https:\/\/.*:streamGenerateContent/;

// Extracts model name from log lines like "model: gemini-2.5-pro" or model references
const MODEL_PATTERN = /(?:model[=:]\s*["']?)([a-zA-Z0-9._-]+(?:gemini|pro|flash|ultra)[a-zA-Z0-9._-]*)/i;

// Matches rate limit info: rateLimits={"model":"seconds"}
const RATE_LIMIT_PATTERN = /rateLimits=\{([^}]+)\}/;

// Matches RESOURCE_EXHAUSTED or 429 status
const EXHAUSTED_PATTERN = /RESOURCE_EXHAUSTED|status[=:]\s*429/;

const TAIL_INTERVAL_MS = 2000;

export class LogFileDetector implements DetectionStrategy {
    readonly source = 'log-file' as const;

    private readonly _onDetected = new vscode.EventEmitter<DetectedEvent>();
    readonly onDetected: vscode.Event<DetectedEvent> = this._onDetected.event;

    private fileWatcher: vscode.FileSystemWatcher | undefined;
    private tailTimer: ReturnType<typeof setInterval> | undefined;
    private watchedFile: string | undefined;
    private lastReadPosition = 0;
    private readonly outputChannel: vscode.OutputChannel;

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Antigravity Log Detector');
    }

    start(): void {
        const logDir = this.discoverLogDirectory();
        if (!logDir) {
            this.outputChannel.appendLine('No Antigravity log directory found. Log file detection disabled.');
            return;
        }

        this.outputChannel.appendLine(`Discovered log directory: ${logDir}`);

        const logFile = this.findLatestLogFile(logDir);
        if (logFile) {
            this.startTailing(logFile);
        }

        // Watch the log directory for new session folders
        this.fileWatcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(vscode.Uri.file(logDir), '**/*.log'),
        );
        this.fileWatcher.onDidCreate((uri) => {
            if (uri.fsPath.includes('google.antigravity') && uri.fsPath.endsWith('Antigravity.log')) {
                this.outputChannel.appendLine(`New log file detected: ${uri.fsPath}`);
                this.startTailing(uri.fsPath);
            }
        });
    }

    dispose(): void {
        if (this.tailTimer) {
            clearInterval(this.tailTimer);
            this.tailTimer = undefined;
        }
        this.fileWatcher?.dispose();
        this._onDetected.dispose();
        this.outputChannel.dispose();
    }

    private discoverLogDirectory(): string | undefined {
        const platform = os.platform();
        let baseDir: string;

        if (platform === 'darwin') {
            baseDir = path.join(os.homedir(), 'Library', 'Application Support', 'Antigravity', 'logs');
        } else if (platform === 'linux') {
            baseDir = path.join(os.homedir(), '.config', 'Antigravity', 'logs');
        } else if (platform === 'win32') {
            baseDir = path.join(os.homedir(), 'AppData', 'Roaming', 'Antigravity', 'logs');
        } else {
            return undefined;
        }

        if (fs.existsSync(baseDir)) {
            return baseDir;
        }

        return undefined;
    }

    private findLatestLogFile(logDir: string): string | undefined {
        try {
            // Log dirs are named by timestamp like 20260214T182055 — pick latest
            const entries = fs.readdirSync(logDir, { withFileTypes: true })
                .filter(e => e.isDirectory())
                .map(e => e.name)
                .sort()
                .reverse();

            for (const sessionDir of entries) {
                const candidate = path.join(
                    logDir, sessionDir, 'window1', 'exthost', 'google.antigravity', 'Antigravity.log',
                );
                if (fs.existsSync(candidate)) {
                    return candidate;
                }
            }
        } catch {
            // Permission errors or missing dirs are expected
        }
        return undefined;
    }

    private startTailing(filePath: string): void {
        // Stop any existing tail
        if (this.tailTimer) {
            clearInterval(this.tailTimer);
        }

        this.watchedFile = filePath;

        // Start reading from current end of file (only new content)
        try {
            const stat = fs.statSync(filePath);
            this.lastReadPosition = stat.size;
        } catch {
            this.lastReadPosition = 0;
        }

        this.outputChannel.appendLine(`Tailing: ${filePath}`);

        this.tailTimer = setInterval(() => {
            this.readNewContent();
        }, TAIL_INTERVAL_MS);
    }

    private readNewContent(): void {
        if (!this.watchedFile) {
            return;
        }

        try {
            const stat = fs.statSync(this.watchedFile);

            // Handle log rotation — file got smaller
            if (stat.size < this.lastReadPosition) {
                this.lastReadPosition = 0;
            }

            if (stat.size === this.lastReadPosition) {
                return;
            }

            const fd = fs.openSync(this.watchedFile, 'r');
            const bytesToRead = stat.size - this.lastReadPosition;
            const buffer = Buffer.alloc(bytesToRead);
            fs.readSync(fd, buffer, 0, bytesToRead, this.lastReadPosition);
            fs.closeSync(fd);

            this.lastReadPosition = stat.size;

            const newContent = buffer.toString('utf-8');
            const lines = newContent.split('\n');

            for (const line of lines) {
                this.parseLine(line);
            }
        } catch {
            // File may have been deleted or rotated — reset
            this.lastReadPosition = 0;
        }
    }

    private parseLine(line: string): void {
        if (!API_CALL_PATTERN.test(line) && !EXHAUSTED_PATTERN.test(line)) {
            return;
        }

        const timestampMatch = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3})/);
        const timestamp = timestampMatch ? new Date(timestampMatch[1]).getTime() : Date.now();

        const modelMatch = line.match(MODEL_PATTERN);
        const modelHint = modelMatch?.[1];

        const event: DetectedEvent = {
            timestamp,
            source: 'log-file',
            modelHint,
        };

        // Check for rate limit info in the same line or nearby context
        const rateLimitMatch = line.match(RATE_LIMIT_PATTERN);
        if (rateLimitMatch) {
            try {
                const parsed = JSON.parse(`{${rateLimitMatch[1]}}`);
                const firstValue = Object.values(parsed)[0];
                if (typeof firstValue === 'string') {
                    const seconds = parseInt(firstValue.replace('s', ''), 10);
                    event.rateLimitInfo = {
                        resetAt: Date.now() + (seconds * 1000),
                    };
                }
            } catch {
                // Malformed rate limit data — skip
            }
        }

        if (EXHAUSTED_PATTERN.test(line)) {
            event.rateLimitInfo = {
                ...event.rateLimitInfo,
                remaining: 0,
                percentUsed: 100,
            };
        }

        this._onDetected.fire(event);
    }
}

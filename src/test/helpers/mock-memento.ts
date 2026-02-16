import * as vscode from 'vscode';

/** In-memory mock of vscode.Memento for testing */
export class MockMemento implements vscode.Memento {
    private store = new Map<string, unknown>();

    keys(): readonly string[] {
        return [...this.store.keys()];
    }

    get<T>(key: string): T | undefined;
    get<T>(key: string, defaultValue: T): T;
    get<T>(key: string, defaultValue?: T): T | undefined {
        const val = this.store.get(key);
        return val !== undefined ? val as T : defaultValue;
    }

    async update(key: string, value: unknown): Promise<void> {
        if (value === undefined) {
            this.store.delete(key);
        } else {
            this.store.set(key, value);
        }
    }
}

export function makeMockContext(): vscode.ExtensionContext {
    return {
        workspaceState: new MockMemento(),
        globalState: new MockMemento(),
    } as unknown as vscode.ExtensionContext;
}

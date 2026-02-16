# Google Antigravity IDE Usage Tracker - VSCode Extension

## Project Purpose

This VSCode extension tracks Google Antigravity IDE model usage and rate limits, providing developers with visibility into their API consumption since Google doesn't provide this out-of-the-box.

**Core Value Proposition**: Give developers real-time insights into their Antigravity IDE usage to prevent hitting rate limits and optimize their AI-assisted development workflow.

## Project Structure

```
.
├── src/
│   ├── extension.ts          # Main extension entry point
│   ├── usageTracker.ts        # Core tracking logic
│   ├── storageManager.ts      # Persistent storage handling
│   └── ui/                    # UI components (status bar, webviews)
├── package.json               # Extension manifest and dependencies
├── tsconfig.json              # TypeScript configuration
└── .vscode/                   # VSCode workspace settings
```

## Technology Stack

- **Runtime**: Node.js (VSCode Extension Host)
- **Language**: TypeScript
- **Framework**: VSCode Extension API
- **Build**: esbuild (via vsce)
- **Testing**: @vscode/test-electron + Mocha
- **Package Manager**: npm

## Development Workflow

### Running the Extension
```bash
# Install dependencies
npm install

# Open in VSCode
code .

# Press F5 to launch Extension Development Host
```

### Building
```bash
# Compile TypeScript
npm run compile

# Watch mode for development
npm run watch

# Package extension
npm run package
```

### Testing
```bash
# Run all tests
npm test

# Run specific test file
npm test -- --grep "UsageTracker"
```

## Key Technical Considerations

### VSCode Extension Specifics
- Use `vscode.ExtensionContext.globalState` for persistent storage across sessions
- Register commands in `package.json` under `contributes.commands`
- Use `vscode.window.createStatusBarItem()` for UI updates
- Extension activates on `onStartupFinished` or specific commands

### Storage Strategy
- Store usage data in workspace state for project-specific tracking
- Store global settings in global state for cross-project preferences
- Consider using `SecretStorage` for API keys if needed

### Google Antigravity IDE Integration
- Monitor VS Code API calls that might trigger Antigravity requests
- Hook into language service events to detect model invocations
- Parse response headers for rate limit information (if available)

## Important Files

For detailed implementation guidance, see:
- `docs/api_integration.md` - Google Antigravity API specifics
- `docs/storage_patterns.md` - State management best practices
- `docs/testing_strategy.md` - Unit and integration test approaches

## Code Conventions

The codebase follows existing VSCode extension patterns. Use the TypeScript compiler and ESLint to catch issues early - they're configured in the project.

When in doubt, reference similar features in the codebase or check existing VSCode extension examples.

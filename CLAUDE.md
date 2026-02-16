# Google Antigravity IDE Usage Tracker - VSCode Extension

## Project Purpose

This VSCode extension tracks Google Antigravity IDE model usage and rate limits, providing developers with visibility into their API consumption since Google doesn't provide this out-of-the-box.

**Core Value Proposition**: Give developers real-time insights into their Antigravity IDE usage to prevent hitting rate limits and optimize their AI-assisted development workflow.

## Project Structure (CLEAN Architecture)

```
src/
├── core/                    # Domain - Pure business logic (no VSCode deps)
│   ├── entities/           # Types and interfaces
│   ├── interfaces/         # Repository contracts
│   └── services/           # Business logic
├── infrastructure/         # External implementations (VSCode, file system)
│   ├── storage/           # VSCode Memento persistence
│   └── detection/         # Log parsers, monitors
├── presentation/          # UI and controllers
│   ├── controllers/       # Command handlers
│   └── components/        # Status bar, dashboard
├── test/
│   ├── unit/
│   ├── integration/
│   └── helpers/
└── extension.ts           # Composition root (DI)
```

**Dependency Rule**: `Presentation → Core ← Infrastructure` (dependencies point inward)
**Core Rule**: No `vscode` imports in `core/` - keep it framework-agnostic

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

- **CLEAN Architecture**: Core (no VSCode deps) → Infrastructure/Presentation
- **Imports**: Use `.js` extensions (Node16 module resolution requirement)
- **Naming**: `*.service.ts`, `*.component.ts`, `*.controller.ts`, `*-detector.ts`, `*.interface.ts`
- **New Code**:
  - Domain types → `core/entities/types.ts`
  - Business logic → `core/services/`
  - VSCode implementations → `infrastructure/` or `presentation/`
  - Tests → `test/unit/` or `test/integration/`

Follow TypeScript/ESLint config. See `implementation.md` for detailed architecture notes.

# Contributing to Antigravity Model Usage Tracker

Thank you for your interest in contributing! This guide will help you get started.

## Development Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/AadityaMuley/antigravity-model-usage.git
   cd antigravity-model-usage
   npm install
   ```

2. Open in VS Code:
   ```bash
   code .
   ```

3. Press **F5** to launch the Extension Development Host.

## Code Style

- Follow the existing TypeScript ESLint configuration
- Use `.js` extensions in imports (required by Node16 module resolution)
- Follow CLEAN Architecture — dependencies point inward (`Presentation → Core ← Infrastructure`)
- No `vscode` imports in `src/core/` — keep domain logic framework-agnostic
- Naming conventions: `*.service.ts`, `*.component.ts`, `*.controller.ts`, `*-detector.ts`, `*.interface.ts`

## Testing

All new features must have unit tests. Run the full test suite before submitting:

```bash
npm run compile    # Compile TypeScript
npm run lint       # Run ESLint
npm test           # Run tests
```

## Pull Request Process

1. Fork the repository
2. Create a feature branch from `main`
3. Make your changes with descriptive commits
4. Reference issue numbers in commit messages and PR description
5. Ensure all checks pass (`compile`, `lint`, `test`)
6. Submit a pull request to `main`

### Branch Naming

- `feature/description` — new features
- `bugfix/description` — bug fixes
- `docs/description` — documentation changes

### Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — new feature
- `fix:` — bug fix
- `docs:` — documentation only
- `test:` — adding or updating tests
- `chore:` — maintenance tasks
- `refactor:` — code changes that neither fix bugs nor add features

## Reporting Issues

- Use [GitHub Issues](https://github.com/AadityaMuley/antigravity-model-usage/issues) with the provided templates
- For security vulnerabilities, see our [Security Policy](SECURITY.md)

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold this code.

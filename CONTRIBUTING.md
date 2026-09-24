# Contributing to Chronos

First off, thank you for considering contributing to Chronos! We welcome contributions from the community to help make deterministic AI decisioning better.

## Development Environment Setup

Chronos is built with TypeScript, pnpm, and Turborepo.

1. **Clone the repository:**
   ```bash
   git clone https://github.com/apuravmanhas/chronos.git
   cd chronos
   ```

2. **Install dependencies:**
   We use `pnpm` as our package manager. If you don't have it installed, get it [here](https://pnpm.io/installation).
   ```bash
   pnpm install
   ```

3. **Build the project:**
   ```bash
   pnpm build
   ```

## Running Tests

We use [Vitest](https://vitest.dev/) for testing.

To run all tests:
```bash
pnpm test
```

To run tests in watch mode during development:
```bash
pnpm test:watch
```

## Code Style

- **TypeScript Strict Mode:** We strictly adhere to TypeScript's strict mode. All new code must be fully typed.
- **ES Modules:** The project uses the `NodeNext` module resolution system. You **must** use `.js` extensions for local imports (e.g., `import { Foo } from './foo.js';`).
- **Formatting:** We use Prettier for code formatting. Run `pnpm format` before committing.

## Adding a New Provider

To add a new AI provider (e.g., OpenAI, Anthropic):
1. Create a new directory under `src/providers/` (e.g., `src/providers/openai.ts`).
2. Implement the `Provider` interface.
3. Ensure you map the provider's specific responses to standard `Decision` types (`NoulDecision`, `ChoiceDecision`, `ScoreDecision`).
4. Add comprehensive tests in `tests/providers/`.
5. Update the `Chronos` class if any default registrations are needed.

## Adding a New Policy

Examples of policies should be added to the `examples/policies/` directory in YAML format. Ensure they define valid `questions` and `confidence` thresholds.

## Pull Request Process

1. Fork the repo and create your branch from `main`.
2. Write tests for any new functionality or bug fixes.
3. Ensure all tests and linting pass (`pnpm test` and `pnpm lint`).
4. Update documentation if necessary (e.g., README, API docs).
5. Submit a pull request. Clearly describe the changes and motivation.

## Code of Conduct

Please note that this project is released with a Contributor Code of Conduct. By participating in this project you agree to abide by its terms.

## License

By contributing to Chronos, you agree that your contributions will be licensed under its Apache-2.0 License.

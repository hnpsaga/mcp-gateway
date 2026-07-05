# MCP Gateway

A lightweight, self-hosted REST gateway for managing and interacting with Model Context Protocol (MCP) servers.

---

## Prerequisites

- **Node.js**: `v22.x` (LTS) or higher
- **pnpm**: `v10.x` or higher

---

## Installation

Install the project dependencies using `pnpm`:

```bash
pnpm install
```

---

## Configuration

Duplicate `.env.example` to `.env` and adjust the variables:

```bash
cp .env.example .env
```

Default variables:

- `NODE_ENV`: Application environment (`development`, `production`, `test`)
- `PORT`: Port to listen on (default `3000`)
- `HOST`: IP address to listen on (default `127.0.0.1`)

---

## Running Locally

### Development Mode

To start the server in watch mode with automatic reload:

```bash
pnpm dev
```

### Production Build & Run

To compile the TypeScript project and start the compiled build:

```bash
pnpm build
pnpm start
```

---

## Available Scripts

| Script               | Description                                                   |
| :------------------- | :------------------------------------------------------------ |
| `pnpm dev`           | Run the application locally in watch mode with `tsx`.         |
| `pnpm build`         | Compile the TypeScript code to Javascript inside `dist/`.     |
| `pnpm start`         | Run the production build located in `dist/`.                  |
| `pnpm typecheck`     | Perform static type checking using `tsc`.                     |
| `pnpm lint`          | Inspect code for style and quality issues using ESLint.       |
| `pnpm lint:fix`      | Automatically fix fixable linter issues.                      |
| `pnpm format`        | Run formatting check and overwrite code using Prettier.       |
| `pnpm format:check`  | Verify formatting across the project without modifying files. |
| `pnpm test`          | Run Vitest test suite once.                                   |
| `pnpm test:watch`    | Run Vitest in watch mode.                                     |
| `pnpm test:coverage` | Run Vitest and output code coverage reports.                  |

---

## Testing

Tests are written using **Vitest** for lightweight backend testing. They run without binding to a physical network port using Fastify's `inject()` mechanism.

To run tests:

```bash
pnpm test
```

To run tests with a code coverage report:

```bash
pnpm test:coverage
```

---

## Development Workflow

This project enforces high-quality standards through automated pre-commit gates:

1. **Git Hooks**: We use **Husky** to manage pre-commit hooks.
2. **Lint Staged**: The hook runs **lint-staged**, which performs:
   - ESLint validation and auto-fixing (`eslint --fix`) on staged `.js` and `.ts` files.
   - Prettier formatting check and write (`prettier --write`) on all staged files.
3. **Continuous Integration**: On every push and pull request, GitHub Actions runs:
   - Formatting checks (`pnpm format:check`)
   - Linter (`pnpm lint`)
   - Typecheck (`pnpm typecheck`)
   - Test suite (`pnpm test`)
   - Production build validation (`pnpm build`)

---

## Project Structure

```text
.
├── .github/
│   └── workflows/
│       └── ci.yml        # GitHub Actions CI pipeline
├── .husky/               # Git hook handlers (e.g., pre-commit)
├── src/
│   ├── config/
│   │   └── env.ts        # Configuration Schema & Loading (Zod)
│   ├── routes/
│   │   └── health.ts     # Routes definition (Health check)
│   ├── app.ts            # Fastify Instance builder & Global Error Handler
│   ├── app.test.ts       # Health endpoint and application tests
│   ├── server.ts         # Server listen & graceful shutdown logic
│   ├── server.test.ts    # Server startup & process event tests
│   └── index.ts          # Application entrypoint
├── .editorconfig         # Code styling defaults for IDEs
├── .gitignore            # Files ignored by git
├── .lintstagedrc.json    # Configuration for staged file validation
├── .prettierignore       # Files ignored by Prettier formatter
├── eslint.config.js      # Flat Config configuration for ESLint 10
├── package.json          # Node project setup and dependencies list
├── pnpm-lock.yaml        # Package manager lock file
├── prettier.config.js    # Prettier configuration details
├── tsconfig.json         # TypeScript configuration mapping
└── vitest.config.ts      # Vitest testing environment configuration
```

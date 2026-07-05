# MCP Gateway

A lightweight, self-hosted REST gateway for managing and interacting with Model Context Protocol (MCP) servers.

## Prerequisites

- Node.js 22 LTS
- pnpm 10.x or higher

## Installation

```bash
pnpm install
```

## Running the Application

### Development Mode

To start the server in watch mode:

```bash
pnpm run dev
```

### Production Build & Run

To compile TypeScript and start the production server:

```bash
pnpm run build
pnpm run start
```

### Type Checking

To run static type checking:

```bash
pnpm run typecheck
```

## Configuration

Duplicate `.env.example` to `.env` and adjust the variables:

```bash
cp .env.example .env
```

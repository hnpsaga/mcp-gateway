# MCP Gateway - Technical Design Decisions

**Version:** 1.0
**Status:** Working Design Document

---

# Purpose

This document captures the major technical decisions made during the design of MCP Gateway before implementation begins. It serves as the primary engineering reference during development and will later be split into Architecture Decision Records (ADRs) as the project matures.

The goal of these decisions is to build a lightweight, developer-first, cloud-native operational platform for Model Context Protocol (MCP) infrastructure while avoiding unnecessary complexity and premature optimization.

---

# Architectural Philosophy

MCP Gateway follows the same architectural philosophy that API Gateways brought to microservice architectures.

Instead of every application independently implementing the MCP protocol, configuring connections, managing authentication, collecting metrics, and handling operational concerns, applications communicate with a centralized Gateway through a consistent REST API.

The Gateway becomes the operational layer for MCP infrastructure while applications remain focused on business logic.

This project is intentionally designed as infrastructure software rather than an AI application.

---

# Core Architecture

```text
Applications
      │
 REST API
      │
┌──────────────────────────────┐
│         MCP Gateway          │
├──────────────────────────────┤
│ Connection Registry          │
│ Discovery Engine             │
│ Execution Engine             │
│ AI Interaction Engine        │
│ Operations Layer             │
└──────────────────────────────┘
      │
 Managed MCP Connections
```

The Gateway owns all operational concerns while applications consume a stable HTTP API.

---

# Technology Stack

## Runtime

**Decision**

Node.js 22 LTS

**Reason**

The MCP ecosystem is primarily centered around the TypeScript ecosystem. Choosing Node.js minimizes integration complexity while providing excellent library support and long-term maintainability.

---

## Language

**Decision**

TypeScript

**Reason**

Provides strong typing, modern tooling, excellent AI-assisted development support, and aligns with current backend engineering expectations.

---

## HTTP Framework

**Decision**

Fastify

**Reason**

Fastify provides high performance, excellent TypeScript support, plugin architecture, automatic OpenAPI integration, and native structured logging.

**Alternatives Considered**

- Express
- NestJS
- Hono

NestJS was intentionally rejected because the project does not require dependency injection or heavy framework abstractions.

---

## Validation

**Decision**

Zod

**Reason**

Runtime validation combined with static TypeScript inference reduces duplication between runtime validation and compile-time types.

---

## Database

**Decision**

SQLite (v1)

**Reason**

The Gateway stores relatively small amounts of operational data:

- Connections
- Request history
- AI provider configuration
- Settings

SQLite keeps deployment extremely simple while remaining production-ready for the intended audience.

Future versions may support PostgreSQL without changing the application architecture.

---

## ORM

**Decision**

Drizzle ORM

**Reason**

Lightweight, TypeScript-first, SQL-friendly, and avoids unnecessary abstraction.

---

## Logging

**Decision**

Pino

**Reason**

Fastify integrates natively with Pino, producing structured JSON logs that can be consumed directly by existing observability platforms.

---

## Metrics

**Decision**

Prometheus-compatible metrics using standard Prometheus exposition format.

**Reason**

Rather than building proprietary dashboards, MCP Gateway integrates with the existing observability ecosystem.

Supported platforms include:

- Prometheus
- Grafana
- VictoriaMetrics
- Datadog
- New Relic

---

## Tracing

**Decision**

OpenTelemetry

**Reason**

Distributed tracing should integrate with existing tracing infrastructure instead of introducing proprietary implementations.

Compatible with:

- Jaeger
- Grafana Tempo
- Honeycomb
- Zipkin

---

## Logging Format

**Decision**

Structured JSON

Every log entry should include sufficient context for downstream analysis, including request identifiers, connection identifiers, execution metadata, timestamps, and duration.

This enables direct ingestion into:

- Elasticsearch
- Kibana
- Loki
- Splunk
- Cloud Logging

---

## API Documentation

**Decision**

OpenAPI

Automatically generated from application schemas.

---

## Testing

Three testing layers will be maintained:

- Unit Tests
- Integration Tests
- REST API Tests

Browser-based end-to-end testing is intentionally excluded from Version 1.

---

## Packaging

Docker is the primary distribution mechanism.

The official deployment model is:

```bash
docker run ...
```

The Gateway should be operational with minimal configuration.

---

# Storage Philosophy

The Gateway stores operational metadata rather than business data.

Examples include:

- Registered connections
- Execution history
- Configuration
- AI providers
- Metrics metadata

Business data remains within the connected MCP servers.

---

# REST-First Philosophy

REST is the primary integration interface.

Applications written in any programming language should be able to consume the Gateway without requiring MCP protocol knowledge.

No SDK is required for Version 1.

Future SDKs may be added as convenience wrappers around the REST API.

---

# AI Philosophy

Artificial Intelligence is an optional capability.

The AI Interaction Engine is designed to orchestrate interactions with user-provided models through Bring Your Own Model (BYOK).

Manual execution remains a first-class capability.

Developers should always be able to validate MCP integrations without requiring AI.

---

# Observability Philosophy

MCP Gateway intentionally avoids building custom dashboards.

Instead, it emits industry-standard telemetry that existing observability platforms can consume.

Version 1 will provide:

- Prometheus metrics
- OpenTelemetry traces
- Structured JSON logs
- Health endpoints
- Diagnostics APIs
- Request history APIs

Visualization is delegated to platforms such as:

- Grafana
- Kibana
- Jaeger
- Loki
- Datadog

---

# Authentication

Version 1 will implement lightweight API authentication suitable for self-hosted deployments.

Enterprise authentication mechanisms such as OAuth, SAML, and SSO are intentionally deferred.

---

# Deployment Philosophy

MCP Gateway is designed as a self-hosted platform.

A Docker container should be sufficient for the majority of users.

No Kubernetes-specific functionality will be required for Version 1, although the architecture should remain compatible with container orchestration environments.

---

# Design Principles

The following principles guide all engineering decisions.

- Keep Version 1 intentionally lightweight.
- Prioritize developer experience.
- Favor standards over proprietary implementations.
- Integrate with existing ecosystem tools whenever possible.
- Avoid rebuilding mature infrastructure products.
- Prefer composition over unnecessary abstraction.
- Build infrastructure that real teams can adopt with minimal effort.
- Optimize for maintainability rather than feature count.

---

# Explicit Non-Goals

The following capabilities are intentionally excluded from Version 1.

- Web Dashboard
- Command Line Interface
- Plugin System
- Enterprise RBAC
- OAuth / SSO
- Multi-node clustering
- Workflow orchestration
- Policy engine
- Enterprise governance
- Proprietary monitoring dashboards
- Custom visualization tools

These features remain candidates for future releases after the core platform reaches maturity.

---

# Future Evolution

The architecture intentionally supports future expansion without requiring significant redesign.

Potential future additions include:

- Web UI
- CLI
- TypeScript SDK
- Plugin architecture
- Workflow engine
- Enterprise authentication
- High availability
- Distributed deployments
- Policy management
- Role-based access control

These enhancements should build on the existing architecture rather than replace it.

# Release Checklist

Use this checklist when preparing the v1.0 release. Do not publish artifacts until every verification step is complete.

## Final Manual Testing

- Clone a fresh copy of the repository.
- Install dependencies with `pnpm install --frozen-lockfile`.
- Run `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`.
- Start the compiled app with `pnpm start`.
- Verify `/health`, `/live`, `/ready`, `/info`, `/metrics`, `/api/v1/health`, `/documentation`, and `/documentation/json`.
- Test API key authentication with `AUTH_ENABLED=true` and at least one `API_KEYS` value.
- Register and test a stdio MCP connection against a real MCP server.
- Register and test a Streamable HTTP MCP connection against a real MCP server.
- Run discovery, cached discovery lookup, refresh, and cache deletion.
- Execute a tool, read a resource, and execute a prompt.
- Stop the Gateway and confirm graceful shutdown without orphaned MCP server processes.
- Restart the Gateway and confirm SQLite-backed connections and discovery cache persist.

## Documentation Review

- Review `README.md` for installation, configuration, API, Docker, and production guidance.
- Review `docs/MCP Gateway PRD.md`.
- Review `docs/Technical Design Decisions.md`.
- Review `docs/Engineering Roadmap Part 1.md` and `docs/Engineering Roadmap Part 2.md`.
- Review `docs/Release-Checklist.md`.
- Confirm examples match the implemented API and current environment variables.
- Confirm all referenced commands work from a clean checkout.

## Version Verification

- Confirm `package.json` contains the intended v1.0 version.
- Confirm OpenAPI metadata reports the same version.
- Confirm health endpoints report the same version.
- Confirm Docker image labels or tags use the intended release version before publication.

## Docker Verification

- Build the image locally with `docker build -t mcp-gateway:v1.0.0 .`.
- Run the image with a mounted persistent data volume.
- Verify startup, health endpoints, readiness, metrics, authentication, and graceful shutdown.
- Verify SQLite database files are created in the mounted volume.
- Verify `docker compose up --build` starts the Gateway.
- Verify `docker compose down` stops the Gateway cleanly.

## npm Package Verification

- Run `pnpm pack` locally if publishing to npm.
- Inspect the generated tarball contents.
- Confirm package metadata, license, README, compiled files, and migrations are included.
- Confirm no local `.env`, database files, coverage output, or other generated artifacts are included.
- Perform a local install smoke test from the generated tarball.

## CHANGELOG Review

- Confirm `CHANGELOG.md` exists before release.
- Confirm the v1.0.0 entry summarizes user-facing capabilities, breaking changes if any, security notes, and migration guidance if any.
- Confirm the release date is correct.

## Git Tag

- Confirm `main` contains the approved release commit.
- Confirm CI is passing on `main`.
- Create an annotated tag: `git tag -a v1.0.0 -m "Release v1.0.0"`.
- Push the tag only after final approval: `git push origin v1.0.0`.

## Docker Publication

- Build the final release image.
- Tag the image with `v1.0.0` and `latest` if appropriate.
- Push the image to the selected registry.
- Pull the published image on a clean machine or environment.
- Run the published image and verify health, readiness, and persistence.

## npm Publication

- Authenticate with the target npm account.
- Run `npm publish` or the approved pnpm/npm equivalent only after tarball verification.
- Install the published package in a clean environment.
- Verify the published package starts and runs migrations correctly.

## GitHub Release

- Create the GitHub Release from tag `v1.0.0`.
- Include release notes aligned with `CHANGELOG.md`.
- Attach any approved release artifacts.
- Link Docker image and npm package locations if published.
- Mark the release as latest only after published artifact verification is complete.

## Published Artifact Verification

- Verify GitHub Release links.
- Verify Docker image pull and startup.
- Verify npm package install and startup if applicable.
- Verify OpenAPI documentation from the published artifact.
- Verify the README renders correctly on GitHub and npm if applicable.

## Release Announcement

- Prepare a concise announcement after artifacts are verified.
- Include the project purpose, major capabilities, documentation link, Docker image link, npm package link if applicable, and issue reporting guidance.
- Publish the announcement only after the GitHub Release and all artifacts are confirmed.

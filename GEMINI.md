# Workspace Agent Rules

This file defines guidelines and configurations for the Antigravity AI pair programming sessions within this workspace.

## Allowed Permissions

To enable automated Pull Request operations (such as listing and creating PRs) using the GitHub CLI (`gh`) without requiring interactive prompts or command obfuscation, the following policies are auto-allowed:

- **Allow**: `gh.create({"org":"*","repo":"*","pr":"*"})`
- **Allow**: `gh.read({"org":"*","repo":"*","pr":"*"})`

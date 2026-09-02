---
name: Artifact publish package bootstrap
description: Replit artifact publishing package-manager ordering for this pnpm workspace.
---

# Artifact publish package bootstrap

Allow Replit's initial npm package bootstrap to complete, then run the workspace's frozen pnpm install in the deployment build hook.

**Why:** Artifact publishing performs its automatic package-install phase before the configured deployment build hook. Rejecting npm from `preinstall` stops publishing before pnpm can run, even when `pnpm-lock.yaml` exists.

**How to apply:** Keep pnpm declared as the package manager and keep the frozen pnpm install hook, but do not make the root preinstall script exit merely because the publisher's bootstrap user agent is npm.
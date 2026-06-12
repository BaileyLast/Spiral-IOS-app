---
name: deleteEnvVars cannot remove secrets
description: The environment-secrets deleteEnvVars callback silently no-ops on secrets (only plaintext env vars are removable by the agent).
---

`deleteEnvVars({ keys })` only deletes **plaintext environment variables**. When
passed secret keys it returns a success payload echoing those keys as "deleted",
but the secrets remain — verify with `viewEnvVars({ type: "secret", keys })`
afterward (they still show `true`).

`setEnvVars` likewise cannot create/modify secrets. The agent cannot programmatically
delete secrets at all.

**Why:** Secrets are global and outside the agent's write surface; the skill only
exposes view + request for secrets. The delete call's optimistic success response is
misleading.

**How to apply:** When a task asks to "remove core-only secrets", delete the plaintext
env vars yourself, then tell the user to remove the remaining secrets from the Secrets
tab in the Replit UI. Don't claim secrets were deleted without re-reading them.

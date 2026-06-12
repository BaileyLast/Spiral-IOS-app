---
name: drizzle-kit push rename-vs-create prompt trap
description: db:push hangs on an interactive prompt when the DB has stale drift columns; how to add a column non-interactively.
---

# drizzle-kit push hangs on rename-vs-create prompt

When a new column is added to the schema AND the live DB still has an old
column that is no longer in the schema, `npm run db:push` (drizzle-kit push)
stops on an interactive prompt: "Is <newcol> created or renamed from another
column?" with options `+ create column` / `~ <oldcol> › <newcol> rename column`.

**Why it bites:** piping a newline (`printf '\n' | npm run db:push`) does NOT
answer it — the prompt needs a real TTY, so the command just re-prints the
prompt and never proceeds. The agent's bash tool has no TTY.

**How to apply:** don't fight the prompt. Add the column directly with
idempotent SQL instead, which never touches the unrelated drift column:
`ALTER TABLE <t> ADD COLUMN IF NOT EXISTS <col> <type>;` (run via executeSql).
This app had a stale `orders.post_deadline` column in the DB (not in
shared/schema.ts, unreferenced anywhere) that triggered the prompt whenever any
new `orders` column was pushed. Adding the column via ALTER sidesteps it; the
stale drift remains but is harmless.

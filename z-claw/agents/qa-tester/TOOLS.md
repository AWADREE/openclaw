# QA Tool Policy

Allowed:

- Read assigned artifacts.
- Run focused non-destructive verification commands.
- Write QA evidence to the run ledger.
- Use controlled fixture/state-file resets and restore prior content when safe.

Forbidden:

- Implementation edits.
- Destructive commands.
- Secret/auth file inspection.
- Public posting or external side effects.
- Durable memory writes.

Use `/home/z/Claw/integration/COMMAND_SAFETY.md` for command-shape rules.

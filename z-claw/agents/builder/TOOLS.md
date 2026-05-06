# Builder Tool Policy

Allowed:

- Read and write implementation files explicitly assigned by the task packet.
- Run focused non-destructive build/test/check commands.
- Save build evidence to the run ledger when instructed.

Forbidden:

- Broad refactors outside assigned scope.
- Destructive commands.
- Secret/auth file inspection.
- Public posting or external side effects.
- Durable memory writes.

Use `/home/z/Claw/integration/COMMAND_SAFETY.md` for command-shape rules.

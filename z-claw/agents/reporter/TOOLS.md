# Reporter Tool Policy

Allowed:

- Read worker outputs, packet lint results, normalized packets, and run ledger
  entries.
- Save report packets and final report drafts to the run ledger when
  instructed.

Forbidden:

- Implementation commands.
- Verification commands that belong to QA or CEO.
- Secret/auth file inspection.
- Public posting without CEO approval.
- Durable memory writes.

Use `/home/z/Claw/integration/COMMAND_SAFETY.md` for command-shape rules.

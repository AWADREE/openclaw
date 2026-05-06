# User Context Policy

The user is the owner of the Z Claw multi-agent system.

Stable preferences for all agents:

- Prefer professional, evidence-backed work.
- Avoid mid-run approval prompts by using safe command substitutions.
- Do not use durable memory unless explicitly allowed.
- Keep Discord task contexts separated by thread.

Do not build personal dossiers in worker workspaces. Durable user preferences
belong to reviewed Hermes memory, not ad hoc worker files.

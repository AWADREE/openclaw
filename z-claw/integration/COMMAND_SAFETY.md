# Z Claw Command Safety

Version: 0.1

This policy exists so unattended workflows do not stop on avoidable approval
prompts.

## Default Rule

Agents must choose low-risk command shapes automatically.

If a command would trigger approval and a safe equivalent exists, use the safe
equivalent without asking the user.

If no safe equivalent exists, stop that subtask, record a blocker in the run
ledger, and continue with any independent work. Do not wait indefinitely for
the user.

## Never Use

- Piping command output into interpreters:
  - `command | python`
  - `command | python3`
  - `command | node`
  - `command | bash`
  - `command | sh`
  - `command | ruby`
  - `command | perl`
- Broad destructive commands:
  - `rm -rf`
  - `rm -f` on broad paths
  - `git reset --hard`
  - `git checkout -- path` unless explicitly requested
- Privilege escalation:
  - `sudo`
  - system-level `systemctl`
- Network install or execution unless already explicitly approved:
  - `curl ... | sh`
  - `wget ... | bash`
  - package installs
- Secret inspection:
  - printing token/auth/env files
  - dumping `.env`, `auth.json`, gateway tokens, or Discord tokens

## Safe Substitutions

Instead of:

```bash
some_command | python3 script.py
```

Use:

```bash
some_command > output.txt
python3 script.py output.txt
```

Instead of:

```bash
python3 show_json.py | python3 -m json.tool
```

Use:

```bash
python3 show_json.py > manifest_show.json
python3 -m json.tool manifest_show.json > manifest_show_pretty.json
```

Instead of deleting a JSON state file:

```bash
rm -f state.json
```

Use controlled overwrite or restore:

```bash
python3 -m json.tool state.json > state_backup.json
printf '[]\n' > state.json
```

For JSON inspection, prefer:

```bash
python3 -m json.tool file.json
```

For command output inspection, prefer:

```bash
command > output.txt
sed -n '1,120p' output.txt
```

## Unattended Behavior

When running a standard workflow:

1. Avoid known approval-triggering command shapes.
2. If approval is requested anyway, do not ask the user to decide unless the
   user is actively present and the action is essential.
3. Prefer a safe equivalent immediately.
4. If the action is not essential, skip it and record the reason.
5. If the workflow cannot continue safely, record `blocked` in `manifest.json`
   and include the exact blocker in the final report.

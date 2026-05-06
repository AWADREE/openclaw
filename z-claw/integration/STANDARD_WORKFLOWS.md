# Z Claw Standard Workflows

Version: 0.2

Standard workflows are reusable operating recipes for OpenClaw + Hermes. They
encode the path that has already been tested so the CEO does not need to
reinvent protocol steps for every task.

## Rules

- OpenClaw routes work.
- Hermes profiles power agent cognition, memory, skills, and tools.
- CEO owns routing, review, and acceptance. Builder owns implementation writes.
- Planner and reporter may use cheap/local models as draft producers.
- Planner and reporter outputs must pass `packet_lint.py`.
- Failed but useful planner/reporter drafts must be normalized with
  `packet_normalize.py`, then linted again.
- Builder and QA evidence must be verified before CEO acceptance.
- Workflow evidence must be saved in the run ledger under
  `/home/z/Claw/workspace/runs`.
- Commands must follow `COMMAND_SAFETY.md` to avoid avoidable approval prompts
  during unattended work.
- Durable memory is off by default unless the user explicitly allows it.

## Workflow: `software_change_small`

Use this for scoped software work where the expected change is small enough to
fit in one builder task.

Examples:

- Add or update a small CLI tool.
- Fix a narrow bug.
- Add focused validation or persistence behavior.
- Create a small utility script with tests/checks.

Do not use this workflow for broad refactors, unclear product design, security
sensitive work, dependency upgrades, destructive commands, or public release
actions. Those require CEO review and possibly a custom workflow.

### Agent Path

1. CEO creates a run ledger directory with `run_manifest.py`.
2. CEO uses command shapes allowed by `COMMAND_SAFETY.md`.
3. Planner creates task packets.
4. Packet gate checks planner output.
5. Packet normalizer repairs useful malformed planner drafts if needed.
6. Builder implements the accepted builder task.
7. QA tester verifies the artifact against acceptance criteria.
8. Reporter summarizes results.
9. Packet gate checks reporter output.
10. Packet normalizer repairs useful malformed reporter drafts if needed.
11. CEO independently verifies the artifact and accepts or rejects.
12. CEO updates `manifest.json` with final status and decision.

### Ownership Boundary

During `software_change_small`, CEO must not create or edit requested
implementation artifacts. CEO may inspect files, run lint/normalization, save
worker outputs, write verification notes, and perform non-destructive
verification. Builder must create or edit the requested implementation files.

If builder cannot complete the implementation after retry/escalation, CEO must
report a workflow deviation and ask whether to allow direct CEO implementation
or further escalation.

### Required Inputs

- `task_id`: short stable ID.
- `objective`: one clear implementation goal.
- `target_files`: expected files or directories.
- `requirements`: concrete behavior required.
- `qa_checks`: commands or behavior checks QA must run.
- `memory_scope`: usually `none`.

### Run Ledger

Every `software_change_small` run must create a run directory under:

`/home/z/Claw/workspace/runs/software_change_small/`

Use:

```bash
python3 /home/z/Claw/integration/tools/run_manifest.py create --workflow software_change_small --task-id TASK_ID --objective "OBJECTIVE"
```

The command prints the run directory path. Store all workflow evidence in that
directory.

### Required Artifacts

Save these artifacts inside the run ledger directory:

- raw planner output
- planner raw lint result
- normalized planner output, if used
- normalized planner lint result, if used
- builder raw output
- builder task packet used
- QA raw output
- reporter raw output
- reporter raw lint result
- normalized reporter output, if used
- normalized reporter lint result, if used
- CEO verification notes
- final report
- manifest.json updates for agents, artifacts, decisions, and deviations

### Acceptance Criteria

CEO accepts only when:

- run ledger exists with `manifest.json`
- no avoidable approval prompt was used; safe command substitutions were used
  where needed
- planner packet was accepted raw or accepted after normalization
- builder completed the scoped implementation and owns implementation file
  writes
- QA returned pass with evidence
- reporter packet was accepted raw or accepted after normalization
- CEO independently verified the requested behavior
- CEO did not directly create or edit implementation artifacts, unless reported
  as an explicit user-approved workflow deviation
- final status and decision are recorded in the run manifest
- durable memory was not written unless explicitly allowed

### Automatic CEO Use

The Main Hermes CEO should select this workflow automatically when the user asks
for a small scoped software change from Discord. The user should not need to run
a local command or paste the full protocol.

The workflow selection rule is also encoded in:

- `/home/z/.hermes/SOUL.md`
- `/home/z/.hermes/skills/z-claw-standard-workflows/SKILL.md`

### Optional Prompt Helper

The prompt helper is optional. Use it only when a human or developer wants to
generate an explicit workflow prompt for testing or reproducibility.

Use `workflow_prompt.py` to generate a filled prompt:

```bash
python3 /home/z/Claw/integration/tools/workflow_prompt.py software_change_small \
  --task-id notes-cli \
  --objective "Create notes_cli.py" \
  --target "/home/z/Claw/workspace/tools/notes_cli.py" \
  --requirement "supports add \"note text\"" \
  --requirement "supports list" \
  --requirement "supports delete NOTE_ID" \
  --qa-check "python compile passes" \
  --qa-check "--help works"
```

Normal Discord use does not require this helper. The CEO should select the
workflow automatically from the user's request.

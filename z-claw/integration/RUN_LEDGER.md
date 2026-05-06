# Z Claw Run Ledger

Version: 0.1

The run ledger is the durable audit trail for standard workflows.

It records what happened during a workflow run without treating worker claims as
durable memory. The ledger is for audit, dashboards, night reports, and later
memory review.

## Location

Workflow runs live under:

`/home/z/Claw/workspace/runs/`

Standard layout:

```text
/home/z/Claw/workspace/runs/
  software_change_small/
    YYYYMMDD-HHMMSS-task-id/
      manifest.json
      planner_raw.*
      planner_lint.json
      planner_normalized.*
      planner_normalized_lint.json
      builder_task.*
      builder_raw.*
      qa_task.*
      qa_raw.*
      reporter_raw.*
      reporter_lint.json
      reporter_normalized.*
      reporter_normalized_lint.json
      ceo_verification.md
      final_report.md
```

## Manifest

Every run directory must contain `manifest.json`.

Required fields:

- `run_id`
- `workflow`
- `task_id`
- `objective`
- `status`
- `created_at`
- `updated_at`
- `agents`
- `artifacts`
- `decisions`
- `workflow_deviations`
- `durable_memory_used`

Allowed statuses:

- `created`
- `planning`
- `building`
- `qa`
- `reporting`
- `verified`
- `accepted`
- `rejected`
- `blocked`

## Rules

- Use run ledger files instead of random `/tmp` paths for workflow evidence.
- `/tmp` may be used only for scratch files that are also copied or summarized
  into the run ledger before final acceptance.
- CEO may write ledger files and verification notes.
- Builder must still own requested implementation artifacts.
- QA may write QA evidence into the run ledger.
- Reporter may write raw and normalized reports into the run ledger.
- Durable memory remains separate. Ledger records are audit evidence, not
  automatically remembered truth.

## Helper

Use:

```bash
python3 /home/z/Claw/integration/tools/run_manifest.py --help
```

The helper creates run directories and safely updates `manifest.json`.

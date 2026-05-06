# Local Model Limitations Runbook

Version: 0.1

This runbook documents known limitations of the current local worker model:

- Provider: Hermes profile custom provider pointing at local Ollama
- Previous model: `qwen2.5-coder:14b`
- Current selected local model: `qwen3.5:9b`
- Endpoint: `http://192.168.1.34:11434/v1`

Current mitigation:

- OpenClaw calls `hermes-workers/*`.
- The Hermes worker adapter invokes Hermes profiles.
- Planner, researcher, and reporter use local Ollama `qwen3.5:9b` through
  Hermes profiles.
- Builder and QA remain on `openai-codex/gpt-5.4-mini` because actual
  Hermes/OpenClaw file-write smoke tests failed on the local models.

OpenClaw no longer stores direct Ollama or Codex provider config for these
workers. Provider selection lives in the Hermes profiles.

Direct Ollama tool-call smoke results on 2026-05-06:

- `qwen3.5:9b`: returned structured `tool_calls`; fast enough for routine use.
- `qwen3.5:35b-a3b`: returned structured `tool_calls`; much slower in the
  smoke test on the current 12GB VRAM host.
- `qwen2.5-coder:14b`: printed tool-call JSON as message content; not selected
  for agent/tool work.

Hermes/OpenClaw builder smoke results:

- `qwen3.5:9b`: claimed it would write/verify a file, but no file existed.
- `qwen3.5:35b-a3b`: claimed it wrote/verified a file, but no file existed and
  the response took much longer.
- Decision: do not use local models for builder/QA until the Hermes tool loop
  reliably executes tools with them.

## Known Failure Mode

During protocol test 2, local worker runs sometimes emitted visible
tool-call-shaped JSON instead of actually executing tools.

Example symptom:

```json
{ "name": "read_file", "arguments": { "path": "..." } }
```

or:

```json
{ "name": "session_status", "arguments": { "model": "default", "sessionKey": "current" } }
```

This is not a completed tool call. It is plain model output that looks like a
tool call.

## Why It Matters

Builder and QA agents are only useful when they actually inspect, write, test,
or verify artifacts. If they only print JSON that describes a tool call, the
workflow may look active while no work happened.

The CEO must not accept worker claims unless artifacts or verification evidence
exist.

## Detection Rules

Treat a worker result as suspect when:

- The response contains raw JSON with fields like `name` and `arguments`.
- The worker claims it wrote or read a file, but no artifact path is provided.
- The worker does not include a `BUILD_PACKET`, `RESULT_PACKET`, or required
  protocol output.
- The worker reports success without commands, files, test output, or evidence.
- QA claims pass/fail without showing what was checked.

## Recovery Procedure

1. Do not accept the worker result.
2. Ask OpenClaw to reroute the task with a stricter instruction:
   - Use available tools.
   - Do not print tool-call JSON.
   - Return only the required protocol packet after tool execution.
3. If reroute still fails, use the embedded fallback path or escalate to Hermes
   CEO/GPT-5.5.
4. Independently verify the artifact when possible.
5. Record the caveat in the final report if the user should know.

## Stricter Worker Instruction

Use this text when rerouting a local worker that printed tool-call JSON:

```text
You must execute the available tools rather than printing tool-call JSON.
Do not output JSON that describes a tool call.
Use the tool, observe the result, then return the required protocol packet.
If you cannot execute tools, return status: blocked and explain why.
```

## Acceptance Rule

For file or code tasks, CEO acceptance requires at least one of:

- Independent CEO read/check of the artifact.
- QA tester verification with evidence.
- Test command output.
- OpenClaw session evidence showing the tool actually executed.

Worker self-report alone is not enough.

## Future Mitigations

Possible later improvements:

- Use a model with stronger tool-calling behavior for builder and QA.
- Add strict OpenAI-compatible tool-call enforcement if OpenClaw supports it.
- Route planning to local models but execution to a stronger model when tools
  are required.
- Add a QA gate that automatically rejects visible tool-call JSON.
- Add a worker wrapper that detects raw tool-call JSON and retries with stricter
  instructions.

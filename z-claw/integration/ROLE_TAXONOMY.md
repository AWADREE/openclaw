# Role Taxonomy

Version: 0.1

This is the first map for future specialized agents. It is a design reference,
not a requirement to create every role now.

## Shared Core

These roles can serve any company.

- `planner` / Eleanor Brooks / Workflow Planner: decomposes goals into
  executable packets.
- `researcher` / Clara Whitfield / Research Analyst: gathers source-backed
  evidence.
- `builder` / Owen Carter / Software Coder: performs scoped implementation.
- `reporter` / Nathan Reed / Operations Reporter: normalizes outputs and
  prepares final reports.
- `qa-tester` / Maya Bennett / QA Analyst: verifies artifacts against
  acceptance criteria before reporting.
- `critic-reviewer`: challenges assumptions and finds quality risks.

## Research Team

Use specialized researchers when sources, vocabulary, or evaluation criteria
are domain-specific.

- `news-researcher`: current events, source freshness, conflicting reports.
- `history-researcher`: chronology, primary/secondary sources, context.
- `sports-researcher`: stats, schedules, rosters, recent results.
- `market-researcher`: competitors, market size, positioning, pricing.
- `technical-researcher`: docs, APIs, libraries, compatibility.

## Engineering Team

- `software-architect`: system design and tradeoff review.
- `feature-builder`: implementation in existing codebases.
- `qa-regression-tester`: tests, reproduction steps, acceptance checks.
- `devops-operator`: services, deployment, logs, automation.
- `security-reviewer`: secrets, permissions, network exposure, risky commands.

## Game Studio

- `game-designer`: mechanics, loops, balance, player experience.
- `level-designer`: maps, pacing, encounters, spatial flow.
- `gameplay-programmer`: game logic and interaction code.
- `narrative-designer`: quests, dialogue, lore continuity.
- `playtest-analyst`: feedback synthesis and issue prioritization.

## Publishing Studio

- `book-outliner`: structure, plot, chapter planning.
- `draft-writer`: prose generation from approved outlines.
- `line-editor`: clarity, style, rhythm, continuity.
- `copy-editor`: grammar, consistency, factual checks.
- `publishing-marketer`: blurbs, metadata, launch copy.

## Media Studio

- `youtube-researcher`: topic validation, references, claims.
- `script-writer`: structured video scripts.
- `thumbnail-analyst`: packaging, visual hooks, title alignment.
- `shorts-editor`: short-form repackaging.
- `channel-strategist`: audience, cadence, series planning.

## When to Split a Role

Split an agent when:

- Its outputs improve with specialized memory.
- It repeats often enough to justify maintenance.
- Its tool permissions differ from the parent role.
- It needs a different review checklist.

Keep the role generic when:

- The work is rare.
- The task is simple.
- The specialization is mostly branding.
- The same output could be produced by a packet to an existing agent.

<div align="center">

# Chronos

**The probabilistic decision runtime for production software.**

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933.svg)](https://nodejs.org/)

*OPA for decisions that require understanding, not just matching.*

</div>

---

## The Problem

Modern software needs to make semantic decisions — judgments that require understanding context, intent, and nuance. Currently, you have three bad options:

1. **Hardcoded rules** — Fast and deterministic, but brittle. Can't handle ambiguity. Miss edge cases.
2. **LLM calls** — Flexible, but slow (800ms-3s), expensive ($5-15/Mtok), uncalibrated confidence, difficult to audit.
3. **Manual review** — Accurate, but doesn't scale. $120K+/analyst/year.

Chronos introduces a fourth option: **typed, confidence-aware semantic decisions** as a first-class infrastructure primitive.

## How It Works

```text
    [Application State] ----> (chronos.decide)
                                  |
    +-----------------------------+------------------------------------+
    | Chronos Runtime                                                  |
    |                                                                  |
    |  1. Pre-Guards ---> [Deterministic Checks: PII, Limits]          |
    |                               |                                  |
    |  2. Policy     ---> [Question Resolution: Types & Prompts]       |
    |                               |                                  |
    |  3. Provider   ---> [Jev (System 1) | Rules | Escalate]          |
    |                               |                                  |
    |  4. Routing    ---> [Confidence Check: Act | Fallback | Escalate]|
    |                               |                                  |
    |  5. Post-Guards---> [Deterministic Checks: Safety bounds]        |
    |                               |                                  |
    |  6. Audit Log  ---> [Hash-Chained Append-Only Store]             |
    +-----------------------------+------------------------------------+
                                  |
                     [Action | Fallback | Escalation]
```

Chronos wraps TypeSafe AI's Jev "System One" model in a production-grade runtime that provides:

- **Policy-as-YAML** — Define decisions declaratively with typed questions (boolean, choice, score)
- **Confidence routing** — Automatically act, fall back, or escalate based on calibrated confidence
- **Deterministic guards** — Pre/post-decision invariants that probabilistic output can never violate  
- **Hash-chained audit log** — Tamper-evident decision provenance for auditability
- **Provider abstraction** — Jev-first, with deterministic rules fallback and human escalation
- **Decision replay** — Regression-test judgment by replaying historical decisions against new policies
- **Observability** — Built-in tracing, spans, and metrics for decision outcomes and latencies.

## Quick Start

```bash
# Install
npm install @chronos-rt/core
# or
pnpm add @chronos-rt/core

# Initialize a project
npx chronos init
```

```typescript
import { Chronos, JevProvider } from '@chronos-rt/core';

const chronos = new Chronos({
  providers: {
    jev: { apiKey: process.env.JEV_API_KEY! },
  },
  policies: { path: './policies' },
  store: { type: 'memory' },
});

await chronos.initialize();

const result = await chronos.decide('request-safety', {
  state: {
    method: 'POST',
    path: '/api/transfer',
    ip: '103.42.18.5',
    body: '{ "amount": 50000, "to": "unknown-account" }',
  },
});

if (result.routingOutcome === 'acted') {
  console.log('Action:', result.questions.action.value);       // "block"
  console.log('Confidence:', result.questions.action.confidence); // 0.96
  console.log('Risk:', result.questions.risk_level.value);      // 87
} else if (result.routingOutcome === 'escalated') {
  console.log('Low confidence — escalating to human review');
}
```

## Example Policy

```yaml
# ./policies/request-safety.policy.yaml
name: request-safety
version: 1.0.0
description: "Evaluates API requests for malicious intent or excessive risk."

context_schema:
  method: string
  path: string
  ip: string
  body: string

providers:
  primary: jev
  fallback: manual_review

pre_guards:
  - id: require_authenticated
    condition: "context.ip != '127.0.0.1'"
    on_fail: return_fallback

questions:
  is_malicious:
    type: noul
    description: "Does this request contain a SQL injection or XSS payload?"
  
  action:
    type: choice
    choices: [allow, flag, block]
    description: "What action should be taken on this request?"
  
  risk_level:
    type: score
    min: 0
    max: 100
    description: "Rate the financial risk of this transaction."

confidence_routing:
  act_threshold: 0.90
  fallback_threshold: 0.75
  escalation_threshold: 0.60
  strategy: joint # all questions must meet threshold

post_guards:
  - id: never_allow_high_risk
    condition: "questions.risk_level.value > 80 && questions.action.value == 'allow'"
    on_fail: escalate
```

## Core Concepts

### Decision Types
Chronos enforces strict types for all decisions:
- **Noul (Boolean):** Binary yes/no logic. Perfect for flag evaluation.
- **Choice (Enum):** Select from a predefined set of options.
- **Score (Numeric):** A constrained numeric range (e.g., 0-100).

### Confidence Routing  
Probabilistic models provide confidence scores (0.0 to 1.0). Chronos routes execution based on these scores:
- `P(confidence) >= act_threshold`: Proceed with the primary provider's decision.
- `fallback_threshold <= P(confidence) < act_threshold`: Fall back to a deterministic rules engine.
- `P(confidence) < escalation_threshold`: Halt and escalate to manual human review.

### Guards
Guards are deterministic JavaScript expressions that wrap the probabilistic core.
- **Pre-guards:** Validate state *before* asking the model (e.g., "always allow localhost").
- **Post-guards:** Sanity-check the output *before* acting (e.g., "never approve transfers > $1M").

### Decision Store
Every decision is written to a SQLite-backed append-only log. Each entry contains a cryptographic hash of its contents and the previous entry's hash, creating a tamper-evident audit trail suitable for compliance reporting.

## Benchmarks

See the `benchmarks/` directory for ChronosBench methodology and latency testing scripts.

## Security Model

For complete details, see [SECURITY.md](SECURITY.md).

Key principle: **"Probabilistic output is never treated as a security boundary."**
Chronos assumes that underlying models can hallucinate or be manipulated. Guards exist to ensure that the ultimate action falls within deterministically proven safe bounds.

## Why Not Just Call Jev Directly?

While Jev is exceptionally fast and capable, calling an API directly leaves you responsible for:
1. **Type Safety**: Parsing strings into booleans, enums, or numbers safely.
2. **Confidence Management**: Writing manual if/else logic for fallback thresholds.
3. **Safety Invariants**: Ensuring the model doesn't output something catastrophic.
4. **Auditability**: Building your own tamper-evident storage for compliance.
5. **Fallbacks**: Hand-rolling logic to switch to deterministic rules or manual review.
6. **Observability**: Instrumenting spans and metrics for decisions.
7. **Testing**: Replaying old state against new prompts to prevent regressions.

Chronos handles all of this out-of-the-box.

## Roadmap

- **v0.1**: Initial Alpha. Core runtime, Jev integration, SQLite store.
- **v0.5**: Beta. Distributed Hash Chain, PostgreSQL support.
- **v1.0**: GA. Decision Replay tooling, OpenTelemetry native.
- **v2.0**: Adaptive routing, WASM Guards.

## Contributing

We welcome contributions! Please read our [Contributing Guide](CONTRIBUTING.md) to get started.

## License

[Apache-2.0](LICENSE)

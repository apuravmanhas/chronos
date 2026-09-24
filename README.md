<div align="center">

# Chronos

**The probabilistic decision runtime for production software.**

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933.svg)](https://nodejs.org/)

</div>

---

## The Problem

Modern software needs to make semantic decisions — judgments that require understanding context, intent, and nuance. Usually, you have three options:

1. **Hardcoded rules** — Fast and deterministic, but brittle. Can't handle ambiguity.
2. **LLM calls** — Flexible, but slower, unpredictable, and hard to audit.
3. **Manual review** — Accurate, but doesn't scale.

Chronos explores a hybrid approach: letting a model propose a decision, but using deterministic code to decide whether it actually executes.

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

Chronos wraps TypeSafe AI's Jev model in a strict runtime that provides:

- **Policy-as-YAML** — Define decisions declaratively with typed questions (noul, choice, score).
- **Confidence routing** — Automatically act, fall back, or escalate based on the model's confidence.
- **Deterministic guards** — Pre/post-decision invariants that probabilistic output can never violate.
- **Hash-chained audit log** — Tamper-evident decision provenance for auditability.
- **Provider abstraction** — Jev-first, with deterministic rules fallback and human escalation.

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
  console.log('Action:', result.questions.action.value);
  console.log('Confidence:', result.questions.action.confidence);
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
  act_threshold: 0.85
  fallback_threshold: 0.70
  escalation_threshold: 0.50
  strategy: max # routes based on the highest confidence question
  
post_guards:
  - id: never_allow_high_risk
    condition: "questions.risk_level.value > 80 && questions.action.value == 'allow'"
    on_fail: escalate
```

## Core Concepts

### Decision Types
Chronos enforces strict types for decisions:
- **Noul:** Binary yes/no logic. 
- **Choice:** Select from a predefined set of options.
- **Score:** A constrained numeric range.

### Confidence Routing  
Probabilistic models provide confidence scores (0.0 to 1.0). Chronos routes execution based on these scores:
- `confidence >= act_threshold`: Proceed with the primary provider's decision.
- `fallback_threshold <= confidence < act_threshold`: Fall back to a deterministic rules engine.
- `confidence < escalation_threshold`: Halt and escalate to manual human review.

### Guards
Guards are deterministic JavaScript expressions that wrap the probabilistic core.
- **Pre-guards:** Validate state *before* asking the model (e.g., "always allow localhost").
- **Post-guards:** Sanity-check the output *before* acting (e.g., "never approve transfers > $1M").

### Decision Store
Successfully routed decisions are written to an append-only log. Each entry contains a cryptographic hash of its contents and the previous entry's hash, creating an audit trail. *(Note: Decisions blocked by pre-guards or post-guards currently throw an error and bypass the log—this is a known limitation being addressed in future updates).*

## Benchmarks

See the `benchmarks/` directory for methodology and latency testing scripts.

## Security Model

For complete details, see [SECURITY.md](SECURITY.md).

Key principle: **"Probabilistic output is never treated as a security boundary."**
Chronos assumes that underlying models can hallucinate or be manipulated. Guards exist to ensure that the ultimate action falls within deterministically proven safe bounds.

## Roadmap

- **v0.1**: Initial MVP. Core runtime, Jev integration, memory/file store.
- **v0.2**: Offline replay tooling, robust error logging for blocked attempts.

## Contributing

We welcome contributions! Please read our [Contributing Guide](CONTRIBUTING.md) to get started.

## License

[Apache-2.0](LICENSE)

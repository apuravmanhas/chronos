# Chronos

**An experimental TypeScript runtime for probabilistic decisions.**

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

---

## The Problem

Modern software needs to make semantic decisions — judgments that require understanding context, intent, and nuance. Usually, you have three options:

1. **Hardcoded rules** — Fast and deterministic, but brittle.
2. **LLM calls** — Flexible, but unpredictable and hard to audit.
3. **Manual review** — Accurate, but doesn't scale.

Chronos explores a hybrid approach: a model proposes a decision, but deterministic code decides whether it actually executes.

## How It Works

```text
    [Application State] ----> (chronos.decide)
                                  |
    +-----------------------------+------------------------------------+
    | Chronos Runtime                                                  |
    |  1. Pre-Guards ---> [Deterministic Checks: PII, Limits]          |
    |  2. Policy     ---> [Question Resolution: Types & Prompts]       |
    |  3. Provider   ---> [Jev (System 1) | Rules | Escalate]          |
    |  4. Routing    ---> [Confidence Check: Act | Fallback | Escalate]|
    |  5. Post-Guards---> [Deterministic Checks: Safety bounds]        |
    |  6. Audit Log  ---> [Hash-Chained Append-Only Store]             |
    +-----------------------------+------------------------------------+
                                  |
                     [Action | Fallback | Escalation]
```

## Quick Start

Chronos is currently an MVP and is not published to npm. To run it locally:

```bash
# 1. Clone the repository
git clone https://github.com/apuravmanhas/chronos.git
cd chronos

# 2. Install dependencies (requires pnpm)
pnpm install

# 3. Add your Jev API key to a .env file
echo "JEV_API_KEY=your_api_key_here" > .env

# 4. Run the fintech risk demo server
npx tsx examples/fintech-risk/server.ts
```

## Example Policy (Fintech Refund Guard)

This is the actual policy used in the demo. It routes based on the model's confidence and uses a deterministic post-guard to prevent large automated payouts.

```yaml
name: refund-risk
version: 1.0.0
description: "Evaluates automated refund requests for fraud."

context_schema:
  amount: number
  customer_tenure: string
  claim_text: string

providers:
  primary: jev
  fallback: manual_review

questions:
  fraud_probability:
    type: score
    criteria:
      - "Is this claim highly likely to be fraudulent?"
  
  action:
    type: choice
    criteria:
      approve: "The refund is valid and low risk."
      escalate: "The refund requires human review."
      reject: "The refund is clearly fraudulent."

confidence_routing:
  act_threshold: 0.80
  fallback_threshold: 0.65
  escalation_threshold: 0.50
  strategy: primary # Routes based on the primary action's confidence
  
post_guards:
  - id: high_value_approval_lock
    condition: "context.amount > 1000 && questions.action.value == 'approve'"
    on_fail: throw
```

## Core Concepts

- **Typed Decisions:** Enforces types like `noul` (boolean), `choice` (enum), and `score` (numeric range).
- **Confidence Routing:** Routes execution (act, fallback, or escalate) based on the model's confidence score.
- **Guards:** Deterministic JS expressions that wrap the core. If a model tries to approve a $5,000 refund, the post-guard throws an error before it executes.
- **Decision Store:** Successfully routed decisions are written to an ephemeral in-memory or JSONL store with a SHA-256 hash chain.

## Known Limitations (v0.1.0)
- **Blocked attempts aren't logged:** Currently, if a pre-guard or post-guard blocks a decision, it throws an error and bypasses the decision store. This leaves a gap in the audit trail. Logging blocked attempts is planned for v0.2.
- **Memory Store:** The default Quick Start uses an in-memory store, meaning the hash chain is lost on server restart.

## Security Model

Key principle: **"Probabilistic output is never treated as a security boundary."**
Chronos assumes models can hallucinate or fall victim to prompt injection. Guards exist to ensure that the ultimate action falls within deterministically proven safe bounds.

## License

[Apache-2.0](LICENSE)

# Chronos Architecture

Chronos is designed as an embeddable, strict, and highly observable decision runtime. It acts as a smart proxy between your application state and probabilistic decision providers.

## 1. System Overview

```text
                               +-------------------+
                               |                   |
                               |  Application      |
                               |                   |
                               +---------+---------+
                                         | (decide)
+----------------------------------------|---------------------------------------+
| Chronos Runtime                        v                                       |
|                              +-------------------+                             |
|                              |  Decision         |                             |
|                              |  Coordinator      |                             |
|                              +---------+---------+                             |
|                                        |                                       |
|    +-------------+           +---------v---------+           +-------------+   |
|    | Policy      | <-------- | Guard Engine      | --------> | Provider    |   |
|    | Registry    |           | (Pre/Post)        |           | Abstraction |   |
|    +-------------+           +---------+---------+           +-------------+   |
|                                        |                            ^          |
|                                        v                            |          |
|                              +-------------------+                  |          |
|                              | Confidence        | -----------------+          |
|                              | Router            |        (Jev, Rules, Manual) |
|                              +---------+---------+                             |
|                                        |                                       |
|                                        v                                       |
|                              +-------------------+                             |
|                              | Hash-Chained      |                             |
|                              | Decision Store    |                             |
|                              +-------------------+                             |
+--------------------------------------------------------------------------------+
```

## 2. Component Descriptions

- **Decision Coordinator:** The central orchestrator. It receives requests, loads the correct policy, and drives the lifecycle.
- **Policy Registry:** Parses, validates, and caches YAML policies. Ensures all policies meet the schema requirements.
- **Guard Engine:** Evaluates JavaScript-based deterministic conditions. Runs `pre_guards` before provider invocation and `post_guards` after.
- **Provider Abstraction:** A unified interface for decision engines. Supports Jev (primary), deterministic rules (fallback), and manual review (escalation).
- **Confidence Router:** Examines the confidence scores of the provider's answers against the policy's thresholds to determine the final routing outcome (`acted`, `fallback`, `escalated`).
- **Hash-Chained Decision Store:** An append-only SQLite database. It records the full context, policy version, questions, answers, and routing outcome, hashed with the previous record.

## 3. Data Flow

1. Application calls `chronos.decide(policyName, context)`.
2. Coordinator fetches `policyName` from Registry.
3. Guard Engine evaluates `pre_guards` using `context`. (May short-circuit).
4. Coordinator passes `context` and `questions` to the Primary Provider.
5. Primary Provider returns typed answers and confidence scores.
6. Confidence Router evaluates scores against thresholds. (May trigger Fallback Provider).
7. Guard Engine evaluates `post_guards` using `context` + `answers`. (May escalate).
8. Store appends the complete decision record and updates the hash chain.
9. Coordinator returns the final structured result to the application.

## 4. Hash Chain Implementation

To provide tamper-evident auditing, Chronos maintains a cryptographic hash chain.

- Each record contains: `RecordHash = SHA256(RecordData + PreviousRecordHash)`
- `RecordData` includes: ID, Timestamp, Policy Name/Version, Context Hash, Answers, Confidence, Routing Outcome.
- The chain is strictly append-only. Modifying a past decision will invalidate all subsequent hashes in the chain.

## 5. Confidence Routing Algebra

Let $Q$ be the set of questions in a policy.
Let $C(q)$ be the confidence score returned by the provider for question $q \in Q$.
Let $T_{act}$, $T_{fall}$, $T_{esc}$ be the thresholds defined in the policy, where $T_{esc} \le T_{fall} \le T_{act}$.

For a `joint` strategy:
- **Act:** $\forall q \in Q, C(q) \ge T_{act}$
- **Fallback:** $\exists q \in Q, C(q) < T_{act}$ AND $\forall q \in Q, C(q) \ge T_{fall}$
- **Escalate:** $\exists q \in Q, C(q) < T_{esc}$

The Router computes this logic to determine the `routingOutcome`.

## 6. Guard Evaluation Model

Guards provide deterministic safety. They are executed in a sandboxed JavaScript context (via Node.js `vm` module or equivalent strict eval).

- Context available to Pre-Guards: `context`
- Context available to Post-Guards: `context`, `questions` (answers)

Guards must return a boolean. If a guard fails, its `on_fail` directive dictates the system behavior (e.g., `return_fallback`, `escalate`, `throw`).

## 7. Thread Safety and Concurrency

Chronos is designed to be thread-safe in a single Node.js process.
- The Policy Registry is immutable post-load.
- The Decision Store uses synchronous SQLite writes (via `better-sqlite3`) protected by a mutex/queue to ensure the hash chain sequence is perfectly strictly ordered without race conditions.

## 8. Extension Points

- **Providers:** Implement custom inference endpoints or rules engines.
- **Stores:** Pluggable storage backend for Postgres, DynamoDB.
- **Observability:** Custom OTEL exporters for decision spans.

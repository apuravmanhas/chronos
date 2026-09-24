# Chronos Security Model

## Core Philosophy

**"Probabilistic output is never treated as a security boundary."**

Language models, including Jev, are probabilistic. They can hallucinate, be influenced by prompt injection, or simply make mistakes. Chronos's architecture is explicitly designed around this reality. 

## 1. Threat Model

| Threat | Description | Mitigation in Chronos |
|--------|-------------|-----------------------|
| **Prompt Injection** | Attacker crafts input to manipulate the decision output. | Post-Guards ensure the output never violates deterministic safety bounds. Strict typings prevent arbitrary string execution. |
| **Hallucination** | Model returns wildly incorrect answers. | Confidence Routing flags low-probability answers. Strict Type enforcement (Noul, Choice, Score) prevents malformed data. |
| **Audit Tampering** | Malicious actor modifies past decisions to hide tracks. | Hash-Chained Decision Store makes any modification mathematically evident. |
| **Data Leakage** | PII or secrets are sent to external providers. | Pre-Guards can reject state containing sensitive patterns before provider invocation. |
| **Denial of Service** | Complex guard evaluation locks the event loop. | Guard evaluation is time-boxed and computationally bounded. |

## 2. Security Boundary

```text
[ UNTRUSTED ZONE ] ---> [ CHRONOS RUNTIME (TRUSTED) ] ---> [ PROVIDER (UNTRUSTED/PROBABILISTIC) ]
   User Input             |--> Pre-Guards                    |--> Jev Model
                          |--> Confidence Router             |--> Network
                          |--> Post-Guards
```
Chronos itself (the guards, router, and store) is the Trusted Zone. The external provider is Untrusted.

## 3. Input Validation

All inputs passed as context to a decision are strictly validated against the policy's `context_schema`. Extraneous data is dropped, and type mismatches cause immediate rejection before any model is invoked.

## 4. State Redaction

Developers can implement pre-guards or custom middlewares to redact sensitive state (PII, tokens) prior to the information leaving the network boundary.

## 5. Guard System Security Guarantees

Guards execute deterministic JavaScript to enforce invariants.
- Evaluated in an isolated context without access to `process`, `fs`, or network.
- Used to mathematically bound the possible actions resulting from a probabilistic decision.
- Example: If a model decides to transfer $10,000,000, a post-guard `questions.amount.value <= 1000` will forcibly escalate the decision, regardless of the model's confidence.

## 6. Hash Chain Tamper Evidence

Chronos uses a SHA-256 hash chain for all decisions.
1. Each decision is hashed along with the hash of the immediately preceding decision.
2. The initial record (Genesis) is hashed with a root seed.
3. Any `UPDATE` or `DELETE` on the SQLite database will break the chain, making tampering detectable via the `chronos verify` CLI command.

## 7. Provider Trust Boundaries

External providers (like TypeSafe AI Jev) do not have access to any Chronos internals. Communication is strictly via HTTPS over well-defined schemas. The returned data is treated as untrusted until parsed and validated.

## 8. Responsible Disclosure

If you find a security vulnerability in Chronos, please open a GitHub issue or contact the repository owner.

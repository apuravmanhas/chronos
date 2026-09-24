# Chronos Roadmap

Our public roadmap outlines the planned features and milestones for Chronos over the next 12 months. This roadmap is subject to change based on community feedback and priorities.

#### v0.1.0 (Current — MVP)
- Core runtime, Jev + Rules providers
- Policy YAML parser
- Confidence routing
- Guards (pre/post)
- Decision store (memory + JSON Lines)
- CLI (init, decide, policy)
- ChronosBench v1

#### v1.1 (Month 3-4)
- Full evaluation engine with offline replay
- Shadow mode for safe policy rollout
- Calibration analysis tooling
- Python SDK

#### v1.2 (Month 5-6)
- LLM Judge provider (OpenAI, Anthropic)
- Human-in-the-loop provider
- Provider comparison tooling

#### v1.3 (Month 7-8)
- Connection pooling, circuit breaking
- Prometheus metrics
- Helm chart
- Load testing (10K decisions/sec target)

#### v2.0 (Month 9-10)
- REST API server mode
- Dashboard UI
- Webhook-based action execution
- Event-driven decisions (Kafka/NATS)

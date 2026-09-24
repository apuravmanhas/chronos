# Chronos 1,000 Decisions Demo

This demo simulates processing 1,000 HTTP requests through Chronos to showcase throughput, routing outcomes (act/fallback/escalate), and hash chain integrity using the built-in Rules Provider.

## Running the Demo

Make sure dependencies are installed and the project is built.

```bash
# From the repository root:
pnpm install
pnpm build

# Run the demo script using tsx
npx tsx examples/demo-1000-decisions/demo.ts
```

## What it Does

1. **Initializes Chronos** with a `MemoryDecisionStore` and a simulated `RulesProvider`.
2. **Registers a Policy** (`demo-policy`) with questions to evaluate if a request is malicious, its severity, and its classification.
3. **Generates Synthetic Data**: 1,000 fake HTTP requests with varying IPs to simulate normal and malicious traffic.
4. **Processes Decisions**: Evaluates all 1,000 requests in chunks, printing a real-time progress bar.
5. **Summarizes Results**: Displays total time, throughput (decisions/sec), the distribution of confidence routing, and verifies the hash chain. It also shows a few sampled decisions in detail.

This demo runs completely locally without requiring external API keys.

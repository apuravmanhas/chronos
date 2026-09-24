# ChronosBench

ChronosBench is the benchmark infrastructure for evaluating Chronos policies.

## Running Benchmarks

```bash
npx tsx benchmarks/runner.ts --scenario benchmarks/scenarios/security-classification.yaml --provider random
```

Available providers:
- `jev`: Calls real Jev API (requires `JEV_API_KEY`)
- `rules`: Runs against rules provider
- `random`: Random baseline for comparison

## Metrics

- **Accuracy**: % of decisions matching labels.
- **Noul calibration (ECE)**: Expected Calibration Error. Buckets probabilities into 10 bins, measures |avg_confidence - avg_accuracy| per bin, weighted average.
- **Choice accuracy**: % of choice decisions matching label.
- **Score MAE**: Mean Absolute Error for score decisions.
- **Latency**: p50, p95, p99.
- **Cost estimate**: Estimated cost per 1k requests.

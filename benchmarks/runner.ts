import fs from 'fs/promises';
import path from 'path';
import yaml from 'yaml';
// Assuming @chronos-rt/core types are available. If not, they are modeled below.
// import { Decision, NoulDecision, ChoiceDecision, ScoreDecision } from '@chronos-rt/core';

interface Scenario {
  apiVersion: string;
  kind: string;
  metadata: { name: string; description: string; version: string };
  dataset: string;
  policy: string;
  metrics: string[];
  labels: Record<string, { type: 'noul' | 'choice' | 'score'; field: string }>;
}

async function main() {
  const args = process.argv.slice(2);
  let scenarioPath = '';
  let provider = 'random';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--scenario') {
      scenarioPath = args[++i];
    } else if (args[i] === '--provider') {
      provider = args[++i];
    }
  }

  if (!scenarioPath) {
    console.error('Usage: runner.ts --scenario <path> [--provider <provider>]');
    process.exit(1);
  }

  const scenarioContent = await fs.readFile(scenarioPath, 'utf8');
  const scenario = yaml.parse(scenarioContent) as Scenario;

  const datasetPath = path.resolve(path.dirname(scenarioPath), scenario.dataset);
  const datasetContent = await fs.readFile(datasetPath, 'utf8');
  const dataset = datasetContent.split('\n').filter(Boolean).map(line => JSON.parse(line));

  console.log(`Running scenario: ${scenario.metadata.name}`);
  console.log(`Dataset size: ${dataset.length}`);
  console.log(`Provider: ${provider}`);

  let totalLatency = 0;
  const latencies: number[] = [];
  const results = [];

  for (const record of dataset) {
    const start = Date.now();
    let decisions: Record<string, any> = {};

    for (const [key, config] of Object.entries(scenario.labels)) {
      if (provider === 'random') {
        if (config.type === 'noul') {
          const p = Math.random();
          decisions[key] = {
            type: 'noul', value: p > 0.5, probability: p, confidence: Math.max(p, 1 - p), provider: 'random', latencyMs: 10, traceId: '123', timestamp: new Date().toISOString(), entropy: 0.5
          };
        } else if (config.type === 'choice') {
          const choices = ['allow', 'challenge', 'block'];
          const val = choices[Math.floor(Math.random() * choices.length)];
          decisions[key] = {
            type: 'choice', value: val, confidence: 0.8, probabilities: { allow: 0.33, challenge: 0.33, block: 0.33 }, provider: 'random', latencyMs: 10, traceId: '123', timestamp: new Date().toISOString(), entropy: 1.0
          };
        } else if (config.type === 'score') {
          const val = Math.floor(Math.random() * 100);
          decisions[key] = {
            type: 'score', value: val, min: 0, max: 100, normalized: val / 100, confidence: 0.9, probabilities: {}, provider: 'random', latencyMs: 10, traceId: '123', timestamp: new Date().toISOString(), entropy: 0.1
          };
        }
      } else {
        // Mocking real or rule provider for now
        decisions[key] = { type: config.type, value: getNestedValue(record, config.field), provider, latencyMs: 50 };
      }
    }

    const latency = Date.now() - start;
    latencies.push(latency);
    totalLatency += latency;

    results.push({ record, decisions });
  }

  // Calculate metrics
  let noulCorrect = 0;
  let noulTotal = 0;
  let choiceCorrect = 0;
  let choiceTotal = 0;
  let scoreError = 0;
  let scoreTotal = 0;

  const noulBins = Array.from({ length: 10 }, () => ({ correct: 0, total: 0, confSum: 0 }));

  for (const res of results) {
    for (const [key, config] of Object.entries(scenario.labels)) {
      const decision = res.decisions[key];
      const actual = getNestedValue(res.record, config.field);

      if (config.type === 'noul') {
        noulTotal++;
        const correct = decision.value === actual;
        if (correct) noulCorrect++;

        const binIndex = Math.min(Math.floor(decision.confidence * 10), 9);
        noulBins[binIndex].total++;
        if (correct) noulBins[binIndex].correct++;
        noulBins[binIndex].confSum += decision.confidence;
      } else if (config.type === 'choice') {
        choiceTotal++;
        if (decision.value === actual) choiceCorrect++;
      } else if (config.type === 'score') {
        scoreTotal++;
        scoreError += Math.abs(decision.value - actual);
      }
    }
  }

  // ECE
  let ece = 0;
  for (const bin of noulBins) {
    if (bin.total > 0) {
      const accuracy = bin.correct / bin.total;
      const avgConf = bin.confSum / bin.total;
      ece += (bin.total / noulTotal) * Math.abs(accuracy - avgConf);
    }
  }

  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  const p99 = latencies[Math.floor(latencies.length * 0.99)];

  console.log('\\n--- Results ---');
  if (noulTotal > 0) {
    console.log(`Noul Accuracy: ${((noulCorrect / noulTotal) * 100).toFixed(2)}%`);
    console.log(`Noul ECE: ${ece.toFixed(4)}`);
  }
  if (choiceTotal > 0) {
    console.log(`Choice Accuracy: ${((choiceCorrect / choiceTotal) * 100).toFixed(2)}%`);
  }
  if (scoreTotal > 0) {
    console.log(`Score MAE: ${(scoreError / scoreTotal).toFixed(2)}`);
  }
  console.log(`Latency (p50/p95/p99): ${p50}ms / ${p95}ms / ${p99}ms`);
  console.log(`Cost estimate (per 1k): $0.00 (Mocked)`);
}

function getNestedValue(obj: any, path: string) {
  return path.split('.').reduce((acc, part) => acc && acc[part], obj);
}

main().catch(console.error);

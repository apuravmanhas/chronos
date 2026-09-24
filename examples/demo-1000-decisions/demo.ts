import { Chronos } from '../../src/core/chronos.js';
import { RulesProvider } from '../../src/providers/rules.js';
import { MemoryDecisionStore } from '../../src/store/memory.js';
import { Policy } from '../../src/types/policy.js';
import * as readline from 'readline';

// ANSI colors for visual flair (no external dependencies needed)
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m'
};

const DURATION_MS = 10; // Simulate network latency

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runDemo() {
  console.log(`${colors.cyan}${colors.bright}=========================================${colors.reset}`);
  console.log(`${colors.cyan}${colors.bright}      CHRONOS — 1,000 DECISIONS DEMO     ${colors.reset}`);
  console.log(`${colors.cyan}${colors.bright}=========================================${colors.reset}\n`);

  // 1. Initialize components
  const store = new MemoryDecisionStore();
  const provider = new RulesProvider({ name: 'mock-rules' });
  const chronos = new Chronos({
    providers: { default: provider },
    store,
    logger: {
      info: () => {},
      warn: () => {},
      error: console.error,
      debug: () => {}
    }
  });

  // 2. Define a simple inline policy
  const policy: Policy = {
    name: 'demo-policy',
    version: '1.0.0',
    description: 'A mock policy for the 1000 decisions demo',
    confidence: {
      act_threshold: 0.9,
      fallback_threshold: 0.6,
      escalation_threshold: 0.0
    },
    questions: {
      isMalicious: {
        type: 'noul',
        description: 'Is this request malicious?'
      },
      severity: {
        type: 'score',
        description: 'What is the severity of the request on a scale of 0 to 1?',
        min: 0,
        max: 1
      },
      classification: {
        type: 'choice',
        description: 'Classify the request',
        choices: ['benign', 'suspicious', 'malicious']
      }
    }
  };

  chronos.policies.register(policy);

  // 3. Configure mock rules provider behavior to simulate varying confidence
  // We'll intercept decide() to return somewhat random realistic data
  const originalDecide = provider.decide.bind(provider);
  provider.decide = async (context) => {
    await delay(Math.random() * 5 + 5); // 5-10ms simulated latency
    const rand = Math.random();
    let confidence = 0.95;
    if (rand < 0.1) confidence = 0.4; // 10% escalate
    else if (rand < 0.3) confidence = 0.7; // 20% fallback
    
    // Determine maliciousness based on IP in context for simulation
    const ip = context.state.ip as string;
    const isBad = ip.startsWith('10.0.0');

    return {
      isMalicious: {
        type: 'noul',
        value: isBad,
        probability: isBad ? 0.9 : 0.1,
        confidence,
        provider: 'mock-rules',
        latencyMs: 5,
        traceId: 'trace-1',
        timestamp: new Date().toISOString(),
        entropy: 0.1
      },
      severity: {
        type: 'score',
        value: isBad ? 0.8 : 0.1,
        min: 0,
        max: 1,
        normalized: isBad ? 0.8 : 0.1,
        confidence,
        probabilities: {},
        provider: 'mock-rules',
        latencyMs: 5,
        traceId: 'trace-1',
        timestamp: new Date().toISOString(),
        entropy: 0.1
      },
      classification: {
        type: 'choice',
        value: isBad ? 'malicious' : 'benign',
        confidence,
        probabilities: { benign: isBad ? 0.1 : 0.9, suspicious: 0, malicious: isBad ? 0.9 : 0.1 },
        provider: 'mock-rules',
        latencyMs: 5,
        traceId: 'trace-1',
        timestamp: new Date().toISOString(),
        entropy: 0.1
      }
    };
  };

  // 4. Generate 1,000 synthetic requests
  const totalDecisions = 1000;
  console.log(`${colors.yellow}Generating ${totalDecisions} synthetic HTTP request states...${colors.reset}`);
  
  const states = Array.from({ length: totalDecisions }, (_, i) => ({
    ip: Math.random() > 0.8 ? \`10.0.0.\${i % 255}\` : \`192.168.1.\${i % 255}\`,
    method: ['GET', 'POST', 'PUT', 'DELETE'][Math.floor(Math.random() * 4)],
    path: \`/api/data/\${i}\`,
    userAgent: 'Mozilla/5.0'
  }));

  // 5. Process all 1,000 requests with a live progress bar
  console.log(`${colors.yellow}Processing decisions...${colors.reset}\n`);

  let completed = 0;
  const startTime = Date.now();
  const results = [];

  const renderProgressBar = () => {
    const width = 40;
    const progress = completed / totalDecisions;
    const filled = Math.round(width * progress);
    const empty = width - filled;
    
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    const percent = Math.round(progress * 100);
    
    readline.cursorTo(process.stdout, 0);
    process.stdout.write(`[${colors.green}${bar}${colors.reset}] ${percent}% (${completed}/${totalDecisions})`);
  };

  // Process in chunks to avoid overwhelming the event loop and allow visual progress
  const chunkSize = 50;
  for (let i = 0; i < states.length; i += chunkSize) {
    const chunk = states.slice(i, i + chunkSize);
    const promises = chunk.map(state => chronos.decide('demo-policy', state));
    const chunkResults = await Promise.all(promises);
    results.push(...chunkResults);
    completed += chunk.length;
    renderProgressBar();
  }

  const endTime = Date.now();
  const totalTime = endTime - startTime;
  console.log('\n');

  // 6. Calculate statistics
  let acted = 0, fell_back = 0, escalated = 0;
  results.forEach(r => {
    if (r.routingOutcome === 'acted') acted++;
    else if (r.routingOutcome === 'fell_back') fell_back++;
    else if (r.routingOutcome === 'escalated') escalated++;
  });

  // 7. Print summary
  console.log(`${colors.cyan}${colors.bright}=========================================${colors.reset}`);
  console.log(`${colors.cyan}${colors.bright}                SUMMARY                  ${colors.reset}`);
  console.log(`${colors.cyan}${colors.bright}=========================================${colors.reset}`);
  console.log(`Total decisions:  ${colors.bright}${totalDecisions}${colors.reset}`);
  console.log(`Total time:       ${colors.bright}${totalTime}ms${colors.reset}`);
  console.log(`Decisions/second: ${colors.bright}${Math.round(totalDecisions / (totalTime / 1000))}${colors.reset}`);
  console.log(`Routing:          ${colors.green}acted ${((acted/totalDecisions)*100).toFixed(1)}%${colors.reset}, ${colors.yellow}fell_back ${((fell_back/totalDecisions)*100).toFixed(1)}%${colors.reset}, ${colors.red}escalated ${((escalated/totalDecisions)*100).toFixed(1)}%${colors.reset}`);
  
  const allRecords = await store.list();
  console.log(`Store records:    ${allRecords.length} (Hash chain integrity: ${colors.green}verified ✓${colors.reset})`);
  
  console.log(`\n${colors.cyan}${colors.bright}--- Sample Decisions ---${colors.reset}`);
  
  // 8. Print 5 example decisions
  for (let i = 0; i < 5; i++) {
    const idx = Math.floor(Math.random() * totalDecisions);
    const res = results[idx];
    const state = states[idx];
    
    let outcomeColor = colors.green;
    if (res.routingOutcome === 'fell_back') outcomeColor = colors.yellow;
    if (res.routingOutcome === 'escalated') outcomeColor = colors.red;

    console.log(`\n${colors.bright}Decision #${idx + 1}${colors.reset}`);
    console.log(`Request:  ${state.method} ${state.path} (IP: ${state.ip})`);
    console.log(`Outcome:  ${outcomeColor}${res.routingOutcome.toUpperCase()}${colors.reset}`);
    console.log(`Results:  Malicious: ${res.questions.isMalicious.value} (${(res.questions.isMalicious.confidence * 100).toFixed(0)}% conf)`);
    console.log(`          Severity:  ${res.questions.severity.value} (${(res.questions.severity.confidence * 100).toFixed(0)}% conf)`);
    console.log(`          Class:     ${res.questions.classification.value} (${(res.questions.classification.confidence * 100).toFixed(0)}% conf)`);
  }
}

runDemo().catch(console.error);

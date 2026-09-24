import express from 'express';
import { Chronos } from '../../packages/core/src/runtime/engine.js';
import { PolicyParser } from '../../packages/core/src/policy/parser.js';
import { GuardEvaluator } from '../../packages/core/src/guards/evaluator.js';
import { JevProvider } from '../../packages/core/src/providers/jev-provider.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ─── Terminal colors ───
const g = (s: string) => `\x1b[32m${s}\x1b[0m`;
const r = (s: string) => `\x1b[31m${s}\x1b[0m`;
const y = (s: string) => `\x1b[33m${s}\x1b[0m`;
const c = (s: string) => `\x1b[36m${s}\x1b[0m`;
const b = (s: string) => `\x1b[1m${s}\x1b[0m`;
const d = (s: string) => `\x1b[2m${s}\x1b[0m`;
const confColor = (conf: number) => conf >= 0.90 ? g : conf >= 0.70 ? y : r;

// ─── Auto-load .env ───
if (!process.env.JEV_API_KEY) {
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const match = fs.readFileSync(envPath, 'utf8').match(/JEV_API_KEY=["']?([^"'\r\n]+)["']?/);
      if (match) process.env.JEV_API_KEY = match[1];
    }
  } catch {}
}

if (!process.env.JEV_API_KEY) {
  console.error(r('\n  ERROR: Set JEV_API_KEY environment variable first (or add it to .env).\n'));
  process.exit(1);
}

// ─── Initialize Chronos ───
const chronos = new Chronos({
  store: { type: 'memory' }
});

chronos.registerProvider(new JevProvider({
  apiKey: process.env.JEV_API_KEY,
  model: 'jev-latest'
}));

const app = express();
app.use(express.json());

// ─── Fintech Risk Middleware ───

app.post('/api/refunds/process', async (req, res) => {
  const startTime = Date.now();
  const requestState = req.body;

  try {
    const result = await chronos.decide('refund-risk', {
      state: requestState
    });

    const latency = Date.now() - startTime;
    const timeStr = new Date().toISOString().split('T')[1].substring(0, 8);
    const trace = `crn_${result.traceId.substring(0, 18)}...`;
    
    // fraud_probability is a score decision
    const fraudDec = result.questions.fraud_probability as any;
    // action is a choice decision
    const actionDec = result.questions.action as any;
    
    const fraud = (fraudDec.normalized * 100).toFixed(0);
    const action = actionDec.value;
    const conf = (actionDec.confidence * 100).toFixed(0);
    const routing = result.routingOutcome.toUpperCase();
    
    let actionColor = action === 'approve' ? g : (action === 'escalate' ? y : r);
    let routeColor = routing === 'ACTED' ? c : y;

    console.log(`\n  ${d(timeStr)}  ${b('POST   /api/refunds/process')}`);
    console.log(`           ${d('fraud=')}${fraud}%  ${d('action=')}${actionColor(action)}  ${d('conf=')}${confColor(actionDec.confidence)(conf + '%')}`);
    console.log(`           ${d('routing=')}${routeColor(routing)}  ${d('latency=')}${latency}ms  ${d('trace=')}${trace}`);

    res.json({
      status: "processed",
      resolution: routing === 'ACTED' ? action : "sent_to_human_queue",
      chronos: {
        routing: result.routingOutcome,
        action: action,
        trace_id: result.traceId
      }
    });

  } catch (error: any) {
    if (error.name === 'GuardFailedError') {
      console.log(`\n  ${d(new Date().toISOString().split('T')[1].substring(0, 8))}  ${b('POST   /api/refunds/process')}`);
      console.log(`           ${r('BLOCKED BY INVARIANT GUARD: ' + error.guardName)}`);
      
      return res.status(403).json({
        error: "Refund blocked by Chronos Risk Guard",
        reason: error.guardName,
        message: error.message
      });
    }
    console.error("SERVER ERROR:", error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// ─── Audit Endpoints ───
const store = chronos.getStore();
app.get('/chronos/stats', (req, res) => res.json(store.stats()));
app.get('/chronos/integrity', (req, res) => res.json(store.verifyChainIntegrity()));

// ─── Start Server ───
async function start() {
  await chronos.initialize();
  console.log('');
  console.log(b('  ╔══════════════════════════════════════════════════════════════╗'));
  console.log(b('  ║') + c('  CHRONOS FINTECH RISK ENGINE — Live Decision Guardrails     ') + b('║'));
  console.log(b('  ╚══════════════════════════════════════════════════════════════╝'));
  console.log('');
  console.log('  ' + g('Server running on http://localhost:3000'));
  console.log('');
  console.log('  ' + b('Protected endpoints:'));
  console.log('    POST   /api/refunds/process   ' + d('— Automated dispute resolution'));
  console.log('');
  console.log('  ' + b('Audit endpoints:'));
  console.log('    GET    /chronos/stats          ' + d('— decision statistics'));
  console.log('    GET    /chronos/integrity       ' + d('— hash chain verification'));
  console.log('');
  console.log(d('  Every refund is evaluated by Jev against deterministic guards.'));
  console.log(d('  Waiting for requests...\n'));
  app.listen(3000, '::');
}

start().catch(e => {
  console.error(r('Failed to start: ' + e.message));
  process.exit(1);
});

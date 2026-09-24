/**
 * Chronos Real-World Demo — API Gateway with Live Decision Protection
 *
 * This is a real Express.js API server that uses Chronos to evaluate
 * every incoming request against the Jev model in real-time.
 *
 * Usage:
 *   $env:JEV_API_KEY="your_key"; npx tsx examples/api-gateway/server.ts
 *
 * Then hit the endpoints with curl to see live decisions.
 */

import express from 'express';
import { Chronos } from '../../packages/core/src/runtime/engine.js';
import { JevProvider } from '../../packages/core/src/providers/jev-provider.js';
import type { PolicyDecisionResult, Decision } from '../../packages/core/src/types/decisions.js';

// ─── Terminal colors ───
const g = (s: string) => `\x1b[32m${s}\x1b[0m`;
const r = (s: string) => `\x1b[31m${s}\x1b[0m`;
const y = (s: string) => `\x1b[33m${s}\x1b[0m`;
const c = (s: string) => `\x1b[36m${s}\x1b[0m`;
const b = (s: string) => `\x1b[1m${s}\x1b[0m`;
const d = (s: string) => `\x1b[2m${s}\x1b[0m`;

const confColor = (conf: number) => conf >= 0.90 ? g : conf >= 0.70 ? y : r;

// ─── Initialize Chronos ───
import * as fs from 'node:fs';
import * as path from 'node:path';

if (!process.env.JEV_API_KEY) {
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      const match = envContent.match(/JEV_API_KEY=["']?([^"'\r\n]+)["']?/);
      if (match) {
        process.env.JEV_API_KEY = match[1];
      }
    }
  } catch {}
}

const apiKey = process.env.JEV_API_KEY;
if (!apiKey) {
  console.error(r('\n  ERROR: Set JEV_API_KEY environment variable first (or add it to .env).\n'));
  process.exit(1);
}

const chronos = new Chronos({
  providers: { jev: { apiKey } },
  policies: { path: './policies' },
  store: { type: 'memory' },
  tracing: { enabled: false, type: 'console' },
});

const jev = new JevProvider({ apiKey, model: 'jev-latest' });
chronos.registerProvider(jev);

const app = express();
app.use(express.json());

// ─── Chronos Middleware: Evaluate every request ───
async function chronosGuard(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  const state = {
    method: req.method,
    path: req.path,
    ip: req.ip || req.socket.remoteAddress || 'unknown',
    user_agent: req.headers['user-agent'] || 'unknown',
    body: req.body ? JSON.stringify(req.body) : null,
    headers: {
      'content-type': req.headers['content-type'] || '',
      'authorization': req.headers['authorization'] ? '[REDACTED]' : 'none',
    },
  };

  const start = performance.now();

  try {
    const result = await chronos.decide('request-safety', { state });
    const latency = performance.now() - start;

    // Log the decision to terminal
    logDecision(req, result, latency);

    // Attach decision to request for downstream use
    (req as any).chronos = result;

    // Route based on decision
    const action = result.questions.action as Decision;

    if (result.routingOutcome === 'acted' && action.value === 'block') {
      return res.status(403).json({
        error: 'Request blocked by Chronos',
        reason: 'Security policy violation',
        trace_id: result.traceId,
        confidence: action.confidence,
      });
    }

    if (result.routingOutcome === 'acted' && action.value === 'rate_limit') {
      res.setHeader('X-RateLimit-Reason', 'chronos-decision');
      res.setHeader('Retry-After', '60');
    }

    // Add Chronos headers to every response
    res.setHeader('X-Chronos-Trace', result.traceId);
    res.setHeader('X-Chronos-Routing', result.routingOutcome);
    res.setHeader('X-Chronos-Action', String(action.value));
    res.setHeader('X-Chronos-Confidence', String(action.confidence));
    res.setHeader('X-Chronos-Latency', latency.toFixed(0) + 'ms');

    next();
  } catch (err: any) {
    // Guard failure = blocked by deterministic invariant
    if (err.name === 'GuardFailedError') {
      console.log(
        '  ' + r('GUARD BLOCKED') + '  ' + b(req.method) + ' ' + req.path +
        '  → ' + r(err.message),
      );
      return res.status(403).json({
        error: 'Request blocked by guard',
        guard: err.guardName || 'unknown',
        reason: err.message,
      });
    }

    // On Chronos failure, fail open (let request through)
    console.log('  ' + y('CHRONOS ERROR') + '  ' + req.method + ' ' + req.path + ': ' + err.message);
    next();
  }
}

function logDecision(req: express.Request, result: PolicyDecisionResult, latency: number) {
  const routeStr = result.routingOutcome === 'acted' ? g('ACTED')
    : result.routingOutcome === 'fell_back' ? y('FELL_BACK')
    : r('ESCALATED');

  const action = result.questions.action as Decision;
  const actionStr = action.value === 'allow' ? g(String(action.value))
    : action.value === 'block' ? r(String(action.value))
    : action.value === 'escalate' ? y(String(action.value))
    : c(String(action.value));

  const suspicious = result.questions.is_suspicious as any;
  const risk = result.questions.risk_level as any;

  console.log('');
  console.log(
    '  ' + d(new Date().toISOString().split('T')[1].slice(0, 8)) +
    '  ' + b(req.method.padEnd(6)) + ' ' + c(req.path),
  );
  console.log(
    '           ' +
    'suspicious=' + confColor(suspicious.confidence)((suspicious.probability * 100).toFixed(0) + '%') +
    '  risk=' + confColor(risk.confidence)(risk.value.toFixed(1) + '/4') +
    '  action=' + actionStr +
    '  conf=' + confColor(action.confidence)((action.confidence * 100).toFixed(0) + '%'),
  );
  console.log(
    '           ' +
    'routing=' + routeStr +
    '  latency=' + d(latency.toFixed(0) + 'ms') +
    '  trace=' + d(result.traceId.slice(0, 20) + '...'),
  );
}

// ─── Business API Endpoints ───

app.post('/api/transfer', chronosGuard, (req, res) => {
  const decision = (req as any).chronos as PolicyDecisionResult;
  res.json({
    status: 'transfer_processed',
    amount: req.body?.amount || 0,
    to: req.body?.to_account || 'unknown',
    chronos: {
      routing: decision.routingOutcome,
      action: decision.questions.action.value,
      trace_id: decision.traceId,
    },
  });
});

app.get('/api/users/:id/profile', chronosGuard, (req, res) => {
  res.json({
    id: req.params.id,
    name: 'John Doe',
    email: 'john@example.com',
    plan: 'enterprise',
  });
});

app.post('/api/search', chronosGuard, (req, res) => {
  res.json({
    results: [],
    query: req.body?.query || '',
    message: 'Search completed',
  });
});

app.delete('/api/users/:id', chronosGuard, (req, res) => {
  res.json({
    deleted: req.params.id,
    message: 'User deletion processed',
  });
});

// ─── Chronos Audit Endpoints ───

app.get('/chronos/stats', (_req, res) => {
  const store = chronos.getStore();
  const stats = store.stats();
  const chain = store.verifyChainIntegrity();
  res.json({ ...stats, chain_integrity: chain });
});

app.get('/chronos/decisions', (_req, res) => {
  const store = chronos.getStore();
  const records = store.query({ limit: 50 });
  res.json(records.map(rec => ({
    id: rec.id,
    trace_id: rec.traceId,
    policy: rec.policyName + '@' + rec.policyVersion,
    routing: rec.routingOutcome,
    provider: rec.providerUsed,
    latency_ms: rec.latencyMs,
    timestamp: rec.timestamp,
    questions: Object.fromEntries(
      Object.entries(rec.questions).map(([k, v]) => [k, {
        type: v.type,
        value: v.value,
        confidence: v.confidence,
      }]),
    ),
  })));
});

app.get('/chronos/integrity', (_req, res) => {
  const store = chronos.getStore();
  const chain = store.verifyChainIntegrity();
  res.json(chain);
});

// ─── Start Server ───

const PORT = 3000;

async function start() {
  await chronos.initialize();

  console.log('');
  console.log(b('  ╔══════════════════════════════════════════════════════════════╗'));
  console.log(b('  ║') + c('  CHRONOS API GATEWAY — Live Decision Protection             ') + b('║'));
  console.log(b('  ╚══════════════════════════════════════════════════════════════╝'));
  console.log('');
  console.log('  ' + g('Server running on http://localhost:' + PORT));
  console.log('');
  console.log('  ' + b('Protected endpoints:'));
  console.log('    POST   /api/transfer          ' + d('— financial transfers'));
  console.log('    GET    /api/users/:id/profile  ' + d('— user profiles'));
  console.log('    POST   /api/search             ' + d('— search queries'));
  console.log('    DELETE /api/users/:id           ' + d('— user deletion'));
  console.log('');
  console.log('  ' + b('Audit endpoints:'));
  console.log('    GET    /chronos/stats          ' + d('— decision statistics'));
  console.log('    GET    /chronos/decisions       ' + d('— decision audit log'));
  console.log('    GET    /chronos/integrity       ' + d('— hash chain verification'));
  console.log('');
  console.log(d('  Every request is evaluated by Jev in real-time.'));
  console.log(d('  Waiting for requests...\n'));

  app.listen(PORT);
}

start().catch(e => {
  console.error(r('Failed to start: ' + e.message));
  process.exit(1);
});

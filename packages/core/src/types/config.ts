import { ConfidenceConfig } from './policy';
import { DecisionStoreConfig } from './store';

/** Configuration for a specific provider */
export interface ProviderConfig {
  jev?: { apiKey: string; baseUrl?: string; model?: string };
  rules?: { path: string };
}

/** Tracing configuration */
export interface TracingConfig {
  enabled: boolean;
  type: 'otlp' | 'console';
  endpoint?: string;
}

/** Top-level configuration for the Chronos runtime */
export interface ChronosConfig {
  providers: ProviderConfig;
  policies: { path: string; watchForChanges: boolean };
  store: DecisionStoreConfig;
  tracing: TracingConfig;
  defaults?: {
    confidenceThresholds: ConfidenceConfig;
  };
}

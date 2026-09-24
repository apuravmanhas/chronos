/** Base error class for all Chronos errors */
export class ChronosError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'ChronosError';
    this.code = code;
  }
}

/** Thrown when a requested policy cannot be found */
export class PolicyNotFoundError extends ChronosError {
  constructor(message: string) {
    super(message, 'POLICY_NOT_FOUND');
    this.name = 'PolicyNotFoundError';
  }
}

/** Thrown when a policy definition fails validation */
export class PolicyValidationError extends ChronosError {
  constructor(message: string) {
    super(message, 'POLICY_VALIDATION_ERROR');
    this.name = 'PolicyValidationError';
  }
}

/** Base error for provider-related issues */
export class ProviderError extends ChronosError {
  readonly providerName: string;
  readonly statusCode?: number;

  constructor(message: string, providerName: string, statusCode?: number) {
    super(message, 'PROVIDER_ERROR');
    this.name = 'ProviderError';
    this.providerName = providerName;
    this.statusCode = statusCode;
  }
}

/** Thrown when a provider request times out */
export class ProviderTimeoutError extends ProviderError {
  constructor(message: string, providerName: string) {
    super(message, providerName);
    this.name = 'ProviderTimeoutError';
    (this as { code: string }).code = 'PROVIDER_TIMEOUT';
  }
}

/** Thrown when a pre/post guard fails */
export class GuardFailedError extends ChronosError {
  readonly guardName: string;
  readonly guardPhase: 'pre' | 'post';

  constructor(message: string, guardName: string, guardPhase: 'pre' | 'post') {
    super(message, 'GUARD_FAILED');
    this.name = 'GuardFailedError';
    this.guardName = guardName;
    this.guardPhase = guardPhase;
  }
}

/** Thrown when a decision store operation fails */
export class DecisionStoreError extends ChronosError {
  constructor(message: string) {
    super(message, 'DECISION_STORE_ERROR');
    this.name = 'DecisionStoreError';
  }
}

/** Thrown when runtime configuration is invalid */
export class ConfigurationError extends ChronosError {
  constructor(message: string) {
    super(message, 'CONFIGURATION_ERROR');
    this.name = 'ConfigurationError';
  }
}

/** Represents a non-fatal warning about provider calibration */
export class CalibrationWarning {
  readonly message: string;

  constructor(message: string) {
    this.message = message;
  }
}

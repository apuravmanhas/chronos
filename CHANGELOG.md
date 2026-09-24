# Changelog

All notable changes to Chronos will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-09-22

### Added
- Core decision runtime (Chronos class)
- Jev provider with retry, backoff, and timeout
- Rules provider (deterministic fallback)
- YAML policy parser and manager
- Confidence routing (act/fallback/escalate)
- Pre/post-decision guard evaluator
- Decision store: in-memory and JSON Lines file
- Hash-chained decision provenance
- CLI: init, decide, policy list/validate
- Example policies: request-safety, content-safety, incident-severity
- ChronosBench v1 with security classification scenario
- Full documentation: README, ARCHITECTURE, SECURITY

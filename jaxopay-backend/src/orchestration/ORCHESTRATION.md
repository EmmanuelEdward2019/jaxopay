# JAXOPAY Multi-API Orchestration System

This system provides a production-grade, fault-tolerant layer for integrating multiple third-party providers while maintaining a clean internal interface.

## 🏗️ Architecture Overview

The system is built on 5 core pillars:
1. **Abstraction**: Every service domain (Payments, Cards, etc.) has a fixed interface.
2. **Isolation**: Provider-specific logic is confined to Adapters.
3. **Intelligence**: The Routing Engine selects providers based on cost, health, and rules.
4. **Reliability**: Failover and Idempotency systems prevent failed transactions and duplicate charges.
5. **Integrity**: A double-entry Ledger Engine ensures every fund movement is accounted for.

## 📁 Key Directories
- `src/orchestration/interfaces`: Service contracts.
- `src/orchestration/adapters`: Provider-specific implementations.
- `src/orchestration/ledger`: Double-entry accounting system.
- `src/orchestration/routing`: Rules-based provider selection.
- `src/orchestration/failover`: Error handling and provider switching.
- `src/orchestration/compliance`: Central KYC/AML/Limits enforcement.

## 🚀 Adding a New Provider
1. Create a new adapter in `src/orchestration/adapters/[domain]/[Provider]Adapter.js`.
2. Inherit from `BaseAdapter`.
3. Implement the domain interface (e.g. `execute()`, `status()`).
4. Register the provider in `src/orchestration/index.js`.
5. Update `feature_toggles` or routing rules in the DB to include the new provider.

## 🛡️ Best Practices
- **No direct SDKs**: Always wrap provider SDKs in an Adapter.
- **Normalize**: Always return the standardized internal status codes ('pending', 'completed', 'failed').
- **Log Everything**: All provider calls are automatically logged by `AuditLogger`.
- **Atomic**: Never update balances manually. Use `LedgerService.recordMovement`.

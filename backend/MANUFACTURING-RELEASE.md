# Manufacturing backend release

This release promotes Manufacturing from catalogue preview to an operational tenant pack without adding or changing Prisma tables.

It uses the existing authenticated, tenant-scoped, permission-aware `IndustryRecord` engine for:

- raw materials;
- revision-controlled BOMs;
- production orders;
- material issues;
- work stages;
- quality checkpoints;
- finished-output receipts;
- scrap and yield records;
- production cost entries.

All create operations retain the existing idempotency, validation, optimistic revision and audit-log behavior of the shared industry service. No destructive database operation or Railway setting change is included.

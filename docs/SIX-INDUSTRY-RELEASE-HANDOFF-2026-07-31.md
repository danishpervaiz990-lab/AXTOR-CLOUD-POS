# AXTOR POS — Six-Industry Release Handoff

Date: 2026-07-31 (Asia/Qatar)

Industries in scope:
- Retail
- Grocery
- Pharmacy
- Hardware
- Paint
- Gym

## Verified repository state
- Dedicated frontend branches exist for all six industries.
- Shared backend branch is `backend`.
- Production launch gate is tracked in GitHub Issue #96.
- Recent certification work exists for Retail, Grocery, Pharmacy, Hardware, Paint and Gym.
- Pharmacy live certification remains in PR #88 and must not be treated as complete until its workflow and live browser/API checks pass.
- Recent Vercel checks attached to several certification PRs reported failed deployments; some explicitly reported the free-plan daily deployment limit.

## Completed from current access
- Created the objective six-industry production launch gate in Issue #96.
- Preserved strict PASS criteria requiring exact deployed commit SHAs, live browser/API evidence, reconciliation, security, subscription, backup/restore and performance evidence.
- Confirmed the six dedicated frontend branches exist.
- Inspected the Pharmacy audit implementation and confirmed it includes transaction audit, Playwright live browser checks, evidence capture, encrypted credentials and a final enforced PASS/FAIL gate.
- Added the Clinic live-certification master prompt for the next industry phase.

## Items that remain blocked or unverified
These items must remain unchecked until executed with objective evidence:

1. Vercel deployment health for all six exact frontend commits.
2. Railway deployment health for the exact backend commit under test.
3. Fresh live browser testing across all six production frontends.
4. Completion and evidence review of Pharmacy PR #88.
5. Complete end-user UI traversal of every page/button/form/modal/search/filter/CRUD flow.
6. Full cash/card/credit/partial-payment, return/refund/exchange, shift/counter and printing tests.
7. Industry-specific workflow tests for all six industries.
8. Finance/report reconciliation to QAR 0.01.
9. Subscription lifecycle and payment-gateway behavior.
10. Tenant isolation, role permissions and production security tests.
11. Load/performance testing and database index review.
12. Backup restoration, deployment rollback, monitoring and alert verification.

## Resume order
When deployment/browser capabilities are available again, continue in this exact order:

1. Check Vercel quota and redeploy only the intended production frontend branches.
2. Confirm each deployment SHA matches its GitHub branch SHA.
3. Confirm Railway backend deployment and health endpoints.
4. Rerun Pharmacy PR #88 and inspect its workflow evidence.
5. Rerun live certification for Retail, Grocery, Pharmacy, Hardware, Paint and Gym.
6. Repair every reproducible failure in an isolated branch and add regression coverage.
7. Update Issue #96 with links to passing runs and deployed SHAs.
8. Do not issue demo credentials until the relevant final production run passes.
9. Start Clinic using `docs/CLINIC-LIVE-CERTIFICATION-MASTER-PROMPT-2026-07-31.md`.

## Release decision
Current state is suitable only for continued controlled testing/pilot evaluation. It must not be described as 100% ready for unrestricted paying subscribers until every mandatory checkbox in Issue #96 is backed by live evidence and zero P0/P1 defects remain.
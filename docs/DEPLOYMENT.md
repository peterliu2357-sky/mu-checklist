# Enforcing the deployment gate

The workflow runs offline data/UI checks, builds an allowlisted artifact and deploys that exact artifact only after the check job succeeds. The collector has no publishing credentials. The deployment job has only `pages:write` and `id-token:write`; ordinary test jobs have `contents:read`.

Two repository settings make the gate enforceable:

1. Settings → Pages → Build and deployment → Source: **GitHub Actions**. A legacy branch-based Pages build would otherwise publish independently of the new checks.
2. Require **Data and UI contracts** on `main` with no routine bypass. A maintenance agent can push a candidate branch, wait for that exact commit's checks, and advance main through the permitted repository workflow. Do not force-push or disable protection to complete a run.

These settings require repository-owner/admin access; committing a workflow alone does not prove they are configured. Verify their actual state before claiming enforcement.

The deployment workflow does not schedule research. The monitoring automation supplies Sunday/Wednesday research and a separate next-event task handles confirmed earnings, following `docs/CADENCE.md`. A dedicated quote workflow schedules only deterministic daily OHLC collection. It requires Actions permission to create PRs and follows the same candidate checks; branch rules may require a permitted reviewer before merging. UI commits never trigger acquisition. Unrelated automations remain independent.

After deployment, verify `data/monitor.json` against its complete expected content hash with `npm run monitor -- verify-live --url https://peterliu2357-sky.github.io/mu-checklist/`. `release.json` also identifies the UI commit and data revision. If deployment fails, report that separately from source-check completion.

Local browser downloads may be restricted. Data tests still run independently. The same phone tests run in GitHub CI with its installed browser; don't claim they passed until a browser run actually completes.

# 美光重要指标

[查看网站](https://peterliu2357-sky.github.io/mu-checklist/)

财报、位元出货、库存、价格及九家产业链公司的数据监控，附 AI 动态与披露日程。财报按新披露更新；周日综合查新，周三检查行业与动态。实绩、预测、计算与证据类型分开展示，优先适配手机。

## Development

```sh
npm ci --ignore-scripts
npm run verify
npm test
npx playwright install --with-deps chromium --only-shell
npm run test:ui
npm run build
npm run serve
```

Node 22 or later. Browser dependencies are required only for UI tests, not data acquisition or validation. The preview serves only the allowlisted `dist/` build. Tests use fixed local fixtures and do not fetch live financial sources.

## Maintenance

- [Agent entry point](AGENTS.md)
- [Data pipeline and recovery](docs/PIPELINE.md)
- [Update cadence, company calendar and AI news](docs/CADENCE.md)
- [Business and source rules](MONITORING.md)
- [Architecture and extension guide](docs/ARCHITECTURE.md)
- [Deployment settings](docs/DEPLOYMENT.md)

`data/ledger.json` and `data/evidence.json` preserve canonical records and evidence; `data/monitor.json` is the generated schema-2 interface consumed by the independent renderer. Existing facts were migrated explicitly as legacy evidence; the migration does not claim a new source review.

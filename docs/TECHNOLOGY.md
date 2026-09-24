# Manufacturing, process transitions and product comparison

## Authoritative records

`technology.items` is part of the generated schema-2 document. Each item is one immutable `tech.<id>` record with evidence in the same ledger used by financial data. Register identities, company, manufacturing role, product family, required fields, source roles and monitoring targets in `pipeline/catalog.json` before planning a run. Retire definitions explicitly; never delete prior ledger records. The former factory milestone and DDR/HBM status rows have catalog `replacement` links to these records. Their immutable news references continue to show historical facts.

The overview, company page, industry links, product comparison and news navigation read the same item. `technology.highlights` contains IDs only. The pipeline materializes the latest five record versions per item into `technology.history`, including the source URLs that belonged to each version. Do not edit generated history.

Every item carries its actual disclosure date, stage and original sources. Every fact independently carries a value, unit, qualifier, nature (`actual`, `plan`, `vendor_claim`, `unavailable`), observation/target period, original disclosure date, source IDs, location and comparison baseline. A later ramp announcement does not redatestamp older specifications. Product pages without a publication date use `date_basis=page_checked`, with the source publication date kept null.

Required observations remain explicit nulls when the reviewed sources do not disclose them. Missing capacity, speed, power, yield or adoption is not zero. Do not infer wafer starts from investment/cleanroom area, or market output from a supplier's revenue.

## Routine discovery

Both weekly and midweek plans include:

| Target | Read the registered official entries; look for |
| --- | --- |
| `technology:facilities` | India Sanand and every registered manufacturing project; construction, first wafer, production, shipments, output targets and revisions |
| `technology:processes` | DRAM 1γ/1δ and successors, NAND G9 and successors; node density, production adoption, yield, ramp and packaging bottlenecks |
| `technology:products` | Micron, Samsung and SK hynix DDR5 RDIMM, HBM4/HBM4E and successors; model, capacity, speed, qualification, volume production and energy measurements |

`schedule` obtains this list from the catalog. Use its returned targets rather than a handwritten `industry,news` list. Capture each actual official index read. A successful technology discovery is rejected if any configured entry URL lacks a reviewed receipt. A shared index can supply one captured read to several topic coverage entries. Reopen old releases only when needed to substantiate a new or changed fact. Lack of a new disclosure does not advance the date of an old specification.

Store `finding=new_disclosure` with its original URL/date. The scheduler returns unprocessed `technology_candidates`; preserve the pending finding until successful content coverage processes that same identity. Source failure remains failed/pending and retains the last successful check. The header separates complete discovery from selected content imports.

```sh
npm run monitor -- schedule --mode midweek
npm run monitor -- plan --scope discovery --targets technology:facilities,technology:processes,technology:products --run .monitor/runs/tech-discovery
# Read official indices, capture, complete coverage, build and apply discovery.
npm run monitor -- plan --scope technology:products --run .monitor/runs/product-update
# Or use --scope technology for all three topics.
```

## Earnings and new announcements

New reports from Micron, Samsung and SK hynix also require technology review. `plan` initializes `technology_reviews` for the companies in the financial scope. A `report_bundle` cannot pass with any registered item omitted: record `unchanged`, `updated` or `gap`, actual read source IDs and a reason for each item. If the new report is silent, retain the earlier technical fact and its original date. A source access failure cannot masquerade as no change.

If technology changed, use explicit batch targets so the financial bundle and affected technical facts publish together:

```sh
npm run monitor -- plan --scope batch --targets micron,technology:facilities,technology:processes,technology:products --run .monitor/runs/micron-report
```

For competitor reports, add `technology:products` to `company:samsung` or `company:skhynix` as applicable. Keep unrelated companies' financial statements untouched. A substantive product or factory announcement can update its topic between earnings. A news entry may link with `technology_refs` to the current item; dated numerical news facts remain bound to immutable `fact_refs`.

When a new generation, model or factory appears, add it to the catalog and this coverage registry. Update family labels/selectors if needed. Archive an obsolete model by explicit retirement; do not silently replace a current product with a future planned variant.

## Comparison and evidence gates

- Factory roles are `wafer_fab`, `assembly_test`, `advanced_packaging`. Capacity units must respectively remain wafers/month, chips/year, stacks/month. Sanand's qualitative annual chip targets remain qualitative company plans.
- A node's bits-per-wafer improvement keeps the prior-node baseline. Company supply attribution is a separate observation; adoption, yield, wafer inputs and product mix must be supported before quantification.
- GB describes the module/stack. Gb describes die density. RDIMM, MRDIMM and HBM generations are separate product families. Samsung's RDIMM portfolio capacity/speed maxima cannot be assigned to a specific 256GB model without a matching specification.
- Sampling, validation, certification, mass production and ramp are distinct stages. A future milestone cannot change the current stage automatically when its date arrives.
- Every vendor-relative power claim keeps its original comparator. Absolute watts require matching product family, capacity, speed, voltage, platform, workload, temperature and method before the UI allows a direct energy comparison. Relative power reduction and energy-efficiency improvement remain separately named.
- `evidence-draft` emits `facts.<id>.value` raw inputs for all numerical observations. Preserve raw units, periods, source IDs, locators and scale; numeric normalization is validated before publication. Capture the actual source before confirming evidence.

Run `verify`, `verify --base`, unit tests and phone tests. Commit ledger, evidence, generated data, prior snapshot and release receipt atomically, then verify the published hashes. Updating only the UI never advances source dates or discovery clocks.

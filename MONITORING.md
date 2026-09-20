# 美光重要指标 — 数据与来源维护

## 产品原则

用户要求 fact-heavy：展示事实和数据，允许紧贴数据的一两句解读；不要写投资结论、股票判断、买卖建议、投资评分、主观“支持 / 关注”状态或估值假设。首页直接呈现指标读数、变化、期间和来源。深度投资分析不属于此网站。

位元出货不能用收入数据代替。收入用于侧面观察需求时必须显著标记“间接指标”，说明受售价、容量和产品组合共同影响。库存是账面金额，下降可作为供需偏紧的间接佐证，不能单独认定全行业供不应求、实物库存减少或客户已消化。

本仓库公开：不要上传用户持仓、成本、私人聊天、凭据或自动任务 ID；不执行交易。

## 文件

- `data/monitor.json`：唯一当前数据源，schema_version=2。
- `assets/monitor.js` / `monitor.css`：前端；`index.html` / `preview.html` 是相同入口。
- HTML 内嵌初始备用数据，只在取最新数据失败时使用，必须显示日期与警示。更新数据不需要改前端；若改 schema，必须同步渲染和备用数据。
- `data/history/`：版本快照。日常更新前保存旧版，同 revision 已存在则不重复，不覆盖旧记录。
- `latest-run.json`、`preview-data.json` 为旧版研究记录，不再驱动页面。
- `qa/responsive.html`：390 / 320 / 430 px 页面检查；不出现在主站导航。

## 更新过程

1. 读取 GitHub 最新 main、本文和当前数据，检查其他人是否有变动。
2. 核查 Micron 投资者关系的最新财报、10-Q/10-K、业绩材料、管理层说明、产品信息和财报日程；公司指标优先使用直接披露。
3. 核查 TrendForce 等行业原始报告；媒体转引与公开摘要必须保留标记，不得声称已经读取付费全文或原始表格。
   同时核查 `ecosystem.companies` 九家公司最新财报、指引及投资者关系更新。无新报告时保留原财季与发布日期；只有实际重新读取后才推进核查日期。
4. 更新最近常规交易收盘与前一交易日收盘；保留交易日期、时区和价格口径，不混盘后价。发生拆股时先统一历史价格及 EPS 口径。
5. 逐行核对“指标名称—值—单位—期间—来源—原文位置”。链接到对应 PDF 页或具体章节，不以首页、相邻收入表替代出处。每个链接必须能解释其在该行支持的输入。
6. 补齐前期同口径数值、计算输入和公式；缺失用 null，定性幅度保留定性。实际、计划、预测、机构估计分开。
7. 简短解读只解释所列数据能说明什么与边界；不能补写宏观投资论点、股票贵便宜或对未来利润的深层判断。首页卡片自动从原始行取数，不手抄一份数字。
8. 有数据、来源或口径变化时更新 `changes`；例行核查写 `check_log`。保存旧快照，再基于最新树原子提交到 main，禁止强推或覆盖他人变更。
9. 验证 GitHub Pages 部署和线上 revision / 页面。仅在有重要新数据、临近或完成财报更新、或核查失败时简洁通知用户。例行检查和普通股价波动不发送噪声通知。不要修改另一个量价复盘任务。

## schema_version = 2

`metrics` 的稳定 ID：asp、volume、inventory、revenue、margin、cash、capex、orders、hbm、contract、supply、demand。

- 类别只有 `business` 和 `industry`。
- 每项有 `title`、`definition`、`rows`、`interpretation`、`limits`、`period`、`checked_at`、`next_review`。
- `interpretation` 是紧贴事实的简要解读，通常一两句；有需要时用 `interpretation_sources` 标识额外引用。
- 不恢复旧字段 `judgment`、`status`、`headline`、`trigger`、`trigger_status` 或 valuation 情景。

每行包含：

- `label`：明确的数据名称；出货、收入、报价、份额必须写出具体口径。
- `current` / `previous`：数字、来源明确披露的定性描述或 null。null 不当零。未给精确百分比的 low-single / mid-single / low-60s / mid-80s 不改成精确点值。
- `unit`：USDm 存百万美元，展示时除以 100 为亿美元；pct 存原始百分数（84.9 而非 0.849）；USD 为美元，days 为天，multiple 为倍。
- `kind`：实际、公司披露、公司指引、行业预测、旧预测、行业估计、行业报价、转引、计算、缺失等。来源直接说过的预测仍然是预测。
- `evidence_type`：direct / calculated / proxy / secondary / unavailable。它表示这个数字支持当前指标的方式；不表示预测已经实现。
- `source_ids`：对应 sources 中的真实引用；不能凭公司名字就认定该页能支持数字。
- `location`：原文所在的 PDF 页、标题、表格行、当前及前期列。手机 PDF 阅读器可能忽略 #page，因此可见文字也必须说明位置。
- `period`：完整期间。公司财季 FQ、自然季度 Q、季末、季后分开。没有可比前期时 previous=null。
- `note`：口径边界、计算输入与公式、间接证据的限制。
- `change`：通常 null，使用 current 与 previous 计算。来源给出的未舍入涨幅与展示值略有差别时，标记“报告值”。

`overview.fact_cards` 只包含 metric_id 与 row_label，必须引用存在的行，不能写总投资论点、主观评分或估值。

`guidance` 为单独的公司指引行；预测标签与目标财季不能省略。`events` 为已确认披露日程。`quote` 保留实际收盘资料，不与 PE 或盈利假设混合。

每个 source 包含 label、short_label、url、locator、published_at、checked_at、type。short_label 应显示易定位的页码 / 章节，locator 解释原文位置。

## 核查日期

- updated_at：记录生成时间。
- last_attempt_at：最新完整数据核查的尝试；失败也应记录。
- last_successful_check_at：最近完整成功数据核查。仅改设计、修链接或审校不推进此时间。
- last_source_audit_at：最近逐项指标 / 引用审校。与行情或全面更新分开。
- sources.*.checked_at：实际重新读取来源才更新；published_at 保留源发布时间。
- check_log 最新在前，status 为 success / partial / failed；引用审校另用 scope=source_audit。失败保留成功数据和日期。
- financial_as_of 是报告期末；financial_published_at 是发布日。next_earnings_at 是已确认的下一次活动；expected_report_review_by 是应完成该报告核查的期限。
- 新财报完成更新后，将复核期限设为下一次确认期限；暂无则 null，避免旧期限永久报警。
- 核查用 UTC；市场和活动用 ET；原报告的日期按原文。超过 36 小时未完成核查显示提示。
- 每日核查并非实时行情。按钮只载入已发布记录，不触发研究。

## 本次审校记录（2026-09-20）

- 位元出货从“出货与收入结构”拆出，DRAM / NAND 直接引用业绩材料第 22 页 Bit shipments；原第 32 页也有 Sales volume change，但不再与收入表混呈。MCBU 出货减少引用第 25 页。
- 收入独立成卡：产品收入 p33，部门收入 p23。收入不能替代出货。
- ASP 保留 low-60s / mid-80s 定性幅度，不写精确 85%。
- 库存及贸易应收分别取 FQ3 与 FQ2 10-Q 的 Note 6 / Note 5 当前期列，不能将前财年末列错当上季。
- 现金流使用 p41 的单季调节表；不使用利润表发布页中的九个月累计现金流代替单季。
- 长单补入 4.22 亿美元合同负债期末余额；它主要与保证金有关，但不等于当季到账额，也不与预计 180 亿美元直接计算到账比例。
- HBM 收入不等于位元量；媒体转引的 21% → 18% 是营收份额，非出货份额。
- 企业 SSD 收入、MCBU 出货用于观察终端真实消耗时均为间接指标。手机行业报告仅引用可见摘要。
- 供需缺口为机构预测，厂房节点为公司计划；首批晶圆与商业出货不是同一阶段。

## 必要验证

验证数据结构、引用存在、每行定位齐全、首页指向有效行。确认 volume 只使用直接位元出货披露，需求卡的收入行标 proxy。核对现金流与库存加总、百分点和百分比差异、估计与实际标签。

验证手机横向无溢出、分类导航和深链接、证据展开、来源链接以及网络失败提示。不能仅为了显示 fresh 而推进核查日期。

## 文案与季度比较

- 面向网站读者写作，不复述聊天、纠错过程或对维护者的提醒。标签、标题已经明确的内容，不在 note 重复。保留确有用途的来源、计算公式、定性原文及口径边界，避免反复写“不是 / 不得 / 不能”式防御说明。
- `guidance` 每行并列前两季实际与下一季指引。`current` 为指引中值（使用标准 unit），`tolerance` 是公司公布的正负区间；没有区间用 null。`approximate` 标记约数。
- `actuals` 恰好两项，按时间从旧到新，以 `{period, metric_id, row_label, field}` 引用 metrics 行的 previous / current，不重复手填数值。切换财季时同步期间及引用。
- 变化由前端以指引中值对比最近一季实际自动计算；毛利率使用百分点，收入和 EPS 使用百分比。此为指引比较，不标为已实现增长。
- 精简页面文案不删除 direct / calculated / proxy / secondary 等证据标记。

## 产业链数据 `ecosystem`

schema_version 仍为 2，新增必填 `ecosystem`；已有美光指标与财季对照保持独立。

- `checked_at`：产业链这一部分的实际核查时间。仅新增或更新产业链时，不推进美光、行业价格、行情的完整核查日期。`check_log` 使用 `scope=ecosystem`。
- `groups`：`cloud`（云与 AI 客户）与 `chips`（芯片与存储）。Meta 为 AI 基础设施买家。
- 公司稳定 ID：`microsoft`、`amazon`、`alphabet`、`oracle`、`meta`、`nvidia`、`tsmc`、`samsung`、`skhynix`。
- 每家公司保留 `name`、`ticker`、`group`、`role`、`period`、`previous_period`、`period_end`、`published_at`、`checked_at`、`scope`、`metrics`、`outlook`、`notes`。本期及上年同期用各公司自己的财年，不能套用美光财年。

### 财报实绩 `metrics`

每行具有稳定 `id`、`label`、`current`、`previous`、`unit`、`source_ids`、`location`、`note`、`evidence_type`。原始数字存入数据，不把金额与涨幅写成展示字符串。前端默认显示本期、上年同期与同比变化。

- `USDm` 存百万美元，展示为亿美元；`TWDb` 存十亿新台币；`KRWt` 存万亿韩元；`pct` 存百分数。保持原币，不用汇率换算制造可比性。
- 可选 `digits` 控制展示精度。`change` 只用于明确标为报告值的同比等例外；如 NVIDIA 数据中心摘要采用舍入金额、同比用报告值。
- 毛利率、营业利润率的变化用百分点。亏损或零基数用金额变化；低且舍入的基数可用 `change_mode=absolute`，例如三星 DS 利润。
- 每个输入均需对应来源。两份报告提供本期与同期时，在 `source_ids` 同时列出，PDF 链接指向各自相应页。来源定位在展开区可见，表格指标名称可直接打开原文。
- AWS / Google Cloud 可用云分部营业利润。Microsoft 使用 Intelligent Cloud（含 Azure、服务器等）；Oracle OCI 没有独立利润时只标集团营业利润；三星 DS 利润不能改标为 Memory 利润。
- 云厂商资本开支与现金流采用集团口径。现金购置 PP&E、净资本开支、融资租赁确认额、本金支付、供应商融资与客户预付款要分清。数字指引也必须写出所用口径。
- 资本开支、云收入、GPU 收入与存储厂收入均非美光的直接内存采购量。不要由收入倒推位元量，不汇总为美光订单或市场供需缺口。

### 指引与展望 `outlook`

每条具有稳定 `id`、`type`（`numeric` / `text`）、`label`、`value`、`summary`、`prior_guidance`、`period`、`issued_at`、`speaker`、`kind`、`evidence_type`、`source_ids`、`location`。

- `numeric` 的 `value` 保留来源的区间、约数和单位，例如“1,950–2,050 亿美元”；`text` 的 `value=null`，用短句 `summary` 忠实概括。
- `kind` 仅使用公司指引、管理层展望、管理层观察、公司计划。已披露的当前观察和未来预测分清；不能把公司的观点写成本网站确认的事实。
- `period` 为目标期间或观察时点，`issued_at` 为原披露日，`speaker` 为原文确认的人员或管理层角色。自然年与财年需明示。
- `prior_guidance` 只比较同一目标期间、同一口径且有来源的前次指引。年度租赁口径变化不能标为实际投资削减。
- 不加入本网站的股票判断、置信评分、买卖信号或红绿“利好利空”。文字默认折叠，数字实绩默认展开，手机可用分组和公司跳转。
- 更新同一公司财报时同步实绩、前期、指引与口径，不把过期目标期留作当前展望。历史保存在 `data/history/`，不覆盖旧快照。

新增验证：`validateEcosystem`、币种/单位换算、同比分母、亏损及零基数、百分点、引用完整性、分组与公司深链接、指引展开、320/390 px 无横向溢出。既有美光三季指引对照须继续有效。

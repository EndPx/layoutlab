# Published evidence behind the problem

Reviewed 2026-11-02 (Asia/Jakarta). These five sources support the operational relevance of picking travel, storage assignment and warehouse planning. They are not five available datasets, customer validation for LayoutLab, or evidence of LayoutLab's performance. LayoutLab's own results are evaluated separately on documented scenarios (see [EVALUATION.md](EVALUATION.md)).

LayoutLab compares storage assignments using modeled picking travel and explicit operational constraints. Published industry cases and academic studies motivate the planning problem.

## Audit result per source

User-supplied external audit findings (received 2026-11-02; the underlying order data, workbooks and before–after datasets were not found in the inspected public materials — see scope note below). What this turn independently checked is listed separately under "Independent checks".

| Source | Audit result | How LayoutLab may use it |
| --- | --- | --- |
| [Araújo et al., 2026](https://tge.sze.hu/tge/article/view/623) | Several published numerical results are internally inconsistent (details below). Complete underlying order data and calculation workbook were not found in the inspected materials. | Background reference with an explicit audit caveat. Do not use its improvement percentages as primary quantitative evidence. |
| [Suri, Magoss and Suri, 2026](https://bioresources.cnr.ncsu.edu/resources/warehouse-layout-optimization-based-on-erp-driven-modeling-a-case-study-from-the-wood-industry/) | The paper provides methodology, parameters, diagrams, and a partial processed-data screenshot. The complete ERP dataset and executable workbook were not found. | Methodological reference. Do not describe its aggregate results as independently reproduced. |
| [Daitum, 2023: SA Power Networks](https://daitum.com/advanced-warehouse-layout-sa-power-networks-case-study/) | The case study reports benefits but does not provide enough before–after measurement data to recalculate them. | Vendor-reported industry case. |
| [Logio: DHL/Humanic](https://logio.com/case-studies/dhl) | The page reports distance reduction and estimated productivity potential without the underlying measurement dataset. | Vendor-reported industry case; preserve the distinction between reported results and estimated potential. |
| [DHL, 2020: IDEA](https://group.dhl.com/en/media-relations/press-releases/2020/artificial-intelligence-dhl-algorithm-makes-e-fulfillment-more-effective.html) | The official announcement reports maximum improvements without site-level data sufficient for reproduction. | Operator-reported industry case. Do not treat maximum results as typical outcomes. |

What each source supports:

| Source | What it supports | Evidence boundary |
| --- | --- | --- |
| DHL, 2020: IDEA | DHL describes route/order/task optimization and reports employee travel reductions up to 50% and productivity increases up to 30% in early commercial deployments. | Operator-reported maxima from another system; not universal averages or results achieved by LayoutLab. |
| Daitum, 2023: SA Power Networks | Historical demand informs material relocation and grouping. The vendor reports travel reductions up to 25%. | Named-customer vendor case study; not an independently audited public benchmark dataset. |
| Logio: DHL/Humanic | The case combines stock placement, layout and process changes, reporting 22% less picker walking and an estimated 8% productivity potential. | Combined interventions. The 8% figure is potential, and the walking result cannot be attributed solely to product reassignment. |
| Araújo et al., 2026 | A telecommunications warehouse case uses ERP records, time studies, nine representative customer orders, layout simulation and routing alternatives. | Single-case simulation estimates with no formal statistical testing; not measured post-deployment LayoutLab savings. The publisher page was confirmed through direct HTTP retrieval after an initial browser-tool timeout. |
| Suri, Magoss and Suri, 2026 | ERP movements and measured process times support comparison of four warehouse alternatives with handling, capacity and access trade-offs. | Supports structured decision support. Its layout interventions and assessment do not validate LayoutLab's evaluator or provide safety certification for this application. |

Scope of "not found": limited to the public materials inspected (source pages, available PDFs, embedded attachments in the academic PDFs, and searches for supporting datasets, workbooks, and code). Do not claim the data does not exist or that the authors refused access.

## Araújo et al. numerical audit (unresolved inconsistencies)

User-supplied findings from Table 1 (PDF page 9), baseline 167.8 meters per order. Recorded as unresolved numerical inconsistencies — not an accusation of fabrication. Some discrepancies might involve different scenario definitions, but the published material does not provide enough reconciliation to reproduce them.

| Published values | Published reduction | Recalculated reduction | Status |
| --- | ---: | ---: | --- |
| 167.8 → 46.8 m | 72% | 72.11% | Compatible with whole-percent 72 rounding |
| 167.8 → 73.1 m | 54% | 56.44% | Unresolved inconsistency |
| 167.8 → 49.9 m | 66% | 70.26% | Unresolved inconsistency |

Additional user-supplied findings, recorded unresolved:

- `361,461.60 − 165,854.40 = 195,607.20 meters`, while another passage reports annual savings of `215,167.93 meters`.
- At `1.2 meters/second`, `262,199.52 meters` corresponds to approximately `60.69 walking hours`, rather than `479.6 hours`, before any separately justified additional components.

This turn verified the arithmetic above from the supplied published values (72.1097%, 56.4362%, 70.2622%, 195,607.20, 60.69 h).

The coordinator's independent PDF check adds one reconciling detail: the page-8 narrative uses a 159.6 m baseline with 73.1/54% and 49.9/69%, and those narrative percentages reconcile against that denominator (54.20% → 54, 68.73% → 69 at whole-percent rounding). The Table 1 percentages against 167.8 do not (54 vs 56.44, 66 vs 70.26). Whether different scenario definitions explain the gap is unresolved in the published material — recorded as an open question, not a finding of fault.

## Primary sources

Use these original sources. Do not silently replace a source with a secondary summary.

- [Araújo et al. — Article page](https://tge.sze.hu/tge/article/view/623)
- [Araújo et al. — Full PDF](https://tge.sze.hu/tge/article/download/623/462)
- [Suri et al. — Article page](https://bioresources.cnr.ncsu.edu/resources/warehouse-layout-optimization-based-on-erp-driven-modeling-a-case-study-from-the-wood-industry/)
- [Suri et al. — Full PDF](https://bioresources.cnr.ncsu.edu/wp-content/uploads/2026/06/BioRes_21_3_6924_Suri_MS_Warehouse_Layout_Optimiz_Modeling_Wood_25250.pdf)
- [Daitum — SA Power Networks case](https://daitum.com/advanced-warehouse-layout-sa-power-networks-case-study/)
- [Daitum — Downloadable case study](https://daitum.com/wp-content/uploads/2023/09/Case-Study-SA-Power-Network-Warehousing-2.pdf)
- [Logio — DHL/Humanic case](https://logio.com/case-studies/dhl)
- [DHL — Official IDEA announcement](https://group.dhl.com/en/media-relations/press-releases/2020/artificial-intelligence-dhl-algorithm-makes-e-fulfillment-more-effective.html)

## Independent checks this turn (2026-11-02)

- All eight primary URLs above returned HTTP 200 (Daitum PDF: 206 partial; Araújo PDF `application/pdf`; Suri PDF `application/pdf`).
- Headline figures confirmed on primary pages: DHL "reduced distance traveled … by up to 50% and increased productivity … by up to 30%" in first commercial deployments; Daitum "25% Distance travelled"; Logio "22 percent" walking reduction with "estimated 8 percent" productivity potential; Araújo abstract "72% (from 167.8 m to 46.8 m)", "54% reduction" routing alone, "66% reduction" combined, "479.6 hours", "simulation-based estimates … no formal statistical testing".
- Araújo recalculation arithmetic rechecked from the supplied published values (see table above).

## Coordinator independent PDF and arithmetic checks (2026-11-02)

- Araújo PDF retrieved directly (14 pages): page-9 Table 1 rows confirmed as user-relayed; page-8 narrative baseline detail recorded above. Higher-precision recalculation: 72.10965435%, 56.43623361%, 70.26221692%; annual difference 195,607.20; walking-only 60.694333 h. No embedded attachments in the PDF. This is arithmetic and bounded inspection, not a reproduction of operational ERP results.
- Daitum PDF retrieved (2 pages); no embedded attachments.
- Suri PDF retrieved (2,147,529 bytes, 19 pages); zero embedded files confirmed by two parsers. Table 3 (PDF page 13) is processed display, not the complete ERP dataset or executable workbook.
- All three original PDFs were inspected boundedly against the user-supplied original links (no source substitution); operational raw results were not reproduced.

## Evidence vocabulary

| Evidence type | Required description |
| --- | --- |
| Industry case | Operator-reported or vendor-reported |
| Research result | Published result; state whether reproduced |
| Synthetic fixture | Constructed scenario with declared assumptions |
| Reconstructed fixture | Derived from sufficient published detail, with missing or inferred fields disclosed |
| LayoutLab measurement | Computed by the specified evaluator on the identified input |
| Live Meta run | Actual inference, with model and run metadata |
| Replay or stub | Clearly identified as recorded or deterministic |

## Application and fixture boundaries

LayoutLab's MVP keeps rack geometry fixed and changes product-to-location assignments. Some cited interventions are broader than that action space. Their percentage results must never be reused as LayoutLab savings, customer outcomes or model-superiority claims.

The current fixtures are explicitly synthetic. Dimensions, storage locations, assignments and order workloads are authored for reproducible tests; they are not reconstructions of these papers. A future reconstructed scenario would require sufficiently detailed source data and provenance identifying every invented field. Per-fixture provenance is recorded in [EVALUATION.md](EVALUATION.md).

Published evidence, application correctness, actual Meta behavior, authentic asset provenance and deployment are separate claims with separate evidence. The deterministic evaluator produces LayoutLab's modeled travel measurements. Operational savings would require additional warehouse validation.

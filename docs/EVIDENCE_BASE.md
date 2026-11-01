# Published evidence behind the problem

Reviewed 2026-11-02 (Asia/Jakarta). These five sources support the operational relevance of picking travel, storage assignment and warehouse planning. They are not five available datasets, customer validation for LayoutLab, or evidence of LayoutLab's performance.

| Source | What it supports | Evidence boundary |
| --- | --- | --- |
| [DHL, 2020: IDEA](https://group.dhl.com/en/media-relations/press-releases/2020/artificial-intelligence-dhl-algorithm-makes-e-fulfillment-more-effective.html) | DHL describes route/order/task optimization and reports employee travel reductions up to 50% and productivity increases up to 30% in early commercial deployments. | Operator-reported maxima from another system; not universal averages or results achieved by LayoutLab. |
| [Daitum, 2023: SA Power Networks](https://daitum.com/advanced-warehouse-layout-sa-power-networks-case-study/) | Historical demand informs material relocation and grouping. The vendor reports travel reductions up to 25%. | Named-customer vendor case study; not an independently audited public benchmark dataset. |
| [Logio: DHL/Humanic](https://logio.com/case-studies/dhl) | The case combines stock placement, layout and process changes, reporting 22% less picker walking and an estimated 8% productivity potential. | Combined interventions. The 8% figure is potential, and the walking result cannot be attributed solely to product reassignment. |
| [Araújo et al., 2026](https://tge.sze.hu/tge/article/view/623) | A telecommunications warehouse case uses ERP records, time studies, nine representative customer orders, layout simulation and routing alternatives. | Single-case simulation estimates with no formal statistical testing; not measured post-deployment LayoutLab savings. The publisher page was confirmed through direct HTTP retrieval after an initial browser-tool timeout. |
| [Suri, Magoss and Suri, 2026](https://bioresources.cnr.ncsu.edu/resources/warehouse-layout-optimization-based-on-erp-driven-modeling-a-case-study-from-the-wood-industry/) | ERP movements and measured process times support comparison of four warehouse alternatives with handling, capacity and access trade-offs. | Supports structured decision support. Its layout interventions and assessment do not validate LayoutLab's evaluator or provide safety certification for this application. |

## Application and fixture boundaries

LayoutLab's MVP keeps rack geometry fixed and changes product-to-location assignments. Some cited interventions are broader than that action space. Their percentage results must never be reused as LayoutLab savings, customer outcomes or model-superiority claims.

The current fixtures are explicitly synthetic. Dimensions, storage locations, assignments and order workloads are authored for reproducible tests; they are not reconstructions of these papers. A future reconstructed scenario would require sufficiently detailed source data and provenance identifying every invented field.

Published evidence, application correctness, actual Meta behavior, authentic asset provenance and deployment are separate claims with separate evidence. The deterministic evaluator produces LayoutLab's modeled travel measurements. Operational savings would require additional warehouse validation.

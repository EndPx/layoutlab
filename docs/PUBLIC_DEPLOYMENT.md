# Public deployment and restricted live inference

Target: `https://layoutlab.endpx.cloud`. The user authorized the existing
Hostinger VPS, restricted password/Basic Auth access, and US$1 total for the
initial public Live Meta test, separate from the completed US$1.50 benchmark.
The public allowance must persist without automatic replenishment.

## Anonymous website access (2026-11-04)

The user approved opening the website, simulation, recorded evidence and
verification to anonymous visitors. Only live inference routes require the
existing judge credentials. The root URL redirects to `?mode=operations`.
Nginx protects `/api/runs/*`, `/api/operations/proposals*` and investigation
routes, with the exact `/api/operations/investigations/verify` endpoint public.
`/live-access?mode=experiments` provides the protected browser sign-in entry.
The model key remains on the server; Basic Auth is stripped before proxying.

Verified anonymous UI/status/budget200, protected routes401, authenticated
unlock200 and unknown run404, private source paths404, ledger unchanged.
Evidence: `evidence/sanitized/public-access-split.json`. No model calls were
made by this access change; available conservative allowance stayedUS$0.25.
Only this Nginx site changed, with a private backup and passing nginx -t.
The Experiments UI sign-in guidance is being integrated before its release.
Share live credentials only in judge-private access notes, not public copy.

## E4a backend release and real investigation (2026-11-04, latest)

Active release `/opt/layoutlab/releases/f24a6a1` includes the bounded
investigation backend. Native build passed and ledger bytes were unchanged
on upgrade. One public investigation then completed with actual Meta:
`fd2247b1-8335-4575-a55b-1f579cc3717b`, model muse-spark-1.3-contributor,
three model requests, two experiments, model recommendation exp-2.

On the declared synthetic six-order workload: baseline502400ms; packing
service30000ms candidate442400ms; dispatch service30000ms candidate397100ms.
The latter was recommended; shipped remained6, modeled total wait remained
614900ms. The105300ms makespan difference is20.959395% of baseline.
Local offline investigation verification passed without mismatches.
This is a successful integration smoke, not an AI superiority benchmark.

Reported usage:2589 input and2485 output tokens. At Contributor rates checked
2026-11-04 the token estimate isUS$0.0007559, not an invoice. The fullUS$0.25
claim was committed, leavingUS$0.25 available of theUS$1 allowance. Prior
failed/successful one-shot claims remain intact; nothing was refunded/reset.
Evidence: `e4a-deployment-f24a6a1.json`, `e4a-live-investigation-f24a6a1.json`,
`e4a-live-verification-f24a6a1.json` under `evidence/sanitized/`.
The new UI integration is still pending; legacy planner/operations stay usable.

## Earlier E3 release (2026-11-04)

Active release `/opt/layoutlab/releases/0109f02` adds the reviewed controlled
comparison/report contract. Native build passed; ledger bytes remained
unchanged. An authenticated public POST to `/api/operations/experiments`
returned the full report. Local offline replay matched every candidate and
ranking with no mismatches. Baseline, faster/slower dispatch assumptions and
a denied staffing candidate were retained. This check made zero model calls;
US$0.50 conservative allowance remains available as last checked.
Evidence: `e3-deployment-0109f02.json`, `e3-public-comparison.json`, and
`e3-public-verification.json` under `evidence/sanitized/`.
The UI investigation workflow is still pending; this is API/report acceptance.

## Prior schema release and live activation (2026-11-04)

The prior native release `/opt/layoutlab/releases/f44081a` shipped, including
operations, the reviewed budget guard and the Meta strict-schema fix. Native
install/build passed. The upgrade preserved ledger bytes exactly; other app
configurations, DNS, Nginx and Basic Auth were unchanged.

One public operations proposal succeeded with HTTP200 using actual
`muse-spark-1.3-contributor`: response ID
`chatcmpl-01a1a599-b398-7559-b38a-fa5aa42833f1`, 332 prompt tokens, 450
completion tokens, finishReason `stop`, provider duration 3667ms. The
synthetic smoke requested unchanged staffing and a hypothetical 10000ms
packing service duration. Meta returned that patch. No simulation improvement
or complete AI investigation was tested or claimed by this request.

The persistent US$1 cap now shows US$0.50 committed conservative allowance,
US$0.50 available, two entries (one earlier failed schema request, one success).
Those are full bound charges, not provider invoices. The successful response
alone gives US$0.0001232 estimated token cost at the rates checked on
2026-11-04 (0.10/M input, 0.20/M output); the failed request had no usage
metadata and is not assigned an invented cost. No allowance was refunded or
reset. `/api/status` reports ready/liveAvailable:true and budgetGuard:active.

Evidence: `evidence/sanitized/public-schema-deployment-f44081a.json`,
`operations-meta-schema-independent.json`, and `public-meta-smoke-f44081a.json`.

## Guard deployment and initial failed smoke (historical, same day)

Release2d24a72 replaced the old guard. The old implementation reported an
empty allowance without creating a ledger; inspection confirmed no file,
no server key, and zero entries/spend. Explicit first initialization created
the v2 US$1 ledger at `/var/lib/layoutlab/budget.json`, service-owned mode0600.
It did not restore previously spent allowance. One real request then failed
HTTP400 due to missing required schema keys and retained US$0.25. Inference
was temporarily disabled until the f44081a correction above.
Evidence: `public-budget-deployment-2d24a72.json`,
`public-budget-independent-review.json`, `public-meta-smoke-2d24a72.json`.

Older sections below are historical records. The full Experimenter E3/E4
end-to-end gates remain open; a successful proposal is not their completion.

## Historical initial R1 installation


The reviewed R1 release `d039fa9` was exported with `git archive`, transferred
over the existing SSH connection, and built natively on Ubuntu24.04 with
Node24.14.0. No root `.env`, Git credentials or unreviewed R2 changes were
included. `npm ci` and the full production build passed.

- Release: `/opt/layoutlab/releases/d039fa9`.
- Dedicated system account and unit: `layoutlab`, `layoutlab.service`.
- One native Node process bound to `127.0.0.1:4301`.
- Runtime configuration: `/etc/layoutlab/runtime.env`, root-readable only.
- Persistent state directory: `/var/lib/layoutlab`, separate from releases.
- New Nginx site only: `layoutlab.endpx.cloud`; existing app sites untouched.
- A random access password and hashed password file were prepared privately.
  Credentials are excluded from Git and are never printed in this document.

The service is active; loopback GET `/` returns200 and `/api/status` reports
`setup_required`. **No model key is configured on the VPS.** Sample/manual/
stub behavior is available in the installed release. Public Live Meta is not
enabled before the persistent allowance guard passes review.

## Public DNS, HTTPS and access verification

The following record was added through the user's existing external Edge
hPanel session and read back in the DNS list. No other record was edited:

| Type | Host | Value | TTL |
|---|---|---|---:|
| A | layoutlab | 76.13.179.205 | 300 |

The authoritative nameserver and the VPS resolver both resolve the hostname
to76.13.179.205. A certificate was issued for this exact hostname, valid from
2026-11-02 to2027-01-31. The existing certbot timer is enabled, with a Nginx
reload deploy hook recorded for this certificate. Nginx validation passed.

Public checks used normal hostname resolution and certificate verification,
without a host override or certificate bypass:

- HTTP redirects301 to HTTPS.
- Anonymous UI, API status and GLB requests return401 with Basic Auth.
- An incorrect password returns401; correct credentials return200.
- Private/source paths (`/.env`, `/.git/config`, `/package.json`, API source)
  return404 even with valid preview credentials.
- The served GLB SHA256 matches the reviewed R1 asset.
- Actual external Microsoft Edge156, visible test windows, at1440/390px:
  sample A at L1/F at L8; four real GLB racks loaded; baseline36.8m;
  stub/heuristic selection29.8m; downloaded reports independently checked
  (five valid assignments per export); no page errors or horizontal overflow.
- No POST to the model-run API occurred during these browser flows.

Evidence: `evidence/sanitized/deploy-r1-public-verification.json` and
`deploy-r1-public-{1440,390}.png`. Credentials are stored privately outside
Git; obtain them from the project owner. The preview is password-restricted,
not anonymous public access.

## Remaining public Live Meta gate

The separate public budget-guard milestone must then enforce durable full-run
reservations, no automatic reset/refill, fail-closed persistence errors and
the approved model/token/request limits. Only after that review may the
server receive the application key and perform one public smoke run within
the separate US$1 allowance. The final reserved run must still be allowed to
finish its approved proposals. An HTTP rate limiter alone is not a total
budget guard.

The installed R1 preview supports sample/manual/stub evaluation and reports.
Public Live Meta remains `setup_required`; no model key is installed and
the separate US$1 allowance has not been used. This is a verified public
preview, not a completed public inference rollout.

The user subsequently prioritized a static warehouse-section investigation
from the original SimReady Central catalog before playback integration.
Unreviewed R2 work is preserved separately; neither R2 nor the new section
is present in the deployed R1 release. Upgrade only to a reviewed commit.

## Upgrade to the reviewed operations release (2026-11-03)

Release `67ddd74` (M3c Operations UI + cargo C2 picking/packing experience)
was exported with `git archive`, built natively on the VPS (Node24.14.0,
`npm ci` and the full production build passed; the web bundle hash matches
the local build), and installed at `/opt/layoutlab/releases/67ddd74`.
`layoutlab.service` now runs that release on `127.0.0.1:4301`; the R1
release directory `d039fa9` is retained for rollback.

Public re-verification after the switch: HTTP redirects301 to HTTPS;
anonymous UI/API return401; an incorrect password returns401; correct
credentials return200 with the app shell; `/api/status` still reports
`setup_required` with `liveAvailable:false` (no model key installed);
the new cargo GLB and the prior rack GLB return200; `/.env`,
`/.git/config`, `/package.json` and API source paths return404. The
shipped experience is the six-order picking/packing stage
(`READY_FOR_DISPATCH`, 0 shipped); dispatch/shipping, inbound/put-away
and the Meta Experimenter remain unimplemented, and public Live Meta
stays disabled pending its separate budget-guard gate.

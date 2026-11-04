# Restricted public deployment

Target: `https://layoutlab.endpx.cloud`. The user authorized the existing
Hostinger VPS, restricted password/Basic Auth access, and US$1 total for the
initial public Live Meta test, separate from the completed US$1.50 benchmark.
The public allowance must persist without automatic replenishment.

## Current release and activation status (2026-11-04)

The active native service runs `/opt/layoutlab/releases/2d24a72`, including the
operations additions from `3093591` and the independently reviewed public
budget guard. Native install/build passed; other application configurations,
DNS, Nginx and Basic Auth were unchanged. Previous releases remain available.

The old guard had reported an empty allowance without creating a ledger file.
Read-only inspection confirmed the file did not exist, no server model key
was present and the old allowance had zero entries/spend. Deployment therefore
performed explicit first initialization (not migration) of the US$1 v2 ledger
at `/var/lib/layoutlab/budget.json`, owned by the service user, mode 0600.
It did not restore or reset previously spent allowance.

One authorized public request reached real Meta using
`muse-spark-1.3-contributor`. It failed with HTTP 400 because the operations
structured-output schema omitted the required-key array. No successful model
proposal or operational improvement is claimed. The guard retained US$0.25
as committed conservative allowance, leaving US$0.75. Actual billing/token
usage was not returned. No automatic retry was made. Inference was then
disabled pending the schema correction; key material is retained only in
private server configuration, never in this repository.

Evidence: `evidence/sanitized/public-budget-deployment-2d24a72.json`,
`public-budget-independent-review.json`, and `public-meta-smoke-2d24a72.json`.
The older sections below are historical records, not current feature or
activation status. E3/E4 Experimenter end-to-end gates remain open.

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

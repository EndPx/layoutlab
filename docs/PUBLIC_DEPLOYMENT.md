# Public deployment checkpoint

Target: `https://layoutlab.endpx.cloud`. The user authorized the existing
Hostinger VPS, restricted password/Basic Auth access, and US$1 total for the
initial public Live Meta test, separate from the completed US$1.50 benchmark.
The public allowance must persist without automatic replenishment.

## Installed on the VPS

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

## Remaining public gates

DNS does not yet resolve `layoutlab.endpx.cloud`. Required new record:

| Type | Host | Value | TTL |
|---|---|---|---:|
| A | layoutlab | 76.13.179.205 | 300 |

Do not change other records. The new HTTP ACME challenge location was tested
from outside the VPS with an explicit hostname/IP resolution override and
returned200 with the expected probe. This verifies reachability, not DNS or
HTTPS. Nginx configuration validation passes.

After DNS resolves correctly, issue a certificate for this exact hostname,
enable the prepared HTTPS reverse proxy with Basic Auth over the whole
origin, and verify anonymous401 plus authenticated UI/API/assets. Redirect
plain HTTP to HTTPS. Do not send credentials over plain HTTP or report the
domain live before public TLS and browser checks succeed.

The separate public budget-guard milestone must then enforce durable full-run
reservations, no automatic reset/refill, fail-closed persistence errors and
the approved model/token/request limits. Only after that review may the
server receive the application key and perform one public smoke run within
the separate US$1 allowance. The final reserved run must still be allowed to
finish its approved proposals. An HTTP rate limiter alone is not a total
budget guard.

R2 playback continues separately through Muse. It is not present in the
installed R1 release; upgrade only to a reviewed commit. The deployment is
currently **installed internally, with DNS/TLS/public-access and bounded Live
Meta gates pending**, not a verified public demo yet.

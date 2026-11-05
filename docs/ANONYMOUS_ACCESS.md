# Anonymous AI access

The owner requested removal of username/password access on 2026-11-06. The public warehouse and live AI endpoints are intended to work in a fresh browser without HTTP credentials. The API key remains server-only.

The LayoutLab Nginx site disables Basic Auth for legacy runs, operations proposals/investigations and physical-layout investigations. The old `/live-access` bookmark redirects to `/`. No other site's access policy changes. The UI removes sign-in links and reports an unexpected HTTP401 as an access error without automatic resubmission.

Consent, request validation, one concurrent inference owner, rate limits and per-run limits remain in place. The exact Gater GLM model retains at most4requests,3proposals,8192output tokens per request and360seconds per run. Total application allowance remains unlimited; provider billing and availability still apply.

Local checks:18helper tests, web typecheck/production build and installed-Edge401 handling/no-resubmission regression. Public acceptance requires no `Authorization` header or `WWW-Authenticate` challenge, malformed anonymous requests rejected before inference, and a fresh anonymous live investigation. Deployment evidence will be retained under `evidence/sanitized/anonymous-access/`.


Deployed and verified application `a307375`: fresh installed-Edge context without HTTP credentials/Authorization completed a real public service investigation with2model requests,1engine-tested candidate and model-selected recommendation. Persisted report verified; page errors0. All4formerly protected creation/proposal endpoints returned400for empty bodies without WWW-Authenticate, and /live-access redirects302to/. Native build/nginx test/service passed; provider runtime and oldledger bytes unchanged; all other Nginx site hashes unchanged. Evidence: evidence/sanitized/anonymous-access/.

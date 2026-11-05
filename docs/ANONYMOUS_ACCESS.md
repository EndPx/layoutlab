# Anonymous AI access

The owner requested removal of username/password access on 2026-11-06. The public warehouse and live AI endpoints are intended to work in a fresh browser without HTTP credentials. The API key remains server-only.

The LayoutLab Nginx site disables Basic Auth for legacy runs, operations proposals/investigations and physical-layout investigations. The old `/live-access` bookmark redirects to `/`. No other site's access policy changes. The UI removes sign-in links and reports an unexpected HTTP401 as an access error without automatic resubmission.

Consent, request validation, one concurrent inference owner, rate limits and per-run limits remain in place. The exact Gater GLM model retains at most4requests,3proposals,8192output tokens per request and360seconds per run. Total application allowance remains unlimited; provider billing and availability still apply.

Local checks:18helper tests, web typecheck/production build and installed-Edge401 handling/no-resubmission regression. Public acceptance requires no `Authorization` header or `WWW-Authenticate` challenge, malformed anonymous requests rejected before inference, and a fresh anonymous live investigation. Deployment evidence will be retained under `evidence/sanitized/anonymous-access/`.

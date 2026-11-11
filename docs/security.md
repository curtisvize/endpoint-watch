# Security maintenance

This project currently targets local/private development. These checks are a
maintenance snapshot, not a security certification or public-deployment approval.

## Approved updates — November 11, 2026

- Node 24 is the supported baseline (`>=24 <25` in both packages), selected by
  root `.nvmrc` and both CI jobs. Validation used Node 24.22.2. Host Node was not
  replaced; a temporary Node 24 executable was used for these checks.
- Both packages use `@types/node` 24.19.2 and its required `undici-types` 7.24.6.
  These are development types, not HTTP-client runtime dependencies.
- The backend lockfile updates transitive `body-parser` 2.3.0 to 2.4.0 within
  Express's existing range, fixing
  [CVE-2026-111181](https://github.com/advisories/GHSA-27r3-jxmh-p828).
  Express and other direct application dependencies were not upgraded.
- Existing Node 24 Bookworm slim, Nginx stable Alpine, and PostgreSQL 17 Bookworm
  tags were pulled again. Dockerfiles and Compose references remain unchanged.

Full and production-only `npm audit --json` runs reported **zero advisories** in
both packages after clean installations. npm audits do not cover base-image OS
packages or npm's own bundled dependencies inside the Node image.

## Container scan results

Docker Scout 1.27.0 successfully scanned the local ARM64 runtime images with
`--only-severity critical,high --locations`. Medium/low findings were excluded;
zeros for those categories in filtered output do not establish their absence.
These are package-advisory counts, not demonstrated application exploits.

| Image | Local image ID | Before critical/high | After critical/high |
| --- | --- | --- | --- |
| API, worker, mock | `ccb6584d3263` | 0 / 14 | 0 / 13 |
| Frontend | `c0a6fcf31839` | 1 / 4 | 1 / 4 |
| PostgreSQL | `5025eafe2dc4` | 4 / 49 | 4 / 46 |

The pulled image families resolved to these registry digests (the references in
source are intentionally still tags, not digest pins):

| Base tag | Resolved version | Registry SHA-256 digest |
| --- | --- | --- |
| `node:24-bookworm-slim` | 24.22.2 | `01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9` |
| `nginx:stable-alpine` | 1.30.6 | `583b7f2fce1cdb8da5ad5c39ebd3c33b98b87d493190e548bdee1fa8c619c311` |
| `postgres:17-bookworm` | 17.11-1.pgdg12+2 | `665dc7b37ac52a17e298511414c21d23ffa4e6a6ef6225b3e5d59c7afb35e994` |

### Remaining findings and practical exposure

| Component | Remaining findings | Practical impact / follow-up |
| --- | --- | --- |
| Node image's bundled npm | 4 high in `undici` 6.28.0; 2 high in `brace-expansion` 5.0.9 | Located under `/usr/local/lib/node_modules/npm/node_modules`, not `/app/node_modules`. Services start with `node`, not npm. These findings do not establish that Node's built-in fetch is vulnerable. Prefer an upstream image refresh; manually replacing/removing bundled tooling is outside this update. |
| API Debian packages | 3 high in util-linux, 2 in zlib, 1 in glibc, 1 in Perl | Scout reports no fixed Bookworm version. Mount/partition tooling, attacker-controlled gettext environments, and POD formatting are not exposed application features. zlib is a runtime library; its presence requires further function-level triage rather than dismissal. Keep the non-root runtime and configured-target restrictions. |
| Frontend Alpine packages | Critical zlib CVE-2026-4738; 2 high libxslt findings, 1 high musl, 1 high libxml2 | Scout lists fixes at zlib 1.4-r0, libxslt 1.1.43-r4, and musl 1.2.6-r6, but they remain absent from this refreshed image. No fix is reported for libxml2 CVE-2026-86140. Nginx serves static assets and proxies API requests; no XSLT application feature is configured. Exploitability of zlib/musl paths has not been established. Recheck upstream images; an explicit package-update layer or image-family change needs a separate reviewed change. |
| PostgreSQL's gosu helper | 4 critical and 30 high Go stdlib findings | All map to `/usr/local/bin/gosu`, not the database engine. Many concern HTTP/TLS functions not ordinarily used by this privilege-switching helper; one critical is Windows-only. This scan did not perform binary call-graph analysis. Prefer an upstream helper/image rebuild, not a PostgreSQL major upgrade solely to reduce counts. |
| PostgreSQL Debian packages | 6 high Kerberos, 3 SQLite, 3 util-linux, 2 zlib, 1 glibc, 1 Perl | Scout reports no fixed Bookworm versions. The application uses pg/password connections, not a SQLite or Kerberos feature. Keep PostgreSQL unpublished to the host and reassess affected library paths before public deployment. |

The refreshed PostgreSQL image removed the previously reported OpenSSL,
cyrus-sasl2, and APT findings. Refreshing the frontend did not remove its findings.
Remaining issues are recorded, not suppressed or treated as resolved.

## Verification performed

- Clean installs under Node 24; 96 backend tests passed, including all 13 real
  PostgreSQL integration tests. Migrations and SQL schema assertions executed
  against a separate disposable PostgreSQL 17 database.
- Backend test type-check and build passed; 70 frontend tests and build passed.
- Rebuilt API and frontend images; all 3 Playwright tests passed against the built
  frontend, Express, and PostgreSQL in an isolated Compose project.
- A separate full Compose smoke project started all services including the worker.
  Verified health, on-demand checks, frontend-to-API proxying, and repeated
  scheduled writes/history reads for healthy, HTTP-error, and timeout targets.
  An original result remained retrievable through the API after restarting the
  disposable PostgreSQL container.
- All npm and Scout scans above were executed. Hosted GitHub Actions still needs
  confirmation after push; local results do not establish hosted success.

The initial sandboxed backend run could not open loopback listeners. The complete
suite was rerun successfully with local networking enabled. Disposable databases
and Compose volumes were separate from the developer's persistent database.

## Repeat maintenance locally

Select Node 24, run `npm ci`, `npm audit`, and `npm audit --omit=dev` separately in
`apps/api` and `apps/web`. Use the full checks in [testing](testing.md).
Docker Scout requires Docker Desktop/daemon access and Docker authentication.
From the repository root:

```bash
docker pull node:24-bookworm-slim
docker pull nginx:stable-alpine
docker compose pull postgres migrate
docker compose build --pull api web
docker compose up -d --wait
docker scout cves local://endpoint-watch-dev:latest --only-severity critical,high --locations
docker scout cves local://endpoint-watch-web-dev:latest --only-severity critical,high --locations
docker scout cves local://postgres:17-bookworm --only-severity critical,high --locations
```

These commands refresh/recreate development containers while retaining the named
database volume. Do not add `down --volumes` to normal maintenance. Test cleanup
must target only the disposable project's volume. Record new digests and scan
results because upstream tags and vulnerability databases change.

## Public deployment remains a separate decision

Before exposing the app publicly, establish HTTPS/access controls, restrict and
bound on-demand checks, separate migration/application database privileges, and
review secrets storage, network exposure, and relevant outstanding CVEs. The
shared local database owner and environment-based passwords are development
conveniences. No authentication, hosting, or deployment infrastructure was added.

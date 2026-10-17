# Isolated test package validation — 17 October 2026

- Original COD archive SHA256: c7d72d79d864ed1504bd0316e5aa7b71aaa75bf23d63fd3f0198c13db6c962ed.
- Every bundled app file compared byte-for-byte with that archive; no production source edits.
- Runner syntax check passes. Four local guard tests pass: missing opt-in, wrong database, URL configuration override, nonmatching host. These are configuration tests, not PostgreSQL concurrency results.
- Blueprint reviewed against Render's official JSON schema; free web/PG18 plans, Oregon, database network deny-list, host/connectionString references, and custom Blueprint path validated. Both off values are quoted for portable YAML parsing.
- Runner's rollback assertion proves the injected error follows a successful stock write; it cannot pass on an unrelated early rejection.
- Source manifest hash is pinned to the approved ZIP; production module imports happen only after source verification.
- URL query overrides are rejected, and each application connection checks current_database/current_schema before use.
- Barrier setup and release are guarded by finally. Race tests require two actual PostgreSQL sessions observed waiting on locks.

No Render resources, remote database writes, deployment, credentials, or real customer data were used. Real PostgreSQL race/rollback tests remain NOT RUN until approved isolated deployment. Existing checkout activation is outside this package.

Packaging correction: duplicate extracted app omitted to fit attachment limits. Dependency-free prepare-source.mjs validates the pinned original ZIP before extracting app; Blueprint build runs it before npm ci. Reviewed runner and original source.zip are unchanged.

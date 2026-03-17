# Security Gates

The portal release process requires all security gates below to pass:

1. `CodeQL` workflow passes on the target branch.
2. `Security Static Validation` passes:
   - Gitleaks secret scan
   - Semgrep SAST
   - `npm audit --audit-level=critical` for backend/admin/user apps
3. `Security Release Gate` workflow passes with a staging target URL:
   - backend security regression tests
   - Semgrep
   - critical dependency audit
   - OWASP ZAP baseline DAST
4. Dependabot PRs must carry both `dependencies` and `security` labels (`Dependabot PR Policy` workflow).

If any critical issue remains unresolved, release must be blocked or explicitly risk-accepted with written approval.


# Initial Threat Model

Primary concerns for the project itself:

- untrusted file uploads and parsing logic
- SSRF risk when validating and fetching repository URLs
- credential leakage through logs or environment handling
- supply-chain exposure through third-party dependencies and CI actions
- forged or stale external-provider data influencing analyst decisions

Mitigations planned or present:

- env-based config with example files instead of committed secrets
- pinned GitHub Action versions in CI
- explicit TODO boundaries around upload handling and provider adapters
- conservative score framing with caveats and missing-signal visibility
- containerized local environment for reproducible startup

# GitHub App Publishing

ServerOS publishes immutable `.serveros-app` files through GitHub Releases. A normal installer must download a release artifact, never execute a mutable branch.

## Publisher keys

Create one Ed25519 key pair for the publisher:

```bash
openssl genpkey -algorithm Ed25519 -out publisher.private.pem
openssl pkey -in publisher.private.pem -pubout -out publisher.public.pem
```

Never commit `publisher.private.pem`. The project ignores `*.private.pem` by default. Keep `publisher.public.pem` in the repository so the workflow can verify that the configured private key belongs to the expected publisher.

Add the complete private PEM value as a GitHub Actions repository secret named `SERVEROS_SIGNING_PRIVATE_KEY`.

The key id is the SHA-256 fingerprint of the DER-encoded SPKI public key. ServerOS records it as `ed25519:<hex>` in the packaged manifest and signature file.

## Package locally

Unsigned development package:

```bash
npm run app:package my-app
```

Signed package:

```bash
npm run app:package my-app -- --sign-key publisher.private.pem
```

Verify a package with the publisher public key:

```bash
npm run app:verify-package packages/my-app-1.0.0.serveros-app -- --public-key publisher.public.pem --require-signature
```

The verifier checks ZIP structure, safe paths, size limits, CRC values, the internal file checksum list, the external `.sha256` file when present, the manifest compatibility range and the Ed25519 publisher signature.

## Publish through GitHub Actions

The `ServerOS App Release` workflow accepts:

- `app_id`: folder name under `src/apps`
- `version`: exact version required in `serveros.app.json`
- `tag`: immutable GitHub Release tag
- `publish_release`: whether to create or update the GitHub Release

Recommended tags use the app id and semantic version:

```txt
my-app-v1.2.0
```

The workflow performs a clean install, validates the app, runs its tests, builds a signed deterministic package, verifies it with `publisher.public.pem`, uploads workflow artifacts and optionally publishes the package and SHA-256 sidecar to a GitHub Release.

Stable, beta and development channels are declared through `releaseChannel` in `serveros.app.json`. The remote catalog will use this field when channel-aware installation arrives in v0.3.0.

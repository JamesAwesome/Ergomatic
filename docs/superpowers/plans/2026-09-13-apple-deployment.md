# Apple deployment contract and authoring provenance

This is the current navigation point for deployment work. The original implementation plan's complete replacement blocks are retired; do not paste them over current configuration or operator docs.

## Current requirements

- Follow [deployment setup](../../deploy.md#apple-sign-in-setup), [.env.example](../../../.env.example) and [release/rollback instructions](../../RELEASING.md).
- `ACCESS_MODE` accepts `restricted` or `public`; missing/blank defaults to restricted. Restricted access checks saved account email for Apple, Google and existing sessions. Empty `ALLOWED_EMAILS` admits nobody; changes take effect when the API reloads its configuration.
- Apple availability is independent of admission. All five Apple settings absent/blank supports Google-only operation on HTTP localhost. Any Apple setting present requires the complete locally valid Apple setup and HTTPS. Complete setup enables the combined flow in either access mode.
- Keep private credentials in server configuration. The `.p8` setting contains the complete PEM with actual newlines; the deployment guide specifies the Compose `.env` representation.
- The existing deployment is staging. Separate web Services IDs and callbacks distinguish environments. Public activation and external TestFlight still depend on account deletion and real native/web provider continuity validation.
- Preserve existing Google callbacks for installed clients and the Apple-capable rollback floor once Apple-only accounts exist.
- Validation and its source SHA belong to the current PR evidence. Earlier local/CI counts must retain their historical source labels.

## Historical authoring record

The [original paste-tested deployment plan at `86ed0636`](https://github.com/JamesAwesome/Ergomatic/blob/86ed0636fd37c5969bdd369813534c4690de964d/docs/superpowers/plans/2026-09-13-apple-deployment.md) is retained immutably in git for provenance. It used a coupled default-off feature switch that was superseded by the approved account-access amendment. It is not an executable implementation plan for the current head.

The [approved spec](../specs/2026-09-12-apple-signin-design.md) and current operator documents above are authoritative. The original broad review remains incomplete as recorded in PR #425; this document correction does not clear it.

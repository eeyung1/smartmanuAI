# Bulk archive

The admin catalogue offers a collapsed bulk-archive panel when the current opportunity page contains closed or rejected records. Choose records from that page, enter a shared 5–1,000 character audit note and confirm the action. The panel does not carry selections across pages, automatically select records or archive drafts/published opportunities. A batch contains 1–25 unique IDs with the expected revision of each record.

POST `/api/admin/opportunities/archive-batch` requires a current administrator session and a same-origin request. Strict validation rejects duplicate IDs, unknown properties and invalid bounds before writes. Responses are no-store. Every item uses the existing archive transition, its row lock, revision check and audit-revision insert. No direct shortcut changes states.

Records commit independently. Confirmed archives report the new revision; stale, missing and ineligible records are skipped without preventing later eligible items. A lost administrator role or an unexpected database outcome stops remaining work. The current item is marked unconfirmed if its outcome cannot be established; remaining items are not attempted. An unconfirmed outcome is not reported as failure, because a lost acknowledgement can occur after commit. No automatic retry is performed.

A successful request can contain mixed outcomes. Network loss may hide earlier committed archives, so the UI blocks another submission and asks the operator to reload and inspect revision history. Successful items are not rolled back when another item is skipped. Replaying old expected revisions creates no duplicate revision. The panel links each result to existing history and reloads the catalogue before another batch.

This adds no tables or new production permissions and does not enable hosted account access. Browser-driven interaction acceptance, bulk publication/rejection, restore policy and broader bulk moderation remain separate work.

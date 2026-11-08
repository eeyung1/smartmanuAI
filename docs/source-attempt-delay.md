# Per-source collection-claim cooldown

Administrators can set `requestDelaySeconds` from 0 to 3600 when saving a collection policy. The bilingual research form labels it as a minimum attempt delay. Zero adds no extra delay and preserves prior behavior. New/legacy policies default to zero; omitted fields preserve a saved value. Database constraints and API validation enforce the same bounds.

The worker stores `last_request_at` when it successfully claims a job. No claim is eligible before that timestamp plus the configured delay. Retries, expired-lease recovery and newly scheduled jobs for the same source use the same timestamp, including after process/database restart. Changing policy metadata or cadence does not reset it. The existing enabled-policy review still clears Retry-After holds, but does not clear claim history.

This gate supplements job availability, attempt caps, enabled policy, Retry-After and review holds. It does not change source scheduling cadence, alter an already running attempt, or replace provider Retry-After behavior. Operations queued-readiness counts include the gate. Claim selection locks a policy before its job; independent exhausted-job cleanup completes before acquiring policy locks to avoid inversion with multi-source scheduling. Concurrent workers cannot claim the same source job twice.

The setting spaces claims, not confirmed HTTP request start times: process stalls or time between claiming and retrieving can affect wire timing. Cooldown values remain per source. The separate [hostname lease gate](host-collection-leases.md) now serializes active claims across URLs on the same hostname. A [shared hostname cooldown](host-claim-cooldown.md) also spaces stored claims across URLs. Robots policy and live network-timing qualification remain unfinished. Reading settings does not start a worker or make a request.

Migration 022 adds the constrained cooldown and nullable timestamp to the existing private policy table. It creates no new tables or runtime grants and does not enable hosted research.

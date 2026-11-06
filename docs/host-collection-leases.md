# Hostname collection leases

Registered source URLs on the same normalized hostname share one active collection-claim gate. The hostname is generated from the stored canonical HTTPS URL, lowercased with trailing dots removed. It cannot be supplied separately through source registration or metadata editing. Different hostnames remain independent; aliases resolving to the same server are not reconciled.

Claims use a private `collection_host_locks` row as a short database mutex, then lock the source policy and job. Under that mutex the worker checks for any running job with an unexpired lease on the hostname before updating the chosen job and committing. Candidate selection excludes known busy hosts so another hostname can progress. Retries, source cooldowns, attempt caps, permission/review holds and Retry-After gates still apply.

The mutex is not held during retrieval. The existing running-job lease represents occupancy after commit, including running records created before a mutex row existed. The existing one-minute lease and token fencing apply. Completion, queued failure, cancellation or expiry changes occupancy through job state; no separate release token can accidentally clear a newer worker’s ownership. An expired job can be reclaimed, and its previous token cannot persist late content. Durable rows/job state preserve coordination across worker restarts.

This is lease-backed claim concurrency, not a guarantee that HTTP requests never overlap. A cancelled or stalled request can still be in flight, and lease expiry permits recovery. The existing bounded fetch timeout and stale-result checks remain important. There is no host-wide minimum delay between completed attempts in this feature. Live HTTP timing, stalled-process behavior, hostname aliases and worker-upgrade qualification remain open.

The admin source view shows the hostname and explains the policy. Operations shows the number of distinct hostnames with active leases and excludes their queued jobs from stored-gate readiness. Multiple queued records on a free host can count as individually eligible while actual claims still serialize. Reading these views starts no work.

Migration 023 adds one private RLS-protected mutex table (40 total), a generated source column and indexes. Reader/public roles receive no mutex-table access. Stop existing workers before migrating and starting the new version; old binaries do not use this gate. Hosted account/worker enablement is unchanged.

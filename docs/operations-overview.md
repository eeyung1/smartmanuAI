# Admin operations overview

`/admin/operations`, linked from the research workspace, provides a read-only summary. GET `/api/admin/operations` returns the same summary, rejects query parameters, requires a current administrator session and sets no-store caching. Anonymous page requests preserve the destination through sign-in; non-admin page requests return not found.

The summary covers all retained collection jobs and review candidates, plus registered sources with enabled/paused or missing policies. Future Retry-After holds and operator-review holds are counted separately and may overlap. Counts reflect current stored states, not attempt totals, verified source coverage or publication success. Links open the existing filtered job/candidate/source browsers. One SQL statement gives these aggregates a shared database snapshot; later requests can change as work progresses.

Budget fields show the existing shared configured limit, reserved amount and nonnegative unreserved capacity. One internal budget unit is one million micro-units. All values remain exact decimal strings and are formatted using integer arithmetic. Missing budget configuration is unavailable rather than zero. An over-limit balance is shown explicitly. The existing reservation system still enforces its own write-time budget checks; this view changes no limits or reservations.

The model-attempt ledger separately shows reserved/completed/uncertain counts and the sum of its recorded reservations. The shared budget can include other local work, so these values need not match. Reservations are not settled provider charges, a completed attempt is not an invoice reconciliation, and no currency is inferred from the internal units. This view does not retry uncertain work, reset monthly balances, settle costs or call providers.

No schema changes are needed. Hosted staging remains read-only with account access disabled. Monthly periods, actual-cost/provider invoices, live monitoring, bulk moderation and a global catalogue-refresh indicator remain separate work.

## Workload age and scheduling indicators

The oldest queued job uses its original creation time, including time spent retrying, delayed or held. The oldest pending candidate likewise uses candidate creation time. Terminal jobs and processed candidates do not determine these ages. Timestamps and nonnegative whole-second ages use the same UTC database snapshot; no matching records yield null timestamps/ages. Future creation times show zero age. The view formats durations using integer days/hours/minutes/seconds without losing large values. These are record ages, not actual runtime or time since the most recent queue-state transition.

Queued jobs passing stored scheduling gates require enabled collection, fewer than three attempts, an available job timestamp, elapsed per-source and shared-host claim cooldowns, no active collection lease on the same hostname and no current operator-review/future Retry-After hold. A future policy next-due time does not block an already queued job. Row locks, network availability and provider limits are not observed, so this is not a guarantee that a worker can immediately claim or finish every counted job. Running records with expired leases are counted even when attempts are exhausted or policy gates would prevent recovery. Missing/future lease times are not expired leases.

Enabled sources past their effective scheduling target are counted independently of Retry-After/review holds, so held sources may remain due. No scheduler-success percentage, last-success time, automatic warning or recovery action is inferred or triggered. Later snapshots can change these values as workers proceed.

The busy-host indicator counts distinct hostnames with running, unexpired job leases. On a free hostname, multiple queued records may be individually eligible in the snapshot even though actual claims serialize under the hostname gate.

Host cooldowns still active counts host records with a tracked last claim whose configured interval has not elapsed. This count can overlap busy hosts, and includes retained host records independently of whether work is currently queued.

The effective source due target includes optional deadline-aware daily acceleration and untracked adaptive policies. It uses the same rule as scheduleSources, while holds can still prevent queueing.


## Reservation warnings

The shared budget shows normal (below 70%), warning (70% to below 90%), critical (90% to below full capacity) and full-capacity states. Exact integer ratios determine the state; displayed percentages truncate to two decimals. A zero limit always has no available capacity and no defined utilization percentage. These are current reservation indicators, not monthly spending or invoice figures. The read-only page neither sends alerts nor reduces optional work or changes the existing reservation guard.


## Repeated collection failures

The snapshot counts sources whose latest two retained terminal job records are both failed. Terminal means done, failed or cancelled; creation time descending and ID descending break ties, and future-created records are ignored. Queued/running jobs do not reset the signal, while a later done/cancelled terminal record does. Fewer than two terminal records never trigger it. Counts cover all affected sources; at most ten names/links appear, ordered by source ID. This is a read-only record-state warning, not an attempt-level failure streak, completion-time ordering, measured run-success percentage or external message. Clearing/recovering jobs changes the next snapshot; no automatic retry is triggered.

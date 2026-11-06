# Admin operations overview

`/admin/operations`, linked from the research workspace, provides a read-only summary. GET `/api/admin/operations` returns the same summary, rejects query parameters, requires a current administrator session and sets no-store caching. Anonymous page requests preserve the destination through sign-in; non-admin page requests return not found.

The summary covers all retained collection jobs and review candidates, plus registered sources with enabled/paused or missing policies. Future Retry-After holds and operator-review holds are counted separately and may overlap. Counts reflect current stored states, not attempt totals, verified source coverage or publication success. Links open the existing filtered job/candidate/source browsers. One SQL statement gives these aggregates a shared database snapshot; later requests can change as work progresses.

Budget fields show the existing shared configured limit, reserved amount and nonnegative unreserved capacity. One internal budget unit is one million micro-units. All values remain exact decimal strings and are formatted using integer arithmetic. Missing budget configuration is unavailable rather than zero. An over-limit balance is shown explicitly. The existing reservation system still enforces its own write-time budget checks; this view changes no limits or reservations.

The model-attempt ledger separately shows reserved/completed/uncertain counts and the sum of its recorded reservations. The shared budget can include other local work, so these values need not match. Reservations are not settled provider charges, a completed attempt is not an invoice reconciliation, and no currency is inferred from the internal units. This view does not retry uncertain work, reset monthly balances, settle costs or call providers.

No schema changes are needed. Hosted staging remains read-only with account access disabled. Monthly periods, actual-cost/provider invoices, live monitoring, bulk moderation and a global catalogue-refresh indicator remain separate work.

## Workload age and scheduling indicators

The oldest queued job uses its original creation time, including time spent retrying, delayed or held. The oldest pending candidate likewise uses candidate creation time. Terminal jobs and processed candidates do not determine these ages. Timestamps and nonnegative whole-second ages use the same UTC database snapshot; no matching records yield null timestamps/ages. Future creation times show zero age. The view formats durations using integer days/hours/minutes/seconds without losing large values. These are record ages, not actual runtime or time since the most recent queue-state transition.

Queued jobs passing stored scheduling gates require enabled collection, fewer than three attempts, an available job timestamp, an elapsed per-source claim cooldown and no current operator-review/future Retry-After hold. A future policy next-due time does not block an already queued job. Row locks, network availability and provider limits are not observed, so this is not a guarantee that a worker can immediately claim or finish every counted job. Running records with expired leases are counted even when attempts are exhausted or policy gates would prevent recovery. Missing/future lease times are not expired leases.

Enabled sources past next_due_at are counted independently of Retry-After/review holds, so held sources may remain due. No scheduler-success percentage, last-success time, automatic warning or recovery action is inferred or triggered. Later snapshots can change these values as workers proceed.

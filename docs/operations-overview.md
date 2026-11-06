# Admin operations overview

`/admin/operations`, linked from the research workspace, provides a read-only summary. GET `/api/admin/operations` returns the same summary, rejects query parameters, requires a current administrator session and sets no-store caching. Anonymous page requests preserve the destination through sign-in; non-admin page requests return not found.

The summary covers all retained collection jobs and review candidates, plus registered sources with enabled/paused or missing policies. Future Retry-After holds and operator-review holds are counted separately and may overlap. Counts reflect current stored states, not attempt totals, verified source coverage or publication success. Links open the existing filtered job/candidate/source browsers. One SQL statement gives these aggregates a shared database snapshot; later requests can change as work progresses.

Budget fields show the existing shared configured limit, reserved amount and nonnegative unreserved capacity. One internal budget unit is one million micro-units. All values remain exact decimal strings and are formatted using integer arithmetic. Missing budget configuration is unavailable rather than zero. An over-limit balance is shown explicitly. The existing reservation system still enforces its own write-time budget checks; this view changes no limits or reservations.

The model-attempt ledger separately shows reserved/completed/uncertain counts and the sum of its recorded reservations. The shared budget can include other local work, so these values need not match. Reservations are not settled provider charges, a completed attempt is not an invoice reconciliation, and no currency is inferred from the internal units. This view does not retry uncertain work, reset monthly balances, settle costs or call providers.

No schema changes are needed. Hosted staging remains read-only with account access disabled. Monthly periods, actual-cost/provider invoices, live monitoring, bulk moderation and a global catalogue-refresh indicator remain separate work.

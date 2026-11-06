# Source collection-job counts

Administrator source cards show total stored jobs plus completed, failed, active and cancelled counts. Active includes queued/running jobs. These counts cover the selected sources’ full retained history rather than the latest 50 jobs on the research dashboard. A source with no jobs shows zero; selecting an older source outside the latest 100 sources still loads its counters. The card links to the existing filtered job browser.

Counts are current states of stored jobs, not an append-only attempt ledger. A queued retry is active even if it has an earlier error code. A job that succeeds after retries counts once as completed. Cancellation counts separately from failure; a failed job retained after creating a manual replacement remains failed, while the replacement is a separate job. Completed includes changed captures, unchanged bodies and validated not-modified checks. None establishes opportunity verification, publication, complete source coverage or provider delivery.

An administrator-only grouped query supplies exact decimal strings without JavaScript integer rounding. It runs for displayed source IDs and uses the source/state index added by migration 021. Counter totals and state categories come from one query, but dashboard lists and later refreshes are live views rather than a shared historical snapshot. Retention/deletion can lower counts. No success percentage, last-success timestamp or global-refresh claim is inferred.

Existing admin API authorization/cache controls apply. Public catalogue responses do not include counters, hosted account access remains disabled, and no collection jobs are scheduled or changed by reading the counts.

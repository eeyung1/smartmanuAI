# Source collection cadence

Administrators can set `cadenceHours` when saving a collection policy through `/admin/research` or POST `/api/admin/research` with `action: policy`. The value must be an integer from 6 to 168 hours. New policies default to 24 hours; old clients that omit the field preserve the existing interval. The database enforces the bounds as well. Selected-source data includes the value, including original sources outside the latest dashboard window.

The scheduler uses `cadence_hours` to advance `next_due_at` when processing a due source. Changing the interval does not reset the current due date or cancel active work. The first policy is due immediately as before; after it is scheduled, its next due time uses the stored interval. An active source job remains unique, and the existing bounded scheduler can process at most 25 due sources per pass.

Disabled sources, future Retry-After holds and sources requiring operator review remain ineligible for scheduling. As before, saving an enabled policy is an explicit operator review that clears Retry-After records; the form retains that warning. Permission review and synthetic-source restrictions still apply. Retrying failed jobs retains the existing attempt/backoff policy rather than adopting this interval.

These are collection intervals, not a promise that all sources run at an exact time or that published opportunities have been reverified. A recurring worker must still be deployed. Weekly/daily deadline-aware scheduling, host-wide pacing, source type/language and consolidated success/failure counters remain separate work.

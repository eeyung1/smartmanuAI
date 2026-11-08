// Static SQL fragments use source-policy alias p. Dates are recorded ISO calendar dates.
const today = "TO_CHAR(CURRENT_TIMESTAMP AT TIME ZONE 'UTC','YYYY-MM-DD')";
export const nearClosingSQL = `EXISTS(SELECT 1 FROM opportunities o WHERE o.source_id=p.source_id AND o.state='published' AND o.details->>'deadline' BETWEEN ${today} AND TO_CHAR((CURRENT_TIMESTAMP AT TIME ZONE 'UTC')+INTERVAL '14 days','YYYY-MM-DD'))`;
const acceleratedDueSQL = `CASE WHEN p.schedule_mode='deadline_aware' THEN CASE WHEN p.last_scheduled_at IS NULL THEN NOW() WHEN ${nearClosingSQL} THEN p.last_scheduled_at+INTERVAL '24 hours' ELSE p.next_due_at END ELSE p.next_due_at END`;
export const effectiveSourceDueSQL = `LEAST(p.next_due_at,${acceleratedDueSQL})`;
export const sourceDueSQL = `(${effectiveSourceDueSQL}<=NOW())`;
const horizonBoundarySQL = `(SELECT ((MIN(o.details->>'deadline')::date-14)::timestamp AT TIME ZONE 'UTC') FROM opportunities o WHERE o.source_id=p.source_id AND o.state='published' AND o.details->>'deadline'>TO_CHAR((CURRENT_TIMESTAMP AT TIME ZONE 'UTC')+INTERVAL '14 days','YYYY-MM-DD'))`;
export const nextSourceDueSQL = `CASE WHEN p.schedule_mode='fixed' THEN NOW()+p.cadence_hours*INTERVAL '1 hour' WHEN ${nearClosingSQL} THEN NOW()+INTERVAL '24 hours' ELSE LEAST(NOW()+INTERVAL '168 hours',COALESCE(${horizonBoundarySQL},NOW()+INTERVAL '168 hours')) END`;

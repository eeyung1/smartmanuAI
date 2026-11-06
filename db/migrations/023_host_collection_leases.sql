ALTER TABLE sources ADD COLUMN collection_host text GENERATED ALWAYS AS (lower(rtrim(split_part(split_part(split_part(split_part(url,'://',2),'/',1),'?',1),'#',1),'.'))) STORED;
CREATE INDEX sources_collection_host ON sources(collection_host);
CREATE TABLE collection_host_locks(hostname text PRIMARY KEY);
CREATE INDEX research_jobs_running_lease ON research_jobs(source_id,lease_until) WHERE state='running';

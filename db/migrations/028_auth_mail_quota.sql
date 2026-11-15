CREATE TABLE auth_mail_quota (
  bucket text NOT NULL,
  day date NOT NULL,
  attempts integer NOT NULL CHECK (attempts BETWEEN 1 AND 20),
  PRIMARY KEY (bucket, day)
);

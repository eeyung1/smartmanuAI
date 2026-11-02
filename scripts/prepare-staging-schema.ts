import { writeFile } from "node:fs/promises";
import { stagingSchemaSQL } from "./lib/staging-schema";
await writeFile("db/staging/bootstrap.sql", (await stagingSchemaSQL()) + "\n");
console.log(
  "Prepared isolated smartmanuAI schema SQL; no database was changed.",
);

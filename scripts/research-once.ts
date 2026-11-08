import { getDatabase } from "../src/db";
import { scheduleSources, collectOne } from "../src/research/collection";
import {
  configuredGatewayExtractor,
  extractCandidate,
  extractNextCandidate,
} from "../src/research/extraction";
const db = await getDatabase();
try {
  if (["extract", "extract-next"].includes(process.argv[2])) {
    const email = process.argv[3],
      candidate = process.argv[4];
    if (!email || (process.argv[2] === "extract" && !candidate))
      throw new Error(
        process.argv[2] === "extract-next"
          ? "Pass an administrator email."
          : "Pass an administrator email and candidate ID.",
      );
    const user = (
      await db.sql.query("SELECT id FROM auth_user WHERE email=$1", [email])
    ).rows[0];
    if (!user) throw new Error("Administrator account not found.");
    const actor = String(user.id);
    const config = configuredGatewayExtractor();
    console.log(
      process.argv[2] === "extract-next"
        ? await extractNextCandidate(db.sql, actor, config.extract, config)
        : await extractCandidate(
            db.sql,
            actor,
            candidate,
            config.extract,
            config,
          ),
    );
  } else {
    if (process.env.SMARTMANU_ENABLE_COLLECTION !== "1")
      throw new Error(
        "Live collection is disabled. Enable only after source permissions are reviewed.",
      );
    console.log({
      scheduled: await scheduleSources(db.sql),
      result: await collectOne(db.sql),
    });
  }
} finally {
  await db.close();
}

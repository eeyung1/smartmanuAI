import { getDatabase } from "@/src/db";
import { localConfig } from "@/src/config";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const config = localConfig(),
      { sql } = await getDatabase();
    const row = (
      await sql.query("SELECT COUNT(*) AS count FROM schema_migrations")
    ).rows[0];
    if (Number(row.count) < 27) throw Error("Database setup incomplete");
    await sql.query(
      "SELECT id FROM opportunities WHERE state='published' LIMIT 1",
    );
    return Response.json(
      {
        status: "ok",
        mode: config.mode,
        database: "connected",
        readOnly: config.mode === "staging",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { status: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

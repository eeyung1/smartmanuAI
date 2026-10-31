import { getAuth } from "@/src/auth";
import { getDatabase } from "@/src/db";
import { localConfig } from "@/src/config";
import {
  emailControlsConfig,
  mintUnsubscribeToken,
} from "@/src/channels/email-controls";
import { apiError, readJSON } from "@/src/http/access";
import { z } from "zod";
export async function POST(request: Request) {
  if (request.headers.get("origin") !== localConfig().baseURL)
    return Response.json({ error: "invalid_origin" }, { status: 403 });
  const session = await (
    await getAuth()
  ).api.getSession({ headers: request.headers });
  if (!session)
    return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    z.object({})
      .strict()
      .parse(await readJSON(request));
    const config = emailControlsConfig(),
      { sql } = await getDatabase();
    const result = await sql.transaction(async (tx) => {
      await tx.query("SELECT id FROM auth_user WHERE id=$1 FOR NO KEY UPDATE", [
        session.user.id,
      ]);
      const pref = (
        await tx.query(
          "SELECT * FROM notification_preferences WHERE user_id=$1 FOR SHARE",
          [session.user.id],
        )
      ).rows[0];
      if (!pref?.enabled || pref.channel !== "email") return null;
      return mintUnsubscribeToken(
        tx,
        session.user.id,
        Number(pref.email_consent_epoch),
        config,
      );
    });
    if (!result)
      return Response.json(
        { error: "Enable local email digests before creating a test link." },
        { status: 409 },
      );
    return Response.json(
      { url: localConfig().baseURL + "/unsubscribe?token=" + result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}

import { getAuth } from "@/src/auth";
import { getDatabase } from "@/src/db";
import { materialFingerprint, matchesForUser } from "@/src/domain/matching";
import { renderAlertText } from "@/src/i18n/alerts";
import { resolveAlertLanguage } from "@/src/i18n/locale";
import { LOCAL_CONSENT_VERSION } from "@/src/jobs/digests";
import type { SQL } from "@/src/db";

export async function buildUpcomingDigestPreview(
  sql: SQL,
  userId: string,
  now = new Date(),
) {
  const [settings, matches, profile] = await Promise.all([
    sql.query(
      "SELECT enabled,consent_version,channel FROM notification_preferences WHERE user_id=$1",
      [userId],
    ),
    matchesForUser(sql, userId, 1, 1000),
    sql.query(
      "SELECT preferences->>'alertLanguage' AS language FROM profiles WHERE user_id=$1",
      [userId],
    ),
  ]);
  const preference = settings.rows[0];
  const language = resolveAlertLanguage(profile.rows[0]?.language ?? "en");
  if (!matches.profileRequired) {
    const candidates = matches.items;
    const [fresh, seen] = await Promise.all([
      sql.query(
        "SELECT id FROM opportunities WHERE verified_at >= $1 AND verified_at <= $2 AND id=ANY($3::text[])",
        [
          new Date(now.getTime() - 86400000).toISOString(),
          now.toISOString(),
          candidates.map((item) => item.id),
        ],
      ),
      sql.query(
        "SELECT event_key FROM notification_digest_events WHERE user_id=$1",
        [userId],
      ),
    ]);
    const freshIds = new Set(fresh.rows.map((row) => String(row.id)));
    const seenKeys = new Set(seen.rows.map((row) => String(row.event_key)));
    const items = candidates
      .filter((item) => freshIds.has(item.id))
      .filter(
        (item) =>
          !seenKeys.has(
            JSON.stringify([item.id, materialFingerprint(item.details)]),
          ),
      )
      .slice(0, 10);
    const publicItems = await Promise.all(
      items.map(async (item) => {
        const source = (
          await sql.query(
            "SELECT url,synthetic FROM sources WHERE id=(SELECT source_id FROM opportunities WHERE id=$1)",
            [item.id],
          )
        ).rows[0];
        return {
          id: item.id,
          title: item.details.title,
          organizer: item.details.organizer,
          funding: item.details.funding,
          deadline: item.details.deadline,
          applicationFee: item.details.applicationFee,
          certificateFee: item.details.certificateFee,
          sourceURL: source?.synthetic ? null : (source?.url ?? null),
          synthetic: source?.synthetic === true,
        };
      }),
    );
    const renderedText = renderAlertText({
      ...language,
      items: publicItems,
      synthetic:
        publicItems.length > 0 && publicItems.every((item) => item.synthetic),
    });
    return {
      enabled:
        preference?.enabled === true &&
        preference?.consent_version === LOCAL_CONSENT_VERSION,
      channel: String(preference?.channel ?? "email"),
      language: language.language,
      translationFallback: language.translationFallback,
      items: publicItems,
      renderedText,
      providerMessageSent: false,
    };
  }
  return {
    enabled:
      preference?.enabled === true &&
      preference?.consent_version === LOCAL_CONSENT_VERSION,
    channel: String(preference?.channel ?? "email"),
    language: language.language,
    translationFallback: language.translationFallback,
    items: [],
    renderedText: "Complete your opportunity profile to preview a digest.",
    providerMessageSent: false,
  };
}

export async function GET(request: Request) {
  const session = await (
    await getAuth()
  ).api.getSession({
    headers: request.headers,
  });
  if (!session)
    return Response.json(
      { error: "unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  const preview = await buildUpcomingDigestPreview(
    (await getDatabase()).sql,
    session.user.id,
  );
  return Response.json(preview, { headers: { "Cache-Control": "no-store" } });
}

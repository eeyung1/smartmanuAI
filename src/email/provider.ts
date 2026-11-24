import type { SQL } from "../db";
import type { LiveEmailConfig } from "./config";
import { CatalogueError } from "../catalogue/service";
import { BrevoDeliveryError } from "../delivery/brevo-error";
export async function registerBrevoAlertWebhook(
  sql: SQL,
  config: LiveEmailConfig,
  fetcher: typeof fetch = fetch,
) {
  return sql.transaction(async (tx) => {
    await tx.query("SELECT id FROM email_control_lock WHERE id=1 FOR UPDATE");
    const call = async (path: string, method: string, body?: unknown) => {
      const response = await fetcher(
        "https://api.brevo.com/v3/webhooks" + path,
        {
          method,
          headers: {
            "api-key": config.brevo.apiKey,
            "content-type": "application/json",
            accept: "application/json",
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
          redirect: "error",
          signal: AbortSignal.timeout(15000),
        },
      );
      let data: Record<string, unknown> = {};
      try {
        data = await response.json();
      } catch {}
      if (!response.ok) {
        const failure = new BrevoDeliveryError(response.status, data);
        console.error("brevo_callback_setup", failure.status, failure.reason);
        throw new CatalogueError(
          503,
          "Brevo callback setup failed. Check provider permissions and IP authorization.",
        );
      }
      return data;
    };
    const url = config.origin + "/api/webhooks/brevo-alerts",
      listed = await call("?type=transactional", "GET");
    if (!Array.isArray(listed.webhooks))
      throw new CatalogueError(
        503,
        "Brevo callback setup failed. Check provider permissions and IP authorization.",
      );
    const existing = listed.webhooks.find(
      (item: unknown) =>
        item &&
        typeof item === "object" &&
        (item as Record<string, unknown>).url === url,
    ) as Record<string, unknown> | undefined;
    const body = {
      url,
      description: "smartmanuAI email-only pilot",
      events: [
        "request",
        "delivered",
        "hardBounce",
        "softBounce",
        "spam",
        "blocked",
        "invalid",
        "deferred",
        "unsubscribed",
      ],
      auth: { type: "bearer", token: config.webhookSecret },
    };
    const data = await call(
      existing ? "/" + Number(existing.id) : "",
      existing ? "PUT" : "POST",
      existing ? body : { ...body, type: "transactional" },
    );
    const id = Number(existing?.id ?? data.id);
    if (!Number.isSafeInteger(id) || id <= 0)
      throw new CatalogueError(
        503,
        "Brevo callback setup failed. Check provider permissions and IP authorization.",
      );
    await tx.query(
      "INSERT INTO live_email_provider(id,webhook_id,configuration_hash) VALUES(1,$1,$2) ON CONFLICT(id) DO UPDATE SET webhook_id=$1,configuration_hash=$2,registered_at=NOW()",
      [id, config.configurationHash],
    );
    return { connected: true };
  });
}

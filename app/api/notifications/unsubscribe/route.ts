import { getDatabase } from "@/src/db";
import {
  emailControlsConfig,
  unsubscribeEmail,
} from "@/src/channels/email-controls";
import { apiError, readBody } from "@/src/http/access";
export async function POST(request: Request) {
  try {
    const raw = (await readBody(request)).toString("utf8"),
      type = request.headers.get("content-type") ?? "";
    if (!type.startsWith("application/x-www-form-urlencoded"))
      return Response.json(
        { error: "Use a form-encoded unsubscribe request." },
        { status: 400 },
      );
    const form = new URLSearchParams(raw),
      token =
        new URL(request.url).searchParams.get("token") ??
        form.get("token") ??
        "";
    const oneClick = form.get("List-Unsubscribe") === "One-Click";
    if (!oneClick && form.get("confirm") !== "unsubscribe")
      return Response.json(
        { error: "Confirm the unsubscribe action." },
        { status: 400 },
      );
    await unsubscribeEmail(
      (await getDatabase()).sql,
      token,
      emailControlsConfig(),
    );
    return new Response("Email digest unsubscribe request processed.", {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  } catch (e) {
    return apiError(e);
  }
}

import { CatalogueError } from "../catalogue/service";
import { readBody } from "../http/access";

/** Parse only bounded form bodies; a bearer capability replaces session authentication. */
export async function parseUnsubscribeRequest(request: Request) {
  const type = request.headers.get("content-type") ?? "";
  const mediaType = type.split(";", 1)[0].trim().toLowerCase();
  if (
    !["application/x-www-form-urlencoded", "multipart/form-data"].includes(
      mediaType,
    )
  )
    throw new CatalogueError(400, "Use a form-encoded unsubscribe request.");
  const raw = await readBody(request);
  let form: FormData | URLSearchParams;
  try {
    form =
      mediaType === "multipart/form-data"
        ? await new Response(new Uint8Array(raw), {
            headers: { "Content-Type": type },
          }).formData()
        : new URLSearchParams(raw.toString("utf8"));
  } catch {
    throw new CatalogueError(400, "Invalid unsubscribe form.");
  }
  for (const [key, value] of form.entries()) {
    if (typeof value !== "string" || form.getAll(key).length !== 1)
      throw new CatalogueError(400, "Invalid unsubscribe form.");
  }
  const query = new URL(request.url).searchParams;
  const queryTokens = query.getAll("token");
  const bodyToken = form.get("token");
  if (
    queryTokens.length > 1 ||
    (queryTokens.length && bodyToken !== null && queryTokens[0] !== bodyToken)
  )
    throw new CatalogueError(400, "Invalid unsubscribe link.");
  const token = queryTokens[0] ?? bodyToken ?? "";
  const oneClick = form.get("List-Unsubscribe") === "One-Click";
  if (!oneClick && form.get("confirm") !== "unsubscribe")
    throw new CatalogueError(400, "Confirm the unsubscribe action.");
  return { token: String(token), oneClick };
}

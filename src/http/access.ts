import { getAuth } from "../auth";
import { getDatabase } from "../db";
import { localConfig } from "../config";
import { CatalogueError, requireAdmin } from "../catalogue/service";
import { ZodError } from "zod";
export async function adminAccess(request: Request, mutation = false) {
  if (mutation && request.headers.get("origin") !== localConfig().baseURL)
    throw new CatalogueError(403, "Invalid request origin.");
  const session = await (
    await getAuth()
  ).api.getSession({ headers: request.headers });
  if (!session) throw new CatalogueError(401, "Sign in required.");
  const { sql } = await getDatabase();
  await requireAdmin(sql, session.user.id);
  return { sql, userId: session.user.id };
}
export function apiError(error: unknown) {
  if (error instanceof CatalogueError)
    return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof ZodError || error instanceof SyntaxError)
    return Response.json({ error: "Invalid request fields." }, { status: 400 });
  return Response.json(
    { error: "Unable to complete the request." },
    { status: 500 },
  );
}
export async function readBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError("Missing body");
  let size = 0;
  const parts: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 64000) {
      await reader.cancel();
      throw new CatalogueError(413, "Request is too large.");
    }
    parts.push(value);
  }
  return Buffer.concat(parts);
}

export async function readJSON(request: Request) {
  return JSON.parse((await readBody(request)).toString("utf8"));
}

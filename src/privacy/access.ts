import { getAuth } from "../auth";
import { localConfig } from "../config";
import { CatalogueError } from "../catalogue/service";
import { requireFreshSession } from "./account";
export async function privacyOwner(request: Request, mutation = false) {
  if (mutation && request.headers.get("origin") !== localConfig().baseURL)
    throw new CatalogueError(403, "Invalid request origin.");
  const session = await (
    await getAuth()
  ).api.getSession({ headers: request.headers });
  if (!session) throw new CatalogueError(401, "Sign in required.");
  requireFreshSession(session.session.createdAt);
  return session.user.id;
}

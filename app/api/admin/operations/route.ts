import { z } from "zod";
import { adminAccess, apiError } from "@/src/http/access";
import { operationsOverview } from "@/src/research/operations";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  let response: Response;
  try {
    const { sql, userId } = await adminAccess(request);
    z.object({})
      .strict()
      .parse(Object.fromEntries(new URL(request.url).searchParams));
    response = Response.json(await operationsOverview(sql, userId));
  } catch (error) {
    response = apiError(error);
  }
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Vary", "Cookie");
  return response;
}

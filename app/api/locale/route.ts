import { z } from "zod";
import { localConfig } from "@/src/config";
import { apiError, readJSON } from "@/src/http/access";
import { localeCookie } from "@/src/i18n/locale";
export async function POST(request: Request) {
  if (request.headers.get("origin") !== localConfig().baseURL)
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  try {
    const { locale } = z
      .object({ locale: z.enum(["en", "zh-Hans"]) })
      .strict()
      .parse(await readJSON(request));
    return Response.json(
      { locale },
      {
        headers: {
          "Set-Cookie": localeCookie(locale),
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    return apiError(error);
  }
}

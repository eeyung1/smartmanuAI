import { getAuth } from "@/src/auth";
import { getDatabase } from "@/src/db";
import {
  completeOnboarding,
  readOnboardingProgress,
  saveOnboardingStep,
} from "@/src/domain/profile";
import { localConfig } from "@/src/config";
import { localeCookie } from "@/src/i18n/locale";

async function currentUser(request: Request) {
  const session = await (
    await getAuth()
  ).api.getSession({
    headers: request.headers,
  });
  return session?.user ?? null;
}

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const progress = await readOnboardingProgress(
    (await getDatabase()).sql,
    user.id,
  );
  return Response.json(progress, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function PATCH(request: Request) {
  if (request.headers.get("origin") !== localConfig().baseURL)
    return Response.json({ error: "invalid_origin" }, { status: 403 });
  const user = await currentUser(request);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    const progress = await saveOnboardingStep(
      (await getDatabase()).sql,
      user.id,
      await request.json(),
    );
    return Response.json(progress, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ error: "invalid_onboarding_step" }, { status: 400 });
  }
}

export async function POST(request: Request) {
  if (request.headers.get("origin") !== localConfig().baseURL)
    return Response.json({ error: "invalid_origin" }, { status: 403 });
  const user = await currentUser(request);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    const result = await completeOnboarding((await getDatabase()).sql, user.id);
    return Response.json(result, {
      headers: {
        "Cache-Control": "no-store",
        "Set-Cookie": localeCookie(result.profile.interfaceLanguage),
      },
    });
  } catch {
    return Response.json({ error: "incomplete_onboarding" }, { status: 400 });
  }
}

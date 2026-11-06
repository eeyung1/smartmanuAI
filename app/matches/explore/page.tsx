import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/src/auth";
import Catalogue from "@/app/opportunities/catalogue";
export const dynamic = "force-dynamic";
export default async function Explore({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await (
    await getAuth()
  ).api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in?returnTo=%2Fmatches%2Fexplore");
  return <Catalogue searchParams={searchParams} userId={session.user.id} />;
}

import Catalogue from "./catalogue";
export const dynamic = "force-dynamic";
export default function Opportunities({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <Catalogue searchParams={searchParams} />;
}

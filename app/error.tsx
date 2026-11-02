"use client";
import { useScreenText } from "@/src/i18n/context";
import FailureScreen from "./components/failure-screen";
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { locale } = useScreenText();
  return <FailureScreen locale={locale} reset={reset} />;
}

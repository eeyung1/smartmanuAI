"use client";
import { useState } from "react";
export default function DeliveryTests({
  initial,
}: {
  initial: {
    id: string;
    channel: string;
    state: string;
    attempts: number;
    error_code: string | null;
  }[];
}) {
  const [items, setItems] = useState(initial),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function act(prepare: boolean) {
    setBusy(true);
    try {
      if (prepare) {
        const r = await fetch("/api/me/delivery-tests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        const value = await r.json();
        if (!r.ok)
          throw Error(value.error ?? "Unable to prepare a delivery test.");
      }
      const r = await fetch("/api/me/delivery-tests");
      if (!r.ok) throw Error("Unable to refresh local delivery tests.");
      setItems(await r.json());
      setMessage(
        prepare
          ? "Local test prepared. A separate fixture worker processes it; no real provider is contacted."
          : "Local test status refreshed.",
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <h2>Outbound delivery simulation</h2>
      <p>
        Only synthetic digests are eligible. These tests use fake provider
        credentials and an injected fixture transport. No live sender is
        connected.
      </p>
      <button disabled={busy} onClick={() => void act(true)}>
        Prepare latest local digest for testing
      </button>
      <button
        disabled={busy}
        className="secondary"
        onClick={() => void act(false)}
      >
        Refresh delivery tests
      </button>
      {items.length ? (
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              {item.channel} ·{" "}
              {item.state === "accepted"
                ? "Fixture provider accepted"
                : item.state}{" "}
              · Attempts {item.attempts}
              {item.error_code ? " · " + item.error_code : ""}
            </li>
          ))}
        </ul>
      ) : (
        <p>No outbound tests yet.</p>
      )}
      <p role="status">{message}</p>
    </section>
  );
}

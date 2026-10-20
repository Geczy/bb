import { lazy, Suspense } from "react";
import { nativeGuidanceFixture } from "./native-fixture-selection";

const Fixture = import.meta.env.DEV
  ? lazy(() => import("./native-fixture-surface"))
  : null;

export function NativeGuidanceFixtureSlot({ kind, target, onDraft }: {
  kind: "empty" | "next-step" | "hint";
  target: string;
  onDraft?: (text: string) => void;
}) {
  const selection = nativeGuidanceFixture;
  const matches = selection !== null && (
    kind === "empty" ? ["reading", "suggestions", "jobs", "no-agent"].includes(selection.kind)
      : kind === "next-step" ? ["next-step", "day2", "plugin-install", "plugin-build"].includes(selection.kind)
      : selection.kind === "hint"
  );
  if (Fixture === null || !matches || selection?.target !== target) return null;
  return <Suspense fallback={null}><Fixture selection={selection} onDraft={onDraft} /></Suspense>;
}

import { type RefObject, useEffect, useState } from "react";

const PORTALED_OVERLAY_SELECTOR = "[data-bb-portaled-overlay]";
const STABLE_FRAMES_BEFORE_IDLE = 5;

interface RectLike {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

function rectsOverlap(a: RectLike, b: RectLike): boolean {
  return (
    a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
  );
}

function isCoveringOverlay(overlay: Element, target: Element): boolean {
  if (overlay.getAttribute("data-state") === "closed") {
    return false;
  }
  if (overlay.contains(target) || target.contains(overlay)) {
    return false;
  }
  return overlay.querySelector('[role="tooltip"]') === null;
}

function readPortaledOverlayCoverage(target: Element): {
  covered: boolean;
  openOverlayCount: number;
  signature: string;
} {
  const targetRect = target.getBoundingClientRect();
  let covered = false;
  let openOverlayCount = 0;
  let signature = "";
  for (const overlay of target.ownerDocument.querySelectorAll(
    PORTALED_OVERLAY_SELECTOR,
  )) {
    if (!isCoveringOverlay(overlay, target)) {
      continue;
    }
    openOverlayCount += 1;
    const rect = overlay.getBoundingClientRect();
    signature += `${rect.left},${rect.top},${rect.right},${rect.bottom};`;
    if (rect.width > 0 && rect.height > 0 && rectsOverlap(rect, targetRect)) {
      covered = true;
    }
  }
  return { covered, openOverlayCount, signature };
}

function isOverlayMutation(record: MutationRecord): boolean {
  const target = record.target;
  if (target === target.ownerDocument?.body) {
    return true;
  }
  return (
    target instanceof Element &&
    target.closest(PORTALED_OVERLAY_SELECTOR) !== null
  );
}

export function usePortaledOverlayCoversElement(
  targetRef: RefObject<HTMLElement | null>,
  enabled: boolean,
): boolean {
  const [covered, setCovered] = useState(false);

  useEffect(() => {
    const target = targetRef.current;
    if (!enabled || target === null) {
      setCovered(false);
      return;
    }
    const ownerWindow = target.ownerDocument.defaultView;
    if (ownerWindow === null) {
      return;
    }
    let frame: number | null = null;
    let lastSignature = "";
    let stableFrames = 0;

    const check = () => {
      frame = null;
      const coverage = readPortaledOverlayCoverage(target);
      setCovered(coverage.covered);
      if (coverage.openOverlayCount === 0) {
        lastSignature = "";
        return;
      }
      stableFrames =
        coverage.signature === lastSignature ? stableFrames + 1 : 0;
      lastSignature = coverage.signature;
      if (stableFrames < STABLE_FRAMES_BEFORE_IDLE) {
        frame = ownerWindow.requestAnimationFrame(check);
      }
    };
    const schedule = () => {
      stableFrames = 0;
      if (frame === null) {
        frame = ownerWindow.requestAnimationFrame(check);
      }
    };

    const observer = new MutationObserver((records) => {
      if (records.some(isOverlayMutation)) {
        schedule();
      }
    });
    observer.observe(target.ownerDocument.body, {
      attributes: true,
      attributeFilter: ["data-state"],
      childList: true,
      subtree: true,
    });
    ownerWindow.addEventListener("resize", schedule);
    schedule();

    return () => {
      observer.disconnect();
      ownerWindow.removeEventListener("resize", schedule);
      if (frame !== null) {
        ownerWindow.cancelAnimationFrame(frame);
      }
    };
  }, [enabled, targetRef]);

  return covered;
}

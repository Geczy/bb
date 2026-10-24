import type { BottomAnchorContextValue } from "@/components/ui/bottom-anchored-scroll-body.js";
import { flashSearchTarget } from "@/lib/search-flash";

export const REVEAL_STABLE_FRAME_COUNT = 2;
export const REVEAL_MAX_FRAME_COUNT = 12;

export function revealTimelineRow(
  element: HTMLElement,
  bottomAnchor: BottomAnchorContextValue | null,
  flash = true,
) {
  const options = { block: "start", inline: "nearest" } as const;
  if (bottomAnchor !== null) {
    bottomAnchor.scrollElementIntoView({ element, options });
  } else {
    element.scrollIntoView(options);
  }
  if (!flash) return;

  flashSearchTarget(element);
}

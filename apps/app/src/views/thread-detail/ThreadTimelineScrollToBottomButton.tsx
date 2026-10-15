import {
  useBottomAnchoredScroll,
  useNewContentBelow,
} from "@/components/ui/bottom-anchored-scroll-body.js";
import { ScrollToBottomButton } from "@/components/ui/scroll-to-bottom-button.js";

export function ThreadTimelineScrollToBottomButton({
  active,
}: {
  active: boolean;
}) {
  const bottomAnchor = useBottomAnchoredScroll();
  const newContentBelow = useNewContentBelow();
  if (!bottomAnchor) return null;

  return (
    <ScrollToBottomButton
      visible={!bottomAnchor.isAtBottom}
      active={active}
      hasNewContent={newContentBelow?.hasNewContentBelow ?? false}
      onClick={bottomAnchor.scrollToBottom}
    />
  );
}

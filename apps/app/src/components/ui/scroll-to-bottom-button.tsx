import { cn } from "@bb/shared-ui/lib/utils";
import { Icon } from "@bb/shared-ui/icon";

interface ScrollToBottomButtonProps {
  visible: boolean;
  active?: boolean;
  hasNewContent?: boolean;
  onClick: () => void;
}

export function ScrollToBottomButton({
  visible,
  active = false,
  hasNewContent = false,
  onClick,
}: ScrollToBottomButtonProps) {
  return (
    <div className="flex h-0 items-center justify-center">
      <button
        onClick={onClick}
        className={cn(
          "z-20 -mt-20 flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-full border border-border bg-background transition-all duration-200 hover:bg-accent",
          hasNewContent ? "px-3 text-xs text-foreground" : "w-8",
          visible
            ? "translate-y-0 opacity-100"
            : "pointer-events-none invisible translate-y-2 opacity-0",
        )}
        aria-label={
          hasNewContent ? "Scroll to new messages" : "Scroll to latest event"
        }
        type="button"
      >
        {}
        <Icon
          name="ArrowDown"
          className={cn("size-4", active && visible && "animate-shine-icon")}
        />
        {hasNewContent ? <span>New messages</span> : null}
      </button>
    </div>
  );
}

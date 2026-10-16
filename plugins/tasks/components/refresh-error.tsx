import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

export function RefreshError({
  message,
  onRetry,
  className,
}: {
  message: string;
  onRetry: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex items-center gap-2 text-xs text-destructive",
        className,
      )}
    >
      <Icon name="AlertCircle" className="size-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{message}</span>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 shrink-0 px-2"
        onClick={onRetry}
      >
        Retry
      </Button>
    </div>
  );
}

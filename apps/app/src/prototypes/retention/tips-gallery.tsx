import { Icon } from "@bb/shared-ui/icon";
import { InlineConfirmation } from "./inline-confirmation";
import {
  SuggestionCard,
  SuggestionGroup,
  SuggestionSection,
} from "./suggestion-card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@bb/shared-ui/tooltip";
import type { TipView } from "./tip-fixtures";



export interface TipResult {
  id: string;
  ok: boolean;
  text: string;
}

export interface TipsGalleryProps {
  tips: readonly TipView[];
  result: TipResult | null;
  onPreview(id: string | null): void;
  onActivate(tip: TipView): void;
  onDismiss(): void;
}

function DismissTips({ onDismiss }: Pick<TipsGalleryProps, "onDismiss">) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="absolute right-1 top-0 inline-flex items-center gap-1 text-xs text-subtle-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onClick={onDismiss}
          >
            Hide tips
            <Icon name="X" className="size-3.5" aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">
          Hide these suggestions for this preview.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function TipOutcome({ result }: { result: TipResult }) {
  return result.ok ? (
    <InlineConfirmation>{result.text}</InlineConfirmation>
  ) : (
    <span role="status">{result.text}</span>
  );
}

export function TipsFeed({
  tips,
  result,
  onPreview,
  onActivate,
}: Pick<TipsGalleryProps, "tips" | "result" | "onPreview" | "onActivate">) {
  return (
    <>
      
      <SuggestionGroup>
        {tips.map((tip) => (
          <div
            key={tip.id}
            data-tip-id={tip.id}
            data-tip-art-trigger=""
            onMouseEnter={() => onPreview(tip.id)}
            onMouseLeave={() => onPreview(null)}
            onFocus={() => onPreview(tip.id)}
            onBlur={() => onPreview(null)}
          >
            <SuggestionCard
              grouped
              leading={
                <Icon name={tip.icon} className="size-5 shrink-0 text-muted-foreground" />
              }
              title={tip.title}
              description={tip.body}
              meta={
                result?.id === tip.id ? (
                  <TipOutcome result={result} />
                ) : undefined
              }
              ariaLabel={`${tip.title}. ${tip.body} ${tip.action.label}`}
              onSelect={() => onActivate(tip)}
            />
          </div>
        ))}
      </SuggestionGroup>
    </>
  );
}

export function TipsGallery({
  tips,
  result,
  onPreview,
  onActivate,
  onDismiss,
}: TipsGalleryProps) {
  return (
    <div className="relative mt-20">
      <SuggestionSection label="Tips">
        <TipsFeed
          tips={tips}
          result={result}
          onPreview={onPreview}
          onActivate={onActivate}
        />
      </SuggestionSection>
      <DismissTips onDismiss={onDismiss} />
    </div>
  );
}

export function TipsHiddenNotice({ onUndo }: { onUndo: () => void }) {
  return (
    <p className="mt-20 flex items-center gap-2 px-1 text-xs text-subtle-foreground">
      <InlineConfirmation>Tips hidden</InlineConfirmation>
      <button
        type="button"
        className="underline underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        onClick={onUndo}
      >
        Undo
      </button>
    </p>
  );
}

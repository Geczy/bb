import type { ReactNode } from "react";
import { Button } from "@bb/shared-ui/button";
import { Icon } from "@bb/shared-ui/icon";
import { Popover, PopoverContent, PopoverTrigger } from "@bb/shared-ui/popover";

export type Evidence = { label: string; title: string; text: string };

export function SuggestionCard({ title, why, evidence, action, onAccept, onDismiss }: {
  title: string;
  why: string;
  evidence: Evidence;
  action: string;
  onAccept(): void;
  onDismiss(): void;
}) {
  return <section data-next-step className="relative rounded-xl border border-border bg-card p-4">
    <Button variant="ghost" size="icon" className="absolute right-2 top-2 size-6 text-subtle-foreground" aria-label="Dismiss suggestion" onClick={onDismiss}><Icon name="X" className="size-3.5" /></Button>
    <h2 className="pr-6 text-sm font-medium leading-snug">{title}</h2>
    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{why}</p>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
      <Popover>
        <PopoverTrigger asChild><Button variant="ghost" size="sm" className="h-6 gap-1.5 rounded-md bg-state-hover px-2 text-xs text-muted-foreground" aria-label={`View source: ${evidence.label}`}><Icon name="FileText" className="size-3" />{evidence.label}</Button></PopoverTrigger>
        <PopoverContent side="top" align="start" className="w-96 max-w-[calc(100vw-2rem)]" mobileTitle="Source">
          <p className="text-sm font-medium">{evidence.title}</p>
          <p className="mt-1 text-xs text-subtle-foreground">Preview evidence</p>
          <p className="mt-3 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{evidence.text}</p>
        </PopoverContent>
      </Popover>
      <Button size="sm" onClick={onAccept}>{action}</Button>
    </div>
  </section>;
}

export function Hint({ children, action, onAction, onDismiss }: {
  children: ReactNode;
  action: string;
  onAction(): void;
  onDismiss(): void;
}) {
  return <div data-hint className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-xs text-muted-foreground">
    <span>{children}</span>
    <button className="font-medium text-foreground hover:underline" onClick={onAction}>{action}</button>
    <button className="text-subtle-foreground hover:text-foreground" onClick={onDismiss}>Not now</button>
  </div>;
}

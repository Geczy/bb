import type { ReactNode } from "react";
import { Icon } from "@bb/shared-ui/icon";
import { Sidebar, SidebarContent, SidebarFooter, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppPageHeader } from "@/components/layout/AppPageHeader";
import { ConversationMessageContent } from "@/components/thread/timeline/ConversationMessageContent";
import { ThreadStatusGlyph } from "@/components/thread/ThreadStatusGlyph";

export function Message({ text, user = false }: { text: string; user?: boolean }) {
  return user ? <ConversationMessageContent role="user" initiator="user" senderThreadId={null} senderThreadTitle={null} senderIsPluginSideChat={false} systemMessageKind="unlabeled" systemMessageSubject={null} text={text} timestamp={0} attachments={null} mentions={[]} turnRequest={{ isGrouped: false, kind: "message", status: "accepted" }} /> : <ConversationMessageContent role="assistant" id="guidance-reply" threadId="guidance-thread" turnId="guidance-turn" text={text} timestamp={0} attachments={null} showActions mobileActionDisplay="inline" streaming={false} />;
}

export function Frame({ title, threadTitle, empty, running, waiting, children, onNew, onSettings, threads, onOpenThread }: {
  title: string;
  threadTitle: string;
  empty: boolean;
  running: boolean;
  waiting: boolean;
  children: ReactNode;
  onNew(): void;
  onSettings(): void;
  threads: string[];
  onOpenThread(title: string): void;
}) {
  return <div className="h-dvh bg-background text-foreground" data-guidance-story>
    <SidebarProvider defaultOpen className="h-full">
      <Sidebar>
        <div className="flex h-12 items-center px-4 text-sm font-semibold">bb</div>
        <SidebarContent className="px-2">
          <SidebarMenu>
            <SidebarMenuItem><SidebarMenuButton onClick={onNew} isActive={empty}><Icon name="Plus" /><span>New thread</span></SidebarMenuButton></SidebarMenuItem>
          </SidebarMenu>
          {!empty && <div className="mt-5">
            <p className="px-2 pb-2 text-xs text-subtle-foreground">bb</p>
            <SidebarMenu><SidebarMenuItem><SidebarMenuButton isActive onClick={() => onOpenThread(threadTitle)}><ThreadStatusGlyph indicator={waiting ? "waiting-for-input" : running ? "runtime" : "none"} /><span className="truncate">{threadTitle}</span></SidebarMenuButton></SidebarMenuItem></SidebarMenu>
            {threads.length > 0 && <SidebarMenu className="ml-3 w-auto border-l border-border pl-2">{threads.map(item => <SidebarMenuItem key={item}><SidebarMenuButton onClick={() => onOpenThread(item)}><ThreadStatusGlyph indicator="runtime" /><span className="truncate">{item}</span></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu>}
          </div>}
        </SidebarContent>
        <SidebarFooter className="p-2"><SidebarMenu><SidebarMenuItem><SidebarMenuButton onClick={onSettings}><Icon name="Settings" /><span>Settings</span></SidebarMenuButton></SidebarMenuItem></SidebarMenu></SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-w-0 overflow-hidden">
        <AppPageHeader center={<><SidebarTrigger /><span className="truncate text-sm">{title}</span></>} />
        <div className="flex min-h-0 flex-1 flex-col px-4 pt-4 md:px-5 md:pt-5">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  </div>;
}


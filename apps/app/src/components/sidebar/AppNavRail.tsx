import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
  type RefObject,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@bb/shared-ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@bb/shared-ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@bb/shared-ui/dropdown-menu";
import { Icon } from "@bb/shared-ui/icon";
import type { ExperimentalBadge } from "@get-bb/plugin-sdk";
import { useIsCompactViewport } from "@bb/shared-ui/hooks/use-compact-viewport";
import { cn } from "@bb/shared-ui/lib/utils";
import { Popover, PopoverAnchor, PopoverContent } from "@bb/shared-ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@bb/shared-ui/tooltip";
import { useIsSidebarFramed } from "@/components/ui/sidebar.js";
import { AppCommandShortcutPill } from "@/components/commands/AppCommandShortcutHint";
import { useAppCommandShortcut } from "@/components/commands/AppCommandProvider";
import {
  CHROME_ROW_HEIGHT_CLASS,
  getBbDesktopInfo,
  MACOS_WINDOW_DRAG_CLASS,
  shouldUseMacosDesktopChrome,
} from "@/lib/bb-desktop";
import { getRootComposeRoutePath } from "@/lib/route-paths";
import { NAV_RAIL_WIDTH_CLASS } from "./navRailWidth";
import { useSidebarHeaderControlAxisClass } from "./SidebarChrome";
import { SidebarNavigationCustomize } from "./SidebarNavigationCustomize";
import {
  SidebarNavigationIcon,
  useSidebarNavigation,
  useSidebarNavigationModel,
  useSidebarNavigationSplit,
} from "./SidebarNavigationModel";
import {
  RailBadgeMark,
  RailBadgeSources,
  railBadgeAccessibleLabel,
  type RailBadges,
} from "./RailBadges";
import {
  NEW_THREAD_NAVIGATION_ITEM_ID,
  type SidebarNavigationItem,
} from "./sidebarNavigationItems";
import { PROJECT_LIST_ACTION_BUTTON_CLASS } from "@bb/shared-ui/sidebar-row-classes";

export interface NavRailCustomizeState {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

const RAIL_ICON_CLASS = "size-(--bb-sidebar-control-icon-size)";
const RAIL_MENU_SIDE_OFFSET = 12;

const RAIL_BUTTON_CLASS = cn(
  "relative size-(--bb-sidebar-control-size) shrink-0 rounded-md p-0 text-muted-foreground ring-sidebar-ring",
  "hover:bg-state-hover hover:text-sidebar-foreground focus-visible:ring-2",
  "aria-[current=page]:bg-state-active aria-[current=page]:text-sidebar-foreground",
  "data-[state=open]:bg-state-active data-[state=open]:text-sidebar-foreground",
  "[&_[data-icon-root]]:size-(--bb-sidebar-control-icon-size)",
);

interface RailButtonProps extends Omit<
  ComponentProps<typeof Button>,
  "aria-label" | "aria-current"
> {
  label: string;
  active?: boolean;
  children: ReactNode;
}

const RailButton = forwardRef<HTMLButtonElement, RailButtonProps>(
  ({ label, active = false, className, children, ...props }, ref) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          ref={ref}
          type="button"
          variant="ghost"
          size="icon"
          aria-label={label}
          aria-current={active ? "page" : undefined}
          className={cn(RAIL_BUTTON_CLASS, className)}
          {...props}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  ),
);
RailButton.displayName = "RailButton";

function RailItem({
  item,
  badge,
  onCustomize,
  onMenuCloseAutoFocus,
}: {
  item: SidebarNavigationItem;
  badge: ExperimentalBadge | undefined;
  onCustomize: () => void;
  onMenuCloseAutoFocus: (event: Event) => void;
}) {
  const { activeItemId, actions } = useSidebarNavigation();
  const split = useSidebarNavigationSplit(item.id);
  const [disablePending, setDisablePending] = useState(false);
  const isPluginItem = item.pluginId !== null;
  const label = railBadgeAccessibleLabel(item.label, badge);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <span className="flex" data-nav-rail-item={item.id}>
          <RailButton
            label={item.shortcut ? `${label} (${item.shortcut.label})` : label}
            active={item.id === activeItemId}
            disabled={item.isDisabled}
            aria-busy={item.isLoading || undefined}
            aria-keyshortcuts={item.shortcut?.ariaKeyShortcuts}
            className={cn(item.isLoading && "opacity-60")}
            {...split.splitProps}
            onClick={(event) =>
              actions.activate(item.id, {
                openInSplit: event.metaKey || event.ctrlKey,
              })
            }
          >
            <SidebarNavigationIcon
              icon={item.icon}
              className={RAIL_ICON_CLASS}
            />
            {badge ? (
              <RailBadgeMark
                count={badge.count}
                className={cn(
                  "pointer-events-none absolute",
                  badge.count === undefined
                    ? "top-1 right-1"
                    : "-top-0.5 -right-0.5",
                )}
              />
            ) : null}
          </RailButton>
        </span>
      </ContextMenuTrigger>
      <ContextMenuContent
        aria-label={
          isPluginItem ? `${item.label} panel options` : `${item.label} options`
        }
        onCloseAutoFocus={onMenuCloseAutoFocus}
      >
        {isPluginItem ? (
          <>
            {split.isAvailable ? (
              <ContextMenuItem
                onSelect={() =>
                  actions.activate(item.id, { openInSplit: true })
                }
              >
                <Icon name="Columns2" aria-hidden="true" />
                Open in split
              </ContextMenuItem>
            ) : null}
            <ContextMenuItem onSelect={() => actions.openDetails(item.id)}>
              <Icon name="Info" aria-hidden="true" />
              View details
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        ) : null}
        <ContextMenuItem onSelect={() => actions.setVisible(item.id, false)}>
          <Icon name="EyeOff" aria-hidden="true" />
          Hide from rail
        </ContextMenuItem>
        <ContextMenuItem onSelect={onCustomize}>
          <Icon name="SlidersHorizontal" aria-hidden="true" />
          Customize rail
        </ContextMenuItem>
        {isPluginItem ? (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              disabled={disablePending}
              onSelect={() => {
                setDisablePending(true);
                actions
                  .disablePlugin(item.id)
                  .catch(() => {})
                  .finally(() => setDisablePending(false));
              }}
            >
              <Icon name="Unavailable" aria-hidden="true" />
              Disable
            </ContextMenuItem>
          </>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  );
}

function RailMoreMenu({
  buttonRef,
  hidden,
  badges,
  onCustomize,
  onMenuCloseAutoFocus,
}: {
  buttonRef: RefObject<HTMLButtonElement | null>;
  hidden: readonly SidebarNavigationItem[];
  badges: RailBadges;
  onCustomize: () => void;
  onMenuCloseAutoFocus: (event: Event) => void;
}) {
  const { actions } = useSidebarNavigation();
  const hiddenBadgeLabels = hidden.flatMap((item) => {
    const badge = badges.get(item.id);
    return badge ? [`${item.label}: ${badge.label}`] : [];
  });
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <RailButton
          ref={buttonRef}
          label={
            hiddenBadgeLabels.length > 0
              ? `More, ${hiddenBadgeLabels.join(", ")}`
              : "More"
          }
        >
          <Icon name="MoreHorizontal" aria-hidden="true" />
          {hiddenBadgeLabels.length > 0 ? (
            <RailBadgeMark
              count={undefined}
              className="pointer-events-none absolute top-1 right-1"
            />
          ) : null}
        </RailButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="right"
        align="start"
        sideOffset={RAIL_MENU_SIDE_OFFSET}
        data-testid="nav-rail-more-menu"
        onCloseAutoFocus={onMenuCloseAutoFocus}
      >
        {hidden.map((item) => {
          const badge = badges.get(item.id);
          return (
            <DropdownMenuItem
              key={item.id}
              disabled={item.isDisabled || item.isLoading}
              onSelect={() => actions.activate(item.id, { openInSplit: false })}
            >
              <SidebarNavigationIcon icon={item.icon} />
              {item.label}
              {badge ? (
                <>
                  <span className="sr-only">, {badge.label}</span>
                  <RailBadgeMark count={badge.count} className="ml-auto" />
                </>
              ) : null}
            </DropdownMenuItem>
          );
        })}
        {hidden.length > 0 ? <DropdownMenuSeparator /> : null}
        <DropdownMenuItem onSelect={onCustomize}>
          <Icon name="SlidersHorizontal" aria-hidden="true" />
          Customize rail
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppNavRail({
  isAppMode,
  customize,
}: {
  isAppMode: boolean;
  customize: NavRailCustomizeState;
}) {
  const { state, rowsById } = useSidebarNavigationModel();
  const { items, activeItemId } = state;
  const [badges, setBadges] = useState<RailBadges>(() => new Map());
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const customizeAfterMenuCloseRef = useRef(false);
  const location = useLocation();
  const navigate = useNavigate();
  const [desktopInfo] = useState(getBbDesktopInfo);
  const isFramed = useIsSidebarFramed();
  const isCompactViewport = useIsCompactViewport();

  const isHomeActive =
    isAppMode &&
    (activeItemId === null || activeItemId === NEW_THREAD_NAVIGATION_ITEM_ID);
  const currentRoutePath = `${location.pathname}${location.search}${location.hash}`;
  const homeRoutePathRef = useRef(
    isHomeActive ? currentRoutePath : getRootComposeRoutePath(),
  );
  useEffect(() => {
    if (isHomeActive) homeRoutePathRef.current = currentRoutePath;
  }, [currentRoutePath, isHomeActive]);

  const destinations = items.filter(
    (item) => item.action.kind !== "new-thread",
  );
  const visible = destinations.filter((item) => item.isVisible);
  const hidden = destinations.filter((item) => !item.isVisible);
  const badgedPanels = destinations.flatMap((item) => {
    const panel = rowsById.get(item.id)?.panelEntry?.panel;
    return panel ? [{ itemId: item.id, panel }] : [];
  });

  const requestCustomize = () => {
    customizeAfterMenuCloseRef.current = true;
  };
  const handleMenuCloseAutoFocus = (event: Event) => {
    if (!customizeAfterMenuCloseRef.current) return;
    customizeAfterMenuCloseRef.current = false;
    event.preventDefault();
    customize.onOpenChange(true);
  };

  return (
    <div
      data-testid="app-nav-rail"
      className={cn(
        "relative z-10 flex shrink-0 flex-col",
        NAV_RAIL_WIDTH_CLASS,
        !isFramed &&
          "-mt-[env(safe-area-inset-top)] bg-surface-recessed pt-[env(safe-area-inset-top)]",
      )}
    >
      {isFramed ? null : (
        <div
          aria-hidden="true"
          className={cn(
            CHROME_ROW_HEIGHT_CLASS,
            "shrink-0",
            shouldUseMacosDesktopChrome(desktopInfo) && MACOS_WINDOW_DRAG_CLASS,
          )}
        />
      )}
      <nav
        aria-label="Primary navigation"
        className={cn(
          "flex min-h-0 flex-1 flex-col items-center gap-2.5 pb-2",
          isFramed && "pt-2",
        )}
      >
        <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-2.5 overflow-y-auto py-0.5 [scrollbar-width:none]">
          <Popover
            open={customize.isOpen}
            onOpenChange={customize.onOpenChange}
          >
            <PopoverAnchor asChild>
              <RailButton
                label="Home"
                active={isHomeActive}
                onClick={() => {
                  if (!isHomeActive) void navigate(homeRoutePathRef.current);
                }}
              >
                <Icon name="Home" aria-hidden="true" />
              </RailButton>
            </PopoverAnchor>
            {visible.map((item) => (
              <RailItem
                key={item.id}
                item={item}
                badge={badges.get(item.id)}
                onCustomize={requestCustomize}
                onMenuCloseAutoFocus={handleMenuCloseAutoFocus}
              />
            ))}
            <RailMoreMenu
              buttonRef={moreButtonRef}
              hidden={hidden}
              badges={badges}
              onCustomize={
                isCompactViewport
                  ? () => customize.onOpenChange(true)
                  : requestCustomize
              }
              onMenuCloseAutoFocus={handleMenuCloseAutoFocus}
            />
            <PopoverContent
              side="right"
              align="start"
              sideOffset={RAIL_MENU_SIDE_OFFSET}
              aria-label="Customize rail"
              mobileTitle="Customize rail"
              data-testid="nav-rail-customize"
              className="flex max-h-(--radix-popover-content-available-height) flex-col p-2 md:w-64"
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                moreButtonRef.current?.focus();
              }}
            >
              <SidebarNavigationCustomize
                onClose={() => customize.onOpenChange(false)}
              />
            </PopoverContent>
          </Popover>
        </div>
      </nav>
      <RailBadgeSources panels={badgedPanels} setBadges={setBadges} />
    </div>
  );
}

export function NavRailSettingsButton({
  isSettingsActive,
  settingsRoutePath,
}: {
  isSettingsActive: boolean;
  settingsRoutePath: string;
}) {
  const navigate = useNavigate();
  const settingsShortcut = useAppCommandShortcut("settings.open");
  return (
    <RailButton
      label={
        settingsShortcut ? `Settings (${settingsShortcut.label})` : "Settings"
      }
      active={isSettingsActive}
      className="h-8 max-md:pointer-coarse:h-9"
      aria-keyshortcuts={settingsShortcut?.ariaKeyshortcuts}
      onClick={() => {
        if (!isSettingsActive) void navigate(settingsRoutePath);
      }}
    >
      <Icon name="Settings" aria-hidden="true" />
    </RailButton>
  );
}

export function NavRailNewThreadButton() {
  const { items, actions, isShortcutModifierHeld } = useSidebarNavigation();
  const split = useSidebarNavigationSplit(NEW_THREAD_NAVIGATION_ITEM_ID);
  const axisClass = useSidebarHeaderControlAxisClass();
  const item = items.find(
    (candidate) => candidate.action.kind === "new-thread",
  );
  if (item === undefined) return null;
  const shortcut = isShortcutModifierHeld ? item.shortcut : null;

  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className={cn(
        PROJECT_LIST_ACTION_BUTTON_CLASS,
        "w-auto flex-1",
        axisClass,
      )}
      disabled={item.isDisabled}
      aria-keyshortcuts={item.shortcut?.ariaKeyShortcuts}
      aria-label={
        item.shortcut ? `${item.label} (${item.shortcut.label})` : undefined
      }
      {...split.splitProps}
      onClick={(event) =>
        actions.activate(item.id, {
          openInSplit: event.metaKey || event.ctrlKey,
        })
      }
    >
      <SidebarNavigationIcon icon={item.icon} />
      <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
      {shortcut ? <AppCommandShortcutPill shortcut={shortcut} /> : null}
    </Button>
  );
}

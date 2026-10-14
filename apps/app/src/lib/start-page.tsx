import { useEffect, useRef, useState, type ReactNode } from "react";
import { atom, useAtom, useStore } from "jotai";
import { useLocation, useNavigate } from "react-router-dom";
import { COMPACT_VIEWPORT_QUERY } from "@bb/shared-ui/hooks/use-compact-viewport";
import { useSidebar } from "@/components/ui/sidebar";
import { useUiPreferences } from "@/hooks/queries/system-queries";
import { splitLayoutAtom } from "@/lib/split-layout/atoms";
import { focusedPaneRoute } from "@/views/thread-detail/splitThreadNavigation";
import { isInsideNativeShell } from "@/lib/native-shell";
import { bootPluginFrontends } from "@/lib/plugin-frontend-lazy";

export const launchedStartPageAtom = atom<string | null>(null);

export function StartPageLaunch({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const store = useStore();
  const { setOpen, setOpenMobile } = useSidebar();
  const [launch] = useState(() => ({
    eligible:
      location.pathname === "/" &&
      location.search === "" &&
      location.hash === "",
    mobile:
      isInsideNativeShell() ||
      window.matchMedia(COMPACT_VIEWPORT_QUERY).matches,
    layout: store.get(splitLayoutAtom),
    locationKey: location.key,
  }));
  const [ready, setReady] = useState(!launch.eligible);
  const decided = useRef(!launch.eligible);
  const [launchedPage, setLaunchedPage] = useAtom(launchedStartPageAtom);
  const preferences = useUiPreferences();

  useEffect(() => {
    if (decided.current) return;
    if (location.key !== launch.locationKey) {
      decided.current = true;
      setReady(true);
      return;
    }
    if (!launch.layout && !preferences.data && !preferences.isError) return;
    decided.current = true;
    if (launch.layout) {
      const route = focusedPaneRoute(launch.layout);
      if (route && route !== "/") navigate(route, { replace: true });
    } else if (preferences.data) {
      const key = launch.mobile ? "startPage.mobile" : "startPage.desktop";
      const destination = preferences.data.preferences[key]?.value;
      if (destination === "threads") {
        if (launch.mobile) setOpenMobile(true);
        else setOpen(true);
      } else if (destination && destination !== "/") {
        setLaunchedPage(destination);
        void bootPluginFrontends();
        navigate(destination, { replace: true });
      }
    }
    setReady(true);
  }, [
    launch,
    location.key,
    navigate,
    preferences.data,
    preferences.isError,
    setLaunchedPage,
    setOpen,
    setOpenMobile,
  ]);

  useEffect(() => {
    if (
      ready &&
      launchedPage &&
      location.key !== launch.locationKey &&
      location.pathname !== launchedPage
    ) {
      setLaunchedPage(null);
    }
  }, [
    ready,
    launchedPage,
    launch.locationKey,
    location.key,
    location.pathname,
    setLaunchedPage,
  ]);

  return ready ? children : null;
}

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { atom, useAtom, useSetAtom, useStore } from "jotai";
import { useLocation, useNavigate } from "react-router-dom";
import { useAppCommandHandler } from "@/components/commands/AppCommandProvider";
import { useSidebar } from "@/components/ui/sidebar";
import { useUiPreferences } from "@/hooks/queries/system-queries";
import { splitLayoutAtom } from "@/lib/split-layout/atoms";
import { focusedPaneRoute } from "@/views/thread-detail/splitThreadNavigation";
import { isInsideNativeShell } from "@/lib/native-shell";
import { bootPluginFrontends } from "@/lib/plugin-frontend-lazy";

export const requestedHomepageAtom = atom<{
  path: string;
  fromKey: string;
} | null>(null);

export function useHomepageNavigation() {
  const location = useLocation();
  const navigate = useNavigate();
  const { setOpen, setOpenMobile, isCompactViewport, open, openMobile } =
    useSidebar();
  const preferences = useUiPreferences();
  const key = isInsideNativeShell() ? "homepage.mobile" : "homepage.desktop";
  const destination = preferences.data?.preferences[key]?.value;
  const setRequestedPage = useSetAtom(requestedHomepageAtom);
  const openHomepage = useCallback(
    (replace = false) => {
      if (!destination) return false;
      const path = destination === "threads" ? "/" : destination;
      setRequestedPage(
        path.startsWith("/plugins/") ? { path, fromKey: location.key } : null,
      );
      if (destination === "threads") {
        if (isCompactViewport) setOpenMobile(true);
        else setOpen(true);
      } else {
        setOpenMobile(false);
      }
      if (path.startsWith("/plugins/")) void bootPluginFrontends();
      void navigate(path, { replace });
      return true;
    },
    [
      destination,
      isCompactViewport,
      location.key,
      navigate,
      setOpen,
      setOpenMobile,
      setRequestedPage,
    ],
  );
  const openBbHome = useCallback(() => {
    setRequestedPage(null);
    setOpenMobile(false);
    void navigate("/");
    return true;
  }, [navigate, setOpenMobile, setRequestedPage]);
  const isHomeActive =
    destination === "threads"
      ? location.pathname === "/" && (isCompactViewport ? openMobile : open)
      : destination !== undefined &&
        (location.pathname === destination ||
          (destination !== "/" &&
            location.pathname.startsWith(`${destination}/`)));
  return { openHomepage, openBbHome, isHomeActive, preferences };
}

export function HomepageLaunch({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const store = useStore();
  const { openHomepage, openBbHome, preferences } = useHomepageNavigation();
  useAppCommandHandler("homepage.openDefault", openBbHome);
  const [launch] = useState(() => ({
    eligible:
      location.pathname === "/" &&
      location.search === "" &&
      location.hash === "",
    layout: store.get(splitLayoutAtom),
    locationKey: location.key,
  }));
  const [ready, setReady] = useState(!launch.eligible);
  const decided = useRef(!launch.eligible);
  const [requestedPage, setRequestedPage] = useAtom(requestedHomepageAtom);

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
      if (route && route !== "/") void navigate(route, { replace: true });
    } else {
      openHomepage(true);
    }
    setReady(true);
  }, [
    launch,
    location.key,
    navigate,
    openHomepage,
    preferences.data,
    preferences.isError,
  ]);

  useEffect(() => {
    if (
      ready &&
      requestedPage &&
      location.key !== requestedPage.fromKey &&
      location.pathname !== requestedPage.path
    ) {
      setRequestedPage(null);
    }
  }, [ready, requestedPage, location.key, location.pathname, setRequestedPage]);

  return ready ? children : null;
}

import {
  isChunkDownloadError,
  reloadAfterChunkDownloadFailure,
} from "./stale-chunk-recovery";
import {
  prepareSplitImport,
  queueSplitPreload,
  trackCriticalLoad,
} from "./split-prefetch";
import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useState,
  type ComponentType,
  type ErrorInfo,
  type ReactNode,
} from "react";

export type SplitTier = "preload" | "intent";

export type SplitFailureProps = { error: unknown; retry: () => void };

const SERVER_RETRY_DELAY_MS = 5000;

function useReloadAfterDownloadFailure(error: unknown): void {
  useEffect(() => {
    if (!isChunkDownloadError(error)) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const attempt = async () => {
      const outcome = await reloadAfterChunkDownloadFailure();
      if (!cancelled && outcome === "server-unreachable") {
        timer = setTimeout(() => void attempt(), SERVER_RETRY_DELAY_MS);
      }
    };
    void attempt();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [error]);
}

export function SplitLoadFailure({ error, retry }: SplitFailureProps) {
  useReloadAfterDownloadFailure(error);
  if (isChunkDownloadError(error)) {
    return (
      <p role="alert" className="p-3 text-sm text-destructive">
        Couldn't download this part of bb.{" "}
        <button
          type="button"
          className="underline"
          onClick={() => window.location.reload()}
        >
          Reload
        </button>
      </p>
    );
  }
  return (
    <p role="alert" className="p-3 text-sm text-destructive">
      Something went wrong here.{" "}
      <button type="button" className="underline" onClick={retry}>
        Try again
      </button>
    </p>
  );
}

type SplitErrorBoundaryState = { failure: { error: unknown } | null };

class SplitErrorBoundary extends Component<
  { children: ReactNode; id: string; fallback: (error: unknown) => ReactNode },
  SplitErrorBoundaryState
> {
  override state: SplitErrorBoundaryState = { failure: null };

  static getDerivedStateFromError(error: unknown): SplitErrorBoundaryState {
    return { failure: { error } };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error(
      `[bb] split "${this.props.id}" failed`,
      error,
      info.componentStack,
    );
  }

  override render() {
    const { failure } = this.state;
    return failure === null
      ? this.props.children
      : this.props.fallback(failure.error);
  }
}

export function defineSplit<P extends object>({
  id,
  load,
  loading: Loading,
  error: ErrorView = SplitLoadFailure,
  tier,
  mountWhen,
  keepMounted = false,
  unmounted: Unmounted,
}: {
  id: string;
  load: () => Promise<ComponentType<P>>;
  loading: ComponentType<P>;
  error?: ComponentType<P & SplitFailureProps>;
  tier: SplitTier;
  mountWhen?: (props: P) => boolean;
  keepMounted?: boolean;
  unmounted?: ComponentType<P>;
}) {
  let pending: Promise<{ default: ComponentType<P> }> | null = null;
  let loaded: ComponentType<P> | null = null;
  const loadModule = () => {
    pending ??= prepareSplitImport(id)
      .then(() => load())
      .then((component) => {
        loaded = component;
        return { default: component };
      })
      .catch((error: unknown) => {
        pending = null;
        throw error;
      });
    return pending;
  };
  const renderModule = () => trackCriticalLoad(loadModule());
  const warm = async () => {
    await loadModule().catch(() => undefined);
  };
  const onIntent = () => {
    void warm();
  };
  if (tier === "preload") queueSplitPreload(warm);

  function SplitContent(props: P) {
    const [attempt, setAttempt] = useState(() => ({
      number: 0,
      View: loaded ?? lazy(renderModule),
    }));
    const retry = () => {
      setAttempt((previous) => ({
        number: previous.number + 1,
        View: loaded ?? lazy(renderModule),
      }));
    };
    const View = attempt.View;
    return (
      <SplitErrorBoundary
        key={attempt.number}
        id={id}
        fallback={(error) => (
          <ErrorView {...props} error={error} retry={retry} />
        )}
      >
        <Suspense fallback={<Loading {...props} />}>
          <View {...props} />
        </Suspense>
      </SplitErrorBoundary>
    );
  }

  function SplitComponent(props: P) {
    const wanted = mountWhen?.(props) ?? true;
    const [mountedBefore, setMountedBefore] = useState(wanted);
    if (wanted && !mountedBefore) setMountedBefore(true);
    if (wanted || (keepMounted && mountedBefore)) {
      return <SplitContent {...props} />;
    }
    return Unmounted ? <Unmounted {...props} /> : null;
  }

  return Object.assign(SplitComponent, {
    displayName: `Split(${id})`,
    id,
    tier,
    preload: warm,
    isLoaded: () => loaded !== null,
    intentProps: {
      onPointerEnter: onIntent,
      onFocus: onIntent,
      onPointerDown: onIntent,
    },
  });
}

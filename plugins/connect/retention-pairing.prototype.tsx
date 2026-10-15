import { useCallback, useEffect, useRef, useState } from "react";
import { experimental_copyToClipboard } from "@get-bb/plugin-sdk/app";
import { encodeMobilePairingPayload, type MobilePairingPayload } from "@bb/connect-client";
import QRCode from "qrcode";
import { Button } from "@bb/shared-ui/button";
import { Icon } from "@bb/shared-ui/icon";
import { cn } from "@bb/shared-ui/lib/utils";
function QrCodeImage({
  value,
  alt,
  className,
}: {
  value: string;
  alt: string;
  className?: string;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, { margin: 1, width: 320 }).then(
      (url) => {
        if (!cancelled) setDataUrl(url);
      },
      () => {
        if (!cancelled) setDataUrl(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [value]);
  if (dataUrl === null) return null;
  return (
    <img
      src={dataUrl}
      alt={alt}
      className={cn(
        "size-32 rounded-md border border-border bg-white p-1.5",
        className,
      )}
    />
  );
}


function QuietCopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    },
    [],
  );
  const copy = useCallback(() => {
    void experimental_copyToClipboard({ text }).then((written) => {
      if (!written) return;
      setCopied(true);
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 1500);
    });
  }, [text]);
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="text-muted-foreground"
      onClick={copy}
      aria-label={label}
    >
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}


function formatCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function useCountdown(expiresAt: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (expiresAt === null) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);
  return expiresAt === null ? null : expiresAt - now;
}


export function MobilePairingCard({
  payload,
  dashboardHost,
  minting,
  onRenew,
}: {
  payload: MobilePairingPayload;
  dashboardHost: string;
  minting: boolean;
  onRenew: () => void;
}) {
  const remainingMs = useCountdown(payload.expiresAt);
  const expired = remainingMs !== null && remainingMs <= 0;
  const qrText = encodeMobilePairingPayload(payload);
  return (
    <div className="@container/connect-pairing min-w-0">
      <div className="flex flex-col gap-3 rounded-md border border-border bg-surface-recessed/50 px-3 py-3 @min-[32rem]/connect-pairing:flex-row @min-[32rem]/connect-pairing:items-start">
        <div
          className={cn(
            "shrink-0 self-center @min-[32rem]/connect-pairing:self-start",
            expired && "opacity-40 saturate-0",
          )}
        >
          <QrCodeImage
            value={qrText}
            alt="QR code to pair the bb mobile app"
            className="size-40"
          />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm">
            {expired
              ? "Generate a new code, then scan it or enter it in the bb mobile app."
              : "Scan this with the bb mobile app, or enter the code by hand."}
          </p>
          <div className="flex max-w-xs items-center gap-1 rounded-lg border border-border bg-surface-recessed py-1 pl-3.5 pr-1">
            <span
              className={cn(
                "min-w-0 flex-1 truncate font-mono text-sm font-medium tracking-widest",
                expired
                  ? "text-muted-foreground line-through"
                  : "text-foreground",
              )}
              aria-label="Mobile pairing code"
            >
              {payload.code}
            </span>
            {expired ? null : (
              <QuietCopyButton text={payload.code} label="Copy pairing code" />
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-subtle-foreground">
            {expired ? (
              <>
                <span>Code expired</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  disabled={minting}
                  onClick={onRenew}
                >
                  {minting ? (
                    <Icon name="Spinner" className="size-4 animate-spin" />
                  ) : null}
                  Generate a new code
                </Button>
              </>
            ) : remainingMs !== null ? (
              <span className="tabular-nums">
                Code expires in {formatCountdown(remainingMs)}
              </span>
            ) : null}
          </div>
          <p className="text-xs text-subtle-foreground/75">
            {expired ? "Each new code works once." : "This code works once."}{" "}
            You can revoke your phone’s access from the {dashboardHost}{" "}
            dashboard.
          </p>
        </div>
      </div>
    </div>
  );
}

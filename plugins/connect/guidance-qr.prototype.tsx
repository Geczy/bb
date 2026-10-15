import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function ThreadQrCode({ url }: { url: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void QRCode.toDataURL(url, { margin: 2, width: 384 }).then(value => {
      if (active) setDataUrl(value);
    });
    return () => { active = false; };
  }, [url]);
  return dataUrl ? <img src={dataUrl} alt="Scan to open Release summary on your phone" className="mx-auto size-40 rounded-md" /> : <div className="mx-auto size-40" />;
}

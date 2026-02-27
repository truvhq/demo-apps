import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { IconLoader2, IconQrcode } from "@tabler/icons-react";

interface QrCodeScreenProps {
  shareUrl: string | null;
  onCreateOrder: () => void;
  loading: boolean;
}

export function QrCodeScreen({ shareUrl, onCreateOrder, loading }: QrCodeScreenProps) {
  if (!shareUrl) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12">
        <IconQrcode size={64} className="text-muted-foreground/50" />
        <p className="text-muted-foreground text-center max-w-sm">
          Create an order to generate a QR code. The applicant will scan it
          with their phone to complete income verification.
        </p>
        <Button onClick={onCreateOrder} disabled={loading}>
          {loading && <IconLoader2 size={16} className="mr-2 animate-spin" />}
          Generate QR Code
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6 py-8">
      <div>
        <h2 className="text-xl font-semibold text-center">Scan to Verify</h2>
        <p className="text-sm text-muted-foreground mt-1 text-center max-w-sm">
          Ask the applicant to scan this QR code with their phone camera
          to begin income verification.
        </p>
      </div>

      <div className="rounded-xl border-2 border-dashed p-8 bg-white">
        <QRCodeSVG value={shareUrl} size={240} level="M" />
      </div>

      <div className="rounded-lg border bg-muted/30 px-4 py-3 max-w-sm">
        <p className="text-xs text-muted-foreground break-all">
          <strong>Share URL:</strong> {shareUrl}
        </p>
      </div>
    </div>
  );
}

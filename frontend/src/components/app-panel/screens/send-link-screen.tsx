import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { IconLoader2, IconSend, IconMail, IconMessage, IconCircleCheck } from "@tabler/icons-react";

interface SendLinkScreenProps {
  shareUrl: string | null;
  onCreateOrder: () => void;
  formData: Record<string, string>;
  loading: boolean;
}

export function SendLinkScreen({ shareUrl, onCreateOrder, formData, loading }: SendLinkScreenProps) {
  const [sent, setSent] = useState<"sms" | "email" | null>(null);
  const [method, setMethod] = useState<"sms" | "email">("sms");

  if (!shareUrl) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12">
        <IconSend size={64} className="text-muted-foreground/50" />
        <p className="text-muted-foreground text-center max-w-sm">
          Create an order to get a share URL that can be sent to the applicant
          via SMS or email.
        </p>
        <Button onClick={onCreateOrder} disabled={loading}>
          {loading && <IconLoader2 size={16} className="mr-2 animate-spin" />}
          Create Order
        </Button>
      </div>
    );
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12">
        <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
          <IconCircleCheck size={32} className="text-green-600" />
        </div>
        <h3 className="font-semibold text-lg">Link Sent!</h3>
        <p className="text-sm text-muted-foreground text-center max-w-sm">
          The verification link has been sent via {sent === "sms" ? "SMS" : "email"} to{" "}
          {sent === "sms" ? formData.phone || "+15551234567" : formData.email || "john@example.com"}.
          Proceed to the next step to monitor progress.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Send Verification Link</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Choose how to send the verification link to the applicant.
        </p>
      </div>

      <div className="flex gap-2">
        <Button
          variant={method === "sms" ? "default" : "outline"}
          size="sm"
          onClick={() => setMethod("sms")}
        >
          <IconMessage size={16} className="mr-1" />
          SMS
        </Button>
        <Button
          variant={method === "email" ? "default" : "outline"}
          size="sm"
          onClick={() => setMethod("email")}
        >
          <IconMail size={16} className="mr-1" />
          Email
        </Button>
      </div>

      <Card>
        <CardContent className="pt-4 space-y-4">
          {method === "sms" ? (
            <div className="space-y-2">
              <Label htmlFor="sms-to">Phone Number</Label>
              <Input
                id="sms-to"
                value={formData.phone || "+15551234567"}
                readOnly
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="email-to">Email Address</Label>
              <Input
                id="email-to"
                value={formData.email || "john@example.com"}
                readOnly
              />
            </div>
          )}

          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground mb-1 font-medium">Verification Link</p>
            <p className="text-xs break-all font-mono">{shareUrl}</p>
          </div>

          <Button className="w-full" onClick={() => setSent(method)}>
            <IconSend size={16} className="mr-2" />
            Send via {method === "sms" ? "SMS" : "Email"}
            <Badge variant="secondary" className="ml-2 text-[10px]">Demo</Badge>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

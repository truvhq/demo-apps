import { IconCircleCheck } from "@tabler/icons-react";

interface ConfirmationScreenProps {
  orderId: string | null;
  demoId: string;
}

export function ConfirmationScreen({ orderId, demoId }: ConfirmationScreenProps) {
  const refNumber = orderId
    ? `REF-${orderId.slice(0, 8).toUpperCase()}`
    : "REF-PENDING";

  const titles: Record<string, string> = {
    // Customer Portal
    "cp-apply-complete": "Application Submitted",
    "cp-household-followup": "Household Verification Complete",
    "cp-incomplete": "Reminder Scheduled",
    "cp-partial-employer": "Partial Verification Recorded",
    "cp-pending-household": "Primary Complete — Awaiting Household",
    "cp-state-comms": "Order Created — Link Sent",
    "cp-renewal": "Recertification Complete",
    "cp-renewal-reauth": "Re-Authentication Complete",
    // Case Worker Portal
    "cw-review-complete": "Case Decision Recorded",
    "cw-partial-complete": "Follow-Up Sent",
    "cw-trigger-verification": "Verification Triggered",
    "cw-renewal": "Renewal Decision Recorded",
    "cw-renewal-reauth": "Re-Auth Triggered",
    // Contact Center
    "cc-send-link": "Verification Retrieved",
    "cc-incomplete": "Follow-Up Scheduled",
    // In Person
    "ip-qr-code": "Verification Complete",
    "ip-email-sms": "Verification Complete",
    // Setup
    templates: "Template Saved",
  };

  return (
    <div className="flex flex-col items-center justify-center gap-6 py-12">
      <div className="h-20 w-20 rounded-full bg-green-100 flex items-center justify-center">
        <IconCircleCheck size={40} className="text-green-600" />
      </div>

      <div className="text-center space-y-2">
        <h2 className="text-2xl font-semibold">
          {titles[demoId] || "Complete"}
        </h2>
        <p className="text-muted-foreground max-w-md">
          Income verification data has been successfully retrieved and processed.
          The applicant&apos;s information has been verified against their employer records.
        </p>
      </div>

      <div className="rounded-lg border bg-muted/30 px-6 py-4 text-center">
        <p className="text-sm text-muted-foreground">Reference Number</p>
        <p className="text-lg font-mono font-semibold mt-1">{refNumber}</p>
      </div>
    </div>
  );
}

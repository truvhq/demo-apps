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
    "new-applicant": "Application Submitted",
    "returning-user": "Recertification Complete",
    caseworker: "Case Decision Recorded",
    "contact-center": "Verification Retrieved",
    "in-person": "Verification Complete",
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

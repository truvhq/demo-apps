import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { IconChevronLeft, IconChevronRight, IconDownload } from "@tabler/icons-react";

interface BottomNavProps {
  demoId: string;
  currentStep: number;
  totalSteps: number;
  canProceed?: boolean;
}

export function BottomNav({ demoId, currentStep, totalSteps, canProceed = true }: BottomNavProps) {
  const isFirst = currentStep === 0;
  const isLast = currentStep === totalSteps - 1;

  return (
    <div className="flex items-center justify-between px-6 py-3 border-t bg-background">
      <div className="flex items-center gap-2">
        {!isFirst && (
          <Button variant="outline" size="sm" asChild>
            <Link to={`/demos/${demoId}/${currentStep - 1}`}>
              <IconChevronLeft size={16} />
              Back
            </Link>
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <PostmanBadge />
        {!isLast && (
          <Button size="sm" asChild disabled={!canProceed}>
            <Link to={`/demos/${demoId}/${currentStep + 1}`}>
              Next
              <IconChevronRight size={16} />
            </Link>
          </Button>
        )}
        {isLast && (
          <Button size="sm" asChild>
            <Link to="/">
              Finish
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}

function PostmanBadge() {
  return (
    <Button variant="ghost" size="sm" asChild className="text-muted-foreground">
      <a href="/postman/truv-public-sector.postman_collection.json" download>
        <IconDownload size={14} />
        Postman
      </a>
    </Button>
  );
}

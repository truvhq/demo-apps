import { Link } from "react-router";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { IconCheck, IconChevronLeft, IconChevronRight } from "@tabler/icons-react";

interface StepNavProps {
  steps: { title: string }[];
  currentStep: number;
  demoId: string;
}

export function StepNav({ steps, currentStep, demoId }: StepNavProps) {
  const isFirst = currentStep === 0;
  const isLast = currentStep === steps.length - 1;

  return (
    <nav className="flex items-center justify-between px-6 py-3 border-b bg-muted/30">
      <div className="flex items-center gap-2">
        {steps.map((step, i) => {
          const isCompleted = i < currentStep;
          const isCurrent = i === currentStep;

          return (
            <div key={i} className="flex items-center gap-2">
              {i > 0 && (
                <div
                  className={cn(
                    "h-px w-8",
                    isCompleted ? "bg-primary" : "bg-border"
                  )}
                />
              )}
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium transition-colors",
                    isCompleted && "bg-primary text-primary-foreground",
                    isCurrent && "bg-primary text-primary-foreground",
                    !isCompleted && !isCurrent && "bg-muted text-muted-foreground border"
                  )}
                >
                  {isCompleted ? <IconCheck size={14} /> : i + 1}
                </div>
                <span
                  className={cn(
                    "text-sm",
                    isCurrent ? "font-medium text-foreground" : "text-muted-foreground"
                  )}
                >
                  {step.title}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link to={isFirst ? "/" : `/demos/${demoId}/${currentStep - 1}`}>
            <IconChevronLeft size={16} />
            Back
          </Link>
        </Button>
        {!isLast && (
          <Button size="sm" asChild>
            <Link to={`/demos/${demoId}/${currentStep + 1}`}>
              Next
              <IconChevronRight size={16} />
            </Link>
          </Button>
        )}
        {isLast && (
          <Button size="sm" asChild>
            <Link to="/">Finish</Link>
          </Button>
        )}
      </div>
    </nav>
  );
}

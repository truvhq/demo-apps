import { cn } from "@/lib/utils";
import { IconCheck } from "@tabler/icons-react";

interface StepNavProps {
  steps: { title: string }[];
  currentStep: number;
}

export function StepNav({ steps, currentStep }: StepNavProps) {
  return (
    <nav className="flex items-center gap-2 px-6 py-3 border-b bg-muted/30">
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
    </nav>
  );
}

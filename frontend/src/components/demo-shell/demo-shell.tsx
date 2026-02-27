import type { ReactNode } from "react";
import type { DemoConfig } from "@/lib/types";
import { StepNav } from "./step-nav";

interface DemoShellProps {
  demo: DemoConfig;
  currentStep: number;
  leftPanel: ReactNode;
  rightPanel: ReactNode;
}

export function DemoShell({ demo, currentStep, leftPanel, rightPanel }: DemoShellProps) {
  return (
    <div className="flex h-screen flex-col">
      <StepNav steps={demo.steps} currentStep={currentStep} demoId={demo.id} />

      <div className="flex flex-1 min-h-0">
        {/* Left panel — App demo */}
        <div className="flex w-[70%] flex-col border-r">
          {leftPanel}
        </div>

        {/* Right panel — API calls / webhooks / docs */}
        <div className="flex w-[30%] flex-col">
          {rightPanel}
        </div>
      </div>
    </div>
  );
}

import type { ReactNode } from "react";
import { IconWorld, IconLock } from "@tabler/icons-react";

interface BrowserFrameProps {
  url: string;
  children: ReactNode;
}

export function BrowserFrame({ url, children }: BrowserFrameProps) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Browser chrome */}
      <div className="flex items-center gap-2 border-b bg-muted/50 px-4 py-2">
        {/* Traffic lights */}
        <div className="flex gap-1.5">
          <div className="h-3 w-3 rounded-full bg-red-400" />
          <div className="h-3 w-3 rounded-full bg-yellow-400" />
          <div className="h-3 w-3 rounded-full bg-green-400" />
        </div>
        {/* Address bar */}
        <div className="flex flex-1 items-center gap-2 rounded-md bg-background px-3 py-1.5 text-sm text-muted-foreground border">
          <IconLock size={12} />
          <IconWorld size={12} />
          <span className="truncate">{url}</span>
        </div>
      </div>

      {/* Page content */}
      <div className="flex flex-1 flex-col min-h-0 overflow-auto bg-background">
        {children}
      </div>
    </div>
  );
}

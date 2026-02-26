import { useState } from "react";
import { Button } from "@/components/ui/button";
import { IconChevronDown, IconChevronRight, IconCopy, IconCheck } from "@tabler/icons-react";

interface JsonViewerProps {
  data: unknown;
  collapsed?: boolean;
}

export function JsonViewer({ data, collapsed = true }: JsonViewerProps) {
  const [expanded, setExpanded] = useState(!collapsed);
  const [copied, setCopied] = useState(false);

  const json = JSON.stringify(data, null, 2);

  function handleCopy() {
    navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!data) return null;

  return (
    <div className="relative">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {expanded ? (
            <IconChevronDown size={12} />
          ) : (
            <IconChevronRight size={12} />
          )}
          {expanded ? "Collapse" : "Expand"}
        </button>
        <Button size="sm" variant="ghost" className="h-6 px-2" onClick={handleCopy}>
          {copied ? (
            <IconCheck size={12} className="text-green-600" />
          ) : (
            <IconCopy size={12} />
          )}
        </Button>
      </div>
      {expanded && (
        <pre className="mt-1 text-[11px] leading-relaxed bg-muted/50 rounded-md p-3 overflow-auto max-h-64 font-mono">
          {json}
        </pre>
      )}
    </div>
  );
}

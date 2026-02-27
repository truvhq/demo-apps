import { useState, type ReactNode } from "react";
import { IconChevronDown, IconChevronRight, IconCopy, IconCheck } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";

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
          <SyntaxHighlight value={data} />
        </pre>
      )}
    </div>
  );
}

/** Compact inline JSON with syntax highlighting — for bridge events etc. */
export function JsonBlock({ data }: { data: unknown }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="relative group">
      <Button
        size="sm"
        variant="ghost"
        className="absolute top-1.5 right-1.5 h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={handleCopy}
      >
        {copied ? (
          <IconCheck size={10} className="text-green-600" />
        ) : (
          <IconCopy size={10} />
        )}
      </Button>
      <pre className="text-[10px] leading-relaxed font-mono bg-muted/50 rounded p-2 overflow-x-auto whitespace-pre-wrap">
        <SyntaxHighlight value={data} />
      </pre>
    </div>
  );
}

function SyntaxHighlight({ value, indent = 0 }: { value: unknown; indent?: number }) {
  const pad = "  ".repeat(indent);
  const padInner = "  ".repeat(indent + 1);

  if (value === null) {
    return <span className="text-orange-500">null</span>;
  }
  if (typeof value === "boolean") {
    return <span className="text-orange-500">{String(value)}</span>;
  }
  if (typeof value === "number") {
    return <span className="text-blue-600">{String(value)}</span>;
  }
  if (typeof value === "string") {
    // Truncate very long strings
    const display = value.length > 200 ? value.slice(0, 200) + "…" : value;
    return <span className="text-green-700">"{display}"</span>;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return <>{"[]"}</>;
    const items: ReactNode[] = [];
    value.forEach((item, i) => {
      items.push(
        <span key={i}>
          {padInner}
          <SyntaxHighlight value={item} indent={indent + 1} />
          {i < value.length - 1 ? "," : ""}
          {"\n"}
        </span>
      );
    });
    return (
      <>
        {"[\n"}
        {items}
        {pad}]
      </>
    );
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return <>{"{}"}</>;
    const items: ReactNode[] = [];
    entries.forEach(([key, val], i) => {
      items.push(
        <span key={key}>
          {padInner}
          <span className="text-purple-600">"{key}"</span>
          {": "}
          <SyntaxHighlight value={val} indent={indent + 1} />
          {i < entries.length - 1 ? "," : ""}
          {"\n"}
        </span>
      );
    });
    return (
      <>
        {"{\n"}
        {items}
        {pad}
        {"}"}
      </>
    );
  }

  return <>{String(value)}</>;
}

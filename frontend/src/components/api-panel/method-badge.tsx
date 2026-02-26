import { Badge } from "@/components/ui/badge";

const methodColors: Record<string, string> = {
  GET: "bg-blue-100 text-blue-700 border-blue-200",
  POST: "bg-green-100 text-green-700 border-green-200",
  PUT: "bg-yellow-100 text-yellow-700 border-yellow-200",
  DELETE: "bg-red-100 text-red-700 border-red-200",
  WEBHOOK: "bg-purple-100 text-purple-700 border-purple-200",
};

export function MethodBadge({ method }: { method: string }) {
  const upper = method.toUpperCase();
  return (
    <Badge variant="outline" className={`text-[10px] font-mono ${methodColors[upper] || ""}`}>
      {upper}
    </Badge>
  );
}

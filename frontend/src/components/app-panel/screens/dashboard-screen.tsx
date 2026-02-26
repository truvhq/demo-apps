import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IconEye } from "@tabler/icons-react";

interface DashboardScreenProps {
  onSelectCase: () => void;
}

const mockCases = [
  { id: "CASE-001", name: "Jane Smith", status: "pending_review", date: "2024-01-15" },
  { id: "CASE-002", name: "Robert Johnson", status: "verified", date: "2024-01-14" },
  { id: "CASE-003", name: "Maria Garcia", status: "in_progress", date: "2024-01-13" },
  { id: "CASE-004", name: "David Lee", status: "pending_review", date: "2024-01-12" },
  { id: "CASE-005", name: "Sarah Wilson", status: "verified", date: "2024-01-11" },
];

const statusColors: Record<string, "default" | "secondary" | "outline"> = {
  verified: "default",
  pending_review: "secondary",
  in_progress: "outline",
};

export function DashboardScreen({ onSelectCase }: DashboardScreenProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Case Queue</h2>
        <Badge variant="secondary">{mockCases.length} cases</Badge>
      </div>

      <div className="space-y-2">
        {mockCases.map((c) => (
          <Card key={c.id} className="cursor-pointer hover:border-primary/50 transition-colors">
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">{c.name}</CardTitle>
                <Badge variant={statusColors[c.status] || "secondary"} className="text-xs">
                  {c.status.replace(/_/g, " ")}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pb-4 px-4 pt-0">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{c.id}</span>
                <div className="flex items-center gap-2">
                  <span>{c.date}</span>
                  <Button size="sm" variant="ghost" className="h-7 px-2" onClick={onSelectCase}>
                    <IconEye size={14} className="mr-1" />
                    View
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

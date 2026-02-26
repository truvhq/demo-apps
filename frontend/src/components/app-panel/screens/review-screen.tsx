import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IconLoader2, IconRefresh } from "@tabler/icons-react";
import type { OrderResponse } from "@/lib/types";

interface ReviewScreenProps {
  orderData: OrderResponse | null;
  onRefresh: () => void;
  loading: boolean;
}

export function ReviewScreen({ orderData, onRefresh, loading }: ReviewScreenProps) {
  if (!orderData && !loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12">
        <p className="text-muted-foreground">No order data available yet.</p>
        <Button onClick={onRefresh} variant="outline">
          <IconRefresh size={16} className="mr-2" />
          Fetch Order Data
        </Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <IconLoader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  const raw = orderData?.raw_response || {};
  const employer = (raw as Record<string, unknown>).employer as Record<string, unknown> | undefined;
  const income = (raw as Record<string, unknown>).income as Record<string, unknown> | undefined;
  const consumer = (raw as Record<string, unknown>).consumer as Record<string, unknown> | undefined;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Verified Data Review</h2>
        <div className="flex items-center gap-2">
          <Badge variant={orderData?.status === "completed" ? "default" : "secondary"}>
            {orderData?.status || "unknown"}
          </Badge>
          <Button size="sm" variant="outline" onClick={onRefresh} disabled={loading}>
            <IconRefresh size={14} className="mr-1" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-4">
        {consumer && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Consumer</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                {Object.entries(consumer).map(([key, value]) => (
                  <div key={key}>
                    <dt className="text-muted-foreground">{key.replace(/_/g, " ")}</dt>
                    <dd className="font-medium">{String(value ?? "—")}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        )}

        {employer && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Employer</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                {Object.entries(employer).map(([key, value]) =>
                  typeof value !== "object" ? (
                    <div key={key}>
                      <dt className="text-muted-foreground">{key.replace(/_/g, " ")}</dt>
                      <dd className="font-medium">{String(value ?? "—")}</dd>
                    </div>
                  ) : null
                )}
              </dl>
            </CardContent>
          </Card>
        )}

        {income && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Income</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                {Object.entries(income).map(([key, value]) =>
                  typeof value !== "object" ? (
                    <div key={key}>
                      <dt className="text-muted-foreground">{key.replace(/_/g, " ")}</dt>
                      <dd className="font-medium">{String(value ?? "—")}</dd>
                    </div>
                  ) : null
                )}
              </dl>
            </CardContent>
          </Card>
        )}

        {!consumer && !employer && !income && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Order Response</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-80">
                {JSON.stringify(raw, null, 2)}
              </pre>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

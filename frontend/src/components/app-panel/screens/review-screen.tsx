import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IconLoader2, IconRefresh } from "@tabler/icons-react";
import { JsonViewer } from "@/components/api-panel/json-viewer";
import { getOrderCertifications } from "@/lib/api";
import type { OrderResponse } from "@/lib/types";

interface ReviewScreenProps {
  orderData: OrderResponse | null;
  orderId: string | null;
  onRefresh: () => void;
  loading: boolean;
}

export function ReviewScreen({ orderData, orderId, onRefresh, loading }: ReviewScreenProps) {
  const [certifications, setCertifications] = useState<Record<string, unknown> | null>(null);
  const [certLoading, setCertLoading] = useState(false);

  useEffect(() => {
    if (!orderId) return;
    setCertLoading(true);
    getOrderCertifications(orderId)
      .then(setCertifications)
      .catch(() => {})
      .finally(() => setCertLoading(false));
  }, [orderId]);

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

  if (loading && !orderData) {
    return (
      <div className="flex items-center justify-center py-12">
        <IconLoader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  const raw = orderData?.raw_response || {};

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Review Data</h2>
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

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            GET /v1/orders/{orderData?.truv_order_id}/
          </CardTitle>
        </CardHeader>
        <CardContent>
          <JsonViewer data={raw} collapsed={false} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">
              GET /v1/orders/{orderData?.truv_order_id}/certifications/
            </CardTitle>
            {certLoading && <IconLoader2 size={14} className="animate-spin text-muted-foreground" />}
          </div>
        </CardHeader>
        <CardContent>
          {certifications ? (
            <JsonViewer data={certifications} collapsed={false} />
          ) : certLoading ? (
            <p className="text-xs text-muted-foreground">Loading certifications...</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              No certifications data available. The order may still be processing.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

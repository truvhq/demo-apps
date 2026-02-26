import { Link } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  IconUserPlus,
  IconRefresh,
  IconLayoutDashboard,
  IconPhone,
  IconQrcode,
  IconPalette,
  IconArrowRight,
} from "@tabler/icons-react";
import { demos } from "@/config/demos";

const iconMap: Record<string, React.ReactNode> = {
  UserPlus: <IconUserPlus size={24} />,
  RefreshCw: <IconRefresh size={24} />,
  LayoutDashboard: <IconLayoutDashboard size={24} />,
  Phone: <IconPhone size={24} />,
  QrCode: <IconQrcode size={24} />,
  Palette: <IconPalette size={24} />,
};

export function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-6 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold tracking-tight">
            Truv Interactive Demo
          </h1>
          <p className="text-lg text-muted-foreground mt-3 max-w-2xl mx-auto">
            Explore how Truv embedded orders work for public sector clients.
            Each demo shows real API calls, webhooks, and integration patterns.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {demos.map((demo) => (
            <Link key={demo.id} to={`/demos/${demo.id}`}>
              <Card className="h-full transition-all hover:border-primary/50 hover:shadow-md cursor-pointer group">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                      {iconMap[demo.icon]}
                    </div>
                    <Badge variant="secondary" className="text-[10px]">
                      {demo.category}
                    </Badge>
                  </div>
                  <CardTitle className="text-base">{demo.title}</CardTitle>
                  <p className="text-xs text-muted-foreground">{demo.subtitle}</p>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {demo.description}
                  </p>
                  <div className="flex items-center gap-1 mt-4 text-sm text-primary font-medium group-hover:gap-2 transition-all">
                    Start demo
                    <IconArrowRight size={16} />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

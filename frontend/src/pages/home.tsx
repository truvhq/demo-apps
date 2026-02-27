import { Link } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  IconUserPlus,
  IconUsers,
  IconUserX,
  IconBriefcase,
  IconClock,
  IconLink,
  IconRefresh,
  IconAlertTriangle,
  IconLayoutDashboard,
  IconClipboardCheck,
  IconSend,
  IconPhone,
  IconPhoneOff,
  IconQrcode,
  IconMail,
  IconSettings,
  IconArrowRight,
} from "@tabler/icons-react";
import { demos, getDemosBySection } from "@/config/demos";
import type { DemoConfig, DemoSection } from "@/lib/types";

const iconMap: Record<string, React.ReactNode> = {
  UserPlus: <IconUserPlus size={24} />,
  Users: <IconUsers size={24} />,
  UserX: <IconUserX size={24} />,
  Briefcase: <IconBriefcase size={24} />,
  Clock: <IconClock size={24} />,
  Link: <IconLink size={24} />,
  RefreshCw: <IconRefresh size={24} />,
  AlertTriangle: <IconAlertTriangle size={24} />,
  LayoutDashboard: <IconLayoutDashboard size={24} />,
  ClipboardCheck: <IconClipboardCheck size={24} />,
  Send: <IconSend size={24} />,
  Phone: <IconPhone size={24} />,
  PhoneOff: <IconPhoneOff size={24} />,
  QrCode: <IconQrcode size={24} />,
  Mail: <IconMail size={24} />,
  Settings: <IconSettings size={24} />,
};

const sections: { key: DemoSection; title: string; description: string }[] = [
  {
    key: "customer-portal",
    title: "Customer Portal",
    description: "Applicants apply online and complete income verification through the self-service portal.",
  },
  {
    key: "caseworker-portal",
    title: "Case Worker Portal",
    description: "Caseworkers review verified data, manage cases, and trigger verifications from an admin dashboard.",
  },
  {
    key: "contact-center",
    title: "Contact Center",
    description: "Agents send verification links via SMS/email while applicants are on the phone.",
  },
  {
    key: "in-person",
    title: "In Person",
    description: "During office visits, applicants verify income via QR code or email/SMS link.",
  },
];

function ScenarioBadge({ type }: { type: string }) {
  if (type === "happy-path") {
    return (
      <Badge variant="secondary" className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
        Happy Path
      </Badge>
    );
  }
  if (type === "edge-case") {
    return (
      <Badge variant="secondary" className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400">
        Edge Case
      </Badge>
    );
  }
  return null;
}

function DemoCard({ demo }: { demo: DemoConfig }) {
  return (
    <Link to={`/demos/${demo.id}`}>
      <Card className="h-full transition-all hover:border-primary/50 hover:shadow-md cursor-pointer group">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between mb-2">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              {iconMap[demo.icon]}
            </div>
            <ScenarioBadge type={demo.scenarioType} />
          </div>
          <CardTitle className="text-base">{demo.title}</CardTitle>
          <p className="text-xs text-muted-foreground">{demo.subtitle}</p>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
            {demo.description}
          </p>
          <div className="flex items-center gap-1 mt-4 text-sm text-primary font-medium group-hover:gap-2 transition-all">
            Start demo
            <IconArrowRight size={16} />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function SectionGroup({ section }: { section: { key: DemoSection; title: string; description: string } }) {
  const sectionDemos = getDemosBySection(section.key);
  if (sectionDemos.length === 0) return null;

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-2xl font-semibold tracking-tight">{section.title}</h2>
        <p className="text-sm text-muted-foreground mt-1">{section.description}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {sectionDemos.map((demo) => (
          <DemoCard key={demo.id} demo={demo} />
        ))}
      </div>
    </div>
  );
}

export function HomePage() {
  const configDemo = demos.find((d) => d.section === "setup");

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-6 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold tracking-tight">
            Truv Interactive Demo
          </h1>
          <p className="text-lg text-muted-foreground mt-3 max-w-2xl mx-auto">
            Explore how Truv embedded orders work for public sector clients.
            Each demo shows real API calls, webhooks, and integration patterns.
          </p>
        </div>

        {configDemo && (
          <div className="mb-10">
            <Link to={`/demos/${configDemo.id}`}>
              <Card className="transition-all hover:border-primary/50 hover:shadow-md cursor-pointer group border-dashed">
                <CardContent className="flex items-center gap-4 py-4">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                    {iconMap[configDemo.icon]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{configDemo.title}</p>
                    <p className="text-sm text-muted-foreground">{configDemo.subtitle}</p>
                  </div>
                  <div className="flex items-center gap-1 text-sm text-primary font-medium group-hover:gap-2 transition-all shrink-0">
                    Set up
                    <IconArrowRight size={16} />
                  </div>
                </CardContent>
              </Card>
            </Link>
          </div>
        )}

        <div className="space-y-12">
          {sections.map((section) => (
            <SectionGroup key={section.key} section={section} />
          ))}
        </div>
      </div>
    </div>
  );
}

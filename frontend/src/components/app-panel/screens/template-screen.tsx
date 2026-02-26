import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

interface TemplateScreenProps {
  section: string;
}

export function TemplateScreen({ section }: TemplateScreenProps) {
  const [config, setConfig] = useState({
    product_type: "income",
    company_name: "State Benefits Agency",
    background_color: "#FFFFFF",
    button_color: "#2563EB",
    accent_color: "#1E40AF",
    search_header: "Find your employer",
    landing_initial_title: "Verify Your Income",
    landing_initial_body: "Connect your employer to verify your income securely.",
    landing_success_title: "Verification Complete",
    landing_success_body: "Your income has been verified. You may close this window.",
    sms_text: "Hi {first_name}, please verify your income: {link}",
    email_subject: "Income Verification Required",
  });

  function update(key: string, value: string) {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }

  switch (section) {
    case "product":
      return (
        <div className="mx-auto max-w-md space-y-6">
          <div>
            <h2 className="text-xl font-semibold">Select Product Type</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Choose which product type this template applies to.
            </p>
          </div>
          <div className="grid gap-3">
            {["income", "employment", "assets"].map((pt) => (
              <Card
                key={pt}
                className={`cursor-pointer transition-colors ${config.product_type === pt ? "border-primary" : "hover:border-primary/50"}`}
                onClick={() => update("product_type", pt)}
              >
                <CardContent className="py-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium capitalize">{pt} Verification</p>
                    <p className="text-xs text-muted-foreground">
                      {pt === "income" && "VOIE — Verify income and employment"}
                      {pt === "employment" && "VOE — Verify employment history"}
                      {pt === "assets" && "VOA — Verify bank account assets"}
                    </p>
                  </div>
                  {config.product_type === pt && (
                    <Badge>Selected</Badge>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      );

    case "branding":
      return (
        <div className="mx-auto max-w-md space-y-6">
          <div>
            <h2 className="text-xl font-semibold">Configure Branding</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Set company name, colors, and visual identity.
            </p>
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Company Name</Label>
              <Input value={config.company_name} onChange={(e) => update("company_name", e.target.value)} />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Background</Label>
                <div className="flex gap-2 items-center">
                  <input type="color" value={config.background_color} onChange={(e) => update("background_color", e.target.value)} className="h-8 w-8 rounded border cursor-pointer" />
                  <Input value={config.background_color} onChange={(e) => update("background_color", e.target.value)} className="text-xs" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Button</Label>
                <div className="flex gap-2 items-center">
                  <input type="color" value={config.button_color} onChange={(e) => update("button_color", e.target.value)} className="h-8 w-8 rounded border cursor-pointer" />
                  <Input value={config.button_color} onChange={(e) => update("button_color", e.target.value)} className="text-xs" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Accent</Label>
                <div className="flex gap-2 items-center">
                  <input type="color" value={config.accent_color} onChange={(e) => update("accent_color", e.target.value)} className="h-8 w-8 rounded border cursor-pointer" />
                  <Input value={config.accent_color} onChange={(e) => update("accent_color", e.target.value)} className="text-xs" />
                </div>
              </div>
            </div>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Preview</CardTitle></CardHeader>
              <CardContent>
                <div className="rounded-lg p-6 text-center" style={{ backgroundColor: config.background_color }}>
                  <p className="font-semibold mb-3">{config.company_name}</p>
                  <button className="px-4 py-2 rounded-md text-white text-sm" style={{ backgroundColor: config.button_color }}>
                    Continue
                  </button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      );

    case "search":
      return (
        <div className="mx-auto max-w-md space-y-6">
          <div>
            <h2 className="text-xl font-semibold">Customize Search</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Configure the employer search experience in the Bridge widget.
            </p>
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Search Header Text</Label>
              <Input value={config.search_header} onChange={(e) => update("search_header", e.target.value)} />
            </div>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Search Preview</CardTitle></CardHeader>
              <CardContent>
                <div className="rounded-lg border p-4 bg-white">
                  <p className="font-medium text-sm mb-3">{config.search_header}</p>
                  <div className="rounded-md border px-3 py-2 text-sm text-muted-foreground">
                    Search for your employer...
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      );

    case "landing":
      return (
        <div className="mx-auto max-w-md space-y-6">
          <div>
            <h2 className="text-xl font-semibold">Landing Pages</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Configure the landing page content shown when applicants open the share URL.
            </p>
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Initial Page Title</Label>
              <Input value={config.landing_initial_title} onChange={(e) => update("landing_initial_title", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Initial Page Body</Label>
              <Textarea value={config.landing_initial_body} onChange={(e) => update("landing_initial_body", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>SMS Text</Label>
              <Textarea value={config.sms_text} onChange={(e) => update("sms_text", e.target.value)} />
              <p className="text-xs text-muted-foreground">
                Variables: <code>{"{first_name}"}</code>, <code>{"{my_company_name}"}</code>, <code>{"{link}"}</code>
              </p>
            </div>
          </div>
        </div>
      );

    case "preview":
      return (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold">Template Preview</h2>
            <p className="text-sm text-muted-foreground mt-1">
              See how your template configuration looks in the Bridge widget.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">Default</CardTitle></CardHeader>
              <CardContent>
                <div className="rounded-lg border p-6 bg-white text-center space-y-3">
                  <p className="font-semibold text-sm">Truv</p>
                  <p className="text-xs text-muted-foreground">Find your employer</p>
                  <div className="rounded-md border px-3 py-2 text-xs text-muted-foreground">Search...</div>
                  <button className="px-4 py-1.5 rounded-md bg-blue-600 text-white text-xs">Continue</button>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Your Template</CardTitle></CardHeader>
              <CardContent>
                <div className="rounded-lg border p-6 text-center space-y-3" style={{ backgroundColor: config.background_color }}>
                  <p className="font-semibold text-sm">{config.company_name}</p>
                  <p className="text-xs text-muted-foreground">{config.search_header}</p>
                  <div className="rounded-md border px-3 py-2 text-xs text-muted-foreground bg-white">Search...</div>
                  <button className="px-4 py-1.5 rounded-md text-white text-xs" style={{ backgroundColor: config.button_color }}>Continue</button>
                </div>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader><CardTitle className="text-sm">Template Configuration JSON</CardTitle></CardHeader>
            <CardContent>
              <pre className="text-xs bg-muted p-3 rounded-md overflow-auto">
                {JSON.stringify(config, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </div>
      );

    default:
      return <div className="text-muted-foreground">Unknown template section</div>;
  }
}

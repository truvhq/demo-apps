import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface FormScreenProps {
  formData: Record<string, string>;
  onChange: (data: Record<string, string>) => void;
  prefilled?: boolean;
}

const defaultValues: Record<string, string> = {
  first_name: "John",
  last_name: "Doe",
  ssn: "991-91-9991",
  email: "john.doe@example.com",
  phone: "+15551234567",
};

export function FormScreen({ formData, onChange, prefilled }: FormScreenProps) {
  const values = prefilled
    ? { ...defaultValues, ...formData }
    : formData;

  function handleChange(field: string, value: string) {
    onChange({ [field]: value });
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Applicant Information</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Enter the applicant&apos;s details to begin income verification.
        </p>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="first_name">First Name</Label>
            <Input
              id="first_name"
              placeholder="John"
              value={values.first_name || ""}
              onChange={(e) => handleChange("first_name", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="last_name">Last Name</Label>
            <Input
              id="last_name"
              placeholder="Doe"
              value={values.last_name || ""}
              onChange={(e) => handleChange("last_name", e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="ssn">SSN</Label>
          <Input
            id="ssn"
            placeholder="XXX-XX-XXXX"
            value={values.ssn || ""}
            onChange={(e) => handleChange("ssn", e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Use <code className="bg-muted px-1 rounded">991-91-9991</code> for sandbox testing
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="john@example.com"
            value={values.email || ""}
            onChange={(e) => handleChange("email", e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            type="tel"
            placeholder="+15551234567"
            value={values.phone || ""}
            onChange={(e) => handleChange("phone", e.target.value)}
          />
        </div>
      </div>

      <div className="rounded-lg border bg-muted/30 p-4">
        <p className="text-xs text-muted-foreground">
          <strong>Sandbox credentials:</strong> Use username{" "}
          <code className="bg-muted px-1 rounded">goodlogin</code> and password{" "}
          <code className="bg-muted px-1 rounded">goodpassword</code> when the
          Bridge widget opens.
        </p>
      </div>
    </div>
  );
}

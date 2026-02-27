import type { DemoConfig } from "@/lib/types";
import { newApplicantDemo } from "./demos/new-applicant";
import { returningUserDemo } from "./demos/returning-user";
import { caseworkerDemo } from "./demos/caseworker";
import { contactCenterDemo } from "./demos/contact-center";
import { inPersonDemo } from "./demos/in-person";
import { configurationDemo } from "./demos/configuration";

export const demos: DemoConfig[] = [
  newApplicantDemo,
  returningUserDemo,
  caseworkerDemo,
  contactCenterDemo,
  inPersonDemo,
  configurationDemo,
];

export function getDemoById(id: string): DemoConfig | undefined {
  return demos.find((d) => d.id === id);
}

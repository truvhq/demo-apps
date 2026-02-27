import type { DemoConfig, DemoSection } from "@/lib/types";

// Customer Portal
import { newApplicantDemo } from "./demos/new-applicant";
import { cpHouseholdFollowupDemo } from "./demos/cp-household-followup";
import { cpIncompleteDemo } from "./demos/cp-incomplete";
import { cpPartialEmployerDemo } from "./demos/cp-partial-employer";
import { cpPendingHouseholdDemo } from "./demos/cp-pending-household";
import { cpStateCommsDemo } from "./demos/cp-state-comms";
import { returningUserDemo } from "./demos/returning-user";
import { cpRenewalReauthDemo } from "./demos/cp-renewal-reauth";

// Case Worker Portal
import { caseworkerDemo } from "./demos/caseworker";
import { cwPartialCompleteDemo } from "./demos/cw-partial-complete";
import { cwTriggerVerificationDemo } from "./demos/cw-trigger-verification";
import { cwRenewalDemo } from "./demos/cw-renewal";
import { cwRenewalReauthDemo } from "./demos/cw-renewal-reauth";

// Contact Center
import { contactCenterDemo } from "./demos/contact-center";
import { ccIncompleteDemo } from "./demos/cc-incomplete";

// In Person
import { inPersonDemo } from "./demos/in-person";
import { ipEmailSmsDemo } from "./demos/ip-email-sms";

// Setup
import { configurationDemo } from "./demos/configuration";

export const demos: DemoConfig[] = [
  // Customer Portal
  newApplicantDemo,
  cpHouseholdFollowupDemo,
  cpIncompleteDemo,
  cpPartialEmployerDemo,
  cpPendingHouseholdDemo,
  cpStateCommsDemo,
  returningUserDemo,
  cpRenewalReauthDemo,
  // Case Worker Portal
  caseworkerDemo,
  cwPartialCompleteDemo,
  cwTriggerVerificationDemo,
  cwRenewalDemo,
  cwRenewalReauthDemo,
  // Contact Center
  contactCenterDemo,
  ccIncompleteDemo,
  // In Person
  inPersonDemo,
  ipEmailSmsDemo,
  // Setup
  configurationDemo,
];

export function getDemoById(id: string): DemoConfig | undefined {
  return demos.find((d) => d.id === id);
}

export function getDemosBySection(section: DemoSection): DemoConfig[] {
  return demos.filter((d) => d.section === section);
}

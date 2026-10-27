import "server-only";
import {
  emailDateLabel,
  emailPortalUrl,
  emailStrong,
  emailText,
  renderEmail,
  type EmailDetailRow,
} from "@/lib/email-layout";

export { emailLogoUrl } from "@/lib/email-layout";

/** Every transactional mail the portal sends, rendered through one shared
 * branded shell (see `lib/email-layout.ts`). Each template returns the
 * nodemailer shape: `subject`, plain-text `body` and `html`. */

export type TransportEmailKind = "WEEKLY" | "ADHOC";

export type TransportArrangedEmailParams = {
  kind: TransportEmailKind;
  employeeName: string;
  date: Date;
  driverName: string;
  contactNumber: string;
  vehicleNumber: string;
  pickupTime: string;
  /** Optional pick-up point / home address used by the finalize flow. */
  pickupLocation?: string | null;
  /** Optional seat class shown next to the vehicle number. */
  vehicleType?: string | null;
};

/** Shared body/HTML for "your transport has been arranged" notifications
 * (weekly assignment + ad-hoc dispatch + resend all use this so the text and
 * the design always match). */
export function transportArrangedEmail({
  kind,
  employeeName,
  date,
  driverName,
  contactNumber,
  vehicleNumber,
  pickupTime,
  pickupLocation,
  vehicleType,
}: TransportArrangedEmailParams): {
  subject: string;
  body: string;
  html: string;
} {
  const isAdhoc = kind === "ADHOC";
  const dateLabel = emailDateLabel(date);
  const vehicleLabel = vehicleType
    ? `${vehicleNumber} (${vehicleType})`
    : vehicleNumber;
  const subject = isAdhoc
    ? "Your ad-hoc transport has been arranged"
    : "Your transport has been arranged";
  const heading = isAdhoc
    ? "Your ad-hoc transport is arranged"
    : "Your transport is arranged";
  const kindLabel = isAdhoc ? "Ad-hoc trip" : "Weekly trip";

  const rows: EmailDetailRow[] = [
    { label: "Travel date", value: dateLabel, accent: true },
    { label: "Driver", value: driverName },
    { label: "Contact number", value: contactNumber },
    { label: "Vehicle", value: vehicleLabel },
  ];
  if (pickupLocation) {
    rows.push({ label: "Pick-up point", value: pickupLocation });
  }

  const body = [
    `Hi ${employeeName},`,
    "",
    `Your ${isAdhoc ? "ad-hoc " : ""}transport for ${dateLabel} has been arranged:`,
    `Driver: ${driverName} (${contactNumber})`,
    `Vehicle: ${vehicleLabel}`,
    `Pickup time: ${pickupTime}`,
    ...(pickupLocation ? [`Pick-up point: ${pickupLocation}`] : []),
    "",
    "Please be ready at the pickup location at the scheduled time.",
    "",
    "- Facilities Team",
  ].join("\n");

  const html = renderEmail({
    title: subject,
    preheader: `${isAdhoc ? "Ad-hoc" : "Weekly"} transport confirmed for ${dateLabel} — pick-up at ${pickupTime}.`,
    eyebrow: isAdhoc ? "Ad-hoc transport confirmed" : "Weekly transport confirmed",
    headerNote: kindLabel,
    heading,
    introHtml: `<p style="margin:0;">Hi ${emailStrong(employeeName)},</p><p style="margin:12px 0 0;">Your ${isAdhoc ? "ad-hoc " : ""}transport for ${emailStrong(dateLabel)} has been arranged. Here are your trip details.</p>`,
    highlight: { label: "Pick-up time", value: pickupTime },
    rows,
    note: "Please be ready at your pick-up point a few minutes before the scheduled time. If you cannot travel, let the Facilities team know as early as possible.",
    cta: emailPortalUrl()
      ? { label: "Open the transportation portal", url: emailPortalUrl() as string }
      : undefined,
    signature: "Facilities Team",
  });

  return { subject, body, html };
}

export type RoutePlanArrangedEmailParams = {
  employeeName: string;
  date: Date;
  arrivalTime: string;
  pickupTime: string;
  pickupLocation: string;
  vehicleNumber: string;
  vehicleType: string;
  driverName: string;
  driverContact: string;
};

/** Sent to every rider once Facilities finalizes a route plan for the day. */
export function routePlanArrangedEmail({
  employeeName,
  date,
  arrivalTime,
  pickupTime,
  pickupLocation,
  vehicleNumber,
  vehicleType,
  driverName,
  driverContact,
}: RoutePlanArrangedEmailParams): {
  subject: string;
  body: string;
  html: string;
} {
  const dateLabel = emailDateLabel(date);
  const subject = `Your transport has been arranged - ${arrivalTime}`;

  const body = [
    `Hi ${employeeName},`,
    "",
    `Your transport for ${dateLabel} has been arranged:`,
    "",
    `Arrival Time: ${arrivalTime}`,
    `Pickup Time: ${pickupTime}`,
    `Pickup Location: ${pickupLocation}`,
    `Vehicle: ${vehicleNumber} (${vehicleType})`,
    `Driver: ${driverName}`,
    `Driver Contact: ${driverContact}`,
    "",
    "Please be ready at the pickup location at the scheduled time.",
    "",
    "Best regards,",
    "Facilities Team",
  ].join("\n");

  const html = renderEmail({
    title: subject,
    preheader: `Your trip for ${dateLabel} is arranged — pick-up at ${pickupTime}, arrival ${arrivalTime}.`,
    eyebrow: "Weekly transport confirmed",
    headerNote: "Weekly trip",
    heading: "Your transport is arranged",
    introHtml: `<p style="margin:0;">Hi ${emailStrong(employeeName)},</p><p style="margin:12px 0 0;">Your transport for ${emailStrong(dateLabel)} has been arranged. Here are your trip details.</p>`,
    highlight: { label: "Pick-up time", value: pickupTime },
    rows: [
      { label: "Travel date", value: dateLabel, accent: true },
      { label: "Office arrival", value: arrivalTime },
      { label: "Pick-up point", value: pickupLocation },
      { label: "Vehicle", value: `${vehicleNumber} (${vehicleType})` },
      { label: "Driver", value: driverName },
      { label: "Driver contact", value: driverContact },
    ],
    note: "Please be ready at your pick-up point a few minutes before the scheduled time.",
    cta: emailPortalUrl()
      ? { label: "Open the transportation portal", url: emailPortalUrl() as string }
      : undefined,
    signature: "Facilities Team",
  });

  return { subject, body, html };
}

export type FixedArrivalTransportEmailParams = {
  employeeName: string;
  driverName: string;
  contactNumber: string;
  vehicleNumber: string;
  pickupTime: string;
};

/** Standing (fixed-arrival) pick-up details saved by Facilities. */
export function fixedArrivalTransportEmail({
  employeeName,
  driverName,
  contactNumber,
  vehicleNumber,
  pickupTime,
}: FixedArrivalTransportEmailParams): {
  subject: string;
  body: string;
  html: string;
} {
  const subject = "Your transport details have been saved";

  const body = [
    `Hi ${employeeName},`,
    "",
    "Your standing transport details have been arranged:",
    `Driver: ${driverName} (${contactNumber})`,
    `Vehicle: ${vehicleNumber}`,
    `Pickup time: ${pickupTime}`,
    "",
    "These details stay in force until Facilities updates them.",
    "",
    "- Facilities Team",
  ].join("\n");

  const html = renderEmail({
    title: subject,
    preheader: `Your standing pick-up details are confirmed — pick-up at ${pickupTime}.`,
    eyebrow: "Standing transport details",
    headerNote: "Fixed arrival",
    heading: "Your transport details are confirmed",
    introHtml: `<p style="margin:0;">Hi ${emailStrong(employeeName)},</p><p style="margin:12px 0 0;">Facilities has saved your standing pick-up details. These apply to your regular service until the team updates them.</p>`,
    highlight: { label: "Pick-up time", value: pickupTime },
    rows: [
      { label: "Driver", value: driverName },
      { label: "Contact number", value: contactNumber },
      { label: "Vehicle", value: vehicleNumber },
    ],
    note: "No action is needed. If your pick-up needs to change, contact the Facilities team so they can update it for you.",
    cta: emailPortalUrl()
      ? { label: "Open the transportation portal", url: emailPortalUrl() as string }
      : undefined,
    signature: "Facilities Team",
  });

  return { subject, body, html };
}

export type ScheduleSubmittedDay = { label: string; value: string };

export type ScheduleSubmittedEmailParams = {
  employeeName: string;
  weekStartDate: Date;
  days: ScheduleSubmittedDay[];
};

/** Receipt for a submitted weekly schedule (self-service or placed on behalf). */
export function scheduleSubmittedEmail({
  employeeName,
  weekStartDate,
  days,
}: ScheduleSubmittedEmailParams): { subject: string; body: string; html: string } {
  const subject = "Your schedule has been submitted";
  const weekLabel = emailDateLabel(weekStartDate);

  const body = [
    `Hi ${employeeName},`,
    "",
    `Your weekly schedule for the week of ${weekLabel} has been submitted successfully.`,
    "",
    "Day-wise schedule:",
    ...days.map((day) => `${day.label}: ${day.value}`),
    "",
    'To view your current week schedule and find your day-wise assignment, please log in to the system and open the "My Schedule" page.',
    "",
    "Thank you.",
    "",
    "- Transportation Team",
  ].join("\n");

  const html = renderEmail({
    title: subject,
    preheader: `Week of ${weekLabel} — your day-wise transport plan is recorded.`,
    eyebrow: "Schedule received",
    headerNote: "Weekly schedule",
    heading: "Your schedule has been submitted",
    introHtml: `<p style="margin:0;">Hi ${emailStrong(employeeName)},</p><p style="margin:12px 0 0;">Your weekly schedule for the week of ${emailStrong(weekLabel)} has been submitted successfully. Here is what we recorded.</p>`,
    rows: days.map((day) => ({ label: day.label, value: day.value })),
    note: 'To view your current week schedule and find your day-wise assignment, log in to the portal and open the "My Schedule" page.',
    cta: emailPortalUrl()
      ? { label: "Open my schedule", url: emailPortalUrl() as string }
      : undefined,
    signature: "Transportation Team",
  });

  return { subject, body, html };
}

export type AccountCreatedEmailParams = {
  to: string;
  fullName: string;
  password: string;
};

export function accountCreatedEmail({
  to,
  fullName,
  password,
}: AccountCreatedEmailParams): { subject: string; body: string; html: string } {
  const subject = "Your Transportation Portal Account Has Been Created";

  const body = [
    `Hi ${fullName},`,
    "",
    "Your account for the Transportation Portal has been created.",
    "",
    "Login credentials:",
    `Email: ${to}`,
    `Password: ${password}`,
    "",
    "Please change your password after signing in for the first time.",
    "",
    "Best regards,",
    "Transportation Team",
  ].join("\n");

  const html = renderEmail({
    title: subject,
    preheader: "Your Transportation Portal account is ready — sign in with the credentials inside.",
    eyebrow: "Account created",
    headerNote: "Account",
    heading: "Your account has been created",
    introHtml: `<p style="margin:0;">Hi ${emailStrong(fullName)},</p><p style="margin:12px 0 0;">Your account for the Transportation Portal is ready. Use the credentials below to sign in for the first time.</p>`,
    rows: [
      { label: "Email", value: to },
      { label: "Temporary password", value: password, accent: true },
    ],
    attention:
      "Change your password right after your first sign-in — the temporary password above stops being safe once it has been shared by email.",
    cta: emailPortalUrl()
      ? { label: "Sign in to the portal", url: emailPortalUrl() as string }
      : undefined,
    signature: "Transportation Team",
  });

  return { subject, body, html };
}

export type PasswordResetEmailParams = {
  fullName: string;
  resetUrl: string;
  ttlLabel: string;
};

export function passwordResetEmail({
  fullName,
  resetUrl,
  ttlLabel,
}: PasswordResetEmailParams): { subject: string; body: string; html: string } {
  const subject = "Reset your Transportation Portal password";

  const body = [
    `Hi ${fullName},`,
    "",
    `Use the link below to reset your password. This link expires in ${ttlLabel} and can be used once.`,
    "",
    resetUrl,
    "",
    "If you didn't request this, you can ignore this email.",
  ].join("\n");

  const html = renderEmail({
    title: subject,
    preheader: `Reset your password — the link expires in ${ttlLabel}.`,
    eyebrow: "Password reset",
    headerNote: "Security",
    heading: "Reset your password",
    introHtml: `<p style="margin:0;">Hi ${emailStrong(fullName)},</p><p style="margin:12px 0 0;">We received a request to reset the password for your Transportation Portal account. Use the button below to choose a new one.</p>`,
    note: `This link expires in ${ttlLabel} and can be used once.`,
    attention: "If you didn't request this, you can ignore this email — your password stays unchanged.",
    cta: { label: "Reset my password", url: resetUrl },
    signature: "Transportation Team",
  });

  return { subject, body, html };
}

export type AddressChangedEmailParams = {
  fullName: string;
  email: string;
  oldAddress: string;
  newAddress: string;
};

/** Internal notice to Facilities/Operations when an employee updates address. */
export function addressChangedEmail({
  fullName,
  email,
  oldAddress,
  newAddress,
}: AddressChangedEmailParams): { subject: string; body: string; html: string } {
  const subject = `Address changed: ${fullName}`;

  const body = [
    "Hi,",
    "",
    `${fullName} (${email}) has changed their address.`,
    "",
    `Old address: ${oldAddress}`,
    `New address: ${newAddress}`,
    "",
    "Best regards,",
    "Transportation Team",
  ].join("\n");

  const html = renderEmail({
    title: subject,
    preheader: `${fullName} updated their home address — routes may need replanning.`,
    eyebrow: "Address updated",
    headerNote: "Internal notice",
    heading: "An employee changed their address",
    introHtml: `<p style="margin:0;">${emailStrong(fullName)} ${emailText(`(${email})`)} has changed their home address. Review any planned pick-ups for this employee.</p>`,
    rows: [
      { label: "Previous address", value: oldAddress || "—" },
      { label: "New address", value: newAddress, accent: true },
    ],
    signature: "Transportation Team",
  });

  return { subject, body, html };
}


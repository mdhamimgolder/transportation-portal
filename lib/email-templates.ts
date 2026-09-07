import "server-only";

export type TransportEmailKind = "WEEKLY" | "ADHOC";

export type TransportArrangedEmailParams = {
  kind: TransportEmailKind;
  employeeName: string;
  date: Date;
  driverName: string;
  contactNumber: string;
  vehicleNumber: string;
  pickupTime: string;
};

/** Shared body/HTML for "your transport has been arranged" notifications
 * (weekly assignment + ad-hoc dispatch + resend all use this so the text
 * always matches). */
export function transportArrangedEmail({
  kind,
  employeeName,
  date,
  driverName,
  contactNumber,
  vehicleNumber,
  pickupTime,
}: TransportArrangedEmailParams): { subject: string; body: string; html: string } {
  const isAdhoc = kind === "ADHOC";
  const subject = isAdhoc
    ? "Your ad-hoc transport has been arranged"
    : "Your transport has been arranged";
  const headline = isAdhoc
    ? "Your Ad-Hoc Transport Has Been Arranged"
    : "Your Transport Has Been Arranged";
  const intro = isAdhoc
    ? `Your ad-hoc transport for <strong>${date.toDateString()}</strong> has been arranged with the following details:`
    : `Your transport for <strong>${date.toDateString()}</strong> has been arranged with the following details:`;
  const bodyIntro = isAdhoc
    ? `Your ad-hoc transport for ${date.toDateString()} has been arranged:`
    : `Your transport for ${date.toDateString()} has been arranged:`;

  const body = `Hi ${employeeName},\n\n${bodyIntro}\nDriver: ${driverName} (${contactNumber})\nVehicle: ${vehicleNumber}\nPickup time: ${pickupTime}\n\n- Facilities Team`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #1a1a2e;">${headline}</h2>
      <p>Hi <strong>${employeeName}</strong>,</p>
      <p>${intro}</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr style="background: #f8f9fa;">
          <td style="padding: 10px; border: 1px solid #dee2e6; font-weight: bold;">Driver</td>
          <td style="padding: 10px; border: 1px solid #dee2e6;">${driverName}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #dee2e6; font-weight: bold;">Contact</td>
          <td style="padding: 10px; border: 1px solid #dee2e6;">${contactNumber}</td>
        </tr>
        <tr style="background: #f8f9fa;">
          <td style="padding: 10px; border: 1px solid #dee2e6; font-weight: bold;">Vehicle</td>
          <td style="padding: 10px; border: 1px solid #dee2e6;">${vehicleNumber}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #dee2e6; font-weight: bold;">Pickup Time</td>
          <td style="padding: 10px; border: 1px solid #dee2e6;">${pickupTime}</td>
        </tr>
      </table>
      <p>Please be ready at the pickup location at the scheduled time.</p>
      <p style="color: #6c757d; margin-top: 24px;">Best regards,<br><strong>Facilities Team</strong></p>
    </div>
  `;

  return { subject, body, html };
}
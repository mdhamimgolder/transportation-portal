import "server-only";

export async function sendMail(params: {
  to: string;
  subject: string;
  body: string;
}): Promise<void> {
  // Dev implementation: log to console instead of sending real email.
  // Swap this out for a real provider in production.
  console.log(
    `\n[MAILER] To: ${params.to}\nSubject: ${params.subject}\n${"-".repeat(40)}\n${params.body}\n${"-".repeat(40)}\n`
  );
}

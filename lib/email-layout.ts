import "server-only";
import { escapeHtml } from "@/lib/html";
import { appBaseUrl } from "@/lib/env";

/**
 * Single, table-based HTML shell for every outgoing portal email.
 *
 * Why one shell: the old templates were hand-rolled per action (and often
 * plain text only), so the same "your transport has been arranged" notice
 * looked different depending on which path sent it. Every template now renders
 * through `renderEmail`, so branding, spacing and the Commure logo stay
 * identical across weekly assignments, ad-hoc confirmations, finalized route
 * plans, fixed-arrival details, schedule receipts, credentials and security
 * mail.
 *
 * Constraints baked in on purpose (email clients are not browsers):
 *  - layout is <table>-based with inline styles only (no flex/grid/classes),
 *    because Outlook (Word renderer) drops <style> blocks and modern layout;
 *  - 600px card, single column, fluid below that;
 *  - the logo is a transparent PNG served from this app's own /public, so the
 *    mark sits on the dark header without a black square around it;
 *  - `border-radius`, box-shadow and similar are progressive enhancements —
 *    Outlook squares them off and the mail still reads correctly.
 */

/** Transparent-background Commure mark (white), generated from the brand JPEG. */
export const EMAIL_LOGO_PATH = "/commure-logo-light.png";

const FONT_STACK =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const BRAND = {
  ink: "#03120f",
  inkForeground: "#eef1ec",
  inkMuted: "#8ea79f",
  body: "#14231d",
  muted: "#65756f",
  accent: "#70bccc",
  accentInk: "#2f7d8c",
  accentSoft: "#eef7f8",
  accentBorder: "#cfe7ea",
  page: "#efece2",
  card: "#ffffff",
  box: "#f6f8f7",
  border: "#e4e8e4",
  rowBorder: "#e8ece9",
  footer: "#f7f5ee",
  footerBorder: "#e9e6dc",
} as const;

export type EmailDetailRow = {
  /** Plain text — escaped by the layout. */
  label: string;
  /** Plain text — escaped by the layout. */
  value: string;
  /** Renders the value in the accent colour (used for dates/times). */
  accent?: boolean;
};

export type EmailLayoutParams = {
  /** Browser tab title; also used as the document title meta. */
  title: string;
  /** Short inbox preview line (hidden inside the body). */
  preheader: string;
  /** Small uppercase label above the heading, e.g. "TRANSPORT CONFIRMED". */
  eyebrow?: string;
  /** Main heading — plain text, escaped. */
  heading: string;
  /** Trusted HTML paragraph block built with `emailText`/`emailStrong`. */
  introHtml: string;
  /** Optional big highlighted value (the pick-up time, the reset action…). */
  highlight?: { label: string; value: string };
  /** Key/value details box. */
  rows?: EmailDetailRow[];
  /** Neutral, teal-tinted note shown under the details box. */
  note?: string;
  /** Amber "please pay attention" note — one short sentence. */
  attention?: string;
  /** Optional button. Omitted when no trustworthy base URL is configured. */
  cta?: { label: string; url: string };
  /** Sign-off name shown in the footer line, e.g. "Facilities Team". */
  signature: string;
  /** Small label in the header, right side, e.g. "Ad-hoc" / "Weekly". */
  headerNote?: string;
  /** Tighter vertical spacing for compact transport confirmations. */
  compact?: boolean;
};

/** Logo URL for `<img src>`; absolute because email clients cannot resolve
 * relative paths. `null` in environments without a trustworthy base URL — the
 * header then falls back to a monogram tile. */
export function emailLogoUrl(): string | null {
  const base = appBaseUrl();
  return base ? `${base}${EMAIL_LOGO_PATH}` : null;
}

/** Escape a plain-text fragment for use in email HTML. */
export function emailText(value: unknown): string {
  return escapeHtml(value).replace(/\r?\n/g, "<br />");
}

/** Bold span inside body copy (input is escaped). */
export function emailStrong(value: unknown): string {
  return `<strong style="color:${BRAND.body};font-weight:600;">${escapeHtml(value)}</strong>`;
}

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/**
 * Long calendar label for a stored day/week key, e.g. "Monday, 26 October 2026".
 *
 * Reads the UTC calendar on purpose: day and week keys are stored as UTC
 * midnight (AGENTS.md), so `toDateString()` would print the previous day on any
 * host behind UTC. This output is identical on every server.
 */
export function emailDateLabel(date: Date): string {
  return `${WEEKDAY_NAMES[date.getUTCDay()]}, ${date.getUTCDate()} ${
    MONTH_NAMES[date.getUTCMonth()]
  } ${date.getUTCFullYear()}`;
}

function detailRowsHtml(rows: EmailDetailRow[], compact: boolean): string {
  return rows
    .map((row, index) => {
      const borderTop =
        index === 0 ? "none" : `1px solid ${BRAND.rowBorder}`;
      return `
        <tr>
          <td style="padding:${compact ? "4px" : "8px"} 0;border-top:${borderTop};font-family:${FONT_STACK};font-size:10px;line-height:1.35;letter-spacing:0.06em;text-transform:uppercase;color:${BRAND.muted};">${escapeHtml(row.label)}</td>
          <td align="right" style="padding:${compact ? "4px" : "8px"} 0 ${compact ? "4px" : "8px"} ${compact ? "8px" : "12px"};border-top:${borderTop};font-family:${FONT_STACK};font-size:13px;line-height:1.35;font-weight:600;color:${row.accent ? BRAND.accentInk : BRAND.body};">${escapeHtml(row.value)}</td>
        </tr>`;
    })
    .join("");
}

function headerLogoHtml(): string {
  const url = emailLogoUrl();
  if (!url) {
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="42" height="42" align="center" valign="middle" style="width:42px;height:42px;background:${BRAND.accent};border-radius:10px;font-family:${FONT_STACK};font-size:18px;font-weight:700;color:${BRAND.ink};text-align:center;">C</td></tr></table>`;
  }
  return `<img src="${escapeHtml(url)}" width="42" height="42" alt="Commure" style="display:block;width:42px;height:42px;border:0;outline:none;text-decoration:none;" />`;
}

/**
 * Renders the full HTML document for one email. Callers pass already-escaped
 * or trusted fragments only where documented; everything else is escaped here.
 */
export function renderEmail(params: EmailLayoutParams): string {
  const {
    title,
    preheader,
    eyebrow,
    heading,
    introHtml,
    highlight,
    rows,
    note,
    attention,
    cta,
    signature,
    headerNote,
  } = params;
  const compact = params.compact === true;

  const highlightHtml = highlight
    ? `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 ${compact ? "10px" : "16px"};background:${BRAND.accentSoft};border:1px solid ${BRAND.accentBorder};border-radius:${compact ? "10px" : "12px"};">
            <tr>
              <td style="padding:${compact ? "8px 12px" : "12px 16px"};font-family:${FONT_STACK};">
                <div style="font-size:${compact ? "9px" : "10.5px"};line-height:1.3;letter-spacing:0.1em;text-transform:uppercase;color:${BRAND.accentInk};">${escapeHtml(highlight.label)}</div>
                <div style="margin-top:3px;font-size:${compact ? "17px" : "20px"};line-height:1.15;font-weight:700;letter-spacing:-0.01em;color:${BRAND.ink};">${escapeHtml(highlight.value)}</div>
              </td>
            </tr>
          </table>`
    : "";

  const rowsHtml =
    rows && rows.length > 0
      ? `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 ${compact ? "10px" : "16px"};background:${BRAND.box};border:1px solid ${BRAND.border};border-radius:${compact ? "10px" : "12px"};">
            <tr>
              <td style="padding:${compact ? "2px 12px" : "4px 16px"};">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  ${detailRowsHtml(rows, compact)}
                </table>
              </td>
            </tr>
          </table>`
      : "";

  const noteHtml = note && !compact
    ? `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;">
            <tr>
              <td style="padding:13px 18px;background:${BRAND.accentSoft};border-left:3px solid ${BRAND.accent};border-radius:8px;font-family:${FONT_STACK};font-size:12.5px;line-height:1.6;color:#2c474c;">${emailText(note)}</td>
            </tr>
          </table>`
    : "";

  const attentionHtml = attention
    ? `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;">
            <tr>
              <td style="padding:13px 18px;background:#fdf6e7;border-left:3px solid #d9a13a;border-radius:8px;font-family:${FONT_STACK};font-size:12.5px;line-height:1.6;color:#6b5320;">${escapeHtml(attention)}</td>
            </tr>
          </table>`
    : "";

  const ctaHtml = cta
    ? `
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 ${compact ? "2px" : "6px"};">
            <tr>
              <td style="background:${BRAND.ink};border-radius:10px;">
                <a href="${escapeHtml(cta.url)}" target="_blank" rel="noreferrer" style="display:inline-block;padding:${compact ? "10px 18px" : "13px 24px"};font-family:${FONT_STACK};font-size:${compact ? "12px" : "13px"};line-height:1;font-weight:600;color:#ffffff;text-decoration:none;">${escapeHtml(cta.label)}</a>
              </td>
            </tr>
          </table>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="color-scheme" content="light only" />
<meta name="supported-color-schemes" content="light only" />
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.page};padding:0;margin:0;">
  <tr>
    <td align="center" style="padding:${compact ? "12px 8px" : "32px 14px 40px"};">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;background:${BRAND.card};border:1px solid ${BRAND.footerBorder};border-radius:16px;">
        <tr>
          <td style="background:${BRAND.ink};padding:${compact ? "12px 18px" : "18px 22px"};border-radius:16px 16px 0 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td width="42" valign="middle" style="width:42px;padding:0 14px 0 0;">${headerLogoHtml()}</td>
                <td valign="middle" style="font-family:${FONT_STACK};">
                  <div style="font-size:14px;line-height:1.2;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;color:#ffffff;">Commure</div>
                  <div style="padding-top:4px;font-size:10.5px;line-height:1.2;letter-spacing:0.12em;text-transform:uppercase;color:${BRAND.inkMuted};">Transportation Portal</div>
                </td>
                ${
                  headerNote
                    ? `<td align="right" valign="middle" style="font-family:${FONT_STACK};font-size:10.5px;line-height:1.4;letter-spacing:0.1em;text-transform:uppercase;color:${BRAND.inkMuted};">${escapeHtml(headerNote)}</td>`
                    : ""
                }
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td height="4" bgcolor="${BRAND.accent}" style="height:4px;line-height:4px;font-size:0;background:${BRAND.accent};">&nbsp;</td>
        </tr>
        <tr>
          <td style="padding:${compact ? "14px 18px" : "24px 22px"};font-family:${FONT_STACK};">
            ${
              eyebrow
                ? `<div style="font-size:${compact ? "9px" : "10px"};line-height:1.35;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:${BRAND.accentInk};padding-bottom:${compact ? "4px" : "8px"};">${escapeHtml(eyebrow)}</div>`
                : ""
            }
              <h1 style="margin:0 0 ${compact ? "6px" : "12px"};font-family:${FONT_STACK};font-size:${compact ? "17px" : "19px"};line-height:1.3;font-weight:700;letter-spacing:-0.01em;color:${BRAND.ink};">${escapeHtml(heading)}</h1>
              <div style="font-family:${FONT_STACK};font-size:${compact ? "12px" : "13px"};line-height:${compact ? "1.4" : "1.55"};color:#41504a;padding-bottom:${compact ? "10px" : "18px"};">${introHtml}</div>
            ${highlightHtml}
            ${rowsHtml}
            ${noteHtml}
            ${attentionHtml}
            ${ctaHtml}
          </td>
        </tr>
        <tr>
          <td style="background:${BRAND.footer};border-top:1px solid ${BRAND.footerBorder};border-radius:0 0 16px 16px;padding:${compact ? "8px 18px" : "14px 22px"};">
            <p style="margin:0;font-family:${FONT_STACK};font-size:${compact ? "11px" : "12px"};line-height:1.4;font-weight:600;color:#4b5a54;">${escapeHtml(signature)}</p>
            <p style="margin:${compact ? "2px" : "6px"} 0 0;font-family:${FONT_STACK};font-size:${compact ? "10px" : "11px"};line-height:1.4;color:#8a968f;">Commure &middot; Transportation Portal &mdash; automated message, please do not reply.</p>
            ${compact ? "" : `<p style="margin:4px 0 0;font-family:${FONT_STACK};font-size:11px;line-height:1.6;color:#a0aaa4;">Internal transport management &middot; ${new Date().getFullYear()}</p>`}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/** Absolute portal URL for CTA buttons, or `null` when none is configured. */
export function emailPortalUrl(): string | null {
  return appBaseUrl();
}


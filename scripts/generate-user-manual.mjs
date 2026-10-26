// Generates the Commure-branded TMP User Manual PDF (two-pass for exact TOC page numbers).
// Brand tokens mirror app/globals.css: ink #03120f, paper #F5F3EC, teal #70BCCC.
// Role labels, URLs, and sidebar items mirror lib/constants/enums.ts + app/<role>/layout.tsx.
// NOTE: pdfkit standard fonts only support WinAnsi -- do NOT use arrows or symbols
// outside WinAnsi (no -> glyph U+2192, no checkmarks). Use ">" and plain bullets.
import PDFDocument from "pdfkit";
import fs from "node:fs";
import path from "node:path";

const INK = "#03120f";
const GRAPHITE = "#16211d";
const TEAL = "#70BCCC";
const TEAL_DARK = "#0F3038";
const AMBER = "#E2932F";
const GREEN = "#3F8F6B";
const RED = "#B8412C";
const BODY = "#1E2A25";
const MUTED = "#66766D";
const BORDER = "#DDD7C8";
const FAINT = "#B9C6C0";

const OUT = path.join(process.cwd(), "public", "TMP-User-Manual.pdf");
const TMP = path.join(process.cwd(), "public", ".manual-tmp.pdf");
const LOGO = [path.join(process.cwd(), "Commurelogo.jpeg"), path.join(process.cwd(), "Commure.jpeg")].find((f) =>
  fs.existsSync(f),
);

const SECTIONS = [
  { n: "01", title: "System overview", key: "overview" },
  { n: "02", title: "Getting started", key: "start" },
  { n: "03", title: "Employee-MDS (shift staff)", key: "mds" },
  { n: "04", title: "Employee-Corporate", key: "corp" },
  { n: "05", title: "Fixed-arrival staff", key: "fixed" },
  { n: "06", title: "Operation-Admin", key: "ops" },
  { n: "07", title: "Rules and troubleshooting", key: "rules" },
];

function createDoc(outPath) {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 54, bottom: 62, left: 54, right: 54 },
    autoFirstPage: false,
  });
  doc.pipe(fs.createWriteStream(outPath));
  const state = { page: 0, sectionPage: {} };
  let inFooter = false;
  doc.on("pageAdded", () => {
    // Guard: footer drawing sits below the bottom margin, which would otherwise
    // trigger pdfkit's auto page-break and recurse forever.
    if (inFooter) return;
    state.page += 1;
    if (state.page === 1) return; // cover: no footer
    inFooter = true;
    try {
      const y = doc.y;
      const x = doc.x;
      const m = doc.page.margins;
      const oldBottom = m.bottom;
      m.bottom = 20;
      doc
        .font("Helvetica")
        .fontSize(7.5)
        .fillColor(MUTED)
        .text("Commure  |  Transportation Management Portal", m.left, doc.page.height - 38, {
          width: 260,
          align: "left",
        });
      doc
        .font("Helvetica")
        .fontSize(7.5)
        .fillColor(MUTED)
        .text(`User Manual  |  p. ${state.page}`, m.left, doc.page.height - 38, { align: "right" });
      m.bottom = oldBottom;
      doc.x = x;
      doc.y = y;
    } finally {
      inFooter = false;
    }
  });
  return { doc, state };
}

const usable = (doc) => doc.page.width - doc.page.margins.left - doc.page.margins.right;
const bottomLimit = (doc) => doc.page.height - doc.page.margins.bottom;

function newPage(doc, bg) {
  doc.addPage({ size: "A4", margins: { top: 54, bottom: 62, left: 54, right: 54 } });
  if (bg) {
    doc.save();
    doc.rect(0, 0, doc.page.width, doc.page.height).fill(bg);
    doc.restore();
  }
}

function ensure(doc, h) {
  if (doc.y + h > bottomLimit(doc)) newPage(doc);
}

function divider(doc) {
  const y = doc.y + 4;
  const L = doc.page.margins.left;
  const R = doc.page.width - doc.page.margins.right;
  doc.save();
  doc.strokeColor(TEAL).lineWidth(2).moveTo(L, y).lineTo(L + 44, y).stroke();
  doc.strokeColor(BORDER).lineWidth(1).moveTo(L + 50, y).lineTo(R, y).stroke();
  doc.restore();
  doc.moveDown(1.1);
}

function h1(doc, state, sec, sub, record) {
  ensure(doc, 90);
  if (record) state.sectionPage[sec.key] = state.page + 1; // next newPage is this section
  newPage(doc);
  doc.font("Helvetica-Bold").fontSize(19).fillColor(INK).text(`${sec.n}   ${sec.title}`);
  if (sub) {
    doc.moveDown(0.2);
    doc.font("Helvetica").fontSize(10).fillColor(MUTED).text(sub);
  }
  divider(doc);
}

function h2(doc, t) {
  ensure(doc, 60);
  doc.moveDown(0.5);
  doc.font("Helvetica-Bold").fontSize(12).fillColor(INK).text(t);
  doc.moveDown(0.25);
}

function h3(doc, t) {
  ensure(doc, 48);
  doc.moveDown(0.35);
  doc.font("Helvetica-Bold").fontSize(10).fillColor(TEAL_DARK).text(t);
  doc.moveDown(0.15);
}

function p(doc, t) {
  ensure(doc, 40);
  doc.font("Helvetica").fontSize(9.5).fillColor(BODY).text(t, { lineGap: 3 });
  doc.moveDown(0.35);
}

function bullets(doc, items) {
  for (const it of items) {
    ensure(doc, 36);
    doc.font("Helvetica").fontSize(9.5).fillColor(BODY).text(`\u2022  ${it}`, { lineGap: 3, indent: 12 });
    doc.moveDown(0.2);
  }
  doc.moveDown(0.25);
}

function steps(doc, items) {
  items.forEach((it, i) => {
    ensure(doc, 52);
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor(TEAL_DARK).text(`Step ${i + 1}`);
    doc.font("Helvetica").fontSize(9.5).fillColor(BODY).text(it, { lineGap: 3 });
    doc.moveDown(0.3);
  });
  doc.moveDown(0.2);
}

function noteCard(doc, title, bodyText, accent = TEAL) {
  const x = doc.page.margins.left;
  const w = usable(doc);
  doc.font("Helvetica-Bold").fontSize(9);
  const th = doc.heightOfString(title, { width: w - 24 });
  doc.font("Helvetica").fontSize(9);
  const bh = doc.heightOfString(bodyText, { width: w - 24, lineGap: 3 });
  const h = 12 + th + 4 + bh + 12;
  ensure(doc, h + 8);
  const y0 = doc.y;
  doc.save();
  doc.roundedRect(x, y0, w, h, 8).fillAndStroke("#FFFFFF", BORDER);
  doc.roundedRect(x, y0, w, 5, 3).fill(accent);
  doc.restore();
  doc.font("Helvetica-Bold").fontSize(9).fillColor(INK).text(title, x + 12, y0 + 12, { width: w - 24 });
  doc.font("Helvetica").fontSize(9).fillColor(BODY).text(bodyText, x + 12, y0 + 12 + th + 4, {
    width: w - 24,
    lineGap: 3,
  });
  doc.y = y0 + h + 10;
}

function statusChips(doc) {
  const chips = [
    ["PENDING", AMBER, "Waiting for review"],
    ["APPROVED / ASSIGNED", GREEN, "Confirmed, vehicle set"],
    ["REJECTED / CANCELLED", RED, "Declined, see reason"],
  ];
  const x = doc.page.margins.left;
  const w = usable(doc);
  const cw = (w - 16) / 3;
  ensure(doc, 66);
  const y0 = doc.y;
  chips.forEach(([label, color, desc], i) => {
    const cx = x + i * (cw + 8);
    doc.save();
    doc.roundedRect(cx, y0, cw, 56, 8).fillAndStroke("#FFFFFF", BORDER);
    doc.circle(cx + 15, y0 + 15, 5).fill(color);
    doc.restore();
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor(INK).text(label, cx + 26, y0 + 9, { width: cw - 32 });
    doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(desc, cx + 12, y0 + 32, { width: cw - 24 });
  });
  doc.y = y0 + 66;
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------
function build(doc, state, pages, record) {
  // ---- COVER (p.1) ----
  newPage(doc, INK);
  doc.save();
  doc.rect(0, 0, doc.page.width, 5).fill(TEAL);
  doc.restore();
  if (LOGO) {
    try {
      doc.image(LOGO, doc.page.width / 2 - 52, 104, { fit: [104, 104] });
    } catch {
      /* logo optional */
    }
  }
  const cx0 = 60;
  const cw = doc.page.width - 120;
  doc.font("Helvetica").fontSize(26).fillColor("#FFFFFF").text("Commure", cx0, 232, { width: cw, align: "center" });
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(TEAL)
    .text("TRANSPORTATION MANAGEMENT PORTAL", cx0, doc.y + 8, { width: cw, align: "center" });
  doc.font("Helvetica-Bold").fontSize(32).fillColor("#FFFFFF").text("User Manual", cx0, doc.y + 22, {
    width: cw,
    align: "center",
  });
  doc
    .font("Helvetica")
    .fontSize(10.5)
    .fillColor(FAINT)
    .text("For Employees  >  Corporate Employees  >  Fixed-Arrival Staff  >  Operation-Admins", cx0, doc.y + 12, {
      width: cw,
      align: "center",
      lineGap: 2,
    });
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor("#8FA3A8")
    .text("Weekly + Ad-hoc transport  |  Deadline Saturday 12:00 AM (Asia/Dhaka)  |  October 2026", cx0, doc.y + 14, {
      width: cw,
      align: "center",
    });
  doc.save();
  doc.strokeColor(TEAL).lineWidth(2);
  doc.moveTo(doc.page.width / 2 - 22, doc.y + 20).lineTo(doc.page.width / 2 + 22, doc.y + 20).stroke();
  doc.restore();
  const cardY = doc.page.height - 176;
  doc.save();
  doc.roundedRect(56, cardY, doc.page.width - 112, 100, 12).fill(GRAPHITE);
  doc.restore();
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor("#EEF1EC")
    .text("How to use this manual: read Sections 01-02, then only your role chapter (03, 04, 05, or 06). Operation-Admins also read Section 07.", 78, cardY + 18, {
      width: doc.page.width - 156,
      lineGap: 4,
    });
  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor(TEAL)
    .text("Stuck? Contact Operations or Facilities from your dashboard.", 78, cardY + 64, {
      width: doc.page.width - 156,
    });

  // ---- CONTENTS ----
  newPage(doc);
  doc.font("Helvetica-Bold").fontSize(10).fillColor(MUTED).text("CONTENTS");
  doc.moveDown(0.2);
  doc.font("Helvetica-Bold").fontSize(19).fillColor(INK).text("What is inside");
  divider(doc);
  SECTIONS.forEach((s) => {
    ensure(doc, 30);
    const y = doc.y;
    const L = doc.page.margins.left;
    const R = doc.page.width - doc.page.margins.right;
    const pg = pages ? pages[s.key] : null;
    doc.font("Helvetica-Bold").fontSize(10).fillColor(TEAL_DARK).text(s.n, L, y);
    doc.font("Helvetica").fontSize(10).fillColor(INK).text(s.title, L + 30, y, { width: R - L - 90 });
    if (pg) doc.font("Helvetica").fontSize(10).fillColor(MUTED).text(`p. ${pg}`, L, y, { align: "right" });
    doc.y = Math.max(doc.y, y + 15) + 5;
    doc.save();
    doc.strokeColor(BORDER).lineWidth(0.5).moveTo(L, doc.y).lineTo(R, doc.y).stroke();
    doc.restore();
    doc.moveDown(0.5);
  });
  doc.moveDown(0.4);
  noteCard(
    doc,
    "Your login opens only your role pages",
    "If you open a link that belongs to another role, the system shows a 403 page. This is expected. Ask your admin if your role looks wrong.",
  );

  // ---- 01 OVERVIEW ----
  h1(doc, state, SECTIONS[0], "Employee request  >  Operations review  >  Facilities dispatch  >  Email to you.", record);
  p(doc, "The portal replaces Smartsheet for office transport. There are two request types, and they follow different paths.");
  h3(doc, "Weekly transport (Monday to Friday)");
  bullets(doc, [
    "Employee-MDS (shift staff): your week is set for you by the Operation-Admin. You view it; you do not fill it in.",
    "Employee-Corporate: you submit your own arrival time per day before the deadline. It stays PENDING until the Operation-Admin approves it; only APPROVED weeks reach Facilities planning.",
    "Deadline: Saturday 12:00 AM (Asia/Dhaka) for the coming Mon-Fri week. After that the week locks.",
    "After approval, Facilities assigns pickup time, driver, and vehicle. You get an automated email.",
  ]);
  h3(doc, "Ad-hoc transport (emergency, single day)");
  bullets(doc, [
    "One date, one arrival time, one reason. Overnight window 10:00 PM to 6:00 AM, any day of the week.",
    "Minimum 3 hours notice (for example, at 8:00 PM you can request 11:00 PM or later). For a 10:00 PM arrival you must also select your pickup point.",
    "Goes instantly to BOTH Operations (tracking) and Facilities (action). No approval step.",
  ]);
  h2(doc, "The flow at a glance");
  p(doc, "Weekly: request set or submitted  >  Operations approves or rejects with remarks  >  Facilities plans routes and assigns driver/vehicle  >  automated email with pickup details.");
  p(doc, "Ad-hoc: employee submits  >  skips approval  >  Operations + Facilities see it at once  >  Facilities assigns  >  automated email.");
  h2(doc, "Status values you will see");
  statusChips(doc);
  p(doc, "Weekly schedules use PENDING, APPROVED, REJECTED. Ad-hoc requests use PENDING, APPROVED, ASSIGNED, REJECTED, CANCELLED. Profile and pickup-point changes use PENDING, APPROVED, REJECTED.");
  noteCard(
    doc,
    "Deadline rule",
    "Weekly schedules for next week (Mon-Fri) must be in by Saturday 12:00 AM Asia/Dhaka. After the deadline the form locks and shows a countdown to the next window.",
    AMBER,
  );

  // ---- 02 GETTING STARTED ----
  h1(doc, state, SECTIONS[1], "Login is the first screen. Every other page needs a session.", record);
  h2(doc, "Sign in and land on your dashboard");
  steps(doc, [
    "Open the portal and sign in with your work email and password. You are redirected automatically: /employee/dashboard, /corporate-employee/dashboard, /fixed-arrival/dashboard, or /operations/dashboard.",
    "First login for bulk-created accounts: you must set a new password on the force-change screen before you can continue.",
    "Forgot password: enter your email. If it exists, a one-time reset link is emailed (valid 30 minutes, single use). The message never reveals whether an account exists.",
    "Sessions last 30 days. Changing your password or role signs you out everywhere else.",
  ]);
  h2(doc, "Sidebar map (exact labels)");
  bullets(doc, [
    "Employee-MDS: Dashboard, Ad-hoc Request, Profile.",
    "Employee-Corporate: Dashboard, My Schedule, Ad-hoc Request, Profile.",
    "Fixed-arrival: Dashboard, My Schedule, Profile (no ad-hoc page).",
    "Operation-Admin: Dashboard, MDS Weekly Schedule, Ad-hoc Transport, Allocation History, My Schedule, Profile.",
  ]);
  h2(doc, "Dashboard, decoded");
  bullets(doc, [
    "Welcome hero with your role name and today's date.",
    "Today's rides card: pickup time, driver name, driver contact number, vehicle number, and whether it came from a weekly or an ad-hoc request.",
    "This week card: Mon-Fri arrival times plus the status chip.",
    "Weather widget: Dhaka conditions to help you plan pickup. On mobile, open the menu icon to reach the sidebar.",
  ]);
  noteCard(
    doc,
    "Keep your profile current",
    "Name, contact number, and home/pickup address drive routing. Address edits apply immediately, start a 30-day lock, and notify Operations and Facilities. Check the map pin before saving.",
  );

  // ---- 03 MDS ----
  h1(doc, state, SECTIONS[2], "Your schedule is set by the Operation-Admin. You view rides and request ad-hoc.", record);
  h2(doc, "What you can do");
  bullets(doc, [
    "Dashboard (/employee/dashboard): Today's rides, this week's arrival times with status, and a Request ad-hoc transport button.",
    "Ad-hoc Request (/employee/adhoc): submit emergency requests and track your last 20, including Facilities notes and decline reasons.",
    "Profile (/employee/profile): update contact info and address (30-day address lock applies).",
  ]);
  h2(doc, "Check today's ride");
  steps(doc, [
    "Open Dashboard and find the Today's rides card.",
    "Read pickup time, driver name, driver contact number, and vehicle number.",
    "Be at your pickup point 5 minutes early. Call the driver number shown if the vehicle is late.",
  ]);
  h2(doc, "Request ad-hoc transport");
  steps(doc, [
    "Open Ad-hoc Request and fill Submit a Request: date, arrival time (10:00 PM-6:00 AM), pickup point if required, and a short reason.",
    "Requests need at least 3 hours notice. A 10:00 PM arrival requires a pickup point.",
    "Submit. The request appears at once in Your Requests as PENDING and is visible to Operations and Facilities immediately.",
    "Track the status: PENDING > ASSIGNED/APPROVED (driver and vehicle filled in) or REJECTED with a reason. Facilities comments appear under your request.",
  ]);
  noteCard(
    doc,
    "No weekly form for MDS",
    "If your week shows no schedule yet, your Operation-Admin has not published it. Contact Operations instead of filing ad-hoc requests for a whole week.",
  );

  // ---- 04 CORPORATE ----
  h1(doc, state, SECTIONS[3], "You submit your own weekly schedule. The Operation-Admin approves it before Facilities plans.", record);
  h2(doc, "What you can do");
  bullets(doc, [
    "Dashboard (/corporate-employee/dashboard): Today's rides, this week's arrival table, and a Manage schedule shortcut.",
    "My Schedule (/corporate-employee/my-schedule): submit or edit this week and next week, day by day.",
    "Ad-hoc Request (/corporate-employee/adhoc): same emergency flow as MDS (3-hour notice, overnight window).",
    "Profile (/corporate-employee/profile): same contact and address rules (30-day address lock).",
  ]);
  h2(doc, "Submit your weekly schedule");
  steps(doc, [
    "Open My Schedule and pick This week or Next week (Mon-Fri dates are shown).",
    "Per day choose an arrival time (whole hours, 10:00 PM through 6:00 AM) or No transport needed. Use Same time for all days to quick-fill, then fix exceptions.",
    "Submit before Saturday 12:00 AM (Asia/Dhaka) for next week's week. A live countdown shows the remaining time; after the lock the form disables. Your schedule is saved as PENDING.",
    "You may resubmit any time before the deadline; each resubmit returns the schedule to PENDING. Once APPROVED it locks and can no longer be changed.",
    "Wait for approval: the Operation-Admin approves in MDS Weekly Schedule, and only APPROVED weeks reach Facilities planning. A rejection returns with a reason; resubmit before the deadline.",
  ]);
  noteCard(
    doc,
    "Missed the deadline?",
    "Corporate schedules still need Operation-Admin approval, and the Saturday 12:00 AM lock still applies. Missed the window? File an ad-hoc request for the days you need instead of waiting a week.",
    AMBER,
  );

  // ---- 05 FIXED ----
  h1(doc, state, SECTIONS[4], "One standing arrival time for every week. Facilities manages it after you pick it.", record);
  h2(doc, "What you can do");
  bullets(doc, [
    "Dashboard (/fixed-arrival/dashboard): your fixed-arrival badge (for example 10 PM), Today's ride, and a Mon-Fri strip repeating your time.",
    "My Schedule (/fixed-arrival/my-schedule): pick your standing arrival time once. It applies to every future week.",
    "Profile (/fixed-arrival/profile): same contact and address rules. There is no ad-hoc page for this role.",
  ]);
  h2(doc, "Pick your standing time");
  steps(doc, [
    "Open My Schedule and choose your arrival time (10 PM, 11 PM, 12 AM, and so on through 6 AM).",
    "Confirm. The dashboard badge updates and every Mon-Fri shows that time.",
    "To change it later, contact Facilities. The field locks so night routes stay stable.",
  ]);
  noteCard(
    doc,
    "Routing note",
    "Fixed-arrival riders join night route plans built from preset pickup points and home addresses. Keep your home pin exact so pickup times stay accurate.",
  );

  // ---- 06 OPS ----
  h1(doc, state, SECTIONS[5], "You gate weekly schedules and profile edits, and you track every ad-hoc.", record);
  h2(doc, "Your home base");
  bullets(doc, [
    "Dashboard (/operations/dashboard): an attention board with three counts (Weekly schedules to review, Profile changes to approve, Ad-hoc transport requests), each linking to its queue, plus the open submission-window line and lock state.",
    "Sidebar: Dashboard, MDS Weekly Schedule, Ad-hoc Transport, Allocation History, My Schedule, Profile.",
  ]);
  h2(doc, "A. Review weekly schedules (MDS Weekly Schedule)");
  steps(doc, [
    "Open MDS Weekly Schedule (/operations/weekly-requests). Filter by week (labels read like 12 Oct - 16 Oct, tagged this week or next week) and search by name or email. The queue holds MDS schedules and Corporate self-submits alike.",
    "Open a row for Mon-Fri arrival times, the status chip (PENDING, APPROVED, REJECTED), and employee details.",
    "Bulk-approve with checkboxes, or open one schedule: Approve, or Reject with a reason. The employee sees the reason and may resubmit before the deadline.",
    "Approved weeks flow automatically to Facilities route planning. No second step is needed.",
  ]);
  h2(doc, "B. Set schedules for MDS employees");
  steps(doc, [
    "Use Create or Edit on MDS Weekly Schedule: set a per-day arrival or No transport for one employee and week, then save.",
    "For many people at once use Bulk Upload (CSV/Excel) with columns name, email, contact_number, address, role, plus week and per-day times. Read the per-row success/error report; fix failed rows and re-upload only those.",
    "Export CSV any time for audits and handovers.",
  ]);
  h2(doc, "C. Track ad-hoc (tracking only, no approval)");
  steps(doc, [
    "Open Ad-hoc Transport (/operations/adhoc). Every new request appears here instantly, at the same moment Facilities sees it.",
    "Monitor PENDING > ASSIGNED/APPROVED or REJECTED. Escalate to Facilities if an urgent request sits unassigned.",
  ]);
  h2(doc, "D. Profiles and change requests");
  bullets(doc, [
    "You can view and directly edit any employee profile at any time. Every edit is audit-logged with before and after values.",
    "Address edits apply immediately, start a 30-day lock, and notify Facilities and Operations.",
    "Pickup-point change requests are reviewed by Facilities on their Profile Approvals queue.",
  ]);
  h2(doc, "E. History and your own transport");
  bullets(doc, [
    "Allocation History (/operations/allocation-history): search past assignments by employee, date range, driver name, or vehicle number. Export CSV.",
    "My Schedule (/operations/my-schedule): if you also ride, submit your own weekly schedule with the week arrows. Profile (/operations/profile) holds your own details.",
  ]);
  noteCard(
    doc,
    "SLA tip",
    "Clear the weekly queue before the Saturday 12:00 AM lock and keep ad-hoc oversight under 30 minutes in service hours. Rejections need a written reason; empty rejections create repeat tickets.",
  );

  // ---- 07 RULES ----
  h1(doc, state, SECTIONS[6], "The rules everyone asks about, plus fixes for common problems.", record);
  h2(doc, "Rules");
  bullets(doc, [
    "Deadline: next week's Mon-Fri schedule locks Saturday 12:00 AM (Asia/Dhaka). Late weekly edits are rejected with a clear error. Use ad-hoc instead.",
    "Weekly flow: set or submitted > Operations approves > Facilities plans > email. Rejected schedules return with remarks.",
    "Ad-hoc flow: visible to Operations and Facilities instantly. No approval. Facilities assigns > email. Minimum 3 hours notice; pickup point required for 10:00 PM.",
    "Profile changes: address edits apply immediately with a 30-day lock and notify Facilities and Operations.",
    "Dates: weeks and days are stored as UTC midnight and shown in Asia/Dhaka. Records are kept at least 3 years; nothing is hard-deleted.",
  ]);
  h2(doc, "Troubleshooting");
  bullets(doc, [
    "Form disabled or countdown at zero: the week locked. Switch to the next open week or file ad-hoc.",
    "No schedule set yet: Operations or Facilities has not published it (MDS and fixed-arrival), or you have not submitted it (Corporate).",
    "No ride today: either no transport was flagged that day, or Facilities has not dispatched yet. Check email and the dashboard after dispatch hours.",
    "403 page: you opened another role's URL. Use your sidebar. Ask your admin if your role is wrong.",
    "Reset link expired: links live 30 minutes and are single use. Request a fresh one from Forgot Password.",
    "Cannot edit address: the 30-day lock after your last change is active. Ask Operations about an override for a genuine move.",
  ]);
  noteCard(doc, "Support", "Rides and schedules: Operation-Admin. Drivers, vehicles, pickup points: Facilities. Accounts and roles: Super Admin.", GREEN);
  doc.moveDown(0.6);
  ensure(doc, 40);
  doc.font("Helvetica").fontSize(8.5).fillColor(MUTED).text(
    "Document: TMP User Manual  |  Audience: Employees + Operation-Admins  |  Brand: Commure ink #03120f + teal #70BCCC  |  Timezone Asia/Dhaka; dates stored UTC midnight.",
    { align: "center", lineGap: 3 },
  );
}

// ---------------------------------------------------------------------------
function run(outPath, pages, record) {
  const { doc, state } = createDoc(outPath);
  build(doc, state, pages, record);
  doc.end();
  return new Promise((resolve) => doc.on("end", () => resolve(state.sectionPage)));
}

const pass1 = await run(TMP, null, true);
await run(OUT, pass1, false);
try {
  fs.unlinkSync(TMP);
} catch {
  /* ignore */
}
console.log("Wrote " + OUT, JSON.stringify(pass1));

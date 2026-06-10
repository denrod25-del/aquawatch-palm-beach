import nodemailer from "nodemailer";

// Uses Gmail SMTP with App Password (env vars) or falls back to Ethereal for dev/preview
async function getTransporter() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (user && pass) {
    return nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass },
    });
  }

  // Fallback: log to console in dev (no SMTP config required)
  return null;
}

export interface LeadEmailData {
  name: string;
  email: string;
  phone: string;
  zipCode: string;
  contaminantConcern?: string | null;
  message?: string | null;
  pfosLevel?: string;
  pfoaLevel?: string;
  createdAt: string;
}

export async function sendLeadNotification(lead: LeadEmailData): Promise<void> {
  const TO = "iplumbtoo@gmail.com";
  const subject = `🚰 New Water Quality Lead — ${lead.name} (${lead.zipCode})`;

  const pfasContext = lead.pfosLevel || lead.pfoaLevel
    ? `\nDetected levels in their area: PFOS ${lead.pfosLevel ?? "N/A"} ppt · PFOA ${lead.pfoaLevel ?? "N/A"} ppt (EPA limit: 4 ppt)`
    : "";

  const textBody = `
New consultation request from AquaWatch Palm Beach County

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONTACT INFO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Name:    ${lead.name}
Email:   ${lead.email}
Phone:   ${lead.phone}
ZIP:     ${lead.zipCode}

WATER QUALITY CONCERN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Contaminant concern: ${lead.contaminantConcern ?? "General consultation"}${pfasContext}
${lead.message ? `\nHomeowner notes:\n${lead.message}` : ""}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Submitted: ${new Date(lead.createdAt).toLocaleString("en-US", { timeZone: "America/New_York" })} ET
Source: AquaWatch PBC Water Quality Dashboard
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Reply directly to this email to contact the homeowner.
  `.trim();

  const htmlBody = `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8fafc; padding: 24px; margin: 0;">
  <div style="max-width: 560px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #0f2744 0%, #1e3a5f 100%); padding: 24px 28px;">
      <div style="display: flex; align-items: center; gap: 12px;">
        <div style="width: 40px; height: 40px; background: rgba(59,130,246,0.3); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 20px;">🚰</div>
        <div>
          <div style="color: white; font-size: 18px; font-weight: 700;">New Lead from AquaWatch</div>
          <div style="color: rgba(255,255,255,0.6); font-size: 13px;">Palm Beach County Water Quality Dashboard</div>
        </div>
      </div>
    </div>

    <!-- Contact Info -->
    <div style="padding: 24px 28px 16px;">
      <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; margin-bottom: 12px;">Contact Information</div>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #64748b; font-size: 13px; width: 100px;">Name</td>
          <td style="padding: 8px 0; font-size: 15px; font-weight: 600; color: #0f172a;">${lead.name}</td>
        </tr>
        <tr style="border-top: 1px solid #f1f5f9;">
          <td style="padding: 8px 0; color: #64748b; font-size: 13px;">Email</td>
          <td style="padding: 8px 0; font-size: 14px; color: #0f172a;"><a href="mailto:${lead.email}" style="color: #2563eb; text-decoration: none;">${lead.email}</a></td>
        </tr>
        <tr style="border-top: 1px solid #f1f5f9;">
          <td style="padding: 8px 0; color: #64748b; font-size: 13px;">Phone</td>
          <td style="padding: 8px 0; font-size: 14px; color: #0f172a;"><a href="tel:${lead.phone.replace(/\D/g, '')}" style="color: #2563eb; text-decoration: none;">${lead.phone}</a></td>
        </tr>
        <tr style="border-top: 1px solid #f1f5f9;">
          <td style="padding: 8px 0; color: #64748b; font-size: 13px;">ZIP Code</td>
          <td style="padding: 8px 0; font-size: 14px; font-weight: 600; color: #0f172a;">${lead.zipCode}</td>
        </tr>
      </table>
    </div>

    <!-- Water Quality Context -->
    <div style="margin: 0 28px 20px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px;">
      <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #991b1b; margin-bottom: 10px;">⚠️ Water Quality Concern</div>
      <div style="font-size: 14px; color: #1e293b; margin-bottom: 8px;">
        <strong>Concern:</strong> ${lead.contaminantConcern ?? "General water quality consultation"}
      </div>
      ${pfasContext ? `<div style="font-size: 13px; color: #374151; background: white; padding: 8px 12px; border-radius: 6px; margin-top: 8px;">${pfasContext.trim().replace(/\n/g, '<br>')}</div>` : ""}
      ${lead.message ? `<div style="font-size: 13px; color: #374151; margin-top: 10px; padding-top: 10px; border-top: 1px solid #fecaca;"><strong>Their message:</strong><br>${lead.message}</div>` : ""}
    </div>

    <!-- CTA -->
    <div style="padding: 0 28px 24px; text-align: center;">
      <a href="mailto:${lead.email}?subject=Re: Your Water Quality Consultation Request" style="display: inline-block; background: #2563eb; color: white; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 14px; font-weight: 600;">Reply to ${lead.name.split(' ')[0]}</a>
    </div>

    <!-- Footer -->
    <div style="background: #f8fafc; padding: 14px 28px; border-top: 1px solid #e2e8f0;">
      <div style="font-size: 11px; color: #94a3b8;">Submitted ${new Date(lead.createdAt).toLocaleString("en-US", { timeZone: "America/New_York" })} ET · AquaWatch PBC · aquawatch-palm-beach-county-wa-uAUEhoXQS3yUZ2VAtxjmMQ.pplx.app</div>
    </div>
  </div>
</body>
</html>
  `.trim();

  const transporter = await getTransporter();

  if (!transporter) {
    // Dev mode: just log
    console.log("\n📧 LEAD NOTIFICATION (no SMTP configured — would send to iplumbtoo@gmail.com):");
    console.log(`  Name: ${lead.name} | Phone: ${lead.phone} | ZIP: ${lead.zipCode}`);
    console.log(`  Email: ${lead.email} | Concern: ${lead.contaminantConcern}`);
    return;
  }

  await transporter.sendMail({
    from: `"AquaWatch PBC" <${process.env.GMAIL_USER}>`,
    to: TO,
    replyTo: lead.email,
    subject,
    text: textBody,
    html: htmlBody,
  });

  console.log(`✅ Lead notification sent to ${TO} for ${lead.name}`);
}

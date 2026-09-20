const rawFrontendUrl = process.env.FRONTEND_URL || "localhost:5000";

export const FRONTEND_URL = (
  rawFrontendUrl.startsWith("http") ? rawFrontendUrl : `https://${rawFrontendUrl}`
).replace(/\/+$/, "");

export const APP_BRAND_NAME = process.env.APP_NAME || "WeCypher";
export const SUPPORT_EMAIL =
  process.env.SUPPORT_EMAIL ||
  process.env.SMTP_FROM_EMAIL ||
  process.env.CONTACT_US_EMAIL ||
  "mail@wecypher.com";
export const DEFAULT_FROM_EMAIL =
  process.env.SMTP_FROM_EMAIL || process.env.SES_FROM_EMAIL || "mail@wecypher.com";
export const DEFAULT_CURRENCY = "INR";

export function getEmailLogoUrl(): string {
  const configured = (process.env.EMAIL_LOGO_URL || "").trim();
  if (configured) return configured;
  return `${FRONTEND_URL}/email-logo.png`;
}

export function applyEmailBrandText(text: string): string {
  return text
    .replace(/Worklenz/g, APP_BRAND_NAME)
    .replace(/support@worklenz\.com/gi, SUPPORT_EMAIL)
    .replace(/info@worklenz\.com/gi, SUPPORT_EMAIL)
    .replace(/support@WeCypher\.com/gi, SUPPORT_EMAIL)
    .replace(/info@WeCypher\.com/gi, SUPPORT_EMAIL);
}

export function applyEmailBrandHtml(html: string): string {
  const logoUrl = getEmailLogoUrl();
  return applyEmailBrandText(html)
    .replace(/\[VAR_LOGO_URL\]/g, logoUrl)
    .replace(/\[VAR_SUPPORT_EMAIL\]/g, SUPPORT_EMAIL)
    .replace(/\[VAR_APP_NAME\]/g, APP_BRAND_NAME)
    .replace(/\[VAR_HOSTNAME\]/g, FRONTEND_URL)
    .replace(
      /https:\/\/s3\.us-west-2\.amazonaws\.com\/worklenz\.com\/email-templates-assets\/worklenz-light-mode\.png/g,
      logoUrl
    )
    .replace(/https:\/\/s3\.us-west-2\.amazonaws\.com\/worklenz\.com\/assets\/icon-96x96\.png/g, logoUrl)
    .replace(/https:\/\/www\.worklenz\.com/g, FRONTEND_URL)
    .replace(/https:\/\/worklenz\.com/g, FRONTEND_URL);
}

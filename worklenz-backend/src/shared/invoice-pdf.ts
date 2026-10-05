/**
 * Invoice and LKR receipt PDFs are rendered with system Chromium.
 * Leave this off to skip installing Chromium in the backend image.
 */
export const isInvoicePdfEnabled = (): boolean =>
  process.env.ENABLE_INVOICE_PDF === "true";

export const INVOICE_PDF_DISABLED_MESSAGE =
  "PDF printing is disabled. Set ENABLE_INVOICE_PDF=true and rebuild the backend image to enable it.";

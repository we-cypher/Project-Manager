// csp.ts - Cleaned for independence (removed all third-party analytics/tracking domains)
const policies = {
  "default-src": ["'self'"],
  "script-src": [
    "'self'",
    "data:",
    "'unsafe-inline'",
    "'unsafe-eval'",
    "https://*.tiny.cloud",
    "https://www.google.com",
    "https://www.gstatic.com",
    "https://www.gstatic.com/recaptcha/",
    "https://www.google.com/recaptcha/",
    "localhost:3000",
    "localhost:*"
  ],
  "media-src": [
    "'self'",
    "https://s3.us-west-2.amazonaws.com"
  ],
  "style-src": [
    "'self'",
    "'unsafe-inline'",
    "data:",
    "https://cdnjs.cloudflare.com",
    "https://fonts.googleapis.com",
    "https://*.tiny.cloud"
  ],
  "font-src": [
    "'self'",
    "data:",
    "https://fonts.gstatic.com",
    "https://cdnjs.cloudflare.com"
  ],
  "worker-src": [
    "'self'",
    "blob:"
  ],
  "connect-src": [
    "'self'",
    "data:",
    "ws:",
    "wss:",
    "https://cdnjs.cloudflare.com",
    "https://fonts.googleapis.com",
    "https://fonts.gstatic.com",
    "https://s3.us-west-2.amazonaws.com",
    "https://*.tiny.cloud",
    "https://*.tinymce.com",
    "https://www.google.com",
    "https://www.gstatic.com",
    "localhost:*"
  ],
  "img-src": [
    "'self'",
    "data:",
    "blob:",
    "https://s3.us-west-2.amazonaws.com",
    "https://*.tinymce.com"
  ],
  "script-src-elem": [
    "'self'",
    "https://*.tiny.cloud",
    "https://www.google.com",
    "https://www.gstatic.com"
  ],
  "frame-src": [
    "'self'",
    "https://docs.google.com",
    "https://www.google.com",
    "https://www.gstatic.com/recaptcha/",
    "https://www.google.com/recaptcha/"
  ],
  "frame-ancestors": ["'self'"],
  "object-src": ["'none'"],
  "report-to": [`https://${process.env.HOSTNAME}/-/csp`]
};

const addDevPolicies = (currentPolicies: typeof policies) => {
  if (process.env.NODE_ENV !== "production") {
    return {
      ...currentPolicies,
      "script-src": [
        ...(currentPolicies["script-src"] || []),
        "'unsafe-eval'",
        "localhost:*"
      ],
      "connect-src": [
        ...(currentPolicies["connect-src"] || []),
        "ws://localhost:*",
        "http://localhost:*"
      ]
    };
  }
  return currentPolicies;
};

const finalPolicies = addDevPolicies(policies);

const policyString = Object.entries(finalPolicies)
  .map(([key, value]) => `${key} ${value.join(" ")}`)
  .join("; ");

export const CSP_POLICIES = policyString;

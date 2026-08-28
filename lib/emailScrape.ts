// Best-effort, free email finder: Google Places has never returned an
// email address (not even Place Details), so the only free way to get
// one is to look at the business's own website. This works for maybe
// half of small businesses - the rest only have a contact form, or no
// site at all - callers should treat an empty result as normal, not an
// error, and expect to call the rest by phone.

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// Addresses that technically match the regex but are never a real
// business contact - tracking pixels, CMS boilerplate, placeholder
// examples, etc. Filtered by domain suffix rather than exact match so
// e.g. any *.sentry.io subdomain is caught.
const JUNK_DOMAINS = [
  "sentry.io",
  "wixpress.com",
  "schema.org",
  "w3.org",
  "example.com",
  "godaddy.com",
  "domainsbyproxy.com",
  "google.com",
  "gstatic.com",
  "cloudflare.com",
  "sentry-next.wixpress.com",
];

const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"];

function extractCandidateEmails(html: string): string[] {
  const mailtoMatches = [...html.matchAll(/mailto:([^"'?\s>]+)/gi)].map((m) => decodeURIComponent(m[1]));
  const plainMatches = html.match(EMAIL_REGEX) ?? [];
  return [...mailtoMatches, ...plainMatches];
}

function isPlausibleEmail(email: string): boolean {
  const lower = email.toLowerCase();
  if (IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext))) return false;
  const domain = lower.split("@")[1];
  if (!domain) return false;
  if (JUNK_DOMAINS.some((junk) => domain === junk || domain.endsWith(`.${junk}`))) return false;
  return true;
}

async function fetchPage(url: string, timeoutMs: number): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AdSalesToolkitBot/1.0)" },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// Tries the homepage, then a single /contact guess if the homepage
// didn't have one - two fetches max, so a slow or dead site doesn't hold
// up the whole batch search it's part of.
export async function findEmailForWebsite(websiteUrl: string): Promise<string> {
  if (!websiteUrl) return "";
  let siteDomain: string;
  try {
    siteDomain = new URL(websiteUrl).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }

  const pagesToTry = [websiteUrl, new URL("/contact", websiteUrl).toString()];

  for (const pageUrl of pagesToTry) {
    const html = await fetchPage(pageUrl, 4000);
    if (!html) continue;
    const emails = extractCandidateEmails(html).filter(isPlausibleEmail);
    if (emails.length === 0) continue;
    // Prefer an address on the business's own domain over a third-party
    // one (a support widget, an ad script, etc.) that happened to leak
    // into the page.
    const ownDomainMatch = emails.find((e) => e.toLowerCase().split("@")[1]?.endsWith(siteDomain));
    return (ownDomainMatch ?? emails[0]).toLowerCase();
  }
  return "";
}

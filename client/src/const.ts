export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Clerk publishable key (set via VITE_CLERK_PUBLISHABLE_KEY env var)
export const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string;

// Clerk Account Portal hosted sign-in URL (works on any domain, including Railway)
const CLERK_ACCOUNT_PORTAL_SIGN_IN = "https://caring-duck-98.accounts.dev/sign-in";

// Generate login URL — redirects to Clerk's hosted Account Portal sign-in page.
// The redirect_url tells Clerk where to send the user after successful sign-in.
export const getLoginUrl = (returnPath?: string) => {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const returnTo = returnPath ?? (typeof window !== 'undefined' ? window.location.pathname : '/');
  const redirectUrl = `${origin}${returnTo}`;
  return `${CLERK_ACCOUNT_PORTAL_SIGN_IN}?redirect_url=${encodeURIComponent(redirectUrl)}`;
};

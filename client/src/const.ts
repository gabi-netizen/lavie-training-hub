export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Clerk publishable key (set via VITE_CLERK_PUBLISHABLE_KEY env var)
export const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string;

// Generate login URL — redirects to Clerk's hosted sign-in page.
export const getLoginUrl = (returnPath?: string) => {
  const returnTo = returnPath ?? (typeof window !== 'undefined' ? window.location.pathname : '/');
  return `/sign-in?redirect_url=${encodeURIComponent(returnTo)}`;
};

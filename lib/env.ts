// next.config.ts imports this, so a missing value stops `next dev`,
// `next build` and `next start` at boot instead of surfacing later as an
// anonymous database client or a redirect to Clerk's hosted pages.

const missing: string[] = [];

function need(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    missing.push(name);
    return "";
  }
  return value;
}

export const env = {
  clerkPublishableKey: need("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"),
  clerkSecretKey: need("CLERK_SECRET_KEY"),
  // Without these Clerk silently falls back to its hosted Account Portal, and
  // different sign-in methods can end up landing in different places.
  clerkSignInUrl: need("NEXT_PUBLIC_CLERK_SIGN_IN_URL"),
  clerkSignUpUrl: need("NEXT_PUBLIC_CLERK_SIGN_UP_URL"),
  clerkSignInFallbackRedirectUrl: need("NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL"),
  clerkSignUpFallbackRedirectUrl: need("NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL"),
  supabaseUrl: need("NEXT_PUBLIC_SUPABASE_URL"),
  supabasePublishableKey: need("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
};

if (missing.length > 0) {
  throw new Error(
    `Missing environment variables (set them in .env.local): ${missing.join(", ")}`,
  );
}

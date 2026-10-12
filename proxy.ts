import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)", "/welcome"]);

// Everything is protected unless listed above, and the redirect happens here,
// before any page renders, so a signed-out visitor never receives its HTML.
// The root is the one exception: signed out, it serves the landing page in
// place of the dashboard, so the address a stranger types is the one that
// explains the product.
export default clerkMiddleware(async (auth, req) => {
  if (req.nextUrl.pathname === "/") {
    const { userId } = await auth();
    if (!userId) return NextResponse.rewrite(new URL("/welcome", req.url));
    return;
  }
  if (!isPublicRoute(req)) await auth.protect();
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};

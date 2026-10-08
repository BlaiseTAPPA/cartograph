import { SignIn } from "@clerk/nextjs";
import { Suspense } from "react";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      {/* SignIn reads the URL, which cacheComponents can't prerender. */}
      <Suspense>
        <SignIn />
      </Suspense>
    </div>
  );
}

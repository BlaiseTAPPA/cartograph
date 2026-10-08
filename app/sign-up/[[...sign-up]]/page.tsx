import { SignUp } from "@clerk/nextjs";
import { Suspense } from "react";

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      {/* SignUp reads the URL, which cacheComponents can't prerender. */}
      <Suspense>
        <SignUp />
      </Suspense>
    </div>
  );
}

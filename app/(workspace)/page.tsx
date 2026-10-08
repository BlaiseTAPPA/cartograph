import { auth } from "@clerk/nextjs/server";
import { Suspense } from "react";

export default function WorkspacePage() {
  return (
    // Auth is a request read; it streams inside the server HTML rather than
    // waiting for the client to hydrate.
    <Suspense fallback={null}>
      <CurrentOrganization />
    </Suspense>
  );
}

async function CurrentOrganization() {
  // Everything here comes off the verified session token. No call to Clerk.
  const { orgId, sessionClaims } = await auth();

  if (!orgId) {
    return <p className="px-3 py-2 text-xs text-muted">No active organization.</p>;
  }

  const orgName = sessionClaims?.org_name;
  if (!orgName) {
    throw new Error(
      'The session token has no org_name claim. Add {"org_name": "{{org.name}}"} under Clerk Dashboard → Sessions → Customize session token.',
    );
  }

  return (
    <div className="flex items-baseline gap-2 border-b border-line px-3 py-2 text-xs">
      <span className="font-medium">{orgName}</span>
      <span className="font-mono text-muted">{orgId}</span>
    </div>
  );
}

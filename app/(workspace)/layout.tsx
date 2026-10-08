import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import { ThemeControl } from "../theme-control";

// The shell every signed-in screen renders inside: one top bar, then the
// workspace. Later phases fill the main area; they don't move the bar.
export default function WorkspaceLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="flex h-9 shrink-0 items-center justify-between gap-3 border-b border-line bg-raised px-3">
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs">cartograph</span>
          <OrganizationSwitcher
            hidePersonal
            afterCreateOrganizationUrl="/"
            afterSelectOrganizationUrl="/"
            afterLeaveOrganizationUrl="/"
          />
        </div>
        <div className="flex items-center gap-3">
          <ThemeControl />
          <UserButton />
        </div>
      </header>
      <main className="flex min-h-0 flex-1 flex-col">{children}</main>
    </div>
  );
}

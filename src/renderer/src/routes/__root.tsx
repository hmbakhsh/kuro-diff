import { useEffect, useState } from "react";
import {
  createRootRoute,
  Outlet,
  useMatches,
  useNavigate,
} from "@tanstack/react-router";
import { trpc } from "@renderer/trpc";
import { WorkspaceSidebar } from "@renderer/components/workspace/WorkspaceSidebar";
import { Titlebar } from "@renderer/components/layout/Titlebar";
import { CommandMenu } from "@renderer/components/layout/CommandMenu";
import { CopyForAgentPalette } from "@renderer/components/copy/CopyForAgentPalette";
import {
  CaptureStoreContext,
  useProvideCaptureStore,
} from "@renderer/lib/capture-context";
import { useGlobalShortcuts } from "@renderer/hooks/useKeyboardShortcuts";

type MenuCommand =
  | "file.open-repo"
  | "file.settings"
  | "view.toggle-sidebar"
  | "view.toggle-theme"
  | "go.files"
  | "go.diffs"
  | "go.commits"
  | "go.prs"
  | "go.settings"
  | "go.next-tab"
  | "go.prev-tab"
  | "palette.command"
  | "palette.copy-for-agent";

const MENU_CHANNEL = "kuro:menu";

type Tab = "files" | "diffs" | "commits" | "prs";
const TABS: Tab[] = ["files", "diffs", "commits", "prs"];

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  const matches = useMatches();
  const navigate = useNavigate();
  const [commandOpen, setCommandOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const utils = trpc.useUtils();

  useGlobalShortcuts({
    onCommandPalette: () => setCommandOpen((v) => !v),
    onCopyForAgent: () => setCopyOpen(true),
  });

  const captureStore = useProvideCaptureStore();

  const activeRepoId =
    matches
      .map((m) => (m.params as { repoId?: string }).repoId)
      .find((v): v is string => typeof v === "string") ?? null;
  const activeWorktreeId =
    matches
      .map((m) => (m.params as { worktreeId?: string }).worktreeId)
      .find((v): v is string => typeof v === "string") ?? null;

  const addRepo = trpc.workspace.addRepoFromDialog.useMutation({
    onSuccess: () => void utils.workspace.list.invalidate(),
  });
  const prefsQuery = trpc.preferences.get.useQuery(undefined, {
    staleTime: 60_000,
  });
  const setPrefs = trpc.preferences.set.useMutation({
    onSuccess: () => void utils.preferences.get.invalidate(),
  });

  useEffect(() => {
    const api = window.electron?.ipcRenderer;
    if (!api) return;
    const currentTabIndex = (): number => {
      const last = matches[matches.length - 1]?.routeId ?? "";
      if (last.includes("/files")) return 0;
      if (last.includes("/diffs")) return 1;
      if (last.includes("/commits")) return 2;
      if (last.includes("/prs")) return 3;
      return 0;
    };
    function navigateToTab(tab: Tab): void {
      if (!activeRepoId) return;
      if (tab === "prs") {
        void navigate({
          to: "/repos/$repoId/prs",
          params: { repoId: activeRepoId },
        });
        return;
      }
      if (!activeWorktreeId) return;
      const to =
        tab === "files"
          ? "/repos/$repoId/wt/$worktreeId/files"
          : tab === "diffs"
            ? "/repos/$repoId/wt/$worktreeId/diffs"
            : "/repos/$repoId/wt/$worktreeId/commits";
      void navigate({
        to,
        params: { repoId: activeRepoId, worktreeId: activeWorktreeId },
      });
    }
    const handler = (_event: unknown, command: MenuCommand): void => {
      switch (command) {
        case "file.open-repo":
          addRepo.mutate();
          return;
        case "file.settings":
        case "go.settings":
          void navigate({ to: "/settings" });
          return;
        case "palette.command":
          setCommandOpen((v) => !v);
          return;
        case "palette.copy-for-agent":
          setCopyOpen(true);
          return;
        case "view.toggle-sidebar":
          setSidebarHidden((v) => !v);
          return;
        case "view.toggle-theme": {
          const current = prefsQuery.data?.theme ?? "system";
          const next =
            current === "light"
              ? "dark"
              : current === "dark"
                ? "system"
                : "light";
          setPrefs.mutate({ theme: next });
          return;
        }
        case "go.files":
          navigateToTab("files");
          return;
        case "go.diffs":
          navigateToTab("diffs");
          return;
        case "go.commits":
          navigateToTab("commits");
          return;
        case "go.prs":
          navigateToTab("prs");
          return;
        case "go.next-tab": {
          const idx = (currentTabIndex() + 1) % TABS.length;
          navigateToTab(TABS[idx]!);
          return;
        }
        case "go.prev-tab": {
          const idx = (currentTabIndex() - 1 + TABS.length) % TABS.length;
          navigateToTab(TABS[idx]!);
          return;
        }
      }
    };
    const unsubscribe = api.on(MENU_CHANNEL, handler);
    return () => {
      unsubscribe();
    };
  }, [
    activeRepoId,
    activeWorktreeId,
    addRepo,
    matches,
    navigate,
    prefsQuery.data,
    setPrefs,
  ]);

  return (
    <CaptureStoreContext.Provider value={captureStore}>
      <div className="flex h-full min-h-0">
        {!sidebarHidden && (
          <WorkspaceSidebar
            activeRepoId={activeRepoId}
            activeWorktreeId={activeWorktreeId}
            onSelectWorktree={(repoId, worktreeId) =>
              void navigate({
                to: "/repos/$repoId/wt/$worktreeId/files",
                params: { repoId, worktreeId },
              })
            }
          />
        )}
        <main className="flex min-w-0 flex-1 flex-col">
          <Titlebar repoId={activeRepoId} worktreeId={activeWorktreeId} />
          <div className="flex-1 overflow-hidden">
            <Outlet />
          </div>
        </main>
      </div>
      <CommandMenu open={commandOpen} onOpenChange={setCommandOpen} />
      <CopyForAgentPalette open={copyOpen} onOpenChange={setCopyOpen} />
    </CaptureStoreContext.Provider>
  );
}

"use client";

import { updateFolderUserRoleAction } from "@/lib/actions/update-folder-user-role";
import {
  FOLDER_USER_ROLE,
  FOLDER_WORKSPACE_ACCESS,
} from "@/lib/folder/constants";
import { Folder, FolderUser } from "@/lib/folder/types";
import {
  useCheckFolderPermission,
  useFolderPermissions,
} from "@/lib/swr/use-folder-permissions";
import useWorkspace from "@/lib/swr/use-workspace";
import { FolderAccessIcon } from "@/ui/folders/folder-access-icon";
import { FolderEditAccessRequestButton } from "@/ui/folders/request-edit-button";
import { Avatar, BlurImage, Globe } from "@dub/ui";
import { cn, DICEBEAR_AVATAR_URL, fetcher, nFormatter } from "@dub/utils";
import { FolderUserRole } from "@prisma/client";
import { ChevronLeft } from "lucide-react";
import { useSession } from "next-auth/react";
import { useAction } from "next-safe-action/hooks";
import Link from "next/link";
import { notFound } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";

export const FolderUsersPageClient = ({ folderId }: { folderId: string }) => {
  const [isUpdating, setIsUpdating] = useState(false);
  const workspace = useWorkspace();
  const [workspaceAccessLevel, setWorkspaceAccessLevel] = useState<string>();

  const { isLoading: isLoadingPermissions } = useFolderPermissions();
  const canUpdateFolder = useCheckFolderPermission(folderId, "folders.write");
  const canMoveLinks = useCheckFolderPermission(
    folderId,
    "folders.links.write",
  );

  const {
    data: folder,
    isLoading: isFolderLoading,
    mutate: mutateFolder,
  } = useSWR<Folder>(
    `/api/folders/${folderId}?workspaceId=${workspace.id}`,
    fetcher,
  );

  const {
    data: users,
    isLoading: isUsersLoading,
    isValidating: isUsersValidating,
    mutate: mutateUsers,
  } = useSWR<FolderUser[]>(
    `/api/folders/${folderId}/users?workspaceId=${workspace.id}`,
    fetcher,
    {
      revalidateOnFocus: false,
      keepPreviousData: true,
    },
  );

  if (!isFolderLoading && !folder) {
    notFound();
  }

  const updateWorkspaceAccessLevel = async (accessLevel: string) => {
    setIsUpdating(true);
    setWorkspaceAccessLevel(accessLevel);

    const response = await fetch(
      `/api/folders/${folderId}?workspaceId=${workspace.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessLevel: accessLevel === "" ? null : accessLevel,
        }),
      },
    );

    setIsUpdating(false);

    if (!response.ok) {
      const error = await response.json();
      toast.error(error.message);
      return;
    }

    toast.success("Workspace access updated!");
    await Promise.all([mutateFolder(), mutateUsers()]);
  };

  return (
    <>
      <Link
        href={`/${workspace.slug}/settings/folders`}
        className="flex items-center gap-x-1"
      >
        <ChevronLeft className="size-4" />
        <p className="text-sm font-medium text-gray-500">Folders</p>
      </Link>

      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b px-5 py-6 sm:flex-row sm:space-y-0">
          {folder ? (
            <>
              <div className="flex items-center gap-x-6">
                <FolderAccessIcon folder={folder} />
                <div className="flex flex-col gap-2">
                  <span className="text-sm font-semibold leading-none text-gray-900">
                    {folder.name}
                  </span>
                  <div className="flex items-center gap-1">
                    <Globe className="size-3.5 text-gray-500" />
                    <span className="text-[13px] font-normal leading-[14.30px] text-gray-500">
                      {nFormatter(folder.linkCount)} link
                      {folder.linkCount !== 1 && "s"}
                    </span>
                  </div>
                </div>
              </div>

              {canUpdateFolder && !isLoadingPermissions && (
                <div className="relative flex items-center">
                  <BlurImage
                    src={
                      workspace.logo ||
                      `${DICEBEAR_AVATAR_URL}${workspace.name}`
                    }
                    alt={workspace.name || "Workspace logo"}
                    className="absolute left-2 size-6 shrink-0 overflow-hidden rounded-full"
                    width={20}
                    height={20}
                  />

                  <select
                    className="appearance-none rounded-md border border-gray-200 bg-white pl-10 pr-8 text-sm text-gray-900 focus:border-gray-300 focus:ring-gray-300"
                    value={workspaceAccessLevel || folder?.accessLevel || ""}
                    disabled={isUpdating}
                    onChange={(e) => {
                      updateWorkspaceAccessLevel(e.target.value);
                    }}
                  >
                    {Object.keys(FOLDER_WORKSPACE_ACCESS).map((access) => (
                      <option value={access} key={access}>
                        {FOLDER_WORKSPACE_ACCESS[access]}
                      </option>
                    ))}
                    <option value="" key="no-access">
                      No access
                    </option>
                  </select>
                </div>
              )}

              {!canMoveLinks && !isLoadingPermissions && (
                <FolderEditAccessRequestButton
                  folderId={folder.id}
                  workspaceId={workspace.id!}
                />
              )}
            </>
          ) : (
            <FolderPlaceholder />
          )}
        </div>

        <div className="grid divide-y divide-gray-200">
          {isUsersValidating || isUsersLoading
            ? Array.from({ length: 5 }).map((_, i) => (
                <FolderUserPlaceholder key={i} />
              ))
            : folder &&
              users?.map((user) => (
                <FolderUserRow key={user.id} user={user} folder={folder} />
              ))}
        </div>
      </div>
    </>
  );
};

const FolderUserRow = ({
  user,
  folder,
}: {
  user: FolderUser;
  folder: Folder;
}) => {
  const { data: session } = useSession();
  const { id: workspaceId } = useWorkspace();
  const [role, setRole] = useState<FolderUserRole>(user.role);

  const canUpdateRole = useCheckFolderPermission(
    folder.id,
    "folders.users.write",
  );

  const { executeAsync, isExecuting } = useAction(updateFolderUserRoleAction, {
    onSuccess: () => {
      toast.success("Role updated!");
    },
    onError: ({ error }) => {
      toast.error(error.serverError?.serverError);
    },
  });

  const isCurrentUser = user.email === session?.user?.email;
  const disableRoleUpdate = !canUpdateRole || isExecuting || isCurrentUser;

  return (
    <div
      key={user.id}
      className="flex items-center justify-between space-x-3 px-5 py-3"
    >
      <div className="flex items-start space-x-3">
        <div className="flex items-center space-x-3">
          <Avatar user={user} />
          <div className="flex flex-col">
            <h3 className="text-xs font-medium text-gray-800">
              {user.name || user.email}
            </h3>
            <p className="text-xs font-normal text-gray-400">{user.email}</p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-x-3">
        <select
          className={cn(
            "rounded-md border border-gray-200 text-xs text-gray-900 focus:border-gray-600 focus:ring-gray-600",
            {
              "cursor-not-allowed bg-gray-100": disableRoleUpdate,
            },
          )}
          value={role === null ? "" : role}
          disabled={disableRoleUpdate}
          onChange={(e) => {
            if (!folder || !workspaceId) {
              return;
            }

            const role = (e.target.value as FolderUserRole) || null;

            executeAsync({
              workspaceId,
              folderId: folder.id,
              userId: user.id,
              role,
            });

            setRole(role);
          }}
        >
          {Object.keys(FOLDER_USER_ROLE).map((role) => (
            <option value={role} key={role}>
              {FOLDER_USER_ROLE[role]}
            </option>
          ))}

          <option value="" key="no-access">
            No access
          </option>
        </select>
      </div>
    </div>
  );
};

const FolderPlaceholder = () => (
  <>
    <div className="flex items-center gap-x-4">
      <div className="h-10 w-10 animate-pulse rounded-full bg-gray-200" />
      <div className="flex flex-col gap-2">
        <div className="h-4 w-32 animate-pulse rounded bg-gray-200" />
        <div className="flex items-center gap-1">
          <div className="h-3.5 w-3.5 animate-pulse rounded bg-gray-200" />
          <div className="h-3 w-24 animate-pulse rounded bg-gray-200" />
        </div>
      </div>
    </div>
    <div className="h-6 w-24 animate-pulse rounded bg-gray-200" />
  </>
);

const FolderUserPlaceholder = () => (
  <div className="flex items-center justify-between space-x-3 px-5 py-3">
    <div className="flex items-center space-x-3">
      <div className="h-10 w-10 animate-pulse rounded-full bg-gray-200" />
      <div className="flex flex-col">
        <div className="h-4 w-24 animate-pulse rounded bg-gray-200" />
        <div className="mt-1 h-3 w-32 animate-pulse rounded bg-gray-200" />
      </div>
    </div>
    <div className="h-3 w-24 animate-pulse rounded bg-gray-200" />
  </div>
);
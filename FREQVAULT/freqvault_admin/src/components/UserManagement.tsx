import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  AlertCircle,
  Ban,
  CheckCircle,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
  TriangleAlert,
  Users
} from "lucide-react";
import { apiFetch, readApiJson } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import { StateCard } from "@/components/StateCard";
import { StatusBadge } from "@/components/StatusBadge";

interface User {
  _id: string;
  email: string;
  status: "active" | "suspended" | "deleted";
  createdAt: string;
  lastLogin: string | null;
}

interface UsersResponse {
  users?: User[];
  value?: User[];
}

type ActionType = "suspend" | "unsuspend" | "delete";
type StatusFilter = "all" | "active" | "suspended" | "deleted";

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error) return error.message;
  return fallback;
};

const getStatusBadge = (status: User["status"]) => {
  switch (status) {
    case "active":
      return <StatusBadge label="Active" tone="success" />;
    case "suspended":
      return <StatusBadge label="Suspended" tone="warning" />;
    case "deleted":
      return <StatusBadge label="Deleted" tone="danger" />;
    default:
      return <StatusBadge label={status} tone="neutral" />;
  }
};

const formatDate = (dateString: string | null) => {
  if (!dateString) return "Never";
  return new Date(dateString).toLocaleString();
};

export const UserManagement = () => {
  const { toast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchEmail, setSearchEmail] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showReasonDialog, setShowReasonDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [currentAction, setCurrentAction] = useState<ActionType | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiFetch("/api/admin/users");
      const parsed = await readApiJson<UsersResponse | User[]>(res);
      if (!res.ok || !parsed.success) throw new Error(parsed.error || "Failed to fetch users");

      const payload = parsed.data;
      const list = Array.isArray(payload)
        ? payload
        : Array.isArray(payload.users)
          ? payload.users
          : Array.isArray(payload.value)
            ? payload.value
            : [];

      setUsers(list);
    } catch (err: unknown) {
      const message = getErrorMessage(err, "Failed to load users. Please try again.");
      setError(message);
      toast({
        title: "Failed to load users",
        description: message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  const filteredUsers = useMemo(() => {
    const normalizedSearch = searchEmail.trim().toLowerCase();
    return users.filter((user) => {
      const emailMatch = normalizedSearch
        ? user.email.toLowerCase().includes(normalizedSearch)
        : true;
      const statusMatch = statusFilter === "all" ? true : user.status === statusFilter;
      return emailMatch && statusMatch;
    });
  }, [users, searchEmail, statusFilter]);

  const resetActionState = () => {
    setShowConfirmDialog(false);
    setShowReasonDialog(false);
    setDeleteReason("");
    setSelectedUser(null);
    setCurrentAction(null);
  };

  const handleActionClick = (user: User, action: ActionType) => {
    setSelectedUser(user);
    setCurrentAction(action);
    if (action === "delete") {
      setShowReasonDialog(true);
      return;
    }
    setShowConfirmDialog(true);
  };

  const handleConfirmAction = async () => {
    if (!selectedUser || !currentAction) return;

    setIsSubmitting(true);
    try {
      let endpoint = "";
      let method: "POST" | "DELETE" = "POST";
      let body: Record<string, unknown> = {};

      if (currentAction === "suspend") {
        endpoint = `/api/admin/users/${selectedUser._id}/suspend`;
        body = { reason: "Admin action" };
      } else if (currentAction === "unsuspend") {
        endpoint = `/api/admin/users/${selectedUser._id}/unsuspend`;
      } else {
        endpoint = `/api/admin/users/${selectedUser._id}`;
        method = "DELETE";
        body = { reason: deleteReason };
      }

      const res = await apiFetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const parsed = await readApiJson<{ message?: string }>(res);
      if (!res.ok || !parsed.success) throw new Error(parsed.error || "Failed to perform action");

      toast({
        title: "Success",
        description: parsed.data.message || `User ${currentAction} successfully`
      });

      resetActionState();
      await fetchUsers();
    } catch (err: unknown) {
      toast({
        title: "Action failed",
        description: getErrorMessage(err, `Failed to ${currentAction} user. Please try again.`),
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getActionButtons = (user: User) => {
    if (user.status === "deleted") return null;

    const disabled = isSubmitting;
    return (
      <div className="flex gap-2">
        {user.status === "active" && (
          <>
            <Button
              size="sm"
              variant="outline"
              title="Suspend user"
              onClick={() => handleActionClick(user, "suspend")}
              className="border-[#d0d7de] bg-white text-[#bc4c00] hover:bg-[#fff8f1] dark:border-[#30363d] dark:bg-[#161b22] dark:text-[#f69d50] dark:hover:bg-[#1f1410]"
              disabled={disabled}
              aria-label={`Suspend ${user.email}`}
            >
              <Ban className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="destructive"
              title="Delete user"
              onClick={() => handleActionClick(user, "delete")}
              disabled={disabled}
              aria-label={`Delete ${user.email}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        )}
        {user.status === "suspended" && (
          <>
            <Button
              size="sm"
              variant="outline"
              title="Unsuspend user"
              onClick={() => handleActionClick(user, "unsuspend")}
              className="border-[#d0d7de] bg-white text-[#1a7f37] hover:bg-[#f0fff4] dark:border-[#30363d] dark:bg-[#161b22] dark:text-[#3fb950] dark:hover:bg-[#0f1d12]"
              disabled={disabled}
              aria-label={`Unsuspend ${user.email}`}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="destructive"
              title="Delete user"
              onClick={() => handleActionClick(user, "delete")}
              disabled={disabled}
              aria-label={`Delete ${user.email}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="User Management"
        description="Manage user accounts and permissions"
        icon={<Users className="h-8 w-8" />}
        badges={[
          { label: `Visible: ${filteredUsers.length}`, variant: "secondary" },
          { label: `Total: ${users.length}`, variant: "outline" }
        ]}
        actions={[
          {
            id: "refresh",
            node: (
              <Button variant="outline" size="sm" onClick={() => void fetchUsers()} disabled={loading}>
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            )
          }
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Filters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="user-search" className="text-sm font-medium">
                Search by email
              </label>
              <div className="relative mt-1">
                <Input
                  id="user-search"
                  placeholder="Search email..."
                  value={searchEmail}
                  onChange={(e) => setSearchEmail(e.target.value)}
                  className="pl-10"
                />
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>
            <div>
              <p className="text-sm font-medium">Status</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(["all", "active", "suspended", "deleted"] as const).map((status) => (
                  <Button
                    key={status}
                    variant={statusFilter === status ? "default" : "outline"}
                    size="sm"
                    onClick={() => setStatusFilter(status)}
                  >
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          {(searchEmail || statusFilter !== "all") && (
            <div className="text-right">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchEmail("");
                  setStatusFilter("all");
                }}
              >
                Reset filters
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {loading ? (
        <StateCard
          icon={<Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
          title="Loading users..."
          titleClassName="text-muted-foreground"
        />
      ) : error ? (
        <StateCard
          icon={<TriangleAlert className="h-8 w-8 text-destructive" />}
          title="Failed to load users"
          description={error}
          actionLabel="Retry"
          onAction={() => void fetchUsers()}
          className="border-destructive/40"
          titleClassName="text-destructive"
        />
      ) : filteredUsers.length === 0 ? (
        <StateCard
          icon={<AlertCircle className="mx-auto mb-1 h-12 w-12 text-muted-foreground" />}
          title="No users found"
          titleClassName="text-base text-muted-foreground"
        />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4">
            {filteredUsers.map((user) => (
              <Card key={user._id} className="transition-colors duration-150 hover:bg-[#fcfcfd] dark:hover:bg-[#161b22]">
                <CardContent className="p-5">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="mb-3 flex items-center gap-2">
                        <p className="truncate text-base font-semibold">{user.email}</p>
                        {getStatusBadge(user.status)}
                      </div>
                      <div className="grid grid-cols-1 gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                        <div>
                          <span className="font-medium">Joined:</span> {formatDate(user.createdAt)}
                        </div>
                        <div>
                          <span className="font-medium">Last Login:</span> {formatDate(user.lastLogin)}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">{getActionButtons(user)}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <AlertDialog
        open={showConfirmDialog}
        onOpenChange={(open) => {
          if (isSubmitting) return;
          setShowConfirmDialog(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Action</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to{" "}
              {currentAction === "suspend" && "suspend"}
              {currentAction === "unsuspend" && "unsuspend"}
              {currentAction === "delete" && "delete"} <strong>{selectedUser?.email}</strong>?
              {currentAction === "suspend" && " They will not be able to access their account."}
              {currentAction === "unsuspend" && " They will regain access to their account."}
              {currentAction === "delete" && " This action can be recovered within 30 days."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmAction} disabled={isSubmitting}>
              {isSubmitting ? "Processing..." : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={showReasonDialog}
        onOpenChange={(open) => {
          if (isSubmitting) return;
          setShowReasonDialog(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete User Account</DialogTitle>
            <DialogDescription>
              You are about to delete the account for <strong>{selectedUser?.email}</strong>.
              <br />
              Please provide a reason for the deletion (minimum 5 characters).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              placeholder="Reason for deletion..."
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              className="min-h-24"
            />
            <p className="text-xs text-muted-foreground">Characters: {deleteReason.length}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReasonDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteReason.length < 5) {
                  toast({
                    title: "Invalid Reason",
                    description: "Reason must be at least 5 characters",
                    variant: "destructive"
                  });
                  return;
                }
                setShowReasonDialog(false);
                setShowConfirmDialog(true);
              }}
              disabled={isSubmitting || deleteReason.length < 5}
            >
              {isSubmitting ? "Processing..." : "Continue to Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

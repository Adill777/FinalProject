import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, Loader2, RefreshCw, Upload, User as UserIcon } from "lucide-react";
import { apiFetch, readApiJson } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import { StateCard } from "@/components/StateCard";
import { StatusBadge } from "@/components/StatusBadge";

interface User {
  _id: string;
  email: string;
  name?: string;
  status?: "active" | "suspended" | "deleted";
}

interface UserListApiItem {
  _id: string;
  email: string;
  name?: string;
  status?: "active" | "suspended" | "deleted";
}

interface UserListProps {
  onSelectUser: (user: User) => void;
}

const statusBadge = (status: User["status"]) => {
  const s = status || "active";
  if (s === "active") {
    return <StatusBadge label="Active" tone="success" />;
  }
  if (s === "suspended") {
    return <StatusBadge label="Suspended" tone="warning" />;
  }
  return <StatusBadge label="Deleted" tone="danger" />;
};

export const UserList = ({ onSelectUser }: UserListProps) => {
  const { toast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiFetch("/api/admin/userlist");
      const parsed = await readApiJson<UserListApiItem[] | { value?: UserListApiItem[] }>(res);
      if (!res.ok || !parsed.success) throw new Error(parsed.error || "Failed to fetch users");

      const payload = parsed.data;
      const rawList = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.value)
          ? payload.value
          : [];

      const list = rawList.map((u) => ({
        ...u,
        name: u.name || u.email.split("@")[0],
        status: u.status || "active"
      }));
      setUsers(list);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to fetch users";
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

  const handleSelectUser = (user: User) => {
    setSelectedUserId(user._id);
    onSelectUser(user);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="User Management"
        description="Select a user to upload files"
        badges={[{ label: `Users: ${users.length}`, variant: "secondary" }]}
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
        className="text-center"
      />

      {loading ? (
        <StateCard
          icon={<Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
          title="Loading users..."
          titleClassName="text-muted-foreground"
          className="mx-auto max-w-2xl"
        />
      ) : error ? (
        <StateCard
          icon={<AlertCircle className="mx-auto mb-1 h-8 w-8 text-destructive" />}
          title="Failed to load users"
          description={error}
          actionLabel="Retry"
          onAction={() => void fetchUsers()}
          className="mx-auto max-w-2xl border-destructive/40"
          titleClassName="text-destructive"
        />
      ) : users.length === 0 ? (
        <StateCard
          title="No active users available for file upload."
          titleClassName="text-muted-foreground"
          className="mx-auto max-w-2xl"
        />
      ) : (
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {users.map((user) => (
            <Card
              key={user._id}
              className={`cursor-pointer transition-colors duration-150 ${
                selectedUserId === user._id
                  ? "border-[#0969da] bg-[#eef6ff] dark:border-[#388bfd] dark:bg-[#0d1d2a]"
                  : "hover:bg-[#f6f8fa] dark:hover:bg-[#161b22]"
              }`}
              onClick={() => handleSelectUser(user)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  handleSelectUser(user);
                }
              }}
              role="button"
              tabIndex={0}
              aria-label={`Select ${user.email} for file upload`}
              aria-pressed={selectedUserId === user._id}
            >
              <CardHeader className="pb-4">
                <div className="flex items-center space-x-3">
                  <div className="rounded-full bg-[#ddf4ff] p-2 dark:bg-[#13233a]">
                    <UserIcon className="h-6 w-6 text-[#0969da] dark:text-[#58a6ff]" />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-base">{user.name}</CardTitle>
                    <CardDescription className="text-sm">{user.email}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center justify-between">
                  {statusBadge(user.status)}
                  {selectedUserId === user._id && (
                    <Button size="sm" className="bg-[#0969da] hover:bg-[#0550ae]">
                      <Upload className="mr-2 h-4 w-4" />
                      Upload File
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

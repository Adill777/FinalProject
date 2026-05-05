import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { apiFetch, getAdminEmail, readApiJson } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";

interface NotificationItem {
  _id: string;
  eventType: string;
  title: string;
  message: string;
  readAt: string | null;
  createdAt: string;
}

const CRITICAL_ADMIN_EVENTS = new Set(["request_submitted"]);
const SEEN_NOTIFICATIONS_STORAGE_KEY_PREFIX = "admin_seen_notification_ids";
const MAX_SEEN_IDS = 300;

export const NotificationCenter = () => {
  const [isOpen, setIsOpen] = useState(false);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const hasBootstrappedSeenIdsRef = useRef(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isAuthenticated, isBootstrapping } = useAuth();
  const notificationsEnabled = isAuthenticated && !isBootstrapping;
  const adminEmail = getAdminEmail().trim().toLowerCase();
  const notificationStorageKey = useMemo(() => {
    return `${SEEN_NOTIFICATIONS_STORAGE_KEY_PREFIX}:${adminEmail || "anonymous"}`;
  }, [adminEmail]);

  const notificationsQuery = useQuery({
    queryKey: ["admin-notifications"],
    queryFn: async () => {
      const response = await apiFetch("/api/admin/notifications?limit=50");
      const parsed = await readApiJson<{ notifications?: NotificationItem[] }>(response);
      if (!response.ok || !parsed.success) {
        throw new Error(parsed.error || "Failed to fetch notifications");
      }
      return parsed.data.notifications || [];
    },
    refetchInterval: 15000,
    retry: 2,
    staleTime: 5000,
    enabled: notificationsEnabled
  });

  const notifications = useMemo(() => notificationsQuery.data || [], [notificationsQuery.data]);
  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.readAt).length,
    [notifications]
  );

  useEffect(() => {
    hasBootstrappedSeenIdsRef.current = false;
    try {
      const raw = sessionStorage.getItem(notificationStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return;
      const ids = parsed.filter((entry): entry is string => typeof entry === "string");
      seenIdsRef.current = new Set(ids);
    } catch {
      seenIdsRef.current = new Set();
    }
  }, [notificationStorageKey]);

  useEffect(() => {
    if (!notificationsEnabled) {
      hasBootstrappedSeenIdsRef.current = false;
      return;
    }
    if (!hasBootstrappedSeenIdsRef.current) {
      let hasChanges = false;
      for (const notification of notifications) {
        if (seenIdsRef.current.has(notification._id)) continue;
        seenIdsRef.current.add(notification._id);
        hasChanges = true;
      }
      hasBootstrappedSeenIdsRef.current = true;
      if (hasChanges) {
        const ids = Array.from(seenIdsRef.current);
        const trimmed = ids.length > MAX_SEEN_IDS ? ids.slice(ids.length - MAX_SEEN_IDS) : ids;
        seenIdsRef.current = new Set(trimmed);
        try {
          sessionStorage.setItem(notificationStorageKey, JSON.stringify(trimmed));
        } catch {
          // Ignore storage write failures (private mode / quota).
        }
      }
      return;
    }

    let hasChanges = false;
    for (const notification of notifications) {
      if (seenIdsRef.current.has(notification._id)) continue;
      seenIdsRef.current.add(notification._id);
      hasChanges = true;
      if (!notification.readAt && CRITICAL_ADMIN_EVENTS.has(notification.eventType)) {
        toast({
          title: notification.title,
          description: notification.message
        });
      }
    }

    if (hasChanges) {
      const ids = Array.from(seenIdsRef.current);
      const trimmed = ids.length > MAX_SEEN_IDS ? ids.slice(ids.length - MAX_SEEN_IDS) : ids;
      seenIdsRef.current = new Set(trimmed);
      try {
        sessionStorage.setItem(notificationStorageKey, JSON.stringify(trimmed));
      } catch {
        // Ignore storage write failures (private mode / quota).
      }
    }
  }, [notifications, toast, notificationsEnabled, notificationStorageKey]);

  const markOneReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      const response = await apiFetch(`/api/admin/notifications/${notificationId}/read`, {
        method: "PATCH"
      });
      const parsed = await readApiJson<Record<string, unknown>>(response);
      if (!response.ok || !parsed.success) {
        throw new Error(parsed.error || "Failed to mark notification as read");
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-notifications"] });
    }
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      const response = await apiFetch("/api/admin/notifications/read-all", {
        method: "POST"
      });
      const parsed = await readApiJson<Record<string, unknown>>(response);
      if (!response.ok || !parsed.success) {
        throw new Error(parsed.error || "Failed to mark notifications as read");
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-notifications"] });
    }
  });

  const markOneRead = async (notificationId: string) => {
    try {
      await markOneReadMutation.mutateAsync(notificationId);
    } catch (error) {
      toast({
        title: "Notification Error",
        description: error instanceof Error ? error.message : "Failed to mark notification as read",
        variant: "destructive"
      });
    }
  };

  const markAllRead = async () => {
    try {
      await markAllReadMutation.mutateAsync();
    } catch (error) {
      toast({
        title: "Notification Error",
        description: error instanceof Error ? error.message : "Failed to mark notifications as read",
        variant: "destructive"
      });
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="relative border-border">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <Badge className="absolute -right-2 -top-2 h-5 min-w-5 px-1 text-xs">
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-0" align="end">
        <div className="flex items-center justify-between px-4 py-3">
          <h3 className="text-sm font-semibold">Notifications</h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={markAllRead}
            disabled={unreadCount === 0 || markAllReadMutation.isPending}
          >
            <CheckCheck className="mr-1 h-4 w-4" />
            Read all
          </Button>
        </div>
        <Separator />
        <div className="max-h-[360px] overflow-y-auto">
          {notificationsQuery.isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">Loading notifications...</p>
          ) : notificationsQuery.isError ? (
            <p className="p-4 text-sm text-destructive">Failed to load notifications.</p>
          ) : notifications.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No notifications yet.</p>
          ) : (
            notifications.map((notification) => (
              <button
                key={notification._id}
                type="button"
                onClick={() => {
                  if (!notification.readAt) {
                    void markOneRead(notification._id);
                  }
                }}
                className={`w-full border-b px-4 py-3 text-left hover:bg-muted/60 ${
                  notification.readAt ? "opacity-75" : ""
                }`}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{notification.title}</span>
                  {!notification.readAt && <Badge variant="secondary">New</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">{notification.message}</p>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {new Date(notification.createdAt).toLocaleString()}
                </p>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

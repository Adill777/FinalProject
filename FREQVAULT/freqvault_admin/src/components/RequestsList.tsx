import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  CheckCircle,
  Clock,
  FileText,
  Loader2,
  RefreshCw,
  Search,
  TriangleAlert,
  XCircle
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { DarkModeToggle } from "@/components/ui/DarkModeToggle";
import { apiFetch, readApiJson } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import { StateCard } from "@/components/StateCard";
import { StatusBadge } from "@/components/StatusBadge";

interface FileRequest {
  id: string;
  fileName: string;
  userName: string;
  email: string;
  requestDate: string;
  status: "pending" | "approved" | "rejected";
  fileSize: string;
  description: string;
}

interface PendingRequestFile {
  filename?: string;
  length?: number;
  size?: number;
}

interface PendingRequestApiItem {
  _id: string;
  email: string;
  requestedAt?: string;
  createdAt?: string;
  status: FileRequest["status"];
  fileSize?: number | string;
  description?: string;
  fileId?: PendingRequestFile | string;
}

interface PendingRequestsApiResponse {
  requests?: PendingRequestApiItem[];
  error?: string;
}

type SortKey = "date" | "status" | "file" | "user";
type SortOrder = "asc" | "desc";
type ActionType = "approve" | "reject";

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  return "Request failed";
};

const parseBytes = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value && typeof value === "object") {
    const asRecord = value as Record<string, unknown>;
    const numberLong = asRecord.$numberLong;
    if (typeof numberLong === "string") {
      const parsed = Number(numberLong);
      return Number.isFinite(parsed) ? parsed : null;
    }
  }
  return null;
};

const formatFileSize = (value: unknown): string => {
  const bytes = parseBytes(value);
  if (bytes === null || bytes < 0) return "N/A";
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const normalized = bytes / Math.pow(1024, index);
  return `${normalized.toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
};

const getStatusMeta = (status: FileRequest["status"]) => {
  switch (status) {
    case "approved":
      return {
        icon: <CheckCircle className="h-4 w-4" />,
        tone: "success" as const,
        label: "Approved"
      };
    case "rejected":
      return {
        icon: <XCircle className="h-4 w-4" />,
        tone: "danger" as const,
        label: "Rejected"
      };
    default:
      return {
        icon: <Clock className="h-4 w-4" />,
        tone: "warning" as const,
        label: "Pending"
      };
  }
};

const filterAndSortRequests = (
  list: FileRequest[],
  searchTerm: string,
  sortKey: SortKey,
  sortOrder: SortOrder
) => {
  const normalizedTerm = searchTerm.trim().toLowerCase();
  const filtered = list.filter((item) => {
    if (!normalizedTerm) return true;
    return (
      item.fileName.toLowerCase().includes(normalizedTerm) ||
      item.userName.toLowerCase().includes(normalizedTerm) ||
      item.email.toLowerCase().includes(normalizedTerm)
    );
  });

  filtered.sort((a, b) => {
    let comp = 0;
    switch (sortKey) {
      case "date":
        comp = new Date(a.requestDate).getTime() - new Date(b.requestDate).getTime();
        break;
      case "status":
        comp = a.status.localeCompare(b.status);
        break;
      case "file":
        comp = a.fileName.localeCompare(b.fileName);
        break;
      case "user":
        comp = a.userName.localeCompare(b.userName);
        break;
    }
    return sortOrder === "asc" ? comp : -comp;
  });

  return filtered;
};

export const RequestsList = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [actionInFlight, setActionInFlight] = useState<string | null>(null);

  const requestsQuery = useQuery({
    queryKey: ["admin-requests"],
    queryFn: async () => {
      const res = await apiFetch("/api/admin/pending-requests");
      const parsed = await readApiJson<PendingRequestsApiResponse>(res);
      if (!res.ok || !parsed.success) throw new Error(parsed.error || "Failed to fetch pending requests");
      const data = parsed.data;

      const mapped: FileRequest[] = (data.requests || []).map((req) => ({
        id: req._id,
        fileName:
          typeof req.fileId === "string" ? req.fileId : req.fileId?.filename || "Unknown File",
        userName: req.email.split("@")[0] || "Unknown User",
        email: req.email,
        requestDate: req.requestedAt || req.createdAt || new Date().toISOString(),
        status: req.status,
        fileSize: formatFileSize(
          req.fileSize ??
            (typeof req.fileId === "object" && req.fileId
              ? req.fileId.length ?? req.fileId.size
              : undefined)
        ),
        description: req.description || "(no description provided)"
      }));
      return mapped;
    },
    retry: 2,
    staleTime: 10000,
  });

  const requests = useMemo(() => requestsQuery.data || [], [requestsQuery.data]);
  const loading = requestsQuery.isLoading;
  const error = requestsQuery.isError ? getErrorMessage(requestsQuery.error) : null;

  const runRequestAction = async (requestId: string, type: ActionType) => {
    if (actionInFlight) return;
    setActionInFlight(requestId);

    try {
      const isApprove = type === "approve";
      const endpoint = isApprove ? "/api/admin/approve-access" : `/api/admin/reject-request/${requestId}`;
      const init = isApprove
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ requestId })
          }
        : { method: "POST" };

      const res = await apiFetch(endpoint, init);
      const parsed = await readApiJson<{ error?: string }>(res);
      if (!res.ok || !parsed.success) throw new Error(parsed.error || `Failed to ${type} request`);
      await queryClient.invalidateQueries({ queryKey: ["admin-requests"] });
      toast({
        title: isApprove ? "Request approved" : "Request rejected",
        description: isApprove
          ? "Access granted successfully."
          : "Access rejected successfully."
      });
    } catch (err: unknown) {
      toast({
        title: "Action failed",
        description: getErrorMessage(err),
        variant: "destructive"
      });
    } finally {
      setActionInFlight(null);
    }
  };

  const pendingRequests = useMemo(
    () =>
      filterAndSortRequests(
        requests.filter((item) => item.status === "pending"),
        searchTerm,
        sortKey,
        sortOrder
      ),
    [requests, searchTerm, sortKey, sortOrder]
  );

  const processedRequests = useMemo(
    () =>
      filterAndSortRequests(
        requests.filter((item) => item.status !== "pending"),
        searchTerm,
        sortKey,
        sortOrder
      ),
    [requests, searchTerm, sortKey, sortOrder]
  );

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8">
      <PageHeader
        title="File Access Requests"
        description="Review and process user access requests with clear status tracking."
        badges={[
          { label: `Pending: ${pendingRequests.length}`, variant: "secondary" },
          { label: `Processed: ${processedRequests.length}`, variant: "outline" },
          { label: `Total: ${requests.length}`, variant: "outline" }
        ]}
        actions={[
          {
            id: "refresh",
            node: (
              <Button
                type="button"
                variant="outline"
                onClick={() => void requestsQuery.refetch()}
                disabled={loading || requestsQuery.isFetching}
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${loading || requestsQuery.isFetching ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            )
          },
          { id: "theme", node: <DarkModeToggle /> }
        ]}
        className="rounded-xl border border-[#d0d7de] bg-white p-5 shadow-sm dark:border-[#30363d] dark:bg-[#161b22]"
      />

      <Card>
        <CardContent className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-sm">
            <label htmlFor="request-search" className="sr-only">
              Search requests
            </label>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="request-search"
              type="text"
              placeholder="Search by file, user, or email"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 md:w-auto">
            <label htmlFor="request-sort" className="text-sm text-muted-foreground">
              Sort by
            </label>
            <select
              id="request-sort"
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="date">Date</option>
              <option value="status">Status</option>
              <option value="file">File</option>
              <option value="user">User</option>
            </select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"))}
              aria-label={`Sort order ${sortOrder === "asc" ? "ascending" : "descending"}`}
            >
              {sortOrder === "asc" ? "Ascending" : "Descending"}
            </Button>
            {(searchTerm || sortKey !== "date" || sortOrder !== "desc") && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchTerm("");
                  setSortKey("date");
                  setSortOrder("desc");
                }}
              >
                Reset
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <StateCard
          icon={<Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
          title="Loading requests..."
          titleClassName="text-muted-foreground"
        />
      ) : error ? (
        <StateCard
          icon={<TriangleAlert className="h-8 w-8 text-destructive" />}
          title="Failed to load requests"
          description={error}
          actionLabel="Retry"
          onAction={() => void requestsQuery.refetch()}
          className="border-destructive/40"
          titleClassName="text-destructive"
        />
      ) : (
        <>
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-yellow-600" />
              <h3 className="text-lg font-semibold text-foreground">Pending Requests</h3>
            </div>

            {pendingRequests.length === 0 ? (
              <StateCard title="No pending requests right now." titleClassName="text-muted-foreground" />
            ) : (
              <div className="grid gap-4">
                {pendingRequests.map((request) => {
                  const status = getStatusMeta(request.status);
                  const actionLoading = actionInFlight === request.id;

                  return (
                    <Card key={request.id} className="border border-[#d0d7de] shadow-sm dark:border-[#30363d]">
                      <CardHeader>
                        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                          <div className="flex items-start gap-3">
                            <div className="rounded-full bg-primary/10 p-2">
                              <FileText className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <CardTitle className="text-base">{request.fileName}</CardTitle>
                              <CardDescription>
                                Requested by <span className="font-medium">{request.userName}</span> (
                                {request.email})
                              </CardDescription>
                            </div>
                          </div>
                          <StatusBadge label={status.label} tone={status.tone} icon={status.icon} />
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid gap-4 text-sm md:grid-cols-3">
                          <div>
                            <p className="text-muted-foreground">File size</p>
                            <p className="font-medium text-foreground">{request.fileSize}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Requested at</p>
                            <p className="font-medium text-foreground">
                              {new Date(request.requestDate).toLocaleString()}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Reason</p>
                            <p className="font-medium text-foreground">{request.description}</p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 pt-2">
                          <Button
                            type="button"
                            onClick={() => void runRequestAction(request.id, "approve")}
                            className="bg-[#1a7f37] text-white hover:bg-[#116329]"
                            disabled={actionLoading}
                            aria-label={`Approve request for ${request.email}`}
                          >
                            {actionLoading ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <CheckCircle className="mr-2 h-4 w-4" />
                            )}
                            Approve
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            onClick={() => void runRequestAction(request.id, "reject")}
                            disabled={actionLoading}
                            aria-label={`Reject request for ${request.email}`}
                          >
                            {actionLoading ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <XCircle className="mr-2 h-4 w-4" />
                            )}
                            Reject
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>

          {processedRequests.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <h3 className="text-lg font-semibold text-foreground">Processed Requests</h3>
              </div>

              <div className="grid gap-3">
                {processedRequests.map((request) => {
                  const status = getStatusMeta(request.status);
                  return (
                    <Card key={request.id} className="border border-[#d0d7de] bg-[#f6f8fa] dark:border-[#30363d] dark:bg-[#0d1117]">
                      <CardContent className="flex items-center justify-between py-3.5">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground">{request.fileName}</p>
                          <p className="text-sm text-muted-foreground">
                            {request.userName} | {new Date(request.requestDate).toLocaleString()}
                          </p>
                        </div>
                        <StatusBadge label={status.label} tone={status.tone} icon={status.icon} />
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
};


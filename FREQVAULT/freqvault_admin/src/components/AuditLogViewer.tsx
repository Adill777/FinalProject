import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  AlertCircle,
  Download,
  Loader2,
  RefreshCw,
  Search,
  TriangleAlert
} from "lucide-react";
import { apiFetch, readApiJson } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import { StateCard } from "@/components/StateCard";
import { StatusBadge } from "@/components/StatusBadge";

interface AuditLogEntry {
  _id: string;
  actorType?: string;
  actorEmail?: string;
  targetType?: string;
  metadata?: Record<string, unknown>;
  adminEmail?: string;
  action: string;
  targetUserEmail?: string;
  targetEmail?: string;
  reason?: string;
  ipAddress?: string;
  createdAt: string;
}

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  return "Failed to load audit logs";
};

const getActionBadge = (action: string) => {
  switch (action.toLowerCase()) {
    case "suspend":
      return <StatusBadge label="Suspend" tone="warning" />;
    case "unsuspend":
      return <StatusBadge label="Unsuspend" tone="success" />;
    case "delete":
      return <StatusBadge label="Delete" tone="danger" />;
    default:
      return <StatusBadge label={action} tone="neutral" />;
  }
};

const csvSafe = (value: unknown) => {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
};

export const AuditLogViewer = () => {
  const { toast } = useToast();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchEmail, setSearchEmail] = useState("");

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiFetch("/api/admin/audit-log");
      const parsed = await readApiJson<{ logs?: AuditLogEntry[] }>(res);
      if (!res.ok || !parsed.success) throw new Error(parsed.error || "Failed to fetch audit logs");
      setLogs(parsed.data.logs || []);
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      setError(message);
      toast({
        title: "Failed to load audit logs",
        description: message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

  const filteredLogs = useMemo(() => {
    const needle = searchEmail.trim().toLowerCase();
    if (!needle) return logs;
    return logs.filter((log) => {
      const actor = (log.actorEmail || log.adminEmail || "").toLowerCase();
      const target = (log.targetEmail || log.targetUserEmail || "").toLowerCase();
      return actor.includes(needle) || target.includes(needle);
    });
  }, [logs, searchEmail]);

  const handleExportCSV = () => {
    if (filteredLogs.length === 0) {
      toast({
        title: "No Data",
        description: "No logs to export",
        variant: "destructive"
      });
      return;
    }

    const csvContent = [
      [
        "Timestamp",
        "Actor Type",
        "Actor Email",
        "Action",
        "Target Type",
        "Target Email",
        "Reason",
        "IP Address",
        "Metadata"
      ].join(","),
      ...filteredLogs.map((log) =>
        [
          new Date(log.createdAt).toISOString(),
          csvSafe(log.actorType || "admin"),
          csvSafe(log.actorEmail || log.adminEmail || ""),
          csvSafe(log.action),
          csvSafe(log.targetType || "user"),
          csvSafe(log.targetEmail || log.targetUserEmail || ""),
          csvSafe(log.reason || ""),
          csvSafe(log.ipAddress || ""),
          csvSafe(log.metadata || {})
        ].join(",")
      )
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);

    toast({
      title: "Export complete",
      description: `Exported ${filteredLogs.length} log entries`
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Log"
        description="View normalized administrative and security actions across the portal."
        badges={[
          { label: `Visible: ${filteredLogs.length}`, variant: "secondary" },
          { label: `Total: ${logs.length}`, variant: "outline" }
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Search & Export</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <label htmlFor="audit-search" className="sr-only">
              Search audit logs by actor or target email
            </label>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="audit-search"
              placeholder="Search actor or target email..."
              value={searchEmail}
              onChange={(e) => setSearchEmail(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => void fetchLogs()}
              variant="outline"
              className="flex-1"
              disabled={loading}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button onClick={handleExportCSV} variant="outline" className="flex-1">
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <StateCard
          icon={<Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
          title="Loading audit logs..."
          titleClassName="text-muted-foreground"
        />
      ) : error ? (
        <StateCard
          icon={<TriangleAlert className="h-8 w-8 text-destructive" />}
          title="Failed to load audit logs"
          description={error}
          actionLabel="Retry"
          onAction={() => void fetchLogs()}
          className="border-destructive/40"
          titleClassName="text-destructive"
        />
      ) : filteredLogs.length === 0 ? (
        <StateCard
          icon={<AlertCircle className="mx-auto mb-1 h-12 w-12 text-muted-foreground" />}
          title="No audit logs found"
          titleClassName="text-base text-muted-foreground"
        />
      ) : (
        <div className="space-y-3">
          {filteredLogs.map((log) => (
            <Card key={log._id} className="transition-colors hover:bg-[#fcfcfd] dark:hover:bg-[#161b22]">
              <CardContent className="p-5">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <p className="text-xs font-medium uppercase text-muted-foreground">Timestamp</p>
                    <p className="mt-1 text-sm font-semibold">
                      {new Date(log.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase text-muted-foreground">Actor</p>
                    <p className="mt-1 text-sm font-semibold">
                      {(log.actorEmail || log.adminEmail || "Unknown").trim()}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{log.actorType || "admin"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase text-muted-foreground">Action</p>
                    <div className="mt-1">{getActionBadge(log.action)}</div>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase text-muted-foreground">Target</p>
                    <p className="mt-1 text-sm font-semibold">
                      {log.targetEmail || log.targetUserEmail || "N/A"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{log.targetType || "user"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase text-muted-foreground">IP Address</p>
                    <p className="mt-1 break-all text-sm font-semibold">{log.ipAddress || "N/A"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase text-muted-foreground">Reason</p>
                    <p className="mt-1 text-sm text-muted-foreground">{log.reason || "N/A"}</p>
                  </div>
                  <div className="md:col-span-2 lg:col-span-3">
                    <p className="text-xs font-medium uppercase text-muted-foreground">Metadata</p>
                    <pre className="mt-1 whitespace-pre-wrap break-words rounded-md border border-[#d0d7de] bg-[#f6f8fa] p-2 text-xs text-muted-foreground dark:border-[#30363d] dark:bg-[#0d1117]">
                      {JSON.stringify(log.metadata || {}, null, 2)}
                    </pre>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

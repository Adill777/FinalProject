import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiFetch, readApiJson } from "@/lib/api";
import { RefreshCw, Trash2, RotateCcw } from "lucide-react";

interface AdminFileItem {
  fileId: string;
  filename: string;
  size: number;
  uploadDate?: string | null;
  email: string;
  mimeType: string;
  expiresAt?: string | null;
  deletedAt?: string | null;
  purgeAt?: string | null;
  deletionReason?: string;
}

interface AdminFilesResponse {
  files?: AdminFileItem[];
  error?: string;
}

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes < 0) return "N/A";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const normalized = bytes / Math.pow(1024, index);
  return `${normalized.toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
};

const formatDate = (value?: string | null) => {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleString();
};

type SortKey = "uploadDate" | "size" | "email" | "filename";
type SortDirection = "asc" | "desc";
const DEFAULT_DELETE_REASON = "Removed by administrator via files manager";

export const AdminFilesManager = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("filename");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);

  const filesQuery = useQuery({
    queryKey: ["admin-files", includeDeleted],
    queryFn: async () => {
      const response = await apiFetch(`/api/admin/files?includeDeleted=${includeDeleted ? "true" : "false"}`);
      const parsed = await readApiJson<AdminFilesResponse>(response);
      if (!response.ok || !parsed.success) {
        throw new Error(parsed.error || "Failed to fetch files");
      }
      return parsed.data.files || [];
    },
    staleTime: 30_000,
    retry: 1
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin-files"] });

  const deleteSingle = useMutation({
    mutationFn: async (fileId: string) => {
      const response = await apiFetch(`/api/admin/files/${fileId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: DEFAULT_DELETE_REASON })
      });
      const parsed = await readApiJson<Record<string, unknown>>(response);
      if (!response.ok || !parsed.success) {
        throw new Error(parsed.error || "Failed to delete file");
      }
      return parsed.data;
    },
    onSuccess: () => {
      void refresh();
      toast({ title: "File scheduled for deletion" });
    },
    onError: (error: unknown) => {
      toast({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Request failed",
        variant: "destructive"
      });
    }
  });

  const restoreSingle = useMutation({
    mutationFn: async (fileId: string) => {
      const response = await apiFetch(`/api/admin/files/${fileId}/restore`, { method: "POST", body: "{}" });
      const parsed = await readApiJson<Record<string, unknown>>(response);
      if (!response.ok || !parsed.success) {
        throw new Error(parsed.error || "Failed to restore file");
      }
      return parsed.data;
    },
    onSuccess: () => {
      void refresh();
      toast({ title: "File restored" });
    },
    onError: (error: unknown) => {
      toast({
        title: "Restore failed",
        description: error instanceof Error ? error.message : "Request failed",
        variant: "destructive"
      });
    }
  });

  const bulkDelete = useMutation({
    mutationFn: async (fileIds: string[]) => {
      const response = await apiFetch("/api/admin/files/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileIds, reason: DEFAULT_DELETE_REASON })
      });
      const parsed = await readApiJson<Record<string, unknown>>(response);
      if (!response.ok || !parsed.success) {
        throw new Error(parsed.error || "Failed to bulk delete files");
      }
      return parsed.data;
    },
    onSuccess: () => {
      setSelected({});
      setConfirmOpen(false);
      void refresh();
      toast({ title: "Bulk delete submitted" });
    },
    onError: (error: unknown) => {
      toast({
        title: "Bulk delete failed",
        description: error instanceof Error ? error.message : "Request failed",
        variant: "destructive"
      });
    }
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = (filesQuery.data || []).filter((item) => {
      if (!term) return true;
      return (
        item.filename.toLowerCase().includes(term) ||
        item.email.toLowerCase().includes(term) ||
        item.mimeType.toLowerCase().includes(term)
      );
    });
    list.sort((a, b) => {
      let comp = 0;
      if (sortBy === "size") comp = (a.size || 0) - (b.size || 0);
      if (sortBy === "email") comp = a.email.localeCompare(b.email);
      if (sortBy === "filename") comp = a.filename.localeCompare(b.filename);
      if (sortBy === "uploadDate") comp = new Date(a.uploadDate || 0).getTime() - new Date(b.uploadDate || 0).getTime();
      return sortDirection === "desc" ? -comp : comp;
    });
    return list;
  }, [filesQuery.data, search, sortBy, sortDirection]);

  const selectedIds = useMemo(
    () => Object.entries(selected).filter(([, value]) => value).map(([fileId]) => fileId),
    [selected]
  );
  return (
    <Card className="border-border/80 shadow-card">
      <CardHeader>
        <CardTitle>All Uploaded Files</CardTitle>
        <CardDescription>Clean controls for search, sort, restore, and delete actions.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid items-end gap-3 rounded-xl border border-border/70 bg-muted/20 p-3 md:grid-cols-12">
          <Input
            className="h-10 md:col-span-5"
            placeholder="Search by file, user email, or type"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search files"
          />
          <div className="md:col-span-3">
            <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortKey)}>
              <SelectTrigger className="h-10 w-full border-border bg-background text-foreground">
                <SelectValue placeholder="Select sort field" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="filename">File name</SelectItem>
                <SelectItem value="uploadDate">Upload date</SelectItem>
                <SelectItem value="size">File size</SelectItem>
                <SelectItem value="email">User email</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Select value={sortDirection} onValueChange={(value) => setSortDirection(value as SortDirection)}>
              <SelectTrigger className="h-10 w-full border-border bg-background text-foreground">
                <SelectValue placeholder="Select order" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="asc">Ascending</SelectItem>
                <SelectItem value="desc">Descending</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="outline"
            className="h-10 w-full md:col-span-2"
            onClick={() => void refresh()}
            disabled={filesQuery.isFetching}
            aria-label="Refresh files"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${filesQuery.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-background p-3">
          <Label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={includeDeleted}
              onChange={(event) => setIncludeDeleted(event.target.checked)}
              aria-label="Include deleted files"
            />
            Include deleted files
          </Label>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{selectedIds.length} selected</Badge>
            <Button
              variant="destructive"
              onClick={() => setConfirmOpen(true)}
              disabled={selectedIds.length === 0 || bulkDelete.isPending}
              aria-label="Delete selected files"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Selected
            </Button>
          </div>
        </div>

        <div className="overflow-auto rounded-xl border border-border/70">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Select</th>
                <th className="px-3 py-2 text-left font-medium">File</th>
                <th className="px-3 py-2 text-left font-medium">User</th>
                <th className="px-3 py-2 text-left font-medium">Size</th>
                <th className="px-3 py-2 text-left font-medium">Uploaded</th>
                <th className="px-3 py-2 text-left font-medium">State</th>
                <th className="px-3 py-2 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filesQuery.isLoading && (
                <tr>
                  <td className="px-3 py-10 text-center text-sm text-muted-foreground" colSpan={7}>
                    Loading files...
                  </td>
                </tr>
              )}
              {filesQuery.isError && (
                <tr>
                  <td className="px-3 py-10 text-center text-sm text-destructive" colSpan={7}>
                    Failed to load files. Please refresh.
                  </td>
                </tr>
              )}
              {filtered.map((item) => (
                <tr key={item.fileId} className="border-t border-border/60 transition-colors hover:bg-muted/20">
                  <td className="px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={Boolean(selected[item.fileId])}
                      onChange={(event) =>
                        setSelected((prev) => ({ ...prev, [item.fileId]: event.target.checked }))
                      }
                      aria-label={`Select ${item.filename}`}
                    />
                  </td>
                  <td className="max-w-[260px] truncate px-3 py-2.5 font-medium text-foreground/95" title={item.filename}>
                    {item.filename}
                  </td>
                  <td className="max-w-[220px] truncate px-3 py-2.5 text-muted-foreground" title={item.email}>
                    {item.email}
                  </td>
                  <td className="px-3 py-2.5">{formatBytes(item.size)}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{formatDate(item.uploadDate)}</td>
                  <td className="px-3 py-2.5">
                    <Badge variant={item.deletedAt ? "secondary" : "outline"}>
                      {item.deletedAt ? "Deleted" : "Active"}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5">
                    {item.deletedAt ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => restoreSingle.mutate(item.fileId)}
                        disabled={restoreSingle.isPending}
                        aria-label={`Restore ${item.filename}`}
                      >
                        <RotateCcw className="h-4 w-4 mr-1" />
                        Restore
                      </Button>
                    ) : (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => deleteSingle.mutate(item.fileId)}
                        disabled={deleteSingle.isPending}
                        aria-label={`Delete ${item.filename}`}
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Delete
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filesQuery.isLoading && !filesQuery.isError && filtered.length === 0 && (
            <div className="p-6 text-sm text-muted-foreground">No files match current filters.</div>
          )}
        </div>
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm bulk delete</AlertDialogTitle>
            <AlertDialogDescription>
              Selected files will be soft-deleted and can be restored only during the undo window.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => bulkDelete.mutate(selectedIds)}
              disabled={bulkDelete.isPending}
            >
              Confirm Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};

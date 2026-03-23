import { useState, useEffect, useMemo, useRef, type ReactNode, type SyntheticEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ProfessionalCard } from "@/components/ui/professional-card";
import { ProfessionalButton } from "@/components/ui/professional-button";
import { ProfessionalInput } from "@/components/ui/professional-input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { NotificationCenter } from "@/components/NotificationCenter";
import { SecurePdfViewer } from "@/components/SecurePdfViewer";
import { Badge } from "@/components/ui/badge";
import { DarkModeToggle } from "@/components/ui/DarkModeToggle";
import { FileLock2, FolderOpen, RefreshCw, LogOut, ShieldCheck, Lock, Unlock, Clock3, FileText, Search } from "lucide-react";
import { apiFetch, readApiJson, getUserEmail, logUserSecurityEvent, logoutUser } from "@/lib/api";
import { secureKeyVault } from "@/lib/secure-key-vault";

interface FileItem {
  id: string;
  name: string;
  size?: string;
  uploadedBy?: string;
  hasAccess: boolean;
  requestStatus: "none" | "pending" | "approved" | "rejected";
  isDecrypted: boolean;
  decryptedContent?: string;
  mimeType?: string;
  watermarkText?: string;
}

interface ApiFileItem {
  fileId: string;
  filename: string;
  size?: number;
  uploadedBy?: string;
  hasAccess?: boolean;
  accessGranted?: boolean;
  requestStatus?: string;
  status?: string;
  accessStatus?: string;
}

interface ApiFileListResponse {
  files?: ApiFileItem[];
  message?: string;
  error?: string;
}

interface ApiRequestItem {
  requestId: string;
  fileId: string;
  fileName?: string;
  status?: string;
  statusMessage?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface ApiRequestListResponse {
  requests?: ApiRequestItem[];
  message?: string;
  error?: string;
}

const getErrorMessage = (error: unknown, fallback = "Something went wrong") => {
  if (error instanceof Error) return error.message;
  return fallback;
};

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

const VIEW_TIME_SECONDS = 2 * 60; // 2 minutes
const SECURITY_CURTAIN_MONITORING_EVENT = "security-curtain-monitoring";
const SECURITY_PROFILE_STORAGE_KEY = "freqvault_security_profile";
const normalizeRequestStatus = (value?: string): FileItem["requestStatus"] => {
  const normalized = (value || "").toLowerCase();
  if (normalized === "pending" || normalized === "approved" || normalized === "rejected") {
    return normalized;
  }
  return "none";
};

const deriveHasAccess = (file: ApiFileItem, normalizedRequestStatus: FileItem["requestStatus"]) => {
  if (typeof file.hasAccess === "boolean") return file.hasAccess;
  if (typeof file.accessGranted === "boolean") return file.accessGranted;

  const explicitStatus = String(file.accessStatus || file.status || "").toLowerCase();
  if (explicitStatus === "approved" || explicitStatus === "granted") return true;
  if (explicitStatus === "pending" || explicitStatus === "rejected" || explicitStatus === "denied") return false;

  if (normalizedRequestStatus === "approved") return true;
  if (normalizedRequestStatus === "pending" || normalizedRequestStatus === "rejected") return false;

  return false;
};

const toRequestStatus = (status?: string): FileItem["requestStatus"] => {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "approved") return "approved";
  if (normalized === "pending") return "pending";
  if (normalized === "rejected" || normalized === "denied") return "rejected";
  return "none";
};

const isTextLikeMimeType = (mimeType?: string) =>
  Boolean(
    mimeType &&
      (mimeType.startsWith("text/") || mimeType === "application/json" || mimeType === "application/xml")
  );

const revokeFileObjectUrl = (file: Pick<FileItem, "decryptedContent" | "mimeType">) => {
  if (file.decryptedContent && !isTextLikeMimeType(file.mimeType)) {
    URL.revokeObjectURL(file.decryptedContent);
  }
};

const UserFiles = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [files, setFiles] = useState<FileItem[]>([]);
  const [privateKeyByFile, setPrivateKeyByFile] = useState<Record<string, string>>({});
  const [authCodeByFile, setAuthCodeByFile] = useState<Record<string, string>>({});
  const [rememberPrivateKey, setRememberPrivateKey] = useState(true);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [activeDecryptFileId, setActiveDecryptFileId] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [decryptInFlightId, setDecryptInFlightId] = useState<string | null>(null);
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const [requestReason, setRequestReason] = useState("");
  const [requestFile, setRequestFile] = useState<FileItem | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [accessFilter, setAccessFilter] = useState<"all" | "accessible" | "pending" | "locked">("all");
  const filesRef = useRef<FileItem[]>([]);

  const filesQuery = useQuery({
    queryKey: ["user-files"],
    queryFn: async () => {
      const res = await apiFetch("/api/user/filelist");
      if (res.status === 401) {
        navigate("/login");
        return [];
      }
      const parsed = await readApiJson<ApiFileListResponse>(res);
      const data = parsed.data;
      if (!res.ok || !parsed.success) {
        throw new Error(parsed.error || data.error || data.message || "Failed to fetch files");
      }

      const fileList: FileItem[] = (data.files || []).map((f) => {
        const requestStatus = normalizeRequestStatus(f.requestStatus || f.accessStatus || f.status);
        return {
        requestStatus,
        id: f.fileId,
        name: f.filename,
        size: f.size ? formatBytes(f.size) : "Unknown",
        uploadedBy: f.uploadedBy || "admin@freqvault.com",
        hasAccess: deriveHasAccess(f, requestStatus),
        isDecrypted: false
      }});
      return fileList;
    },
    retry: 2,
    staleTime: 10000,
    refetchInterval: 15000
  });

  const requestsQuery = useQuery({
    queryKey: ["user-requests"],
    queryFn: async () => {
      const res = await apiFetch("/api/user/requests");
      if (res.status === 401) {
        navigate("/login");
        return [] as ApiRequestItem[];
      }
      const parsed = await readApiJson<ApiRequestListResponse>(res);
      const data = parsed.data;
      if (!res.ok || !parsed.success) {
        throw new Error(parsed.error || data.error || data.message || "Failed to fetch requests");
      }
      return data.requests || [];
    },
    retry: 2,
    staleTime: 10000,
    refetchInterval: 15000
  });

  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  useEffect(() => {
    if (!filesQuery.data) return;
    const requestItems = requestsQuery.data || [];
    const latestRequestByFileId = new Map<string, ApiRequestItem>();
    for (const request of requestItems) {
      const key = String(request.fileId || "");
      if (!key) continue;
      const currentTs = new Date(request.updatedAt || request.createdAt || 0).getTime();
      const previous = latestRequestByFileId.get(key);
      if (!previous) {
        latestRequestByFileId.set(key, request);
        continue;
      }
      const previousTs = new Date(previous.updatedAt || previous.createdAt || 0).getTime();
      if (currentTs >= previousTs) {
        latestRequestByFileId.set(key, request);
      }
    }

    setFiles((previous) => {
      const previousById = new Map(previous.map((item) => [item.id, item]));
      const mergedById = new Map<string, FileItem>();

      for (const baseFile of filesQuery.data) {
        const previousFile = previousById.get(baseFile.id);
        mergedById.set(baseFile.id, {
          ...baseFile,
          isDecrypted: previousFile?.isDecrypted || false,
          decryptedContent: previousFile?.decryptedContent,
          mimeType: previousFile?.mimeType,
          watermarkText: previousFile?.watermarkText
        });
      }

      for (const request of latestRequestByFileId.values()) {
        const requestStatus = toRequestStatus(request.status);
        const existing = mergedById.get(request.fileId);
        if (existing) {
          if (requestStatus === "approved") {
            existing.hasAccess = true;
            existing.requestStatus = "approved";
          } else if (!existing.hasAccess && requestStatus !== "none") {
            existing.requestStatus = requestStatus;
          }
          continue;
        }
      }

      const merged = Array.from(mergedById.values());
      const validIds = new Set(merged.map((item) => item.id));
      for (const old of previous) {
        if (!validIds.has(old.id)) {
          revokeFileObjectUrl(old);
        }
      }
      return merged;
    });

    setLastSyncedAt(new Date());
  }, [filesQuery.data, requestsQuery.data]);

  useEffect(() => {
    if (filesQuery.isError || requestsQuery.isError) {
      toast({
        title: "Error",
        description: getErrorMessage(filesQuery.error || requestsQuery.error, "Failed to fetch files"),
        variant: "destructive"
      });
    }
  }, [filesQuery.isError, filesQuery.error, requestsQuery.isError, requestsQuery.error, toast]);

  const fetchFiles = async () => {
    await Promise.all([filesQuery.refetch(), requestsQuery.refetch()]);
  };

  const handleLogout = async () => {
    secureKeyVault.clear();
    await logoutUser();
    navigate("/login");
  };

  const requestAccessMutation = useMutation({
    mutationFn: async ({
      fileId,
      description
    }: {
      fileId: string;
      description?: string;
    }) => {
      const res = await apiFetch("/api/user/request-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId, description })
      });
      if (res.status === 401) {
        navigate("/login");
        throw new Error("Unauthorized");
      }
      const parsed = await readApiJson<{ message?: string }>(res);
      if (!res.ok || !parsed.success) {
        const message = parsed.error || "Failed to request access";
        throw new Error(`${parsed.code || "REQUEST_FAILED"}:${message}`);
      }
      return parsed;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["user-files"] }),
        queryClient.invalidateQueries({ queryKey: ["user-requests"] })
      ]);
    }
  });

  const openAccessRequestDialog = (file: FileItem) => {
    setRequestFile(file);
    setRequestReason("");
    setRequestDialogOpen(true);
  };

  const handleRequestAccess = async () => {
    if (!requestFile) return;
    const fileId = requestFile.id;
    const description = requestReason.trim() || undefined;

    try {
      await requestAccessMutation.mutateAsync({ fileId, description });
      setFiles((prev) =>
        prev.map((f) => (f.id === fileId ? { ...f, requestStatus: "pending" } : f))
      );

      toast({
        title: "Request Sent",
        description: "Waiting for admin approval."
      });
      setRequestDialogOpen(false);
      setRequestFile(null);
      setRequestReason("");
    } catch (err: unknown) {
      const message = getErrorMessage(err, "Failed to request access");
      const isDuplicate = message.startsWith("REQUEST_DUPLICATE:");
      if (isDuplicate) {
        setFiles((prev) =>
          prev.map((f) => (f.id === fileId ? { ...f, requestStatus: "pending", hasAccess: false } : f))
        );
        toast({
          title: "Already Requested",
          description: "This file is already pending admin approval."
        });
        setRequestDialogOpen(false);
        setRequestFile(null);
        setRequestReason("");
        return;
      }
      toast({
        title: "Error",
        description: message,
        variant: "destructive"
      });
    }
  };

  const handleDecrypt = async (fileId: string) => {
    if (decryptInFlightId) return;
    if (selectedFileId && selectedFileId !== fileId) {
      toast({
        title: "Secure View Active",
        description: "Finish or wait for the current file session to expire before opening another file.",
        variant: "destructive"
      });
      return;
    }
    if (activeDecryptFileId && fileId !== activeDecryptFileId) {
      toast({
        title: "Access Session Restricted",
        description: "Only one file decrypt session can be active at a time.",
        variant: "destructive"
      });
      return;
    }
    const otpToken = (authCodeByFile[fileId] || "").trim();
    let secretKeyBase64 = (privateKeyByFile[fileId] || "").trim();
    let usedVaultKey = false;

    if (!secretKeyBase64 && rememberPrivateKey) {
      try {
        secretKeyBase64 = (await secureKeyVault.read()) || "";
        usedVaultKey = Boolean(secretKeyBase64);
      } catch {
        secretKeyBase64 = "";
        usedVaultKey = false;
      }
    }

    if (!secretKeyBase64 || !otpToken) {
      toast({
        title: "Missing Data",
        description: "Enter private key and OTP",
        variant: "destructive"
      });
      return;
    }

    try {
      const targetFile = files.find((f) => f.id === fileId);
      void logUserSecurityEvent({
        type: "decrypt_start",
        fileId,
        metadata: {
          fileName: targetFile?.name || "unknown"
        }
      });

      setDecryptInFlightId(fileId);
      if (rememberPrivateKey && !usedVaultKey) {
        try {
          if (secureKeyVault.isSupported()) {
            await secureKeyVault.store(secretKeyBase64);
          }
        } catch {
          // Do not block decrypt if secure in-memory key storage fails.
        }
      }
      if (!rememberPrivateKey && secureKeyVault.hasKey()) {
        secureKeyVault.clear();
      }
      const res = await apiFetch("/api/user/decrypt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileId,
          secretKeyBase64,
          token: otpToken
        })
      });
      if (res.status === 401) {
        navigate("/login");
        return;
      }

      if (!res.ok) {
        const parsed = await readApiJson<{ error?: string; message?: string }>(res);
        const message = parsed.error || parsed.data.error || parsed.data.message || "Decryption failed";
        throw new Error(`${parsed.code || "DECRYPT_FAILED"}:${message}`);
      }

      const contentTypeHeader = res.headers.get("content-type");
      const blob = await res.blob();
      const mimeType = contentTypeHeader || blob.type || "application/octet-stream";
      const watermarkUser = res.headers.get("x-watermark-user") || viewerIdentity;
      const watermarkTimestamp = res.headers.get("x-watermark-timestamp") || new Date().toISOString();
      const watermarkSession = res.headers.get("x-watermark-session-id") || "unknown-session";
      const watermarkIpHash = res.headers.get("x-watermark-ip-hash") || "unknown-ip";
      const watermarkText = `CONFIDENTIAL | ${watermarkUser} | ${watermarkTimestamp} | SID:${watermarkSession} | IP#:${watermarkIpHash}`;

      let decryptedContent: string;
      if (isTextLikeMimeType(mimeType)) {
        decryptedContent = await blob.text();
      } else {
        decryptedContent = URL.createObjectURL(blob);
      }

      setFiles((prev) => {
        // Only one decrypted preview is kept active to enforce timed visibility consistently.
        return prev.map((f) => {
          if (f.id !== fileId && f.isDecrypted) {
            revokeFileObjectUrl(f);
            return { ...f, isDecrypted: false, decryptedContent: undefined, mimeType: undefined, watermarkText: undefined };
          }

          if (f.id === fileId) {
            revokeFileObjectUrl(f);
            return {
              ...f,
              isDecrypted: true,
              decryptedContent,
              mimeType,
              watermarkText
            };
          }

          return f;
        });
      });

      setSelectedFileId(fileId);
      setActiveDecryptFileId(fileId);
      setCountdown(VIEW_TIME_SECONDS);
      if (rememberPrivateKey) {
        setPrivateKeyByFile((prev) => ({ ...prev, [fileId]: "" }));
      }
      setAuthCodeByFile((prev) => ({ ...prev, [fileId]: "" }));

      toast({
        title: "Decrypted",
        description: "Visible for 2 minutes"
      });
      void logUserSecurityEvent({
        type: "decrypt_end",
        fileId,
        status: "success"
      });
    } catch (err: unknown) {
      const message = getErrorMessage(err, "Decryption failed");
      const [errorCode, ...messageParts] = message.split(":");
      const normalizedMessage =
        messageParts.length > 0 ? messageParts.join(":").trim() : message;
      if (errorCode === "ACCESS_NOT_APPROVED" || errorCode === "ACCESS_EXPIRED") {
        await Promise.all([filesQuery.refetch(), requestsQuery.refetch()]);
      }
      toast({
        title: "Decryption Failed",
        description: normalizedMessage,
        variant: "destructive"
      });
      void logUserSecurityEvent({
        type: "decrypt_end",
        fileId,
        status: "failed",
        reason: normalizedMessage
      });
    } finally {
      setDecryptInFlightId(null);
    }
  };

  useEffect(() => {
    if (countdown <= 0 || !selectedFileId) return;
    const timer = setInterval(() => {
      setCountdown((prev) => Math.max(prev - 1, 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown, selectedFileId]);

  useEffect(() => {
    if (countdown === 0 && selectedFileId) {
      setFiles((prev) =>
        prev.map((f) => {
          if (f.id === selectedFileId) {
            revokeFileObjectUrl(f);
            return {
              ...f,
              isDecrypted: false,
              decryptedContent: undefined,
              mimeType: undefined,
              watermarkText: undefined,
              hasAccess: false,
              requestStatus: "none"
            };
          }
          return f;
        })
      );
      setSelectedFileId(null);
      setActiveDecryptFileId(null);
      setAuthCodeByFile((prev) => {
        const next = { ...prev };
        delete next[selectedFileId];
        return next;
      });
      setPrivateKeyByFile((prev) => {
        const next = { ...prev };
        delete next[selectedFileId];
        return next;
      });
      toast({
        title: "Session Expired",
        description: "Content hidden for security"
      });
      void logUserSecurityEvent({
        type: "decrypt_end",
        fileId: selectedFileId,
        status: "expired",
        reason: "Timed viewing window expired"
      });
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["user-files"] }),
        queryClient.invalidateQueries({ queryKey: ["user-requests"] })
      ]);
    }
  }, [countdown, selectedFileId, toast, queryClient]);

  useEffect(() => {
    if (!activeDecryptFileId) return;
    const target = files.find((file) => file.id === activeDecryptFileId);
    if (!target || !target.hasAccess) {
      setActiveDecryptFileId(null);
    }
  }, [activeDecryptFileId, files]);

  useEffect(() => {
    return () => {
      filesRef.current.forEach(revokeFileObjectUrl);
      secureKeyVault.clear();
    };
  }, []);

  useEffect(() => {
    if (!rememberPrivateKey) {
      secureKeyVault.clear();
    }
  }, [rememberPrivateKey]);

  const hasProtectedViewActive = useMemo(
    () => files.some((file) => file.isDecrypted),
    [files]
  );
  const monitoringProfile = useMemo(() => {
    const profileValue = (localStorage.getItem(SECURITY_PROFILE_STORAGE_KEY) || "balanced").toLowerCase();
    return profileValue === "strict" || profileValue === "balanced" || profileValue === "performance"
      ? profileValue
      : "balanced";
  }, []);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent(SECURITY_CURTAIN_MONITORING_EVENT, {
        detail: { enabled: hasProtectedViewActive, profile: monitoringProfile }
      })
    );
  }, [hasProtectedViewActive, monitoringProfile]);

  useEffect(() => {
    return () => {
      window.dispatchEvent(
        new CustomEvent(SECURITY_CURTAIN_MONITORING_EVENT, {
          detail: { enabled: false }
        })
      );
    };
  }, []);

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
  const blockSensitiveInteraction = (event: SyntheticEvent) => {
    event.preventDefault();
  };
  const viewerIdentity = getUserEmail() || "unknown-user";
  const accessibleCount = useMemo(() => files.filter((file) => file.hasAccess).length, [files]);
  const pendingCount = useMemo(
    () => files.filter((file) => !file.hasAccess && file.requestStatus === "pending").length,
    [files]
  );
  const lockedCount = useMemo(
    () => files.filter((file) => !file.hasAccess && file.requestStatus !== "pending").length,
    [files]
  );
  const visibleFiles = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return files.filter((file) => {
      if (normalizedQuery && !file.name.toLowerCase().includes(normalizedQuery)) {
        return false;
      }

      if (accessFilter === "accessible") return file.hasAccess;
      if (accessFilter === "pending") return !file.hasAccess && file.requestStatus === "pending";
      if (accessFilter === "locked") return !file.hasAccess && file.requestStatus !== "pending";
      return true;
    });
  }, [files, searchQuery, accessFilter]);
  const filterOptions: Array<{ id: "all" | "accessible" | "pending" | "locked"; label: string }> = [
    { id: "all", label: "All" },
    { id: "accessible", label: "Accessible" },
    { id: "pending", label: "Pending" },
    { id: "locked", label: "Locked" }
  ];

  let content: ReactNode;
  if (filesQuery.isLoading) {
    content = (
      <div className="grid gap-6 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <ProfessionalCard key={index} className="animate-pulse p-6">
            <div className="space-y-3">
              <div className="h-5 w-3/4 rounded bg-muted" />
              <div className="h-4 w-1/2 rounded bg-muted" />
              <div className="h-10 w-36 rounded bg-muted" />
            </div>
          </ProfessionalCard>
        ))}
      </div>
    );
  } else if (files.length === 0) {
    content = (
      <ProfessionalCard className="mx-auto max-w-2xl border border-border bg-card p-10 text-center shadow-sm">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
          <FolderOpen className="h-8 w-8" />
        </div>
        <h2 className="text-2xl font-semibold text-foreground">No Files Available Yet</h2>
        <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">
          Your secure workspace is ready, but no files are currently visible for your account. Ask your administrator
          to upload files or approve your pending access requests.
        </p>
      </ProfessionalCard>
    );
  } else if (visibleFiles.length === 0) {
    content = (
      <ProfessionalCard className="mx-auto max-w-2xl border border-border bg-card p-10 text-center shadow-sm">
        <h2 className="text-2xl font-semibold text-foreground">No Matching Files</h2>
        <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">
          No files match your current search/filter. Try clearing filters to view all files.
        </p>
        <div className="mt-5">
          <ProfessionalButton
            variant="outline"
            onClick={() => {
              setSearchQuery("");
              setAccessFilter("all");
            }}
          >
            Clear Filters
          </ProfessionalButton>
        </div>
      </ProfessionalCard>
    );
  } else {
    content = visibleFiles.map((file) => (
      <ProfessionalCard
        key={file.id}
        className={`border border-border bg-card p-6 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
          file.hasAccess
            ? "ring-1 ring-emerald-500/20"
            : file.requestStatus === "pending"
              ? "ring-1 ring-amber-500/20"
              : ""
        }`}
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="rounded-md border border-border bg-muted/40 p-1.5 text-muted-foreground">
                  <FileText className="h-4 w-4" />
                </div>
                <h2 className="truncate text-lg font-semibold text-foreground">{file.name}</h2>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span>{file.size || "Unknown"}</span>
                <span className="text-border">|</span>
                <span>Uploaded by {file.uploadedBy}</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="border border-border/70 bg-muted/70">Encrypted</Badge>
              {file.hasAccess ? (
                <Badge className="bg-emerald-600 text-white"><Unlock className="mr-1 h-3 w-3" />Access Granted</Badge>
              ) : file.requestStatus === "pending" ? (
                <Badge className="bg-amber-500 text-black"><Clock3 className="mr-1 h-3 w-3" />Pending Approval</Badge>
              ) : file.requestStatus === "rejected" ? (
                <Badge className="bg-red-600 text-white"><Lock className="mr-1 h-3 w-3" />Rejected</Badge>
              ) : (
                <Badge variant="outline"><Lock className="mr-1 h-3 w-3" />Access Locked</Badge>
              )}
              {file.isDecrypted && <Badge className="bg-red-500 text-white">Auto-hide in {formatTime(countdown)}</Badge>}
            </div>
          </div>

          {!file.hasAccess ? (
            <div className="rounded-xl border border-border bg-muted/30 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  {file.requestStatus === "pending"
                    ? "Your access request is pending admin approval."
                    : file.requestStatus === "rejected"
                      ? "Your previous request was rejected by admin."
                    : "Access is required before decryption."}
                </p>
                <ProfessionalButton
                  variant="outline"
                  onClick={() => openAccessRequestDialog(file)}
                  aria-label={`Request access for ${file.name}`}
                  disabled={requestAccessMutation.isPending || file.requestStatus === "pending"}
                >
                  {file.requestStatus === "pending"
                    ? "Pending Approval"
                    : file.requestStatus === "rejected"
                      ? "Request Again"
                      : "Request Access"}
                </ProfessionalButton>
              </div>
            </div>
          ) : !file.isDecrypted ? (
            <div className="rounded-xl border border-border bg-muted/20 p-4">
              {selectedFileId && selectedFileId !== file.id ? (
                <p className="text-sm text-muted-foreground">
                  Another secure file session is active. Wait for expiry before decrypting this file.
                </p>
              ) : activeDecryptFileId !== file.id ? (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-muted-foreground">
                    Access granted. Start a secure decrypt session for this file.
                  </p>
                  <ProfessionalButton
                    variant="outline"
                    onClick={() => setActiveDecryptFileId(file.id)}
                    aria-label={`Start decrypt session for ${file.name}`}
                  >
                    <FileLock2 className="mr-2 h-4 w-4" />
                    Start Decrypt Session
                  </ProfessionalButton>
                </div>
              ) : (
                <>
                  <p className="mb-3 text-sm font-medium text-foreground">Decrypt File</p>
                  <div className="grid gap-3 md:grid-cols-[1fr_1.4fr_auto] md:items-end">
                    <ProfessionalInput
                      label="OTP"
                      value={authCodeByFile[file.id] || ""}
                      onChange={(e) =>
                        setAuthCodeByFile((prev) => ({
                          ...prev,
                          [file.id]: e.target.value
                        }))
                      }
                    />
                    <ProfessionalInput
                      label="Private Key"
                      type="password"
                      value={privateKeyByFile[file.id] || ""}
                      onChange={(e) =>
                        setPrivateKeyByFile((prev) => ({
                          ...prev,
                          [file.id]: e.target.value
                        }))
                      }
                    />
                    <label className="col-span-full flex items-center gap-2 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={rememberPrivateKey}
                        onChange={(e) => setRememberPrivateKey(e.target.checked)}
                      />
                      Keep private key encrypted in-memory for this session (Web Crypto)
                    </label>
                    <ProfessionalButton
                      onClick={() => handleDecrypt(file.id)}
                      aria-label={`Decrypt ${file.name}`}
                      disabled={decryptInFlightId === file.id}
                    >
                      {decryptInFlightId === file.id ? (
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <FileLock2 className="mr-2 h-4 w-4" />
                      )}
                      {decryptInFlightId === file.id ? "Decrypting..." : "Decrypt"}
                    </ProfessionalButton>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Decrypted content is monitored and auto-hidden after 2 minutes.
                  </p>
                </>
              )}
            </div>
          ) : null}
        </div>

        {file.isDecrypted && file.decryptedContent && (
          <div
            className="relative mt-6 rounded-xl border border-border bg-card p-4 select-none overflow-hidden"
            onCopy={blockSensitiveInteraction}
            onCut={blockSensitiveInteraction}
            onDragStart={blockSensitiveInteraction}
            onContextMenu={blockSensitiveInteraction}
          >
            <div className="pointer-events-none absolute inset-0 z-10 opacity-35">
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={`${file.id}-wm-${index}`}
                  className="absolute left-1/2 top-1/2 w-[200%] -translate-x-1/2 -translate-y-1/2 rotate-[-26deg] whitespace-nowrap text-sm font-semibold tracking-wider text-foreground/60"
                  style={{ transform: `translate(-50%, ${-50 + index * 42}px) rotate(-26deg)` }}
                >
                  {file.watermarkText || `CONFIDENTIAL | ${viewerIdentity} | ${file.id} | ${new Date().toISOString()}`}
                </div>
              ))}
            </div>
            {file.mimeType?.startsWith("image/") ? (
              <img
                src={file.decryptedContent}
                alt={`Decrypted preview of ${file.name}`}
                className="relative z-0 max-w-full rounded select-none"
                draggable={false}
                onContextMenu={blockSensitiveInteraction}
                onDragStart={blockSensitiveInteraction}
              />
            ) : file.mimeType === "application/pdf" ? (
              <div
                className="relative z-0 w-full overflow-hidden rounded-lg border border-border bg-background"
                onContextMenu={blockSensitiveInteraction}
                onCopy={blockSensitiveInteraction}
                onCut={blockSensitiveInteraction}
                onDragStart={blockSensitiveInteraction}
              >
                <div className="pointer-events-none absolute inset-x-0 top-0 z-20 border-b border-border/60 bg-background/90 px-3 py-1.5 text-[11px] text-muted-foreground backdrop-blur">
                  Secure preview mode: copy/download interactions are restricted for PDF content.
                </div>
                <SecurePdfViewer src={file.decryptedContent} className="pt-7" />
              </div>
            ) : (
              <pre className="relative z-0 whitespace-pre-wrap text-sm select-none" onContextMenu={blockSensitiveInteraction}>
                {file.decryptedContent}
              </pre>
            )}
          </div>
        )}
      </ProfessionalCard>
    ));
  }

  return (
    <div className="min-h-screen bg-background p-6 md:p-8">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <ProfessionalCard className="border border-border bg-gradient-to-br from-card via-card to-accent/20 p-6 shadow-sm md:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground">Your Files</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Request access, decrypt files securely, and view content with timed auto-hide.
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border border-border bg-muted/25 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total</p>
                  <p className="text-lg font-semibold text-foreground">{files.length}</p>
                </div>
                <div className="rounded-lg border border-border bg-muted/25 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Accessible</p>
                  <p className="text-lg font-semibold text-foreground">{accessibleCount}</p>
                </div>
                <div className="rounded-lg border border-border bg-muted/25 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Pending</p>
                  <p className="text-lg font-semibold text-foreground">{pendingCount}</p>
                </div>
                <div className="rounded-lg border border-border bg-muted/25 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Locked</p>
                  <p className="text-lg font-semibold text-foreground">{lockedCount}</p>
                </div>
              </div>
              {lastSyncedAt ? (
                <p className="mt-3 text-xs text-muted-foreground">Last synced {lastSyncedAt.toLocaleTimeString()}</p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <ProfessionalButton
                variant="outline"
                onClick={() => void fetchFiles()}
                aria-label="Refresh files list"
                disabled={filesQuery.isFetching}
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${filesQuery.isFetching ? "animate-spin" : ""}`} />
                {filesQuery.isFetching ? "Refreshing..." : "Refresh"}
              </ProfessionalButton>
              <ProfessionalButton
                variant="outline"
                onClick={handleLogout}
                aria-label="Log out"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Log out
              </ProfessionalButton>
              <NotificationCenter />
              <DarkModeToggle />
            </div>
          </div>
          <div className="mt-6 rounded-xl border border-border bg-card/85 p-4">
            <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
              <div>
                <label htmlFor="file-search" className="mb-2 block text-sm font-medium text-muted-foreground">
                  Search files
                </label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    id="file-search"
                    type="text"
                    placeholder="Search by file name"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-11 w-full rounded-md border border-border bg-background pl-10 pr-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium text-muted-foreground">Access filter</span>
                <div className="flex flex-wrap gap-2">
                  {filterOptions.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setAccessFilter(option.id)}
                      className={`h-10 rounded-md px-3 text-sm font-medium transition-colors ${
                        accessFilter === option.id
                          ? "bg-primary text-primary-foreground"
                          : "border border-border bg-background text-foreground hover:bg-muted"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/25 p-3 text-xs text-muted-foreground">
              <div className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 text-emerald-600" />
                <p>
                  Secure view mode is active. Clipboard and context actions are restricted for decrypted content, and
                  visibility is time-limited.
                </p>
              </div>
              <Badge variant="outline">Showing {visibleFiles.length} of {files.length}</Badge>
            </div>
          </div>
        </ProfessionalCard>

        <div className="space-y-6">{content}</div>
      </div>

      <Dialog
        open={requestDialogOpen}
        onOpenChange={(open) => {
          if (requestAccessMutation.isPending) return;
          setRequestDialogOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request File Access</DialogTitle>
            <DialogDescription>
              {requestFile ? `Submit an access request for "${requestFile.name}".` : "Submit an access request."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label htmlFor="access-reason" className="text-sm font-medium text-foreground">
              Reason (optional)
            </label>
            <Textarea
              id="access-reason"
              value={requestReason}
              onChange={(e) => setRequestReason(e.target.value)}
              placeholder="Describe why you need access to this file."
              className="min-h-24"
            />
          </div>
          <DialogFooter>
            <ProfessionalButton
              type="button"
              variant="outline"
              onClick={() => setRequestDialogOpen(false)}
              disabled={requestAccessMutation.isPending}
            >
              Cancel
            </ProfessionalButton>
            <ProfessionalButton
              type="button"
              onClick={() => void handleRequestAccess()}
              disabled={requestAccessMutation.isPending}
            >
              {requestAccessMutation.isPending ? "Submitting..." : "Submit Request"}
            </ProfessionalButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UserFiles;

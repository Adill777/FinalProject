import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, Lock, CheckCircle, ArrowLeft, RefreshCw, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiFetch, readApiJson } from "@/lib/api";

interface User {
  id: string;
  name: string;
  email: string;
  status: "active" | "inactive";
}

interface UserFileUploadProps {
  user: User;
  onBack: () => void;
}

interface UploadedFileItem {
  fileId: string;
  filename: string;
  size: number;
  uploadDate?: string | null;
  email: string;
  mimeType: string;
}

interface UploadedFilesApiResponse {
  files?: UploadedFileItem[];
  error?: string;
}

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  return "There was an error uploading the file";
};

const formatFileSize = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes < 0) return "N/A";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const normalized = bytes / Math.pow(1024, index);
  return `${normalized.toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
};

export const UserFileUpload = ({ user, onBack }: UserFileUploadProps) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isEncrypting, setIsEncrypting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFileItem[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [deleteReasonByFileId, setDeleteReasonByFileId] = useState<Record<string, string>>({});
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
  const { toast } = useToast();

  const formatDateTime = (value?: string | null) => {
    if (!value) return "N/A";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "N/A";
    return date.toLocaleString();
  };

  const fetchUploadedFiles = useCallback(async () => {
    try {
      setLoadingFiles(true);
      const response = await apiFetch("/api/admin/files");
      const parsed = await readApiJson<UploadedFilesApiResponse>(response);
      if (!response.ok || !parsed.success) {
        throw new Error(parsed.error || "Failed to fetch files");
      }

      setUploadedFiles(parsed.data.files || []);
    } catch (error: unknown) {
      toast({
        title: "Unable to load uploaded files",
        description: getErrorMessage(error),
        variant: "destructive"
      });
    } finally {
      setLoadingFiles(false);
    }
  }, [toast]);

  useEffect(() => {
    void fetchUploadedFiles();
  }, [fetchUploadedFiles]);

  const userFiles = useMemo(
    () =>
      uploadedFiles.filter(
        (item) => String(item.email || "").toLowerCase() === String(user.email || "").toLowerCase()
      ),
    [uploadedFiles, user.email]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      setIsSuccess(false);
    }
  };

  const handleEncrypt = async () => {
    if (!selectedFile) {
      toast({
        title: "Missing File",
        description: "Please select a file to upload",
        variant: "destructive",
      });
      return;
    }

    setIsEncrypting(true);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("email", user.email);

      const res = await apiFetch("/api/admin/encrypt", {
        method: "POST",
        body: formData,
      });

      const parsed = await readApiJson<Record<string, unknown>>(res);
      if (!res.ok || !parsed.success) {
        throw new Error(parsed.error || "Upload failed");
      }

      setIsSuccess(true);
      await fetchUploadedFiles();
      toast({
        title: "File Encrypted Successfully",
        description: `File encrypted and uploaded for ${user.name}`,
      });
    } catch (error: unknown) {
      toast({
        title: "Encryption Failed",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setIsEncrypting(false);
    }
  };

  const resetForm = () => {
    setSelectedFile(null);
    setIsSuccess(false);
  };

  const setDeleteReason = (fileId: string, reason: string) => {
    setDeleteReasonByFileId((prev) => ({
      ...prev,
      [fileId]: reason
    }));
  };

  const handleDeleteFile = async (fileId: string) => {
    const reason = String(deleteReasonByFileId[fileId] || "").trim();
    if (reason.length < 5) {
      toast({
        title: "Reason required",
        description: "Please enter at least 5 characters for deletion reason.",
        variant: "destructive"
      });
      return;
    }

    setDeletingFileId(fileId);
    try {
      const response = await apiFetch(`/api/admin/files/${fileId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason })
      });
      const parsed = await readApiJson<{ message?: string }>(response);
      if (!response.ok || !parsed.success) {
        throw new Error(parsed.error || "Failed to delete file");
      }

      setDeleteReasonByFileId((prev) => {
        const next = { ...prev };
        delete next[fileId];
        return next;
      });
      await fetchUploadedFiles();
      toast({
        title: "File removed",
        description: parsed.data.message || "Uploaded file and related access requests were removed successfully."
      });
    } catch (error: unknown) {
      toast({
        title: "Delete failed",
        description: getErrorMessage(error),
        variant: "destructive"
      });
    } finally {
      setDeletingFileId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:space-x-4">
        <Button variant="outline" onClick={onBack} className="border-border">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Users
        </Button>
        <div>
          <h2 className="text-2xl font-semibold text-[#1f2328] dark:text-[#e6edf3]">Upload File</h2>
          <p className="text-base text-muted-foreground">
            Uploading for: <span className="font-semibold text-foreground">{user.name}</span>
          </p>
        </div>
      </div>

      <Card className="max-w-2xl mx-auto shadow-card">
        <CardHeader className="text-center pb-6">
          <div className="flex justify-center mb-4">
            <div className="rounded-full bg-[#ddf4ff] p-4 dark:bg-[#13233a]">
              {isSuccess ? (
                <CheckCircle className="h-12 w-12 text-green-600" />
              ) : (
                <Upload className="h-12 w-12 text-[#0969da] dark:text-[#58a6ff]" />
              )}
            </div>
          </div>
          <CardTitle className="text-xl font-semibold">
            {isSuccess ? "File Uploaded Successfully!" : "Secure File Upload"}
          </CardTitle>
          <CardDescription className="text-base">
            {isSuccess 
              ? "Your file has been encrypted and uploaded securely"
              : "Select a file to encrypt with the user's public key"
            }
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {!isSuccess ? (
            <>
              <div className="space-y-3">
                <Label htmlFor="file" className="text-base font-medium">
                  Select File
                </Label>
                <Input
                  id="file"
                  type="file"
                  onChange={handleFileChange}
                  className="h-12 text-base cursor-pointer"
                  accept=".pdf,.png,.jpg,.jpeg,.txt,text/plain,application/pdf,image/png,image/jpeg"
                />
                {selectedFile && (
                  <p className="text-sm text-muted-foreground">
                    Selected: {selectedFile.name} ({formatFileSize(selectedFile.size)})
                  </p>
                )}
              </div>

              <Button 
                onClick={handleEncrypt} 
                disabled={!selectedFile || isEncrypting}
                className="h-12 w-full bg-[#0969da] text-base font-semibold hover:bg-[#0550ae]"
              >
                <Lock className="h-5 w-5 mr-2" />
                {isEncrypting ? "Encrypting..." : "Encrypt & Upload"}
              </Button>
            </>
          ) : (
            <div className="text-center space-y-4">
              <div className="rounded-lg border border-green-200 bg-green-50 p-5">
                <p className="text-lg font-semibold text-green-800">
                  File encrypted and uploaded successfully!
                </p>
                <p className="text-green-600 mt-2">
                  The file is now securely stored for {user.name}
                </p>
              </div>
              <Button 
                onClick={resetForm}
                className="bg-[#0969da] hover:bg-[#0550ae]"
              >
                Upload Another File
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="max-w-4xl mx-auto shadow-card">
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-lg font-semibold">Uploaded Files for {user.name}</CardTitle>
              <CardDescription>
                Manage encrypted files uploaded for this account.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              className="border-border"
              onClick={() => void fetchUploadedFiles()}
              disabled={loadingFiles}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loadingFiles ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingFiles ? (
            <p className="text-sm text-muted-foreground">Loading uploaded files...</p>
          ) : userFiles.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No uploaded files available for this user.
            </p>
          ) : (
            userFiles.map((file) => (
              <div
                key={file.fileId}
                className="space-y-3 rounded-lg border border-[#d0d7de] bg-[#f6f8fa] p-4 dark:border-[#30363d] dark:bg-[#0d1117]"
              >
                <div className="flex flex-col gap-1">
                  <p className="font-semibold text-foreground break-all">{file.filename}</p>
                  <p className="text-xs text-muted-foreground">
                    {file.mimeType} • {formatFileSize(file.size)} • Uploaded {formatDateTime(file.uploadDate)}
                  </p>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Input
                    value={deleteReasonByFileId[file.fileId] || ""}
                    onChange={(event) => setDeleteReason(file.fileId, event.target.value)}
                    placeholder="Enter deletion reason (min 5 characters)"
                    className="sm:flex-1"
                  />
                  <Button
                    variant="destructive"
                    onClick={() => void handleDeleteFile(file.fileId)}
                    disabled={deletingFileId === file.fileId}
                    className="sm:w-auto"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    {deletingFileId === file.fileId ? "Removing..." : "Delete File"}
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
};

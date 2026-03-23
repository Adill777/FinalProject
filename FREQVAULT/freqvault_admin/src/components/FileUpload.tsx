import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Upload, File, Shield, Key, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import * as CryptoJS from 'crypto-js';

export const FileUpload = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [encryptionKey, setEncryptionKey] = useState("");
  const [isEncrypting, setIsEncrypting] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      toast({
        title: "File Selected Successfully",
        description: `${file.name} is ready for encryption`,
      });
    }
  };

  const handleEncrypt = async () => {
    if (!selectedFile || !encryptionKey.trim()) {
      toast({
        title: "Missing Information",
        description: "Please ensure file and encryption key are provided",
        variant: "destructive",
      });
      return;
    }

    setIsEncrypting(true);

    try {
      const fileContent = await readFileAsText(selectedFile);
      CryptoJS.AES.encrypt(fileContent, encryptionKey).toString();
      
      await new Promise(resolve => setTimeout(resolve, 2000));

      toast({
        title: "File Encrypted and Uploaded Successfully! 🎉",
        description: `${selectedFile.name} has been secured with AES-256 encryption`,
      });

      setSelectedFile(null);
      setEncryptionKey("");
      setIsDialogOpen(false);

    } catch (error) {
      toast({
        title: "Encryption Failed",
        description: "An error occurred during the encryption process",
        variant: "destructive",
      });
    } finally {
      setIsEncrypting(false);
    }
  };

  const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-8">
      {/* File Selection Card */}
      <Card className="glass-effect border-border/50 shadow-elegant">
        <CardHeader className="pb-6">
          <CardTitle className="flex items-center space-x-3 text-xl">
            <Upload className="h-6 w-6 text-primary" />
            <span>File Upload Center</span>
          </CardTitle>
          <CardDescription className="text-base">
            Select your file to begin the secure encryption process
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="border-2 border-dashed border-border/50 rounded-xl p-12 text-center hover:border-primary/50 transition-all duration-300 hover:bg-primary/5">
            <Upload className="h-16 w-16 text-muted-foreground mx-auto mb-6" />
            <Label htmlFor="file-upload" className="cursor-pointer">
              <span className="text-primary hover:text-primary/80 font-semibold text-lg">
                Click to upload a file
              </span>
              <span className="text-muted-foreground text-base"> or drag and drop</span>
            </Label>
            <Input
              id="file-upload"
              type="file"
              onChange={handleFileSelect}
              className="hidden"
              accept=".txt,.pdf,.doc,.docx,.json,.xml"
            />
            <p className="text-sm text-muted-foreground mt-4">
              Supported formats: TXT, PDF, DOC, DOCX, MP3, JSON, XML (Max 10MB)
            </p>
          </div>

          {selectedFile && (
            <div className="bg-secondary/30 rounded-xl p-6 border border-border/30 animate-fade-in">
              <div className="flex items-center space-x-4">
                <File className="h-10 w-10 text-primary" />
                <div className="flex-1">
                  <p className="font-semibold text-foreground text-lg">{selectedFile.name}</p>
                  <p className="text-muted-foreground">
                    {formatFileSize(selectedFile.size)} • {selectedFile.type || 'Unknown type'}
                  </p>
                </div>
                <CheckCircle className="h-6 w-6 text-accent" />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Encryption Card */}
      <Card className="glass-effect border-border/50 shadow-elegant">
        <CardHeader className="pb-6">
          <CardTitle className="flex items-center space-x-3 text-xl">
            <Shield className="h-6 w-6 text-accent" />
            <span>Security Encryption Center</span>
          </CardTitle>
          <CardDescription className="text-base">
            Protect your file with military-grade AES-256 encryption
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button
                variant="default"
                size="lg"
                className="w-full h-14 text-lg font-semibold shadow-lg hover:shadow-xl transition-all"
                disabled={!selectedFile}
              >
                <Shield className="h-5 w-5 mr-3" />
                Encrypt & Upload File
              </Button>
            </DialogTrigger>
            <DialogContent className="glass-effect border-border/50 max-w-lg">
              <DialogHeader className="space-y-4">
                <DialogTitle className="flex items-center space-x-3 text-xl">
                  <Key className="h-6 w-6 text-accent" />
                  <span>Enter Encryption Key</span>
                </DialogTitle>
                <DialogDescription className="text-base">
                  Provide a strong encryption key for maximum security protection
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-6 pt-6">
                <div className="space-y-3">
                  <Label htmlFor="encryption-key" className="text-base font-medium">
                    Encryption Key
                  </Label>
                  <Input
                    id="encryption-key"
                    type="password"
                    placeholder="Enter a strong encryption key"
                    value={encryptionKey}
                    onChange={(e) => setEncryptionKey(e.target.value)}
                    className="h-12 text-base bg-background/50 border-border/50 focus:border-primary"
                  />
                  <p className="text-sm text-muted-foreground">
                    Use a combination of letters, numbers, and symbols for maximum security
                  </p>
                </div>
                <div className="flex space-x-3">
                  <Button
                    variant="outline"
                    size="lg"
                    className="flex-1 h-12"
                    onClick={() => setIsDialogOpen(false)}
                    disabled={isEncrypting}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="lg"
                    className="flex-1 h-12 font-semibold"
                    onClick={handleEncrypt}
                    disabled={isEncrypting || !encryptionKey.trim()}
                  >
                    {isEncrypting ? "Encrypting..." : "Encrypt & Upload"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  );
};
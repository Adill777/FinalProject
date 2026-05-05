import { useState } from "react";
import { Button } from "@/components/ui/button";
import { LogOut, Shield, Users, FileUp, FileCheck, Settings, Activity } from "lucide-react";
import { UserList } from "./UserList";
import { UserFileUpload } from "./UserFileUpload";
import { RequestsList } from "./RequestsList";
import { UserManagement } from "./UserManagement";
import { AuditLogViewer } from "./AuditLogViewer";
import { NotificationCenter } from "./NotificationCenter";
import { AdminFilesManager } from "./AdminFilesManager";

interface DashboardProps {
  onLogout: () => void;
}

interface User {
  id: string;
  name: string;
  email: string;
  status: "active" | "inactive";
}

type View = "users" | "upload" | "requests" | "manage" | "audit" | "files";

export const Dashboard = ({ onLogout }: DashboardProps) => {
  const [currentView, setCurrentView] = useState<View>("manage");
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  const handleSelectUser = (user: User) => {
    setSelectedUser(user);
    setCurrentView("upload");
  };

  const handleBackToUsers = () => {
    setCurrentView("users");
    setSelectedUser(null);
  };

  const renderNavButton = (view: View, icon: React.ReactNode, label: string) => (
    <Button
      variant={currentView === view ? "default" : "outline"}
      onClick={() => setCurrentView(view)}
      className={`h-12 px-6 ${
        currentView === view 
          ? "bg-[#0969da] text-white hover:bg-[#0550ae]" 
          : "border-[#d0d7de] bg-white text-[#24292f] hover:bg-[#f6f8fa] dark:border-[#30363d] dark:bg-[#161b22] dark:text-[#e6edf3] dark:hover:bg-[#21262d]"
      }`}
    >
      {icon}
      {label}
    </Button>
  );

  return (
    <div className="min-h-screen bg-[#f6f8fa] text-[#24292f] dark:bg-[#0d1117] dark:text-[#e6edf3]">
      <header className="sticky top-0 z-50 border-b border-[#d0d7de] bg-white/96 backdrop-blur-sm dark:border-[#30363d] dark:bg-[#0d1117]/96">
        <div className="container mx-auto max-w-7xl px-4 py-4 md:px-8 md:py-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center space-x-3 md:space-x-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-[#d0d7de] bg-[#f6f8fa] dark:border-[#30363d] dark:bg-[#161b22]">
                <Shield className="h-6 w-6 text-[#0969da] dark:text-[#58a6ff]" />
              </div>
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-[#1f2328] dark:text-[#e6edf3] md:text-2xl">Aeronox Admin Portal</h1>
                <p className="text-sm text-[#656d76] dark:text-[#8b949e]">Secure governance and access control</p>
              </div>
            </div>
            <div className="flex items-center gap-3 self-end md:self-auto">
              <NotificationCenter />
              <Button
                variant="outline"
                onClick={onLogout}
                className="h-12 border-[#d0d7de] bg-white px-6 text-[#24292f] hover:bg-[#f6f8fa] dark:border-[#30363d] dark:bg-[#161b22] dark:text-[#e6edf3] dark:hover:bg-[#21262d]"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      {currentView !== "upload" && (
        <nav className="border-b border-[#d0d7de] bg-[#f6f8fa]/95 backdrop-blur-sm dark:border-[#30363d] dark:bg-[#0d1117]/95">
          <div className="container mx-auto max-w-7xl px-4 py-3 md:px-8">
            <div className="-mx-1 overflow-x-auto pb-1">
              <div className="flex min-w-max gap-2 rounded-lg border border-[#d0d7de] bg-white p-1 dark:border-[#30363d] dark:bg-[#161b22]">
                {renderNavButton("manage", <Settings className="h-4 w-4 mr-2" />, "User Administration")}
                {renderNavButton("users", <Users className="h-4 w-4 mr-2" />, "Upload Files")}
                {renderNavButton("requests", <FileCheck className="h-4 w-4 mr-2" />, "File Requests")}
                {renderNavButton("files", <FileUp className="h-4 w-4 mr-2" />, "All Uploaded Files")}
                {renderNavButton("audit", <Activity className="h-4 w-4 mr-2" />, "Audit Log")}
              </div>
            </div>
          </div>
        </nav>
      )}

      {/* Main Content */}
      <main className="container mx-auto max-w-7xl px-4 py-8 md:px-8 md:py-10">
        {currentView === "manage" && (
          <UserManagement />
        )}
        
        {currentView === "users" && (
          <UserList onSelectUser={handleSelectUser} />
        )}
        
        {currentView === "upload" && selectedUser && (
          <UserFileUpload user={selectedUser} onBack={handleBackToUsers} />
        )}
        
        {currentView === "requests" && (
          <RequestsList />
        )}
        
        {currentView === "audit" && (
          <AuditLogViewer />
        )}

        {currentView === "files" && (
          <AdminFilesManager />
        )}
      </main>
    </div>
  );
};

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ProfessionalCard } from "@/components/ui/professional-card";
import { ProfessionalButton } from "@/components/ui/professional-button";

interface User {
  id: string;
  email: string;
  name: string;
  status: "active" | "pending";
}

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [users] = useState<User[]>([
    { id: "1", email: "john.doe@company.com", name: "John Doe", status: "active" },
    { id: "2", email: "sarah.wilson@company.com", name: "Sarah Wilson", status: "active" },
    { id: "3", email: "michael.chen@company.com", name: "Michael Chen", status: "pending" },
    { id: "4", email: "emma.davis@company.com", name: "Emma Davis", status: "active" },
    { id: "5", email: "alex.johnson@company.com", name: "Alex Johnson", status: "active" }
  ]);

  const handleLogout = () => {
    navigate("/");
  };

  const handleUserClick = (user: User) => {
    navigate("/admin/encrypt", { state: { user } });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-accent/20 to-secondary">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-lg border-b border-border/50 shadow-[var(--shadow-soft)]">
        <div className="max-w-7xl mx-auto px-8 py-6 flex justify-between items-center">
          <h1 className="aeronox-logo text-3xl font-bold">Aeronox Admin</h1>
          <div className="flex items-center gap-6">
            <span className="text-muted-foreground">Administrator</span>
            <ProfessionalButton variant="outline" onClick={handleLogout}>
              Logout
            </ProfessionalButton>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto p-8">
        <div className="mb-12 animate-fade-in-up">
          <h2 className="text-4xl font-semibold mb-4">User Management</h2>
          <p className="text-xl text-muted-foreground">Select a user to manage their files and encryption</p>
        </div>

        <div className="grid gap-6">
          {users.map((user, index) => (
            <ProfessionalCard 
              key={user.id} 
              className="p-8 cursor-pointer hover:shadow-[var(--shadow-medium)] transition-all duration-300 hover:scale-[1.02] animate-scale-in"
              style={{ animationDelay: `${index * 0.1}s` }}
              onClick={() => handleUserClick(user)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  handleUserClick(user);
                }
              }}
              role="button"
              tabIndex={0}
              aria-label={`Manage files for ${user.name}, ${user.email}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-6">
                  <div className="w-16 h-16 bg-gradient-to-br from-primary to-primary-glow rounded-full flex items-center justify-center">
                    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold">{user.name}</h3>
                    <p className="text-muted-foreground">{user.email}</p>
                  </div>
                </div>

                <div className="flex items-center space-x-4">
                  <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                    user.status === "active" 
                      ? "bg-green-100 text-green-700" 
                      : "bg-yellow-100 text-yellow-700"
                  }`}>
                    {user.status}
                  </div>
                  <svg className="w-6 h-6 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </ProfessionalCard>
          ))}
        </div>

        {/* Statistics Card */}
        <ProfessionalCard className="mt-12 p-8 animate-fade-in-up" style={{ animationDelay: "0.5s" }}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="text-3xl font-bold text-primary mb-2">{users.length}</div>
              <div className="text-muted-foreground">Total Users</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600 mb-2">
                {users.filter(u => u.status === "active").length}
              </div>
              <div className="text-muted-foreground">Active Users</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-yellow-600 mb-2">
                {users.filter(u => u.status === "pending").length}
              </div>
              <div className="text-muted-foreground">Pending Users</div>
            </div>
          </div>
        </ProfessionalCard>
      </div>
    </div>
  );
};

export default AdminDashboard;

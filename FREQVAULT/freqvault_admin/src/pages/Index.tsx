import { useAuth } from "@/context/AuthContext";
import { Dashboard } from "@/components/Dashboard";

const Index = () => {
  const { logout } = useAuth();

  return <Dashboard onLogout={logout} />;
};

export default Index;

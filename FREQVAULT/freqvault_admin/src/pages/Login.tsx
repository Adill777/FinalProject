import { useAuth } from "@/context/AuthContext";
import { LoginForm } from "@/components/LoginForm";

const Login = () => {
  const { login } = useAuth();
  return <LoginForm onLogin={login} />;
};

export default Login;

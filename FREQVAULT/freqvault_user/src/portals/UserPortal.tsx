import { Routes, Route } from "react-router-dom";
import UserSignup from "../pages/user/UserSignup";
import UserLogin from "../pages/user/UserLogin";
import UserAuth from "../pages/user/UserAuth";
import UserKeyGen from "../pages/user/UserKeyGen";
import UserFiles from "../pages/user/UserFiles";
import ForgotPassword from "../pages/user/ForgotPassword";
import ResetPassword from "../pages/user/ResetPassword";
import UserAgreement from "../pages/user/UserAgreement";
import PrivacyPolicy from "../pages/user/PrivacyPolicy";
import CookiePolicy from "../pages/user/CookiePolicy";
import NotFound from "../pages/NotFound";
import { RedirectIfUserAuthenticated, RequireUserAuth } from "@/components/auth/UserRouteGuards";

const UserPortal = () => {
  return (
    <Routes>
      <Route element={<RedirectIfUserAuthenticated />}>
        <Route path="/" element={<UserSignup />} />
        <Route path="/signup" element={<UserSignup />} />
        <Route path="/login" element={<UserLogin />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
      </Route>

      <Route element={<RequireUserAuth />}>
        <Route path="/auth" element={<UserAuth />} />
        <Route path="/keygen" element={<UserKeyGen />} />
        <Route path="/files" element={<UserFiles />} />
      </Route>

      <Route path="/legal/user-agreement" element={<UserAgreement />} />
      <Route path="/legal/privacy-policy" element={<PrivacyPolicy />} />
      <Route path="/legal/cookie-policy" element={<CookiePolicy />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

export default UserPortal;

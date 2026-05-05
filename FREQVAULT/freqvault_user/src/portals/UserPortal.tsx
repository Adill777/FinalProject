import { Suspense, lazy } from "react";
import { Routes, Route } from "react-router-dom";
import { RedirectIfUserAuthenticated, RequireUserAuth } from "@/components/auth/UserRouteGuards";

const UserSignup = lazy(() => import("../pages/user/UserSignup"));
const UserLogin = lazy(() => import("../pages/user/UserLogin"));
const UserAuth = lazy(() => import("../pages/user/UserAuth"));
const UserKeyGen = lazy(() => import("../pages/user/UserKeyGen"));
const UserFiles = lazy(() => import("../pages/user/UserFiles"));
const ForgotPassword = lazy(() => import("../pages/user/ForgotPassword"));
const ResetPassword = lazy(() => import("../pages/user/ResetPassword"));
const UserAgreement = lazy(() => import("../pages/user/UserAgreement"));
const PrivacyPolicy = lazy(() => import("../pages/user/PrivacyPolicy"));
const CookiePolicy = lazy(() => import("../pages/user/CookiePolicy"));
const NotFound = lazy(() => import("../pages/NotFound"));

const PortalFallback = () => (
  <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
    <div className="text-sm text-muted-foreground">Loading portal...</div>
  </div>
);

const UserPortal = () => {
  return (
    <Suspense fallback={<PortalFallback />}>
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
    </Suspense>
  );
};

export default UserPortal;

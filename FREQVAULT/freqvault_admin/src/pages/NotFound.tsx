import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 to-accent/5 p-6">
      <div className="mx-auto flex min-h-screen max-w-3xl items-center justify-center">
        <Card className="w-full max-w-xl border-border/60 bg-card/95">
          <CardContent className="p-10 text-center">
            <p className="text-sm font-medium uppercase tracking-wide text-primary">404</p>
            <h1 className="mt-2 text-3xl font-bold text-foreground">Page not found</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              The page you requested does not exist or may have been moved.
            </p>
            <div className="mt-6">
              <Link to="/" className="text-sm text-primary hover:underline">
                Return to Home
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default NotFound;

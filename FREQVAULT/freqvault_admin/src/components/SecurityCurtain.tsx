import { useEffect, useState } from "react";

export const SecurityCurtain = ({ children }: { children: React.ReactNode }) => {
    const [isBlurred, setIsBlurred] = useState(false);

    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.hidden) {
                setIsBlurred(true);
            } else {
                setIsBlurred(false);
            }
        };

        const handleBlur = () => setIsBlurred(true);
        const handleFocus = () => setIsBlurred(false);

        document.addEventListener("visibilitychange", handleVisibilityChange);
        window.addEventListener("blur", handleBlur);
        window.addEventListener("focus", handleFocus);

        // Run once on mount in case it loads hidden
        if (document.hidden || !document.hasFocus()) {
            setIsBlurred(true);
        }

        return () => {
            document.removeEventListener("visibilitychange", handleVisibilityChange);
            window.removeEventListener("blur", handleBlur);
            window.removeEventListener("focus", handleFocus);
        };
    }, []);

    return (
        <div
            style={{
                filter: isBlurred ? "blur(20px)" : "none",
                transition: "filter 0.2s ease",
                minHeight: "100vh"
            }}
        >
            {children}
        </div>
    );
};

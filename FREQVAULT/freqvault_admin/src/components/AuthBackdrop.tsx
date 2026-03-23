const AuthBackdrop = () => {
  return (
    <>
      <style>
        {`
          @keyframes auth-float-a {
            0% { transform: translate3d(0, 0, 0) scale(1); }
            50% { transform: translate3d(16px, -18px, 0) scale(1.05); }
            100% { transform: translate3d(0, 0, 0) scale(1); }
          }
          @keyframes auth-float-b {
            0% { transform: translate3d(0, 0, 0) scale(1); }
            50% { transform: translate3d(-20px, 14px, 0) scale(0.96); }
            100% { transform: translate3d(0, 0, 0) scale(1); }
          }
          @keyframes auth-float-c {
            0% { transform: translate3d(0, 0, 0) scale(1); }
            50% { transform: translate3d(10px, 20px, 0) scale(1.04); }
            100% { transform: translate3d(0, 0, 0) scale(1); }
          }
          @keyframes auth-enter {
            0% { opacity: 0; transform: translateY(8px); }
            100% { opacity: 1; transform: translateY(0); }
          }
        `}
      </style>

      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute inset-0 bg-[radial-gradient(1200px_600px_at_10%_-10%,rgba(9,105,218,0.22),transparent_60%),radial-gradient(900px_500px_at_100%_0%,rgba(251,143,68,0.18),transparent_62%),radial-gradient(800px_500px_at_50%_110%,rgba(12,112,242,0.14),transparent_58%)] dark:bg-[radial-gradient(1200px_600px_at_10%_-10%,rgba(47,129,247,0.28),transparent_60%),radial-gradient(900px_500px_at_100%_0%,rgba(251,143,68,0.22),transparent_62%),radial-gradient(800px_500px_at_50%_110%,rgba(56,139,253,0.24),transparent_58%)]" />
        <div className="absolute inset-0 opacity-50 dark:opacity-35 [background-image:linear-gradient(to_right,rgba(31,35,40,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(31,35,40,0.08)_1px,transparent_1px)] dark:[background-image:linear-gradient(to_right,rgba(230,237,243,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(230,237,243,0.08)_1px,transparent_1px)] [background-size:44px_44px]" />

        <div
          className="absolute -left-16 top-20 h-52 w-52 rounded-full bg-[#58a6ff]/30 blur-3xl dark:bg-[#388bfd]/35"
          style={{ animation: "auth-float-a 12s ease-in-out infinite" }}
        />
        <div
          className="absolute right-[-80px] top-[18%] h-72 w-72 rounded-full bg-[#fb8f44]/25 blur-3xl dark:bg-[#fb8f44]/30"
          style={{ animation: "auth-float-b 15s ease-in-out infinite" }}
        />
        <div
          className="absolute bottom-[-110px] left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-[#0969da]/22 blur-3xl dark:bg-[#2f81f7]/27"
          style={{ animation: "auth-float-c 16s ease-in-out infinite" }}
        />
      </div>
    </>
  );
};

export default AuthBackdrop;

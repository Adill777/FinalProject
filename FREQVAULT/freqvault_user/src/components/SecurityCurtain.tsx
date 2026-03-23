import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ShieldAlert } from "lucide-react";
import { clearUserSession, logUserSecurityEvent } from "@/lib/api";

const SCREENSHOT_LOCK_MS = 15000;
const TRIGGER_BAD_FRAMES = 3;
const RELEASE_GOOD_FRAMES = 4;
const MONITORING_EVENT = "security-curtain-monitoring";
const HIGH_RISK_WINDOW_MS = 5 * 60 * 1000;
const FORCE_REAUTH_EVENT_THRESHOLD = 5;
const DEVTOOLS_TAMPER_WINDOW_MS = 5 * 60 * 1000;
const DEVTOOLS_FORCE_REAUTH_EVENTS = 2;
const ENABLE_FORCE_REAUTH = false;
const ENABLE_PASSIVE_DEVTOOLS_PROBE = false;
const PHONE_CLASS_TOKENS = new Set(["cell phone", "mobile phone", "phone"]);
const SCREEN_CLASS_TOKENS = new Set(["tv", "laptop", "computer"]);
const SCENE_DIFF_THRESHOLD = 34;
const MIN_HIGH_CONF_FRAMES = 3;
const MIN_CONTEXT_FRAMES = 6;
const REFLECTION_GRACE_MS = 12000;
const FOCUS_LOSS_GRACE_MS = 800;
const MONITORING_TAMPER_ERROR_THRESHOLD = 3;
const BOX_IOU_DEDUP_THRESHOLD = 0.5;
const PERSON_MIN_AREA_RATIO = 0.0035;
const PERSON_SOFT_AREA_RATIO = 0.005;
const PERSON_HARD_AREA_RATIO = 0.009;
const PERSON_SEPARATION_X = 0.12;
const PHONE_MIN_AREA_RATIO = 0.0007;
const PHONE_HARD_AREA_RATIO = 0.0016;
const PHONE_TALL_ASPECT_RATIO = 1.35;
const PHONE_LANDSCAPE_ASPECT_RATIO = 1.2;
const POINTER_OUTSIDE_GRACE_MS = 150;
const HEURISTIC_EVENT_COOLDOWN_MS = 12000;
const DEVTOOLS_LIKELY_FRAMES_THRESHOLD = 3;

type DetectionPrediction = {
  class: string;
  score: number;
  bbox?: [number, number, number, number];
};

type CocoDetector = {
  detect: (
    img: HTMLVideoElement | HTMLCanvasElement,
    maxNumBoxes?: number,
    minScore?: number
  ) => Promise<DetectionPrediction[]>;
};

let detectorLoaderPromise: Promise<CocoDetector> | null = null;

const loadDetector = async (): Promise<CocoDetector> => {
  if (!detectorLoaderPromise) {
    detectorLoaderPromise = (async () => {
      const tf = await import("@tensorflow/tfjs");
      await tf.ready();
      const cocoSsd = await import("@tensorflow-models/coco-ssd");
      return cocoSsd.load();
    })();
  }
  return detectorLoaderPromise;
};

const getInitialInactiveState = () => {
  if (typeof document === "undefined") return false;
  return document.hidden || !document.hasFocus();
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const computeIou = (
  a: [number, number, number, number],
  b: [number, number, number, number]
) => {
  const [ax, ay, aw, ah] = a;
  const [bx, by, bw, bh] = b;
  const ax2 = ax + aw;
  const ay2 = ay + ah;
  const bx2 = bx + bw;
  const by2 = by + bh;
  const interX1 = Math.max(ax, bx);
  const interY1 = Math.max(ay, by);
  const interX2 = Math.min(ax2, bx2);
  const interY2 = Math.min(ay2, by2);
  const interW = Math.max(0, interX2 - interX1);
  const interH = Math.max(0, interY2 - interY1);
  const interArea = interW * interH;
  const areaA = Math.max(0, aw) * Math.max(0, ah);
  const areaB = Math.max(0, bw) * Math.max(0, bh);
  const union = areaA + areaB - interArea;
  if (union <= 0) return 0;
  return interArea / union;
};

type SecurityMonitoringProfile = "strict" | "balanced" | "performance";

type ProfileConfig = {
  detectorWidth: number;
  detectMaxBoxes: number;
  detectMinScore: number;
  personScoreThreshold: number;
  personSoftScoreThreshold: number;
  phoneScoreThreshold: number;
  phoneSoftScoreThreshold: number;
  dutyRiskMinMs: number;
  dutyRiskMaxMs: number;
  dutyStableMinMs: number;
  dutyStableMaxMs: number;
  noFaceBadFrames: number;
  noFaceReleaseFrames: number;
  multiFaceBadFrames: number;
  multiFaceReleaseFrames: number;
  reflectionBadFrames: number;
  reflectionReleaseFrames: number;
  cameraAimBadFrames: number;
  cameraAimReleaseFrames: number;
  rapidSceneBadFrames: number;
  rapidSceneReleaseFrames: number;
  phoneSoftBadFrames: number;
  phoneSoftReleaseFrames: number;
  phoneHardBadFrames: number;
  phoneHardReleaseFrames: number;
};

const PROFILE_CONFIG: Record<SecurityMonitoringProfile, ProfileConfig> = {
  strict: {
    detectorWidth: 544,
    detectMaxBoxes: 60,
    detectMinScore: 0.04,
    personScoreThreshold: 0.3,
    personSoftScoreThreshold: 0.23,
    phoneScoreThreshold: 0.1,
    phoneSoftScoreThreshold: 0.07,
    dutyRiskMinMs: 500,
    dutyRiskMaxMs: 700,
    dutyStableMinMs: 1000,
    dutyStableMaxMs: 1300,
    noFaceBadFrames: 2,
    noFaceReleaseFrames: 3,
    multiFaceBadFrames: 2,
    multiFaceReleaseFrames: 3,
    reflectionBadFrames: 3,
    reflectionReleaseFrames: 4,
    cameraAimBadFrames: 2,
    cameraAimReleaseFrames: 3,
    rapidSceneBadFrames: 2,
    rapidSceneReleaseFrames: 3,
    phoneSoftBadFrames: 2,
    phoneSoftReleaseFrames: 3,
    phoneHardBadFrames: 1,
    phoneHardReleaseFrames: 2
  },
  balanced: {
    detectorWidth: 480,
    detectMaxBoxes: 45,
    detectMinScore: 0.05,
    personScoreThreshold: 0.3,
    personSoftScoreThreshold: 0.22,
    phoneScoreThreshold: 0.1,
    phoneSoftScoreThreshold: 0.07,
    dutyRiskMinMs: 500,
    dutyRiskMaxMs: 750,
    dutyStableMinMs: 1200,
    dutyStableMaxMs: 1500,
    noFaceBadFrames: 3,
    noFaceReleaseFrames: 4,
    multiFaceBadFrames: 2,
    multiFaceReleaseFrames: 3,
    reflectionBadFrames: 4,
    reflectionReleaseFrames: 5,
    cameraAimBadFrames: 3,
    cameraAimReleaseFrames: 4,
    rapidSceneBadFrames: 3,
    rapidSceneReleaseFrames: 4,
    phoneSoftBadFrames: 2,
    phoneSoftReleaseFrames: 3,
    phoneHardBadFrames: 1,
    phoneHardReleaseFrames: 2
  },
  performance: {
    detectorWidth: 416,
    detectMaxBoxes: 30,
    detectMinScore: 0.06,
    personScoreThreshold: 0.34,
    personSoftScoreThreshold: 0.25,
    phoneScoreThreshold: 0.12,
    phoneSoftScoreThreshold: 0.085,
    dutyRiskMinMs: 650,
    dutyRiskMaxMs: 900,
    dutyStableMinMs: 1400,
    dutyStableMaxMs: 1800,
    noFaceBadFrames: 4,
    noFaceReleaseFrames: 5,
    multiFaceBadFrames: 3,
    multiFaceReleaseFrames: 4,
    reflectionBadFrames: 5,
    reflectionReleaseFrames: 6,
    cameraAimBadFrames: 4,
    cameraAimReleaseFrames: 5,
    rapidSceneBadFrames: 4,
    rapidSceneReleaseFrames: 5,
    phoneSoftBadFrames: 3,
    phoneSoftReleaseFrames: 4,
    phoneHardBadFrames: 1,
    phoneHardReleaseFrames: 3
  }
};

export const SecurityCurtain = ({ children }: { children: ReactNode }) => {
  const [isMonitoringEnabled, setIsMonitoringEnabled] = useState(false);
  const [monitoringProfile, setMonitoringProfile] = useState<SecurityMonitoringProfile>("balanced");
  const [isInactive, setIsInactive] = useState(getInitialInactiveState);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isScreenshotSuspected, setIsScreenshotSuspected] = useState(false);
  const [isAiReady, setIsAiReady] = useState(false);
  const [aiBootError, setAiBootError] = useState<string | null>(null);
  const [aiThreatReason, setAiThreatReason] = useState<string | null>(null);
  const [forcedLogoutReason, setForcedLogoutReason] = useState<string | null>(null);

  const screenshotTimerRef = useRef<number | null>(null);
  const focusLossTimerRef = useRef<number | null>(null);
  const focusWatchdogRef = useRef<number | null>(null);
  const pointerOutsideRef = useRef(false);
  const pointerOutsideTimerRef = useRef<number | null>(null);
  const dutyCycleRef = useRef<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const detectCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<CocoDetector | null>(null);
  const badFrameCountRef = useRef(0);
  const goodFrameCountRef = useRef(0);
  const threatLatchedRef = useRef(false);
  const highRiskEventsRef = useRef<number[]>([]);
  const forcedLogoutRef = useRef(false);
  const lastLoggedThreatRef = useRef<string | null>(null);
  const noFaceFramesRef = useRef(0);
  const noFaceClearFramesRef = useRef(0);
  const noFaceActiveRef = useRef(false);
  const multiFaceFramesRef = useRef(0);
  const multiFaceClearFramesRef = useRef(0);
  const multiFaceActiveRef = useRef(false);
  const reflectionFramesRef = useRef(0);
  const reflectionClearFramesRef = useRef(0);
  const reflectionActiveRef = useRef(false);
  const cameraAimFramesRef = useRef(0);
  const cameraAimClearFramesRef = useRef(0);
  const cameraAimActiveRef = useRef(false);
  const rapidSceneFramesRef = useRef(0);
  const rapidSceneClearFramesRef = useRef(0);
  const rapidSceneActiveRef = useRef(false);
  const phoneSoftFramesRef = useRef(0);
  const phoneSoftClearFramesRef = useRef(0);
  const phoneSoftActiveRef = useRef(false);
  const phoneHardFramesRef = useRef(0);
  const phoneHardClearFramesRef = useRef(0);
  const phoneHardActiveRef = useRef(false);
  const riskStreakRef = useRef(0);
  const stableStreakRef = useRef(0);
  const prevSceneVectorRef = useRef<number[] | null>(null);
  const detectionFramesRef = useRef(0);
  const monitoringStartedAtRef = useRef(0);
  const detectionErrorStreakRef = useRef(0);
  const devtoolsLikelyFramesRef = useRef(0);
  const devtoolsTamperEventsRef = useRef<number[]>([]);
  const devtoolsIntervalRef = useRef<number | null>(null);
  const lastDevtoolsAlertAtRef = useRef(0);
  const lastHeuristicEventAtRef = useRef<Record<string, number>>({});
  const monitoringEnabledRef = useRef(false);
  const profileConfig = PROFILE_CONFIG[monitoringProfile];

  useEffect(() => {
    monitoringEnabledRef.current = isMonitoringEnabled;
  }, [isMonitoringEnabled]);

  useEffect(() => {
    const clearFocusLossTimer = () => {
      if (focusLossTimerRef.current !== null) {
        window.clearTimeout(focusLossTimerRef.current);
        focusLossTimerRef.current = null;
      }
    };

    const scheduleInactiveLock = () => {
      clearFocusLossTimer();
      focusLossTimerRef.current = window.setTimeout(() => {
        if (!monitoringEnabledRef.current) return;
        setIsInactive(document.hidden || !document.hasFocus());
      }, FOCUS_LOSS_GRACE_MS);
    };

    const onVisibilityChange = () => {
      if (!monitoringEnabledRef.current) {
        setIsInactive(false);
        return;
      }
      if (document.hidden) {
        setIsInactive(true);
        return;
      }
      if (document.hasFocus()) {
        clearFocusLossTimer();
        setIsInactive(pointerOutsideRef.current || document.hidden || !document.hasFocus());
        return;
      }
      scheduleInactiveLock();
    };

    const onBlur = () => {
      if (!monitoringEnabledRef.current) return;
      // Lock immediately on any window blur.
      setIsInactive(true);
      scheduleInactiveLock();
    };
    const onFocus = () => {
      if (!monitoringEnabledRef.current) return;
      clearFocusLossTimer();
      setIsInactive(pointerOutsideRef.current || document.hidden || !document.hasFocus());
    };
    const onWindowFocusOut = () => {
      if (!monitoringEnabledRef.current) return;
      setIsInactive(true);
      scheduleInactiveLock();
    };
    const onWindowFocusIn = () => {
      if (!monitoringEnabledRef.current) return;
      clearFocusLossTimer();
      setIsInactive(pointerOutsideRef.current || document.hidden || !document.hasFocus());
    };
    const onMouseOut = (event: MouseEvent) => {
      if (!monitoringEnabledRef.current) return;
      // If the pointer leaves the window, treat it as focus loss.
      if (event.relatedTarget === null) {
        pointerOutsideRef.current = true;
        if (pointerOutsideTimerRef.current !== null) {
          window.clearTimeout(pointerOutsideTimerRef.current);
        }
        pointerOutsideTimerRef.current = window.setTimeout(() => {
          setIsInactive(true);
        }, POINTER_OUTSIDE_GRACE_MS);
        setIsInactive(true);
        scheduleInactiveLock();
      }
    };
    const onMouseOver = () => {
      if (!monitoringEnabledRef.current) return;
      // Ignore internal element hovers; only unlock on explicit window entry.
      return;
    };
    const onMouseEnter = () => {
      if (!monitoringEnabledRef.current) return;
      pointerOutsideRef.current = false;
      if (pointerOutsideTimerRef.current !== null) {
        window.clearTimeout(pointerOutsideTimerRef.current);
        pointerOutsideTimerRef.current = null;
      }
      setIsInactive(document.hidden || !document.hasFocus());
    };
    const onPageHide = () => {
      if (!monitoringEnabledRef.current) return;
      clearFocusLossTimer();
      setIsInactive(true);
    };

    const onBeforePrint = () => {
      if (!monitoringEnabledRef.current) return;
      setIsPrinting(true);
    };
    const onAfterPrint = () => {
      if (!monitoringEnabledRef.current) return;
      setIsPrinting(false);
    };

    const triggerScreenshotLock = () => {
      if (!monitoringEnabledRef.current) return;
      setIsScreenshotSuspected(true);
      if (screenshotTimerRef.current !== null) {
        window.clearTimeout(screenshotTimerRef.current);
      }
      screenshotTimerRef.current = window.setTimeout(() => {
        setIsScreenshotSuspected(false);
      }, SCREENSHOT_LOCK_MS);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (!monitoringEnabledRef.current) return;
      const key = event.key.toLowerCase();
      const isMacScreenshotCombo =
        event.metaKey &&
        event.shiftKey &&
        (key === "3" || key === "4" || key === "5" || key === "s");
      const isWindowsSnipCombo = event.ctrlKey && event.shiftKey && key === "s";
      const isWindowsToolCombo = event.metaKey && event.shiftKey && key === "s";
      const isLinuxScreenshotCombo =
        (event.ctrlKey || event.shiftKey || event.altKey) && key === "printscreen";
      const isSensitiveShortcut =
        ((event.ctrlKey || event.metaKey) && (key === "c" || key === "x" || key === "s" || key === "p")) ||
        ((event.ctrlKey || event.metaKey) && event.shiftKey && key === "s");

      if (key === "printscreen" || isMacScreenshotCombo || isWindowsSnipCombo || isWindowsToolCombo || isLinuxScreenshotCombo) {
        event.preventDefault();
        event.stopPropagation();
        triggerScreenshotLock();
        return;
      }

      if (isSensitiveShortcut) {
        event.preventDefault();
        event.stopPropagation();
        triggerScreenshotLock();
      }
    };
    const blockClipboardLikeActions = (event: Event) => {
      if (!monitoringEnabledRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      triggerScreenshotLock();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    window.addEventListener("focusout", onWindowFocusOut);
    window.addEventListener("focusin", onWindowFocusIn);
    window.addEventListener("mouseout", onMouseOut);
    window.addEventListener("mouseover", onMouseOver);
    window.addEventListener("mouseenter", onMouseEnter);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeprint", onBeforePrint);
    window.addEventListener("afterprint", onAfterPrint);
    window.addEventListener("keydown", onKeyDown, { capture: true });
    document.addEventListener("copy", blockClipboardLikeActions, { capture: true });
    document.addEventListener("cut", blockClipboardLikeActions, { capture: true });
    document.addEventListener("dragstart", blockClipboardLikeActions, { capture: true });
    document.addEventListener("contextmenu", blockClipboardLikeActions, { capture: true });

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("focusout", onWindowFocusOut);
      window.removeEventListener("focusin", onWindowFocusIn);
      window.removeEventListener("mouseout", onMouseOut);
      window.removeEventListener("mouseover", onMouseOver);
      window.removeEventListener("mouseenter", onMouseEnter);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeprint", onBeforePrint);
      window.removeEventListener("afterprint", onAfterPrint);
      window.removeEventListener("keydown", onKeyDown, { capture: true });
      document.removeEventListener("copy", blockClipboardLikeActions, { capture: true });
      document.removeEventListener("cut", blockClipboardLikeActions, { capture: true });
      document.removeEventListener("dragstart", blockClipboardLikeActions, { capture: true });
      document.removeEventListener("contextmenu", blockClipboardLikeActions, { capture: true });
      if (screenshotTimerRef.current !== null) {
        window.clearTimeout(screenshotTimerRef.current);
      }
      if (pointerOutsideTimerRef.current !== null) {
        window.clearTimeout(pointerOutsideTimerRef.current);
        pointerOutsideTimerRef.current = null;
      }
      if (focusWatchdogRef.current !== null) {
        window.clearInterval(focusWatchdogRef.current);
        focusWatchdogRef.current = null;
      }
      clearFocusLossTimer();
    };
  }, []);

  useEffect(() => {
    if (!forcedLogoutReason || forcedLogoutRef.current) return;
    void logUserSecurityEvent({
      type: "forced_reauth",
      reason: forcedLogoutReason,
      metadata: {
        riskEventsInWindow: highRiskEventsRef.current.length,
        riskWindowMs: HIGH_RISK_WINDOW_MS
      }
    });
    forcedLogoutRef.current = true;
    clearUserSession();
    window.dispatchEvent(
      new CustomEvent(MONITORING_EVENT, {
        detail: { enabled: false }
      })
    );
    window.setTimeout(() => {
      window.location.assign("/login");
    }, 250);
  }, [forcedLogoutReason]);

  useEffect(() => {
    // Focus watchdog for cases where blur/focus events are unreliable.
    if (focusWatchdogRef.current !== null) {
      window.clearInterval(focusWatchdogRef.current);
      focusWatchdogRef.current = null;
    }
    if (isMonitoringEnabled) {
      focusWatchdogRef.current = window.setInterval(() => {
        const inactive = document.hidden || !document.hasFocus();
        if (inactive) {
          setIsInactive(true);
        } else {
          setIsInactive(false);
        }
      }, 1000);
    }
    return () => {
      if (focusWatchdogRef.current !== null) {
        window.clearInterval(focusWatchdogRef.current);
        focusWatchdogRef.current = null;
      }
    };
  }, [isMonitoringEnabled]);

  useEffect(() => {
    if (!isMonitoringEnabled || !aiBootError) return;
    void logUserSecurityEvent({
      type: "ai_boot_error",
      reason: aiBootError
    });
  }, [isMonitoringEnabled, aiBootError]);

  useEffect(() => {
    if (!isMonitoringEnabled) return;
    if (!aiThreatReason) {
      lastLoggedThreatRef.current = null;
      return;
    }
    if (lastLoggedThreatRef.current === aiThreatReason) return;
    lastLoggedThreatRef.current = aiThreatReason;
    void logUserSecurityEvent({
      type: "ai_lock",
      reason: aiThreatReason
    });
  }, [isMonitoringEnabled, aiThreatReason]);

  useEffect(() => {
    const onMonitoringToggle = (event: Event) => {
      const customEvent = event as CustomEvent<{ enabled?: boolean; profile?: SecurityMonitoringProfile }>;
      const requestedProfile = customEvent.detail?.profile;
      if (requestedProfile && PROFILE_CONFIG[requestedProfile]) {
        setMonitoringProfile(requestedProfile);
      } else {
        setMonitoringProfile("balanced");
      }
      const enabled = Boolean(customEvent.detail?.enabled);
      const wasEnabled = monitoringEnabledRef.current;
      // Keep ref in sync immediately to avoid race with event handlers.
      monitoringEnabledRef.current = enabled;
      if (enabled && !wasEnabled) {
        // Hard-reset transient detector state every monitoring session to avoid stale locks.
        badFrameCountRef.current = 0;
        goodFrameCountRef.current = 0;
        noFaceFramesRef.current = 0;
        noFaceClearFramesRef.current = 0;
        noFaceActiveRef.current = false;
        multiFaceFramesRef.current = 0;
        multiFaceClearFramesRef.current = 0;
        multiFaceActiveRef.current = false;
        reflectionFramesRef.current = 0;
        reflectionClearFramesRef.current = 0;
        reflectionActiveRef.current = false;
        cameraAimFramesRef.current = 0;
        cameraAimClearFramesRef.current = 0;
        cameraAimActiveRef.current = false;
        rapidSceneFramesRef.current = 0;
        rapidSceneClearFramesRef.current = 0;
        rapidSceneActiveRef.current = false;
        phoneSoftFramesRef.current = 0;
        phoneSoftClearFramesRef.current = 0;
        phoneSoftActiveRef.current = false;
        phoneHardFramesRef.current = 0;
        phoneHardClearFramesRef.current = 0;
        phoneHardActiveRef.current = false;
        riskStreakRef.current = 0;
        stableStreakRef.current = 0;
        prevSceneVectorRef.current = null;
        detectionFramesRef.current = 0;
        monitoringStartedAtRef.current = 0;
        detectionErrorStreakRef.current = 0;
        devtoolsLikelyFramesRef.current = 0;
        threatLatchedRef.current = false;
        setAiThreatReason(null);
        setIsScreenshotSuspected(false);
        // Immediately enforce curtain if protected mode starts while page is not active.
        setIsInactive(document.hidden || !document.hasFocus());
      }
      if (enabled !== wasEnabled) {
        setIsMonitoringEnabled(enabled);
      }
      if (!enabled) {
        setIsInactive(false);
        setIsPrinting(false);
        setIsScreenshotSuspected(false);
      }
    };

    window.addEventListener(MONITORING_EVENT, onMonitoringToggle as EventListener);
    return () => {
      window.removeEventListener(MONITORING_EVENT, onMonitoringToggle as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!isMonitoringEnabled) {
      if (dutyCycleRef.current !== null) {
        window.clearTimeout(dutyCycleRef.current);
        dutyCycleRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      detectorRef.current = null;
      videoRef.current = null;
      badFrameCountRef.current = 0;
      goodFrameCountRef.current = 0;
      noFaceFramesRef.current = 0;
      noFaceClearFramesRef.current = 0;
      noFaceActiveRef.current = false;
      multiFaceFramesRef.current = 0;
      multiFaceClearFramesRef.current = 0;
      multiFaceActiveRef.current = false;
      reflectionFramesRef.current = 0;
      reflectionClearFramesRef.current = 0;
      reflectionActiveRef.current = false;
      cameraAimFramesRef.current = 0;
      cameraAimClearFramesRef.current = 0;
      cameraAimActiveRef.current = false;
      rapidSceneFramesRef.current = 0;
      rapidSceneClearFramesRef.current = 0;
      rapidSceneActiveRef.current = false;
      phoneSoftFramesRef.current = 0;
      phoneSoftClearFramesRef.current = 0;
      phoneSoftActiveRef.current = false;
      phoneHardFramesRef.current = 0;
      phoneHardClearFramesRef.current = 0;
      phoneHardActiveRef.current = false;
      riskStreakRef.current = 0;
      stableStreakRef.current = 0;
      prevSceneVectorRef.current = null;
      detectionFramesRef.current = 0;
      monitoringStartedAtRef.current = 0;
      detectionErrorStreakRef.current = 0;
      devtoolsLikelyFramesRef.current = 0;
      devtoolsTamperEventsRef.current = [];
      lastDevtoolsAlertAtRef.current = 0;
      lastHeuristicEventAtRef.current = {};
      if (devtoolsIntervalRef.current !== null) {
        window.clearInterval(devtoolsIntervalRef.current);
        devtoolsIntervalRef.current = null;
      }
      setIsAiReady(false);
      setAiBootError(null);
      setAiThreatReason(null);
      threatLatchedRef.current = false;
      return;
    }

    let mounted = true;

    const registerHighRiskEvent = (reason: string) => {
      const now = Date.now();
      highRiskEventsRef.current = highRiskEventsRef.current.filter((timestamp) => now - timestamp <= HIGH_RISK_WINDOW_MS);
      highRiskEventsRef.current.push(now);
      if (ENABLE_FORCE_REAUTH && highRiskEventsRef.current.length >= FORCE_REAUTH_EVENT_THRESHOLD) {
        setForcedLogoutReason(
          `Repeated high-risk detections (${FORCE_REAUTH_EVENT_THRESHOLD}) in 5 minutes: ${reason}. Re-authentication required.`
        );
      }
    };

    const registerDevtoolsTamper = (reason: string) => {
      const now = Date.now();
      if (now - lastDevtoolsAlertAtRef.current < 2000) return;
      lastDevtoolsAlertAtRef.current = now;

      devtoolsTamperEventsRef.current = devtoolsTamperEventsRef.current.filter(
        (timestamp) => now - timestamp <= DEVTOOLS_TAMPER_WINDOW_MS
      );
      devtoolsTamperEventsRef.current.push(now);
      void logUserSecurityEvent({
        type: "devtools_tamper",
        reason,
        metadata: {
          eventsInWindow: devtoolsTamperEventsRef.current.length,
          windowMs: DEVTOOLS_TAMPER_WINDOW_MS
        }
      });

      registerHighRiskEvent(reason);
      setAiThreatReason(reason);

      if (ENABLE_FORCE_REAUTH && devtoolsTamperEventsRef.current.length >= DEVTOOLS_FORCE_REAUTH_EVENTS) {
        setForcedLogoutReason(
          `Repeated developer-tools tampering detected (${DEVTOOLS_FORCE_REAUTH_EVENTS}) in 5 minutes. Re-authentication required.`
        );
      }
    };

      const emitHeuristicEvent = (
        key: string,
        payload: Parameters<typeof logUserSecurityEvent>[0]
      ) => {
        const now = Date.now();
        const last = lastHeuristicEventAtRef.current[key] || 0;
      if (now - last < HEURISTIC_EVENT_COOLDOWN_MS) return;
        lastHeuristicEventAtRef.current[key] = now;
        void logUserSecurityEvent(payload);
      };

    const updateDetectorHysteresis = (
      candidate: boolean,
      triggerFrames: number,
      releaseFrames: number,
      activeRef: { current: boolean },
      hitFramesRef: { current: number },
      clearFramesRef: { current: number }
    ) => {
      if (candidate) {
        hitFramesRef.current += 1;
        clearFramesRef.current = 0;
        if (!activeRef.current && hitFramesRef.current >= triggerFrames) {
          activeRef.current = true;
        }
      } else {
        hitFramesRef.current = 0;
        clearFramesRef.current += 1;
        if (activeRef.current && clearFramesRef.current >= releaseFrames) {
          activeRef.current = false;
        }
      }
      return activeRef.current;
    };

    const nextDutyCycleMs = (hasRisk: boolean) => {
      if (hasRisk) {
        riskStreakRef.current += 1;
        stableStreakRef.current = 0;
        return clamp(
          profileConfig.dutyRiskMaxMs - riskStreakRef.current * 35,
          profileConfig.dutyRiskMinMs,
          profileConfig.dutyRiskMaxMs
        );
      }
      stableStreakRef.current += 1;
      riskStreakRef.current = 0;
      return clamp(
        profileConfig.dutyStableMinMs + stableStreakRef.current * 45,
        profileConfig.dutyStableMinMs,
        profileConfig.dutyStableMaxMs
      );
    };

    const applyThreat = (reason: string | null) => {
      if (reason) {
        badFrameCountRef.current += 1;
        goodFrameCountRef.current = 0;
        if (badFrameCountRef.current >= TRIGGER_BAD_FRAMES && mounted) {
          if (!threatLatchedRef.current) {
            registerHighRiskEvent(reason);
            threatLatchedRef.current = true;
          }
          setAiThreatReason(reason);
        }
        return;
      }

      goodFrameCountRef.current += 1;
      badFrameCountRef.current = 0;
      if (goodFrameCountRef.current >= RELEASE_GOOD_FRAMES && mounted) {
        threatLatchedRef.current = false;
        setAiThreatReason(null);
      }
    };

    const initializeAiDutyCycle = async () => {
      try {
        setAiBootError(null);
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: false
        });
        if (!mounted) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;

        const video = document.createElement("video");
        video.setAttribute("playsinline", "true");
        video.autoplay = true;
        video.muted = true;
        video.srcObject = stream;
        await video.play();
        if (!mounted) return;
        videoRef.current = video;
        detectCanvasRef.current = document.createElement("canvas");

        const detector = await loadDetector();
        if (!mounted) return;
        detectorRef.current = detector;
        monitoringStartedAtRef.current = Date.now();
        setIsAiReady(true);

        const isDevtoolsLikelyOpen = () => {
          const widthGap = window.outerWidth - window.innerWidth;
          const heightGap = window.outerHeight - window.innerHeight;
          return widthGap > 360 || heightGap > 360;
        };

        const onTamperKeydown = (event: KeyboardEvent) => {
          if (!isMonitoringEnabled) return;
          const key = event.key.toLowerCase();
          const isDevtoolsShortcut =
            key === "f12" ||
            ((event.ctrlKey || event.metaKey) && event.shiftKey && (key === "i" || key === "j" || key === "c")) ||
            ((event.ctrlKey || event.metaKey) && key === "u");
          if (isDevtoolsShortcut) {
            registerDevtoolsTamper("Developer tools shortcut detected during protected view.");
          }
        };

        document.addEventListener("keydown", onTamperKeydown, { capture: true });
        if (ENABLE_PASSIVE_DEVTOOLS_PROBE) {
          devtoolsIntervalRef.current = window.setInterval(() => {
            if (!isMonitoringEnabled || document.hidden || !document.hasFocus()) return;
            if (isDevtoolsLikelyOpen()) {
              devtoolsLikelyFramesRef.current += 1;
              if (devtoolsLikelyFramesRef.current >= DEVTOOLS_LIKELY_FRAMES_THRESHOLD) {
                registerDevtoolsTamper("Developer tools panel appears to be open during protected view.");
                devtoolsLikelyFramesRef.current = 0;
              }
              return;
            }
            devtoolsLikelyFramesRef.current = 0;
          }, 1200);
        }

        const runDetectionCycle = async () => {
          let cycleDelayMs = profileConfig.dutyStableMinMs;
          try {
            if (!videoRef.current || !detectorRef.current) {
              applyThreat(null);
              cycleDelayMs = nextDutyCycleMs(false);
              return;
            }
            if (document.hidden || !document.hasFocus()) {
              applyThreat(null);
              cycleDelayMs = nextDutyCycleMs(false);
              return;
            }
            if (videoRef.current.readyState < 2) {
              applyThreat(null);
              cycleDelayMs = nextDutyCycleMs(false);
              return;
            }

            const detectorInput = detectCanvasRef.current;
            if (!detectorInput) {
              applyThreat(null);
              cycleDelayMs = nextDutyCycleMs(false);
              return;
            }
            const videoEl = videoRef.current;
            const sourceWidth = Math.max(videoEl.videoWidth || 0, 1);
            const sourceHeight = Math.max(videoEl.videoHeight || 0, 1);
            const targetWidth = profileConfig.detectorWidth;
            const targetHeight = Math.max(Math.round((sourceHeight / sourceWidth) * targetWidth), 1);
            if (detectorInput.width !== targetWidth || detectorInput.height !== targetHeight) {
              detectorInput.width = targetWidth;
              detectorInput.height = targetHeight;
            }
            const ctx = detectorInput.getContext("2d", { willReadFrequently: false });
            if (!ctx) {
              applyThreat(null);
              cycleDelayMs = nextDutyCycleMs(false);
              return;
            }
            ctx.drawImage(videoEl, 0, 0, targetWidth, targetHeight);

            // Ask detector for more proposals with low minScore to improve small phone/person recall.
            const predictions = await detectorRef.current.detect(
              detectorInput,
              profileConfig.detectMaxBoxes,
              profileConfig.detectMinScore
            );
            detectionFramesRef.current += 1;
            detectionErrorStreakRef.current = 0;
            const personCandidates: Array<{
              score: number;
              areaRatio: number;
              centerX: number;
              bbox: [number, number, number, number];
            }> = [];
            const phoneCandidates: Array<{
              score: number;
              areaRatio: number;
              centerX: number;
              centerY: number;
              bbox: [number, number, number, number];
              isLandscape: boolean;
            }> = [];
            let phones = 0;
            let softPhoneCandidates = 0;
            let screenObjects = 0;
            let cameraAimedScreenCandidate = false;

            for (const prediction of predictions) {
              const label = prediction.class.toLowerCase().trim().replace(/\s+/g, " ");
              const isPhoneLike =
                PHONE_CLASS_TOKENS.has(label) ||
                label.includes("cell") ||
                label.includes("phone") ||
                label.includes("mobile");

              if (isPhoneLike) {
                if (prediction.bbox) {
                  const [x, y, width, height] = prediction.bbox;
                  const area = Math.max(width, 0) * Math.max(height, 0);
                  const frameArea = targetWidth * targetHeight;
                  const areaRatio = frameArea > 0 ? area / frameArea : 0;
                  const centerX = (x + width / 2) / targetWidth;
                  const centerY = (y + height / 2) / targetHeight;
                  const isLandscapePhone = width > height * PHONE_LANDSCAPE_ASPECT_RATIO;
                  const isPortraitPhone = height > width * PHONE_TALL_ASPECT_RATIO;
                  if (prediction.score >= profileConfig.phoneSoftScoreThreshold && areaRatio >= PHONE_MIN_AREA_RATIO) {
                    phoneCandidates.push({
                      score: prediction.score,
                      areaRatio,
                      centerX,
                      centerY,
                      bbox: [x, y, width, height],
                      isLandscape: isLandscapePhone,
                      isPortrait: isPortraitPhone
                    });
                  }
                }
                if (prediction.score < profileConfig.phoneScoreThreshold && prediction.score >= profileConfig.phoneSoftScoreThreshold && prediction.bbox) {
                  const [x, y, width, height] = prediction.bbox;
                  const area = Math.max(width, 0) * Math.max(height, 0);
                  const frameArea = targetWidth * targetHeight;
                  const areaRatio = frameArea > 0 ? area / frameArea : 0;
                  const centerX = (x + width / 2) / targetWidth;
                  const centerY = (y + height / 2) / targetHeight;
                  const centeredForThreat = centerX >= 0.05 && centerX <= 0.95 && centerY >= 0.05 && centerY <= 0.96;
                  if (areaRatio >= PHONE_MIN_AREA_RATIO && centeredForThreat) {
                    softPhoneCandidates += 1;
                  }
                }
              }

              if (SCREEN_CLASS_TOKENS.has(label) && prediction.score >= 0.2) {
                screenObjects += 1;
              }

              if (label === "person") {
                const [x = 0, y = 0, width = 0, height = 0] = prediction.bbox || [0, 0, 0, 0];
                const area = Math.max(width, 0) * Math.max(height, 0);
                const frameArea = targetWidth * targetHeight;
                const areaRatio = frameArea > 0 ? area / frameArea : 0;
                const centerX = (x + width / 2) / targetWidth;
                const centerY = (y + height / 2) / targetHeight;
                const withinFrame = centerX >= 0.02 && centerX <= 0.98 && centerY >= 0.04 && centerY <= 0.98;
                if (withinFrame && prediction.score >= profileConfig.personSoftScoreThreshold && areaRatio >= PERSON_MIN_AREA_RATIO) {
                  personCandidates.push({
                    score: prediction.score,
                    areaRatio,
                    centerX,
                    bbox: [x, y, width, height]
                  });
                }
              }
            }

            const dedupedPeople = personCandidates
              .sort((a, b) => b.score - a.score)
              .filter(
                (candidate, index, list) =>
                  list
                    .slice(0, index)
                    .every((existing) => computeIou(existing.bbox, candidate.bbox) < BOX_IOU_DEDUP_THRESHOLD)
              );
            const dedupedPhones = phoneCandidates
              .sort((a, b) => b.score - a.score)
              .filter(
                (candidate, index, list) =>
                  list
                    .slice(0, index)
                    .every((existing) => computeIou(existing.bbox, candidate.bbox) < BOX_IOU_DEDUP_THRESHOLD)
              );

            const hardPeople = dedupedPeople.filter(
              (candidate) =>
                candidate.score >= profileConfig.personScoreThreshold && candidate.areaRatio >= PERSON_HARD_AREA_RATIO
            );
            const softPeople = dedupedPeople.filter(
              (candidate) =>
                candidate.score >= profileConfig.personSoftScoreThreshold && candidate.areaRatio >= PERSON_SOFT_AREA_RATIO
            );
            const hardPhones = dedupedPhones.filter((candidate) => {
              const centered = candidate.centerX >= 0.08 && candidate.centerX <= 0.92 && candidate.centerY >= 0.08 && candidate.centerY <= 0.94;
              return candidate.score >= profileConfig.phoneScoreThreshold && candidate.areaRatio >= PHONE_HARD_AREA_RATIO && centered;
            });
            const veryLikelyPhone = hardPhones.some(
              (candidate) => candidate.score >= Math.max(profileConfig.phoneScoreThreshold + 0.15, 0.25) && candidate.areaRatio >= 0.006
            );
            phones = hardPhones.length;
            cameraAimedScreenCandidate = hardPhones.some((candidate) => {
              const centered = candidate.centerX >= 0.2 && candidate.centerX <= 0.8 && candidate.centerY >= 0.15 && candidate.centerY <= 0.9;
              return candidate.isLandscape && candidate.areaRatio >= 0.006 && centered;
            });
            if (!cameraAimedScreenCandidate) {
              // Treat sustained portrait phones as a capture risk as well.
              cameraAimedScreenCandidate = hardPhones.some((candidate) => {
                const centered = candidate.centerX >= 0.2 && candidate.centerX <= 0.8 && candidate.centerY >= 0.2 && candidate.centerY <= 0.92;
                return candidate.isPortrait && candidate.areaRatio >= 0.004 && centered;
              });
            }
            let people = hardPeople.length;
            if (people === 0 && softPeople.length >= 1) {
              people = 1;
            } else if (people === 1 && softPeople.length >= 2) {
              const primary = hardPeople[0] || softPeople[0];
              const hasSeparatedSecondary = softPeople.some(
                (candidate) => Math.abs(candidate.centerX - primary.centerX) >= PERSON_SEPARATION_X
              );
              if (hasSeparatedSecondary) {
                // Soft corroboration catches partially visible shoulder-surfers.
                people = 2;
              }
            } else if (people === 0 && softPeople.length >= 2) {
              // Two softer detections with enough separation implies secondary person.
              const [a, b] = softPeople;
              if (Math.abs(a.centerX - b.centerX) >= PERSON_SEPARATION_X) {
                people = 2;
              }
            }
            const warmedForHighConfidence = detectionFramesRef.current >= MIN_HIGH_CONF_FRAMES;
            const warmedForContextualHeuristics = detectionFramesRef.current >= MIN_CONTEXT_FRAMES;

            const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight).data;
            const tileSums = new Array<number>(9).fill(0);
            const tileCounts = new Array<number>(9).fill(0);
            const sceneVector: number[] = [];
            let totalLuma = 0;
            let totalSamples = 0;
            let brightSamples = 0;
            const stride = 6;

            for (let y = 0; y < targetHeight; y += stride) {
              for (let x = 0; x < targetWidth; x += stride) {
                const idx = (y * targetWidth + x) * 4;
                const r = imageData[idx] || 0;
                const g = imageData[idx + 1] || 0;
                const b = imageData[idx + 2] || 0;
                const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;

                totalLuma += luma;
                totalSamples += 1;
                if (luma >= 230) brightSamples += 1;

                const tileX = Math.min(Math.floor((x / targetWidth) * 3), 2);
                const tileY = Math.min(Math.floor((y / targetHeight) * 3), 2);
                const tileIdx = tileY * 3 + tileX;
                tileSums[tileIdx] += luma;
                tileCounts[tileIdx] += 1;

                // Coarse scene vector for motion/scene-shift detection.
                if (x % 18 === 0 && y % 18 === 0) {
                  sceneVector.push(luma);
                }
              }
            }

            const globalAvg = totalSamples > 0 ? totalLuma / totalSamples : 0;
            const tileAverages = tileSums.map((sum, idx) =>
              tileCounts[idx] > 0 ? sum / tileCounts[idx] : 0
            );
            const maxTileAverage = tileAverages.length ? Math.max(...tileAverages) : 0;
            const brightRatio = totalSamples > 0 ? brightSamples / totalSamples : 0;
            const brightSpotCandidate =
              maxTileAverage > 210 && maxTileAverage - globalAvg > 50 && brightRatio >= 0.055;
            const detectedDisplayCandidate =
              screenObjects >= 3 ||
              (screenObjects >= 1 &&
                ((maxTileAverage - globalAvg > 72 && brightRatio >= 0.085) || brightRatio >= 0.14));
            const reflectionGraceElapsed =
              monitoringStartedAtRef.current > 0 &&
              Date.now() - monitoringStartedAtRef.current >= REFLECTION_GRACE_MS;
            const reflectionCandidate =
              reflectionGraceElapsed && people >= 1 && brightSpotCandidate && detectedDisplayCandidate;

            let sceneChangeCandidate = false;
            const prevVector = prevSceneVectorRef.current;
            if (prevVector && prevVector.length === sceneVector.length && sceneVector.length > 0) {
              let diffSum = 0;
              for (let i = 0; i < sceneVector.length; i += 1) {
                diffSum += Math.abs(sceneVector[i] - prevVector[i]);
              }
              const meanDiff = diffSum / sceneVector.length;
              sceneChangeCandidate = meanDiff >= SCENE_DIFF_THRESHOLD;
            }
            prevSceneVectorRef.current = sceneVector;

            const phoneHardActive = updateDetectorHysteresis(
              warmedForHighConfidence && (phones >= 1 || veryLikelyPhone),
              profileConfig.phoneHardBadFrames,
              profileConfig.phoneHardReleaseFrames,
              phoneHardActiveRef,
              phoneHardFramesRef,
              phoneHardClearFramesRef
            );
            const phoneSoftActive = updateDetectorHysteresis(
              warmedForContextualHeuristics && softPhoneCandidates >= 2,
              profileConfig.phoneSoftBadFrames,
              profileConfig.phoneSoftReleaseFrames,
              phoneSoftActiveRef,
              phoneSoftFramesRef,
              phoneSoftClearFramesRef
            );
            const cameraAimActive = updateDetectorHysteresis(
              warmedForHighConfidence && cameraAimedScreenCandidate && phones >= 1,
              profileConfig.cameraAimBadFrames,
              profileConfig.cameraAimReleaseFrames,
              cameraAimActiveRef,
              cameraAimFramesRef,
              cameraAimClearFramesRef
            );
            const multiFaceActive = updateDetectorHysteresis(
              warmedForHighConfidence && people > 1,
              profileConfig.multiFaceBadFrames,
              profileConfig.multiFaceReleaseFrames,
              multiFaceActiveRef,
              multiFaceFramesRef,
              multiFaceClearFramesRef
            );
            const noFaceActive = updateDetectorHysteresis(
              warmedForContextualHeuristics && people === 0,
              profileConfig.noFaceBadFrames,
              profileConfig.noFaceReleaseFrames,
              noFaceActiveRef,
              noFaceFramesRef,
              noFaceClearFramesRef
            );
            const reflectionActive = updateDetectorHysteresis(
              warmedForContextualHeuristics && reflectionCandidate,
              profileConfig.reflectionBadFrames,
              profileConfig.reflectionReleaseFrames,
              reflectionActiveRef,
              reflectionFramesRef,
              reflectionClearFramesRef
            );
            const rapidSceneActive = updateDetectorHysteresis(
              warmedForContextualHeuristics && people >= 1 && !reflectionCandidate && sceneChangeCandidate,
              profileConfig.rapidSceneBadFrames,
              profileConfig.rapidSceneReleaseFrames,
              rapidSceneActiveRef,
              rapidSceneFramesRef,
              rapidSceneClearFramesRef
            );

            if (phoneHardActive) {
              emitHeuristicEvent("phone_hard", {
                type: "camera_aimed_at_screen",
                reason: "Cell phone detected near confidential content."
              });
              applyThreat("Cell phone detected near confidential content.");
              cycleDelayMs = nextDutyCycleMs(true);
              return;
            }
            if (phoneSoftActive) {
              emitHeuristicEvent("phone_soft", {
                type: "camera_aimed_at_screen",
                reason: "Possible cell phone detected near confidential content."
              });
              applyThreat("Possible cell phone detected near confidential content.");
              cycleDelayMs = nextDutyCycleMs(true);
              return;
            }
            if (cameraAimActive) {
              emitHeuristicEvent("camera_aim", {
                type: "camera_aimed_at_screen",
                reason: "Likely phone camera aimed at protected content (sustained orientation).",
                metadata: { sustainedFrames: cameraAimFramesRef.current }
              });
              applyThreat("Likely phone camera aimed at protected content.");
              cycleDelayMs = nextDutyCycleMs(true);
              return;
            }
            if (multiFaceActive) {
              emitHeuristicEvent("multi_face", {
                type: "multi_face_detected",
                reason: "Secondary person detected near confidential view.",
                metadata: { sustainedFrames: multiFaceFramesRef.current }
              });
              applyThreat("Secondary person detected (shoulder-surfing risk).");
              cycleDelayMs = nextDutyCycleMs(true);
              return;
            }
            if (noFaceActive) {
              emitHeuristicEvent("no_face", {
                type: "face_not_present",
                reason: "Primary user not visible to camera.",
                metadata: { sustainedFrames: noFaceFramesRef.current }
              });
              applyThreat("Primary user not visible to camera.");
              cycleDelayMs = nextDutyCycleMs(true);
              return;
            }
            if (reflectionActive) {
              emitHeuristicEvent("reflection", {
                type: "screen_reflection_risk",
                reason: "Screen reflection or secondary display risk detected.",
                metadata: {
                  sustainedFrames: reflectionFramesRef.current,
                  screenObjects,
                  brightRatio: Number(brightRatio.toFixed(4)),
                  maxTileAverage: Number(maxTileAverage.toFixed(2)),
                  globalAverage: Number(globalAvg.toFixed(2))
                }
              });
              applyThreat("Screen reflection/secondary display risk detected.");
              cycleDelayMs = nextDutyCycleMs(true);
              return;
            }
            if (rapidSceneActive) {
              emitHeuristicEvent("rapid_scene", {
                type: "rapid_scene_change",
                reason: "Rapid scene/posture changes detected during protected view.",
                metadata: { sustainedFrames: rapidSceneFramesRef.current }
              });
              applyThreat("Rapid scene changes detected. Access temporarily locked.");
              cycleDelayMs = nextDutyCycleMs(true);
              return;
            }
            applyThreat(null);
            cycleDelayMs = nextDutyCycleMs(false);
          } catch {
            detectionErrorStreakRef.current += 1;
            if (detectionErrorStreakRef.current >= MONITORING_TAMPER_ERROR_THRESHOLD) {
              emitHeuristicEvent("monitoring_tamper", {
                type: "monitoring_tamper",
                reason: "AI monitoring interruption detected."
              });
              applyThreat("AI monitoring interruption detected.");
              cycleDelayMs = nextDutyCycleMs(true);
            } else {
              applyThreat(null);
              cycleDelayMs = nextDutyCycleMs(false);
            }
          } finally {
            if (mounted) {
              dutyCycleRef.current = window.setTimeout(runDetectionCycle, cycleDelayMs);
            }
          }
        };

        dutyCycleRef.current = window.setTimeout(runDetectionCycle, profileConfig.dutyRiskMinMs);

        if (!mounted) {
          document.removeEventListener("keydown", onTamperKeydown, { capture: true });
        }

        return () => {
          document.removeEventListener("keydown", onTamperKeydown, { capture: true });
        };
      } catch {
        if (!mounted) return;
        setAiBootError(
          "Camera/AI initialization failed. Camera access is required to view protected content."
        );
      }
    };

    let releaseTamperListeners: (() => void) | null = null;
    void initializeAiDutyCycle().then((cleanup) => {
      if (typeof cleanup === "function") {
        releaseTamperListeners = cleanup;
      }
    });

    return () => {
      mounted = false;
      if (releaseTamperListeners) {
        releaseTamperListeners();
        releaseTamperListeners = null;
      }
      if (dutyCycleRef.current !== null) {
        window.clearTimeout(dutyCycleRef.current);
        dutyCycleRef.current = null;
      }
      if (devtoolsIntervalRef.current !== null) {
        window.clearInterval(devtoolsIntervalRef.current);
        devtoolsIntervalRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      detectorRef.current = null;
      videoRef.current = null;
      detectCanvasRef.current = null;
    };
  }, [isMonitoringEnabled, monitoringProfile, profileConfig]);

  const lockReason = useMemo(() => {
    if (forcedLogoutReason) return forcedLogoutReason;
    if (!isMonitoringEnabled) return null;
    if (aiBootError) return aiBootError;
    if (!isAiReady) return "Initializing local AI security checks...";
    if (aiThreatReason) return aiThreatReason;
    if (isPrinting) return "Printing is blocked for protected content.";
    if (isScreenshotSuspected) return "Screenshot shortcut detected. Protected content is temporarily hidden.";
    if (isInactive) return "Window focus lost. Protected content is hidden until focus returns.";
    return null;
  }, [forcedLogoutReason, aiBootError, isAiReady, aiThreatReason, isInactive, isPrinting, isScreenshotSuspected, isMonitoringEnabled]);

  const isLocked = lockReason !== null;

  return (
    <>
      <style>
        {`
          @media print {
            body * {
              visibility: hidden !important;
            }
            .security-curtain-print-overlay {
              visibility: visible !important;
              display: flex !important;
            }
          }
        `}
      </style>

      <div
        style={{
          filter: isLocked ? "blur(20px) grayscale(100%)" : "none",
          transition: "filter 120ms ease",
          minHeight: "100vh",
          pointerEvents: isLocked ? "none" : "auto",
          userSelect: isLocked ? "none" : "auto"
        }}
        aria-hidden={isLocked}
      >
        {children}
      </div>

      {isLocked && (
        <div className="security-curtain-print-overlay fixed inset-0 z-[9999] flex items-center justify-center bg-black/95 p-8 text-center text-white">
          <div className="max-w-xl space-y-4">
            <ShieldAlert className="mx-auto h-14 w-14 text-red-500" />
            <h2 className="text-2xl font-semibold">Protected View Hidden</h2>
            <p className="text-sm text-zinc-300">{lockReason}</p>
          </div>
        </div>
      )}
    </>
  );
};

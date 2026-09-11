export type NotificationSound = "default" | "chime" | "bell" | "ping" | "alert" | "silent";

export const NOTIFICATION_SOUNDS: { value: NotificationSound; label: string; description: string }[] = [
  { value: "default", label: "Default PICD sounds", description: "Keeps the current event-specific sounds." },
  { value: "chime", label: "Soft chime", description: "A gentle two-note chime." },
  { value: "bell", label: "Bell", description: "A clear notification bell." },
  { value: "ping", label: "Single ping", description: "A short, simple ping." },
  { value: "alert", label: "Alert", description: "A stronger three-tone alert." },
  { value: "silent", label: "Silent", description: "Visual notification only; no sound." },
];

const STORAGE_KEY = "picd-notification-sound";

export function loadNotificationSound(): NotificationSound {
  if (typeof window === "undefined") return "default";
  const value = window.localStorage.getItem(STORAGE_KEY) as NotificationSound | null;
  return value && NOTIFICATION_SOUNDS.some(x => x.value === value) ? value : "default";
}

export function saveNotificationSound(value: NotificationSound) {
  if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, value);
}

function createContext() {
  const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  return new AudioCtx();
}

function tone(ctx: AudioContext, frequency: number, start: number, duration: number, type: OscillatorType = "sine", volume = 0.11) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

export function playNotificationSound(kind: "incoming" | "completed" | "delivered" | "failed", selected: NotificationSound = loadNotificationSound()) {
  if (selected === "silent") return;
  try {
    const ctx = createContext();
    if (!ctx) return;
    const now = ctx.currentTime + 0.01;

    if (selected === "default") {
      const notes = kind === "failed" ? [220, 175, 220] : kind === "delivered" ? [784, 1046, 1318] : kind === "completed" ? [660, 880] : [740, 980];
      const spacing = kind === "failed" ? 0.16 : kind === "delivered" ? 0.10 : 0.12;
      notes.forEach((frequency, index) => tone(ctx, frequency, now + index * spacing, 0.1, kind === "failed" ? "square" : "sine"));
    } else if (selected === "chime") {
      tone(ctx, 660, now, 0.28, "sine", 0.09);
      tone(ctx, 880, now + 0.16, 0.38, "sine", 0.08);
    } else if (selected === "bell") {
      tone(ctx, 784, now, 0.55, "sine", 0.1);
      tone(ctx, 1175, now + 0.06, 0.42, "sine", 0.055);
    } else if (selected === "ping") {
      tone(ctx, 880, now, 0.18, "sine", 0.11);
    } else if (selected === "alert") {
      tone(ctx, 520, now, 0.16, "square", 0.09);
      tone(ctx, 660, now + 0.16, 0.16, "square", 0.09);
      tone(ctx, 820, now + 0.32, 0.24, "square", 0.09);
    }
    window.setTimeout(() => void ctx.close(), 1200);
  } catch {
    // Browser audio permissions/autoplay policy can block sound; visual alerts still work.
  }
}

export function playCardMoveSound(selected: NotificationSound = loadNotificationSound()) {
  if (selected === "silent") return;
  try {
    const ctx = createContext();
    if (!ctx) return;
    const now = ctx.currentTime + 0.01;
    if (selected === "default") {
      tone(ctx, 520, now, 0.07, "sine", 0.055);
      tone(ctx, 740, now + 0.065, 0.10, "sine", 0.045);
    } else if (selected === "chime") {
      tone(ctx, 620, now, 0.12, "sine", 0.06);
      tone(ctx, 780, now + 0.08, 0.15, "sine", 0.05);
    } else if (selected === "bell") {
      tone(ctx, 700, now, 0.18, "sine", 0.055);
    } else if (selected === "ping") {
      tone(ctx, 760, now, 0.10, "sine", 0.06);
    } else {
      tone(ctx, 540, now, 0.08, "square", 0.045);
      tone(ctx, 680, now + 0.07, 0.10, "square", 0.04);
    }
    window.setTimeout(() => void ctx.close(), 600);
  } catch {
    // Drag/drop itself is visual feedback; audio is best-effort.
  }
}

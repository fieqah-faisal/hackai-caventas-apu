import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { cx } from "@/lib/format";

type ToastTone = "success" | "info" | "error";

interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  detail?: string;
}

interface ToastApi {
  notify: (t: Omit<Toast, "id">) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

const toneConfig: Record<
  ToastTone,
  { icon: typeof Info; cls: string; role: "status" | "alert" }
> = {
  success: {
    icon: CheckCircle2,
    cls: "text-accent border-accent/40",
    role: "status",
  },
  info: { icon: Info, cls: "text-status-info border-status-info/40", role: "status" },
  error: {
    icon: AlertTriangle,
    cls: "text-status-danger border-status-danger/45",
    role: "alert",
  },
};

function ToastItem({ t, onDismiss }: { t: Toast; onDismiss: (id: number) => void }) {
  const { icon: Icon, cls, role } = toneConfig[t.tone];
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(t.id), 6000);
    return () => clearTimeout(timer);
  }, [t.id, onDismiss]);

  return (
    <div
      role={role}
      className={cx(
        "pointer-events-auto flex w-80 max-w-[calc(100vw-2rem)] items-start gap-3",
        "rounded-md border bg-surface-raised px-3.5 py-3",
        cls,
      )}
    >
      <Icon size={17} className="mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text-primary">{t.title}</p>
        {t.detail && (
          <p className="mt-0.5 text-meta text-text-secondary">{t.detail}</p>
        )}
      </div>
      <button
        onClick={() => onDismiss(t.id)}
        className="shrink-0 rounded p-0.5 text-text-muted hover:text-text-primary"
        aria-label="Dismiss notification"
      >
        <X size={15} aria-hidden />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback((t: Omit<Toast, "id">) => {
    setToasts((prev) => [...prev, { ...t, id: nextId.current++ }]);
  }, []);

  return (
    <ToastContext.Provider value={{ notify }}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed right-4 top-4 z-[60] flex flex-col gap-2"
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} t={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
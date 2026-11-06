import { ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";
import { useEffect, type ButtonHTMLAttributes, type ReactNode } from "react";
import { initials, monthLabel, shiftMonth } from "./format";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
export { cx };

type Variant = "primary" | "secondary" | "outline" | "danger" | "ghost";

// Same look as the rest of Kasuri (shadcn theme colours).
const variants: Record<Variant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm",
  secondary: "bg-card text-foreground border border-input hover:bg-accent shadow-sm",
  outline: "bg-card text-primary border border-primary hover:bg-primary/10",
  danger: "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm",
  ghost: "text-muted-foreground hover:bg-accent",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" }) {
  return (
    <button
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer",
        size === "sm" ? "h-9 px-3 text-sm" : "h-11 px-4 text-base",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cx("rounded-xl border border-border bg-card shadow-sm", className)}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold">{title}</h1>
        {subtitle && <p className="mt-1 text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function MonthPicker({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  return (
    <div className="inline-flex items-center rounded-lg border border-border bg-card shadow-sm">
      <button
        className="cursor-pointer p-2.5 hover:bg-accent"
        onClick={() => onChange(shiftMonth(month, -1))}
        aria-label="Previous month"
      >
        <ChevronLeft size={18} />
      </button>
      <span className="min-w-36 text-center font-medium">{monthLabel(month)}</span>
      <button
        className="cursor-pointer p-2.5 hover:bg-accent"
        onClick={() => onChange(shiftMonth(month, 1))}
        aria-label="Next month"
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-foreground">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      onMouseDown={onClose}
    >
      <div
        className={cx(
          "max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-card shadow-xl sm:rounded-2xl",
          wide ? "sm:max-w-2xl" : "sm:max-w-md",
        )}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-border bg-card px-5 py-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="cursor-pointer rounded-lg p-1 text-muted-foreground hover:bg-accent"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Loading() {
  return (
    <div className="flex justify-center py-16 text-muted-foreground/60">
      <Loader2 className="animate-spin" />
    </div>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-destructive">
      {message}
    </div>
  );
}

export function Empty({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
}) {
  return (
    <Card className="flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-3 text-muted-foreground/60">{icon}</div>
      <p className="font-semibold text-foreground">{title}</p>
      {children && <div className="mt-2 text-muted-foreground">{children}</div>}
    </Card>
  );
}

const avatarColors = [
  "bg-amber-100 text-amber-800",
  "bg-sky-100 text-sky-800",
  "bg-emerald-100 text-emerald-800",
  "bg-rose-100 text-rose-800",
  "bg-violet-100 text-violet-800",
  "bg-lime-100 text-lime-800",
];

export function Avatar({
  name,
  id,
  size = "md",
}: {
  name: string;
  id: number;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold",
        avatarColors[id % avatarColors.length],
        size === "sm"
          ? "h-8 w-8 text-xs"
          : size === "lg"
            ? "h-14 w-14 text-lg"
            : "h-10 w-10 text-sm",
      )}
    >
      {initials(name)}
    </span>
  );
}

export function Stat({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        {label}
        {icon && <span className="text-primary">{icon}</span>}
      </div>
      <div className="mt-2 text-2xl font-bold text-foreground">{value}</div>
      {hint && <div className="mt-1 text-sm text-muted-foreground">{hint}</div>}
    </Card>
  );
}

export function Badge({
  tone = "stone",
  children,
}: {
  tone?: "stone" | "green" | "red" | "amber" | "blue";
  children: ReactNode;
}) {
  const tones = {
    stone: "bg-accent text-foreground",
    green: "bg-emerald-100 text-emerald-800",
    red: "bg-red-100 text-red-800",
    amber: "bg-amber-100 text-amber-800",
    blue: "bg-sky-100 text-sky-800",
  };
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

/** Visual styling for each attendance status, shared by the daily and monthly screens. */
export const statusStyle = {
  P: {
    cell: "bg-emerald-50 text-emerald-700",
    solid: "bg-emerald-600 text-white border-emerald-600",
    short: "P",
  },
  A: {
    cell: "bg-red-100 text-red-700 font-bold",
    solid: "bg-red-600 text-white border-red-600",
    short: "A",
  },
  H: {
    cell: "bg-amber-100 text-amber-800 font-bold",
    solid: "bg-amber-500 text-white border-amber-500",
    short: "½",
  },
  L: {
    cell: "bg-sky-100 text-sky-800 font-bold",
    solid: "bg-sky-600 text-white border-sky-600",
    short: "L",
  },
  O: {
    cell: "bg-muted text-muted-foreground",
    solid: "bg-stone-600 text-white border-stone-600",
    short: "O",
  },
} as const;

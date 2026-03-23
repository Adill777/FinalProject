import { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  label: string;
  icon?: ReactNode;
  tone?: "success" | "warning" | "danger" | "neutral";
  className?: string;
}

const toneClasses: Record<NonNullable<StatusBadgeProps["tone"]>, string> = {
  success: "bg-green-100 text-green-800 border-green-200 hover:bg-green-100 dark:bg-green-900/25 dark:text-green-300 dark:border-green-800/40",
  warning: "bg-orange-100 text-orange-800 border-orange-200 hover:bg-orange-100 dark:bg-orange-900/25 dark:text-orange-300 dark:border-orange-800/40",
  danger: "bg-red-100 text-red-800 border-red-200 hover:bg-red-100 dark:bg-red-900/25 dark:text-red-300 dark:border-red-800/40",
  neutral: "bg-muted text-muted-foreground border-border hover:bg-muted"
};

export const StatusBadge = ({ label, icon, tone = "neutral", className }: StatusBadgeProps) => {
  return (
    <Badge className={cn("flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-semibold tracking-wide", toneClasses[tone], className)}>
      {icon}
      <span>{label}</span>
    </Badge>
  );
};

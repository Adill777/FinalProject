import { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface HeaderBadge {
  label: string;
  variant?: "default" | "secondary" | "outline" | "destructive";
}

interface HeaderAction {
  id: string;
  node: ReactNode;
}

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  badges?: HeaderBadge[];
  actions?: HeaderAction[];
  className?: string;
}

export const PageHeader = ({
  title,
  description,
  icon,
  badges = [],
  actions = [],
  className
}: PageHeaderProps) => {
  return (
    <header className={cn("space-y-3", className)}>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <h2 className="flex items-center gap-3 text-2xl font-semibold text-[#1f2328] dark:text-[#e6edf3] md:text-3xl">
            {icon}
            {title}
          </h2>
          {description ? <p className="text-sm text-[#656d76] dark:text-[#8b949e] md:text-base">{description}</p> : null}
        </div>
        {actions.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 md:justify-end">
            {actions.map((a) => (
              <div key={a.id}>{a.node}</div>
            ))}
          </div>
        ) : null}
      </div>
      {badges.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {badges.map((badge) => (
            <Badge key={badge.label} variant={badge.variant || "outline"}>
              {badge.label}
            </Badge>
          ))}
        </div>
      ) : null}
    </header>
  );
};

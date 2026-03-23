import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StateCardProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
  titleClassName?: string;
}

export const StateCard = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  className,
  titleClassName
}: StateCardProps) => {
  return (
    <Card className={className}>
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        {icon}
        <p className={cn("font-medium", titleClassName)}>{title}</p>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        {actionLabel && onAction ? <Button onClick={onAction}>{actionLabel}</Button> : null}
      </CardContent>
    </Card>
  );
};

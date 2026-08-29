"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import { sectionHeadingWithHelpClass } from "@/lib/utils/ui-classes";
import { InfoPopover } from "@/components/info-popover";
import { SectionHeading } from "../../ui";
import {
  cardDbDetailPanelClass,
  cardDbDetailSectionHeadingClass,
} from "./shared";

export interface CardDbDetailPanelProps {
  readonly title?: string;
  readonly titleHelp?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}

export function CardDbDetailPanel({
  title,
  titleHelp,
  children,
  className,
}: CardDbDetailPanelProps) {
  return (
    <div className={cn(cardDbDetailPanelClass, className)}>
      {title ? (
        <SectionHeading
          className={cardDbDetailSectionHeadingClass}
          title={
            titleHelp ? (
              <span className={sectionHeadingWithHelpClass}>
                {title}
                <InfoPopover hideLabel label={title}>
                  {titleHelp}
                </InfoPopover>
              </span>
            ) : (
              title
            )
          }
        />
      ) : null}
      {children}
    </div>
  );
}

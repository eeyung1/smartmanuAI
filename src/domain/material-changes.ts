import { createHash } from "node:crypto";
import { detailsSchema, type Details } from "../catalogue/schema";

export type MaterialChangeKind =
  | "program_closed"
  | "funding_withdrawn"
  | "deadline_reduced"
  | "deadline_extended";

export type MaterialChange = {
  kind: MaterialChangeKind;
  previousDeadline: string | null;
  deadline: string | null;
  previousFunding: Details["funding"];
  funding: Details["funding"];
};

const fundingLevel: Record<Details["funding"], number> = {
  fully_funded: 4,
  tuition_only: 3,
  free_participation: 3,
  partial: 2,
  unclear: 1,
};

export function detectMaterialChanges(input: {
  previousState: string;
  state: string;
  previousDetails: unknown;
  details: unknown;
}): MaterialChange[] {
  if (input.previousState !== "published") return [];
  const previous = detailsSchema.parse(input.previousDetails);
  const current = detailsSchema.parse(input.details);
  const changes: MaterialChange[] = [];
  const base = {
    previousDeadline: previous.deadline,
    deadline: current.deadline,
    previousFunding: previous.funding,
    funding: current.funding,
  };
  if (input.state === "closed")
    changes.push({ kind: "program_closed", ...base });
  if (fundingLevel[current.funding] < fundingLevel[previous.funding])
    changes.push({ kind: "funding_withdrawn", ...base });
  if (
    previous.deadline &&
    current.deadline &&
    current.deadline < previous.deadline
  )
    changes.push({ kind: "deadline_reduced", ...base });
  if (
    previous.deadline &&
    current.deadline &&
    current.deadline > previous.deadline
  )
    changes.push({ kind: "deadline_extended", ...base });
  return changes;
}

export function materialChangeEventKey(input: {
  userId: string;
  opportunityId: string;
  revision: number;
  kind: MaterialChangeKind;
}) {
  return (
    "material-change:" +
    createHash("sha256")
      .update(
        JSON.stringify([
          input.userId,
          input.opportunityId,
          input.revision,
          input.kind,
        ]),
      )
      .digest("hex")
  );
}

export function renderMaterialChange(input: {
  kind: MaterialChangeKind;
  language: string;
  title: string;
  previousDeadline: string | null;
  deadline: string | null;
}) {
  const zh = input.language === "zh-Hans";
  const labels: Record<MaterialChangeKind, [string, string]> = {
    program_closed: ["Program closed", "项目已关闭"],
    funding_withdrawn: ["Funding reduced or withdrawn", "资助减少或取消"],
    deadline_reduced: ["Deadline moved earlier", "截止日期提前"],
    deadline_extended: ["Deadline extended", "截止日期延长"],
  };
  const [labelEn, labelZh] = labels[input.kind];
  const change = zh ? labelZh : labelEn;
  const dates =
    input.previousDeadline && input.deadline
      ? zh
        ? `（${input.previousDeadline} → ${input.deadline}）`
        : ` (${input.previousDeadline} → ${input.deadline})`
      : "";
  return zh
    ? `${input.title}：${change}${dates}。请查看官方来源以确认最新信息。`
    : `${input.title}: ${change}${dates}. Check the official source for the latest information.`;
}

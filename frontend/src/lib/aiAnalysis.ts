import type { AIAnalysisJob, AIAnalysisResponse, AIAnalysisResult } from "@/types";

export function isAIAnalysisJob(data?: AIAnalysisResult | null): data is AIAnalysisJob {
  return !!data && "status" in data;
}

export function getResolvedAIAnalysis(data?: AIAnalysisResult | null): AIAnalysisResponse | null {
  if (!data) return null;
  if (isAIAnalysisJob(data)) return data.result ?? null;
  return data;
}

export function isActiveAIAnalysisJob(data?: AIAnalysisResult | null): boolean {
  return isAIAnalysisJob(data) && ["pending", "queued", "running"].includes(data.status);
}

import { applyDeskAction } from "./desk";
import type { DeskRecord, PendingAction } from "./types";

const pendingByUser = new Map<string, PendingAction>();

export function stageAction(userId: string, action: Omit<PendingAction, "id">): PendingAction {
  const id = `ACT-${Date.now().toString(36).toUpperCase()}`;
  const staged = { ...action, id };
  pendingByUser.set(userId, staged);
  return staged;
}

export function getPendingAction(userId: string): PendingAction | null {
  return pendingByUser.get(userId) ?? null;
}

export function rejectAction(userId: string): PendingAction | null {
  const action = pendingByUser.get(userId) ?? null;
  pendingByUser.delete(userId);
  return action;
}

export function confirmAction(userId: string, actionOrId?: PendingAction | string): DeskRecord | { error: string } {
  const queued = pendingByUser.get(userId);
  const action =
    typeof actionOrId === "string"
      ? queued && queued.id === actionOrId
        ? queued
        : null
      : actionOrId ?? queued;
  if (!action) return { error: "Nothing is waiting for confirmation." };
  if (queued && queued.id !== action.id) {
    return { error: "This draft is stale. Ask the agent to prepare the action again." };
  }
  pendingByUser.delete(userId);
  return applyDeskAction(action);
}

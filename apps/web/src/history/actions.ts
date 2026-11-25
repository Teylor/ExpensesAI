import {
  type CommandActor,
  type CommandEnvelope,
  formatCommandActionSummary,
  type UserPreferences,
} from "@agenticf/domain";
import type { CommandHistoryItemDto } from "../api/client.js";
import type { OutboxEntry } from "../offline/db.js";

export type HistoryItemStatus = "pending" | "synced" | "failed" | "undone";
export type HistoryItemSource = "local" | "server";
export type HistoryFilter = "all" | "active" | "undone";

/** One row of the unified actions history (local outbox + server history). */
export interface HistoryActionItem {
  commandId: string;
  source: HistoryItemSource;
  status: HistoryItemStatus;
  actor: CommandActor;
  /** The command type (for iconography); e.g. `"transaction.record"`. */
  commandType: CommandEnvelope["type"];
  /** When the action was created (local: enqueuedAt, server: createdAt). */
  timestamp: string;
  undoneAt: string | null;
  /** Localized one-line summary for the command (T1 `formatCommandActionSummary`). */
  summary: string;
  canUndo: boolean;
  /** True when undoing this item requires a successful round-trip to the server. */
  requiresOnlineToUndo: boolean;
}

export interface HistoryProjectionInput {
  localEntries: readonly OutboxEntry[];
  serverItems: readonly CommandHistoryItemDto[];
  preferences: UserPreferences;
  filter: HistoryFilter;
}

export interface HistoryProjection {
  items: HistoryActionItem[];
  /** Always computed over the full deduplicated set, regardless of `filter`. */
  counts: { all: number; active: number; undone: number };
}

function undoFlagsFor(status: HistoryItemStatus): {
  canUndo: boolean;
  requiresOnlineToUndo: boolean;
} {
  switch (status) {
    case "pending":
      // Undoable offline: the optimistic snapshot is reverted locally.
      return { canUndo: true, requiresOnlineToUndo: false };
    case "synced":
      // Already applied on the server: undo needs the remote undo endpoint.
      return { canUndo: true, requiresOnlineToUndo: true };
    case "failed":
    case "undone":
      return { canUndo: false, requiresOnlineToUndo: false };
  }
}

function projectLocalEntry(
  entry: OutboxEntry,
  preferences: UserPreferences,
): HistoryActionItem {
  const status: HistoryItemStatus =
    entry.status === "syncing" ? "pending" : entry.status;
  return {
    commandId: entry.commandId,
    source: "local",
    status,
    actor: entry.envelope.actor,
    commandType: entry.envelope.type,
    timestamp: entry.enqueuedAt,
    undoneAt: entry.status === "undone" ? (entry.undoneAt ?? null) : null,
    summary:
      entry.summary ?? formatCommandActionSummary(entry.envelope, preferences),
    ...undoFlagsFor(status),
  };
}

function projectServerItem(
  item: CommandHistoryItemDto,
  preferences: UserPreferences,
): HistoryActionItem {
  const envelope = {
    commandId: item.commandId,
    actor: item.actor,
    issuedAtUtc: item.createdAt,
    type: item.commandType,
    payload: item.payload,
  } as CommandEnvelope;
  const status: HistoryItemStatus = item.undoneAt ? "undone" : "synced";
  return {
    commandId: item.commandId,
    source: "server",
    status,
    actor: item.actor,
    commandType: item.commandType as CommandEnvelope["type"],
    timestamp: item.createdAt,
    undoneAt: item.undoneAt,
    summary: formatCommandActionSummary(envelope, preferences),
    ...undoFlagsFor(status),
  };
}

/**
 * Pure projection that unifies the local outbox rows with the server command
 * history into a single newest-first list.
 *
 * - Deduplicates by `commandId`; the local entry always wins (it is the most
 *   up-to-date lifecycle state for commands this device created).
 * - `counts` always reflects the full deduplicated set, not the filtered view.
 */
export function projectHistory(
  input: HistoryProjectionInput,
): HistoryProjection {
  const merged = new Map<string, HistoryActionItem>();

  for (const item of input.serverItems) {
    merged.set(item.commandId, projectServerItem(item, input.preferences));
  }
  for (const entry of input.localEntries) {
    merged.set(entry.commandId, projectLocalEntry(entry, input.preferences));
  }

  const all = [...merged.values()].sort((a, b) => {
    if (a.timestamp !== b.timestamp) {
      return a.timestamp < b.timestamp ? 1 : -1;
    }
    return a.commandId < b.commandId ? -1 : 1;
  });

  const items = all.filter((item) => {
    if (input.filter === "all") return true;
    if (input.filter === "undone") return item.status === "undone";
    return item.status !== "undone";
  });

  return {
    items,
    counts: {
      all: all.length,
      active: all.filter((item) => item.status !== "undone").length,
      undone: all.filter((item) => item.status === "undone").length,
    },
  };
}

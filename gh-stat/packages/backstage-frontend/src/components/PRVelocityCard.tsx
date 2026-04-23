import React from "react";
import type { PRVelocityStats } from "@kfang/ghstat-stats";

function formatMs(ms: number | null): string {
  if (ms === null) return "—";
  const hours = ms / (1000 * 60 * 60);
  if (hours < 24) return `${hours.toFixed(1)}h`;
  const days = hours / 24;
  if (days < 7) return `${days.toFixed(1)}d`;
  return `${(days / 7).toFixed(1)}w`;
}

export function PRVelocityCard({ velocity }: { velocity: PRVelocityStats }): React.ReactElement {
  return (
    <div style={{ border: "1px solid #d0d7de", borderRadius: 6, padding: 16 }}>
      <h2 style={{ marginBottom: 12, fontSize: 16 }}>PR Velocity</h2>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <tbody>
          <Row label="Total PRs" value={velocity.totalPRs} />
          <Row label="Merged" value={velocity.mergedPRs} />
          <Row label="Merge rate" value={`${(velocity.mergeRate * 100).toFixed(1)}%`} />
          <Row label="Avg time to merge" value={velocity.avgTimeToMergeLabel ?? "—"} />
          <Row label="p50 cycle time" value={formatMs(velocity.p50CycleTimeMs)} />
          <Row label="p90 cycle time" value={formatMs(velocity.p90CycleTimeMs)} />
          <Row
            label="Weekly throughput"
            value={
              velocity.weeklyThroughput !== null
                ? `${velocity.weeklyThroughput.toFixed(1)} PRs/wk`
                : "—"
            }
          />
        </tbody>
      </table>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number }): React.ReactElement {
  return (
    <tr>
      <td style={{ padding: "6px 12px", color: "#656d76", borderBottom: "1px solid #eaeef2" }}>{label}</td>
      <td style={{ padding: "6px 12px", fontWeight: 600, borderBottom: "1px solid #eaeef2" }}>{value}</td>
    </tr>
  );
}

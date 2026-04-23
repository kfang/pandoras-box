import React from "react";
import type { ContributorStat } from "@kfang/ghstat-stats";

export function ContributorTable({
  contributors,
}: {
  contributors: ContributorStat[];
}): React.ReactElement {
  return (
    <div style={{ border: "1px solid #d0d7de", borderRadius: 6, overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid #d0d7de", fontWeight: 600, fontSize: 16 }}>
        Contributors
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr style={{ background: "#f6f8fa" }}>
            <Th>User</Th>
            <Th>Merged PRs</Th>
            <Th>Open PRs</Th>
            <Th>Merge rate</Th>
            <Th>Additions</Th>
            <Th>Deletions</Th>
          </tr>
        </thead>
        <tbody>
          {contributors.map((c) => (
            <tr key={c.login}>
              <td style={tdStyle}>{c.login}</td>
              <td style={tdStyle}>{c.mergedPRs}</td>
              <td style={tdStyle}>{c.openPRs}</td>
              <td style={tdStyle}>{(c.mergeRate * 100).toFixed(0)}%</td>
              <td style={{ ...tdStyle, color: "#1a7f37" }}>+{c.totalAdditions.toLocaleString()}</td>
              <td style={{ ...tdStyle, color: "#cf222e" }}>-{c.totalDeletions.toLocaleString()}</td>
            </tr>
          ))}
          {contributors.length === 0 && (
            <tr>
              <td colSpan={6} style={{ ...tdStyle, textAlign: "center", color: "#656d76" }}>
                No data
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <th style={{ textAlign: "left", padding: "8px 12px", borderBottom: "1px solid #d0d7de", fontWeight: 600 }}>
      {children}
    </th>
  );
}

const tdStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderBottom: "1px solid #eaeef2",
};

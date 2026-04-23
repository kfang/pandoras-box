import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Progress, ErrorPanel } from "@backstage/core-components";
import { useGhStatApi } from "../api.js";
import type { GhRepo } from "@kfang/ghstat-github-data";
import type { OrgRollupStats } from "@kfang/ghstat-stats";

export function OrgDashboard(): React.ReactElement {
  const api = useGhStatApi();
  const [repos, setRepos] = useState<GhRepo[]>([]);
  const [orgStats, setOrgStats] = useState<OrgRollupStats | null>(null);
  const [orgFilter, setOrgFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const loadData = async (): Promise<void> => {
      try {
        const repoList = await api.getRepos(orgFilter ? { org: orgFilter } : undefined);
        if (cancelled) return;
        setRepos(repoList);

        if (orgFilter) {
          const stats = await api.getOrgStats(orgFilter);
          if (!cancelled) setOrgStats(stats);
        } else {
          setOrgStats(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadData();
    return () => { cancelled = true; };
  }, [api, orgFilter]);

  if (loading) return <Progress />;
  if (error) return <ErrorPanel error={error} />;

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ marginBottom: 16 }}>Repository Dashboard</h1>

      <div style={{ marginBottom: 16, display: "flex", gap: 12, alignItems: "center" }}>
        <label>Org filter:</label>
        <input
          type="text"
          value={orgFilter}
          onChange={(e) => setOrgFilter(e.target.value)}
          placeholder="e.g. my-org"
          style={{ border: "1px solid #ccc", borderRadius: 4, padding: "6px 10px" }}
        />
      </div>

      {orgStats && (
        <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
          <StatCard label="Total repos" value={orgStats.totalRepos} />
          <StatCard label="Merged PRs" value={orgStats.totalMergedPRs} />
          <StatCard label="Contributors" value={orgStats.uniqueContributors} />
          <StatCard label="Open issues" value={orgStats.totalOpenIssues} />
        </div>
      )}

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr style={{ background: "#f6f8fa" }}>
            <Th>Repository</Th>
            <Th>Language</Th>
            <Th>Stars</Th>
            <Th>Open issues</Th>
            <Th>Last push</Th>
          </tr>
        </thead>
        <tbody>
          {repos.map((repo) => (
            <tr key={repo.full_name}>
              <td style={tdStyle}>
                <Link to={`/repo/${repo.owner}/${repo.name}`}>{repo.full_name}</Link>
              </td>
              <td style={tdStyle}>{repo.language ?? "—"}</td>
              <td style={tdStyle}>{repo.stargazers_count.toLocaleString()}</td>
              <td style={tdStyle}>{repo.open_issues_count.toLocaleString()}</td>
              <td style={tdStyle}>{new Date(repo.pushed_at).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }): React.ReactElement {
  return (
    <div style={{ border: "1px solid #d0d7de", borderRadius: 6, padding: "12px 20px", textAlign: "center", minWidth: 120 }}>
      <div style={{ fontSize: 28, fontWeight: 700 }}>{value.toLocaleString()}</div>
      <div style={{ fontSize: 13, color: "#656d76", marginTop: 4 }}>{label}</div>
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

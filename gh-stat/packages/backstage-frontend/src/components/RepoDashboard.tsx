import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Progress, ErrorPanel } from "@backstage/core-components";
import { useGhStatApi } from "../api.js";
import type { RepoStats } from "../api.js";
import { PRVelocityCard } from "./PRVelocityCard.js";
import { ContributorTable } from "./ContributorTable.js";

export function RepoDashboard(): React.ReactElement {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const api = useGhStatApi();
  const [stats, setStats] = useState<RepoStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!owner || !repo) return;
    let cancelled = false;
    setLoading(true);

    api.getRepoStats(owner, repo).then((s) => {
      if (!cancelled) { setStats(s); setLoading(false); }
    }).catch((err: unknown) => {
      if (!cancelled) {
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [api, owner, repo]);

  if (loading) return <Progress />;
  if (error) return <ErrorPanel error={error} />;
  if (!stats) return <div>No data</div>;

  const { health } = stats;

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ marginBottom: 8 }}>{stats.repo}</h1>
      <div style={{ color: "#656d76", marginBottom: 20, fontSize: 14 }}>
        {health.language ?? "Unknown language"} •{" "}
        {health.stars.toLocaleString()} stars •{" "}
        {health.daysSinceLastPush}d since last push
        {health.isStale && <span style={{ color: "#9a6700", marginLeft: 8 }}>(stale)</span>}
        {health.archived && <span style={{ color: "#656d76", marginLeft: 8 }}>(archived)</span>}
      </div>

      <div style={{ display: "flex", gap: 16, marginBottom: 20 }}>
        <StatCard label="Bus factor" value={health.busFactor} />
        <StatCard label="Open PRs" value={health.openPRBacklog} />
        <StatCard label="Open issues" value={health.openIssues} />
        <StatCard label="Contributors" value={stats.contributors.uniqueContributors} />
      </div>

      <PRVelocityCard velocity={stats.velocity} />
      <div style={{ marginTop: 16 }}>
        <ContributorTable contributors={stats.contributors.contributors} />
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }): React.ReactElement {
  return (
    <div style={{ border: "1px solid #d0d7de", borderRadius: 6, padding: "12px 20px", textAlign: "center", minWidth: 100 }}>
      <div style={{ fontSize: 28, fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: 13, color: "#656d76", marginTop: 4 }}>{label}</div>
    </div>
  );
}

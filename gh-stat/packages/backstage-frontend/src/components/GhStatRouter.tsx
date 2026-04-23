import React from "react";
import { Routes, Route } from "react-router-dom";
import { OrgDashboard } from "./OrgDashboard.js";
import { RepoDashboard } from "./RepoDashboard.js";

export function GhStatRouter(): React.ReactElement {
  return (
    <Routes>
      <Route path="/" element={<OrgDashboard />} />
      <Route path="/repo/:owner/:repo" element={<RepoDashboard />} />
    </Routes>
  );
}

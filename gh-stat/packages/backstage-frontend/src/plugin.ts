import { createPlugin, createRoutableExtension, createRouteRef } from "@backstage/core-plugin-api";

export const rootRouteRef = createRouteRef({ id: "gh-stat" });
export const repoRouteRef = createRouteRef({ id: "gh-stat-repo", params: ["owner", "repo"] });

export const ghStatPlugin = createPlugin({
  id: "gh-stat",
  routes: {
    root: rootRouteRef,
    repo: repoRouteRef,
  },
});

export const GhStatPage = ghStatPlugin.provide(
  createRoutableExtension({
    name: "GhStatPage",
    component: () =>
      import("./components/GhStatRouter.js").then((m) => m.GhStatRouter),
    mountPoint: rootRouteRef,
  }),
);

import type { GitHubClient } from "./client.js";
import type { GhTeamMember } from "./types.js";

/**
 * Fetches all members of a GitHub team. Requires `read:org` scope on the token.
 */
export async function* fetchTeamMembers(
  client: GitHubClient,
  org: string,
  teamSlug: string,
): AsyncGenerator<GhTeamMember> {
  const iter = client.paginate.iterator(client.teams.listMembersInOrg, {
    org,
    team_slug: teamSlug,
    per_page: 100,
  });
  for await (const { data } of iter) {
    for (const member of data) {
      yield {
        org,
        team_slug: teamSlug,
        user_login: member.login,
      };
    }
  }
}

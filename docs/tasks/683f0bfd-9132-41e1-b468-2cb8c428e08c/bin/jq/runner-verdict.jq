# runner-verdict.jq — S5 convergence verdict for one runner.
# Input:  { "runner": <runner object from GET /runners>, "fixInBuild": <true|false|null> }
#   fixInBuild is computed by the shell with `git merge-base --is-ancestor
#   <fixCommit> <buildSha>` (null when no build sha is reported or the sha is
#   unknown to the local repo) — a version string alone proves nothing.
# Converged = runnerVersion >= 0.2.x AND the running build contains the fix.
def semverAtLeast($v; $min): ($v | split(".") | map(tonumber? // 0)) >= ($min | split(".") | map(tonumber? // 0));

. as $in | $in.runner as $r |
(semverAtLeast($r.runnerVersion // "0"; "0.2.0")) as $versionOk |
{
  runnerId: $r.runnerId,
  status: $r.status,
  runnerVersion: $r.runnerVersion,
  buildSha: ($r.facts.versions.build.sha // null),
  recommendedVersion: $r.recommendedVersion,
  updateAvailable: $r.updateAvailable,
  versionOk: $versionOk,
  fixInBuild: $in.fixInBuild,
  converged: ($versionOk and ($in.fixInBuild == true)),
  reasons: (
    (if $versionOk then [] else ["runnerVersion \($r.runnerVersion // "?") is below 0.2.0"] end)
    + (if $in.fixInBuild == true then []
       elif $in.fixInBuild == false then ["running build \($r.facts.versions.build.sha // "?") does not contain the deterministic-git-failure fix commit"]
       else ["no build sha reported (or unknown locally) — cannot verify the fix is in the running build"] end)
  )
}

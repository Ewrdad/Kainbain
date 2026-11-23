# runners-tsv.jq — flatten GET /runners into a TSV (header row first).
# Includes the runner-reported build sha/builtAt, because the version string
# alone cannot prove the running build contains a given fix commit.
# Fails loud on non-array input instead of emitting a mangled table.
if type != "array" then error("runners-tsv.jq: expected an array of runner objects, got \(type)") else
  (
    ["runnerId", "status", "runnerVersion", "buildSha", "buildBuiltAt", "recommended", "minimum", "desired", "availableVersions", "updateAvailable", "belowMinimum", "updateStatus", "pendingCommands", "lastSeenAt"],
    (.[] | [
      .runnerId,
      .status,
      .runnerVersion,
      (.facts.versions.build.sha // ""),
      (.facts.versions.build.builtAt // ""),
      .recommendedVersion,
      .minimumVersion,
      .desiredVersion,
      ([.availableVersions[]] | join(",")),
      (.updateAvailable | tostring),
      (.belowMinimum | tostring),
      (if .updateStatus == null then "" else (.updateStatus | tostring) end),
      ([.pendingCommands[]?] | map(.command // .) | join(",")),
      (.lastSeenAt // "")
    ])
  ) | @tsv
end

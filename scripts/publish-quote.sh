#!/usr/bin/env bash
set -euo pipefail
# GitHub often starts scheduled runs hours late. Accept starts from 18:00 to 22:59 ET; the
# adapter needs the same market date, so the cutoff leaves an hour before midnight.
et_hour=$((10#$(TZ=America/New_York date +%H)))
if [[ "${RUN_KIND:-}" == schedule ]] && (( et_hour < 18 || et_hour >= 23 )); then
  echo "Scheduled start at ${et_hour}:00 ET is outside 18:00-22:59 ET; skipping."
  exit 0
fi
# Under EDT both cron entries pass the guard; leave an unmerged candidate to its own checks.
if [[ "${RUN_KIND:-}" == schedule ]] && [[ -n "$(gh pr list --state open --json headRefName --jq '.[] | select(.headRefName | startswith("data/regular-close-")) | .headRefName')" ]]; then
  echo 'A regular-close candidate PR is already open; skipping.'
  exit 0
fi
base_commit=$(git rev-parse HEAD)
npm run verify
npm test
node scripts/quote-update.mjs
if git diff --quiet -- data/; then exit 0; fi
npm run verify
npm run monitor -- verify --base "$base_commit"
npm test
git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
candidate_branch="data/regular-close-$(date -u +%Y%m%dT%H%M%S)"
git switch -c "$candidate_branch"
git add data/ledger.json data/evidence.json data/monitor.json data/history/ data/releases/
git commit -m 'Update the evidenced MU regular close'
candidate_commit=$(git rev-parse HEAD)
git fetch origin main
[[ "$(git rev-parse origin/main)" == "$base_commit" ]] || { echo 'Main changed; rebuild from latest main.'; exit 1; }
git push origin "$candidate_branch"
cat > .monitor/quote-pr.md <<'EOF'
Update the latest completed MU regular-session close through the structured quote adapter and the evidence pipeline.

Financial reports, industry observations and their check dates are preserved. If the quote source could not be verified, the release records the failed attempt and retains the previous price.

The candidate must pass the data and mobile UI contracts before merging. Publication is followed by a full live data hash check.
EOF
pull_url=$(gh pr create --head "$candidate_branch" --base main --title 'Update MU regular close' --body-file .monitor/quote-pr.md)
# GITHUB_TOKEN-created events do not recursively start checks; dispatch explicitly.
gh workflow run monitor.yml --ref "$candidate_branch" -f base_sha="$base_commit"
check_run=''
for attempt in $(seq 1 20); do
  check_run=$(gh run list --workflow monitor.yml --branch "$candidate_branch" --event workflow_dispatch --json databaseId,headSha --jq ".[] | select(.headSha == \"$candidate_commit\") | .databaseId" | head -1)
  if [[ -n "$check_run" ]]; then break; fi
  sleep 5
done
[[ -n "$check_run" ]] || { echo 'Candidate checks did not start; PR remains unmerged.'; exit 1; }
# The dispatched run is the gate. `gh pr checks` can report no checks for a
# workflow_dispatch run and exit non-zero even after it passed.
gh run watch "$check_run" --exit-status
git fetch origin main
[[ "$(git rev-parse origin/main)" == "$base_commit" ]] || { echo 'Main moved during CI; rebuild required.'; exit 1; }
gh pr merge "$pull_url" --squash --match-head-commit "$candidate_commit"
gh workflow run monitor.yml --ref main -f base_sha="$base_commit"

#!/bin/bash
# Kimi WebBridge TODO Auto-Update Script
# Updates TODO.md every 10 minutes with current timestamp
# Commits and pushes to GitHub for agent handoff visibility

set -e

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$REPO_DIR"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

update_todo() {
    local TIMESTAMP
    TIMESTAMP=$(date -u +"%Y-%m-%d %H:%M UTC")
    
    # Update the Last Updated line in TODO.md
    sed -i "s/^\*\*Last Updated:\*\* .*/\*\*Last Updated:\*\* $TIMESTAMP/" TODO.md
    
    # Update the Next Checkpoint line (add 10 minutes)
    local NEXT_CHECKPOINT
    NEXT_CHECKPOINT=$(date -u -d "+10 minutes" +"%Y-%m-%d %H:%M UTC")
    sed -i "s/^\*\*Next Checkpoint:\*\* .*/\*\*Next Checkpoint:\*\* $NEXT_CHECKPOINT/" TODO.md
    
    # Check if there are changes
    if git diff --quiet TODO.md 2>/dev/null; then
        echo "$(date -u +"%H:%M:%S") No changes to TODO.md"
        return
    fi
    
    # Commit and push
    git add TODO.md
    git commit -m "chore(todo): auto-update checkpoint at $TIMESTAMP

- Updated Last Updated timestamp
- Updated Next Checkpoint
- Agent handoff visibility maintained" || true
    
    git push origin HEAD 2>/dev/null || echo "$(date -u +"%H:%M:%S") Push failed, will retry next cycle"
    
    echo -e "${GREEN}$(date -u +"%H:%M:%S") TODO.md updated and pushed: $TIMESTAMP${NC}"
}

echo -e "${YELLOW}Starting Kimi WebBridge TODO auto-updater...${NC}"
echo "Repository: $REPO_DIR"
echo "Update interval: 10 minutes"
echo "Press Ctrl+C to stop"
echo ""

# Initial update
update_todo

# Loop every 10 minutes
while true; do
    sleep 600
    update_todo
    echo "Next update in 10 minutes..."
    echo ""
done

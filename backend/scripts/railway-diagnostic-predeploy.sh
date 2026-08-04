#!/usr/bin/env bash
set -euo pipefail

# Temporary diagnostic release only. The production database is currently
# unreachable from the running application, so this deployment must not attempt
# migrations or any database write. The normal railway-predeploy.sh remains in
# the repository and must be restored after the connectivity cause is repaired.
echo "Diagnostic release: database migrations are intentionally deferred; no database reads or writes will run during pre-deploy."

test -s dist/server.js
node -e "const fs=require('fs'); const p='dist/server.js'; if(!fs.existsSync(p)||fs.statSync(p).size===0) process.exit(1); console.log('Verified diagnostic server artifact:',p)"

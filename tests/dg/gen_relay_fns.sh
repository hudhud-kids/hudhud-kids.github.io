#!/usr/bin/env bash
# extracts the pure relay functions (no Deno/supabase) so bun or node can test them
D="$(cd "$(dirname "$0")" && pwd)"; R="$D/../../supabase/functions/ai/index.ts"
{ echo 'const LLM_MODEL = "claude-sonnet-5-5";'; sed -n '/^const AR = /,/^\/\/ ---------- self test/p' "$R" | sed '$d'; sed -n '/^\/\* Voice mode: the voice never reads/,/^\/\* a short-lived token/p' "$R" | sed '$d'; } > "$D/relay_fns.ts"

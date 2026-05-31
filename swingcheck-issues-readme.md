# SwingCheck — GitHub Issues Export

Genererat: 2026-05-31
Antal issues: 8

## Import-instruktion

### Alternativ 1: GitHub CLI (snabbast)
```bash
npm install -g @anthropic-ai/claude-code  # om ej installerat
gh auth login

# Importera alla issues
cat swingcheck-issues.json | node -e "
const issues = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
const { execSync } = require('child_process');
issues.forEach(issue => {
  const labels = issue.labels.join(',');
  const cmd = \`gh issue create --repo DITT_REPO --title \"\${issue.title}\" --body \"\${issue.body.replace(/\"/g, '\\\\"')}\" --label \"\${labels}\"\`;
  execSync(cmd);
  console.log('Created:', issue.title);
});
"
```

### Alternativ 2: GitHub API
```bash
REPO="din-användare/swingcheck"
TOKEN="din-github-token"

cat swingcheck-issues.json | python3 -c "
import json, sys, urllib.request

issues = json.load(sys.stdin)
for issue in issues:
    data = json.dumps({'title': issue['title'], 'body': issue['body'], 'labels': issue['labels']}).encode()
    req = urllib.request.Request(
        f'https://api.github.com/repos/$REPO/issues',
        data=data,
        headers={'Authorization': 'token $TOKEN', 'Content-Type': 'application/json'}
    )
    urllib.request.urlopen(req)
    print('Created:', issue['title'])
"
```

### Alternativ 3: Manuellt i Claude Code
Öppna Claude Code och skriv:
> "Skapa GitHub Issues från swingcheck-issues.json i det här repot"

---

## Issues-översikt

| # | Titel | Labels | Prioritet |
|---|-------|--------|-----------|
| 1 | P0-3: Session-läge — multi-sving utan att öppna appen | p0, ux, agent-ready | P0 |
| 2 | P0-4: TTS-röst konfiguration — välj bästa tillgängliga svenska röst | p0, audio, agent-ready | P0 |
| 3 | P0-5: Träningsstatistik per regel — trend över tid | p0, analytics, agent-ready | P0 |
| 4 | TD-1: Migrera historik från IndexedDB till Supabase | tech-debt, backend, agent-ready | TD |
| 5 | TD-3: Generera professionella app-ikoner med korrekt emoji-rendering | tech-debt, design, agent-ready | TD |
| 6 | TD-2: API-kostnadskontroll — implementera prompt caching | tech-debt, performance, agent-ready | TD |
| 7 | P0-4b: PWA update notification — visa 'Ny version tillgänglig' | p0, pwa, agent-ready | P0 |
| 8 | P2-1: Dela sving som klipp — exportera video med feedback-overlay | p2, social, agent-ready | P2 |

---

## Hur Claude Code använder dessa

Starta Claude Code och skriv:
> "Gå igenom alla öppna GitHub Issues med label 'agent-ready', implementera dem ett i taget, skapa en PR per issue"

Claude Code kommer att:
1. Hämta issues via `gh issue list --label agent-ready`
2. Läsa varje issue
3. Implementera enligt spec
4. Skapa en PR med referens till issue-numret

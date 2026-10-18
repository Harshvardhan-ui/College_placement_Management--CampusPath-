# CampusPath — College Placement Portal

A self-contained Version 1 placement-management app for students, companies, and college placement teams. It runs locally with Python's standard library and SQLite; no package installation or build step is needed.

## Start the app

1. Install Python 3.10 or later if it isn't already installed.
2. Run `python server.py` from this folder, or launch `run.ps1` on Windows / `./run.sh` on macOS or Linux.
3. For the SQLite-backed app, open [http://localhost:8000](http://localhost:8000). The [static preview](http://127.0.0.1:5500/static/index.html#top) uses browser-only demo storage.

The first run creates `data/placement.sqlite3`, adds a small demo dataset, and creates the `uploads/` folder. Stop the server with Ctrl+C. The database and resume files stay on your machine.

You can also serve the `static/` folder with a static preview tool. If that preview has no `/api/` backend, the app automatically switches to browser demo mode for sign-in and dashboard workflows; demo changes are stored in browser storage. Use the Python server when you need the SQLite database and actual resume-file uploads.

## Demo accounts

| Portal | Email | Password |
|---|---|---|
| Student | `aarav@northstar.edu` | `Student123!` |
| Company | `hr@nimbus.io` | `Company123!` |
| Placement team | `admin@smartplacement.edu` | `Admin123!` |

The sign-in dialog also has one-click demo sign-in buttons.

## Version 1 workflows

- **Students:** register and sign in, edit academic and contact details, upload a PDF/DOC/DOCX resume, browse approved drives, check branch/CGPA eligibility, apply once, and track application status.
- **Students:** register and sign in, edit academic and contact details, upload a PDF/DOC/DOCX resume, receive an ATS-readiness estimate with improvement tips, browse approved drives, apply, track status, and email recruiters for drives they applied to.
- **Companies:** register with company and HR details, edit the saved company profile, submit job drives for placement-team review, see and contact applicants, open their resumes, search by student/branch/skill/drive, and update application status through shortlisting and selection.
- **Placement team:** view placement metrics and branch summaries, manage student and company account access, open student resumes, review a highlighted approval queue, approve or decline drives, monitor applications, and review or reply to contact requests.
- **Live messages:** all three roles can exchange in-app messages. Students and companies can message each other after an application connects them; either can message the placement team, and staff can message active students or companies. The inbox refreshes every few seconds while it is open.
- **Contact & resume tools:** student/company messages are stored in the placement-team inbox. With SMTP configured, each message is also emailed to `harshvardhansinghparihar32@gmail.com`. Students also get three copyable resume/referral starters. ATS scoring is a basic text and structure estimate, not a hiring decision.
- **Visual design:** subtle looping motion, animated graphics, and hover effects run throughout the portal. The page refresh control is in the top bar. Motion is reduced for visitors whose device requests reduced motion.

### Email delivery setup

The server saves every placement-team contact request in SQLite even if SMTP is not configured. To also deliver email, set these environment variables in the same terminal before starting the server. The default destination is the placement-team address above; `PLACEMENT_TEAM_EMAIL` can override it.

```powershell
$env:SMTP_HOST = 'smtp.your-provider.example'
$env:SMTP_PORT = '465'
$env:SMTP_USER = 'your-smtp-login'
$env:SMTP_PASSWORD = 'your-smtp-password'
$env:SMTP_FROM = 'campuspath@your-domain.example'
$env:PLACEMENT_TEAM_EMAIL = 'harshvardhansinghparihar32@gmail.com'
python server.py
```

Port `465` uses implicit TLS. Other ports use STARTTLS. Keep SMTP credentials private and use the sender address permitted by your provider. The sender’s email is included as the message Reply-To address.

## Data model

The SQLite database implements `users`, `students`, `companies`, `jobs`, and `applications`, plus `sessions` for sign-in. Resume files live under `uploads/`; student records save their file names. Passwords are stored as salted PBKDF2 hashes. New company drives start in `pending` status and become visible to students after admin approval.

## Project layout

- `server.py` — local HTTP API, role access, session handling, resume upload, schema, and demo seed data.
- `static/` — landing page, role dashboards, styling, and client-side interactions.
- `data/` — created automatically for the SQLite database.
- `uploads/` — created automatically for student resumes.

The static browser preview stores demo changes only in that browser. Use the Python server URL for shared SQLite drives, accounts, resume files, and messages. This is a local project/demo build; before using it for a real institution, deploy it behind HTTPS and review operational security, backups, privacy, and account-recovery requirements.

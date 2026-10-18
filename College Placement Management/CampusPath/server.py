"""Local server for placement accounts, job drives, resumes, and messages."""

from __future__ import annotations

import hashlib
import hmac
import io
import json
import mimetypes
import os
import re
import secrets
import smtplib
import sqlite3
import sys
import time
import zipfile
import zlib
from datetime import date, datetime, timedelta
from email import policy
from email.message import EmailMessage
from email.parser import BytesParser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse
from xml.etree import ElementTree


ROOT = Path(__file__).resolve().parent
STATIC = ROOT / "static"
DATA_DIR = ROOT / "data"
UPLOAD_DIR = ROOT / "uploads"
DB_PATH = DATA_DIR / "placement.sqlite3"
PORT = int(os.environ.get("PORT", "8000"))
MAX_UPLOAD = 6 * 1024 * 1024

DATA_DIR.mkdir(exist_ok=True)
UPLOAD_DIR.mkdir(exist_ok=True)


def connect():
    """Open a SQLite connection with named rows and foreign key checks enabled."""
    db = sqlite3.connect(DB_PATH, timeout=15)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    return db


def password_hash(password: str, salt: bytes | None = None) -> str:
    """Save a password as a salted hash instead of readable text."""
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 210_000)
    return f"pbkdf2_sha256$210000${salt.hex()}${digest.hex()}"


def password_matches(password: str, stored: str) -> bool:
    """Check a typed password against the saved salted hash."""
    try:
        algorithm, iterations, salt, expected = stored.split("$")
        if algorithm != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), int(iterations))
        return hmac.compare_digest(digest.hex(), expected)
    except (ValueError, TypeError):
        return False


def extract_resume_text(path: Path) -> str:
    """Extract enough selectable text for an explainable ATS-readiness estimate."""
    suffix = path.suffix.lower()
    content = path.read_bytes()
    if suffix == ".docx":
        try:
            with zipfile.ZipFile(io.BytesIO(content)) as archive:
                xml = archive.read("word/document.xml")
            root = ElementTree.fromstring(xml)
            return " ".join(node.text or "" for node in root.iter() if node.tag.endswith("}t"))
        except (KeyError, OSError, ElementTree.ParseError, zipfile.BadZipFile):
            return ""
    if suffix == ".pdf":
        try:
            from pypdf import PdfReader
            reader = PdfReader(io.BytesIO(content))
            return "\n".join(page.extract_text() or "" for page in reader.pages)
        except ImportError:
            pass
        except Exception:
            pass
        streams = [content]
        for match in re.finditer(rb"stream\r?\n(.*?)\r?\nendstream", content, re.S):
            chunk = match.group(1)
            try:
                streams.append(zlib.decompress(chunk))
            except zlib.error:
                streams.append(chunk)
        decoded = "\n".join(chunk.decode("latin-1", "ignore") for chunk in streams)
        strings = re.findall(r"\(((?:\\.|[^\\)])*)\)\s*Tj", decoded)
        arrays = re.findall(r"\[(.*?)\]\s*TJ", decoded, re.S)
        for array in arrays:
            strings.extend(re.findall(r"\(((?:\\.|[^\\)])*)\)", array))
        def unescape_pdf(value):
            """Convert escaped text from a PDF into readable characters."""
            value = re.sub(r"\\([0-7]{1,3})", lambda m: chr(int(m.group(1), 8)), value)
            return re.sub(r"\\([nrtbf()\\])", lambda m: {"n":"\n","r":"\r","t":"\t","b":"","f":"","(":"(",")":")","\\":"\\"}[m.group(1)], value)
        return " ".join(unescape_pdf(value) for value in strings)
    if suffix == ".doc":
        unicode_text = content.decode("utf-16le", "ignore")
        byte_text = content.decode("latin-1", "ignore")
        candidates = re.findall(r"[A-Za-z][A-Za-z0-9 ,.:;!?&'’()/+-]{2,}", unicode_text)
        candidates.extend(re.findall(r"[A-Za-z][A-Za-z0-9 ,.:;!?&'’()/+-]{2,}", byte_text))
        return " ".join(candidates)
    return ""


def score_resume(text: str, skills: str):
    """Estimate resume readiness and return clear ways to improve it."""
    normalized = re.sub(r"\s+", " ", text).strip().lower()
    words = re.findall(r"\b[\w+#.-]+\b", normalized)
    headings = ("summary", "objective", "education", "experience", "work experience", "skills", "projects", "certifications")
    found_headings = [heading for heading in headings if re.search(rf"\b{re.escape(heading)}\b", normalized)]
    skill_list = [skill.strip().lower() for skill in skills.split(",") if skill.strip()]
    matched_skills = [skill for skill in skill_list if skill in normalized]
    has_email = bool(re.search(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}", normalized))
    has_phone = bool(re.search(r"(?:\+?\d[\d .()/-]{7,}\d)", normalized))
    has_metrics = bool(re.search(r"\b\d+(?:\.\d+)?\s*(?:%|percent|users|customers|hours|days|projects| lakh|lpa)\b", normalized))
    action_verbs = ("built", "created", "designed", "developed", "improved", "led", "launched", "analyzed", "automated", "managed", "implemented", "reduced", "increased", "delivered")
    action_count = sum(1 for verb in action_verbs if re.search(rf"\b{verb}\b", normalized))
    score = 0
    score += 10 if has_email else 0
    score += 10 if has_phone else 0
    score += min(25, len(found_headings) * 5)
    score += 15 if len(words) >= 250 else 10 if len(words) >= 120 else 4 if words else 0
    score += round(20 * len(matched_skills) / max(1, min(4, len(skill_list)))) if skill_list else 5
    score += min(10, action_count * 2)
    score += 10 if has_metrics else 0
    score = min(100, score)
    feedback = []
    if not has_email or not has_phone:
        feedback.append("Add a clearly labeled email address and phone number to the header.")
    if len(found_headings) < 4:
        feedback.append("Use standard section headings such as Education, Experience, Skills, and Projects.")
    if len(words) < 120:
        feedback.append("Your resume text looks short. Add concise details about coursework, projects, or experience.")
    if skill_list and len(matched_skills) < min(3, len(skill_list)):
        missing = [skill for skill in skill_list if skill not in matched_skills][:4]
        feedback.append("If accurate, include relevant skills that are missing: " + ", ".join(missing) + ".")
    if not action_count:
        feedback.append("Start experience and project bullets with action verbs, such as Built, Analyzed, or Improved.")
    if not has_metrics:
        feedback.append("Add honest numbers where useful, such as users reached, time saved, or project results.")
    if not feedback:
        feedback.append("Strong structure detected. Tailor keywords and achievements to each role before applying.")
    return score, feedback


def init_db():
    """Create the database tables and add the sample accounts when needed."""
    with connect() as db:
        db.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE COLLATE NOCASE,
            password TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('student','company','admin')),
            status TEXT NOT NULL DEFAULT 'active',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS students (
            student_id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
            roll_number TEXT UNIQUE,
            branch TEXT NOT NULL DEFAULT '',
            semester INTEGER NOT NULL DEFAULT 1,
            cgpa REAL NOT NULL DEFAULT 0,
            skills TEXT NOT NULL DEFAULT '',
            phone TEXT NOT NULL DEFAULT '',
            resume TEXT,
            ats_score INTEGER,
            ats_report TEXT NOT NULL DEFAULT '[]',
            projects TEXT NOT NULL DEFAULT '',
            placement_status TEXT NOT NULL DEFAULT 'Seeking placement'
        );
        CREATE TABLE IF NOT EXISTS companies (
            company_id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
            company_name TEXT NOT NULL,
            website TEXT NOT NULL DEFAULT '',
            location TEXT NOT NULL DEFAULT '',
            hr_name TEXT NOT NULL DEFAULT '',
            hr_email TEXT NOT NULL DEFAULT '',
            industry TEXT NOT NULL DEFAULT '',
            phone TEXT NOT NULL DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS jobs (
            job_id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER NOT NULL REFERENCES companies(company_id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            salary TEXT NOT NULL DEFAULT '',
            min_cgpa REAL NOT NULL DEFAULT 0,
            deadline TEXT NOT NULL,
            branches TEXT NOT NULL DEFAULT 'All branches',
            required_skills TEXT NOT NULL DEFAULT '',
            location TEXT NOT NULL DEFAULT '',
            openings INTEGER NOT NULL DEFAULT 1,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS applications (
            application_id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL REFERENCES jobs(job_id) ON DELETE CASCADE,
            student_id INTEGER NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
            status TEXT NOT NULL DEFAULT 'Applied',
            applied_date TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(job_id, student_id)
        );
        CREATE TABLE IF NOT EXISTS sessions (
            session_id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            expires_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS placement_team_messages (
            message_id INTEGER PRIMARY KEY AUTOINCREMENT,
            sender_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            sender_name TEXT NOT NULL,
            sender_email TEXT NOT NULL,
            sender_role TEXT NOT NULL,
            subject TEXT NOT NULL,
            message TEXT NOT NULL,
            mail_status TEXT NOT NULL DEFAULT 'saved',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS direct_messages (
            message_id INTEGER PRIMARY KEY AUTOINCREMENT,
            sender_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            recipient_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            message TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_jobs_status_deadline ON jobs(status, deadline);
        CREATE INDEX IF NOT EXISTS idx_applications_job ON applications(job_id);
        CREATE INDEX IF NOT EXISTS idx_team_messages_created ON placement_team_messages(created_at);
        CREATE INDEX IF NOT EXISTS idx_direct_messages_pair ON direct_messages(sender_user_id,recipient_user_id,message_id);
        """)
        student_columns = {row["name"] for row in db.execute("PRAGMA table_info(students)").fetchall()}
        if "ats_score" not in student_columns:
            db.execute("ALTER TABLE students ADD COLUMN ats_score INTEGER")
        if "ats_report" not in student_columns:
            db.execute("ALTER TABLE students ADD COLUMN ats_report TEXT NOT NULL DEFAULT '[]'")
        if db.execute("SELECT COUNT(*) FROM users").fetchone()[0] > 0:
            return

        def add_user(name, email, role, password, status="active"):
            """Add a demo account and its linked student or company profile."""
            cur = db.execute("INSERT INTO users(name,email,password,role,status) VALUES(?,?,?,?,?)",
                             (name, email, password_hash(password), role, status))
            return cur.lastrowid

        admin_id = add_user("Placement Office", "admin@smartplacement.edu", "admin", "Admin123!")
        student_rows = [
            ("Aarav Mehta", "aarav@northstar.edu", "NS2024001", "Computer Science", 6, 8.7, "Python, React, SQL, Data Structures", "9876501201", "Smart campus navigation app"),
            ("Ananya Rao", "ananya@northstar.edu", "NS2024002", "Information Technology", 6, 9.1, "Java, SQL, Cloud, Problem Solving", "9876501202", "Cloud based attendance platform"),
            ("Ishaan Verma", "ishaan@northstar.edu", "NS2024003", "Electronics", 6, 7.8, "C++, IoT, Python, Embedded Systems", "9876501203", "IoT energy monitor"),
            ("Riya Kapoor", "riya@northstar.edu", "NS2024004", "Computer Science", 6, 8.2, "JavaScript, React, Node, UX", "9876501204", "Accessible student marketplace"),
            ("Kabir Nair", "kabir@northstar.edu", "NS2024005", "Mechanical", 6, 7.4, "CAD, Python, Manufacturing, Excel", "9876501205", "Low cost solar dryer"),
            ("Meera Iyer", "meera@northstar.edu", "NS2024006", "Information Technology", 6, 8.9, "Python, SQL, Machine Learning, Tableau", "9876501206", "Retail demand forecasting"),
            ("Vihaan Shah", "vihaan@northstar.edu", "NS2024007", "Electrical", 6, 7.1, "C, MATLAB, Power Systems", "9876501207", "Smart grid fault detector"),
            ("Sara Thomas", "sara@northstar.edu", "NS2024008", "Computer Science", 6, 9.3, "Python, Machine Learning, NLP, SQL", "9876501208", "Multilingual campus assistant"),
        ]
        student_ids = {}
        for idx, (name, email, roll, branch, semester, cgpa, skills, phone, projects) in enumerate(student_rows):
            user_id = add_user(name, email, "student", "Student123!")
            cur = db.execute("""INSERT INTO students(user_id,roll_number,branch,semester,cgpa,skills,phone,projects)
                                VALUES(?,?,?,?,?,?,?,?)""",
                             (user_id, roll, branch, semester, cgpa, skills, phone, projects))
            student_ids[email] = cur.lastrowid

        company_rows = [
            ("Nimbus Labs", "hr@nimbus.io", "Priya Desai", "Bengaluru", "https://nimbus.example", "SaaS"),
            ("Cedar Analytics", "talent@cedar.example", "Dev Malhotra", "Pune", "https://cedar.example", "Data & AI"),
            ("Copperleaf Systems", "careers@copperleaf.example", "Neha Shah", "Mumbai", "https://copperleaf.example", "Fintech"),
            ("Bluepeak Health", "people@bluepeak.example", "Karan Bose", "Hyderabad", "https://bluepeak.example", "Healthcare"),
        ]
        company_ids = {}
        for company, email, hr, location, website, industry in company_rows:
            user_id = add_user(f"{company} HR", email, "company", "Company123!")
            cur = db.execute("""INSERT INTO companies(user_id,company_name,website,location,hr_name,hr_email,industry)
                                VALUES(?,?,?,?,?,?,?)""",
                             (user_id, company, website, location, hr, email, industry))
            company_ids[company] = cur.lastrowid

        drives = [
            ("Nimbus Labs", "Graduate Software Engineer", "Build product features used by teams across the world. Join a small, collaborative engineering group and ship from your first month.", "₹12–16 LPA", 7.5, "2026-11-05", "Computer Science, Information Technology", "Python, React, SQL", "Bengaluru · Hybrid", 8),
            ("Cedar Analytics", "Data Analyst Associate", "Turn complex datasets into clear decisions for high-growth customers. You'll partner with product and strategy teams.", "₹9–12 LPA", 7.0, "2026-11-12", "All branches", "SQL, Python, Tableau", "Pune · Hybrid", 5),
            ("Copperleaf Systems", "Product Engineering Intern", "Work with designers and engineers to make everyday financial tools simpler and more accessible.", "₹45k / month", 7.5, "2026-11-18", "Computer Science, Information Technology", "JavaScript, React", "Mumbai · On-site", 4),
            ("Bluepeak Health", "Junior Data Scientist", "Help care teams make better decisions using practical, responsible machine learning.", "₹10–14 LPA", 8.0, "2026-11-21", "Computer Science, Information Technology, Electronics", "Python, Machine Learning", "Hyderabad · Hybrid", 3),
            ("Nimbus Labs", "Platform Engineering Intern", "Learn cloud infrastructure and reliability by improving the platform behind Nimbus products.", "₹50k / month", 8.0, "2026-11-25", "Computer Science, Information Technology", "Cloud, Python", "Bengaluru · Hybrid", 3),
            ("Copperleaf Systems", "Business Operations Associate", "Help a fast-moving fintech team turn customer insights into better operations.", "₹8–10 LPA", 7.0, "2026-12-01", "All branches", "Excel, Communication", "Mumbai · Hybrid", 6),
        ]
        job_ids = []
        for company, title, description, salary, cgpa, deadline, branches, skills, location, openings in drives:
            cur = db.execute("""INSERT INTO jobs(company_id,title,description,salary,min_cgpa,deadline,branches,
                              required_skills,location,openings,status) VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
                             (company_ids[company], title, description, salary, cgpa, deadline, branches, skills, location, openings, "approved"))
            job_ids.append(cur.lastrowid)
        samples = [
            (0, "aarav@northstar.edu", "Shortlisted"),
            (1, "aarav@northstar.edu", "Under Review"),
            (1, "ananya@northstar.edu", "Selected"),
            (2, "riya@northstar.edu", "Applied"),
            (3, "sara@northstar.edu", "Shortlisted"),
            (4, "meera@northstar.edu", "Applied"),
            (5, "kabir@northstar.edu", "Under Review"),
            (0, "riya@northstar.edu", "Applied"),
        ]
        for job_index, email, status in samples:
            db.execute("INSERT INTO applications(job_id,student_id,status) VALUES(?,?,?)",
                       (job_ids[job_index], student_ids[email], status))


def rowdict(row):
    """Convert a database row into a regular dictionary."""
    return dict(row) if row is not None else None


def user_public(row):
    """Return safe account details without exposing the password hash."""
    return {"id": row["id"], "name": row["name"], "email": row["email"], "role": row["role"], "status": row["status"]}


def get_student(db, user_id):
    """Find the student profile linked to an account."""
    return rowdict(db.execute("SELECT * FROM students WHERE user_id=?", (user_id,)).fetchone())


def get_company(db, user_id):
    """Find the company profile linked to an account."""
    return rowdict(db.execute("SELECT * FROM companies WHERE user_id=?", (user_id,)).fetchone())


def message_contacts(db, user):
    """Return only contacts the signed-in role is allowed to message."""
    if user["role"] == "admin":
        rows = db.execute("""SELECT u.id,u.name,u.email,u.role,c.company_name
            FROM users u LEFT JOIN companies c ON c.user_id=u.id
            WHERE u.id<>? AND u.status='active' AND u.role IN ('student','company') ORDER BY u.name""",
            (user["id"],)).fetchall()
    elif user["role"] == "student":
        student = get_student(db, user["id"])
        if not student:
            return []
        rows = db.execute("""SELECT DISTINCT u.id,u.name,u.email,u.role,c.company_name
            FROM users u LEFT JOIN companies c ON c.user_id=u.id
            WHERE u.status='active' AND (u.role='admin' OR (u.role='company' AND EXISTS(
              SELECT 1 FROM applications a JOIN jobs j USING(job_id)
              WHERE a.student_id=? AND j.company_id=c.company_id))) ORDER BY u.role,u.name""",
            (student["student_id"],)).fetchall()
    elif user["role"] == "company":
        company = get_company(db, user["id"])
        if not company:
            return []
        rows = db.execute("""SELECT DISTINCT u.id,u.name,u.email,u.role,c.company_name
            FROM users u LEFT JOIN students s ON s.user_id=u.id LEFT JOIN companies c ON c.user_id=u.id
            WHERE u.status='active' AND (u.role='admin' OR (u.role='student' AND EXISTS(
              SELECT 1 FROM applications a JOIN jobs j USING(job_id)
              WHERE a.student_id=s.student_id AND j.company_id=?))) ORDER BY u.role,u.name""",
            (company["company_id"],)).fetchall()
    else:
        return []
    return [dict(row) for row in rows]


def can_message(db, user, recipient_id):
    """Check whether a message recipient is allowed for this account."""
    return any(int(contact["id"]) == int(recipient_id) for contact in message_contacts(db, user))


def is_eligible(student, job):
    """Check the branch and grade requirements for a job."""
    if not student:
        return False
    branch_list = [b.strip().casefold() for b in job["branches"].split(",") if b.strip()]
    branch_ok = not branch_list or "all branches" in branch_list or student["branch"].casefold() in branch_list
    return branch_ok and float(student["cgpa"] or 0) >= float(job["min_cgpa"] or 0)


def dashboard_data(user):
    """Build the data shown on the signed-in role dashboard."""
    with connect() as db:
        if user["role"] == "student":
            student = get_student(db, user["id"])
            jobs = db.execute("""SELECT j.*,c.company_name,c.location AS company_location,
                                   c.hr_name,c.hr_email AS contact_email FROM jobs j
                                   JOIN companies c USING(company_id)
                                   WHERE j.status='approved' ORDER BY j.deadline ASC""").fetchall()
            apps = db.execute("""SELECT a.*,j.title,j.salary,j.deadline,j.location,j.job_id,c.company_name,
                                 c.hr_name,c.hr_email AS contact_email
                                 FROM applications a JOIN jobs j USING(job_id) JOIN companies c USING(company_id)
                                 WHERE a.student_id=? ORDER BY a.applied_date DESC""", (student["student_id"],)).fetchall()
            applied_ids = {a["job_id"] for a in apps}
            job_items = []
            for job in jobs:
                item = dict(job)
                item["eligible"] = is_eligible(student, item)
                item["applied"] = item["job_id"] in applied_ids
                item["skill_matches"] = sum(1 for skill in item["required_skills"].split(",") if skill.strip().casefold() in student["skills"].casefold())
                item["days_left"] = (date.fromisoformat(item["deadline"]) - date.today()).days if item["deadline"] else 0
                job_items.append(item)
            return {"profile": student, "jobs": job_items, "applications": [dict(a) for a in apps]}
        if user["role"] == "company":
            company = get_company(db, user["id"])
            jobs = db.execute("""SELECT j.*,(SELECT COUNT(*) FROM applications a WHERE a.job_id=j.job_id) AS applicant_count
                                  FROM jobs j WHERE j.company_id=? ORDER BY j.created_at DESC""", (company["company_id"],)).fetchall()
            applicants = db.execute("""SELECT a.application_id,a.status,a.applied_date,s.student_id,s.roll_number,
                s.branch,s.semester,s.cgpa,s.skills,s.resume,u.name AS student_name,u.email,j.job_id,j.title
                FROM applications a JOIN students s USING(student_id) JOIN users u ON s.user_id=u.id
                JOIN jobs j USING(job_id) WHERE j.company_id=? ORDER BY a.applied_date DESC""", (company["company_id"],)).fetchall()
            return {"company": company, "jobs": [dict(j) for j in jobs], "applicants": [dict(a) for a in applicants]}

        students = db.execute("""SELECT s.*,u.id AS user_id,u.name,u.email,u.status FROM students s
                                  JOIN users u ON s.user_id=u.id ORDER BY u.name""").fetchall()
        companies = db.execute("""SELECT c.*,u.name AS account_name,u.email,u.status FROM companies c
                                  JOIN users u ON c.user_id=u.id ORDER BY c.company_name""").fetchall()
        jobs = db.execute("""SELECT j.*,c.company_name,(SELECT COUNT(*) FROM applications a WHERE a.job_id=j.job_id) AS applicant_count
                             FROM jobs j JOIN companies c USING(company_id) ORDER BY j.created_at DESC""").fetchall()
        applications = db.execute("""SELECT a.*,u.name AS student_name,s.roll_number,s.branch,s.cgpa,j.title,
                                       c.company_name FROM applications a JOIN students s USING(student_id)
                                       JOIN users u ON s.user_id=u.id JOIN jobs j USING(job_id)
                                       JOIN companies c USING(company_id) ORDER BY a.applied_date DESC""").fetchall()
        branch_counts = db.execute("SELECT branch,COUNT(*) AS count FROM students GROUP BY branch ORDER BY count DESC").fetchall()
        total_students = len(students)
        placed = db.execute("SELECT COUNT(DISTINCT student_id) FROM applications WHERE status='Selected'").fetchone()[0]
        team_messages = db.execute("""SELECT * FROM placement_team_messages ORDER BY created_at DESC LIMIT 100""").fetchall()
        return {"students": [dict(s) for s in students], "companies": [dict(c) for c in companies],
                "jobs": [dict(j) for j in jobs], "applications": [dict(a) for a in applications],
                "team_messages": [dict(message) for message in team_messages],
                "branch_counts": [dict(b) for b in branch_counts],
                "metrics": {"students": total_students, "companies": len(companies),
                            "drives": sum(1 for j in jobs if j["status"] == "approved"),
                            "applications": len(applications), "placed": placed,
                            "placement_rate": round(placed / total_students * 100) if total_students else 0}}


class Handler(BaseHTTPRequestHandler):
    """Route browser requests and connect them to placement data."""
    server_version = "CampusPath/1.0"

    def log_message(self, fmt, *args):
        """Write a short record of each web request to the server console."""
        print(f"{self.address_string()} - {fmt % args}")

    def json_response(self, payload, status=200, headers=None):
        """Send a JSON result with the right response headers."""
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        if headers:
            for key, value in headers.items():
                self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def error(self, message, status=400):
        """Send a readable error message with its HTTP status."""
        self.json_response({"error": message}, status)

    def body_bytes(self, limit=1024 * 1024):
        """Read a request body while enforcing its size limit."""
        length = int(self.headers.get("Content-Length", "0"))
        if length > limit:
            raise ValueError("That upload is too large.")
        return self.rfile.read(length)

    def body_json(self):
        """Read and validate JSON sent by the browser."""
        raw = self.body_bytes()
        if not raw:
            return {}
        try:
            return json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise ValueError("Please check the form and try again.")

    def current_user(self):
        """Find the signed-in account from its session cookie."""
        cookie = self.headers.get("Cookie", "")
        match = re.search(r"(?:^|;\s*)campus_session=([A-Za-z0-9_-]+)", cookie)
        if not match:
            return None
        with connect() as db:
            row = db.execute("""SELECT u.* FROM sessions s JOIN users u ON s.user_id=u.id
                                WHERE s.session_id=? AND s.expires_at>? AND u.status='active'""",
                             (match.group(1), int(time.time()))).fetchone()
        return rowdict(row)

    def require_user(self, roles=None):
        """Require a signed-in account and, when given, an allowed role."""
        user = self.current_user()
        if not user:
            self.error("Please log in to continue.", 401)
            return None
        if roles and user["role"] not in roles:
            self.error("You don't have access to that area.", 403)
            return None
        return user

    def do_GET(self):
        """Handle page, dashboard, resume, and read-only API requests."""
        parsed = urlparse(self.path)
        path = unquote(parsed.path)
        if path == "/api/me":
            user = self.current_user()
            self.json_response({"user": user_public(user) if user else None})
            return
        if path == "/api/dashboard":
            user = self.require_user()
            if user:
                self.json_response(dashboard_data(user))
            return
        if path == "/api/message-contacts":
            user = self.require_user()
            if user:
                with connect() as db:
                    self.json_response({"contacts": message_contacts(db, user)})
            return
        if path == "/api/messages":
            user = self.require_user()
            if not user:
                return
            try:
                recipient_id = int(parse_qs(parsed.query).get("with", [""])[0])
            except (ValueError, TypeError):
                self.error("Choose a conversation first.", 400)
                return
            with connect() as db:
                if not can_message(db, user, recipient_id):
                    self.error("You can only message students or companies connected to your placement activity.", 403)
                    return
                rows = db.execute("""SELECT m.message_id,m.sender_user_id,m.recipient_user_id,m.message,m.created_at,
                    u.name AS sender_name,u.role AS sender_role FROM direct_messages m
                    JOIN users u ON u.id=m.sender_user_id
                    WHERE (m.sender_user_id=? AND m.recipient_user_id=?)
                       OR (m.sender_user_id=? AND m.recipient_user_id=?)
                    ORDER BY m.message_id DESC LIMIT 250""",
                    (user["id"], recipient_id, recipient_id, user["id"])).fetchall()
            self.json_response({"messages": [dict(row) for row in reversed(rows)]})
            return
        if path.startswith("/api/resumes/"):
            user = self.require_user()
            if not user:
                return
            self.serve_resume(user, path.rsplit("/", 1)[-1])
            return
        self.serve_static(path)

    def serve_static(self, path):
        """Send a website file from the static folder."""
        if path == "/":
            path = "/index.html"
        target = (STATIC / path.lstrip("/")).resolve()
        if not target.is_relative_to(STATIC.resolve()) or not target.is_file():
            self.error("Page not found.", 404)
            return
        body = target.read_bytes()
        mime = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", f"{mime}; charset=utf-8" if mime.startswith("text/") or mime in ("application/javascript",) else mime)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(body)

    def serve_resume(self, user, student_id_text):
        """Show a resume only to an allowed placement account."""
        try:
            student_id = int(student_id_text)
        except ValueError:
            self.error("Resume not found.", 404)
            return
        with connect() as db:
            student = db.execute("""SELECT s.*,u.id AS owner_id FROM students s
                                    JOIN users u ON s.user_id=u.id WHERE s.student_id=?""", (student_id,)).fetchone()
            if not student or not student["resume"]:
                self.error("No resume has been uploaded.", 404)
                return
            allowed = user["role"] == "admin" or user["id"] == student["owner_id"]
            if user["role"] == "company":
                allowed = db.execute("""SELECT 1 FROM applications a JOIN jobs j USING(job_id)
                                        JOIN companies c USING(company_id) WHERE a.student_id=? AND c.user_id=? LIMIT 1""",
                                     (student_id, user["id"])).fetchone() is not None
            if not allowed:
                self.error("You don't have access to this resume.", 403)
                return
            path = UPLOAD_DIR / student["resume"]
        if not path.is_file():
            self.error("The saved resume could not be found.", 404)
            return
        body = path.read_bytes()
        mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Content-Disposition", f'inline; filename="{path.name.split("_", 1)[-1]}"')
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        """Route sign-in, profile, messaging, resume, and job actions."""
        parsed = urlparse(self.path)
        try:
            if parsed.path == "/api/register":
                self.register(self.body_json())
            elif parsed.path == "/api/login":
                self.login(self.body_json())
            elif parsed.path == "/api/logout":
                self.logout()
            elif parsed.path == "/api/profile":
                self.save_profile()
            elif parsed.path == "/api/resume":
                self.upload_resume()
            elif parsed.path == "/api/jobs":
                self.create_job(self.body_json())
            elif parsed.path == "/api/contact-team":
                self.contact_team(self.body_json())
            elif parsed.path == "/api/messages":
                self.send_direct_message(self.body_json())
            elif re.fullmatch(r"/api/jobs/\d+/apply", parsed.path):
                self.apply_for_job(int(parsed.path.split("/")[3]))
            else:
                self.error("Page not found.", 404)
        except ValueError as exc:
            self.error(str(exc), 400)
        except Exception as exc:
            print(f"Request error: {exc}", file=sys.stderr)
            self.error("Something went wrong. Please try again.", 500)

    def register(self, data):
        """Create an account and its student or company profile."""
        name = str(data.get("name", "")).strip()
        email = str(data.get("email", "")).strip().lower()
        password = str(data.get("password", ""))
        role = str(data.get("role", "student"))
        if len(name) < 2 or len(name) > 80:
            raise ValueError("Enter your name (2–80 characters).")
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email) or len(email) > 180:
            raise ValueError("Enter a valid email address.")
        if len(password) < 8:
            raise ValueError("Use a password with at least 8 characters.")
        if role not in ("student", "company"):
            raise ValueError("Choose Student or Company to create an account.")
        if role == "student":
            try:
                semester = int(data.get("semester") or 1)
                cgpa = float(data.get("cgpa") or 0)
            except (ValueError, TypeError):
                raise ValueError("Semester and CGPA need to be numbers.")
            roll_number = str(data.get("roll_number", "")).strip()
            branch = str(data.get("branch", "")).strip()
            skills = str(data.get("skills", "")).strip()
            phone = str(data.get("phone", "")).strip()
            projects = str(data.get("projects", "")).strip()
            if not (1 <= semester <= 12) or not (0 <= cgpa <= 10):
                raise ValueError("Semester must be 1–12 and CGPA must be 0–10.")
            if len(roll_number) > 40 or len(branch) > 80 or len(skills) > 500 or len(phone) > 40 or len(projects) > 4000:
                raise ValueError("One of your profile details is too long.")
        else:
            company_name = str(data.get("company_name", "")).strip()
            website = str(data.get("website", "")).strip()
            location = str(data.get("location", "")).strip()
            industry = str(data.get("industry", "")).strip()
            phone = str(data.get("phone", "")).strip()
            if len(company_name) < 2 or len(company_name) > 120:
                raise ValueError("Enter your company name (2–120 characters).")
            if len(website) > 200 or len(location) > 120 or len(industry) > 100 or len(phone) > 40:
                raise ValueError("One of your company details is too long.")
        with connect() as db:
            if db.execute("SELECT 1 FROM users WHERE email=?", (email,)).fetchone():
                raise ValueError("An account already exists for that email.")
            user_id = db.execute("INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)",
                                 (name, email, password_hash(password), role)).lastrowid
            if role == "student":
                try:
                    db.execute("""INSERT INTO students(user_id,roll_number,branch,semester,cgpa,skills,phone,projects)
                        VALUES(?,?,?,?,?,?,?,?)""",
                        (user_id, roll_number or None, branch, semester, cgpa, skills, phone, projects))
                except sqlite3.IntegrityError:
                    raise ValueError("That roll number is already in use.")
            else:
                db.execute("""INSERT INTO companies(user_id,company_name,website,location,hr_name,hr_email,industry,phone)
                    VALUES(?,?,?,?,?,?,?,?)""",
                    (user_id, company_name, website, location, name, email, industry, phone))
            token = secrets.token_urlsafe(32)
            db.execute("INSERT INTO sessions(session_id,user_id,expires_at) VALUES(?,?,?)",
                       (token, user_id, int(time.time()) + 60 * 60 * 24 * 14))
            row = db.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
        self.json_response({"user": user_public(row)}, 201,
                           {"Set-Cookie": f"campus_session={token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=1209600"})

    def login(self, data):
        """Check account details and start a secure browser session."""
        email = str(data.get("email", "")).strip().lower()
        password = str(data.get("password", ""))
        requested_role = str(data.get("role", ""))
        with connect() as db:
            row = db.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
            if not row or not password_matches(password, row["password"]):
                self.error("That email and password don't match.", 401)
                return
            if requested_role and requested_role != row["role"]:
                self.error(f"This account belongs to the {row['role']} portal. Choose that role and try again.", 401)
                return
            if row["status"] != "active":
                self.error("This account is currently paused. Contact the placement office.", 403)
                return
            token = secrets.token_urlsafe(32)
            db.execute("INSERT INTO sessions(session_id,user_id,expires_at) VALUES(?,?,?)",
                       (token, row["id"], int(time.time()) + 60 * 60 * 24 * 14))
        self.json_response({"user": user_public(row)}, headers={"Set-Cookie": f"campus_session={token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=1209600"})

    def logout(self):
        """End the current session and clear its browser cookie."""
        user = self.current_user()
        cookie = self.headers.get("Cookie", "")
        match = re.search(r"(?:^|;\s*)campus_session=([A-Za-z0-9_-]+)", cookie)
        if match:
            with connect() as db:
                db.execute("DELETE FROM sessions WHERE session_id=?", (match.group(1),))
        self.json_response({"ok": True}, headers={"Set-Cookie": "campus_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"})

    def save_profile(self):
        """Save the signed-in student profile details."""
        user = self.require_user(["student"])
        if not user:
            return
        data = self.body_json()
        try:
            semester = int(data.get("semester", 1))
            cgpa = float(data.get("cgpa", 0))
        except (ValueError, TypeError):
            raise ValueError("Semester and CGPA need to be numbers.")
        if semester < 1 or semester > 12 or cgpa < 0 or cgpa > 10:
            raise ValueError("Semester must be 1–12 and CGPA must be 0–10.")
        fields = {key: str(data.get(key, "")).strip() for key in ("roll_number", "branch", "skills", "phone", "projects")}
        if len(fields["roll_number"]) > 40 or len(fields["branch"]) > 80 or len(fields["skills"]) > 500:
            raise ValueError("One of those fields is too long.")
        with connect() as db:
            try:
                db.execute("""UPDATE students SET roll_number=?,branch=?,semester=?,cgpa=?,skills=?,phone=?,projects=? WHERE user_id=?""",
                           (fields["roll_number"] or None, fields["branch"], semester, cgpa, fields["skills"], fields["phone"], fields["projects"], user["id"]))
            except sqlite3.IntegrityError:
                raise ValueError("That roll number is already in use.")
        self.json_response({"ok": True})

    def save_company_profile(self):
        """Save the signed-in company contact details."""
        user = self.require_user(["company"])
        if not user:
            return
        data = self.body_json()
        fields = {key: str(data.get(key, "")).strip() for key in
                  ("company_name", "website", "location", "hr_name", "hr_email", "industry", "phone")}
        if len(fields["company_name"]) < 2 or len(fields["company_name"]) > 120:
            raise ValueError("Enter your company name (2–120 characters).")
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", fields["hr_email"]) or len(fields["hr_email"]) > 180:
            raise ValueError("Enter a valid hiring contact email.")
        if len(fields["website"]) > 200 or len(fields["location"]) > 120 or len(fields["hr_name"]) > 80 or len(fields["industry"]) > 100 or len(fields["phone"]) > 40:
            raise ValueError("One of your company details is too long.")
        with connect() as db:
            db.execute("""UPDATE companies SET company_name=?,website=?,location=?,hr_name=?,hr_email=?,industry=?,phone=?
                WHERE user_id=?""", (*fields.values(), user["id"]))
        self.json_response({"ok": True})

    def send_direct_message(self, data):
        """Save a message between approved placement contacts."""
        user = self.require_user()
        if not user:
            return
        try:
            recipient_id = int(data.get("recipient_id"))
        except (ValueError, TypeError):
            raise ValueError("Choose who you want to message.")
        message = str(data.get("message", "")).strip()
        if not message or len(message) > 3000:
            raise ValueError("Write a message up to 3,000 characters.")
        with connect() as db:
            if not can_message(db, user, recipient_id):
                self.error("You can only message students or companies connected to your placement activity.", 403)
                return
            message_id = db.execute("""INSERT INTO direct_messages(sender_user_id,recipient_user_id,message)
                VALUES(?,?,?)""", (user["id"], recipient_id, message)).lastrowid
            row = db.execute("""SELECT m.message_id,m.sender_user_id,m.recipient_user_id,m.message,m.created_at,
                u.name AS sender_name,u.role AS sender_role FROM direct_messages m JOIN users u ON u.id=m.sender_user_id
                WHERE m.message_id=?""", (message_id,)).fetchone()
        self.json_response({"message": dict(row)}, 201)

    def upload_resume(self):
        """Save a student resume and calculate its ATS readiness score."""
        user = self.require_user(["student"])
        if not user:
            return
        content_type = self.headers.get("Content-Type", "")
        if "multipart/form-data" not in content_type:
            self.error("Choose a resume file to upload.", 400)
            return
        raw = self.body_bytes(MAX_UPLOAD + 64 * 1024)
        message = BytesParser(policy=policy.default).parsebytes(
            f"Content-Type: {content_type}\r\nMIME-Version: 1.0\r\n\r\n".encode() + raw)
        uploaded = None
        for part in message.iter_parts():
            if part.get_content_disposition() == "form-data" and part.get_param("name", header="content-disposition") == "resume":
                uploaded = part
                break
        if not uploaded or not uploaded.get_filename():
            self.error("Choose a resume file to upload.", 400)
            return
        filename = Path(uploaded.get_filename()).name
        suffix = Path(filename).suffix.lower()
        if suffix not in (".pdf", ".doc", ".docx"):
            self.error("Upload a PDF, DOC, or DOCX resume.", 400)
            return
        content = uploaded.get_payload(decode=True) or b""
        if not content or len(content) > MAX_UPLOAD:
            self.error("Resume must be smaller than 6 MB.", 400)
            return
        safe = re.sub(r"[^A-Za-z0-9._-]+", "-", filename).strip("-.")[:100] or f"resume{suffix}"
        stored_name = f"{user['id']}_{int(time.time())}_{safe}"
        resume_path = UPLOAD_DIR / stored_name
        resume_path.write_bytes(content)
        with connect() as db:
            old = db.execute("SELECT resume,skills FROM students WHERE user_id=?", (user["id"],)).fetchone()
            resume_text = extract_resume_text(resume_path)
            score, feedback = score_resume(resume_text, old["skills"] if old else "")
            if not resume_text.strip():
                feedback.insert(0, "No readable text was extracted. If this is a scanned PDF, export a text-based PDF or DOCX and upload it again.")
            db.execute("UPDATE students SET resume=?,ats_score=?,ats_report=? WHERE user_id=?",
                       (stored_name, score, json.dumps(feedback, ensure_ascii=False), user["id"]))
        if old and old["resume"]:
            try:
                (UPLOAD_DIR / old["resume"]).unlink(missing_ok=True)
            except OSError:
                pass
        self.json_response({"ok": True, "filename": filename, "ats_score": score, "ats_report": feedback})

    def create_job(self, data):
        """Submit a company job drive for placement-team approval."""
        user = self.require_user(["company"])
        if not user:
            return
        company = get_company(connect(), user["id"])
        title = str(data.get("title", "")).strip()
        description = str(data.get("description", "")).strip()
        deadline = str(data.get("deadline", "")).strip()
        if len(title) < 3 or len(title) > 120 or len(description) < 20:
            raise ValueError("Add a role title and a description of at least 20 characters.")
        try:
            date.fromisoformat(deadline)
            cgpa = float(data.get("min_cgpa", 0))
            openings = int(data.get("openings", 1))
        except (ValueError, TypeError):
            raise ValueError("Check the deadline, CGPA, and openings fields.")
        if deadline < date.today().isoformat() or not (0 <= cgpa <= 10) or not (1 <= openings <= 1000):
            raise ValueError("Choose a future deadline, CGPA from 0 to 10, and at least one opening.")
        with connect() as db:
            db.execute("""INSERT INTO jobs(company_id,title,description,salary,min_cgpa,deadline,branches,
                         required_skills,location,openings,status) VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
                       (company["company_id"], title, description,
                        str(data.get("salary", "")).strip()[:80], cgpa, deadline,
                        str(data.get("branches", "All branches")).strip()[:250] or "All branches",
                        str(data.get("required_skills", "")).strip()[:250],
                        str(data.get("location", "")).strip()[:120], openings, "pending"))
        self.json_response({"ok": True}, 201)

    def contact_team(self, data):
        """Record a message for the placement team and email its inbox."""
        user = self.require_user(["student", "company", "admin"])
        if not user:
            return
        subject = str(data.get("subject", "")).strip()
        message = str(data.get("message", "")).strip()
        if len(subject) < 3 or len(subject) > 140:
            raise ValueError("Add a subject between 3 and 140 characters.")
        if len(message) < 10 or len(message) > 5000:
            raise ValueError("Write a message between 10 and 5,000 characters.")
        with connect() as db:
            message_id = db.execute("""INSERT INTO placement_team_messages
                (sender_user_id,sender_name,sender_email,sender_role,subject,message,mail_status)
                VALUES(?,?,?,?,?,?,?)""",
                (user["id"], user["name"], user["email"], user["role"], subject, message, "saved")).lastrowid
        email_sent = self.send_team_email(user, subject, message)
        status = "sent" if email_sent else "saved"
        with connect() as db:
            db.execute("UPDATE placement_team_messages SET mail_status=? WHERE message_id=?", (status, message_id))
        self.json_response({"ok": True, "email_sent": email_sent,
                            "delivery_status": status, "message_id": message_id}, 201)

    @staticmethod
    def send_team_email(user, subject, message):
        """Email the placement team when mail settings are available."""
        smtp_host = os.environ.get("SMTP_HOST", "").strip()
        if not smtp_host:
            return False
        recipient = os.environ.get("PLACEMENT_TEAM_EMAIL", "harshvardhansinghparihar32@gmail.com").strip()
        smtp_port = int(os.environ.get("SMTP_PORT", "465"))
        sender = os.environ.get("SMTP_FROM", os.environ.get("SMTP_USER", "")).strip()
        if not sender or not recipient:
            return False
        email = EmailMessage()
        email["Subject"] = f"CampusPath: {subject}"
        email["From"] = sender
        email["To"] = recipient
        email["Reply-To"] = user["email"]
        email.set_content(f"""A CampusPath user contacted the placement team.

Name: {user['name']}
Email: {user['email']}
Role: {user['role']}
Subject: {subject}

Message:
{message}
""")
        try:
            if smtp_port == 465:
                with smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=12) as smtp:
                    smtp.login(os.environ["SMTP_USER"], os.environ["SMTP_PASSWORD"]) if os.environ.get("SMTP_USER") else None
                    smtp.send_message(email)
            else:
                with smtplib.SMTP(smtp_host, smtp_port, timeout=12) as smtp:
                    smtp.starttls()
                    if os.environ.get("SMTP_USER"):
                        smtp.login(os.environ["SMTP_USER"], os.environ.get("SMTP_PASSWORD", ""))
                    smtp.send_message(email)
            return True
        except (OSError, smtplib.SMTPException, KeyError, ValueError) as exc:
            print(f"Placement-team email delivery failed: {exc}", file=sys.stderr)
            return False

    def apply_for_job(self, job_id):
        """Check eligibility and save a student job application."""
        user = self.require_user(["student"])
        if not user:
            return
        with connect() as db:
            student = get_student(db, user["id"])
            job = db.execute("SELECT * FROM jobs WHERE job_id=? AND status='approved'", (job_id,)).fetchone()
            if not job:
                self.error("That drive is no longer open.", 404)
                return
            if job["deadline"] < date.today().isoformat():
                self.error("The application deadline has passed.", 400)
                return
            if not is_eligible(student, dict(job)):
                self.error("Your branch or CGPA does not meet this drive's eligibility criteria.", 400)
                return
            try:
                db.execute("INSERT INTO applications(job_id,student_id) VALUES(?,?)", (job_id, student["student_id"]))
            except sqlite3.IntegrityError:
                self.error("You've already applied to this drive.", 409)
                return
        self.json_response({"ok": True}, 201)

    def do_PATCH(self):
        """Route job, application, and account status changes."""
        parsed = urlparse(self.path)
        try:
            data = self.body_json()
            if re.fullmatch(r"/api/jobs/\d+", parsed.path):
                self.update_job(int(parsed.path.rsplit("/", 1)[-1]), data)
            elif re.fullmatch(r"/api/applications/\d+", parsed.path):
                self.update_application(int(parsed.path.rsplit("/", 1)[-1]), data)
            elif re.fullmatch(r"/api/users/\d+/status", parsed.path):
                self.update_user_status(int(parsed.path.split("/")[3]), data)
            else:
                self.error("Page not found.", 404)
        except ValueError as exc:
            self.error(str(exc), 400)
        except Exception as exc:
            print(f"Request error: {exc}", file=sys.stderr)
            self.error("Something went wrong. Please try again.", 500)

    def update_job(self, job_id, data):
        """Approve or decline a company job drive."""
        user = self.require_user(["admin", "company"])
        if not user:
            return
        status = str(data.get("status", ""))
        if status not in ("pending", "approved", "rejected", "closed"):
            self.error("Choose a valid drive status.", 400)
            return
        with connect() as db:
            job = db.execute("SELECT * FROM jobs WHERE job_id=?", (job_id,)).fetchone()
            if not job:
                self.error("Drive not found.", 404)
                return
            if user["role"] == "company":
                company = get_company(db, user["id"])
                if job["company_id"] != company["company_id"] or status not in ("closed", "pending"):
                    self.error("You can only close or resubmit your own drives.", 403)
                    return
            db.execute("UPDATE jobs SET status=? WHERE job_id=?", (status, job_id))
        self.json_response({"ok": True})

    def update_application(self, application_id, data):
        """Change an application status as an allowed company or admin."""
        user = self.require_user(["admin", "company"])
        if not user:
            return
        status = str(data.get("status", ""))
        if status not in ("Applied", "Under Review", "Shortlisted", "Interview", "Selected", "Not Selected"):
            self.error("Choose a valid application status.", 400)
            return
        with connect() as db:
            app = db.execute("""SELECT a.*,j.company_id FROM applications a JOIN jobs j USING(job_id)
                                 WHERE a.application_id=?""", (application_id,)).fetchone()
            if not app:
                self.error("Application not found.", 404)
                return
            if user["role"] == "company":
                company = get_company(db, user["id"])
                if app["company_id"] != company["company_id"]:
                    self.error("You can only update applicants to your drives.", 403)
                    return
            db.execute("UPDATE applications SET status=? WHERE application_id=?", (status, application_id))
        self.json_response({"ok": True})

    def update_user_status(self, user_id, data):
        """Pause or reactivate an account as an administrator."""
        user = self.require_user(["admin"])
        if not user:
            return
        status = str(data.get("status", ""))
        if status not in ("active", "paused"):
            self.error("Choose Active or Paused.", 400)
            return
        with connect() as db:
            target = db.execute("SELECT role FROM users WHERE id=?", (user_id,)).fetchone()
            if not target or target["role"] == "admin":
                self.error("That account can't be changed here.", 404)
                return
            db.execute("UPDATE users SET status=? WHERE id=?", (status, user_id))
            if status == "paused":
                db.execute("DELETE FROM sessions WHERE user_id=?", (user_id,))
        self.json_response({"ok": True})

    def do_PUT(self):
        """Route saved profile updates."""
        path = urlparse(self.path).path
        if path == "/api/profile":
            self.save_profile()
            return
        if path == "/api/company-profile":
            self.save_company_profile()
            return
        self.error("Page not found.", 404)


if __name__ == "__main__":
    init_db()
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"CampusPath is running at http://localhost:{PORT}")
    print("Demo accounts: admin@smartplacement.edu / Admin123! | aarav@northstar.edu / Student123! | hr@nimbus.io / Company123!")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nCampusPath stopped.")
        server.server_close()

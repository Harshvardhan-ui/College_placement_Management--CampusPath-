// Keep the main screen and temporary UI state in one shared place.
const app = document.querySelector('#app');
const state = { user: null, data: null, view: 'overview', authMode: 'login', authRole: 'student', filter: '', busy: false, apiReady: false, adminPoller: null, adminDataKey: '', messageContacts: [], messageItems: [], activeMessageId: null, messageContactsLoaded: false, messagePoller: null, messageLoading: false, messageError: '' };
// These small helpers escape text and format common labels safely.
const OFFLINE_DB_KEY = 'campuspath_demo_data_v1';
const OFFLINE_SESSION_KEY = 'campuspath_demo_user_v1';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const initials = name => String(name || '?').split(/\s+/).slice(0, 2).map(s => s[0]).join('').toUpperCase();
const slug = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const money = value => esc(value || 'Compensation shared on application');
const fmtDate = value => {
  if (!value) return 'Date to be confirmed';
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? esc(value) : parsed.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};
const dateText = () => new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
const letters = name => initials(name).slice(0, 2);
const companyColor = name => {
  const colors = ['','gold','blue','coral'];
  const value = String(name || '').split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return colors[value % colors.length];
};
const companyLogo = name => `<span class="company-symbol ${companyColor(name)}" aria-hidden="true">${esc(letters(name))}</span>`;
const badge = status => `<span class="status ${slug(status)}">${esc(status)}</span>`;
const initialsAvatar = (name, color = '') => `<span class="avatar ${color}" aria-hidden="true">${esc(initials(name))}</span>`;
const labelRole = role => ({ student: 'Student', company: 'Company', admin: 'Placement team' }[role] || 'Member');
const emailLink = (email, subject = '') => `mailto:${encodeURIComponent(email || '')}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`;

// Create sample accounts and placement data for the browser-only preview.
// The browser-only preview uses saved demo data when no server is running.
function offlineSeed() {
  const students = [
    ['Aarav Mehta','aarav@northstar.edu','NS2024001','Computer Science',6,8.7,'Python, React, SQL, Data Structures','9876501201','Smart campus navigation app'],
    ['Ananya Rao','ananya@northstar.edu','NS2024002','Information Technology',6,9.1,'Java, SQL, Cloud, Problem Solving','9876501202','Cloud based attendance platform'],
    ['Ishaan Verma','ishaan@northstar.edu','NS2024003','Electronics',6,7.8,'C++, IoT, Python, Embedded Systems','9876501203','IoT energy monitor'],
    ['Riya Kapoor','riya@northstar.edu','NS2024004','Computer Science',6,8.2,'JavaScript, React, Node, UX','9876501204','Accessible student marketplace'],
    ['Kabir Nair','kabir@northstar.edu','NS2024005','Mechanical',6,7.4,'CAD, Python, Manufacturing, Excel','9876501205','Low cost solar dryer'],
    ['Meera Iyer','meera@northstar.edu','NS2024006','Information Technology',6,8.9,'Python, SQL, Machine Learning, Tableau','9876501206','Retail demand forecasting'],
    ['Vihaan Shah','vihaan@northstar.edu','NS2024007','Electrical',6,7.1,'C, MATLAB, Power Systems','9876501207','Smart grid fault detector'],
    ['Sara Thomas','sara@northstar.edu','NS2024008','Computer Science',6,9.3,'Python, Machine Learning, NLP, SQL','9876501208','Multilingual campus assistant']
  ].map((row, i) => ({ student_id:i+1,user_id:i+2,name:row[0],email:row[1],roll_number:row[2],branch:row[3],semester:row[4],cgpa:row[5],skills:row[6],phone:row[7],projects:row[8],resume:null,status:'active' }));
  const companies = [
    ['Nimbus Labs','hr@nimbus.io','Priya Desai','Bengaluru','https://nimbus.example','SaaS'],
    ['Cedar Analytics','talent@cedar.example','Dev Malhotra','Pune','https://cedar.example','Data & AI'],
    ['Copperleaf Systems','careers@copperleaf.example','Neha Shah','Mumbai','https://copperleaf.example','Fintech'],
    ['Bluepeak Health','people@bluepeak.example','Karan Bose','Hyderabad','https://bluepeak.example','Healthcare']
  ].map((row,i)=>({company_id:i+1,user_id:i+10,company_name:row[0],hr_email:row[1],hr_name:row[2],location:row[3],website:row[4],industry:row[5],email:row[1],status:'active'}));
  const jobs = [
    [1,'Graduate Software Engineer','Build product features used by teams across the world. Join a small, collaborative engineering group and ship from your first month.','₹12–16 LPA',7.5,'2026-11-05','Computer Science, Information Technology','Python, React, SQL','Bengaluru · Hybrid',8],
    [2,'Data Analyst Associate','Turn complex datasets into clear decisions for high-growth customers. You\'ll partner with product and strategy teams.','₹9–12 LPA',7,'2026-11-12','All branches','SQL, Python, Tableau','Pune · Hybrid',5],
    [3,'Product Engineering Intern','Work with designers and engineers to make everyday financial tools simpler and more accessible.','₹45k / month',7.5,'2026-11-18','Computer Science, Information Technology','JavaScript, React','Mumbai · On-site',4],
    [4,'Junior Data Scientist','Help care teams make better decisions using practical, responsible machine learning.','₹10–14 LPA',8,'2026-11-21','Computer Science, Information Technology, Electronics','Python, Machine Learning','Hyderabad · Hybrid',3],
    [1,'Platform Engineering Intern','Learn cloud infrastructure and reliability by improving the platform behind Nimbus products.','₹50k / month',8,'2026-11-25','Computer Science, Information Technology','Cloud, Python','Bengaluru · Hybrid',3],
    [3,'Business Operations Associate','Help a fast-moving fintech team turn customer insights into better operations.','₹8–10 LPA',7,'2026-12-01','All branches','Excel, Communication','Mumbai · Hybrid',6]
  ].map((row,i)=>({job_id:i+1,company_id:row[0],title:row[1],description:row[2],salary:row[3],min_cgpa:row[4],deadline:row[5],branches:row[6],required_skills:row[7],location:row[8],openings:row[9],status:'approved',applicant_count:0}));
  const applications = [[1,1,'Shortlisted'],[2,1,'Under Review'],[2,2,'Selected'],[3,4,'Applied'],[4,8,'Shortlisted'],[5,6,'Applied'],[6,5,'Under Review'],[1,4,'Applied']]
    .map((row,i)=>({application_id:i+1,job_id:row[0],student_id:row[1],status:row[2],applied_date:new Date(Date.now()-i*86400000).toISOString().slice(0,10)}));
  return { users:[{id:1,name:'Placement Office',email:'admin@smartplacement.edu',role:'admin',status:'active'},
    ...students.map(s=>({id:s.user_id,name:s.name,email:s.email,role:'student',status:s.status})),
    ...companies.map(c=>({id:c.user_id,name:`${c.company_name} HR`,email:c.email,role:'company',status:c.status}))],
    students,companies,jobs,applications,team_messages:[],direct_messages:[] };
}

// Find demo contacts that are linked through placement activity.
function offlineMessageContacts(user, db) {
  let userIds = [];
  if (user.role === 'admin') userIds = db.users.filter(item => item.status === 'active' && item.role !== 'admin').map(item => item.id);
  else {
    userIds = db.users.filter(item => item.role === 'admin' && item.status === 'active').map(item => item.id);
    if (user.role === 'student') {
      const student = db.students.find(item => item.user_id === user.id);
      const jobIds = new Set(db.applications.filter(item => item.student_id === student?.student_id).map(item => item.job_id));
      const companyIds = new Set(db.jobs.filter(item => jobIds.has(item.job_id)).map(item => item.company_id));
      userIds.push(...db.companies.filter(item => companyIds.has(item.company_id)).map(item => item.user_id));
    } else if (user.role === 'company') {
      const company = db.companies.find(item => item.user_id === user.id);
      const jobIds = new Set(db.jobs.filter(item => item.company_id === company?.company_id).map(item => item.job_id));
      const studentIds = new Set(db.applications.filter(item => jobIds.has(item.job_id)).map(item => item.student_id));
      userIds.push(...db.students.filter(item => studentIds.has(item.student_id)).map(item => item.user_id));
    }
  }
  return [...new Set(userIds)].map(id => {
    const member = db.users.find(item => item.id === id && item.status === 'active');
    if (!member) return null;
    const company = db.companies.find(item => item.user_id === member.id);
    return {id:member.id,name:member.name,email:member.email,role:member.role,company_name:company?.company_name};
  }).filter(Boolean);
}

// Load saved demo data or create a fresh sample set.
function offlineDB() {
  try {
    const saved = localStorage.getItem(OFFLINE_DB_KEY);
    if (saved) {
      const data = JSON.parse(saved);
      if (!Array.isArray(data.team_messages)) data.team_messages = [];
      if (!Array.isArray(data.direct_messages)) data.direct_messages = [];
      return data;
    }
  } catch { /* Use the in-memory demo if browser storage is unavailable. */ }
  const data = offlineSeed();
  offlineSave(data);
  return data;
}

// Keep browser-preview changes in local storage.
function offlineSave(data) {
  try { localStorage.setItem(OFFLINE_DB_KEY, JSON.stringify(data)); } catch { /* Browsing still works without persistence. */ }
}

// Restore the signed-in demo account from browser storage.
function offlineCurrentUser(db = offlineDB()) {
  let id = null;
  try { id = Number(localStorage.getItem(OFFLINE_SESSION_KEY)); } catch { /* no persistent browser storage */ }
  return db.users.find(user => user.id === id && user.status === 'active') || null;
}

// Build demo dashboard data for the signed-in role.
function offlineDashboard(user, db = offlineDB()) {
  if (user.role === 'student') {
    const profile = db.students.find(row => row.user_id === user.id);
    const applications = db.applications.filter(row => row.student_id === profile.student_id).map(row => {
      const job = db.jobs.find(item => item.job_id === row.job_id); const company = db.companies.find(item => item.company_id === job.company_id);
      return {...row,title:job.title,salary:job.salary,deadline:job.deadline,location:job.location,company_name:company.company_name,hr_name:company.hr_name,contact_email:company.hr_email};
    }).sort((a,b)=>String(b.applied_date).localeCompare(String(a.applied_date)));
    const applied = new Set(applications.map(row => row.job_id));
  const jobs = db.jobs.filter(row=>row.status==='approved').map(row=>{
      const company=db.companies.find(item=>item.company_id===row.company_id);
      const branchList=row.branches.toLowerCase().split(',').map(x=>x.trim());
      const eligible=(branchList.includes('all branches')||branchList.includes(profile.branch.toLowerCase()))&&Number(profile.cgpa)>=Number(row.min_cgpa);
      return {...row,company_name:company.company_name,company_location:company.location,hr_name:company.hr_name,contact_email:company.hr_email,eligible,applied:applied.has(row.job_id),days_left:Math.floor((new Date(`${row.deadline}T12:00:00`)-new Date())/86400000),skill_matches:row.required_skills.split(',').filter(skill=>profile.skills.toLowerCase().includes(skill.trim().toLowerCase())).length};
    });
    return {profile,jobs,applications};
  }
  if (user.role === 'company') {
    const company=db.companies.find(row=>row.user_id===user.id);
    const jobs=db.jobs.filter(row=>row.company_id===company.company_id).map(row=>({...row,applicant_count:db.applications.filter(a=>a.job_id===row.job_id).length}));
    const applicants=db.applications.filter(a=>jobs.some(j=>j.job_id===a.job_id)).map(row=>{
      const student=db.students.find(item=>item.student_id===row.student_id); const studentUser=db.users.find(item=>item.id===student.user_id); const job=db.jobs.find(item=>item.job_id===row.job_id);
      return {...row,student_id:student.student_id,roll_number:student.roll_number,branch:student.branch,semester:student.semester,cgpa:student.cgpa,skills:student.skills,resume:student.resume,student_name:studentUser.name,email:studentUser.email,title:job.title};
    }).sort((a,b)=>String(b.applied_date).localeCompare(String(a.applied_date)));
    return {company,jobs,applicants};
  }
  const students=db.students.map(s=>({...s,user_id:s.user_id,name:db.users.find(u=>u.id===s.user_id).name,email:db.users.find(u=>u.id===s.user_id).email,status:db.users.find(u=>u.id===s.user_id).status}));
  const companies=db.companies.map(c=>({...c,account_name:db.users.find(u=>u.id===c.user_id).name,status:db.users.find(u=>u.id===c.user_id).status}));
  const jobs=db.jobs.map(j=>({...j,company_name:db.companies.find(c=>c.company_id===j.company_id).company_name,applicant_count:db.applications.filter(a=>a.job_id===j.job_id).length}));
  const applications=db.applications.map(a=>{const student=db.students.find(s=>s.student_id===a.student_id);const job=db.jobs.find(j=>j.job_id===a.job_id);return {...a,student_name:db.users.find(u=>u.id===student.user_id).name,roll_number:student.roll_number,branch:student.branch,cgpa:student.cgpa,title:job.title,company_name:db.companies.find(c=>c.company_id===job.company_id).company_name};});
  const branch_counts=Object.entries(students.reduce((counts,s)=>{counts[s.branch]=(counts[s.branch]||0)+1;return counts;},{})).map(([branch,count])=>({branch,count})).sort((a,b)=>b.count-a.count);
  const placed=new Set(db.applications.filter(a=>a.status==='Selected').map(a=>a.student_id)).size;
  return {students,companies,jobs,applications,team_messages:db.team_messages||[],branch_counts,metrics:{students:students.length,companies:companies.length,drives:jobs.filter(j=>j.status==='approved').length,applications:applications.length,placed,placement_rate:students.length?Math.round(placed/students.length*100):0}};
}

// Handle supported actions when the Python server is not running.
// This preview follows the same API paths as the real server for basic demos.
async function offlineRequest(path, options = {}) {
  const method=(options.method||'GET').toUpperCase(); const db=offlineDB();
  const payload=options.body instanceof FormData ? options.body : (typeof options.body==='string' ? JSON.parse(options.body||'{}') : options.body||{});
  const fail=(message)=>{throw new Error(message);};
  if(path==='/api/me') return {user:offlineCurrentUser(db)};
  if(path==='/api/dashboard') { const user=offlineCurrentUser(db); if(!user) fail('Please log in to continue.'); return offlineDashboard(user,db); }
  if(path==='/api/login'&&method==='POST') {
    const accounts={'aarav@northstar.edu':'Student123!','hr@nimbus.io':'Company123!','admin@smartplacement.edu':'Admin123!'};
    const email=String(payload.email||'').toLowerCase().trim(); const user=db.users.find(row=>row.email.toLowerCase()===email);
    if(!user||accounts[email]!==payload.password) fail("This browser preview supports the built-in demo accounts only. Run the Python server to save and log in to a new account.");
    if(payload.role&&payload.role!==user.role) fail(`This account belongs to the ${user.role} portal. Choose that role and try again.`);
    if(user.status!=='active') fail('This account is currently paused. Contact the placement office.');
    try {localStorage.setItem(OFFLINE_SESSION_KEY,String(user.id));} catch {}
    return {user};
  }
  if(path==='/api/register'&&method==='POST') {
    const email=String(payload.email||'').toLowerCase().trim();
    if(db.users.some(row=>row.email.toLowerCase()===email)) fail('An account already exists for that email.');
    const user={id:Math.max(0,...db.users.map(row=>row.id))+1,name:String(payload.name||'New member').trim(),email,role:payload.role,status:'active'};
    db.users.push(user);
    if(user.role==='student') db.students.push({student_id:Math.max(0,...db.students.map(row=>row.student_id))+1,user_id:user.id,roll_number:payload.roll_number||'',branch:payload.branch||'',semester:Number(payload.semester||1),cgpa:Number(payload.cgpa||0),skills:payload.skills||'',phone:payload.phone||'',resume:null,projects:payload.projects||'',status:'active'});
    else db.companies.push({company_id:Math.max(0,...db.companies.map(row=>row.company_id))+1,user_id:user.id,company_name:payload.company_name||user.name,hr_name:user.name,hr_email:user.email,location:payload.location||'',website:payload.website||'',industry:payload.industry||'',phone:payload.phone||'',email:user.email,status:'active'});
    offlineSave(db);try{localStorage.setItem(OFFLINE_SESSION_KEY,String(user.id));}catch{}
    return {user};
  }
  if(path==='/api/logout'&&method==='POST'){try{localStorage.removeItem(OFFLINE_SESSION_KEY);}catch{}return {ok:true};}
  const user=offlineCurrentUser(db);
  if(path==='/api/profile'&&method==='PUT'){
    if(!user||user.role!=='student') fail('Please log in as a student.');
    const row=db.students.find(item=>item.user_id===user.id);Object.assign(row,payload,{semester:Number(payload.semester||1),cgpa:Number(payload.cgpa||0)});offlineSave(db);return {ok:true};
  }
  if(path==='/api/company-profile'&&method==='PUT'){
    if(!user||user.role!=='company')fail('Please log in as a company.');
    const company=db.companies.find(item=>item.user_id===user.id);Object.assign(company,payload,{email:payload.hr_email||company.email});offlineSave(db);return {ok:true};
  }
  if(path==='/api/message-contacts'&&method==='GET'){
    if(!user)fail('Please log in to open messages.');return {contacts:offlineMessageContacts(user,db)};
  }
  if(path.startsWith('/api/messages?with=')&&method==='GET'){
    if(!user)fail('Please log in to open messages.');const recipientId=Number(new URLSearchParams(path.split('?')[1]).get('with'));
    if(!offlineMessageContacts(user,db).some(contact=>contact.id===recipientId))fail('This person is not in your placement contacts.');
    return {messages:(db.direct_messages||[]).filter(item=>(item.sender_user_id===user.id&&item.recipient_user_id===recipientId)||(item.sender_user_id===recipientId&&item.recipient_user_id===user.id)).slice(-250)};
  }
  if(path==='/api/messages'&&method==='POST'){
    if(!user)fail('Please log in to send a message.');const recipientId=Number(payload.recipient_id),message=String(payload.message||'').trim();
    if(!offlineMessageContacts(user,db).some(contact=>contact.id===recipientId))fail('This person is not in your placement contacts.');
    if(!message||message.length>3000)fail('Write a message up to 3,000 characters.');
    const row={message_id:Math.max(0,...(db.direct_messages||[]).map(item=>item.message_id))+1,sender_user_id:user.id,recipient_user_id:recipientId,message,created_at:new Date().toISOString(),sender_name:user.name,sender_role:user.role};
    db.direct_messages=db.direct_messages||[];db.direct_messages.push(row);offlineSave(db);return {message:row};
  }
  if(path==='/api/resume'&&method==='POST'){
    if(!user||user.role!=='student') fail('Please log in as a student.');
    const file=payload.get('resume');if(!file||!file.name) fail('Choose a resume file to upload.');
    if(!/\.(pdf|doc|docx)$/i.test(file.name)) fail('Upload a PDF, DOC, or DOCX resume.');
    const student=db.students.find(item=>item.user_id===user.id);student.resume=file.name;student.ats_score=null;student.ats_report=[];offlineSave(db);return {ok:true,filename:file.name,ats_score:null,ats_report:[]};
  }
  if(path==='/api/contact-team'&&method==='POST'){
    if(!user)fail('Please log in to contact the placement team.');
    const subject=String(payload.subject||'').trim(),message=String(payload.message||'').trim();
    if(subject.length<3||subject.length>140)fail('Add a subject between 3 and 140 characters.');
    if(message.length<10||message.length>5000)fail('Write a message between 10 and 5,000 characters.');
    const row={message_id:Math.max(0,...(db.team_messages||[]).map(item=>item.message_id))+1,sender_name:user.name,sender_email:user.email,sender_role:user.role,subject,message,mail_status:'saved',created_at:new Date().toISOString()};
    db.team_messages=db.team_messages||[];db.team_messages.unshift(row);offlineSave(db);return {ok:true,email_sent:false,delivery_status:'saved',message_id:row.message_id};
  }
  if(path==='/api/jobs'&&method==='POST'){
    if(!user||user.role!=='company') fail('Please log in as a company.');
    const company=db.companies.find(item=>item.user_id===user.id);const job={job_id:Math.max(0,...db.jobs.map(j=>j.job_id))+1,company_id:company.company_id,...payload,status:'pending',applicant_count:0};
    db.jobs.push(job);offlineSave(db);return {ok:true};
  }
  const applyMatch=path.match(/^\/api\/jobs\/(\d+)\/apply$/);
  if(applyMatch&&method==='POST'){
    if(!user||user.role!=='student')fail('Please log in as a student.');const student=db.students.find(s=>s.user_id===user.id);const job=db.jobs.find(j=>j.job_id===Number(applyMatch[1])&&j.status==='approved');
    if(!job)fail('That drive is no longer open.');const branches=job.branches.toLowerCase().split(',').map(x=>x.trim());if(Number(student.cgpa)<Number(job.min_cgpa)||(!branches.includes('all branches')&&!branches.includes(student.branch.toLowerCase())))fail("Your branch or CGPA does not meet this drive's eligibility criteria.");
    if(db.applications.some(a=>a.student_id===student.student_id&&a.job_id===job.job_id))fail("You've already applied to this drive.");
    db.applications.unshift({application_id:Math.max(0,...db.applications.map(a=>a.application_id))+1,job_id:job.job_id,student_id:student.student_id,status:'Applied',applied_date:new Date().toISOString().slice(0,10)});offlineSave(db);return {ok:true};
  }
  const jobMatch=path.match(/^\/api\/jobs\/(\d+)$/);
  if(jobMatch&&method==='PATCH'){
    if(!user||!['admin','company'].includes(user.role))fail('You do not have access to that area.');const job=db.jobs.find(row=>row.job_id===Number(jobMatch[1]));if(!job)fail('Drive not found.');
    if(user.role==='company'&&db.companies.find(c=>c.user_id===user.id)?.company_id!==job.company_id)fail('You can only update your own drives.');job.status=payload.status;offlineSave(db);return {ok:true};
  }
  const appMatch=path.match(/^\/api\/applications\/(\d+)$/);
  if(appMatch&&method==='PATCH'){
    if(!user||!['admin','company'].includes(user.role))fail('You do not have access to that area.');const application=db.applications.find(a=>a.application_id===Number(appMatch[1]));if(!application)fail('Application not found.');const job=db.jobs.find(j=>j.job_id===application.job_id);
    if(user.role==='company'&&db.companies.find(c=>c.user_id===user.id)?.company_id!==job.company_id)fail('You can only update applicants to your drives.');application.status=payload.status;offlineSave(db);return {ok:true};
  }
  const userMatch=path.match(/^\/api\/users\/(\d+)\/status$/);
  if(userMatch&&method==='PATCH'){
    if(!user||user.role!=='admin')fail('You do not have access to that area.');const target=db.users.find(row=>row.id===Number(userMatch[1]));if(!target||target.role==='admin')fail('That account cannot be changed here.');target.status=payload.status;offlineSave(db);return {ok:true};
  }
  fail('Page not found.');
}

// Send an API request to the server or use the browser preview.
async function request(path, options = {}) {
  if (state.offlineDemo) return offlineRequest(path, options);
  const headers = { ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...(options.headers || {}) };
  let response;
  try { response = await fetch(path, { credentials: 'same-origin', ...options, headers }); }
  catch (error) { if (!state.apiReady) { state.offlineDemo = true; return offlineRequest(path, options); } throw error; }
  if (path.startsWith('/api/') && !response.headers.get('content-type')?.includes('application/json')) {
    if (!state.apiReady) { state.offlineDemo = true; return offlineRequest(path, options); }
    throw new Error('The placement server returned an unexpected page. Refresh and try again.');
  }
  const result = response.headers.get('content-type')?.includes('application/json') ? await response.json() : {};
  if (path.startsWith('/api/') && response.headers.get('content-type')?.includes('application/json')) state.apiReady = true;
  if (!response.ok) throw new Error(result.error || 'Something went wrong. Please try again.');
  return result;
}

// Show a short success or error message on the page.
function toast(message, isError = false) {
  const region = document.querySelector('#toast-region');
  const item = document.createElement('div');
  item.className = `toast${isError ? ' error' : ''}`;
  item.innerHTML = `<span>${isError ? '!' : '✓'}</span><span>${esc(message)}</span>`;
  region.append(item);
  setTimeout(() => item.remove(), 3600);
}

// Reload account and dashboard information from the server.
async function refresh() {
  if (!state.user) return;
  state.data = await request('/api/dashboard');
  render();
}

// Show a helpful message when a list has no items.
function emptyState(icon, title, copy, action = '') {
  return `<div class="empty-state"><span class="empty-icon">${icon}</span><h3>${esc(title)}</h3><p>${esc(copy)}</p>${action ? `<div style="margin-top:15px">${action}</div>` : ''}</div>`;
}

// Build one of the summary number cards.
function statCard(icon, label, value, note, color = '') {
  return `<article class="stat-card ${color}"><div class="stat-head"><span>${esc(label)}</span><span class="stat-icon">${icon}</span></div><div class="stat-number">${esc(value)}</div><div class="stat-note">${esc(note)}</div></article>`;
}

// Choose the landing page or the signed-in dashboard.
function render() {
  if (!state.user) {
    app.innerHTML = state.authMode === 'closed' ? landing() : landing();
    if (state.authMode !== 'closed') renderAuthModal();
    observePageContent();
    return;
  }
  if (!state.data) {
    app.innerHTML = `<div class="loading-state"><div><div class="spinner"></div><p style="margin-top:12px;font-size:11px">Loading your placement space…</p></div></div>`;
    return;
  }
  app.innerHTML = dashboardShell();
  if (state.user.role === 'admin') startAdminPolling(); else stopAdminPolling();
  if (state.view === 'messages') {
    startMessagePolling();
    if (!state.messageContactsLoaded && !state.messageLoading) loadMessageContacts();
  } else stopMessagePolling();
  observePageContent();
}

// Make a small key to compare changing admin data.
function dashboardRevision(data) {
  return JSON.stringify({
    jobs:(data.jobs||[]).map(item=>[item.job_id,item.status,item.applicant_count]),
    students:(data.students||[]).map(item=>[item.user_id,item.status,item.resume,item.ats_score]),
    companies:(data.companies||[]).map(item=>[item.user_id,item.status,item.company_name]),
    applications:(data.applications||[]).map(item=>[item.application_id,item.status]),
    contacts:(data.team_messages||[]).map(item=>item.message_id),metrics:data.metrics
  });
}

// Refresh admin data while approvals are waiting.
function startAdminPolling() {
  if (state.adminPoller) return;
  state.adminDataKey = dashboardRevision(state.data || {});
  state.adminPoller = setInterval(async () => {
    if (!state.user || state.user.role !== 'admin' || document.visibilityState !== 'visible') return;
    if (!['overview','drives','students','companies','applications','contacts'].includes(state.view)) return;
    if (document.activeElement?.matches('input, textarea, select')) return;
    try {
      const data = await request('/api/dashboard');
      const nextKey = dashboardRevision(data);
      if (nextKey !== state.adminDataKey) {
        const previousPending = (state.data?.jobs || []).filter(job=>job.status==='pending').length;
        const nextPending = (data.jobs || []).filter(job=>job.status==='pending').length;
        state.data = data; state.adminDataKey = nextKey; render();
        if (nextPending > previousPending) toast(`${nextPending - previousPending} new drive${nextPending - previousPending === 1 ? '' : 's'} added to the approval queue.`);
      }
    } catch { /* The refresh control remains available if the server is temporarily offline. */ }
  }, 6500);
}

// Stop the admin refresh timer when it is not needed.
function stopAdminPolling() {
  if (state.adminPoller) clearInterval(state.adminPoller);
  state.adminPoller = null;
}

// Animate content when it enters the visible screen.
function observePageContent() {
  const targets = app.querySelectorAll('.panel, .stat-card, .job-card, .contact-card, .template-card, .step, .role-card, .section-heading, .cta-band');
  if (!('IntersectionObserver' in window)) return;
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('scroll-arrive');
        observer.unobserve(entry.target);
      }
    }
  }, { threshold: .08 });
  targets.forEach(item => observer.observe(item));
}

// Build the public homepage and explain the placement portal.
function landing() {
  return `<div class="landing">
    <header class="landing-nav">
      <a class="brand" href="#top"><span class="brand-mark">↗</span><span>CampusPath<small>Placement portal</small></span></a>
      <nav class="nav-links" aria-label="Main navigation"><a href="#how-it-works">How it works</a><a href="#for-everyone">For everyone</a><a href="#about">About</a></nav>
      <div class="nav-actions"><button class="btn btn-icon refresh-button" data-action="refresh-page" title="Refresh page" aria-label="Refresh page">↻</button><button class="btn btn-ghost" data-action="auth-open" data-mode="login">Log in</button><button class="btn btn-primary" data-action="auth-open" data-mode="register">Get started <span>↗</span></button></div>
    </header>
    <main id="top">
      <section class="hero"><div class="hero-grid">
        <div><p class="eyebrow">A clearer path to your first role</p><h1>Your next step <em>starts here.</em></h1>
          <p class="hero-copy">One thoughtful place for students, employers, and placement teams to meet. Find the right opportunity and keep every step moving.</p>
          <div class="hero-buttons"><button class="btn btn-mint" data-action="auth-open" data-mode="register">Explore opportunities <span>→</span></button><button class="btn btn-white" data-action="auth-open" data-mode="login">Sign in to CampusPath</button></div>
          <p class="hero-note">Built for campus hiring <span>✳</span> Made for the people behind every placement</p>
        </div>
        <div class="hero-art" aria-hidden="true"><div class="art-orb orb-one"></div><div class="art-orb orb-two"></div><div class="art-orb orb-three"></div><div class="orbit"></div>
          <div class="placement-card"><div class="placement-top"><span>Your placement journey</span><span>ON TRACK</span></div><div class="placement-score"><div class="score-ring"><span>78%</span></div><div><strong>Profile strength</strong><small>A little more, and you're ready to go</small></div></div><div class="placement-line"><i>✓</i> Profile added <b>Complete</b></div><div class="placement-line"><i>✓</i> Resume uploaded <b>Complete</b></div><div class="placement-line"><i>↗</i> Find your first drive <b>Next up</b></div></div>
          <div class="floating-note"><span class="note-icon">✦</span><span><strong>A great match is waiting</strong><small>New roles, picked for your profile</small></span></div><div class="hero-dots"></div>
        </div>
      </div></section>
      <div class="trust-row"><span>Made for campus careers</span><strong>Student-first</strong><strong>Employer-ready</strong><strong>Placement-led</strong></div>
      <section class="section" id="for-everyone"><div class="section-heading"><span class="section-kicker">One connected campus</span><h2>Everyone moves forward, together.</h2><p>Clear tools for the people who make every placement happen.</p></div>
        <div class="role-cards">
          <article class="role-card"><span class="role-icon">↗</span><h3>For students</h3><p>Build your profile, find drives that fit, apply with confidence, and follow every update in one place.</p><button class="text-btn" data-action="auth-role" data-role="student" data-mode="register">Find your next step →</button></article>
          <article class="role-card"><span class="role-icon">◈</span><h3>For companies</h3><p>Share a role, discover promising candidates, and keep your campus hiring organized from day one.</p><button class="text-btn" data-action="auth-role" data-role="company" data-mode="register">Meet your next hire →</button></article>
          <article class="role-card"><span class="role-icon">⌘</span><h3>For placement teams</h3><p>Bring student records, company drives, and application progress into a clear, useful overview.</p><button class="text-btn" data-action="auth-open" data-mode="login" data-role="admin">See the big picture →</button></article>
        </div>
      </section>
      <section class="how-section" id="how-it-works"><div class="section how-inner"><div class="section-heading"><span class="section-kicker">A simpler journey</span><h2>From first hello to first day.</h2><p>Everything stays in sync, so nobody has to guess what happens next.</p></div>
        <div class="steps"><article class="step"><span class="step-num">01 — PREPARE</span><h3>Set up your space</h3><p>Students build a profile, companies create an account, and the placement team keeps things moving.</p></article><article class="step"><span class="step-num">02 — DISCOVER</span><h3>Find the right fit</h3><p>Explore approved drives with clear criteria, role details, deadlines, and openings.</p></article><article class="step"><span class="step-num">03 — CONNECT</span><h3>Make the match</h3><p>Students apply. Employers review candidates and share progress as it happens.</p></article><article class="step"><span class="step-num">04 — MOVE AHEAD</span><h3>See what's next</h3><p>Track every application update from one place, with a clear view of your next step.</p></article></div>
        <div class="cta-band" id="about"><div><h2>Ready to find your next step?</h2><p>Create an account and make your next move a little clearer.</p></div><button class="btn btn-mint" data-action="auth-open" data-mode="register">Join CampusPath <span>→</span></button></div>
      </section>
    </main>
    <footer class="footer"><a class="brand" href="#top"><span class="brand-mark">↗</span><span>CampusPath</span></a><span>© ${new Date().getFullYear()} CampusPath · Built for what's next.</span><div class="footer-links"><a href="#about">About</a><a href="#top">Back to top ↑</a></div></footer>
  </div>`;
}

// Build the sign-in and registration form.
function renderAuthModal() {
  const login = state.authMode === 'login';
  const role = state.authRole;
  const roleName = labelRole(role);
  const registrationFields = role === 'student'
    ? `<div class="signup-profile-grid"><div class="field"><label>Roll number</label><input name="roll_number" maxlength="40" placeholder="e.g. NS2027001" /></div><div class="field"><label>Branch</label><select name="branch"><option value="">Choose branch</option>${['Computer Science','Information Technology','Electronics','Electrical','Mechanical','Civil','Chemical','Other'].map(item=>`<option>${item}</option>`).join('')}</select></div><div class="field"><label>Semester</label><select name="semester">${Array.from({length:12},(_,i)=>i+1).map(item=>`<option value="${item}" ${item===1?'selected':''}>Semester ${item}</option>`).join('')}</select></div><div class="field"><label>CGPA (out of 10)</label><input name="cgpa" type="number" min="0" max="10" step="0.01" placeholder="e.g. 8.4" /></div><div class="field"><label>Phone</label><input name="phone" type="tel" placeholder="Your phone number" /></div><div class="field"><label>Skills</label><input name="skills" placeholder="Python, SQL, design…" /></div><div class="field full"><label>Projects or experience</label><textarea name="projects" placeholder="A short note about a project, internship, or achievement"></textarea></div></div>`
    : `<div class="signup-profile-grid"><div class="field"><label>Website</label><input name="website" type="url" placeholder="https://company.example" /></div><div class="field"><label>Location</label><input name="location" placeholder="City · Work style" /></div><div class="field"><label>Industry</label><input name="industry" placeholder="Software, finance, healthcare…" /></div><div class="field"><label>HR phone</label><input name="phone" type="tel" placeholder="Hiring contact number" /></div></div>`;
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.setAttribute('data-action', 'backdrop-close');
  modal.innerHTML = `<section class="modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
    <button class="modal-close" data-action="auth-close" aria-label="Close">×</button>
    <a class="brand modal-brand" href="#top"><span class="brand-mark">↗</span><span>CampusPath</span></a>
    <p class="section-kicker">${login ? 'WELCOME BACK' : 'YOUR NEXT STEP STARTS HERE'}</p><h2 id="auth-title">${login ? 'Sign in to your space.' : 'Let’s get you started.'}</h2>
    <p class="modal-intro">${login ? 'Pick up where you left off, and see what’s next.' : 'Create your account to connect with your campus placement community.'}</p>
    <div class="auth-tabs"><button class="auth-tab ${login ? 'active' : ''}" data-action="auth-mode" data-mode="login">Log in</button><button class="auth-tab ${!login ? 'active' : ''}" data-action="auth-mode" data-mode="register">Create account</button></div>
    <div class="role-pills">${['student','company',...(login ? ['admin'] : [])].map(item => `<button class="role-pill ${item === role ? 'active' : ''}" data-action="auth-role" data-mode="${state.authMode}" data-role="${item}">${labelRole(item)}</button>`).join('')}</div>
    <form data-form="auth" novalidate>${!login ? (`<div class="field"><label for="auth-name">${role === 'company' ? 'Hiring contact name' : 'Full name'}</label><input id="auth-name" name="name" autocomplete="name" placeholder="e.g. Aarav Mehta" required /></div>` + (role === 'company' ? `<div class="field"><label for="company-name">Company name</label><input id="company-name" name="company_name" placeholder="e.g. Nimbus Labs" required /></div>` : '') + registrationFields) : ''}
      <div class="field"><label for="auth-email">Email address</label><input id="auth-email" name="email" type="email" autocomplete="username" placeholder="you@example.com" required /></div>
      <div class="field"><label for="auth-password">Password</label><input id="auth-password" name="password" type="password" autocomplete="${login ? 'current-password' : 'new-password'}" placeholder="${login ? 'Your password' : 'At least 8 characters'}" required minlength="8" /></div>
      <div class="auth-error"></div><button class="btn btn-primary form-submit" type="submit">${login ? 'Continue to my dashboard' : 'Create my account'} <span>→</span></button>
    </form>
    ${login ? `<p class="modal-foot">Demo sign-in: <button class="text-btn" data-action="demo-login" data-demo="student">Student</button> · <button class="text-btn" data-action="demo-login" data-demo="company">Company</button> · <button class="text-btn" data-action="demo-login" data-demo="admin">Admin</button></p>` : `<p class="modal-foot">By continuing, you agree to use this campus demo responsibly.</p>`}
  </section>`;
  app.append(modal);
}

// Each role gets its own dashboard menu.
const views = {
  student: [
    ['overview', 'Overview', '⌂'], ['drives', 'Find drives', '◈'], ['applications', 'My applications', '▤'], ['profile', 'My profile', '◉'], ['contacts', 'Contacts', '✉'], ['messages', 'Messages', '✧']
  ],
  company: [
    ['overview', 'Overview', '⌂'], ['drives', 'My drives', '◈'], ['applicants', 'Applicants', '♙'], ['profile', 'Company profile', '◉'], ['contacts', 'Contacts', '✉'], ['messages', 'Messages', '✧']
  ],
  admin: [
    ['overview', 'Overview', '⌂'], ['students', 'Students', '♙'], ['companies', 'Companies', '◈'], ['drives', 'Job drives', '▤'], ['applications', 'Applications', '↗'], ['contacts', 'Team inbox', '✉'], ['messages', 'Messages', '✧']
  ]
};

// Build the shared dashboard navigation and page frame.
function dashboardShell() {
  const role = state.user.role;
  const view = views[role].some(item => item[0] === state.view) ? state.view : 'overview';
  state.view = view;
  const active = views[role].find(item => item[0] === view);
  const color = role === 'company' ? 'coral' : role === 'admin' ? 'blue' : '';
  const pendingDrives = role === 'admin' ? state.data.jobs.filter(job => job.status === 'pending').length : 0;
  return `<div class="dashboard-shell"><aside class="sidebar">
      <a class="brand" href="#" data-action="go-home"><span class="brand-mark">↗</span><span>CampusPath<small>Placement portal</small></span></a>
      <p class="sidebar-label">Workspace</p><nav aria-label="Workspace navigation">${views[role].map(([key, label, icon]) => `<button class="side-link ${key === view ? 'active' : ''}" data-action="navigate" data-view="${key}"><span class="side-icon">${icon}</span>${label}${role === 'admin' && key === 'drives' && pendingDrives ? `<span class="nav-count">${pendingDrives}</span>` : ''}</button>`).join('')}</nav>
      <div class="side-bottom"><div class="help-card"><strong>Need a hand?</strong><p>Your placement office is here to help with your next move.</p><button class="text-btn" data-action="help">Get in touch →</button></div>
        <div class="side-user">${initialsAvatar(state.user.name, color)}<div class="user-meta"><strong>${esc(state.user.name)}</strong><small>${esc(labelRole(role))}</small></div><button class="text-btn" data-action="logout" aria-label="Log out" title="Log out">↗</button></div>
      </div></aside>
      <div class="main-area"><header class="topbar"><div class="topbar-left"><div><span class="crumb">CampusPath&nbsp; / &nbsp;${esc(labelRole(role))}&nbsp; / &nbsp;</span><h1>${esc(active[1])}</h1></div></div><div class="topbar-right">${state.offlineDemo ? '<span class="demo-live-flag">Browser demo · not shared</span>' : ''}<span class="today-pill">${dateText()}</span><button class="btn btn-icon refresh-button" data-action="refresh-page" title="Refresh page" aria-label="Refresh page">↻</button><button class="btn btn-icon" data-action="notifications" title="Notifications" aria-label="Notifications">♧</button>${initialsAvatar(state.user.name, color)}</div></header>
        <main class="main-content">${role === 'student' ? renderStudentView(view) : role === 'company' ? renderCompanyView(view) : renderAdminView(view)}</main>
      </div></div>`;
}

// Estimate how much of a student profile is complete.
function profilePercent(profile) {
  const fields = [profile?.roll_number, profile?.branch, profile?.semester > 1, profile?.cgpa > 0, profile?.skills, profile?.phone, profile?.resume];
  return Math.round(fields.filter(Boolean).length / fields.length * 100);
}

// Build student placement summary cards.
function studentStats() {
  const d = state.data;
  const p = d.profile;
  const eligible = d.jobs.filter(job => job.eligible && !job.applied && job.days_left >= 0).length;
  const selected = d.applications.filter(app => app.status === 'Selected').length;
  return `<div class="stat-grid">${statCard('◉', 'Profile strength', `${profilePercent(p)}%`, p?.resume ? 'You’re ready to apply' : 'Add a resume to stand out')}${statCard('◈', 'Eligible drives', eligible, 'Based on your branch and CGPA')}${statCard('▤', 'Applications', d.applications.length, 'Your applications in progress')}${statCard('✦', 'Offers', selected, selected ? 'Congratulations — selected!' : 'Your next opportunity is ahead')}</div>`;
}

// Build the student dashboard overview.
function studentOverview() {
  const d = state.data;
  const p = d.profile;
  const recent = d.jobs.filter(job => job.eligible && !job.applied && job.days_left >= 0).slice(0, 3);
  const progress = profilePercent(p);
  const apps = d.applications.slice(0, 4);
  return `<div class="welcome"><div><h2>Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, ${esc(state.user.name.split(' ')[0])} <span>✳</span></h2><p>Your next opportunity is closer than you think. Here's your campus snapshot.</p></div><div class="welcome-actions"><button class="btn btn-primary" data-action="navigate" data-view="drives">Explore drives <span>→</span></button></div></div>
    ${studentStats()}
    <div class="content-grid"><div><section class="panel"><div class="panel-head"><div><h3 class="panel-title">Recommended for you</h3><p class="panel-subtitle">Open drives that match your branch and CGPA</p></div><button class="text-btn" data-action="navigate" data-view="drives">View all →</button></div>
      <div class="drive-stack">${recent.length ? recent.map(job => `<article class="drive-mini">${companyLogo(job.company_name)}<div class="drive-mini-body"><strong>${esc(job.title)}</strong><small>${esc(job.company_name)} · ${esc(job.location || job.company_location)}</small></div><span class="salary">${money(job.salary)}</span></article>`).join('') : emptyState('✦', 'You’re all caught up', 'New drives that match your profile will show up here.', '<button class="btn btn-ghost btn-sm" data-action="navigate" data-view="profile">Review profile</button>')}</div>
    </section><section class="panel"><div class="panel-head"><div><h3 class="panel-title">Recent applications</h3><p class="panel-subtitle">Your latest progress, all in one place</p></div><button class="text-btn" data-action="navigate" data-view="applications">See all →</button></div>${apps.length ? `<div class="drive-stack">${apps.map(item => `<div class="drive-mini">${companyLogo(item.company_name)}<div class="drive-mini-body"><strong>${esc(item.title)}</strong><small>${esc(item.company_name)} · Applied ${fmtDate(item.applied_date?.slice(0, 10))}</small></div>${badge(item.status)}</div>`).join('')}</div>` : emptyState('▤', 'No applications yet', 'Browse open drives and apply when you find a good fit.', '<button class="btn btn-primary btn-sm" data-action="navigate" data-view="drives">Find a drive</button>')}</section></div>
    <div><section class="panel"><div class="panel-head"><div><h3 class="panel-title">A profile that opens doors</h3><p class="panel-subtitle">A few details make a stronger first impression</p></div></div><div class="profile-progress"><div class="progress-bar"><span style="width:${progress}%"></span></div><strong>${progress}%</strong></div>
      <div class="progress-list">${[['Name and email', true], ['Academic details', Boolean(p?.roll_number && p?.branch && p?.cgpa)], ['Skills and projects', Boolean(p?.skills && p?.projects)], ['Resume', Boolean(p?.resume)]].map(([label, done], i) => `<div class="progress-step"><span class="progress-icon ${done ? 'done' : ''}">${done ? '✓' : i + 1}</span><span class="progress-text"><strong>${label}</strong><small>${done ? 'Looking good' : 'Add this to your profile'}</small></span><span>${done ? 'Done' : 'To do'}</span></div>`).join('')}</div><button class="btn btn-ghost btn-sm" style="width:100%;margin-top:17px" data-action="navigate" data-view="profile">Update my profile →</button></section>
      <section class="panel"><div class="panel-head"><div><h3 class="panel-title">Your journey</h3><p class="panel-subtitle">The next steps, at a glance</p></div></div><div class="feed-list"><div class="feed-row"><span class="feed-dot"></span><div><strong>Set up your profile</strong><p>Share your strengths and academic background.</p></div></div><div class="feed-row"><span class="feed-dot"></span><div><strong>Find a drive that fits</strong><p>Check eligibility before you apply.</p></div></div><div class="feed-row"><span class="feed-dot"></span><div><strong>Keep an eye on updates</strong><p>Every status change appears in applications.</p></div></div></div></section></div></div>`;
}

// Build one job card with eligibility and application details.
function jobCard(job) {
  const tags = String(job.required_skills || '').split(',').filter(Boolean).slice(0, 4);
  const eligible = Boolean(job.eligible);
  const applied = Boolean(job.applied);
  const expired = Number(job.days_left) < 0;
  const action = applied ? `<button class="btn btn-ghost btn-sm" disabled>Applied ✓</button>` : eligible && !expired ? `<button class="btn btn-primary btn-sm" data-action="apply" data-id="${job.job_id}">Apply now <span>→</span></button>` : `<button class="btn btn-ghost btn-sm" disabled>${expired ? 'Closed' : 'Not eligible'}</button>`;
  return `<article class="job-card"><div class="job-card-top">${companyLogo(job.company_name)}<div><span class="job-company">${esc(job.company_name)}</span><div style="margin-top:5px">${eligible ? '<span class="status approved">Eligible</span>' : '<span class="status pending">Criteria not met</span>'}</div></div></div><h3>${esc(job.title)}</h3><p>${esc(job.description)}</p><div class="job-meta"><span class="meta-chip">◈ ${money(job.salary)}</span><span class="meta-chip">⌖ ${esc(job.location || job.company_location || 'Location shared later')}</span><span class="meta-chip">Min CGPA ${esc(job.min_cgpa)}</span></div><div class="job-tags">${tags.map(tag => `<span class="tag">${esc(tag.trim())}</span>`).join('')}<span class="tag">${esc(job.openings)} openings</span></div><div class="job-card-foot"><span class="deadline">Apply by ${fmtDate(job.deadline)}</span>${action}</div></article>`;
}

// Show approved jobs a student can browse.
function studentDrives() {
  const jobs = state.data.jobs.filter(job => !state.filter || `${job.title} ${job.company_name} ${job.required_skills}`.toLowerCase().includes(state.filter.toLowerCase()));
  return `<div class="welcome"><div><h2>Find a drive that fits.</h2><p>Explore approved opportunities and check the criteria before you apply.</p></div></div><div class="toolbar"><label class="search-box"><span>⌕</span><input data-action="search-jobs" value="${esc(state.filter)}" placeholder="Search by role, company, or skill…" aria-label="Search drives" /></label><select class="filter-select" data-action="eligible-filter"><option value="all">All drives (${jobs.length})</option><option value="eligible" ${state.eligibleOnly ? 'selected' : ''}>Eligible for me</option></select></div>
    ${jobs.length ? `<div class="job-grid">${jobs.filter(j => !state.eligibleOnly || j.eligible).map(jobCard).join('')}</div>` : emptyState('⌕', 'No drives found', 'Try a different search. New opportunities are added by campus recruiters.')}`;
}

// Show application status rows in a table.
function applicationTable(applications, canEdit = false) {
  if (!applications.length) return emptyState('▤', 'Nothing to show yet', 'When there is an application update, you’ll see it here.');
  return `<div class="table-wrap"><table><thead><tr>${canEdit ? '<th>Student</th><th>Drive</th>' : '<th>Opportunity</th><th>Applied</th>'}<th>Status</th>${canEdit ? '<th>Update</th>' : '<th>Package</th>'}</tr></thead><tbody>${applications.map(item => `<tr>${canEdit ? `<td><div class="table-person">${initialsAvatar(item.student_name)}<span><strong>${esc(item.student_name)}</strong><small>${esc(item.branch)} · ${esc(item.roll_number || 'Profile pending')}</small></span></div></td><td><strong>${esc(item.title)}</strong><small style="display:block;margin-top:4px;color:#96a29c">${esc(item.company_name || '')} · CGPA ${esc(item.cgpa)}</small></td>` : `<td><strong>${esc(item.title)}</strong><small style="display:block;margin-top:4px;color:#96a29c">${esc(item.company_name)}</small></td><td>${fmtDate(item.applied_date?.slice(0,10))}</td>`}<td>${badge(item.status)}</td>${canEdit ? `<td><select class="small-select" data-action="application-status" data-id="${item.application_id}">${['Applied','Under Review','Shortlisted','Interview','Selected','Not Selected'].map(status => `<option ${status === item.status ? 'selected' : ''}>${status}</option>`).join('')}</select></td>` : `<td>${money(item.salary)}</td>`}</tr>`).join('')}</tbody></table></div>`;
}

// Show the signed-in student’s application history.
function studentApplications() {
  const items = state.data.applications;
  const count = items.filter(item => ['Shortlisted','Interview','Selected'].includes(item.status)).length;
  return `<div class="welcome"><div><h2>Your applications, in motion.</h2><p>Every update from a company is collected here, so you always know where things stand.</p></div><div class="welcome-actions"><span class="today-pill">${count} moving forward</span></div></div><section class="panel"><div class="panel-head"><div><h3 class="panel-title">Application tracker</h3><p class="panel-subtitle">${items.length} ${items.length === 1 ? 'application' : 'applications'} · Most recent first</p></div></div>${items.length ? `<div class="table-wrap"><table><thead><tr><th>Opportunity</th><th>Applied on</th><th>Deadline</th><th>Status</th><th>Package</th></tr></thead><tbody>${items.map(item => `<tr><td><strong>${esc(item.title)}</strong><small style="display:block;margin-top:4px;color:#96a29c">${esc(item.company_name)}</small></td><td>${fmtDate(item.applied_date?.slice(0,10))}</td><td>${fmtDate(item.deadline)}</td><td>${badge(item.status)}</td><td>${money(item.salary)}</td></tr>`).join('')}</tbody></table></div>` : emptyState('▤','Your tracker is ready','Apply to a drive and your progress will show up right here.','<button class="btn btn-primary btn-sm" data-action="navigate" data-view="drives">Explore drives →</button>')}</section>
    <div class="content-grid" style="margin-top:16px"><section class="panel"><div class="panel-head"><h3 class="panel-title">What each status means</h3></div><div class="feed-list"><div class="feed-row">${badge('Applied')}<p>Your application is with the company.</p></div><div class="feed-row">${badge('Under Review')}<p>The hiring team is reviewing your details.</p></div><div class="feed-row">${badge('Shortlisted')}<p>The company would like to move you ahead.</p></div><div class="feed-row">${badge('Selected')}<p>Congratulations — the company has selected you.</p></div></div></section><section class="panel"><div class="panel-head"><h3 class="panel-title">Need help with a drive?</h3></div><p style="margin:0;color:#85928c;font-size:10px;line-height:1.7">Your placement team can help with eligibility questions or application details. Reach out through your college's placement office.</p></section></div>`;
}

// Build a form for contacting the placement team.
function teamContactForm() {
  return `<section class="panel contact-form-panel"><div class="panel-head"><div><h3 class="panel-title">Message the placement team</h3><p class="panel-subtitle">Your message is saved in the team inbox and emailed to the placement office when email delivery is configured.</p></div><span class="contact-orb">✉</span></div><form data-form="team-contact"><div class="form-grid"><div class="field full"><label for="team-subject">Subject</label><input id="team-subject" name="subject" required minlength="3" maxlength="140" placeholder="e.g. Question about interview scheduling" /></div><div class="field full"><label for="team-message">How can we help?</label><textarea id="team-message" name="message" required minlength="10" maxlength="5000" placeholder="Share enough detail for the placement team to help you…"></textarea></div></div><div class="contact-form-foot"><small>Reply will go to ${esc(state.user.email)}.</small><button class="btn btn-primary" type="submit">Send to placement team <span>→</span></button></div></form></section>`;
}

// Show student placement contact options.
function studentContacts() {
  const contacts = state.data.applications.filter(item => item.contact_email);
  return `<div class="welcome"><div><h2>Keep your conversations moving.</h2><p>Contact recruiters for drives you’ve applied to, or ask the placement team for help.</p></div><span class="today-pill">${contacts.length} recruiter${contacts.length === 1 ? '' : 's'}</span></div><div class="contact-card-grid">${contacts.length ? contacts.map(item => `<article class="contact-card"><div class="contact-card-top">${companyLogo(item.company_name)}${badge(item.status)}</div><h3>${esc(item.company_name)}</h3><p>${esc(item.title)}</p><small>${esc(item.hr_name || 'Hiring team')} · ${esc(item.contact_email)}</small><a class="btn btn-ghost btn-sm" href="${esc(emailLink(item.contact_email, `Campus placement · ${item.title}`))}">Email recruiter ↗</a></article>`).join('') : `<div class="panel contact-empty">${emptyState('✉','Your recruiter contacts will appear here','Apply to a drive to see its hiring contact and reach out directly.')}</div>`}</div><div class="contact-lower">${teamContactForm()}<aside class="panel contact-tip"><span class="contact-tip-icon">✦</span><h3>Make the first note easy.</h3><p>Include the role title, your name and roll number, then ask one clear question. Keep your resume ready if the recruiter requests it.</p><button class="text-btn" data-action="navigate" data-view="profile">Review your resume →</button></aside></div>`;
}

// Show company placement contact options.
function companyContacts() {
  const students = state.data.applicants;
  return `<div class="welcome"><div><h2>Say hello to your applicants.</h2><p>Reach students who applied to your drives and review their resumes securely.</p></div><span class="today-pill">${students.length} applicant${students.length === 1 ? '' : 's'}</span></div><section class="panel"><div class="panel-head"><div><h3 class="panel-title">Applicant contacts</h3><p class="panel-subtitle">Contact details and resume access are available for students who applied to your company’s drives.</p></div></div>${students.length ? `<div class="table-wrap"><table><thead><tr><th>Student</th><th>Drive</th><th>Application</th><th>Resume</th><th>Contact</th></tr></thead><tbody>${students.map(item => `<tr><td><div class="table-person">${initialsAvatar(item.student_name)}<span><strong>${esc(item.student_name)}</strong><small>${esc(item.branch || 'Branch not set')} · CGPA ${esc(item.cgpa)}</small></span></div></td><td>${esc(item.title)}</td><td>${badge(item.status)}</td><td>${item.resume ? (state.offlineDemo ? '<span class="subtle-label">Demo file name only</span>' : `<a class="text-btn" target="_blank" rel="noreferrer" href="/api/resumes/${item.student_id}">View resume ↗</a>`) : '<span class="subtle-label">Not uploaded</span>'}</td><td><a class="btn btn-ghost btn-sm" href="${esc(emailLink(item.email, `Your application · ${item.title}`))}">Email student ↗</a></td></tr>`).join('')}</tbody></table></div>` : emptyState('♙','No applicants yet','Students who apply to your drives will appear here.')}</section><div class="contact-lower">${teamContactForm()}<aside class="panel contact-tip"><span class="contact-tip-icon">◈</span><h3>Keep candidates in the loop.</h3><p>Use the application status to record each next step, then send a concise email with interview details or feedback.</p><button class="text-btn" data-action="navigate" data-view="applicants">Review applicants →</button></aside></div>`;
}

// Build the company profile details page.
function companyProfile() {
  const c = state.data.company || {};
  return `<div class="welcome"><div><h2>Company profile.</h2><p>Keep your hiring contact and company information current for students and the placement team.</p></div><span class="today-pill">Profile details</span></div><section class="panel company-profile-panel"><div class="panel-head"><div><h3 class="panel-title">Company & hiring contact</h3><p class="panel-subtitle">Updates here appear on your company account and contact details.</p></div>${companyLogo(c.company_name)}</div><form data-form="company-profile"><div class="form-grid"><div class="field"><label>Company name</label><input name="company_name" value="${esc(c.company_name)}" required maxlength="120" /></div><div class="field"><label>Industry</label><input name="industry" value="${esc(c.industry)}" placeholder="Software, finance, healthcare…" /></div><div class="field"><label>Website</label><input name="website" type="url" value="${esc(c.website)}" placeholder="https://company.example" /></div><div class="field"><label>Location</label><input name="location" value="${esc(c.location)}" placeholder="City · Work style" /></div><div class="field"><label>HR contact name</label><input name="hr_name" value="${esc(c.hr_name)}" /></div><div class="field"><label>Hiring contact email</label><input name="hr_email" type="email" value="${esc(c.hr_email || state.user.email)}" required /></div><div class="field"><label>Phone number</label><input name="phone" type="tel" value="${esc(c.phone)}" /></div></div><button class="btn btn-primary" type="submit">Save company profile <span>→</span></button></form></section><div class="content-grid company-profile-notes"><section class="panel"><h3 class="panel-title">Make your profile useful</h3><p>Add a clear website, location, industry, and monitored hiring email. Students can reach you after they apply to one of your approved drives.</p></section><section class="panel"><h3 class="panel-title">Hiring contact privacy</h3><p>Student access is limited to the hiring contact for drives they applied to. The placement team can review all company profiles.</p></section></div>`;
}

// Build one message bubble and its timestamp.
function messageItemMarkup(item) {
  const mine = Number(item.sender_user_id) === Number(state.user.id);
  const when = new Date(item.created_at.replace(' ', 'T') + (item.created_at.endsWith('Z') ? '' : 'Z'));
  const time = Number.isNaN(when.getTime()) ? '' : when.toLocaleString('en-IN', { day:'numeric', month:'short', hour:'numeric', minute:'2-digit' });
  return `<article class="chat-bubble ${mine ? 'mine' : 'theirs'}"><p>${esc(item.message)}</p><small>${mine ? 'You' : esc(item.sender_name || 'Member')} · ${esc(time)}</small></article>`;
}

// Build the live message page for all placement roles.
function messageView() {
  const contacts = state.messageContacts || [];
  const active = contacts.find(item => Number(item.id) === Number(state.activeMessageId));
  return `<div class="welcome messages-welcome"><div><h2>Your placement conversations.</h2><p>Message students, companies, and the placement team through a shared live inbox.</p></div><span class="live-pill"><i></i> Live sync</span></div>${state.offlineDemo ? '<div class="demo-sync-note">Browser demo messages stay in this browser. Run the Python server to share conversations between accounts and devices.</div>' : ''}${state.messageError ? `<div class="demo-sync-note">${esc(state.messageError)} <button class="text-btn" data-action="retry-messages">Try again</button></div>` : ''}<section class="message-layout"><aside class="message-roster"><div class="message-roster-head"><div><strong>People</strong><small>${contacts.length} available conversation${contacts.length === 1 ? '' : 's'}</small></div><span class="roster-spark">✦</span></div><div class="message-contact-list">${!state.messageContactsLoaded ? '<div class="message-loading"><span class="spinner"></span> Loading contacts…</div>' : contacts.length ? contacts.map(item => `<button class="message-contact ${Number(item.id) === Number(state.activeMessageId) ? 'selected' : ''}" data-action="select-message-contact" data-id="${item.id}"><span class="avatar ${item.role === 'company' ? 'coral' : item.role === 'admin' ? 'blue' : ''}">${esc(initials(item.name))}</span><span class="message-contact-meta"><strong>${esc(item.company_name || item.name)}</strong><small>${esc(labelRole(item.role))} · ${esc(item.email)}</small></span><span class="contact-dot"></span></button>`).join('') : emptyState('✧','No conversations yet','After a student applies to a drive, the company and student can message. The placement team is always available.')}</div></aside><div class="message-room">${active ? `<header class="message-room-head"><span class="avatar ${active.role === 'company' ? 'coral' : active.role === 'admin' ? 'blue' : ''}">${esc(initials(active.name))}</span><span><strong>${esc(active.company_name || active.name)}</strong><small>${esc(labelRole(active.role))} · secure placement conversation</small></span><span class="room-live"><i></i> ONLINE</span></header><div class="message-thread" aria-live="polite">${state.messageItems.length ? state.messageItems.map(messageItemMarkup).join('') : `<div class="thread-empty"><span>✧</span><strong>Start a conversation</strong><p>Send a clear, friendly message. Keep personal information relevant to your placement conversation.</p></div>`}</div><form data-form="message-send" class="message-composer"><textarea id="message-draft" name="message" required maxlength="3000" rows="2" placeholder="Write a message…" aria-label="Write a message"></textarea><div class="composer-foot"><small>Up to 3,000 characters · updates live</small><button class="btn btn-primary" type="submit">Send message <span>↗</span></button></div></form>` : `<div class="thread-placeholder"><div class="chat-graphic"><span>✦</span><i></i><b></b></div><h3>${contacts.length ? 'Choose a conversation' : 'Your inbox is ready'}</h3><p>${contacts.length ? 'Select someone from your people list to open the conversation.' : 'Message the placement team or connect after an application is submitted.'}</p><button class="btn btn-ghost btn-sm" data-action="navigate" data-view="contacts">Open contact options</button></div>`}</div></section>`;
}

// Load people this account can message.
async function loadMessageContacts() {
  if (state.messageLoading || state.messageContactsLoaded || state.view !== 'messages') return;
  state.messageLoading = true;
  try {
    const result = await request('/api/message-contacts');
    state.messageContacts = result.contacts || [];
    state.messageContactsLoaded = true;
    state.messageError = '';
    if (!state.messageContacts.some(item => Number(item.id) === Number(state.activeMessageId))) {
      state.activeMessageId = state.messageContacts.length ? Number(state.messageContacts[0].id) : null;
    }
    await loadMessageThread();
    if (state.view === 'messages') render();
  } catch (error) {
    state.messageContactsLoaded = true;
    state.messageError = error.message || 'Could not load contacts.';
    toast(error.message || 'Could not load contacts.', true);
    if (state.view === 'messages') render();
  } finally { state.messageLoading = false; }
}

// Load the selected conversation from the server.
async function loadMessageThread() {
  if (!state.activeMessageId) { state.messageItems = []; return; }
  const result = await request(`/api/messages?with=${encodeURIComponent(state.activeMessageId)}`);
  const next = result.messages || [];
  const before = state.messageItems.map(item => item.message_id).join(',');
  const after = next.map(item => item.message_id).join(',');
  if (before === after) return;
  const thread = app.querySelector('.message-thread');
  const nearBottom = !thread || thread.scrollHeight - thread.scrollTop - thread.clientHeight < 56;
  state.messageItems = next;
  paintMessageThread(nearBottom);
}

// Update the visible conversation messages.
function paintMessageThread(scrollToEnd = false) {
  const thread = app.querySelector('.message-thread');
  if (!thread) return;
  thread.innerHTML = state.messageItems.length ? state.messageItems.map(messageItemMarkup).join('') : `<div class="thread-empty"><span>✧</span><strong>Start a conversation</strong><p>Send a clear, friendly message. Keep personal information relevant to your placement conversation.</p></div>`;
  if (scrollToEnd) thread.scrollTop = thread.scrollHeight;
}

// Check for new messages while a chat is open.
function startMessagePolling() {
  if (state.messagePoller) return;
  state.messagePoller = setInterval(() => {
    if (document.visibilityState === 'visible' && state.view === 'messages' && state.activeMessageId) {
      loadMessageThread().catch(() => {});
    }
  }, 2500);
}

// Stop message checks when leaving the chat page.
function stopMessagePolling() {
  if (state.messagePoller) clearInterval(state.messagePoller);
  state.messagePoller = null;
}

// Show messages sent to the placement team.
function adminContacts() {
  const messages = state.data.team_messages || [];
  return `<div class="welcome"><div><h2>Placement team inbox.</h2><p>Messages from student and company accounts are collected here.</p></div><span class="today-pill">${messages.length} message${messages.length === 1 ? '' : 's'}</span></div><section class="panel"><div class="panel-head"><div><h3 class="panel-title">Recent messages</h3><p class="panel-subtitle">Email delivery status is shown for each message.</p></div></div>${messages.length ? `<div class="team-message-list">${messages.map(item => `<article class="team-message"><div class="team-message-head"><div>${initialsAvatar(item.sender_name, item.sender_role === 'company' ? 'coral' : '')}<span><strong>${esc(item.sender_name)}</strong><small>${esc(labelRole(item.sender_role))} · ${esc(item.sender_email)} · ${esc(item.created_at)}</small></span></div><span class="mail-status ${slug(item.mail_status)}">${item.mail_status === 'sent' ? 'Email sent' : 'Saved in inbox'}</span></div><h4>${esc(item.subject)}</h4><p>${esc(item.message)}</p><a class="btn btn-ghost btn-sm" href="${esc(emailLink(item.sender_email, `Re: ${item.subject}`))}">Reply by email ↗</a></article>`).join('')}</div>` : emptyState('✉','No messages yet','Student and company questions sent through Contacts will show up here.')}</section>`;
}

// Build the student profile and resume upload form.
function studentProfile() {
  const p = state.data.profile || {};
  const completion = profilePercent(p);
  let report = p.ats_report || [];
  if (typeof report === 'string') { try { report = JSON.parse(report); } catch { report = []; } }
  const scoreValue = p.ats_score;
  const parsedScore = scoreValue === null || scoreValue === undefined || scoreValue === '' ? null : Number(scoreValue);
  const score = Number.isFinite(parsedScore) ? parsedScore : null;
  const templates = [
    ['ATS clean · one page', 'YOUR NAME | City | email | phone | LinkedIn\n\nSUMMARY\nComputer science student focused on [target role]. Strong in [2–3 relevant skills], with project experience in [area].\n\nEDUCATION\nDegree, College | Graduation: Month Year | CGPA: X.XX/10\n\nSKILLS\nLanguages: [..] · Tools: [..] · Core: [..]\n\nPROJECTS\nProject name | Tech stack\n• Built [what you made] for [who / problem].\n• Improved [measurable outcome] by [number] using [method].\n\nEXPERIENCE / LEADERSHIP\nRole, Organization | Month Year–Month Year\n• Delivered [result] by [specific action].\n\nCERTIFICATIONS\nRelevant certificate | Issuer, Year'],
    ['Projects first · fresher', 'YOUR NAME | email | phone | LinkedIn | GitHub\n\nEDUCATION\nDegree, College | Graduation year | CGPA\n\nTECHNICAL SKILLS\nLanguages: [..] | Frameworks: [..] | Tools: [..]\n\nSELECTED PROJECTS\nProject | Role | Tech stack\n• Designed and built [feature] to solve [specific problem].\n• Tested with [method]; achieved [honest result / scale].\n\nINTERNSHIPS / EXPERIENCE\nRole, Organization | Dates\n• Automated / analyzed / improved [task] resulting in [measured impact].\n\nCOURSEWORK & CERTIFICATIONS\nRelevant subjects, certificates, hackathons'],
    ['Referral introduction', 'Subject: [Role] application — [Your Name], [College]\n\nHi [Name],\n\nI’m a [year/branch] student at [college] and I’m interested in the [role] at [company]. My recent work on [relevant project] used [matching skills] to [brief result].\n\nWould you be comfortable referring me or sharing one suggestion about the role? I’ve attached my one-page resume and the job link for context.\n\nThank you for your time,\n[Your Name] · [Phone] · [LinkedIn / portfolio]\n\nPersonalize this note and only include accurate claims.']
  ];
  return `<div class="welcome"><div><h2>A little about you.</h2><p>Help employers understand what you bring to the table.</p></div><span class="today-pill">Profile ${completion}% complete</span></div><div class="content-grid"><section class="panel"><div class="panel-head"><div><h3 class="panel-title">Academic & personal details</h3><p class="panel-subtitle">Your information is shared with companies when you apply.</p></div></div><form data-form="profile"><div class="form-grid"><div class="field"><label>Full name</label><input value="${esc(state.user.name)}" disabled /></div><div class="field"><label>Email</label><input value="${esc(state.user.email)}" disabled /></div><div class="field"><label>Roll number</label><input name="roll_number" value="${esc(p.roll_number)}" placeholder="e.g. NS2024001" /></div><div class="field"><label>Branch</label><select name="branch"><option value="">Choose your branch</option>${['Computer Science','Information Technology','Electronics','Electrical','Mechanical','Civil','Chemical','Other'].map(branch => `<option ${p.branch === branch ? 'selected' : ''}>${branch}</option>`).join('')}</select></div><div class="field"><label>Semester</label><select name="semester">${Array.from({length:8},(_,i)=>i+1).map(value => `<option value="${value}" ${Number(p.semester) === value ? 'selected' : ''}>Semester ${value}</option>`).join('')}</select></div><div class="field"><label>CGPA (out of 10)</label><input name="cgpa" type="number" min="0" max="10" step="0.01" value="${esc(p.cgpa)}" placeholder="e.g. 8.4" /></div><div class="field"><label>Phone number</label><input name="phone" value="${esc(p.phone)}" placeholder="Your contact number" /></div><div class="field"><label>Skills <span style="font-weight:400;color:#98a49e">(separate with commas)</span></label><input name="skills" value="${esc(p.skills)}" placeholder="Python, SQL, React" /></div><div class="field full"><label>Projects & experience</label><textarea name="projects" placeholder="Share a project, internship, or achievement…">${esc(p.projects)}</textarea></div></div><button class="btn btn-primary" type="submit">Save my profile <span>→</span></button></form></section>
      <section class="panel"><div class="panel-head"><div><h3 class="panel-title">Your resume</h3><p class="panel-subtitle">PDF, DOC, or DOCX · up to 6 MB</p></div></div><div class="resume-box"><div><strong>${p.resume ? 'Resume on file ✓' : 'Add your resume'}</strong><small>${p.resume ? (state.offlineDemo ? 'File name saved in browser demo; use the Python server to upload and share the file.' : 'Your resume is shared with the placement team and companies you apply to.') : 'Upload a fresh resume to get an ATS-readiness estimate.'}</small></div>${p.resume ? (state.offlineDemo ? '<span style="font-size:20px;color:#85a98e">✓</span>' : `<a class="btn btn-ghost btn-sm" href="/api/resumes/${p.student_id}" target="_blank" rel="noreferrer">View resume ↗</a>`) : '<span style="font-size:20px;color:#85a98e">⇧</span>'}</div><form data-form="resume" style="margin-top:14px"><div class="field"><label for="resume-file">${p.resume ? 'Replace resume' : 'Choose a file'}</label><input class="file-input" id="resume-file" name="resume" type="file" accept=".pdf,.doc,.docx" required /></div><button class="btn btn-ghost btn-sm" type="submit">${p.resume ? 'Upload new version' : 'Upload resume'} ↑</button></form>
      <div class="ats-panel"><div class="ats-score ${score === null ? 'empty' : ''}">${score === null ? '—' : `${score}`}<small>${score === null ? 'ATS' : 'ATS score'}</small></div><div><strong>${score === null ? 'Your resume check is ready' : score >= 75 ? 'Strong ATS readiness' : score >= 50 ? 'Good start — a few improvements can help' : 'Build up the essentials'}</strong><p>${state.offlineDemo ? 'Run the Python server to upload a real file and calculate its score.' : p.resume ? 'An automated estimate based on readable text, structure, contact details, skills, action verbs, and impact metrics.' : 'Upload a PDF, DOC, or DOCX to check its readable text and structure.'}</p></div></div>${score !== null ? `<ul class="ats-feedback">${(Array.isArray(report) ? report : []).map(item => `<li>${esc(item)}</li>`).join('')}</ul>` : ''}
      <div style="margin-top:24px;padding-top:19px;border-top:1px solid #edf1ed"><div class="panel-head"><h3 class="panel-title">Profile visibility</h3>${badge('Active')}</div><p style="margin:0;color:#87948e;font-size:9px;line-height:1.7">Your profile and resume are visible to a company only after you apply to one of its drives.</p></div></section></div>
      <section class="resume-templates"><div class="panel-head"><div><h3 class="panel-title">Resume & referral starters</h3><p class="panel-subtitle">Copy a structure, then replace every bracket with your own accurate details.</p></div><span class="template-spark">✦</span></div><div class="template-grid">${templates.map(([title, content], index) => `<article class="template-card"><span class="template-index">0${index + 1}</span><h4>${esc(title)}</h4><pre>${esc(content.slice(0, 265))}${content.length > 265 ? '…' : ''}</pre><button class="btn btn-ghost btn-sm" data-action="copy-template" data-template="${esc(content)}">Copy template</button></article>`).join('')}</div><p class="template-note">ATS scores are a basic formatting and keyword estimate, not a hiring decision. Referrals are requests for advice or consideration, never guarantees.</p></section>`;
}

// Pick the student page requested in the dashboard.
function renderStudentView(view) {
  if (view === 'drives') return studentDrives();
  if (view === 'applications') return studentApplications();
  if (view === 'profile') return studentProfile();
  if (view === 'contacts') return studentContacts();
  if (view === 'messages') return messageView();
  return studentOverview();
}

// Build company job and applicant summary cards.
function companyStats() {
  const d = state.data;
  const open = d.jobs.filter(job => job.status === 'approved').length;
  const shortlisted = d.applicants.filter(item => ['Shortlisted','Interview'].includes(item.status)).length;
  return `<div class="stat-grid">${statCard('◈', 'Active drives', open, 'Currently visible to students')}${statCard('♙', 'Applicants', d.applicants.length, 'Across your job drives')}${statCard('✦', 'Shortlisted', shortlisted, 'Candidates moving ahead')}${statCard('◷', 'Awaiting review', d.jobs.filter(job => job.status === 'pending').length, 'Drives with the placement team')}</div>`;
}

// Choose the action that matches a job’s approval status.
function driveStatusAction(job) {
  if (job.status === 'approved') return `<button class="btn btn-ghost btn-sm" data-action="drive-status" data-id="${job.job_id}" data-status="closed">Close drive</button>`;
  if (job.status === 'closed') return `<button class="btn btn-ghost btn-sm" disabled>Closed</button>`;
  return `<span class="status ${slug(job.status)}">${esc(job.status)}</span>`;
}

// Show the company’s job drives and approval status.
function companyDriveTable(jobs) {
  if (!jobs.length) return emptyState('◈', 'Your first drive starts here', 'Create a clear job brief and send it to the placement team for approval.', '<button class="btn btn-primary btn-sm" data-action="create-drive">Create a drive →</button>');
  return `<div class="table-wrap"><table><thead><tr><th>Role</th><th>Deadline</th><th>Applicants</th><th>Status</th><th></th></tr></thead><tbody>${jobs.map(job => `<tr><td><strong>${esc(job.title)}</strong><small style="display:block;margin-top:4px;color:#96a29c">${money(job.salary)} · Min CGPA ${esc(job.min_cgpa)}</small></td><td>${fmtDate(job.deadline)}</td><td>${esc(job.applicant_count)}</td><td>${badge(job.status)}</td><td>${driveStatusAction(job)}</td></tr>`).join('')}</tbody></table></div>`;
}

// Build the company dashboard overview.
function companyOverview() {
  const d = state.data;
  const recent = d.applicants.slice(0, 5);
  return `<div class="welcome"><div><h2>Good to see you, ${esc(d.company.company_name)}.</h2><p>Here’s how your campus hiring is coming along.</p></div><div class="welcome-actions"><button class="btn btn-primary" data-action="create-drive">＋ Create a drive</button></div></div>${companyStats()}
    <div class="content-grid"><section class="panel"><div class="panel-head"><div><h3 class="panel-title">Your job drives</h3><p class="panel-subtitle">Review active roles and approval status</p></div><button class="text-btn" data-action="navigate" data-view="drives">Manage drives →</button></div>${companyDriveTable(d.jobs.slice(0,4))}</section><section class="panel"><div class="panel-head"><div><h3 class="panel-title">Recent applicants</h3><p class="panel-subtitle">The latest people interested in your roles</p></div><button class="text-btn" data-action="navigate" data-view="applicants">View all →</button></div>${recent.length ? `<div class="feed-list">${recent.map(item => `<div class="feed-row">${initialsAvatar(item.student_name)}<div style="flex:1"><strong>${esc(item.student_name)}</strong><p>${esc(item.title)} · CGPA ${esc(item.cgpa)}</p></div>${badge(item.status)}</div>`).join('')}</div>` : emptyState('♙','No applicants yet','Your applicant list will grow as students apply.')}</section></div>`;
}

// Show students who applied to this company’s drives.
function companyApplicants() {
  const branches = [...new Set(state.data.applicants.map(item => item.branch).filter(Boolean))].sort();
  return `<div class="welcome"><div><h2>People behind the profiles.</h2><p>Review applicants, explore fit, and share a clear next step.</p></div></div><div class="toolbar"><label class="search-box"><span>⌕</span><input data-action="search-applicants" value="${esc(state.filter)}" placeholder="Search by student, drive, or skill…" aria-label="Search applicants" /></label><select class="filter-select" data-action="applicant-status-filter"><option value="all">All statuses</option>${['Applied','Under Review','Shortlisted','Interview','Selected','Not Selected'].map(s=>`<option ${state.statusFilter===s?'selected':''}>${s}</option>`).join('')}</select><select class="filter-select" data-action="applicant-branch-filter"><option value="all">All branches</option>${branches.map(branch=>`<option ${state.applicantBranch===branch?'selected':''}>${esc(branch)}</option>`).join('')}</select><select class="filter-select" data-action="applicant-cgpa-filter"><option value="all">Any CGPA</option><option value="7" ${state.cgpaFloor==='7'?'selected':''}>CGPA 7.0+</option><option value="8" ${state.cgpaFloor==='8'?'selected':''}>CGPA 8.0+</option><option value="9" ${state.cgpaFloor==='9'?'selected':''}>CGPA 9.0+</option></select></div><section class="panel"><div class="panel-head"><div><h3 class="panel-title">Applicant review</h3><p class="panel-subtitle">${state.data.applicants.length} applications across your drives</p></div></div>${applicantTable()}</section>`;
}

// Show applicant details and resume links.
function applicantTable() {
  const rows = state.data.applicants.filter(item => {
    const matchQuery = !state.filter || `${item.student_name} ${item.title} ${item.skills} ${item.branch}`.toLowerCase().includes(state.filter.toLowerCase());
    const matchStatus = !state.statusFilter || state.statusFilter === 'all' || item.status === state.statusFilter;
    const matchBranch = !state.applicantBranch || state.applicantBranch === 'all' || item.branch === state.applicantBranch;
    const matchCgpa = !state.cgpaFloor || Number(item.cgpa) >= Number(state.cgpaFloor);
    return matchQuery && matchStatus && matchBranch && matchCgpa;
  });
  if (!rows.length) return emptyState('♙','No applicants match','Try adjusting the search or status filter.');
  return `<div class="table-wrap"><table><thead><tr><th>Student</th><th>Drive</th><th>Fit</th><th>Status</th><th>Update status</th><th>Resume</th></tr></thead><tbody>${rows.map(item=>`<tr><td><div class="table-person">${initialsAvatar(item.student_name)}<span><strong>${esc(item.student_name)}</strong><small>${esc(item.roll_number || 'Profile pending')} · ${esc(item.branch)}</small></span></div></td><td><strong>${esc(item.title)}</strong></td><td>CGPA ${esc(item.cgpa)}<small style="display:block;margin-top:4px;color:#96a29c">${esc(item.skills.split(',').slice(0,3).join(', '))}</small></td><td>${badge(item.status)}</td><td><select class="small-select" data-action="application-status" data-id="${item.application_id}">${['Applied','Under Review','Shortlisted','Interview','Selected','Not Selected'].map(status => `<option ${status === item.status ? 'selected' : ''}>${status}</option>`).join('')}</select></td><td>${item.resume ? (state.offlineDemo ? '<span class="subtle-label">Filename only</span>' : `<a class="btn btn-ghost btn-sm" target="_blank" rel="noreferrer" href="/api/resumes/${item.student_id}">View resume ↗</a>`) : '<span class="subtle-label">Not uploaded</span>'}</td></tr>`).join('')}</tbody></table></div>`;
}

// Pick the company page requested in the dashboard.
function renderCompanyView(view) {
  if (view === 'drives') return `<div class="welcome"><div><h2>Your roles, all in one place.</h2><p>New drives are reviewed by the placement team before students can see them.</p></div><div class="welcome-actions"><button class="btn btn-primary" data-action="create-drive">＋ Create a drive</button></div></div><section class="panel"><div class="panel-head"><div><h3 class="panel-title">Job drives</h3><p class="panel-subtitle">${state.data.jobs.length} posted drives</p></div></div>${companyDriveTable(state.data.jobs)}</section>`;
  if (view === 'applicants') return companyApplicants();
  if (view === 'profile') return companyProfile();
  if (view === 'contacts') return companyContacts();
  if (view === 'messages') return messageView();
  return companyOverview();
}

// Build placement-team summary cards.
function adminStats() {
  const m = state.data.metrics;
  return `<div class="stat-grid">${statCard('♙', 'Students', m.students, 'Student profiles in the portal')}${statCard('◈', 'Companies', m.companies, 'Registered hiring partners')}${statCard('▤', 'Live drives', m.drives, `${state.data.jobs.filter(j=>j.status==='pending').length} pending review`)}${statCard('✦', 'Placement rate', `${m.placement_rate}%`, `${m.placed} selected so far`)}</div>`;
}

// Build the placement-team overview and approval queue.
function adminOverview() {
  const d = state.data;
  const max = Math.max(1, ...d.branch_counts.map(row => row.count));
  const selected = d.applications.filter(a => a.status === 'Selected').slice(0, 4);
  const pending = d.jobs.filter(job => job.status === 'pending');
  return `<div class="welcome"><div><h2>A good day to move things forward.</h2><p>Your campus placement pulse, all in one clear view.</p></div><div class="welcome-actions"><button class="btn btn-ghost" data-action="navigate" data-view="applications">View applications →</button></div></div>${adminStats()}
    <div class="content-grid"><section class="panel"><div class="panel-head"><div><h3 class="panel-title">Student snapshot</h3><p class="panel-subtitle">Profiles by branch</p></div><button class="text-btn" data-action="navigate" data-view="students">All students →</button></div><div class="bar-chart">${d.branch_counts.map(row=>`<div class="bar-row"><span>${esc(row.branch || 'Unspecified')}</span><div class="bar-track"><span style="width:${Math.max(5,Math.round(row.count/max*100))}%"></span></div><b>${row.count}</b></div>`).join('')}</div></section>
      <section class="panel"><div class="panel-head"><div><h3 class="panel-title">Drives to review</h3><p class="panel-subtitle">New roles waiting for a green light</p></div><button class="text-btn" data-action="navigate" data-view="drives">View all →</button></div>${pending.length ? `<div class="drive-stack">${pending.slice(0,4).map(job=>`<div class="drive-mini">${companyLogo(job.company_name)}<div class="drive-mini-body"><strong>${esc(job.title)}</strong><small>${esc(job.company_name)} · Due ${fmtDate(job.deadline)}</small></div><button class="btn btn-primary btn-sm" data-action="drive-status" data-id="${job.job_id}" data-status="approved">Approve</button></div>`).join('')}</div>` : emptyState('✓','All caught up','New drives will appear here for review.')}</section></div>
    <div class="content-grid" style="margin-top:16px"><section class="panel"><div class="panel-head"><div><h3 class="panel-title">Recent applications</h3><p class="panel-subtitle">A quick read on student progress</p></div><button class="text-btn" data-action="navigate" data-view="applications">All applications →</button></div>${applicationTable(d.applications.slice(0,6), true)}</section><section class="panel"><div class="panel-head"><h3 class="panel-title">Recently selected</h3></div>${selected.length ? `<div class="feed-list">${selected.map(a=>`<div class="feed-row">${initialsAvatar(a.student_name)}<div><strong>${esc(a.student_name)}</strong><p>${esc(a.company_name)} · ${esc(a.title)}</p></div></div>`).join('')}</div>` : emptyState('✦','A first offer is on its way','Selections will show here as companies update results.')}</section></div>`;
}

// Show student accounts and profile details.
function adminStudents() {
  const rows = state.data.students.filter(s => !state.filter || `${s.name} ${s.email} ${s.roll_number} ${s.branch}`.toLowerCase().includes(state.filter.toLowerCase()));
  return `<div class="welcome"><div><h2>Student directory.</h2><p>Keep student details accurate and accounts in good standing.</p></div><span class="today-pill">${state.data.students.length} student profiles</span></div><div class="toolbar"><label class="search-box"><span>⌕</span><input data-action="search-directory" value="${esc(state.filter)}" placeholder="Search name, roll number, branch…" aria-label="Search students" /></label></div><section class="panel"><div class="table-wrap"><table><thead><tr><th>Student</th><th>Roll number</th><th>Branch</th><th>Semester</th><th>CGPA</th><th>Skills</th><th>Resume</th><th>Account</th></tr></thead><tbody>${rows.map(s=>`<tr><td><div class="table-person">${initialsAvatar(s.name)}<span><strong>${esc(s.name)}</strong><small>${esc(s.email)}</small></span></div></td><td>${esc(s.roll_number || '—')}</td><td>${esc(s.branch || '—')}</td><td>${esc(s.semester)}</td><td><strong>${Number(s.cgpa).toFixed(1)}</strong></td><td>${esc((s.skills || '—').split(',').slice(0,2).join(', '))}</td><td>${s.resume ? (state.offlineDemo ? '<span class="subtle-label">On file</span>' : `<a class="text-btn" target="_blank" rel="noreferrer" href="/api/resumes/${s.student_id}">View ↗</a>`) : '<span class="subtle-label">Not uploaded</span>'}</td><td><button class="text-btn" data-action="user-status" data-id="${s.user_id}" data-status="${s.status === 'active' ? 'paused' : 'active'}">${s.status === 'active' ? 'Pause' : 'Restore'}</button></td></tr>`).join('')}</tbody></table></div>${rows.length ? '' : emptyState('⌕','No students found','Try a different search.')}</section>`;
}

// Show company accounts and profile details.
function adminCompanies() {
  const rows = state.data.companies.filter(c => !state.filter || `${c.company_name} ${c.industry} ${c.location} ${c.email}`.toLowerCase().includes(state.filter.toLowerCase()));
  return `<div class="welcome"><div><h2>Hiring partners.</h2><p>See who is hiring and manage company access.</p></div><span class="today-pill">${state.data.companies.length} companies</span></div><div class="toolbar"><label class="search-box"><span>⌕</span><input data-action="search-directory" value="${esc(state.filter)}" placeholder="Search company, industry, or location…" aria-label="Search companies" /></label></div><section class="panel"><div class="table-wrap"><table><thead><tr><th>Company</th><th>Industry</th><th>Location</th><th>HR contact</th><th>Drives</th><th>Account</th></tr></thead><tbody>${rows.map(c=>`<tr><td><div class="table-person">${companyLogo(c.company_name)}<span><strong>${esc(c.company_name)}</strong><small>${esc(c.website)}</small></span></div></td><td>${esc(c.industry || '—')}</td><td>${esc(c.location || '—')}</td><td>${esc(c.hr_name || c.account_name)}<small style="display:block;margin-top:4px;color:#96a29c">${esc(c.hr_email || c.email)}</small></td><td>${state.data.jobs.filter(j=>j.company_id===c.company_id).length}</td><td><button class="text-btn" data-action="user-status" data-id="${c.user_id}" data-status="${c.status === 'active' ? 'paused' : 'active'}">${c.status === 'active' ? 'Pause' : 'Restore'}</button></td></tr>`).join('')}</tbody></table></div>${rows.length ? '' : emptyState('⌕','No companies found','Try another search.')}</section>`;
}

// Show job drives and controls for reviewing them.
function adminDrives() {
  const rows = state.data.jobs.filter(job => !state.filter || `${job.title} ${job.company_name} ${job.status}`.toLowerCase().includes(state.filter.toLowerCase()));
  const pending = rows.filter(job => job.status === 'pending');
  const fullPending = state.data.jobs.filter(job => job.status === 'pending').length;
  return `<div class="welcome"><div><h2>Every drive, accounted for.</h2><p>Review company submissions and publish approved opportunities for students.</p></div><span class="approval-total">${fullPending} awaiting approval</span></div><div class="toolbar"><label class="search-box"><span>⌕</span><input data-action="search-directory" value="${esc(state.filter)}" placeholder="Search drive or company…" aria-label="Search drives" /></label><span class="today-pill">${state.data.jobs.length} total drives</span></div>${pending.length ? `<section class="approval-queue"><div class="approval-queue-head"><span class="approval-icon">✦</span><div><h3>Approval queue</h3><p>${pending.length} new drive${pending.length === 1 ? '' : 's'} need placement-team review</p></div><span class="approval-total">${pending.length} pending</span></div><div class="approval-cards">${pending.map(job=>`<article class="approval-card"><div class="approval-card-company">${companyLogo(job.company_name)}<span><strong>${esc(job.company_name)}</strong><small>Submitted ${esc(job.created_at || 'recently')}</small></span></div><h4>${esc(job.title)}</h4><p>${esc(job.description)}</p><div class="approval-facts"><span>${money(job.salary)}</span><span>CGPA ${esc(job.min_cgpa)}+</span><span>${esc(job.openings)} opening${Number(job.openings)===1?'':'s'}</span><span>Deadline ${fmtDate(job.deadline)}</span></div><div class="approval-actions"><button class="btn btn-primary btn-sm" data-action="drive-status" data-id="${job.job_id}" data-status="approved">Approve drive <span>✓</span></button><button class="btn btn-danger btn-sm" data-action="drive-status" data-id="${job.job_id}" data-status="rejected">Decline</button></div></article>`).join('')}</div></section>` : `<section class="approval-queue approval-empty"><span class="approval-icon">✓</span><div><h3>Approval queue is clear</h3><p>New company submissions will appear here as soon as they are saved to the server database.</p></div></section>`}${state.filter && !pending.length && fullPending ? `<p class="filter-note">There are ${fullPending} pending drive${fullPending === 1 ? '' : 's'} outside this search. Clear the search to review them.</p>` : ''}<section class="panel admin-all-drives"><div class="panel-head"><div><h3 class="panel-title">All job drives</h3><p class="panel-subtitle">Approved, pending, closed, and declined company submissions</p></div></div><div class="table-wrap"><table><thead><tr><th>Drive</th><th>Company</th><th>Eligibility</th><th>Deadline</th><th>Applicants</th><th>Status</th><th>Review</th></tr></thead><tbody>${rows.map(job=>`<tr><td><strong>${esc(job.title)}</strong><small style="display:block;margin-top:4px;color:#96a29c">${money(job.salary)}</small></td><td>${esc(job.company_name)}</td><td>CGPA ${esc(job.min_cgpa)}+<small style="display:block;margin-top:4px;color:#96a29c">${esc(job.branches)}</small></td><td>${fmtDate(job.deadline)}</td><td>${job.applicant_count}</td><td>${badge(job.status)}</td><td>${job.status==='pending'?'<span class="subtle-label">Review above</span>':job.status==='approved'?`<button class="btn btn-ghost btn-sm" data-action="drive-status" data-id="${job.job_id}" data-status="closed">Close drive</button>`:`<button class="btn btn-ghost btn-sm" data-action="drive-status" data-id="${job.job_id}" data-status="approved">Reopen</button>`}</td></tr>`).join('')}</tbody></table></div>${rows.length ? '' : emptyState('⌕','No drives found','Try another search.')}</section>`;
}

// Show all applications across the placement portal.
function adminApplications() {
  return `<div class="welcome"><div><h2>Application activity.</h2><p>Follow progress across every student and hiring partner.</p></div><span class="today-pill">${state.data.applications.length} applications</span></div><div class="toolbar"><label class="search-box"><span>⌕</span><input data-action="search-applications" value="${esc(state.filter)}" placeholder="Search student, drive, or company…" aria-label="Search applications" /></label><select class="filter-select" data-action="application-status-filter"><option value="all">All statuses</option>${['Applied','Under Review','Shortlisted','Interview','Selected','Not Selected'].map(s=>`<option ${state.statusFilter===s?'selected':''}>${s}</option>`).join('')}</select></div><section class="panel"><div class="panel-head"><h3 class="panel-title">Application tracker</h3></div>${adminApplicationTable()}</section>`;
}

// Build the placement-team application table.
function adminApplicationTable() {
  const rows = state.data.applications.filter(item => {
    const q = !state.filter || `${item.student_name} ${item.title} ${item.company_name} ${item.roll_number}`.toLowerCase().includes(state.filter.toLowerCase());
    const status = !state.statusFilter || state.statusFilter === 'all' || item.status === state.statusFilter;
    return q && status;
  });
  if (!rows.length) return emptyState('▤','No matching applications','Try a different search or status filter.');
  return `<div class="table-wrap"><table><thead><tr><th>Student</th><th>Drive</th><th>Company</th><th>Applied</th><th>Status</th><th>Update</th></tr></thead><tbody>${rows.map(item=>`<tr><td><strong>${esc(item.student_name)}</strong><small style="display:block;margin-top:4px;color:#96a29c">${esc(item.roll_number)} · ${esc(item.branch)}</small></td><td>${esc(item.title)}</td><td>${esc(item.company_name)}</td><td>${fmtDate(item.applied_date?.slice(0,10))}</td><td>${badge(item.status)}</td><td><select class="small-select" data-action="application-status" data-id="${item.application_id}">${['Applied','Under Review','Shortlisted','Interview','Selected','Not Selected'].map(status => `<option ${status === item.status ? 'selected' : ''}>${status}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table></div>`;
}

// Pick the placement-team page requested in the dashboard.
function renderAdminView(view) {
  if (view === 'students') return adminStudents();
  if (view === 'companies') return adminCompanies();
  if (view === 'drives') return adminDrives();
  if (view === 'applications') return adminApplications();
  if (view === 'contacts') return adminContacts();
  if (view === 'messages') return messageView();
  return adminOverview();
}

// Wrap form content in the shared dialog layout.
function modalBase(content, wide = false) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.setAttribute('data-action', 'backdrop-close');
  wrap.innerHTML = `<section class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true">${content}</section>`;
  document.body.append(wrap);
  return wrap;
}

// Open the company form for a new job drive.
function openJobModal() {
  const today = new Date();
  today.setDate(today.getDate() + 1);
  const minDate = today.toISOString().slice(0,10);
  const wrap = modalBase(`<button class="modal-close" data-action="modal-close" aria-label="Close">×</button><p class="section-kicker">A NEW OPPORTUNITY</p><h2>Make a great first impression.</h2><p class="modal-intro">Share the role, the essentials, and who would thrive. The placement team will review your drive before it goes live.</p>
    <form data-form="job"><div class="form-grid"><div class="field"><label>Role title</label><input name="title" required maxlength="120" placeholder="e.g. Graduate Software Engineer" /></div><div class="field"><label>Salary / package</label><input name="salary" placeholder="e.g. ₹12–16 LPA" /></div><div class="field full"><label>Role description</label><textarea name="description" required minlength="20" placeholder="What will this person work on? What makes the role exciting?"></textarea></div><div class="field"><label>Minimum CGPA</label><input name="min_cgpa" type="number" min="0" max="10" step="0.1" value="7" required /></div><div class="field"><label>Last date to apply</label><input name="deadline" type="date" min="${minDate}" required /></div><div class="field"><label>Eligible branches</label><input name="branches" value="All branches" placeholder="All branches or comma-separated list" /></div><div class="field"><label>Required skills</label><input name="required_skills" placeholder="Python, SQL, communication" /></div><div class="field"><label>Location / work style</label><input name="location" placeholder="Bengaluru · Hybrid" /></div><div class="field"><label>Number of openings</label><input name="openings" type="number" min="1" max="1000" value="1" /></div></div><div class="job-error"></div><button class="btn btn-primary" type="submit">Send for approval <span>→</span></button></form>`, true);
  wrap.querySelector('input[name="title"]').focus();
}

// Handle clicks, form submissions, and dashboard actions.
function handleAction(event) {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  if (action === 'backdrop-close') {
    if (event.target === target) target.remove();
    return;
  }
  if (action === 'refresh-page') {
    window.location.reload();
  } else if (action === 'copy-template') {
    const content = target.dataset.template || '';
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(content).then(() => toast('Template copied.')).catch(() => toast('Copy was blocked by the browser. Select the template text and copy it.', true));
    else toast('Clipboard access is unavailable in this browser.', true);
  } else if (action === 'auth-open' || action === 'auth-role') {
    state.authMode = target.dataset.mode || (action === 'auth-role' ? 'register' : 'login');
    state.authRole = target.dataset.role || 'student';
    if (state.authRole === 'admin' && state.authMode === 'register') state.authMode = 'login';
    render();
  } else if (action === 'auth-mode') {
    state.authMode = target.dataset.mode;
    if (state.authMode === 'register' && state.authRole === 'admin') state.authRole = 'student';
    render();
  } else if (action === 'auth-close') {
    state.authMode = 'closed';
    render();
  } else if (action === 'demo-login') {
    const accounts = {
      student: ['aarav@northstar.edu','Student123!'],
      company: ['hr@nimbus.io','Company123!'],
      admin: ['admin@smartplacement.edu','Admin123!']
    };
    const form = app.querySelector('[data-form="auth"]');
    if (form) {
      form.elements.email.value = accounts[target.dataset.demo][0];
      form.elements.password.value = accounts[target.dataset.demo][1];
      form.requestSubmit();
    }
  } else if (action === 'navigate') {
    state.view = target.dataset.view;
    if (state.view === 'messages') state.messageContactsLoaded = false;
    state.filter = '';
    state.statusFilter = 'all';
    state.eligibleOnly = false;
    render();
  } else if (action === 'select-message-contact') {
    state.activeMessageId = Number(target.dataset.id);
    state.messageItems = [];
    loadMessageThread().then(() => render()).catch(error => toast(error.message, true));
  } else if (action === 'retry-messages') {
    state.messageError = ''; state.messageContactsLoaded = false;
    loadMessageContacts();
  } else if (action === 'go-home') {
    state.view = 'overview';
    render();
  } else if (action === 'logout') {
    request('/api/logout', { method: 'POST' }).catch(() => {});
    stopMessagePolling(); state.user = null; state.data = null; state.view = 'overview'; state.authMode = 'closed'; state.messageContacts = []; state.messageItems = []; state.messageContactsLoaded = false; state.activeMessageId = null;
    render();
  } else if (action === 'apply') {
    request(`/api/jobs/${target.dataset.id}/apply`, { method: 'POST', body: '{}' }).then(async () => { toast('You’re in — your application was sent.'); await refresh(); }).catch(error => toast(error.message, true));
  } else if (action === 'create-drive') {
    openJobModal();
  } else if (action === 'modal-close') {
    target.closest('.modal-backdrop')?.remove();
  } else if (action === 'drive-status') {
    const id = target.dataset.id;
    const status = target.dataset.status;
    if (status === 'rejected' && !confirm('Decline this job drive? The company can resubmit it later.')) return;
    request(`/api/jobs/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }).then(async () => { toast(`Drive ${status === 'approved' ? 'approved' : status === 'closed' ? 'closed' : status === 'rejected' ? 'declined' : 'updated'}.`); await refresh(); }).catch(error => toast(error.message, true));
  } else if (action === 'user-status') {
    const status = target.dataset.status;
    request(`/api/users/${target.dataset.id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }).then(async () => { toast(`Account ${status === 'paused' ? 'paused' : 'restored'}.`); await refresh(); }).catch(error => toast(error.message, true));
  } else if (action === 'help') {
    toast('Please contact your college placement office for support.');
  } else if (action === 'notifications') {
    toast('You’re all caught up. New updates will appear here.');
  }
}

document.body.addEventListener('click', handleAction);

app.addEventListener('input', event => {
  const action = event.target.dataset.action;
  if (action === 'search-jobs' || action === 'search-applicants' || action === 'search-directory' || action === 'search-applications') {
    state.filter = event.target.value;
    const cursor = event.target.selectionStart;
    render();
    const replacement = app.querySelector(`[data-action="${action}"]`);
    replacement?.focus();
    if (replacement && cursor !== null) replacement.setSelectionRange(cursor, cursor);
  }
});

app.addEventListener('change', event => {
  const target = event.target;
  if (target.dataset.action === 'eligible-filter') {
    state.eligibleOnly = target.value === 'eligible';
    render();
  } else if (target.dataset.action === 'application-status' && target.value) {
    request(`/api/applications/${target.dataset.id}`, { method: 'PATCH', body: JSON.stringify({ status: target.value }) }).then(async () => { toast('Application status updated.'); await refresh(); }).catch(error => { toast(error.message, true); refresh(); });
  } else if (target.dataset.action === 'applicant-status-filter' || target.dataset.action === 'application-status-filter') {
    state.statusFilter = target.value;
    render();
  } else if (target.dataset.action === 'applicant-branch-filter') {
    state.applicantBranch = target.value;
    render();
  } else if (target.dataset.action === 'applicant-cgpa-filter') {
    state.cgpaFloor = target.value;
    render();
  }
});

app.addEventListener('submit', async event => {
  const form = event.target.closest('[data-form]');
  if (!form) return;
  event.preventDefault();
  const kind = form.dataset.form;
  const submit = form.querySelector('[type="submit"]');
  if (submit) { submit.disabled = true; submit.dataset.original = submit.innerHTML; submit.innerHTML = '<span class="spinner" style="display:inline-block;width:15px;height:15px;margin:0;border-width:2px;vertical-align:middle"></span> Please wait…'; }
  try {
    if (kind === 'auth') {
      const data = Object.fromEntries(new FormData(form).entries());
      data.role = state.authRole;
      const requestedMode = state.authMode;
      const response = await request(`/api/${requestedMode === 'register' ? 'register' : 'login'}`, { method: 'POST', body: JSON.stringify(data) });
      state.user = response.user; state.authMode = 'closed'; state.view = 'overview'; state.filter = '';
      state.data = await request('/api/dashboard');
      render();
      toast(`Welcome${requestedMode === 'register' ? '' : ' back'}, ${state.user.name.split(' ')[0]}.`);
    } else if (kind === 'profile') {
      const data = Object.fromEntries(new FormData(form).entries());
      await request('/api/profile', { method: 'PUT', body: JSON.stringify(data) });
      await refresh(); toast('Your profile is saved.');
    } else if (kind === 'resume') {
      const data = new FormData(form);
      const result = await request('/api/resume', { method: 'POST', body: data });
      await refresh();
      toast(result.ats_score === null || result.ats_score === undefined ? 'Resume filename saved in browser demo. Run the Python server to upload the file and calculate ATS score.' : `Resume uploaded · ATS readiness estimate: ${result.ats_score}/100.`);
    } else if (kind === 'job') {
      const data = Object.fromEntries(new FormData(form).entries());
      await request('/api/jobs', { method: 'POST', body: JSON.stringify(data) });
      form.closest('.modal-backdrop')?.remove();
      await refresh(); toast('Drive sent to the placement team for review.');
    } else if (kind === 'team-contact') {
      const data = Object.fromEntries(new FormData(form).entries());
      const result = await request('/api/contact-team', { method: 'POST', body: JSON.stringify(data) });
      await refresh();
      toast(result.email_sent ? 'Message sent to the placement team by email.' : 'Message saved. Email delivery needs SMTP setup on the server.');
    } else if (kind === 'company-profile') {
      const data = Object.fromEntries(new FormData(form).entries());
      await request('/api/company-profile', { method: 'PUT', body: JSON.stringify(data) });
      await refresh(); toast('Company profile saved.');
    } else if (kind === 'message-send') {
      const data = Object.fromEntries(new FormData(form).entries());
      data.recipient_id = state.activeMessageId;
      await request('/api/messages', { method: 'POST', body: JSON.stringify(data) });
      form.reset(); await loadMessageThread();
      const draft = app.querySelector('#message-draft'); draft?.focus();
      toast('Message sent.');
    }
  } catch (error) {
    const errorBox = form.querySelector('.auth-error, .job-error');
    if (errorBox) { errorBox.className = errorBox.className.split(' ')[0] + ' modal-error'; errorBox.textContent = error.message; }
    else toast(error.message, true);
  } finally {
    if (submit?.isConnected) { submit.disabled = false; submit.innerHTML = submit.dataset.original || submit.innerHTML; }
  }
});

// Start the app, restore the account, and load its first page.
async function boot() {
  app.innerHTML = `<div class="loading-state"><div><div class="spinner"></div><p style="margin-top:12px;font-size:11px">Opening CampusPath…</p></div></div>`;
  try {
    const response = await request('/api/me');
    state.user = response.user;
    state.authMode = 'closed';
    if (state.user) state.data = await request('/api/dashboard');
  } catch {
    state.user = null; state.data = null; state.authMode = 'closed';
  }
  render();
  if (state.offlineDemo) toast('Browser demo mode is active. Changes are saved in this browser.');
}

// Keep the colored progress line in sync with scrolling.
function installScrollIndicator() {
  const bar = document.createElement('div');
  bar.className = 'scroll-progress';
  bar.setAttribute('aria-hidden', 'true');
  document.body.append(bar);
  const update = () => {
    const available = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.setProperty('--scroll-progress', `${available > 0 ? Math.min(1, window.scrollY / available) * 100 : 0}%`);
  };
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update, { passive: true });
  update();
}

installScrollIndicator();
boot();

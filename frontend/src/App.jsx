import React, { useState, useEffect, useMemo } from 'react';
import { 
  LayoutDashboard, 
  FileText, 
  Users, 
  History, 
  Plus, 
  Search, 
  Bell, 
  Calendar, 
  ShieldCheck, 
  UserCircle, 
  LogOut, 
  Edit3, 
  Trash2, 
  AlertCircle,
  ChevronRight,
  MoreVertical,
  CheckCircle2,
  Clock,
  ExternalLink,
  Download,
  Mail,
  ArrowLeft,
  Send,
  Info,
  Briefcase,
  Building2,
  Check,
  UserPlus,
  Upload,
  FileIcon,
  X,
  PieChart,
  BarChart3,
  TrendingUp,
  Eye,
  Phone,
  Hash
} from 'lucide-react';

const API_BASE_URL = "http://localhost:5000";
const DEFAULT_MESSAGE_TEMPLATES = {
  responsibleSubject: "ACTION REQUIRED: {{license_name}} expires in {{days_left}} days",
  responsibleBody: `Dear {{person_name}},

You are the PRIMARY RESPONSIBLE for the license "{{license_name}}".

Expiry Date: {{expiry_date}}
Days Remaining: {{days_left}}

Please initiate renewal immediately.

-- License Management System`,
  stakeholderSubject: "INFO: {{license_name}} expiry update ({{days_left}} days left)",
  stakeholderBody: `Dear {{person_name}},

This is an informational update for the license "{{license_name}}".

Expiry Date: {{expiry_date}}
Days Remaining: {{days_left}}

No action required from you.

-- License Management System`,
};

// --- Static Color Maps for Tailwind (Fixes Dynamic Class Bug) ---
const colorMap = {
  indigo: "bg-indigo-50 text-indigo-600",
  emerald: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
  sky: "bg-sky-50 text-sky-600",
};

// --- Missing UI Components (White Screen Guarantee) ---
const Badge = ({ children, variant = 'default' }) => {
  const styles = {
    default: 'bg-slate-100 text-slate-700',
    success: 'bg-emerald-100 text-emerald-700',
    warning: 'bg-amber-100 text-amber-700',
    danger: 'bg-rose-100 text-rose-700',
    info: 'bg-sky-100 text-sky-700',
    indigo: 'bg-indigo-100 text-indigo-700',
  };
  return (
    <span className={`px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider ${styles[variant] || styles.default}`}>
      {children}
    </span>
  );
};

const Card = ({ children, className = '', noPadding = false }) => (
  <div className={`bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden ${className}`}>
    <div className={noPadding ? '' : 'p-6'}>
      {children}
    </div>
  </div>
);

const Button = ({ children, onClick, variant = 'primary', icon: Icon, className = '', type = 'button', disabled = false }) => {
  const styles = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200 hover:shadow-lg',
    secondary: 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50',
    ghost: 'bg-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-800',
    danger: 'bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-100',
  };
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95 disabled:opacity-50 shadow-sm ${styles[variant] || styles.primary} ${className}`}
    >
      {Icon && <Icon size={18} />}
      {children}
    </button>
  );
};

// --- API Helper with Exponential Backoff ---
const fetchWithRetry = async (url, options = {}, retries = 5, backoff = 1000) => {
  try {
    const response = await fetch(url, options);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return await response.json();
  } catch (error) {
    if (retries > 0) {
      await new Promise(resolve => setTimeout(resolve, backoff));
      return fetchWithRetry(url, options, retries - 1, backoff * 2);
    }
    throw error;
  }
};

const fetchJson = async (url, options = {}) => {
  const response = await fetch(url, options);
  let data = null;
  try {
    data = await response.json();
  } catch (err) {
    data = null;
  }
  if (!response.ok) {
    const message = data?.error || `Request failed (${response.status})`;
    throw new Error(message);
  }
  return data;
};

const formatDateTime = (value) => {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString();
};

const formatDateInput = (value) => {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toISOString().slice(0, 10);
};

const App = () => {
  const [activeTab, setActiveTab] = useState('dashboard'); 
  const [currentView, setCurrentView] = useState('list'); 
  const [licenses, setLicenses] = useState([]);
  const [stakeholders, setStakeholders] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]); 
  const [mailLogs, setMailLogs] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [selectedLicense, setSelectedLicense] = useState(null);
  const [isLicenseModalOpen, setIsLicenseModalOpen] = useState(false);
  const [isPersonModalOpen, setIsPersonModalOpen] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [personError, setPersonError] = useState(null);
  const [personType, setPersonType] = useState('stakeholder');
  const [viewingMail, setViewingMail] = useState(null);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [templateError, setTemplateError] = useState(null);
  const [messageTemplates, setMessageTemplates] = useState(DEFAULT_MESSAGE_TEMPLATES);

  // --- Initial Data Fetching ---
  useEffect(() => {
    loadPeople();
    loadLicenses();
    loadMailLogs();
    loadMessageTemplates();
  }, []);

  const loadPeople = async () => {
    try {
      const data = await fetchWithRetry(`${API_BASE_URL}/api/people`);
      // Maps to component state based on role/type
      setStakeholders(data.filter(p => p.role === "STAKEHOLDER" || p.type === "STAKEHOLDER"));
      setEmployees(data.filter(p => p.role === "EMPLOYEE" || p.type === "EMPLOYEE"));
    } catch (err) {
      console.error("Failed to load people:", err);
    }
  };

  const loadLicenses = async () => {
    try {
      const data = await fetchWithRetry(`${API_BASE_URL}/api/licenses`);
      // Transform snake_case from DB to camelCase for existing UI compatibility
      const mapped = data.map(l => ({
        ...l,
        issuedDate: l.issued_date,
        startDate: l.start_date,
        expiryDate: l.expiry_date,
        notifySixMonth: Boolean(l.notify_six_month),
        notifyMonthly: Boolean(l.notify_monthly),
        notifyDailyLast30: Boolean(l.notify_daily_last_30)
      }));
      setLicenses(mapped);
    } catch (err) {
      console.error("Failed to load licenses:", err);
    }
  };

  const loadMailLogs = async () => {
    try {
      const data = await fetchWithRetry(`${API_BASE_URL}/api/mail-logs`);
      const mapped = data.map(log => ({
        ...log,
        licenseName: log.license_name || log.licenseName || "Unknown",
        recipient: log.person_name || log.recipient || "Unknown",
        type: log.mail_type || log.type || "UNKNOWN",
        timestamp: log.sent_at || log.timestamp || null,
        content: log.body || log.content || "",
        subject: log.subject || ""
      }));
      setMailLogs(mapped);
    } catch (err) {
      console.error("Failed to load mail logs:", err);
    }
  };

  const loadMessageTemplates = async () => {
    try {
      const data = await fetchWithRetry(`${API_BASE_URL}/api/message-templates`);
      setMessageTemplates({
        responsibleSubject: data.responsible_subject ?? DEFAULT_MESSAGE_TEMPLATES.responsibleSubject,
        responsibleBody: data.responsible_body ?? DEFAULT_MESSAGE_TEMPLATES.responsibleBody,
        stakeholderSubject: data.stakeholder_subject ?? DEFAULT_MESSAGE_TEMPLATES.stakeholderSubject,
        stakeholderBody: data.stakeholder_body ?? DEFAULT_MESSAGE_TEMPLATES.stakeholderBody
      });
    } catch (err) {
      console.error("Failed to load message templates:", err);
    }
  };

  const stats = useMemo(() => {
    const now = new Date();
    const sixMonths = new Date(); sixMonths.setMonth(now.getMonth() + 6);
    
    const deptData = {};
    licenses.forEach(l => {
      const dept = employees.find(e => l.responsibleIds?.includes(e.id))?.department || 'Other';
      deptData[dept] = (deptData[dept] || 0) + 1;
    });

    return {
      total: licenses.length,
      active: licenses.filter(l => l.status === 'Active' || l.status === 'ACTIVE').length,
      expiring: licenses.filter(l => new Date(l.expiryDate) <= sixMonths).length,
      people: stakeholders.length + employees.length,
      cost: licenses.reduce((acc, curr) => acc + (Number(curr.cost) || 0), 0),
      deptData
    };
  }, [licenses, stakeholders, employees]);

  // --- Logic Handlers ---

  const handleManualSend = async (license) => {
    try {
      await fetchJson(`${API_BASE_URL}/api/licenses/${license.id}/notify`, {
        method: 'POST'
      });
      loadMailLogs(); 
      alert(`Notifications triggered successfully.`);
    } catch (err) {
      alert(err.message || "Failed to send notifications. Check backend.");
    }
  };

  const handleSaveLicense = async (data) => {
    const respIds = Array.from(document.querySelectorAll('input[name="responsibleIds"]:checked')).map(el => el.value);
    const stakeIds = Array.from(document.querySelectorAll('input[name="stakeholderIds"]:checked')).map(el => el.value);
    
    // Transform UI data to Backend snake_case requirements
    const payload = { 
      name: data.name,
      provider: data.provider,
      cost: Number(data.cost),
      issued_date: data.issuedDate,
      start_date: data.startDate,
      expiry_date: data.expiryDate,
      status: data.status || "ACTIVE",
      description: data.description,
      notify_six_month: data.notifySixMonth === "on",
      notify_monthly: data.notifyMonthly === "on",
      notify_daily_last_30: data.notifyDailyLast30 === "on",
      responsibleIds: respIds, // Relations for license_people (RESPONSIBLE)
      stakeholderIds: stakeIds  // Relations for license_people (STAKEHOLDER)
    };

    try {
      if (selectedLicense) {
        await fetchJson(`${API_BASE_URL}/api/licenses/${selectedLicense.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        await fetchJson(`${API_BASE_URL}/api/licenses`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }
      setIsLicenseModalOpen(false);
      loadLicenses();
    } catch (err) {
      alert(err.message || "Error saving license data.");
    }
  };

  const handleSavePerson = async (formData) => {
    // Map Frontend fields to Backend role/type requirements
    const personCategory = personType === 'stakeholder' ? 'STAKEHOLDER' : 'EMPLOYEE';
    const payload = { 
      name: formData.name,
      email: formData.email,
      phone: formData.phone,
      department: formData.department,
      designation: formData.designation,
      role: personCategory,
      type: personCategory
    };

    try {
      setPersonError(null);
      const isEditing = Boolean(selectedPerson?.id);
      await fetchJson(`${API_BASE_URL}/api/people${isEditing ? `/${selectedPerson.id}` : ''}`, {
        method: isEditing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      setIsPersonModalOpen(false);
      setSelectedPerson(null);
      loadPeople();
    } catch (err) {
      setPersonError(err.message || "Error saving person record.");
    }
  };

  const handleSaveMessageTemplates = async (formData) => {
    const payload = {
      responsible_subject: formData.responsibleSubject,
      responsible_body: formData.responsibleBody,
      stakeholder_subject: formData.stakeholderSubject,
      stakeholder_body: formData.stakeholderBody
    };

    try {
      setTemplateError(null);
      const data = await fetchJson(`${API_BASE_URL}/api/message-templates`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      setMessageTemplates({
        responsibleSubject: data.responsible_subject,
        responsibleBody: data.responsible_body,
        stakeholderSubject: data.stakeholder_subject,
        stakeholderBody: data.stakeholder_body
      });
      setIsTemplateModalOpen(false);
    } catch (err) {
      setTemplateError(err.message || "Failed to update message templates.");
    }
  };

  const handleEditPerson = (person) => {
    setSelectedPerson(person);
    setPersonType(person.role === 'STAKEHOLDER' ? 'stakeholder' : 'employee');
    setPersonError(null);
    setIsPersonModalOpen(true);
  };

  const handleDeletePerson = async (person) => {
    const ok = window.confirm(`Delete ${person.name}? This will remove them from any license recipients.`);
    if (!ok) return;
    try {
      await fetchJson(`${API_BASE_URL}/api/people/${person.id}`, {
        method: 'DELETE'
      });
      loadPeople();
    } catch (err) {
      alert(err.message || "Error deleting person record.");
    }
  };

  // --- Shared View Elements ---

  const Header = ({ title, showBack = false, onBack }) => (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
      <div className="flex items-center gap-4">
        {showBack && (
          <button onClick={onBack} className="flex items-center gap-2 px-3 py-2 bg-white hover:bg-slate-50 text-slate-600 rounded-xl border border-slate-200 transition-all shadow-sm">
            <ArrowLeft size={18} />
            <span className="text-xs font-bold">Back</span>
          </button>
        )}
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight leading-none">{title}</h1>
          <p className="text-sm text-slate-500 font-medium mt-1">LMS Intelligence Dashboard</p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="hidden lg:block text-right">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Valuation</p>
          <p className="text-lg font-black text-indigo-600">${stats.cost.toLocaleString()}</p>
        </div>
        <button className="p-3 bg-white border border-slate-200 rounded-2xl text-slate-400 hover:text-indigo-600 shadow-sm transition-all">
          <Bell size={20} />
        </button>
      </div>
    </div>
  );

  const DashboardView = () => (
    <div className="space-y-8 animate-in fade-in duration-500">
      <Header title="Intelligence Overview" />
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Total Assets', val: stats.total, icon: FileText, color: 'indigo' },
          { label: 'Active', val: stats.active, icon: ShieldCheck, color: 'emerald' },
          { label: 'Expiring (6m)', val: stats.expiring, icon: Clock, color: 'amber' },
          { label: 'Recipients', val: stats.people, icon: Users, color: 'sky' },
        ].map((s, i) => (
          <Card key={i} className="hover:border-indigo-200 transition-all">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-slate-400 text-[11px] font-black uppercase tracking-widest mb-1">{s.label}</p>
                <h3 className="text-3xl font-black text-slate-800">{s.val}</h3>
              </div>
              <div className={`p-3 rounded-2xl ${colorMap[s.color]}`}>
                <s.icon size={24} />
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card>
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-black text-slate-800 flex items-center gap-2">
              <BarChart3 size={20} className="text-indigo-600" />
              Departmental Asset Load
            </h3>
          </div>
          <div className="space-y-4">
             {Object.entries(stats.deptData).map(([dept, count]) => {
               const percentage = stats.total > 0 ? (count / stats.total) * 100 : 0;
               return (
                 <div key={dept} className="space-y-1.5">
                   <div className="flex justify-between text-xs font-bold">
                     <span className="text-slate-600">{dept}</span>
                     <span className="text-indigo-600">{count} Licenses</span>
                   </div>
                   <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500 rounded-full transition-all duration-1000" style={{ width: `${percentage}%` }}></div>
                   </div>
                 </div>
               );
             })}
          </div>
        </Card>

        <Card className="flex flex-col">
          <h3 className="font-black text-slate-800 flex items-center gap-2 mb-6">
            <TrendingUp size={20} className="text-emerald-600" />
            Registry Coverage
          </h3>
          <div className="flex-1 flex flex-col justify-center items-center py-8">
            <div className="relative w-40 h-40">
              <svg className="w-full h-full transform -rotate-90">
                <circle cx="80" cy="80" r="70" stroke="currentColor" strokeWidth="12" fill="transparent" className="text-slate-100" />
                <circle cx="80" cy="80" r="70" stroke="currentColor" strokeWidth="12" fill="transparent" strokeDasharray={440} strokeDashoffset={440 - (440 * (stats.total > 0 ? (stats.active / stats.total) : 0))} className="text-emerald-500" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-black text-slate-800">{stats.total > 0 ? Math.round((stats.active/stats.total)*100) : 0}%</span>
                <span className="text-[10px] font-bold text-slate-400 uppercase">Compliance</span>
              </div>
            </div>
            <div className="mt-8 grid grid-cols-2 gap-8 text-center w-full">
               <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase">Total Cost</p>
                  <p className="text-xl font-black text-slate-800">${stats.cost.toLocaleString()}</p>
               </div>
               <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase">Per License</p>
                  <p className="text-xl font-black text-slate-800">${stats.total > 0 ? Math.round(stats.cost/stats.total).toLocaleString() : 0}</p>
               </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );

  const PeopleRegistryView = () => (
    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
      <Header title="The Registry" showBack onBack={() => setActiveTab('dashboard')} />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
         <button onClick={() => { setSelectedPerson(null); setPersonType('stakeholder'); setPersonError(null); setIsPersonModalOpen(true); }} className="p-8 bg-indigo-600 text-white rounded-3xl text-left hover:scale-[1.01] transition-all shadow-xl shadow-indigo-100 group">
            <div className="flex justify-between items-start mb-4">
              <UserPlus size={32} />
              <div className="p-2 bg-white/10 rounded-xl group-hover:bg-white/20 transition-colors"><Plus size={16}/></div>
            </div>
            <h3 className="text-xl font-black">Add New Stakeholder</h3>
            <p className="text-indigo-100 text-xs mt-1">Add legal, procurement, or leadership stakeholders for visibility</p>
         </button>
         <button onClick={() => { setSelectedPerson(null); setPersonType('employee'); setPersonError(null); setIsPersonModalOpen(true); }} className="p-8 bg-slate-900 text-white rounded-3xl text-left hover:scale-[1.01] transition-all shadow-xl shadow-slate-200 group">
            <div className="flex justify-between items-start mb-4">
              <ShieldCheck size={32} />
              <div className="p-2 bg-white/10 rounded-xl group-hover:bg-white/20 transition-colors"><Plus size={16}/></div>
            </div>
            <h3 className="text-xl font-black">Add Responsible User</h3>
            <p className="text-slate-400 text-xs mt-1">Register primary owners, managers or asset administrators</p>
         </button>
         <button onClick={() => { setTemplateError(null); setIsTemplateModalOpen(true); }} className="p-8 bg-emerald-600 text-white rounded-3xl text-left hover:scale-[1.01] transition-all shadow-xl shadow-emerald-100 group">
            <div className="flex justify-between items-start mb-4">
              <Mail size={32} />
              <div className="p-2 bg-white/10 rounded-xl group-hover:bg-white/20 transition-colors"><Edit3 size={16}/></div>
            </div>
            <h3 className="text-xl font-black">Customize Messages</h3>
            <p className="text-emerald-100 text-xs mt-1">Edit mail subject/body templates with dynamic fields and your own custom text</p>
         </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card noPadding>
          <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <h3 className="font-black text-slate-800 text-sm uppercase tracking-wider">Stakeholders</h3>
            <Badge variant="indigo">{stakeholders.length} Registered</Badge>
          </div>
          <div className="divide-y divide-slate-100">
            {stakeholders.map(s => (
              <div key={s.id} className="p-5 flex items-center justify-between group hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-4">
                   <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 font-black text-lg border border-indigo-100">{s.name ? s.name[0] : '?'}</div>
                   <div>
                      <h4 className="font-bold text-slate-800 text-sm">{s.name}</h4>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-slate-400 font-black uppercase">{s.designation || s.role}</span>
                        <div className="w-1 h-1 bg-slate-300 rounded-full"></div>
                        <span className="text-[10px] text-slate-400 font-black uppercase">{s.department}</span>
                      </div>
                   </div>
                </div>
                <div className="text-right flex flex-col items-end gap-2">
                  <div className="flex items-center gap-2 text-[10px] text-slate-500 font-bold">
                    <Phone size={12}/> {s.phone}
                  </div>
                  <Badge variant="success">{s.status || 'Active'}</Badge>
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleEditPerson(s)} className="px-2 py-1 text-[10px] font-bold rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 flex items-center gap-1"><Edit3 size={12}/>Edit</button>
                    <button onClick={() => handleDeletePerson(s)} className="px-2 py-1 text-[10px] font-bold rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 flex items-center gap-1"><Trash2 size={12}/>Delete</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card noPadding>
          <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <h3 className="font-black text-slate-800 text-sm uppercase tracking-wider">Responsibles</h3>
            <Badge variant="success">{employees.length} Registered</Badge>
          </div>
          <div className="divide-y divide-slate-100">
            {employees.map(e => (
              <div key={e.id} className="p-5 flex items-center justify-between hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-4">
                   <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600 font-black text-lg border border-emerald-100">{e.name ? e.name[0] : '?'}</div>
                   <div>
                      <h4 className="font-bold text-slate-800 text-sm">{e.name}</h4>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-slate-400 font-black uppercase">{e.role}</span>
                        <div className="w-1 h-1 bg-slate-300 rounded-full"></div>
                        <span className="text-[10px] text-slate-400 font-black uppercase">{e.department}</span>
                      </div>
                   </div>
                </div>
                <div className="text-right flex flex-col items-end gap-2">
                  <div className="flex items-center gap-2 text-[10px] text-slate-500 font-bold">
                    <Phone size={12}/> {e.phone}
                  </div>
                  <Badge variant="success">{e.status || 'Active'}</Badge>
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleEditPerson(e)} className="px-2 py-1 text-[10px] font-bold rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 flex items-center gap-1"><Edit3 size={12}/>Edit</button>
                    <button onClick={() => handleDeletePerson(e)} className="px-2 py-1 text-[10px] font-bold rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 flex items-center gap-1"><Trash2 size={12}/>Delete</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );

  const LicenseListView = () => (
    <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
      <Header title="The Vault" showBack onBack={() => setActiveTab('dashboard')} />
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="relative flex-1 max-w-md w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            placeholder="Search assets, providers..." 
            className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-indigo-500/5 transition-all shadow-sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Button icon={Plus} onClick={() => { setSelectedLicense(null); setIsLicenseModalOpen(true); }} className="w-full md:w-auto">New Asset</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {licenses.filter(l => l.name?.toLowerCase().includes(searchQuery.toLowerCase()) || l.provider?.toLowerCase().includes(searchQuery.toLowerCase())).map(l => (
          <Card key={l.id} className="group hover:border-indigo-300 transition-all">
            <div className="flex justify-between items-start mb-4">
              <Badge variant={l.status === 'Active' || l.status === 'ACTIVE' ? 'success' : 'danger'}>{l.status}</Badge>
              <div className="flex items-center gap-1">
                <button onClick={() => handleManualSend(l)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"><Send size={16} /></button>
                <button onClick={() => { setSelectedLicense(l); setIsLicenseModalOpen(true); }} className="p-2 text-slate-400 hover:text-indigo-600 rounded-lg"><Edit3 size={16} /></button>
              </div>
            </div>
            <h4 className="text-lg font-black text-slate-800 mb-1 leading-tight">{l.name}</h4>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-6">{l.provider}</p>
            
            <div className="space-y-3 pt-4 border-t border-slate-100">
               <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
                  <span className="text-slate-400">Dispatch Group</span>
                  <span className="text-slate-800">{(l.responsibleIds?.length || 0) + (l.stakeholderIds?.length || 0)} Recipient(s)</span>
               </div>
               <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
                  <span className="text-slate-400">Valuation</span>
                  <span className="text-indigo-600 font-bold">${Number(l.cost || 0).toLocaleString()}</span>
               </div>
               <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
                  <span className="text-slate-400">Expiry</span>
                  <span className="text-rose-600 font-bold">{l.expiryDate}</span>
               </div>
            </div>

            <Button variant="secondary" className="w-full mt-6 text-xs py-2.5" onClick={() => { setSelectedLicense(l); setCurrentView('detail'); }}>Inspect Report</Button>
          </Card>
        ))}
      </div>
    </div>
  );

  const MailLogsView = () => (
    <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
      <Header title="Notification Hub" showBack onBack={() => setActiveTab('dashboard')} />
      <Card noPadding>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-400 text-[10px] uppercase font-black tracking-widest border-b border-slate-100">
              <tr>
                <th className="px-6 py-4">Asset</th>
                <th className="px-6 py-4">Recipient</th>
                <th className="px-6 py-4">Type</th>
                <th className="px-6 py-4">Subject</th>
                <th className="px-6 py-4">Sent At</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Audit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {mailLogs.length > 0 ? mailLogs.map(log => (
                <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 font-bold text-indigo-600">{log.licenseName}</td>
                  <td className="px-6 py-4">
                    <div className="font-bold text-slate-800">{log.recipient}</div>
                    <div className="text-[10px] text-slate-400 font-mono tracking-tight break-all max-w-[220px]">{log.email}</div>
                  </td>
                  <td className="px-6 py-4">
                     <Badge variant={String(log.type).toUpperCase().includes('RESPONSIBLE') ? 'indigo' : 'info'}>{log.type}</Badge>
                  </td>
                  <td className="px-6 py-4 text-slate-700 text-xs font-bold max-w-[260px]">
                    <div className="line-clamp-2">{log.subject || '-'}</div>
                  </td>
                  <td className="px-6 py-4 text-slate-500 font-mono text-[10px]">{formatDateTime(log.timestamp)}</td>
                  <td className="px-6 py-4">
                    <Badge variant={log.status === 'FAILED' ? 'danger' : 'success'}>{log.status || 'SENT'}</Badge>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button onClick={() => setViewingMail(log)} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"><Eye size={18} /></button>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan="7" className="px-6 py-24 text-center text-slate-400 italic">Audit trail empty. Trigger a manual notification from the Vault.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex font-sans text-slate-900">
      {/* Sidebar */}
      <aside className="hidden lg:flex flex-col w-64 border-r border-slate-200 bg-white sticky top-0 h-screen z-10">
        <div className="p-8 flex items-center gap-3">
          <div className="bg-indigo-600 p-2.5 rounded-2xl text-white shadow-lg shadow-indigo-100 rotate-3"><ShieldCheck size={26} /></div>
          <span className="font-black text-2xl tracking-tighter text-slate-900">Licensure.</span>
        </div>
        
        <nav className="flex-1 p-6 space-y-2">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
            { id: 'licenses', label: 'License Vault', icon: FileText },
            { id: 'logs', label: 'Mail Logs', icon: Mail },
            { id: 'people', label: 'Registry', icon: Users },
          ].map(item => (
            <button
              key={item.id}
              onClick={() => { setActiveTab(item.id); setCurrentView('list'); }}
              className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all group ${
                activeTab === item.id ? 'bg-indigo-600 text-white font-bold shadow-lg shadow-indigo-50' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900 font-semibold'
              }`}
            >
              <item.icon size={20} />
              <span className="text-[13px]">{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-6 lg:p-10 overflow-x-hidden">
        {activeTab === 'dashboard' && <DashboardView />}
        {activeTab === 'licenses' && currentView === 'list' && <LicenseListView />}
        
        {activeTab === 'licenses' && currentView === 'detail' && selectedLicense && (
           <div className="space-y-8 animate-in fade-in">
              <Header title={selectedLicense.name} showBack onBack={() => setCurrentView('list')} />
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <Card className="lg:col-span-2">
                   <h3 className="font-black text-slate-800 mb-6 flex items-center gap-2"><Info size={18} className="text-indigo-600" /> Technical Matrix</h3>
                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                      <div><p className="text-[10px] font-black text-slate-400 uppercase mb-1">Provider</p><p className="font-bold text-slate-800">{selectedLicense.provider}</p></div>
                      <div><p className="text-[10px] font-black text-slate-400 uppercase mb-1">Asset Value</p><p className="font-bold text-indigo-600">${Number(selectedLicense.cost || 0).toLocaleString()}</p></div>
                      <div><p className="text-[10px] font-black text-slate-400 uppercase mb-1">Issued Date</p><p className="font-bold text-slate-800">{selectedLicense.issuedDate}</p></div>
                      <div><p className="text-[10px] font-black text-slate-400 uppercase mb-1">Termination Point</p><p className="font-bold text-rose-600">{selectedLicense.expiryDate}</p></div>
                   </div>
                   <div className="mt-8 pt-8 border-t border-slate-100">
                      <p className="text-[10px] font-black text-slate-400 uppercase mb-3">Auto Mail Schedule</p>
                      <div className="flex flex-wrap gap-2">
                        {selectedLicense.notifySixMonth && <Badge variant="indigo">6 Months</Badge>}
                        {selectedLicense.notifyMonthly && <Badge variant="info">Monthly 1st</Badge>}
                        {selectedLicense.notifyDailyLast30 && <Badge variant="warning">Daily Last 30</Badge>}
                        {!selectedLicense.notifySixMonth && !selectedLicense.notifyMonthly && !selectedLicense.notifyDailyLast30 && (
                          <Badge>No Auto Mail</Badge>
                        )}
                      </div>
                   </div>
                   <div className="mt-8 pt-8 border-t border-slate-100">
                      <p className="text-[10px] font-black text-slate-400 uppercase mb-2">Internal Metadata / Description</p>
                      <p className="text-sm text-slate-600 font-medium leading-relaxed bg-slate-50 p-4 rounded-2xl border border-slate-100">{selectedLicense.description || 'No description provided.'}</p>
                   </div>
                </Card>

                <div className="space-y-8">
                   <Card>
                      <h3 className="font-black text-slate-400 text-[10px] uppercase mb-4 tracking-widest">Notification Dispatch Group</h3>
                      <div className="space-y-6">
                         <div>
                            <p className="text-[10px] font-black text-emerald-600 uppercase mb-2">Responsibles (${selectedLicense.responsibleIds?.length || 0})</p>
                            <div className="space-y-2">
                               {selectedLicense.responsibleIds?.map(id => {
                                 const e = employees.find(x => x.id === id);
                                 return (
                                   <div key={id} className="flex items-center gap-3 p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                                      <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white text-[10px] font-bold">{e?.name ? e.name[0] : '?'}</div>
                                      <div>
                                        <p className="text-xs font-bold text-emerald-900">{e?.name || 'Unknown'}</p>
                                        <p className="text-[9px] text-emerald-600 font-bold uppercase">{e?.department || 'N/A'}</p>
                                      </div>
                                   </div>
                                 );
                               })}
                            </div>
                         </div>
                         <div>
                            <p className="text-[10px] font-black text-sky-600 uppercase mb-2">Stakeholders (${selectedLicense.stakeholderIds?.length || 0})</p>
                            <div className="space-y-2">
                               {selectedLicense.stakeholderIds?.map(id => {
                                 const s = stakeholders.find(x => x.id === id);
                                 return (
                                   <div key={id} className="flex items-center gap-3 p-3 bg-sky-50 rounded-xl border border-sky-100">
                                      <div className="w-8 h-8 rounded-lg bg-sky-600 flex items-center justify-center text-white text-[10px] font-bold">{s?.name ? s.name[0] : '?'}</div>
                                      <div>
                                        <p className="text-xs font-bold text-sky-900">{s?.name || 'Unknown'}</p>
                                        <p className="text-[9px] text-sky-600 font-bold uppercase">{s?.department || 'N/A'}</p>
                                      </div>
                                   </div>
                                 );
                               })}
                            </div>
                         </div>
                      </div>
                   </Card>
                </div>
              </div>
           </div>
        )}

        {activeTab === 'people' && <PeopleRegistryView />}
        {activeTab === 'logs' && <MailLogsView />}
      </main>

      {/* License Configurator */}
      {isLicenseModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <Card className="w-full max-w-4xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto" noPadding>
            <div className="p-6 border-b sticky top-0 bg-white z-10 flex justify-between items-center">
              <h3 className="text-xl font-black">Asset Configurator</h3>
              <button onClick={() => setIsLicenseModalOpen(false)} className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center transition-colors">✕</button>
            </div>
            <form className="p-8 space-y-8" onSubmit={(e) => {
               e.preventDefault();
               const fd = new FormData(e.target);
               handleSaveLicense(Object.fromEntries(fd));
            }}>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-400 px-1">Asset Name</label><input required name="name" defaultValue={selectedLicense?.name} className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 outline-none focus:border-indigo-500 font-bold" /></div>
                <div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-400 px-1">Provider</label><input required name="provider" defaultValue={selectedLicense?.provider} className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 outline-none focus:border-indigo-500 font-bold" /></div>
                <div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-400 px-1">Valuation ($)</label><input type="number" required name="cost" defaultValue={selectedLicense?.cost} className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 outline-none focus:border-indigo-500 font-bold" /></div>
                <div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-400 px-1">Issued Date</label><input type="date" required name="issuedDate" defaultValue={formatDateInput(selectedLicense?.issuedDate)} className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 outline-none focus:border-indigo-500 font-bold" /></div>
                <div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-400 px-1">Start Date</label><input type="date" required name="startDate" defaultValue={formatDateInput(selectedLicense?.startDate)} className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 outline-none focus:border-indigo-500 font-bold" /></div>
                <div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-400 px-1">Expiry Date</label><input type="date" required name="expiryDate" defaultValue={formatDateInput(selectedLicense?.expiryDate)} className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 outline-none focus:border-indigo-500 font-bold" /></div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                 <div className="space-y-3">
                    <p className="text-[10px] font-black uppercase text-emerald-600 px-1 flex items-center gap-2"><ShieldCheck size={14}/> Primary Responsibles</p>
                    <div className="max-h-56 overflow-y-auto border border-slate-100 rounded-2xl p-4 space-y-2 bg-slate-50/50">
                       {employees.map(e => (
                         <label key={e.id} className="flex items-center gap-3 cursor-pointer group p-2 hover:bg-white rounded-xl transition-all border border-transparent hover:border-slate-100">
                            <input type="checkbox" name="responsibleIds" value={e.id} defaultChecked={selectedLicense?.responsibleIds?.includes(e.id)} className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                            <div className="text-xs font-bold text-slate-700 group-hover:text-indigo-600">{e.name} <span className="text-[9px] text-slate-400 uppercase font-black ml-1">[{e.role}]</span></div>
                         </label>
                       ))}
                    </div>
                 </div>
                 <div className="space-y-3">
                    <p className="text-[10px] font-black uppercase text-sky-600 px-1 flex items-center gap-2"><Users size={14}/> Stakeholders</p>
                    <div className="max-h-56 overflow-y-auto border border-slate-100 rounded-2xl p-4 space-y-2 bg-slate-50/50">
                       {stakeholders.map(s => (
                         <label key={s.id} className="flex items-center gap-3 cursor-pointer group p-2 hover:bg-white rounded-xl transition-all border border-transparent hover:border-slate-100">
                            <input type="checkbox" name="stakeholderIds" value={s.id} defaultChecked={selectedLicense?.stakeholderIds?.includes(s.id)} className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                            <div className="text-xs font-bold text-slate-700 group-hover:text-indigo-600">{s.name} <span className="text-[9px] text-slate-400 uppercase font-black ml-1">[{s.designation || s.role}]</span></div>
                         </label>
                       ))}
                    </div>
                 </div>
              </div>

              <div className="space-y-3">
                 <p className="text-[10px] font-black uppercase text-indigo-600 px-1 flex items-center gap-2"><Mail size={14}/> Auto Mail Schedule</p>
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <label className="flex items-start gap-3 p-4 rounded-2xl border border-slate-200 bg-slate-50 cursor-pointer hover:bg-white transition-colors">
                      <input
                        type="checkbox"
                        name="notifySixMonth"
                        defaultChecked={selectedLicense?.notifySixMonth}
                        className="mt-0.5 w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <div>
                        <p className="text-xs font-black text-slate-800">6 Months Before</p>
                        <p className="text-[10px] text-slate-500 font-semibold">Send once exactly at 6 months. If already within 6 months, send immediately after create.</p>
                      </div>
                    </label>
                    <label className="flex items-start gap-3 p-4 rounded-2xl border border-slate-200 bg-slate-50 cursor-pointer hover:bg-white transition-colors">
                      <input
                        type="checkbox"
                        name="notifyMonthly"
                        defaultChecked={selectedLicense?.notifyMonthly}
                        className="mt-0.5 w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <div>
                        <p className="text-xs font-black text-slate-800">Monthly (1st)</p>
                        <p className="text-[10px] text-slate-500 font-semibold">After the 6-month point, send on every month 1st until last 30 days.</p>
                      </div>
                    </label>
                    <label className="flex items-start gap-3 p-4 rounded-2xl border border-slate-200 bg-slate-50 cursor-pointer hover:bg-white transition-colors">
                      <input
                        type="checkbox"
                        name="notifyDailyLast30"
                        defaultChecked={selectedLicense?.notifyDailyLast30}
                        className="mt-0.5 w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <div>
                        <p className="text-xs font-black text-slate-800">Daily (Last 30)</p>
                        <p className="text-[10px] text-slate-500 font-semibold">Send daily reminders in the final 30 days before expiry.</p>
                      </div>
                    </label>
                 </div>
              </div>

              <div className="space-y-1">
                 <label className="text-[10px] font-black uppercase text-slate-400 px-1">Technical Notes / Description</label>
                 <textarea name="description" rows="3" defaultValue={selectedLicense?.description} className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-200 text-sm font-medium outline-none focus:border-indigo-500" placeholder="Details about specific license conditions..."></textarea>
              </div>

              <div className="flex justify-end gap-3 pt-6 border-t">
                 <Button variant="ghost" onClick={() => setIsLicenseModalOpen(false)}>Cancel</Button>
                 <Button type="submit">Commit to Registry</Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Mail Content Audit */}
      {viewingMail && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
           <Card className="w-full max-w-lg shadow-2xl border-indigo-100">
              <div className="flex justify-between items-center mb-6">
                 <h3 className="font-black text-slate-800">Mail Dispatch Log</h3>
                 <button onClick={() => setViewingMail(null)} className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center transition-colors">✕</button>
              </div>
              <div className="space-y-4">
                 <div className="grid grid-cols-2 gap-4 text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <div>
                      <p>Recipient</p>
                      <p className="text-slate-800 font-bold mt-1">{viewingMail.recipient}</p>
                    </div>
                    <div>
                      <p>Mail Address</p>
                      <p className="text-indigo-600 font-bold mt-1">{viewingMail.email}</p>
                    </div>
                    <div>
                      <p>Asset</p>
                      <p className="text-slate-800 font-bold mt-1">{viewingMail.licenseName}</p>
                    </div>
                    <div>
                      <p>Sent At</p>
                      <p className="text-slate-800 font-bold mt-1">{formatDateTime(viewingMail.timestamp)}</p>
                    </div>
                 </div>
                 <div className="grid grid-cols-2 gap-4 text-[10px] font-black text-slate-400 uppercase tracking-widest bg-white p-4 rounded-2xl border border-slate-100">
                    <div>
                      <p>Type</p>
                      <p className="text-slate-800 font-bold mt-1">{viewingMail.type}</p>
                    </div>
                    <div>
                      <p>Status</p>
                      <p className="text-slate-800 font-bold mt-1">{viewingMail.status || 'SENT'}</p>
                    </div>
                 </div>
                 <div className="space-y-2">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Subject</p>
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-slate-800 font-bold text-xs">
                      {viewingMail.subject || '-'}
                    </div>
                 </div>
                 <div className="p-6 bg-slate-900 text-emerald-400 rounded-2xl font-mono text-[11px] leading-relaxed whitespace-pre-wrap border border-slate-800 shadow-inner">
                    {viewingMail.content}
                 </div>
              </div>
              <Button className="w-full mt-6" onClick={() => setViewingMail(null)}>Close Audit View</Button>
           </Card>
        </div>
      )}

      {/* Message Template Configurator */}
      {isTemplateModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
          <Card className="w-full max-w-4xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto" noPadding>
            <div className="p-6 border-b sticky top-0 bg-white z-10 flex justify-between items-center">
              <h3 className="text-xl font-black">Message Template Configurator</h3>
              <button onClick={() => { setIsTemplateModalOpen(false); setTemplateError(null); }} className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center transition-colors">✕</button>
            </div>
            <form className="p-8 space-y-8" onSubmit={(e) => {
              e.preventDefault();
              const d = new FormData(e.target);
              handleSaveMessageTemplates(Object.fromEntries(d));
            }}>
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                <p className="text-[11px] font-black text-slate-700 uppercase tracking-wider mb-2">Available Auto Placeholders</p>
                <p className="text-xs text-slate-600 font-semibold leading-relaxed">
                  Use these anywhere in subject/body: <code>{'{{person_name}}'}</code>, <code>{'{{license_name}}'}</code>, <code>{'{{expiry_date}}'}</code>, <code>{'{{days_left}}'}</code>, <code>{'{{provider}}'}</code>, <code>{'{{person_email}}'}</code>, <code>{'{{issued_date}}'}</code>, <code>{'{{start_date}}'}</code>, <code>{'{{role}}'}</code>.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-3">
                  <p className="text-[10px] font-black uppercase text-emerald-600 px-1">Responsible Template</p>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-400 px-1">Subject</label>
                    <input
                      required
                      name="responsibleSubject"
                      defaultValue={messageTemplates.responsibleSubject}
                      className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 outline-none focus:border-indigo-500 font-bold"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-400 px-1">Body</label>
                    <textarea
                      required
                      name="responsibleBody"
                      rows="12"
                      defaultValue={messageTemplates.responsibleBody}
                      className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-200 text-sm font-medium outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
                <div className="space-y-3">
                  <p className="text-[10px] font-black uppercase text-sky-600 px-1">Stakeholder Template</p>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-400 px-1">Subject</label>
                    <input
                      required
                      name="stakeholderSubject"
                      defaultValue={messageTemplates.stakeholderSubject}
                      className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 outline-none focus:border-indigo-500 font-bold"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-400 px-1">Body</label>
                    <textarea
                      required
                      name="stakeholderBody"
                      rows="12"
                      defaultValue={messageTemplates.stakeholderBody}
                      className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-200 text-sm font-medium outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {templateError && (
                <div className="px-3 py-2 rounded-lg bg-rose-50 text-rose-700 text-xs font-bold border border-rose-100">
                  {templateError}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-6 border-t">
                <Button variant="ghost" onClick={() => { setIsTemplateModalOpen(false); setTemplateError(null); }}>Cancel</Button>
                <Button type="submit">Save Templates</Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Person Create Form */}
      {isPersonModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <Card className="w-full max-w-md animate-in zoom-in-95 shadow-2xl" noPadding>
            <div className="p-6 border-b flex justify-between items-center bg-slate-50/50">
              <h3 className="text-xl font-black">{selectedPerson ? 'Edit' : 'Register'} {personType === 'stakeholder' ? 'Stakeholder' : 'Responsible'}</h3>
              <button onClick={() => { setIsPersonModalOpen(false); setSelectedPerson(null); setPersonError(null); }} className="w-8 h-8 rounded-full hover:bg-slate-200 flex items-center justify-center transition-colors">✕</button>
            </div>
            <form className="p-8 space-y-5" onSubmit={(e) => {
              e.preventDefault();
              const d = new FormData(e.target);
              handleSavePerson(Object.fromEntries(d));
            }}>
              <div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-400 px-1">Legal Full Name</label><input required name="name" defaultValue={selectedPerson?.name || ''} className="w-full p-3.5 bg-slate-50 border rounded-xl outline-none focus:border-indigo-500 font-bold" /></div>
              <div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-400 px-1">Corporate Email</label><input type="email" required name="email" defaultValue={selectedPerson?.email || ''} className="w-full p-3.5 bg-slate-50 border rounded-xl outline-none focus:border-indigo-500 font-bold" /></div>
              <div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-400 px-1">Contact Phone</label><input required name="phone" defaultValue={selectedPerson?.phone || ''} placeholder="+1 (555) 000-0000" className="w-full p-3.5 bg-slate-50 border rounded-xl outline-none focus:border-indigo-500 font-bold" /></div>
              <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-400 px-1">{personType === 'employee' ? 'Role / Title' : 'Designation'}</label><input required name="designation" defaultValue={selectedPerson?.designation || ''} className="w-full p-3.5 bg-slate-50 border rounded-xl outline-none focus:border-indigo-500 font-bold text-xs" /></div>
                 <div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-400 px-1">Department</label><input required name="department" defaultValue={selectedPerson?.department || ''} className="w-full p-3.5 bg-slate-50 border rounded-xl outline-none focus:border-indigo-500 font-bold text-xs" /></div>
              </div>
              {personError && (
                <div className="px-3 py-2 rounded-lg bg-rose-50 text-rose-700 text-xs font-bold border border-rose-100">
                  {personError}
                </div>
              )}
              <div className="flex justify-end gap-3 pt-6 border-t"><Button variant="ghost" onClick={() => { setIsPersonModalOpen(false); setSelectedPerson(null); setPersonError(null); }}>Cancel</Button><Button type="submit">{selectedPerson ? 'Save Changes' : 'Complete Registration'}</Button></div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
};

export default App;

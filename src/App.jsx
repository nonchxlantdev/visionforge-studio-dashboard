import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import ElectricBorder from "./ElectricBorder.jsx";
import logoUrl from "../assets/vision-forge-logo.png";
import { isSupabaseConfigured, supabase } from "./lib/supabase.js";

const STORAGE_KEY = "vision-forge-react-dashboard-v1";

const statuses = [
  { id: "not-started", label: "Not Started", color: "#687386", progress: 0 },
  { id: "in-progress", label: "In Progress", color: "#8068d9", progress: 45 },
  { id: "review", label: "In Review", color: "#f5a623", progress: 80 },
  { id: "completed", label: "Completed", color: "#14a86b", progress: 100 },
];

const projectStatuses = [
  { id: "active", label: "Active" },
  { id: "reviewing", label: "Reviewing" },
  { id: "completed", label: "Completed" },
  { id: "closed", label: "Closed" },
  { id: "cancelled", label: "Cancelled" },
];

const roles = {
  Admin: "Full control",
  User: "View dashboard, project work, inbox, and update assigned tasks",
};

const today = new Date();
const CloseModalContext = createContext(() => {});
const ownerEmail = "glenrickmspain@hotmail.com";

const initialState = {
  loggedIn: false,
  activeView: "dashboard",
  notificationOpen: false,
  activeProjectId: "",
  activeProjectStatus: "active",
  search: "",
  movingTaskId: "",
  user: {
    id: "u1",
    name: "Glenrick Spain",
    legalName: "Glenrick Spain",
    displayName: "Glenrick Spain",
    title: "CEO",
    email: ownerEmail,
    phone: "",
    workPhone: "",
    gender: "",
    dob: "",
    homeAddress: "",
    photo: "",
    status: "Active",
    lastLogin: "Today",
    activity: ["Created the Vision Forge Studio workspace."],
    role: "Admin",
    initials: "GS",
  },
  users: [
    {
      id: "u1",
      name: "Glenrick Spain",
      legalName: "Glenrick Spain",
      displayName: "Glenrick Spain",
      title: "CEO",
      email: ownerEmail,
      phone: "",
      workPhone: "",
      gender: "",
      dob: "",
      homeAddress: "",
      photo: "",
      status: "Active",
      lastLogin: "Today",
      activity: ["Created the Vision Forge Studio workspace."],
      role: "Admin",
      groupIds: ["g1"],
      initials: "GS",
    },
  ],
  groups: [
    {
      id: "g1",
      name: "Leadership",
      description: "Owners and operators with full workspace visibility.",
      memberIds: ["u1"],
    },
  ],
  projects: [],
  tasks: [],
  messages: [],
  notifications: [],
  updates: [],
};

function createId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return initialState;
  try {
    const parsed = JSON.parse(saved);
    return {
      ...initialState,
      ...parsed,
      notificationOpen: false,
      movingTaskId: "",
      projects: (parsed.projects || []).map(project => ({ status: "active", ...project })),
      tasks: parsed.tasks || [],
      users: (parsed.users || initialState.users).map(user => normalizeUser(user)),
      groups: parsed.groups || initialState.groups,
      notifications: parsed.notifications || [],
      updates: parsed.updates || [],
      messages: parsed.messages || [],
    };
  } catch {
    return initialState;
  }
}

export default function App() {
  const [state, setState] = useState(loadState);
  const [modal, setModal] = useState(null);
  const [authMessage, setAuthMessage] = useState("");
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, notificationOpen: false, movingTaskId: "" }));
  }, [state]);

  const helpers = useMemo(() => createHelpers(state), [state]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setAuthLoading(false);
      return undefined;
    }

    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data.session?.user) {
        syncSupabaseUser(data.session.user);
      }
      setAuthLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        syncSupabaseUser(session.user);
      } else {
        patch({ loggedIn: false });
      }
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  function patch(updater) {
    setState(current => {
      const next = typeof updater === "function" ? updater(current) : { ...current, ...updater };
      return next;
    });
  }

  async function syncSupabaseUser(authUser) {
    const appUser = await upsertSupabaseProfile(authUser);
    patch(current => ({
      ...current,
      loggedIn: true,
      user: appUser,
      users: current.users.some(user => user.id === appUser.id)
        ? current.users.map(user => user.id === appUser.id ? { ...user, ...appUser } : user)
        : [appUser, ...current.users.filter(user => user.email !== appUser.email)],
    }));
  }

  async function handleEmailLogin({ email, password }) {
    setAuthMessage("");
    if (!isSupabaseConfigured || !supabase) {
      patch({ loggedIn: true });
      return;
    }
    if (!email || !password) {
      setAuthMessage("Enter your email and password.");
      return;
    }
    setAuthLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setAuthLoading(false);
    if (error) setAuthMessage(error.message);
  }

  async function handleEmailSignup({ email, password }) {
    setAuthMessage("");
    if (!isSupabaseConfigured || !supabase) {
      patch({ loggedIn: true });
      return;
    }
    if (!email || !password) {
      setAuthMessage("Enter your email and password.");
      return;
    }
    setAuthLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          legal_name: "Glenrick Spain",
          display_name: "Glenrick Spain",
          role: email.toLowerCase() === ownerEmail ? "Admin" : "User",
        },
      },
    });
    setAuthLoading(false);
    if (error) {
      setAuthMessage(error.message);
    } else {
      setAuthMessage("Account created. Check your email if Supabase requires confirmation, then sign in.");
    }
  }

  async function handleGoogleLogin() {
    setAuthMessage("");
    if (!isSupabaseConfigured || !supabase) return;
    const redirectTo = window.location.origin === "null"
      ? "https://nonchxlantdev.github.io/visionforge-studio-dashboard/"
      : window.location.href;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error) setAuthMessage(error.message);
  }

  async function handleLogout() {
    if (isSupabaseConfigured && supabase) {
      await supabase.auth.signOut();
    }
    patch({ loggedIn: false, notificationOpen: false });
  }

  function addUpdate(title, detail, targetType = "", targetId = "", dateValue = new Date()) {
    const date = normalizeDate(dateValue);
    const update = {
      id: createId(),
      title,
      detail,
      date,
      time: date === normalizeDate(new Date()) ? "Today" : formatDate(date),
      read: false,
      targetType,
      targetId,
    };
    patch(current => ({
      ...current,
      updates: [update, ...current.updates],
      notifications: [update, ...current.notifications],
    }));
  }

  function openTask(taskId) {
    const task = state.tasks.find(item => item.id === taskId);
    if (!task) return;
    patch({ activeProjectId: task.projectId, activeView: "dashboard", notificationOpen: false });
    setModal({ type: "task", id: taskId });
  }

  function openProject(projectId) {
    const project = state.projects.find(item => item.id === projectId);
    if (!project) return;
    patch({ activeProjectStatus: project.status || "active", notificationOpen: false });
    setModal({ type: "project", id: projectId });
  }

  function handleNotificationClick(notification) {
    patch(current => ({
      ...current,
      notificationOpen: false,
      notifications: current.notifications.map(item => item.id === notification.id ? { ...item, read: true } : item),
    }));
    if (notification.targetType === "task") openTask(notification.targetId);
    if (notification.targetType === "project") {
      patch({ activeView: "projects" });
      openProject(notification.targetId);
    }
    if (notification.targetType === "admin") patch({ activeView: "admin" });
  }

  function moveTask(taskId, status) {
    const task = state.tasks.find(item => item.id === taskId);
    if (!task || task.status === "completed" || task.status === status) return;
    setState(current => ({
      ...current,
      tasks: current.tasks.map(item => item.id === taskId ? { ...item, status } : item),
    }));
    addUpdate("Task status updated", `${task.title} moved to ${statusLabel(status)}.`, "task", taskId);
  }

  function createProject(form, files) {
    const project = {
      id: createId(),
      name: form.get("name").trim(),
      description: form.get("description").trim(),
      startDate: form.get("startDate"),
      deadline: form.get("deadline"),
      status: form.get("status"),
      attachments: files.map(file => ({ name: file.name, size: file.size, type: file.type || "File" })),
      color: randomColor(),
    };
    patch(current => ({
      ...current,
      projects: [...current.projects, project],
      activeProjectId: project.id,
      activeView: "dashboard",
    }));
    addUpdate("Project created", `${project.name} was created.`, "project", project.id, project.startDate);
    setModal(null);
  }

  function createTask(form) {
    const task = {
      id: createId(),
      projectId: form.get("projectId"),
      title: form.get("title").trim(),
      type: form.get("type").trim(),
      description: form.get("description").trim(),
      status: form.get("status"),
      priority: form.get("priority"),
      deadline: form.get("deadline"),
      assignees: form.getAll("assignees"),
      comments: [],
    };
    patch(current => ({
      ...current,
      tasks: [...current.tasks, task],
      activeProjectId: task.projectId,
      activeView: "dashboard",
    }));
    addUpdate("Task created", `${task.title} was added to ${helpers.getProject(task.projectId)?.name || "a project"}.`, "task", task.id, task.deadline);
    setModal(null);
    setModal({ type: "task", id: task.id });
  }

  async function createUser(form, photo = "") {
    const displayName = form.get("displayName").trim() || form.get("name").trim();
    const legalName = form.get("legalName").trim() || displayName;
    const password = form.get("password");
    let authUserId = createId();

    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.functions.invoke("admin-create-user", {
        body: {
          email: form.get("email").trim(),
          password,
          legalName,
          displayName,
          phone: form.get("phone").trim(),
          workPhone: form.get("workPhone").trim(),
          gender: form.get("gender"),
          dob: form.get("dob") || null,
          homeAddress: form.get("homeAddress").trim(),
          photoUrl: "",
          role: form.get("role"),
          status: form.get("status"),
          groupIds: form.getAll("groups"),
        },
      });
      if (error) {
        alert(`Supabase user creation failed: ${error.message}`);
        return;
      }
      authUserId = data?.user?.id || authUserId;
    }

    const user = {
      id: authUserId,
      name: displayName,
      legalName,
      displayName,
      title: form.get("title").trim(),
      email: form.get("email").trim(),
      phone: form.get("phone").trim(),
      workPhone: form.get("workPhone").trim(),
      gender: form.get("gender"),
      dob: form.get("dob"),
      homeAddress: form.get("homeAddress").trim(),
      photo,
      status: form.get("status"),
      lastLogin: "Never",
      activity: [`${displayName} was created as ${form.get("role")}.`],
      role: form.get("role"),
      groupIds: form.getAll("groups"),
      initials: initialsFromName(displayName),
    };
    patch(current => ({
      ...current,
      users: [...current.users, user],
      groups: current.groups.map(group => user.groupIds.includes(group.id) ? { ...group, memberIds: [...group.memberIds, user.id] } : group),
    }));
    addUpdate("User created", `${user.name} was added as ${user.role}.`, "admin", user.id);
    setModal(null);
  }

  async function resetUserPassword(email) {
    if (!isSupabaseConfigured || !supabase) {
      alert("Supabase is not configured for password reset.");
      return;
    }
    const redirectTo = window.location.origin === "null"
      ? "https://nonchxlantdev.github.io/visionforge-studio-dashboard/"
      : window.location.href;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) {
      alert(`Password reset failed: ${error.message}`);
      return;
    }
    alert(`Password reset email sent to ${email}.`);
  }

  function updateUser(userId, form, photo = "") {
    const displayName = form.get("displayName").trim() || form.get("name").trim();
    const legalName = form.get("legalName").trim() || displayName;
    patch(current => ({
      ...current,
      users: current.users.map(user => user.id === userId ? {
        ...user,
        name: displayName,
        legalName,
        displayName,
        title: form.get("title").trim(),
        email: form.get("email").trim(),
        phone: form.get("phone").trim(),
        workPhone: form.get("workPhone").trim(),
        gender: form.get("gender"),
        dob: form.get("dob"),
        homeAddress: form.get("homeAddress").trim(),
        photo: photo || user.photo,
        status: form.get("status"),
        role: form.get("role"),
        groupIds: form.getAll("groups"),
        initials: initialsFromName(displayName),
        activity: [`${displayName}'s profile was updated.`, ...(user.activity || [])],
      } : user),
      groups: current.groups.map(group => ({
        ...group,
        memberIds: form.getAll("groups").includes(group.id)
          ? [...new Set([...group.memberIds, userId])]
          : group.memberIds.filter(id => id !== userId),
      })),
    }));
    addUpdate("User updated", `${displayName}'s profile was updated.`, "admin", userId);
    setModal({ type: "user-detail", id: userId });
  }

  function createGroup(form) {
    const group = {
      id: createId(),
      name: form.get("name").trim(),
      description: form.get("description").trim(),
      memberIds: form.getAll("members"),
    };
    patch(current => ({
      ...current,
      groups: [...current.groups, group],
      users: current.users.map(user => group.memberIds.includes(user.id) ? { ...user, groupIds: [...new Set([...user.groupIds, group.id])] } : user),
    }));
    addUpdate("Group created", `${group.name} was created.`, "admin", group.id);
    setModal(null);
  }

  function updateProjectStatus(projectId, status) {
    const project = state.projects.find(item => item.id === projectId);
    patch(current => ({
      ...current,
      projects: current.projects.map(item => item.id === projectId ? { ...item, status } : item),
      activeProjectId: ["completed", "closed", "cancelled"].includes(status) && current.activeProjectId === projectId ? "" : current.activeProjectId,
    }));
    addUpdate("Project status updated", `${project?.name || "Project"} moved to ${projectStatusLabel(status)}.`, "project", projectId);
    setModal(null);
  }

  function addComment(taskId, text) {
    const task = state.tasks.find(item => item.id === taskId);
    if (!task || !text.trim()) return;
    patch(current => ({
      ...current,
      tasks: current.tasks.map(item => item.id === taskId
        ? { ...item, comments: [...item.comments, { by: state.user.name, userId: state.user.id, text: text.trim(), date: normalizeDate(new Date()) }] }
        : item),
    }));
    addUpdate("New comment", `${state.user.name} commented on ${task.title}.`, "task", task.id);
  }

  if (!state.loggedIn) {
    return (
      <Login
        onLogin={handleEmailLogin}
        onSignup={handleEmailSignup}
        onGoogle={handleGoogleLogin}
        email={ownerEmail}
        message={authMessage}
        loading={authLoading}
      />
    );
  }

  return (
    <section className="app-shell">
      <Sidebar state={state} patch={patch} />
      <section className="main">
        <Topbar
          state={state}
          patch={patch}
          openProjectModal={() => setModal({ type: "new-project" })}
          openTaskModal={() => state.projects.length ? setModal({ type: "new-task" }) : setModal({ type: "new-project" })}
          onNotificationClick={handleNotificationClick}
          onLogout={handleLogout}
        />
        {state.activeView === "admin" && <AdminView state={state} setModal={setModal} resetUserPassword={resetUserPassword} />}
        {state.activeView === "projects" && <ProjectTasksView state={state} helpers={helpers} patch={patch} setModal={setModal} openTask={openTask} openProject={openProject} />}
        {state.activeView === "inbox" && <InboxView messages={state.messages} />}
        {state.activeView === "dashboard" && (
          <DashboardBoard
            state={state}
            helpers={helpers}
            patch={patch}
            setModal={setModal}
            openTask={openTask}
            moveTask={moveTask}
          />
        )}
      </section>
      <Modal modal={modal} state={state} helpers={helpers} onClose={() => setModal(null)}>
        {modal?.type === "new-project" && <ProjectForm onSubmit={createProject} />}
        {modal?.type === "new-task" && <TaskForm state={state} onSubmit={createTask} />}
        {modal?.type === "new-user" && <UserForm state={state} onSubmit={createUser} />}
        {modal?.type === "edit-user" && <UserForm state={state} user={state.users.find(item => item.id === modal.id)} onSubmit={(form, photo) => updateUser(modal.id, form, photo)} />}
        {modal?.type === "user-detail" && <UserDetail user={state.users.find(item => item.id === modal.id)} state={state} setModal={setModal} resetUserPassword={resetUserPassword} />}
        {modal?.type === "new-group" && <GroupForm state={state} onSubmit={createGroup} />}
        {modal?.type === "task" && <TaskDetail taskId={modal.id} state={state} helpers={helpers} addComment={addComment} />}
        {modal?.type === "project" && <ProjectDetail projectId={modal.id} state={state} helpers={helpers} updateProjectStatus={updateProjectStatus} openTask={openTask} setModal={setModal} />}
      </Modal>
    </section>
  );
}

function Login({ onLogin, onSignup, onGoogle, email, message, loading }) {
  const [loginEmail, setLoginEmail] = useState(email);
  const [password, setPassword] = useState("");
  return (
    <section className="login-shell">
      <div className="login-brand">
        <div className="brand-mark">
          <img src={logoUrl} alt="Vision Forge Studio logo" />
          <span>Vision Forge Studio</span>
        </div>
        <div className="login-copy">
          <h1>Project command center.</h1>
          <p>A private collaboration dashboard for Vision Forge Studio projects, tasks, files, deadlines, team updates, groups, roles, and inbox messages.</p>
        </div>
        <div className="login-meta">
          <span>Project tracker</span>
          <span>Admin permissions</span>
          <span>{isSupabaseConfigured ? "Supabase linked" : "Supabase-ready"}</span>
        </div>
      </div>
      <div className="login-panel">
        <form className="login-card" onSubmit={event => { event.preventDefault(); onLogin({ email: loginEmail, password }); }}>
          <span className="eyebrow">Private admin portal</span>
          <h2>Welcome to Vision Forge Studio</h2>
          <p className="subtle">Sign in with your email and password, or continue with Google once it is enabled in Supabase Auth.</p>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" value={loginEmail} onChange={event => setLoginEmail(event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Enter password" />
          </div>
          {message ? <p className="auth-message">{message}</p> : null}
          <button className="primary-btn" type="submit" disabled={loading}>{loading ? "Signing in..." : "Sign in"}</button>
          <div className="login-actions-row">
            <button className="ghost-btn" type="button" onClick={() => onSignup({ email: loginEmail, password })} disabled={loading}>Create account</button>
            <button className="ghost-btn" type="button" onClick={onGoogle} disabled={loading || !isSupabaseConfigured}>Continue with Google</button>
          </div>
          <p className="login-note">Supabase Auth is active when the connection pill says Supabase connected. Google also needs to be enabled in your Supabase Auth provider settings.</p>
        </form>
      </div>
    </section>
  );
}

function Sidebar({ state, patch }) {
  const nav = [
    ["admin", "Users & Permissions", ""],
    ["dashboard", "Dashboard", ""],
    ["projects", "Project & Tasks", ""],
    ["inbox", "Inbox", String(state.messages.filter(message => message.unread).length || "")],
  ];
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <img src={logoUrl} alt="Vision Forge Studio logo" />
        <span>Vision Forge</span>
      </div>
      <div className="nav-main">
        <p className="nav-label">Overview</p>
        {nav.map(([id, label, badge]) => (
          <button key={id} className={`nav-btn ${state.activeView === id ? "active" : ""}`} onClick={() => patch({ activeView: id, notificationOpen: false })}>
            <span>{label}</span>
            {badge ? <span className="badge">{badge}</span> : null}
          </button>
        ))}
      </div>
      <div className="profile-card">
        <span className="avatar">GS</span>
        <div>
          <strong>Glenrick Spain</strong>
          <div className="muted-small">CEO / Admin</div>
        </div>
      </div>
    </aside>
  );
}

function Topbar({ state, patch, openProjectModal, openTaskModal, onNotificationClick, onLogout }) {
  const unread = state.notifications.filter(item => !item.read);
  const title = {
    admin: "Users & Permissions",
    dashboard: "Dashboard",
    projects: "Project & Tasks",
    inbox: "Inbox",
  }[state.activeView] || "Dashboard";
  return (
    <header className="topbar">
      <div>
        <span className="eyebrow">Vision Forge Studio</span>
        <h1>{title}</h1>
        <span className={`connection-pill ${isSupabaseConfigured ? "connected" : ""}`}>{isSupabaseConfigured ? "Supabase connected" : "Local demo mode"}</span>
      </div>
      <div className="topbar-actions">
        <div className="avatar-stack">
          {state.users.map(user => <span className="mini-avatar" title={user.name} key={user.id}>{user.initials}</span>)}
        </div>
        <div className="notification-wrap">
          <button
            className="notification-btn"
            onClick={() => patch(current => ({
              ...current,
              notificationOpen: !current.notificationOpen,
              notifications: current.notificationOpen ? current.notifications : current.notifications.map(item => ({ ...item, read: true })),
            }))}
          >
            <span>Notifications</span>
            <strong>{unread.length}</strong>
          </button>
          <AnimatePresence>
            {state.notificationOpen && <NotificationDropdown notifications={state.notifications} onClick={onNotificationClick} />}
          </AnimatePresence>
        </div>
        <button className="tool-btn" onClick={openProjectModal}>+ Add Project</button>
        <button className="tool-btn" disabled={!state.projects.length} onClick={openTaskModal}>+ Create task</button>
        <button className="ghost-btn" onClick={onLogout}>Logout</button>
      </div>
    </header>
  );
}

function NotificationDropdown({ notifications, onClick }) {
  const listRef = useRef(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [topGradientOpacity, setTopGradientOpacity] = useState(0);
  const [bottomGradientOpacity, setBottomGradientOpacity] = useState(notifications.length > 5 ? 1 : 0);

  const handleScroll = useCallback(event => {
    const { scrollTop, scrollHeight, clientHeight } = event.currentTarget;
    const bottomDistance = scrollHeight - (scrollTop + clientHeight);
    setTopGradientOpacity(Math.min(scrollTop / 36, 1));
    setBottomGradientOpacity(scrollHeight <= clientHeight ? 0 : Math.min(bottomDistance / 36, 1));
  }, []);

  const scrollToMore = () => {
    const list = listRef.current;
    if (!list) return;
    list.scrollTo({ top: list.scrollTop + list.clientHeight * 0.85, behavior: "smooth" });
  };

  useEffect(() => {
    const handleKeyDown = event => {
      if (!notifications.length) return;
      if (event.key === "ArrowDown" || (event.key === "Tab" && !event.shiftKey)) {
        event.preventDefault();
        setSelectedIndex(index => Math.min(index + 1, notifications.length - 1));
      }
      if (event.key === "ArrowUp" || (event.key === "Tab" && event.shiftKey)) {
        event.preventDefault();
        setSelectedIndex(index => Math.max(index - 1, 0));
      }
      if (event.key === "Enter" && selectedIndex >= 0) {
        event.preventDefault();
        onClick(notifications[selectedIndex]);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [notifications, onClick, selectedIndex]);

  useEffect(() => {
    const selected = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    selected?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedIndex]);

  return (
    <motion.div
      className="notification-dropdown"
      initial={{ opacity: 0, y: -8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.96 }}
      transition={{ duration: 0.18 }}
    >
      <div className="dropdown-head">
        <strong>Notifications</strong>
        <span>{notifications.length}</span>
      </div>
      {notifications.length ? (
        <div className="notification-scroll-shell">
          <div className="notification-scroll" ref={listRef} onScroll={handleScroll}>
            {notifications.map((item, index) => (
              <motion.button
                key={item.id}
                data-index={index}
                className={`dropdown-notification ${item.read ? "read" : ""} ${selectedIndex === index ? "selected" : ""}`}
                onMouseEnter={() => setSelectedIndex(index)}
                onClick={() => onClick(item)}
                initial={{ scale: 0.7, opacity: 0 }}
                whileInView={{ scale: 1, opacity: 1 }}
                viewport={{ amount: 0.5, once: false }}
                transition={{ duration: 0.2, delay: Math.min(index, 5) * 0.035 }}
              >
                <strong>{item.title}</strong>
                <span>{item.detail}</span>
                <small>{item.time}</small>
              </motion.button>
            ))}
          </div>
          <div className="notification-top-gradient" style={{ opacity: topGradientOpacity }} />
          <div className="notification-bottom-gradient" style={{ opacity: bottomGradientOpacity }} />
          {notifications.length > 5 ? <button className="see-more-notifications" type="button" onClick={scrollToMore}>See more notifications</button> : null}
        </div>
      ) : <div className="dropdown-empty">No notifications yet.</div>}
    </motion.div>
  );
}

function DashboardBoard({ state, helpers, patch, setModal, openTask, moveTask }) {
  const projects = helpers.dashboardProjects();
  const activeProjectId = state.activeProjectId && projects.some(project => project.id === state.activeProjectId)
    ? state.activeProjectId
    : projects[0]?.id || "";
  const tasks = helpers.visibleTasks().filter(task => {
    const matchesProject = !activeProjectId || task.projectId === activeProjectId;
    const query = state.search.trim().toLowerCase();
    const matchesSearch = !query || `${task.title} ${task.type} ${task.description}`.toLowerCase().includes(query);
    return matchesProject && matchesSearch;
  });

  useEffect(() => {
    if (activeProjectId !== state.activeProjectId) patch({ activeProjectId });
  }, [activeProjectId]);

  return (
    <>
      {projects.length ? (
        <nav className="project-tabs" aria-label="Projects">
          {projects.map(project => (
            <button key={project.id} className={`tab-btn ${activeProjectId === project.id ? "active" : ""}`} onClick={() => patch({ activeProjectId: project.id })}>
              <span className="project-dot" style={{ background: project.color }} />
              <span>{project.name}</span>
            </button>
          ))}
        </nav>
      ) : <div className="empty-state">No active projects yet. Create your first project to start tracking work.</div>}
      <div className="toolbar">
        <div className="search-box">
          <input value={state.search} placeholder="Search task" onChange={event => patch({ search: event.target.value })} />
        </div>
        <button className="ghost-btn" onClick={() => patch({ activeView: "projects" })}>Project & Tasks</button>
        <button className="ghost-btn" disabled={!state.projects.length} onClick={() => setModal({ type: "new-task" })}>Create task</button>
      </div>
      {projects.length ? (
        <LayoutGroup>
          <div className="board board-full">
            {statuses.map(status => (
              <TaskColumn key={status.id} status={status} tasks={tasks.filter(task => task.status === status.id)} state={state} helpers={helpers} openTask={openTask} moveTask={moveTask} />
            ))}
          </div>
        </LayoutGroup>
      ) : null}
    </>
  );
}

function TaskColumn({ status, tasks, state, helpers, openTask, moveTask }) {
  const [over, setOver] = useState(false);
  return (
    <section className="column">
      <div className="column-header">
        <div className="column-title"><span className="status-dot" style={{ background: status.color }} />{status.label}</div>
        <span className="count-pill">{tasks.length}</span>
      </div>
      <motion.div
        layout
        className={`dropzone ${over ? "drag-over" : ""} ${state.movingTaskId ? "is-loading" : ""}`}
        onDragOver={event => { event.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={event => {
          event.preventDefault();
          setOver(false);
          moveTask(event.dataTransfer.getData("text/plain"), status.id);
        }}
      >
        {tasks.length ? tasks.map(task => <TaskCard key={task.id} task={task} state={state} helpers={helpers} openTask={openTask} />) : <div className="empty-state">No tasks here yet.</div>}
      </motion.div>
    </section>
  );
}

function TaskCard({ task, state, helpers, openTask }) {
  const project = helpers.getProject(task.projectId);
  const status = statuses.find(item => item.id === task.status) || statuses[0];
  const progress = task.status === "completed" ? 100 : status.progress;
  const locked = task.status === "completed";
  return (
    <ElectricBorder
      className={`task-card-electric ${locked ? "is-completed" : ""}`}
      color={locked ? "#9aa3af" : status.color}
      speed={locked ? 0.35 : 0.9}
      chaos={locked ? 0.025 : 0.055}
      borderRadius={8}
    >
      <motion.article
        layout
        layoutId={`task-${task.id}`}
        transition={{ layout: { duration: 0.28, ease: [0.22, 1, 0.36, 1] } }}
        className={`task-card ${locked ? "is-completed is-locked" : ""} ${state.movingTaskId === task.id ? "is-moving" : ""}`}
        draggable={!locked}
        onClick={() => openTask(task.id)}
        onDragStart={event => {
          if (locked) {
            event.preventDefault();
            return;
          }
          event.dataTransfer.setData("text/plain", task.id);
        }}
      >
        <div className="card-head">
          <span className="tag">{task.type}</span>
          <span className={`priority ${task.priority.toLowerCase()}`}>+ {task.priority}</span>
        </div>
        <h3>{task.title}</h3>
        <div className="due">Deadline: {formatDate(task.deadline)}</div>
        <div className="mini-row" style={{ marginTop: 10 }}>
          <div className="avatar-stack">{task.assignees.map(id => <span className="mini-avatar" key={id}>{helpers.getUser(id)?.initials || "?"}</span>)}</div>
          <span className="muted-small">{task.comments.length} comments</span>
        </div>
        <div className="progress-row">
          <div className="progress"><span style={{ width: `${progress}%`, background: status.color }} /></div>
          <strong>{progress}%</strong>
        </div>
        <div className="project-chip">
          <span className="project-dot" style={{ background: project?.color || "#c58b18" }} />
          <span>{project?.name || "No project"}</span>
        </div>
      </motion.article>
    </ElectricBorder>
  );
}

function ProjectTasksView({ state, helpers, patch, setModal, openTask, openProject }) {
  const filteredProjects = state.projects.filter(project => (project.status || "active") === state.activeProjectStatus);
  return (
    <div className="workspace-grid">
      <section className="section-panel">
        <div className="panel-head">
          <div>
            <h2>Projects</h2>
            <p className="muted-small">Open a project to review tasks, files, and lifecycle status.</p>
          </div>
          <button className="ghost-btn" onClick={() => setModal({ type: "new-project" })}>Add Project</button>
        </div>
        <div className="project-status-tabs">
          {projectStatuses.map(status => (
            <button key={status.id} className={`status-tab ${state.activeProjectStatus === status.id ? "active" : ""}`} onClick={() => patch({ activeProjectStatus: status.id })}>
              {status.label}
              <span>{state.projects.filter(project => (project.status || "active") === status.id).length}</span>
            </button>
          ))}
        </div>
        {filteredProjects.length ? (
          <div className="project-list">
            {filteredProjects.map(project => {
              const projectTasks = state.tasks.filter(task => task.projectId === project.id);
              const complete = projectTasks.filter(task => task.status === "completed").length;
              return (
                <article key={project.id} className="project-card project-card-click" onClick={() => openProject(project.id)}>
                  <div className="card-head">
                    <span className="project-dot" style={{ background: project.color }} />
                    <span className="tag">{projectStatusLabel(project.status)}</span>
                  </div>
                  <strong>{project.name}</strong>
                  <p className="muted-small">{project.description}</p>
                  <div className="mini-row"><span>{projectTasks.length} tasks</span><span>{complete} completed</span></div>
                  <div className="muted-small">Start {formatDate(project.startDate)} / Deadline {formatDate(project.deadline)}</div>
                  <div className="project-chip">{attachmentNames(project.attachments) || "No attachments yet"}</div>
                </article>
              );
            })}
          </div>
        ) : <div className="empty-state">No {projectStatusLabel(state.activeProjectStatus).toLowerCase()} projects yet.</div>}
      </section>
      <section className="section-panel">
        <div className="panel-head">
          <div>
            <h2>Tasks</h2>
            <p className="muted-small">List view for opening tasks without using the board.</p>
          </div>
          <button className="ghost-btn" disabled={!state.projects.length} onClick={() => setModal({ type: "new-task" })}>Create task</button>
        </div>
        {state.tasks.length ? (
          <div className="table-list compact-list">
            {state.tasks.map(task => (
              <button key={task.id} className="table-row" onClick={() => openTask(task.id)}>
                <span><strong>{task.title}</strong><small>{helpers.getProject(task.projectId)?.name || "No project"}</small></span>
                <span>{statusLabel(task.status)}</span>
              </button>
            ))}
          </div>
        ) : <div className="empty-state">No tasks yet.</div>}
      </section>
    </div>
  );
}

function AdminView({ state, setModal, resetUserPassword }) {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("All roles");
  const users = state.users.filter(user => {
    const matchesSearch = !query || `${user.displayName} ${user.legalName} ${user.email} ${user.phone}`.toLowerCase().includes(query.toLowerCase());
    const matchesRole = role === "All roles" || user.role === role;
    return matchesSearch && matchesRole;
  });
  return (
    <div className="users-workspace">
      <section className="section-panel users-panel">
        <div className="users-toolbar">
          <button className="primary-mini" onClick={() => setModal({ type: "new-user" })}>New user</button>
          <div className="users-filters">
            <input value={query} placeholder="Search users" onChange={event => setQuery(event.target.value)} />
            <select value={role} onChange={event => setRole(event.target.value)}>
              <option>All roles</option>
              <option>Admin</option>
              <option>User</option>
            </select>
          </div>
        </div>
        <div className="users-table">
          <div className="users-table-head">
            <span>Name</span>
            <span>Email</span>
            <span>Role</span>
            <span>Status</span>
            <span>Action</span>
          </div>
          {users.map(user => (
            <button className="user-row glass-hover" key={user.id} onClick={() => setModal({ type: "user-detail", id: user.id })}>
              <span className="user-name-cell">
                <UserAvatar user={user} />
                <span><strong>{user.displayName}</strong><small>{user.title || "Team member"}</small></span>
              </span>
              <span>{user.email}</span>
              <span>{user.role}</span>
              <span><em className={`status-dot-label ${String(user.status).toLowerCase()}`}>{user.status}</em></span>
              <span className="row-actions">
                <button type="button" onClick={event => { event.stopPropagation(); setModal({ type: "edit-user", id: user.id }); }}>Edit</button>
                <button type="button" onClick={event => { event.stopPropagation(); resetUserPassword(user.email); }}>Reset</button>
              </span>
            </button>
          ))}
        </div>
      </section>
      <section className="section-panel">
        <div className="panel-head">
          <h2>Groups</h2>
          <button className="ghost-btn" onClick={() => setModal({ type: "new-group" })}>Add Group</button>
        </div>
        <div className="list-grid">
          {state.groups.map(group => (
            <article className="message-item" key={group.id}>
              <strong>{group.name}</strong>
              <p className="muted-small">{group.description || "No description"}</p>
              <div className="project-chip">{group.memberIds.map(id => state.users.find(user => user.id === id)?.name).filter(Boolean).join(", ") || "No members"}</div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function InboxView({ messages }) {
  return (
    <section className="section-panel">
      <h2>Inbox</h2>
      {messages.length ? (
        <div className="list-grid">
          {messages.map(message => (
            <article className="message-item" key={message.subject}>
              <div className="card-head">
                <strong>{message.from}</strong>
                {message.unread ? <span className="badge">new</span> : null}
              </div>
              <span>{message.subject}</span>
              <p className="muted-small">{message.body}</p>
              <div className="muted-small">{message.time}</div>
            </article>
          ))}
        </div>
      ) : <div className="empty-state">No inbox messages yet.</div>}
    </section>
  );
}

function Modal({ modal, children, onClose }) {
  if (!modal) return null;
  const className = modal.type === "task" ? "task-modal" : "";
  return (
    <div className="modal-root open" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <CloseModalContext.Provider value={onClose}>
        <motion.div className={`modal ${className}`} initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}>
          {children}
        </motion.div>
      </CloseModalContext.Provider>
    </div>
  );
}

function ProjectForm({ onSubmit }) {
  return (
    <>
      <ModalHeader title="Add project" />
      <form onSubmit={event => { event.preventDefault(); onSubmit(new FormData(event.currentTarget), [...event.currentTarget.attachments.files]); }}>
        <Field label="Name"><input name="name" required placeholder="New client portal" /></Field>
        <Field label="Description"><textarea name="description" required placeholder="What this project is responsible for" /></Field>
        <Field label="Attachments"><input name="attachments" type="file" multiple /></Field>
        <p className="login-note">The demo records selected file names. Supabase Storage will handle real uploads when the backend is connected.</p>
        <Field label="Start date"><input name="startDate" type="date" required /></Field>
        <Field label="Deadline"><input name="deadline" type="date" required /></Field>
        <Field label="Project status"><select name="status">{projectStatuses.map(status => <option key={status.id} value={status.id}>{status.label}</option>)}</select></Field>
        <div className="modal-actions"><button className="primary-btn" type="submit">Create project</button></div>
      </form>
    </>
  );
}

function TaskForm({ state, onSubmit }) {
  return (
    <>
      <ModalHeader title="Create task" />
      <form onSubmit={event => { event.preventDefault(); onSubmit(new FormData(event.currentTarget)); }}>
        <Field label="Task name"><input name="title" required placeholder="Create onboarding checklist" /></Field>
        <Field label="Task type"><input name="type" required placeholder="Design, backend, review, content" /></Field>
        <Field label="Description"><textarea name="description" required placeholder="What needs to be done" /></Field>
        <Field label="Project"><select name="projectId">{state.projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></Field>
        <Field label="Assignees"><select name="assignees" multiple>{state.users.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}</select></Field>
        <Field label="Status"><select name="status">{statuses.map(status => <option key={status.id} value={status.id}>{status.label}</option>)}</select></Field>
        <Field label="Priority"><select name="priority"><option>Medium</option><option>High</option><option>Low</option></select></Field>
        <Field label="Deadline"><input name="deadline" type="date" required /></Field>
        <div className="modal-actions"><button className="primary-btn" type="submit">Create task</button></div>
      </form>
    </>
  );
}

function UserForm({ state, user, onSubmit }) {
  const [photo, setPhoto] = useState(user?.photo || "");
  const readPhoto = event => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhoto(String(reader.result));
    reader.readAsDataURL(file);
  };
  return (
    <>
      <ModalHeader title={user ? "Edit user" : "Create a new user"} />
      <form className="user-form-grid" onSubmit={event => { event.preventDefault(); onSubmit(new FormData(event.currentTarget), photo); }}>
        <div className="photo-uploader">
          <UserAvatar user={{ ...user, photo, initials: user?.initials || "U" }} large />
          <label className="ghost-btn">Add photo<input name="photoFile" type="file" accept="image/*" onChange={readPhoto} hidden /></label>
        </div>
        <Field label="Legal Name"><input name="legalName" defaultValue={user?.legalName || ""} placeholder="Legal full name" /></Field>
        <Field label="Display Name"><input name="displayName" defaultValue={user?.displayName || user?.name || ""} required placeholder="Display name" /></Field>
        <input name="name" type="hidden" defaultValue={user?.displayName || user?.name || ""} />
        <Field label="Title"><input name="title" defaultValue={user?.title || ""} placeholder="CEO, Designer, Developer" /></Field>
        <Field label="Email"><input name="email" type="email" defaultValue={user?.email || ""} required placeholder="name@visionforge.studio" /></Field>
        {!user ? <Field label="Create Password"><input name="password" type="password" required minLength="6" placeholder="Temporary password" /></Field> : null}
        <Field label="Phone"><input name="phone" defaultValue={user?.phone || ""} placeholder="Personal phone" /></Field>
        <Field label="Work Phone"><input name="workPhone" defaultValue={user?.workPhone || ""} placeholder="Work phone" /></Field>
        <Field label="Gender"><select name="gender" defaultValue={user?.gender || ""}><option value="">Select</option><option>Male</option><option>Female</option><option>Non-binary</option><option>Prefer not to say</option></select></Field>
        <Field label="DOB"><input name="dob" type="date" defaultValue={user?.dob || ""} /></Field>
        <Field label="Home Address"><textarea name="homeAddress" defaultValue={user?.homeAddress || ""} placeholder="Street, city, state, ZIP" /></Field>
        <Field label="Status"><select name="status" defaultValue={user?.status || "Active"}><option>Active</option><option>Invited</option><option>Inactive</option></select></Field>
        <Field label="Permission role"><select name="role" defaultValue={user?.role || "User"}><option>Admin</option><option>User</option></select></Field>
        <Field label="Groups"><select name="groups" multiple defaultValue={user?.groupIds || []}>{state.groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></Field>
        <div className="role-preview">
          <strong>Role's permissions</strong>
          <p>{roles[user?.role || "User"]}</p>
        </div>
        <div className="modal-actions"><button className="primary-btn" type="submit">{user ? "Save changes" : "Create user"}</button></div>
      </form>
    </>
  );
}

function GroupForm({ state, onSubmit }) {
  return (
    <>
      <ModalHeader title="Add group" />
      <form onSubmit={event => { event.preventDefault(); onSubmit(new FormData(event.currentTarget)); }}>
        <Field label="Group name"><input name="name" required placeholder="Design Team" /></Field>
        <Field label="Description"><textarea name="description" placeholder="What this group can access" /></Field>
        <Field label="Members"><select name="members" multiple>{state.users.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}</select></Field>
        <div className="modal-actions"><button className="primary-btn" type="submit">Create group</button></div>
      </form>
    </>
  );
}

function TaskDetail({ taskId, state, helpers, addComment }) {
  const task = state.tasks.find(item => item.id === taskId);
  const [text, setText] = useState("");
  const [mentionOpen, setMentionOpen] = useState(false);
  if (!task) return null;
  const project = helpers.getProject(task.projectId);
  const mentionMatches = state.users.filter(user => user.name.toLowerCase().includes(text.split("@").pop()?.toLowerCase() || ""));
  return (
    <>
      <ModalHeader title={task.title} eyebrow={project?.name || "Project"} />
      <div className="task-detail-grid">
        <div className="detail-meta">
          <span>{statusLabel(task.status)}</span>
          <span>{task.priority} priority</span>
          <span>Deadline {formatDate(task.deadline)}</span>
        </div>
        <p className="subtle">{task.description}</p>
        <div className="timeline-item compact-info"><strong>Assignees</strong><span className="muted-small">{task.assignees.map(id => helpers.getUser(id)?.name).filter(Boolean).join(", ") || "No assignees"}</span></div>
        <div className="timeline-item compact-info"><strong>Project attachments</strong><span className="muted-small">{attachmentNames(project?.attachments || []) || "No attachments yet"}</span></div>
        <div className="chat-panel">
          <div className="chat-head"><strong>Comments</strong><span>{task.comments.length}</span></div>
          <div className="comment-board chat-board">{task.comments.length ? task.comments.map(comment => <Comment key={`${comment.by}-${comment.date}-${comment.text}`} comment={comment} />) : <div className="chat-empty">No comments yet.</div>}</div>
          <form className="chat-compose" onSubmit={event => { event.preventDefault(); addComment(task.id, text); setText(""); setMentionOpen(false); }}>
            <div className="mention-wrap">
              <textarea value={text} placeholder="Type @ to mention a teammate" onChange={event => { setText(event.target.value); setMentionOpen(event.target.value.includes("@")); }} />
              {mentionOpen && (
                <div className="mention-menu open">
                  {mentionMatches.slice(0, 5).map(user => (
                    <button key={user.id} type="button" onClick={() => { setText(`${text.replace(/@[^@]*$/, "")}@${user.name} `); setMentionOpen(false); }}>
                      <span className="mini-avatar">{user.initials}</span>{user.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button className="primary-btn" type="submit">Post</button>
          </form>
        </div>
      </div>
    </>
  );
}

function ProjectDetail({ projectId, state, helpers, updateProjectStatus, openTask, setModal }) {
  const project = helpers.getProject(projectId);
  if (!project) return null;
  const tasks = state.tasks.filter(task => task.projectId === project.id);
  return (
    <>
      <ModalHeader title={project.name} eyebrow={projectStatusLabel(project.status)} />
      <p className="subtle">{project.description}</p>
      <div className="timeline" style={{ marginTop: 16 }}>
        <div className="timeline-item"><strong>Schedule</strong><span className="muted-small">Start {formatDate(project.startDate)} / Deadline {formatDate(project.deadline)}</span></div>
        <div className="timeline-item"><strong>Attachments</strong><span className="muted-small">{attachmentNames(project.attachments) || "No attachments yet"}</span></div>
      </div>
      <Field label="Project status">
        <select value={project.status || "active"} onChange={event => updateProjectStatus(project.id, event.target.value)}>
          {projectStatuses.map(status => <option key={status.id} value={status.id}>{status.label}</option>)}
        </select>
      </Field>
      <div className="panel-head" style={{ marginTop: 20 }}>
        <h2>Tasks</h2>
        <button className="ghost-btn" type="button" onClick={() => setModal({ type: "new-task" })}>Create task</button>
      </div>
      {tasks.length ? (
        <div className="table-list">
          {tasks.map(task => (
            <button className="table-row" key={task.id} onClick={() => openTask(task.id)}>
              <span><strong>{task.title}</strong><small>{statusLabel(task.status)}</small></span>
              <span>{formatDate(task.deadline)}</span>
            </button>
          ))}
        </div>
      ) : <div className="empty-state">No tasks in this project yet.</div>}
    </>
  );
}

function UserDetail({ user, state, setModal, resetUserPassword }) {
  if (!user) return null;
  const groups = user.groupIds?.map(id => state.groups.find(group => group.id === id)?.name).filter(Boolean).join(", ") || "No groups";
  return (
    <>
      <div className="user-profile-hero">
        <UserAvatar user={user} large />
        <div>
          <h2>{user.displayName}</h2>
          <p>{user.title || "Team member"} / {user.role} / {groups}</p>
          <span>{user.email}</span>
          <span>{user.phone || "No phone"}</span>
        </div>
        <div className="user-profile-actions">
          <button className="ghost-btn" onClick={() => setModal({ type: "edit-user", id: user.id })}>Edit profile</button>
          <button className="ghost-btn" onClick={() => resetUserPassword(user.email)}>Reset password</button>
        </div>
      </div>
      <div className="profile-tabs">
        <span className="active">Worker Details</span>
        <span>Permissions</span>
        <span>Activity</span>
      </div>
      <div className="profile-detail-grid">
        <section className="profile-info-card">
          <h3>Basic Information</h3>
          <dl>
            <dt>Legal name</dt><dd>{user.legalName || user.displayName}</dd>
            <dt>Display name</dt><dd>{user.displayName}</dd>
            <dt>Gender</dt><dd>{user.gender || "Not set"}</dd>
            <dt>Date of birth</dt><dd>{user.dob ? formatDate(user.dob) : "Not set"}</dd>
          </dl>
        </section>
        <section className="profile-info-card">
          <h3>Contact Information</h3>
          <dl>
            <dt>Home address</dt><dd>{user.homeAddress || "Not set"}</dd>
            <dt>Email</dt><dd>{user.email}</dd>
            <dt>Personal phone</dt><dd>{user.phone || "Not set"}</dd>
            <dt>Work phone</dt><dd>{user.workPhone || "Not set"}</dd>
          </dl>
        </section>
        <section className="profile-info-card">
          <h3>Activity</h3>
          <dl>
            <dt>Last login</dt><dd>{user.lastLogin || "Never"}</dd>
            <dt>Status</dt><dd>{user.status || "Active"}</dd>
          </dl>
          <div className="activity-list">
            {(user.activity || []).map((item, index) => <span key={`${item}-${index}`}>{item}</span>)}
          </div>
        </section>
      </div>
    </>
  );
}

function UserAvatar({ user, large = false }) {
  return user?.photo
    ? <img className={`user-photo ${large ? "large" : ""}`} src={user.photo} alt={user.displayName || user.name} />
    : <span className={`user-photo placeholder ${large ? "large" : ""}`}>{user?.initials || initialsFromName(user?.displayName || user?.name || "User")}</span>;
}

function ModalHeader({ title, eyebrow }) {
  const onClose = useContext(CloseModalContext);
  return (
    <div className="modal-header">
      <div>{eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}<h2>{title}</h2></div>
      <button className="icon-btn" data-close-modal type="button" onClick={onClose}>X</button>
    </div>
  );
}

function Field({ label, children }) {
  return <div className="field"><label>{label}</label>{children}</div>;
}

function Comment({ comment }) {
  return (
    <article className="comment-item">
      <span className="mini-avatar">{initialsFromName(comment.by)}</span>
      <div>
        <strong>@{comment.by}</strong>
        <p dangerouslySetInnerHTML={{ __html: formatCommentText(comment.text) }} />
        <span className="muted-small">{comment.date ? formatDate(comment.date) : "Just now"}</span>
      </div>
    </article>
  );
}

function createHelpers(state) {
  const getProject = projectId => state.projects.find(project => project.id === projectId);
  const getUser = userId => state.users.find(user => user.id === userId);
  const dashboardProjects = () => state.projects.filter(project => !["completed", "closed", "cancelled"].includes(project.status || "active"));
  const visibleTasks = () => state.tasks.filter(task => {
    const project = getProject(task.projectId);
    return project && !["completed", "closed", "cancelled"].includes(project.status || "active");
  });
  return { getProject, getUser, dashboardProjects, visibleTasks };
}

async function upsertSupabaseProfile(authUser) {
  const metadata = authUser.user_metadata || {};
  const email = authUser.email || "";
  const displayName = metadata.display_name || metadata.full_name || (email === ownerEmail ? "Glenrick Spain" : email.split("@")[0]);
  const legalName = metadata.legal_name || displayName;
  const role = email.toLowerCase() === ownerEmail ? "Admin" : metadata.role || "User";
  const payload = {
    id: authUser.id,
    legal_name: legalName,
    display_name: displayName,
    email,
    role,
    status: "Active",
    last_login_at: new Date().toISOString(),
  };

  if (supabase) {
    const { data, error } = await supabase
      .from("profiles")
      .upsert(payload, { onConflict: "id" })
      .select()
      .single();

    if (!error && data) {
      return profileRowToUser(data);
    }
    console.warn("Supabase profile upsert failed:", error?.message);
  }

  return {
    id: authUser.id,
    name: displayName,
    legalName,
    displayName,
    title: role === "Admin" ? "CEO" : "Team member",
    email,
    phone: "",
    workPhone: "",
    gender: "",
    dob: "",
    homeAddress: "",
    photo: metadata.avatar_url || "",
    status: "Active",
    lastLogin: "Just now",
    activity: ["Signed in with Supabase Auth."],
    role,
    groupIds: [],
    initials: initialsFromName(displayName),
  };
}

function profileRowToUser(row) {
  const displayName = row.display_name || row.email?.split("@")[0] || "User";
  return {
    id: row.id,
    name: displayName,
    legalName: row.legal_name || displayName,
    displayName,
    title: row.role === "Admin" ? "CEO" : "Team member",
    email: row.email || "",
    phone: row.phone || "",
    workPhone: row.work_phone || "",
    gender: row.gender || "",
    dob: row.dob || "",
    homeAddress: row.home_address || "",
    photo: row.photo_url || "",
    status: row.status || "Active",
    lastLogin: row.last_login_at ? new Date(row.last_login_at).toLocaleString() : "Just now",
    activity: ["Signed in with Supabase Auth."],
    role: row.role || "User",
    groupIds: [],
    initials: initialsFromName(displayName),
  };
}

function normalizeUser(user) {
  const displayName = user.displayName || user.name || "Unnamed User";
  return {
    phone: "",
    workPhone: "",
    gender: "",
    dob: "",
    homeAddress: "",
    photo: "",
    status: "Active",
    lastLogin: "Never",
    activity: [],
    groupIds: [],
    ...user,
    name: displayName,
    displayName,
    legalName: user.legalName || displayName,
    initials: user.initials || initialsFromName(displayName),
  };
}

function statusLabel(statusId) {
  return statuses.find(status => status.id === statusId)?.label || "Unknown";
}

function projectStatusLabel(statusId) {
  return projectStatuses.find(status => status.id === statusId)?.label || "Active";
}

function normalizeDate(value) {
  if (value instanceof Date) return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  return String(value).slice(0, 10);
}

function formatDate(dateString) {
  if (!dateString) return "No date";
  const date = new Date(`${dateString}T00:00:00`);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function randomColor() {
  const colors = ["#c58b18", "#58b8e8", "#14a86b", "#8068d9", "#df4d53"];
  return colors[Math.floor(Math.random() * colors.length)];
}

function initialsFromName(name) {
  return String(name).trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join("") || "U";
}

function formatFileSize(bytes) {
  if (!bytes) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function attachmentNames(attachments = []) {
  return attachments.map(item => typeof item === "string" ? item : `${item.name} (${formatFileSize(item.size)})`).join(", ");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[char]));
}

function formatCommentText(text) {
  return escapeHtml(text).replace(/@([A-Za-z][A-Za-z\s]*?)(?=\s|$|[.,!?])/g, `<span class="mention">@$1</span>`);
}

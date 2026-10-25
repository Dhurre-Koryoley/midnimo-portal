const state = {
  role: null,
  user: null,
  csrfToken: "",
  currentPage: "overview",
  students: [],
  selectedStudentId: null,
  studentDashboard: null,
};

const $ = (selector) => document.querySelector(selector);
const html = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  );
const initials = (name) =>
  String(name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || "")
    .join("")
    .toUpperCase();

async function api(url, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !(options.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  if (
    options.body &&
    !(options.body instanceof FormData) &&
    typeof options.body !== "string"
  )
    options.body = JSON.stringify(options.body);
  if (
    !["GET", "HEAD"].includes((options.method || "GET").toUpperCase()) &&
    state.csrfToken
  ) {
    headers.set("X-CSRF-Token", state.csrfToken);
  }
  const response = await fetch(url, {
    ...options,
    headers,
    credentials: "same-origin",
  });
  const body =
    response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && !url.startsWith("/api/auth/"))
      resetToLogin();
    throw new Error(body?.error || "Codsiga lama dhamaystiri karin.");
  }
  return body;
}

function notify(message, isError = false) {
  const toast = document.createElement("div");
  toast.className = `toast${isError ? " error-toast" : ""}`;
  toast.textContent = message;
  $("#toastRegion").append(toast);
  window.setTimeout(() => toast.remove(), 4000);
}

function resetToLogin() {
  state.role = null;
  state.user = null;
  state.csrfToken = "";
  $("#dashboard").classList.add("hidden");
  $("#authPage").classList.remove("hidden");
  $("#authError").textContent = "Fadlan mar kale gal akoonkaaga.";
  loadAuthStatus();
}

async function loadAuthStatus() {
  const response = await fetch("/api/auth/status");
  if (!response.ok) throw new Error("Xogta nidaamka lama heli karo.");
  const status = await response.json();
  $("#authTitle").textContent = status.setupRequired
    ? "Samee maamulka koowaad"
    : "Ku soo dhawoow";
  $("#authDescription").textContent = status.setupRequired
    ? "Deji username iyo password-ka maamulka si aad u bilowdo."
    : "Geli username-kaaga iyo erayga sirta ah.";
  $("#authSubmit").textContent = status.setupRequired
    ? "Samee akoonka maamulka"
    : "Gal";
  $("#confirmField").classList.toggle("hidden", !status.setupRequired);
  $("#setupHint").classList.toggle("hidden", !status.setupRequired);
  $("#authForm").dataset.mode = status.setupRequired ? "setup" : "login";
  $("#authForm").elements.password.autocomplete = status.setupRequired
    ? "new-password"
    : "current-password";
  $("#authForm").elements.password.minLength = status.setupRequired ? 10 : 8;
  $("#authForm").elements.confirmPassword.required = status.setupRequired;
}

async function loadSession() {
  const response = await fetch("/api/auth/session");
  if (!response.ok) return false;
  const session = await response.json();
  if (!session.authenticated) return false;
  state.role = session.role;
  state.user = session.user;
  state.csrfToken = session.csrfToken;
  launchDashboard();
  return true;
}

function launchDashboard() {
  $("#authPage").classList.add("hidden");
  $("#dashboard").classList.remove("hidden");
  const isAdmin = state.role === "admin";
  $("#adminNav").classList.toggle("hidden", !isAdmin);
  $("#studentNav").classList.toggle("hidden", isAdmin);
  $("#topUsername").textContent = isAdmin
    ? state.user.username
    : state.user.fullName;
  $("#topRole").textContent = isAdmin
    ? "Maamulka"
    : `Arday · ${state.user.studentNumber}`;
  const avatar = $("#topAvatar");
  avatar.replaceChildren();
  if (!isAdmin && state.user.photoUrl) {
    const image = document.createElement("img");
    image.className = "avatar-image";
    image.src = state.user.photoUrl;
    image.alt = `Sawirka ${state.user.fullName}`;
    avatar.append(image);
  } else {
    avatar.textContent = isAdmin
      ? initials(state.user.username)
      : initials(state.user.fullName);
  }
  state.currentPage = isAdmin ? "overview" : "studentHome";
  updateNavigation();
  renderPage().catch((error) => notify(error.message, true));
}

function updateNavigation() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.page === state.currentPage,
    );
  });
}

function pageHeading(title, description, action = "") {
  return `<div class="page-heading"><div><p class="eyebrow">Midnimo Academy For Science &amp; Technology</p><h1>${title}</h1><p>${description}</p></div>${action}</div>`;
}

function statCard(label, value, note, icon, color = "") {
  return `<article class="stat-card"><span class="stat-icon ${color}">${icon}</span><div><div class="stat-label">${label}</div><div class="stat-value">${value}</div><div class="stat-note">${note}</div></div></article>`;
}

function avatarMarkup(student, className = "avatar") {
  if (student.photoUrl)
    return `<img class="${className}" src="${html(student.photoUrl)}" alt="Sawirka ${html(student.fullName)}">`;
  return `<span class="${className}">${html(initials(student.fullName))}</span>`;
}

function studentRow(student) {
  return `<tr>
    <td><div class="student-cell">${avatarMarkup(student)}<span>${html(student.fullName)}<small>${html(student.studentNumber)}</small></span></div></td>
    <td>${html(student.username)}</td><td>${html(student.className)}</td>
    <td><div class="row-actions">
      <button class="button button-quiet button-small" data-action="records" data-id="${student.id}">Diiwaan</button>
      <button class="button button-quiet button-small" data-action="edit" data-id="${student.id}">Wax ka beddel</button>
      <button class="button button-danger button-small" data-action="delete" data-id="${student.id}">Tirtir</button>
    </div></td>
  </tr>`;
}

async function renderPage() {
  updateNavigation();
  if (state.role === "student") {
    await renderStudentPage();
    return;
  }
  if (state.currentPage === "overview") return renderOverview();
  if (state.currentPage === "students") return renderStudents();
  if (state.currentPage === "records") return renderRecords();
  if (state.currentPage === "settings") return renderSettings();
}

async function renderOverview() {
  const [overview, students] = await Promise.all([
    api("/api/admin/overview"),
    api("/api/admin/students"),
  ]);
  state.students = students;
  $("#mainContent").innerHTML =
    `${pageHeading("Guudmarka maamulka", "La soco xaaladda dugsigaaga, diiwaannada iyo ardayda.", `<button class="button button-primary" data-action="add-student">+ Ku dar arday</button>`)}
    <div class="stats-grid">
      ${statCard("Ardayda diiwaangashan", overview.students, "Dhammaan fasallada", "♙")}
      ${statCard("Natiijooyinka la geliyey", overview.grades, "Imtixaannada ardayda", "▤", "green")}
      ${statCard("Diiwaannada xaadiriska", overview.attendanceRecords, "Maalmaha la diiwaangeliyey", "✓", "amber")}
      ${statCard("Celceliska dhibcaha", overview.gradeAverage === null ? "—" : `${overview.gradeAverage}%`, "Dhammaan natiijooyinka", "↗", "green")}
    </div>
    <section class="panel"><div class="panel-head"><h2>Ardayda ugu dambaysay</h2><button class="button button-quiet button-small" data-page="students">Dhammaan ardayda</button></div>
      <div class="table-wrap"><table class="data-table"><thead><tr><th>ARDAYGA</th><th>USERNAME</th><th>FASALKA</th><th>MAAMUL</th></tr></thead>
      <tbody>${students.length ? students.slice(0, 6).map(studentRow).join("") : `<tr><td colspan="4" class="empty-state">Weli arday lama diiwaangelin. Ku bilow badhanka “Ku dar arday”.</td></tr>`}</tbody></table></div></section>`;
}

async function renderStudents(search = "") {
  const students = await api(
    `/api/admin/students${search ? `?search=${encodeURIComponent(search)}` : ""}`,
  );
  state.students = students;
  $("#mainContent").innerHTML =
    `${pageHeading("Maamulka ardayda", "Abuur akoon, geli sawir, wax ka beddel xogta ama maamul diiwaannada.", `<button class="button button-primary" data-action="add-student">+ Ku dar arday</button>`)}
    <section class="panel"><div class="panel-head"><h2>Liiska ardayda <span class="tag">${students.length}</span></h2>
      <div class="toolbar"><input id="studentSearch" class="search-input" type="search" value="${html(search)}" placeholder="Raadi magac, lambar ama fasal"><button class="button button-quiet button-small" data-action="search-students">Raadi</button></div></div>
      <div class="table-wrap"><table class="data-table"><thead><tr><th>ARDAYGA</th><th>USERNAME</th><th>FASALKA</th><th>FALAL</th></tr></thead>
      <tbody>${students.length ? students.map(studentRow).join("") : `<tr><td colspan="4" class="empty-state">Arday lama helin.</td></tr>`}</tbody></table></div></section>`;
  $("#studentSearch").addEventListener("keydown", (event) => {
    if (event.key === "Enter")
      renderStudents(event.currentTarget.value.trim()).catch((error) =>
        notify(error.message, true),
      );
  });
}

function showModal(title, content) {
  $("#modalRoot").innerHTML =
    `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
    <header class="modal-head"><h2 id="modalTitle">${title}</h2><button class="icon-button" type="button" data-action="close-modal" aria-label="Xir">×</button></header>
    <div class="modal-content">${content}</div></section></div>`;
  $(".modal-backdrop").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeModal();
  });
}

function closeModal() {
  $("#modalRoot").innerHTML = "";
}

function studentForm(student = null) {
  const editing = Boolean(student);
  showModal(
    editing ? "Wax ka beddel xogta ardayga" : "Diiwaangeli arday cusub",
    `
    <form id="studentForm" class="form-grid" enctype="multipart/form-data">
      <label class="field"><span>Magaca oo buuxa *</span><input name="fullName" required maxlength="120" value="${html(student?.fullName || "")}" placeholder="Magaca ardayga"></label>
      <label class="field"><span>Fasalka *</span><input name="className" required maxlength="40" value="${html(student?.className || "")}" placeholder="Tusaale: Fasalka 8A"></label>
      <label class="field"><span>Lambarka ardayga *</span><input name="studentNumber" required maxlength="40" value="${html(student?.studentNumber || "")}" placeholder="Tusaale: MID-2026-001"></label>
      <label class="field"><span>Username-ka ardayga *</span><input name="username" required maxlength="60" value="${html(student?.username || "")}" placeholder="Username uu ku galayo"></label>
      <label class="field span-two"><span>${editing ? "Password cusub (ka tag madhan haddii aan la beddelayn)" : "Password-ka ardayga *"}</span><input name="password" type="password" minlength="8" ${editing ? "" : "required"} autocomplete="new-password" placeholder="${editing ? "Ikhtiyaari" : "Ugu yaraan 8 xaraf"}"></label>
      <label class="field span-two"><span>Sawirka ardayga (JPG, PNG ama WebP; ugu badnaan 4 MB)</span><input name="photo" type="file" accept="image/jpeg,image/png,image/webp"></label>
      <div class="span-two"><p class="form-note">Username-ka iyo password-ka waxaad ardayga ugu gudbin kartaa si gaar ah. Sawirku wuxuu ku kaydsan yahay server-ka dugsiga.</p>
        <div class="modal-actions"><button class="button button-quiet" type="button" data-action="close-modal">Jooji</button><button class="button button-primary" type="submit">${editing ? "Kaydi wax-ka-beddelka" : "Diiwaangeli ardayga"}</button></div></div>
    </form>`,
  );
  $("#studentForm").dataset.studentId = student?.id || "";
}

async function renderRecords(studentId = state.selectedStudentId) {
  state.selectedStudentId = studentId || null;
  state.students = await api("/api/admin/students");
  const options = state.students
    .map(
      (student) =>
        `<option value="${student.id}" ${String(student.id) === String(studentId) ? "selected" : ""}>${html(student.fullName)} — ${html(student.studentNumber)} (${html(student.className)})</option>`,
    )
    .join("");
  if (!studentId) {
    $("#mainContent").innerHTML =
      `${pageHeading("Natiijo &amp; xaadiris", "Dooro arday si aad u geliso dhibco ama aad u diiwaangeliso xaadiris.")}
      <section class="panel"><div class="panel-body"><label class="field"><span>Ardayga</span><select id="recordStudentSelect"><option value="">Dooro arday...</option>${options}</select></label>
      ${state.students.length ? "" : `<p class="empty-state">Marka hore ka diiwaangeli ardayda qaybta Ardayda.</p>`}</div></section>`;
    $("#recordStudentSelect").addEventListener("change", (event) => {
      const selectedId = event.currentTarget.value || null;
      state.selectedStudentId = selectedId;
      renderRecords(selectedId).catch((error) => notify(error.message, true));
    });
    return;
  }
  const student = state.students.find(
    (item) => String(item.id) === String(studentId),
  );
  if (!student) {
    state.selectedStudentId = null;
    return renderRecords();
  }
  const records = await api(`/api/admin/students/${student.id}/records`);
  $("#mainContent").innerHTML =
    `${pageHeading("Natiijo &amp; xaadiris", "Ku dar oo maamul diiwaanka ardayga.", `<button class="button button-quiet" data-action="select-another">Dooro arday kale</button>`)}
    <div class="two-column">
      <div>
        <section class="panel"><div class="panel-body"><div class="profile-header">${avatarMarkup(student, "profile-photo")}<div><h2>${html(student.fullName)}</h2><p>${html(student.studentNumber)} · ${html(student.username)} · ${html(student.className)}</p></div></div></div></section>
        <section class="panel spaced-panel"><div class="panel-head"><h2>Natiijooyinka</h2><span class="tag">${records.grades.length} diiwaan</span></div><div class="panel-body"><div class="record-list">
          ${records.grades.length ? records.grades.map((grade) => `<div class="record-row"><div><strong>${html(grade.subject)} · ${html(grade.examName)}</strong><small>${html(grade.teacher || "Macallin lama cayimin")}</small></div><div><span class="tag">${grade.score}%</span> <button class="button button-danger button-small" data-action="delete-grade" data-id="${grade.id}">Tirtir</button></div></div>`).join("") : `<p class="empty-state">Natiijo weli lama gelin.</p>`}</div></div></section>
        <section class="panel spaced-panel"><div class="panel-head"><h2>Xaadiriska</h2><span class="tag">${records.attendance.length} maalmood</span></div><div class="panel-body"><div class="record-list">
          ${records.attendance.length ? records.attendance.map((item) => `<div class="record-row"><div><strong>${html(item.date)}</strong><small>${attendanceLabel(item.status)}</small></div><div><span class="tag ${item.status}">${attendanceLabel(item.status)}</span> <button class="button button-danger button-small" data-action="delete-attendance" data-id="${item.id}">Tirtir</button></div></div>`).join("") : `<p class="empty-state">Xaadiris weli lama gelin.</p>`}</div></div></section>
      </div>
      <div>
        <section class="panel"><div class="panel-head"><h2>Ku dar natiijo</h2></div><div class="panel-body">
          <form id="gradeForm" class="form-grid"><label class="field span-two"><span>Maaddada *</span><input name="subject" required maxlength="80" placeholder="Tusaale: Xisaab"></label>
            <label class="field span-two"><span>Magaca imtixaanka *</span><input name="examName" required maxlength="100" placeholder="Tusaale: Imtixaanka dhexe"></label>
            <label class="field span-two"><span>Macallinka</span><input name="teacher" maxlength="100" placeholder="Magaca macallinka"></label>
            <label class="field span-two"><span>Dhibcaha (0–100) *</span><input name="score" type="number" required min="0" max="100" step="0.01"></label>
            <button class="button button-primary" type="submit">Kaydi natiijada</button></form>
        </div></section>
        <section class="panel spaced-panel"><div class="panel-head"><h2>Diiwaangeli xaadiris</h2></div><div class="panel-body">
          <form id="attendanceForm" class="form-grid"><label class="field span-two"><span>Taariikhda *</span><input name="date" type="date" required value="${new Date().toISOString().slice(0, 10)}"></label>
            <label class="field span-two"><span>Xaaladda *</span><select name="status"><option value="present">Joogay</option><option value="absent">Maqnaa</option><option value="late">Daahay</option></select></label>
            <button class="button button-primary" type="submit">Kaydi xaadiriska</button></form>
          <p class="form-note">Haddii taariikhda ardayga hore loo diiwaangeliyey, xogta cusub ayaa beddelaysa xaaladdii hore.</p>
        </div></section>
      </div>
    </div>`;
  $("#gradeForm").dataset.studentId = student.id;
  $("#attendanceForm").dataset.studentId = student.id;
}

function attendanceLabel(status) {
  return (
    { present: "Joogay", absent: "Maqnaa", late: "Daahay" }[status] || status
  );
}

function renderSettings() {
  $("#mainContent").innerHTML =
    `${pageHeading("Dejinta maamulka", "Beddel erayga sirta ah ee akoonka maamulka.")}
    <div class="two-column"><section class="panel"><div class="panel-head"><h2>Beddel password-ka maamulka</h2></div><div class="panel-body">
      <form id="passwordForm" class="form-grid"><label class="field span-two"><span>Password-ka hadda jira *</span><input name="currentPassword" type="password" required autocomplete="current-password"></label>
      <label class="field span-two"><span>Password-ka cusub *</span><input name="newPassword" type="password" required minlength="10" autocomplete="new-password"></label>
      <label class="field span-two"><span>Xaqiiji password-ka cusub *</span><input name="confirmPassword" type="password" required minlength="10" autocomplete="new-password"></label>
      <button class="button button-primary" type="submit">Beddel password-ka</button></form>
    </div></section><section class="panel"><div class="panel-head"><h2>Macluumaadka nidaamka</h2></div><div class="panel-body">
      <p><strong>Magaca dugsiga</strong><br><span class="form-note">Midnimo Academy For Science &amp; Technology</span></p>
      <p><strong>Kaydka xogta</strong><br><span class="form-note">SQLite · xogtu waxay ku kaydsan tahay server-kaaga.</span></p>
      <p><strong>Sawirrada</strong><br><span class="form-note">JPG, PNG iyo WebP · ugu badnaan 4 MB sawirkiiba.</span></p>
      <p><strong>Ammaanka</strong><br><span class="form-note">Password-yada waxaa lagu kaydiyaa hash, ma aha qoraal caadi ah.</span></p>
    </div></section></div>`;
}

async function renderStudentPage() {
  state.studentDashboard = await api("/api/student/dashboard");
  const data = state.studentDashboard;
  const page = state.currentPage;
  if (page === "studentGrades") {
    $("#mainContent").innerHTML =
      `${pageHeading("Natiijooyinkayga", "Dhibcaha imtixaannadaada ee la diiwaangeliyey.")}
      <section class="panel"><div class="panel-head"><h2>Natiijooyinka imtixaanka</h2><span class="tag">${data.grades.length} natiijo</span></div>
      <div class="table-wrap"><table class="data-table"><thead><tr><th>MAADDADA</th><th>IMTIXAANKA</th><th>MACALLINKA</th><th>DHIBCO</th></tr></thead><tbody>
      ${data.grades.length ? data.grades.map((grade) => `<tr><td>${html(grade.subject)}</td><td>${html(grade.examName)}</td><td>${html(grade.teacher || "—")}</td><td><span class="tag">${grade.score}%</span></td></tr>`).join("") : `<tr><td colspan="4" class="empty-state">Natiijo wali lama diiwaangelin.</td></tr>`}
      </tbody></table></div></section>`;
    return;
  }
  if (page === "studentAttendance") {
    $("#mainContent").innerHTML =
      `${pageHeading("Xaadiriskayga", "Diiwaanka xaadiriskaaga ee la diiwaangeliyey.")}
      <section class="panel"><div class="panel-head"><h2>Diiwaanka xaadiriska</h2><span class="tag">${data.summary.attendanceTotal} maalmood</span></div>
      <div class="table-wrap"><table class="data-table"><thead><tr><th>TAARIIKH</th><th>XAAALADDA</th></tr></thead><tbody>
      ${data.attendance.length ? data.attendance.map((item) => `<tr><td>${html(item.date)}</td><td><span class="tag ${item.status}">${attendanceLabel(item.status)}</span></td></tr>`).join("") : `<tr><td colspan="2" class="empty-state">Xaadiris wali lama diiwaangelin.</td></tr>`}
      </tbody></table></div></section>`;
    return;
  }
  const counts = data.summary.attendanceCounts;
  const rate = data.summary.attendanceRate;
  const name = data.student.fullName.split(/\s+/)[0];
  $("#mainContent").innerHTML =
    `${pageHeading(`Salaan, ${html(name)}!`, `Fasalka ${html(data.student.className)} · lambarka ardayga ${html(data.student.studentNumber)}`)}
    <div class="student-stats">
      ${statCard("Celceliska imtixaanka", data.summary.gradeAverage === null ? "—" : `${data.summary.gradeAverage}%`, "Dhammaan maaddooyinka", "▤")}
      ${statCard("Xaadiris guud", `${rate}%`, `${data.summary.attendanceTotal} maalmood la diiwaangeliyey`, "✓", "green")}
      ${statCard("Natiijooyinka", data.grades.length, "Imtixaannada la geliyey", "↗", "amber")}
    </div>
    <div class="two-column">
      <section class="panel"><div class="panel-head"><h2>Natiijooyinkii u dambeeyey</h2><button class="button button-quiet button-small" data-page="studentGrades">Dhammaan eeg</button></div>
        <div class="panel-body"><div class="record-list">${
          data.grades.length
            ? data.grades
                .slice(0, 5)
                .map(
                  (grade) =>
                    `<div class="record-row"><div><strong>${html(grade.subject)} · ${html(grade.examName)}</strong><small>${html(grade.teacher || "Macallin lama cayimin")}</small></div><span class="tag">${grade.score}%</span></div>`,
                )
                .join("")
            : `<p class="empty-state">Natiijo wali lama gelin.</p>`
        }</div></div>
      </section>
      <section class="panel"><div class="panel-head"><h2>Xaadiriskayga</h2><button class="button button-quiet button-small" data-page="studentAttendance">Faahfaahin</button></div>
        <div class="panel-body"><div class="attendance-summary"><div class="ring" role="img" aria-label="Xaadiris ${rate}%">
          <svg class="ring-svg" viewBox="0 0 100 100" aria-hidden="true"><circle class="ring-track" cx="50" cy="50" r="42" pathLength="100"></circle><circle class="ring-progress" cx="50" cy="50" r="42" pathLength="100" stroke-dasharray="${rate} 100" transform="rotate(-90 50 50)"></circle></svg>
          <strong>${rate}%<small>xaadiris</small></strong></div>
        <div class="attendance-key"><div class="key-row"><span>Joogay</span><strong>${counts.present}</strong></div><div class="key-row"><span>Maqnaa</span><strong>${counts.absent}</strong></div><div class="key-row"><span>Daahay</span><strong>${counts.late}</strong></div></div></div>
        <div class="record-list recent-attendance">${
          data.attendance
            .slice(0, 4)
            .map(
              (item) =>
                `<div class="record-row"><strong>${html(item.date)}</strong><span class="tag ${item.status}">${attendanceLabel(item.status)}</span></div>`,
            )
            .join("") || `<p class="empty-state">Xaadiris wali lama gelin.</p>`
        }</div></div>
      </section>
    </div>`;
}

async function submitAuth(form) {
  const values = new FormData(form);
  const mode = form.dataset.mode;
  const username = values.get("username").trim();
  const password = values.get("password");
  if (mode === "setup" && password !== values.get("confirmPassword"))
    throw new Error("Labada password isku mid ma aha.");
  const response = await fetch(
    mode === "setup" ? "/api/auth/setup" : "/api/auth/login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ username, password }),
    },
  );
  const result = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(result?.error || "Gelitaanku ma suurtagelin.");
  state.csrfToken = result.csrfToken;
  await loadSession();
}

async function submitStudentForm(form) {
  const id = form.dataset.studentId;
  const method = id ? "PUT" : "POST";
  const url = id ? `/api/admin/students/${id}` : "/api/admin/students";
  const result = await api(url, { method, body: new FormData(form) });
  closeModal();
  notify(
    id
      ? "Xogta ardayga waa la cusboonaysiiyey."
      : `Ardayga waa la diiwaangeliyey. Username: ${result.username}`,
  );
  await renderPage();
}

async function submitGradeForm(form) {
  const body = Object.fromEntries(new FormData(form));
  body.score = Number(body.score);
  await api(`/api/admin/students/${form.dataset.studentId}/grades`, {
    method: "POST",
    body,
  });
  notify("Natiijada waa la kaydiyey.");
  await renderRecords(form.dataset.studentId);
}

async function submitAttendanceForm(form) {
  const body = Object.fromEntries(new FormData(form));
  await api(`/api/admin/students/${form.dataset.studentId}/attendance`, {
    method: "POST",
    body,
  });
  notify("Xaadiriska waa la kaydiyey.");
  await renderRecords(form.dataset.studentId);
}

async function submitPasswordForm(form) {
  const values = Object.fromEntries(new FormData(form));
  if (values.newPassword !== values.confirmPassword)
    throw new Error("Labada password isku mid ma aha.");
  await api("/api/admin/password", { method: "POST", body: values });
  state.csrfToken = "";
  resetToLogin();
  notify("Password-ka waa la beddelay. Fadlan ku gal password-ka cusub.");
}

document.addEventListener("submit", async (event) => {
  const form = event.target;
  if (!form.matches("form")) return;
  event.preventDefault();
  try {
    if (form.id === "authForm") {
      event.preventDefault();
      const authpage = document.getElementById("authpage");
      const dashboard = document.getElementById("dashboard");
      if (authpage) authpage.classList.add("hidden");
      if (dashboard) dashboard.classList.remove("hidden");
      $("#authError").textContent = "";
      $("#authpage").classList.add("hidden");
    }
  } catch (error) {
    if (form.id === "authForm") $("#authError").textContent = error.message;
    else notify(error.message, true);
  }
});

document.addEventListener("click", async (event) => {
  const pageButton = event.target.closest("[data-page]");
  if (pageButton && pageButton.dataset.page) {
    state.currentPage = pageButton.dataset.page;
    $("#sidebar").classList.remove("open");
    updateNavigation();
    try {
      await renderPage();
    } catch (error) {
      notify(error.message, true);
    }
    return;
  }
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const { action, id } = button.dataset;
  try {
    if (action === "close-modal") closeModal();
    if (action === "add-student") studentForm();
    if (action === "edit") {
      const student =
        state.students.find((item) => String(item.id) === String(id)) ||
        (await api("/api/admin/students").then((items) =>
          items.find((item) => String(item.id) === String(id)),
        ));
      if (!student) throw new Error("Ardayga lama helin.");
      studentForm(student);
    }
    if (action === "records") {
      state.currentPage = "records";
      state.selectedStudentId = id;
      updateNavigation();
      await renderRecords(id);
    }
    if (action === "select-another") {
      state.selectedStudentId = null;
      await renderRecords(null);
    }
    if (action === "search-students")
      await renderStudents($("#studentSearch").value.trim());
    if (action === "delete") {
      const student = state.students.find(
        (item) => String(item.id) === String(id),
      );
      if (
        student &&
        window.confirm(
          `Ma hubtaa inaad tirtirayso ${student.fullName}? Natiijooyinka iyo xaadiriskuna way tirmayaan.`,
        )
      ) {
        await api(`/api/admin/students/${id}`, { method: "DELETE" });
        notify("Ardayga iyo diiwaannadiisa waa la tirtiray.");
        await renderPage();
      }
    }
    if (
      action === "delete-grade" &&
      window.confirm("Ma tirtiraysaa natiijadan?")
    ) {
      await api(`/api/admin/grades/${id}`, { method: "DELETE" });
      notify("Natiijada waa la tirtiray.");
      await renderRecords();
    }
    if (
      action === "delete-attendance" &&
      window.confirm("Ma tirtiraysaa diiwaankan?")
    ) {
      await api(`/api/admin/attendance/${id}`, { method: "DELETE" });
      notify("Diiwaanka xaadiriska waa la tirtiray.");
      await renderRecords();
    }
  } catch (error) {
    notify(error.message, true);
  }
});

$("#logoutButton").addEventListener("click", async () => {
  try {
    await api("/api/auth/logout", { method: "POST" });
    resetToLogin();
    $("#authError").textContent = "";
  } catch (error) {
    notify(error.message, true);
  }
});

$("#menuButton").addEventListener("click", () =>
  $("#sidebar").classList.toggle("open"),
);

(async function start() {
  try {
    if (await loadSession()) return;
    await loadAuthStatus();
    $("#authPage").classList.remove("hidden");
  } catch (error) {
    $("authPage").classList.remove("hidden");
  }
})();

const supabaseClient = window.fydpSupabase;

const pageShell = document.querySelector("#page-shell");
const loginForm = document.querySelector("#login-form");
const loginMethods = document.querySelector(".login-methods");
const methodButtons = document.querySelectorAll(".method-button");
const emailInput = document.querySelector("#email");
const passwordField = document.querySelector("#password-field");
const passwordInput = document.querySelector("#password");
const otpField = document.querySelector("#otp-field");
const otpInput = document.querySelector("#otp-code");
const emailError = document.querySelector("#email-error");
const passwordError = document.querySelector("#password-error");
const otpError = document.querySelector("#otp-error");
const formMessage = document.querySelector("#form-message");
const showPasswordButton = document.querySelector("#show-password");
const submitButton = document.querySelector("#submit-button");
const changeEmailButton = document.querySelector("#change-email");
const signedInPanel = document.querySelector("#signed-in-panel");
const signedInName = document.querySelector("#signed-in-name");
const signedInRole = document.querySelector("#signed-in-role");
const signOutButton = document.querySelector("#sign-out-button");

const adminDashboard = document.querySelector("#admin-dashboard");
const activeSessionName = document.querySelector("#active-session-name");
const assessmentSelect = document.querySelector("#assessment-select");
const rubricFileInput = document.querySelector("#rubric-file");
const previewRubricButton = document.querySelector("#preview-rubric-button");
const importRubricButton = document.querySelector("#import-rubric-button");
const rubricMessage = document.querySelector("#rubric-message");
const rubricPreview = document.querySelector("#rubric-preview");
const previewFileName = document.querySelector("#preview-file-name");
const previewCriteriaCount = document.querySelector("#preview-criteria-count");
const previewTotalMarks = document.querySelector("#preview-total-marks");
const rubricPreviewBody = document.querySelector("#rubric-preview-body");

let signInMode = "otp";
let otpWasSent = false;
let activeProfile = null;
let activeSession = null;
let availableAssessments = [];
let parsedRubric = null;

function showMessage(message, type = "") {
  formMessage.textContent = message;
  formMessage.className = `form-message ${type}`.trim();
}

function showRubricMessage(message, type = "") {
  rubricMessage.textContent = message;
  rubricMessage.className = `dashboard-message ${type}`.trim();
}

function clearErrors() {
  emailError.textContent = "";
  passwordError.textContent = "";
  otpError.textContent = "";
  emailInput.removeAttribute("aria-invalid");
  passwordInput.removeAttribute("aria-invalid");
  otpInput.removeAttribute("aria-invalid");
  showMessage("");
}

function setLoading(isLoading) {
  submitButton.disabled = isLoading;
  submitButton.textContent = isLoading
    ? "Please wait…"
    : signInMode === "password"
      ? "Sign in"
      : otpWasSent
        ? "Verify and sign in"
        : "Send verification code";
}

function resetOtpFlow() {
  otpWasSent = false;
  otpInput.value = "";
  otpField.hidden = true;
  changeEmailButton.hidden = true;
  emailInput.disabled = false;
  submitButton.textContent = "Send verification code";
}

function setSignInMode(mode) {
  signInMode = mode;
  clearErrors();
  resetOtpFlow();

  methodButtons.forEach((button) => {
    const isActive = button.dataset.mode === mode;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  passwordField.hidden = mode !== "password";
  passwordInput.required = mode === "password";
  submitButton.textContent = mode === "password" ? "Sign in" : "Send verification code";
}

function validEmail() {
  if (emailInput.validity.valid) {
    return true;
  }
  emailError.textContent = "Enter a valid approved email address.";
  emailInput.setAttribute("aria-invalid", "true");
  return false;
}

function cleanCell(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function resetRubricPreview() {
  parsedRubric = null;
  rubricPreview.hidden = true;
  rubricPreviewBody.replaceChildren();
  importRubricButton.disabled = true;
  showRubricMessage("");
}

function updatePreviewButtonState() {
  previewRubricButton.disabled = !assessmentSelect.value || !rubricFileInput.files?.length;
}

function resetAdminDashboard() {
  activeProfile = null;
  activeSession = null;
  availableAssessments = [];
  adminDashboard.hidden = true;
  activeSessionName.textContent = "Loading…";
  assessmentSelect.innerHTML = '<option value="">Loading assessments…</option>';
  assessmentSelect.disabled = true;
  rubricFileInput.value = "";
  rubricFileInput.disabled = true;
  previewRubricButton.disabled = true;
  resetRubricPreview();
}

async function loadAdminDashboard() {
  adminDashboard.hidden = false;
  showRubricMessage("Loading the active session and assessments…");

  const { data: sessionRecord, error: sessionError } = await supabaseClient
    .from("academic_sessions")
    .select("id, name")
    .eq("is_active", true)
    .maybeSingle();

  if (sessionError || !sessionRecord) {
    activeSessionName.textContent = "Not configured";
    showRubricMessage(
      sessionError?.message || "No active FYDP session was found. Activate a session before importing a rubric.",
      "error"
    );
    return;
  }

  activeSession = sessionRecord;
  activeSessionName.textContent = sessionRecord.name;

  const { data: assessments, error: assessmentError } = await supabaseClient
    .from("assessments")
    .select("id, name, weightage, rubric_total, sort_order")
    .eq("session_id", sessionRecord.id)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (assessmentError || !assessments?.length) {
    showRubricMessage(
      assessmentError?.message || "No active assessments were found for this session.",
      "error"
    );
    return;
  }

  availableAssessments = assessments;
  assessmentSelect.replaceChildren();

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select an assessment";
  assessmentSelect.append(placeholder);

  assessments.forEach((assessment) => {
    const option = document.createElement("option");
    option.value = assessment.id;
    option.textContent = `${assessment.name} (${assessment.weightage}%)`;
    assessmentSelect.append(option);
  });

  const synopsisAssessment = assessments.find(
    (assessment) => assessment.name.toLowerCase() === "synopsis presentation"
  );
  if (synopsisAssessment) {
    assessmentSelect.value = synopsisAssessment.id;
  }

  assessmentSelect.disabled = false;
  rubricFileInput.disabled = false;
  updatePreviewButtonState();
  showRubricMessage("Select the approved Excel sheet and preview it before importing.");
}

async function finishSignIn(user) {
  const { data: profile, error } = await supabaseClient
    .from("profiles")
    .select("id, full_name, role, approved")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (error || !profile?.approved) {
    await supabaseClient.auth.signOut();
    showMessage("This email address is not an approved FYDP account.", "error");
    return;
  }

  activeProfile = profile;
  loginForm.hidden = true;
  loginMethods.hidden = true;
  signedInPanel.hidden = false;
  pageShell.classList.add("signed-in-layout");
  signedInName.textContent = profile.full_name;
  signedInRole.textContent = {
    administrator: "Administrator",
    coordinator: "Coordinator",
    evaluator: "Evaluator"
  }[profile.role] || "Authorized user";

  if (profile.role === "administrator") {
    await loadAdminDashboard();
  } else {
    adminDashboard.hidden = true;
  }
}

function buildPerformanceLevels(maximumMark, descriptions) {
  const boundaries = [
    [0, Math.round(maximumMark * 0.4)],
    [Math.round(maximumMark * 0.4), Math.round(maximumMark * 0.6)],
    [Math.round(maximumMark * 0.6), Math.round(maximumMark * 0.8)],
    [Math.round(maximumMark * 0.8), maximumMark]
  ];
  const labels = ["Unsatisfactory", "Developing", "Good", "Excellent"];

  return labels.map((label, index) => {
    const [minimumMark, maximumBandMark] = boundaries[index];
    return {
      label,
      description: descriptions[index],
      minimum_mark: minimumMark,
      maximum_mark: maximumBandMark,
      suggested_mark: Math.round((minimumMark + maximumBandMark) / 2),
      sort_order: index + 1
    };
  });
}

async function parseRubricWorkbook(file) {
  if (!window.XLSX) {
    throw new Error("The Excel reader did not load. Check the internet connection and refresh the page.");
  }

  const fileBytes = await file.arrayBuffer();
  const workbook = window.XLSX.read(fileBytes, { type: "array" });
  const sheetName = workbook.SheetNames.find((name) =>
    name.toLowerCase().includes("synopsis presentation")
  ) || workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = window.XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: true
  });

  const criteria = [];

  rows.forEach((row) => {
    const code = cleanCell(row[0]).toUpperCase();
    if (!/^[AB]\d+$/.test(code)) {
      return;
    }

    const title = cleanCell(row[1]);
    const clo = cleanCell(row[2]);
    const plo = cleanCell(row[3]);
    const maximumMark = Number(row[8]);

    if (!title || !clo || !plo || !Number.isInteger(maximumMark) || maximumMark <= 0) {
      throw new Error(`The Excel row ${code} is missing its title, CLO/PLO code, or maximum mark.`);
    }

    if (code.startsWith("A")) {
      const guidance = cleanCell(row[4]);
      criteria.push({
        code,
        title: `${code} - ${title}`,
        description: guidance,
        clo,
        plo,
        max_mark: maximumMark,
        sort_order: criteria.length + 1,
        scoring: "Binary: 0 or full marks",
        levels: [
          {
            label: "Not met",
            description: "Required deliverable or condition is absent.",
            minimum_mark: 0,
            maximum_mark: 0,
            suggested_mark: 0,
            sort_order: 1
          },
          {
            label: "Met",
            description: guidance || "Required deliverable or condition is present.",
            minimum_mark: maximumMark,
            maximum_mark: maximumMark,
            suggested_mark: maximumMark,
            sort_order: 2
          }
        ]
      });
      return;
    }

    const descriptions = [4, 5, 6, 7].map((column) => cleanCell(row[column]));
    if (descriptions.some((description) => !description)) {
      throw new Error(`The Excel row ${code} is missing one or more performance-band descriptions.`);
    }

    criteria.push({
      code,
      title: `${code} - ${title}`,
      description: "Score within the performance band that best describes the work.",
      clo,
      plo,
      max_mark: maximumMark,
      sort_order: criteria.length + 1,
      scoring: "Four performance bands",
      levels: buildPerformanceLevels(maximumMark, descriptions)
    });
  });

  if (!criteria.length) {
    throw new Error("No rubric rows were found. Use the revised UET Synopsis Presentation Excel layout.");
  }

  const uniqueCodes = new Set(criteria.map((criterion) => criterion.code));
  if (uniqueCodes.size !== criteria.length) {
    throw new Error("The Excel sheet contains duplicate rubric codes.");
  }

  return {
    fileName: file.name,
    sheetName,
    criteria,
    totalMarks: criteria.reduce((total, criterion) => total + criterion.max_mark, 0)
  };
}

function renderRubricPreview(rubric) {
  rubricPreviewBody.replaceChildren();

  rubric.criteria.forEach((criterion) => {
    const row = document.createElement("tr");
    const values = [
      criterion.code,
      criterion.title.replace(`${criterion.code} - `, ""),
      `${criterion.clo} / ${criterion.plo}`,
      String(criterion.max_mark),
      criterion.scoring
    ];

    values.forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    });
    rubricPreviewBody.append(row);
  });

  previewFileName.textContent = rubric.fileName;
  previewCriteriaCount.textContent = String(rubric.criteria.length);
  previewTotalMarks.textContent = String(rubric.totalMarks);
  rubricPreview.hidden = false;
}

async function cleanupIncompleteRubric(versionId, criterionIds) {
  if (criterionIds.length) {
    await supabaseClient.from("rubric_levels").delete().in("criterion_id", criterionIds);
    await supabaseClient.from("rubric_criteria").delete().in("id", criterionIds);
  }
  if (versionId) {
    await supabaseClient.from("rubric_versions").delete().eq("id", versionId);
  }
}

async function saveRubricVersion(assessment, rubric) {
  const { data: latestVersions, error: versionLookupError } = await supabaseClient
    .from("rubric_versions")
    .select("version_number")
    .eq("assessment_id", assessment.id)
    .order("version_number", { ascending: false })
    .limit(1);

  if (versionLookupError) {
    throw versionLookupError;
  }

  const versionNumber = (latestVersions?.[0]?.version_number || 0) + 1;
  let versionId = null;
  let criterionIds = [];

  try {
    const { data: versionRecord, error: versionInsertError } = await supabaseClient
      .from("rubric_versions")
      .insert({
        assessment_id: assessment.id,
        version_number: versionNumber,
        total_max_marks: rubric.totalMarks,
        is_finalized: false
      })
      .select("id")
      .single();

    if (versionInsertError) {
      throw versionInsertError;
    }
    versionId = versionRecord.id;

    const criteriaPayload = rubric.criteria.map((criterion) => ({
      rubric_version_id: versionId,
      title: criterion.title,
      description: `${criterion.clo} | ${criterion.plo} | ${criterion.description}`,
      max_mark: criterion.max_mark,
      sort_order: criterion.sort_order,
      is_active: true
    }));

    const { data: insertedCriteria, error: criteriaError } = await supabaseClient
      .from("rubric_criteria")
      .insert(criteriaPayload)
      .select("id, title");

    if (criteriaError) {
      throw criteriaError;
    }

    criterionIds = insertedCriteria.map((criterion) => criterion.id);
    const criterionIdByTitle = new Map(
      insertedCriteria.map((criterion) => [criterion.title, criterion.id])
    );

    const levelsPayload = rubric.criteria.flatMap((criterion) => {
      const criterionId = criterionIdByTitle.get(criterion.title);
      return criterion.levels.map((level) => ({
        criterion_id: criterionId,
        label: level.label,
        description: level.description,
        minimum_mark: level.minimum_mark,
        maximum_mark: level.maximum_mark,
        suggested_mark: level.suggested_mark,
        sort_order: level.sort_order
      }));
    });

    const { error: levelsError } = await supabaseClient
      .from("rubric_levels")
      .insert(levelsPayload);

    if (levelsError) {
      throw levelsError;
    }

    const { error: finalizationError } = await supabaseClient
      .from("rubric_versions")
      .update({ is_finalized: true })
      .eq("id", versionId);

    if (finalizationError) {
      throw finalizationError;
    }

    return versionNumber;
  } catch (error) {
    await cleanupIncompleteRubric(versionId, criterionIds);
    throw error;
  }
}

methodButtons.forEach((button) => {
  button.addEventListener("click", () => setSignInMode(button.dataset.mode));
});

showPasswordButton.addEventListener("click", () => {
  const passwordIsHidden = passwordInput.type === "password";
  passwordInput.type = passwordIsHidden ? "text" : "password";
  showPasswordButton.textContent = passwordIsHidden ? "Hide" : "Show";
  showPasswordButton.setAttribute(
    "aria-label",
    passwordIsHidden ? "Hide password" : "Show password"
  );
});

changeEmailButton.addEventListener("click", () => {
  clearErrors();
  resetOtpFlow();
  emailInput.focus();
});

assessmentSelect.addEventListener("change", () => {
  resetRubricPreview();
  updatePreviewButtonState();
});

rubricFileInput.addEventListener("change", () => {
  resetRubricPreview();
  updatePreviewButtonState();
});

previewRubricButton.addEventListener("click", async () => {
  resetRubricPreview();
  const file = rubricFileInput.files?.[0];
  const assessment = availableAssessments.find((item) => item.id === assessmentSelect.value);

  if (!file || !assessment) {
    showRubricMessage("Select an assessment and Excel file first.", "error");
    return;
  }

  previewRubricButton.disabled = true;
  showRubricMessage("Reading the Excel rubric…");

  try {
    const rubric = await parseRubricWorkbook(file);
    if (rubric.totalMarks !== Number(assessment.rubric_total)) {
      throw new Error(
        `The Excel criteria total ${rubric.totalMarks}, but ${assessment.name} requires ${assessment.rubric_total} marks.`
      );
    }

    parsedRubric = rubric;
    renderRubricPreview(rubric);
    importRubricButton.disabled = false;
    showRubricMessage(
      `Preview ready: ${rubric.criteria.length} criteria totaling ${rubric.totalMarks} marks.`,
      "success"
    );
  } catch (error) {
    showRubricMessage(error.message || "The Excel rubric could not be read.", "error");
  } finally {
    previewRubricButton.disabled = false;
  }
});

importRubricButton.addEventListener("click", async () => {
  const assessment = availableAssessments.find((item) => item.id === assessmentSelect.value);
  if (!activeProfile || activeProfile.role !== "administrator" || !assessment || !parsedRubric) {
    showRubricMessage("Preview a valid rubric before importing.", "error");
    return;
  }

  importRubricButton.disabled = true;
  previewRubricButton.disabled = true;
  assessmentSelect.disabled = true;
  rubricFileInput.disabled = true;
  showRubricMessage("Importing and finalizing the rubric…");

  try {
    const versionNumber = await saveRubricVersion(assessment, parsedRubric);
    showRubricMessage(
      `${assessment.name} rubric version ${versionNumber} was imported and finalized successfully.`,
      "success"
    );
  } catch (error) {
    showRubricMessage(error.message || "The rubric could not be imported.", "error");
    importRubricButton.disabled = false;
  } finally {
    previewRubricButton.disabled = false;
    assessmentSelect.disabled = false;
    rubricFileInput.disabled = false;
  }
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearErrors();

  if (!validEmail()) {
    return;
  }

  setLoading(true);

  if (signInMode === "password") {
    if (passwordInput.value.length < 6) {
      passwordError.textContent = "Password must contain at least 6 characters.";
      passwordInput.setAttribute("aria-invalid", "true");
      setLoading(false);
      return;
    }

    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: emailInput.value.trim(),
      password: passwordInput.value
    });

    if (error) {
      showMessage(error.message, "error");
      setLoading(false);
      return;
    }

    await finishSignIn(data.user);
    setLoading(false);
    return;
  }

  if (!otpWasSent) {
    const { error } = await supabaseClient.auth.signInWithOtp({
      email: emailInput.value.trim(),
      options: { shouldCreateUser: true }
    });

    if (error) {
      showMessage(error.message, "error");
      setLoading(false);
      return;
    }

    otpWasSent = true;
    otpField.hidden = false;
    changeEmailButton.hidden = false;
    emailInput.disabled = true;
    showMessage("A verification code has been sent to your email.", "success");
    setLoading(false);
    otpInput.focus();
    return;
  }

  const token = otpInput.value.trim();
  if (!/^\d{6,8}$/.test(token)) {
    otpError.textContent = "Enter the numeric code from your email.";
    otpInput.setAttribute("aria-invalid", "true");
    setLoading(false);
    return;
  }

  const { data, error } = await supabaseClient.auth.verifyOtp({
    email: emailInput.value.trim(),
    token,
    type: "email"
  });

  if (error) {
    showMessage(error.message, "error");
    setLoading(false);
    return;
  }

  await finishSignIn(data.user);
  setLoading(false);
});

signOutButton.addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  resetAdminDashboard();
  signedInPanel.hidden = true;
  loginMethods.hidden = false;
  loginForm.hidden = false;
  pageShell.classList.remove("signed-in-layout");
  loginForm.reset();
  setSignInMode("otp");
});

supabaseClient.auth.getSession().then(({ data }) => {
  if (data.session?.user) {
    finishSignIn(data.session.user);
  }
});

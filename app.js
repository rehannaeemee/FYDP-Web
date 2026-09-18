const supabaseClient = window.fydpSupabase;

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

let signInMode = "otp";
let otpWasSent = false;

function showMessage(message, type = "") {
  formMessage.textContent = message;
  formMessage.className = `form-message ${type}`.trim();
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

async function finishSignIn(user) {
  const { data: profile, error } = await supabaseClient
    .from("profiles")
    .select("full_name, role, approved")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (error || !profile?.approved) {
    await supabaseClient.auth.signOut();
    showMessage("This email address is not an approved FYDP account.", "error");
    return;
  }

  loginForm.hidden = true;
  loginMethods.hidden = true;
  signedInPanel.hidden = false;
  signedInName.textContent = profile.full_name;
  signedInRole.textContent = {
    administrator: "Administrator",
    coordinator: "Coordinator",
    evaluator: "Evaluator"
  }[profile.role] || "Authorized user";
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
  signedInPanel.hidden = true;
  loginMethods.hidden = false;
  loginForm.hidden = false;
  loginForm.reset();
  setSignInMode("otp");
});

supabaseClient.auth.getSession().then(({ data }) => {
  if (data.session?.user) {
    finishSignIn(data.session.user);
  }
});

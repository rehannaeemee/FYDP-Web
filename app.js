const loginForm = document.querySelector("#login-form");
const emailInput = document.querySelector("#email");
const passwordInput = document.querySelector("#password");
const emailError = document.querySelector("#email-error");
const passwordError = document.querySelector("#password-error");
const formMessage = document.querySelector("#form-message");
const showPasswordButton = document.querySelector("#show-password");

showPasswordButton.addEventListener("click", () => {
  const passwordIsHidden = passwordInput.type === "password";
  passwordInput.type = passwordIsHidden ? "text" : "password";
  showPasswordButton.textContent = passwordIsHidden ? "Hide" : "Show";
  showPasswordButton.setAttribute(
    "aria-label",
    passwordIsHidden ? "Hide password" : "Show password"
  );
});

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();

  emailError.textContent = "";
  passwordError.textContent = "";
  formMessage.textContent = "";
  emailInput.removeAttribute("aria-invalid");
  passwordInput.removeAttribute("aria-invalid");

  let formIsValid = true;

  if (!emailInput.validity.valid) {
    emailError.textContent = "Enter a valid email address.";
    emailInput.setAttribute("aria-invalid", "true");
    formIsValid = false;
  }

  if (passwordInput.value.length < 6) {
    passwordError.textContent = "Password must contain at least 6 characters.";
    passwordInput.setAttribute("aria-invalid", "true");
    formIsValid = false;
  }

  if (!formIsValid) {
    return;
  }

  formMessage.textContent =
    "Sign-in is not active yet. Please contact the FYDP administrator.";
});

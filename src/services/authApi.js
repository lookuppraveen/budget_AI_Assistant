import { requestApi } from "./httpClient.js";

export async function loginApi({ email, password }) {
  return requestApi("/auth/login", {
    notifyOnUnauthorized: false,
    options: {
      method: "POST",
      body: JSON.stringify({ email, password })
    }
  });
}

export async function signupApi({ name, email, password, role, departmentCode }) {
  return requestApi("/auth/signup", {
    notifyOnUnauthorized: false,
    options: {
      method: "POST",
      body: JSON.stringify({ name, email, password, role, departmentCode })
    }
  });
}

export async function forgotPasswordApi({ email }) {
  return requestApi("/auth/forgot-password", {
    notifyOnUnauthorized: false,
    options: {
      method: "POST",
      body: JSON.stringify({ email })
    }
  });
}

export async function resetPasswordApi({ token, password }) {
  return requestApi("/auth/reset-password", {
    notifyOnUnauthorized: false,
    options: {
      method: "POST",
      body: JSON.stringify({ token, password })
    }
  });
}

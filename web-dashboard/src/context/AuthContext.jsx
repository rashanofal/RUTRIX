import { createContext, useCallback, useContext, useEffect, useState } from "react";

const STORAGE_KEY = "pothole_auth";

const AuthContext = createContext(null);

function loadStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(loadStored);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = loadStored();
    if (!stored?.access_token) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${stored.access_token}` },
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        setAuth(data);
      })
      .catch(() => {
        localStorage.removeItem(STORAGE_KEY);
        setAuth(null);
      })
      .finally(() => {
        clearTimeout(timer);
        setLoading(false);
      });
  }, []);

  const login = useCallback(async (email, password) => {
    let res;
    try {
      res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
    } catch {
      throw new Error("لا اتصال بالسيرفر — شغّل START.bat ثم حدّث الصفحة");
    }
    if (!res.ok) {
      let msg = "فشل تسجيل الدخول";
      try {
        const err = await res.json();
        if (err.detail) {
          msg = typeof err.detail === "string" ? err.detail : JSON.stringify(err.detail);
        }
      } catch {
        if (res.status === 404) {
          msg = "السيرفر قديم — أغلق Backend وشغّل START.bat من جديد";
        }
      }
      throw new Error(msg);
    }
    const data = await res.json();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    setAuth(data);
    return data;
  }, []);

  const register = useCallback(async (payload) => {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "فشل التسجيل");
    }
    const data = await res.json();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    setAuth(data);
    return data;
  }, []);

  const persistAuth = useCallback((data) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    setAuth(data);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setAuth(null);
  }, []);

  const updateProfile = useCallback(async (full_name) => {
    const token = loadStored()?.access_token;
    if (!token) throw new Error("انتهت الجلسة — سجّل الدخول مرة أخرى");
    const res = await fetch("/api/auth/me", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ full_name }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "فشل تحديث الملف الشخصي");
    }
    const data = await res.json();
    persistAuth(data);
    return data;
  }, [persistAuth]);

  const changePassword = useCallback(async (current_password, new_password) => {
    const token = loadStored()?.access_token;
    if (!token) throw new Error("انتهت الجلسة — سجّل الدخول مرة أخرى");
    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ current_password, new_password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "فشل تغيير كلمة المرور");
    }
    return res.json();
  }, []);

  return (
    <AuthContext.Provider
      value={{ auth, loading, login, register, logout, updateProfile, changePassword }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside provider");
  return ctx;
}

export function getAccessToken() {
  return loadStored()?.access_token || null;
}

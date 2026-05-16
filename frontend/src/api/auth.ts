import { apiClient } from "./client";
import type {
  LoginRequest,
  PasswordResetConfirmRequest,
  PasswordResetRequest,
  RegisterRequest,
  TokenPair,
  User,
} from "@/types";

export async function login(data: LoginRequest): Promise<TokenPair> {
  const res = await apiClient.post<TokenPair>("sessions", data);
  return res.data;
}

export async function register(data: RegisterRequest): Promise<User> {
  const res = await apiClient.post<User>("users", data);
  return res.data;
}

export async function requestPasswordReset(data: PasswordResetRequest): Promise<void> {
  await apiClient.post("password-reset-requests", data);
}

export async function resetPassword(data: PasswordResetConfirmRequest): Promise<void> {
  await apiClient.post("password-resets", data);
}

export async function logout(token: string): Promise<void> {
  await apiClient.delete("sessions/current", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function getMe(): Promise<User> {
  const res = await apiClient.get<User>("users/me");
  return res.data;
}

import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { resetPassword } from "@/api/auth";
import { toast } from "sonner";
import { Eye, EyeOff, TrendingUp } from "lucide-react";

function getErrorMessage(err: unknown, fallback: string) {
  return (err as { response?: { data?: { detail?: string } } }).response?.data?.detail || fallback;
}

function validatePassword(password: string) {
  if (password.length < 8) return "Password must be at least 8 characters";
  if (!/[A-Z]/.test(password)) return "Password must contain an uppercase letter";
  if (!/[a-z]/.test(password)) return "Password must contain a lowercase letter";
  if (!/[0-9]/.test(password)) return "Password must contain a digit";
  if (!/[!@#$%^&*(),.?":{}|<>_\-+=[\]~/`\\'\\;]/.test(password)) {
    return "Password must contain a special character";
  }
  return null;
}

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get("token") || "", [searchParams]);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      await resetPassword({ token, new_password: password });
      toast.success("Password updated. Please sign in.");
      navigate("/login");
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, "Unable to reset password"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted px-4">
      <div className="w-full max-w-md bg-card rounded-xl shadow-lg border border-border p-8">
        <div className="flex items-center justify-center gap-2 mb-6">
          <TrendingUp className="w-8 h-8 text-accent" />
          <h1 className="text-2xl font-bold text-primary">TW Stock</h1>
        </div>

        <h2 className="text-xl font-semibold text-center mb-6">Create a new password</h2>

        {!token ? (
          <div className="space-y-4 text-center">
            <p className="text-sm text-muted-foreground">
              This reset link is missing a token. Please request a new password reset link.
            </p>
            <Link to="/forgot-password" className="text-sm font-medium text-accent hover:underline">
              Request a new link
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-primary mb-1">New password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 pr-10 rounded-lg border border-border bg-muted focus:outline-none focus:ring-2 focus:ring-accent"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-primary mb-1">Confirm password</label>
              <input
                type={showPassword ? "text" : "password"}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-muted focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>

            {error && <p className="text-xs text-danger">{error}</p>}
            <p className="text-xs text-muted-foreground">
              Min 8 chars, upper, lower, digit, special char.
            </p>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 bg-accent text-accent-foreground rounded-lg font-medium hover:bg-blue-600 transition-colors disabled:opacity-50"
            >
              {isSubmitting ? "Updating..." : "Update password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

import { useState } from "react";
import { Link } from "react-router-dom";
import { requestPasswordReset } from "@/api/auth";
import { toast } from "sonner";
import { ArrowLeft, Mail, TrendingUp } from "lucide-react";

function getErrorMessage(err: unknown, fallback: string) {
  return (err as { response?: { data?: { detail?: string } } }).response?.data?.detail || fallback;
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await requestPasswordReset({ email });
      setIsSubmitted(true);
      toast.success("Password reset instructions sent");
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, "Unable to send reset instructions"));
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

        <h2 className="text-xl font-semibold text-center mb-2">Reset your password</h2>
        <p className="text-sm text-muted-foreground text-center mb-6">
          Enter your account email and we will send password reset instructions.
        </p>

        {isSubmitted ? (
          <div className="space-y-5">
            <div className="rounded-lg border border-border bg-muted/60 p-4 text-center">
              <Mail className="mx-auto mb-3 h-6 w-6 text-accent" />
              <p className="text-sm font-medium text-primary">Check your email</p>
              <p className="mt-1 text-sm text-muted-foreground">
                If an account exists for {email}, a reset link has been sent.
              </p>
            </div>
            <Link
              to="/login"
              className="flex items-center justify-center gap-2 text-sm font-medium text-accent hover:underline"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-primary mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-muted focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 bg-accent text-accent-foreground rounded-lg font-medium hover:bg-blue-600 transition-colors disabled:opacity-50"
            >
              {isSubmitting ? "Sending..." : "Send reset link"}
            </button>
            <Link
              to="/login"
              className="flex items-center justify-center gap-2 text-sm font-medium text-muted-foreground hover:text-primary"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to sign in
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}

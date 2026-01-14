import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { authApi } from '@/api/auth.api';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { Masthead } from '@/components/layout/Masthead';
import { Footer } from '@/components/layout/Footer';

type LoginStep = 'email' | 'otp';

const ALLOWED_DOMAINS = ['@open.gov.sg', '@tech.gov.sg'];
const OTP_EXPIRY_MINUTES = 15;

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const setAuth = useAuthStore((state) => state.setAuth);

  const [step, setStep] = useState<LoginStep>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [expiryTime, setExpiryTime] = useState<Date | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<string>('');

  const otpInputRef = useRef<HTMLInputElement>(null);

  const from = (location.state as { from?: Location })?.from?.pathname || '/';

  // Countdown timer for OTP expiry
  useEffect(() => {
    if (!expiryTime) return;

    const timer = setInterval(() => {
      const now = new Date();
      const diff = expiryTime.getTime() - now.getTime();

      if (diff <= 0) {
        setTimeRemaining('Expired');
        setError('OTP has expired. Please request a new one.');
        clearInterval(timer);
        return;
      }

      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setTimeRemaining(`${minutes}:${seconds.toString().padStart(2, '0')}`);
    }, 1000);

    return () => clearInterval(timer);
  }, [expiryTime]);

  // Validate email domain
  const validateEmailDomain = (email: string): boolean => {
    const normalizedEmail = email.toLowerCase().trim();
    return ALLOWED_DOMAINS.some(domain => normalizedEmail.endsWith(domain));
  };

  // Request OTP mutation
  const requestOtpMutation = useMutation({
    mutationFn: () => authApi.requestOtp(email),
    onSuccess: () => {
      setStep('otp');
      setError('');
      setSuccessMessage('OTP sent to your email address');
      setOtp('');

      // Set expiry time
      const expiry = new Date();
      expiry.setMinutes(expiry.getMinutes() + OTP_EXPIRY_MINUTES);
      setExpiryTime(expiry);

      // Focus OTP input
      setTimeout(() => otpInputRef.current?.focus(), 100);
    },
    onError: (err: Error) => {
      setError(err.message || 'Failed to send OTP');
    },
  });

  // Verify OTP mutation
  const verifyOtpMutation = useMutation({
    mutationFn: () => authApi.verifyOtp(email, otp),
    onSuccess: (data) => {
      setAuth(data.token, data.user);
      navigate(from, { replace: true });
    },
    onError: (err: Error) => {
      setError(err.message || 'Invalid OTP');
    },
  });

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    const normalizedEmail = email.toLowerCase().trim();

    // Validate email domain
    if (!validateEmailDomain(normalizedEmail)) {
      setError(`Email must end with ${ALLOWED_DOMAINS.join(' or ')}`);
      return;
    }

    requestOtpMutation.mutate();
  };

  const handleOtpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    // Validate OTP format
    if (!/^\d{6}$/.test(otp)) {
      setError('OTP must be exactly 6 digits');
      return;
    }

    verifyOtpMutation.mutate();
  };

  const handleResendOtp = () => {
    setError('');
    setSuccessMessage('');
    requestOtpMutation.mutate();
  };

  const handleBackToEmail = () => {
    setStep('email');
    setOtp('');
    setError('');
    setSuccessMessage('');
    setExpiryTime(null);
    setTimeRemaining('');
  };

  // Demo login mutation
  const demoLoginMutation = useMutation({
    mutationFn: (demoEmail: string) => authApi.demoLogin(demoEmail),
    onSuccess: (data) => {
      setAuth(data.token, data.user);
      navigate(from, { replace: true });
    },
    onError: (err: Error) => {
      setError(err.message || 'Demo login failed');
    },
  });

  const handleDemoLogin = (demoEmail: string) => {
    setError('');
    setSuccessMessage('');
    demoLoginMutation.mutate(demoEmail);
  };

  // Handle OTP input change (only allow digits)
  const handleOtpChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 6);
    setOtp(value);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Masthead />
      <div className="flex-1 flex items-center justify-center bg-gray-50 py-12 px-4">
        <Card className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-900">Contravention Tracker</h1>
            <p className="text-gray-500 mt-2">
              {step === 'email' ? 'Sign in to your account' : 'Enter verification code'}
            </p>
          </div>

          {step === 'email' ? (
            <form onSubmit={handleEmailSubmit} className="space-y-6">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                  {error}
                </div>
              )}

              <Input
                id="email"
                type="email"
                label="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@open.gov.sg"
                required
                autoFocus
              />

              <p className="text-xs text-gray-500">
                Only emails ending with {ALLOWED_DOMAINS.join(' or ')} are allowed.
              </p>

              <Button
                type="submit"
                className="w-full"
                isLoading={requestOtpMutation.isPending}
              >
                Send OTP
              </Button>
            </form>
          ) : (
            <form onSubmit={handleOtpSubmit} className="space-y-6">
              {successMessage && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-600">
                  {successMessage}
                </div>
              )}

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                  {error}
                </div>
              )}

              <div className="text-center text-sm text-gray-600 mb-4">
                <p>We sent a 6-digit code to</p>
                <p className="font-medium text-gray-900">{email}</p>
              </div>

              <div>
                <label htmlFor="otp" className="block text-sm font-medium text-gray-700 mb-1">
                  Verification Code
                </label>
                <input
                  ref={otpInputRef}
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={otp}
                  onChange={handleOtpChange}
                  placeholder="000000"
                  required
                  className="w-full text-center text-2xl tracking-[0.5em] font-mono px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  maxLength={6}
                />
              </div>

              {timeRemaining && timeRemaining !== 'Expired' && (
                <p className="text-xs text-center text-gray-500">
                  Code expires in {timeRemaining}
                </p>
              )}

              <Button
                type="submit"
                className="w-full"
                isLoading={verifyOtpMutation.isPending}
                disabled={otp.length !== 6 || timeRemaining === 'Expired'}
              >
                Verify OTP
              </Button>

              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  onClick={handleBackToEmail}
                  className="text-gray-600 hover:text-gray-900"
                >
                  Change email
                </button>
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={requestOtpMutation.isPending}
                  className="text-blue-600 hover:text-blue-700 disabled:opacity-50"
                >
                  {requestOtpMutation.isPending ? 'Sending...' : 'Resend OTP'}
                </button>
              </div>
            </form>
          )}

          <div className="mt-6 pt-6 border-t border-gray-100 text-center text-sm text-gray-500">
            <p>Secure login with Email OTP</p>
            <p className="mt-1">No password required</p>
          </div>

          {/* Demo Login Section */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <p className="text-center text-sm text-gray-500 mb-4">
              Demo Accounts (for testing)
            </p>
            <div className="space-y-2">
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={() => handleDemoLogin('demouser@open.gov.sg')}
                disabled={demoLoginMutation.isPending}
              >
                Login as Demo User
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={() => handleDemoLogin('demoapprover@open.gov.sg')}
                disabled={demoLoginMutation.isPending}
              >
                Login as Demo Approver
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={() => handleDemoLogin('demoadmin@open.gov.sg')}
                disabled={demoLoginMutation.isPending}
              >
                Login as Demo Admin
              </Button>
            </div>
            {demoLoginMutation.isPending && (
              <p className="text-center text-sm text-gray-500 mt-2">
                Logging in...
              </p>
            )}
          </div>
        </Card>
      </div>
      <Footer />
    </div>
  );
}

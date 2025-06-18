
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { GaugeCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { toast } from '@/components/ui/use-toast';

const Login: React.FC = () => {
  const { login, isLoading } = useAuth();
  const [email, setEmail] = useState('admin@festo.com');
  const [password, setPassword] = useState('password');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    try {
      await login(email, password);
      toast({
        title: 'Login Successful',
        description: 'Welcome to the FESTO Digital Twin dashboard.',
      });
    } catch (err) {
      setError('Invalid email or password. Please try again.');
      toast({
        variant: 'destructive',
        title: 'Login Failed',
        description: 'Invalid email or password. Please try again.',
      });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <div className="flex items-center">
            <GaugeCircle className="h-12 w-12 text-festo-blue mr-4" />
            <div>
              <h1 className="font-bold text-3xl">FESTO</h1>
              <p className="text-sm text-muted-foreground">Digital Twin Platform</p>
            </div>
          </div>
        </div>
        
        <Card className="border shadow-lg">
          <CardHeader>
            <CardTitle>Login to Dashboard</CardTitle>
            <CardDescription>
              Enter your credentials to access the conveyor monitoring system
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your.email@festo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <a href="#" className="text-sm text-primary hover:underline">
                    Forgot password?
                  </a>
                </div>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              
              {error && (
                <div className="text-sm text-red-500 font-medium">
                  {error}
                </div>
              )}
              
              <div className="text-sm text-muted-foreground">
                <p>Demo accounts:</p>
                <ul className="list-disc list-inside">
                  <li>admin@festo.com / password</li>
                  <li>operator@festo.com / password</li>
                  <li>viewer@festo.com / password</li>
                </ul>
              </div>
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <span className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Logging in...</span>
                  </span>
                ) : (
                  'Login'
                )}
              </Button>
            </CardFooter>
          </form>
        </Card>
        
        <p className="text-center mt-4 text-sm text-muted-foreground">
          FESTO Digital Twin Platform &copy; 2025
        </p>
      </div>
    </div>
  );
};

export default Login;

import React, { useState } from 'react';
import { signInWithPopup, signInAnonymously } from 'firebase/auth';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db, googleProvider } from '../firebase';
import { Scissors, User as UserIcon, Lock, Globe, Shield } from 'lucide-react';

interface LoginProps {
  onLoginSuccess: (session: {
    uid: string;
    name: string;
    email: string;
    role: 'admin' | 'barber' | 'client';
    clientId?: string;
  }) => void;
  onLoginStart?: () => void;
}

export default function Login({ onLoginSuccess, onLoginStart }: LoginProps) {
  const [activeTab, setActiveTab] = useState<'professional' | 'client'>('professional');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    if (onLoginStart) onLoginStart();

    try {
      const result = await signInWithPopup(auth, googleProvider);
      const email = result.user.email || '';
      // If administrative email as assigned in runtime metadata
      const isSystemAdmin = email.toLowerCase() === 'jamersonferramentas@gmail.com';
      
      onLoginSuccess({
        uid: result.user.uid,
        name: result.user.displayName || 'Administrador',
        email: email,
        role: isSystemAdmin ? 'admin' : 'barber',
      });
    } catch (err: any) {
      console.error('Google Auth error:', err);
      if (err.code === 'auth/popup-closed-by-user') {
        setError('O login com Google foi cancelado.');
      } else {
        setError('Erro ao autenticar com o Google. Verifique sua conexão.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCredentialsLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Por favor, preencha todos os campos.');
      return;
    }

    setLoading(true);
    setError(null);
    if (onLoginStart) onLoginStart();

    try {
      const normalizedUsername = username.trim().toLowerCase();

      if (activeTab === 'professional') {
        // 1. Check Super Admin hardcoded fallback credentials
        if (normalizedUsername === 'admin' && password.trim() === 'admin123') {
          // Log in as superadmin via an anonymous Firebase Auth session to secure db calls if allowed
          try {
            await signInAnonymously(auth);
          } catch (authErr) {
            console.warn('Anonymous auth failed, continuing without active auth session:', authErr);
          }
          onLoginSuccess({
            uid: 'admin_master',
            name: 'Administrador Master',
            email: 'jamersonferramentas@gmail.com',
            role: 'admin',
          });
          setLoading(false);
          return;
        }

        // 2. Query 'barbers' collection
        const qBarber = query(
          collection(db, 'barbers'),
          where('username', '==', normalizedUsername),
          where('password', '==', password.trim())
        );
        const snapshot = await getDocs(qBarber);

        if (!snapshot.empty) {
          const barberDoc = snapshot.docs[0];
          const barberData = barberDoc.data();
          try {
            await signInAnonymously(auth);
          } catch (authErr) {
            console.warn('Anonymous auth failed, continuing without active auth session:', authErr);
          }
          onLoginSuccess({
            uid: barberDoc.id,
            name: barberData.name || 'Barbeiro',
            email: barberData.email || `${username}@barber.com`,
            role: 'barber',
          });
        } else {
          setError('Usuário ou senha de barbeiro incorretos.');
        }
      } else {
        // 3. Query 'clients' collection for Client credentials login
        const qClient = query(
          collection(db, 'clients'),
          where('username', '==', normalizedUsername),
          where('password', '==', password.trim())
        );
        const snapshot = await getDocs(qClient);

        if (!snapshot.empty) {
          const clientDoc = snapshot.docs[0];
          const clientData = clientDoc.data();
          try {
            await signInAnonymously(auth);
          } catch (authErr) {
            console.warn('Anonymous auth failed, continuing without active auth session:', authErr);
          }
          onLoginSuccess({
            uid: clientDoc.id,
            name: clientData.name || 'Cliente',
            email: clientData.email || `${username}@client.com`,
            role: 'client',
            clientId: clientDoc.id,
          });
        } else {
          setError('Usuário ou senha de cliente incorretos.');
        }
      }
    } catch (err: any) {
      console.error('Credentials login error:', err);
      setError('Erro ao autenticar. Tente novamente mais tarde.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-dark-900 flex flex-col items-center justify-center p-4 md:p-6 select-none animate-fade-in font-sans">
      <div className="w-full max-w-sm bg-bg-dark-800 border border-border-dark rounded-2xl p-6.5 md:p-8 shadow-2xl text-center relative overflow-hidden">
        {/* Decorative Top Glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-1 bg-brand-amber blur-xl opacity-60"></div>
        
        {/* Brand Header */}
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 rounded-full bg-brand-amber-bg border border-brand-amber-border flex items-center justify-center mb-3 transition-transform hover:rotate-12 duration-300 shadow">
            <Scissors className="w-7 h-7 text-brand-amber" />
          </div>
          <h1 className="font-display font-bold text-2.5xl tracking-tight text-text-primary">
            ✂ <span className="text-brand-amber font-extrabold">Barber</span>Pass
          </h1>
          <p className="text-text-muted text-[10px] uppercase tracking-widest mt-1 font-semibold">
            Portfólio & Gestão de Assinantes
          </p>
        </div>

        {/* Credentials Tabs Switch */}
        <div className="grid grid-cols-2 p-1 bg-bg-dark-900 rounded-xl border border-border-dark mb-6 text-xs font-bold">
          <button
            type="button"
            onClick={() => {
              setActiveTab('professional');
              setError(null);
            }}
            className={`py-2 rounded-lg transition-all cursor-pointer ${
              activeTab === 'professional'
                ? 'bg-brand-amber text-[#1a0e00] shadow'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            💻 Barbeiro / Admin
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('client');
              setError(null);
            }}
            className={`py-2 rounded-lg transition-all cursor-pointer ${
              activeTab === 'client'
                ? 'bg-brand-amber text-[#1a0e00] shadow'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            👑 Portal do Cliente
          </button>
        </div>

        {/* Interactive Headline */}
        <div className="mb-6">
          <h2 className="text-lg font-bold text-text-primary">
            {activeTab === 'professional' ? 'Acesso Administrativo' : 'Acompanhe seu Plano'}
          </h2>
          <p className="text-text-muted text-xs leading-relaxed mt-1">
            {activeTab === 'professional'
              ? 'Área de trabalho do profissional para controle de cortes, planos e agendamentos.'
              : 'Verifique quais serviços contratados já utilizou e quais ainda restam na sua assinatura.'}
          </p>
        </div>

        {/* Input credentials Form */}
        <form onSubmit={handleCredentialsLogin} className="space-y-4 text-left">
          <div className="space-y-1.5">
            <label className="text-[10px] md:text-xs uppercase font-bold text-text-muted tracking-wide flex items-center gap-1.5 select-none">
              <UserIcon className="w-3.5 h-3.5" /> Nome de Usuário
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Ex: andrecosta"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
                className="w-full bg-bg-dark-900 border border-border-dark text-text-primary rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-brand-amber transition-colors disabled:opacity-50"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] md:text-xs uppercase font-bold text-text-muted tracking-wide flex items-center gap-1.5 select-none">
              <Lock className="w-3.5 h-3.5" /> Senha de Acesso
            </label>
            <div className="relative">
              <input
                type="password"
                placeholder="••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                className="w-full bg-bg-dark-900 border border-border-dark text-text-primary rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-brand-amber transition-colors disabled:opacity-50"
              />
            </div>
          </div>

          {error && (
            <div className="p-3 bg-brand-danger-bg border border-brand-danger-border text-brand-danger-text text-xs rounded-xl font-medium leading-normal animate-fade-in">
              ⚠️ {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#1e1a15] hover:bg-[#25201a] border border-[#f59e0b]/20 text-brand-amber font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow min-h-[44px] disabled:opacity-50"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-brand-amber border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <span>Entrar na Conta</span>
            )}
          </button>
        </form>

        {/* Admin Google Sign-In Option */}
        {activeTab === 'professional' && (
          <div className="mt-5 pt-5 border-t border-border-dark/60 space-y-3">
            <div className="text-[10px] uppercase font-bold text-text-muted tracking-widest text-center">
              Ou como Administrador Master
            </div>
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full btn bg-brand-amber hover:bg-brand-amber-hover text-[#1a0e00] font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2.5 transition-all cursor-pointer shadow-sm text-xs disabled:opacity-50"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="currentColor"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="currentColor"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22cee" fill="currentColor"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="currentColor"/>
              </svg>
              <span>Entrar com o Google Admin</span>
            </button>
          </div>
        )}

        {/* Demo Accounts Quick Guide */}
        <div className="mt-6 pt-5 border-t border-border-dark/60 text-[10px] text-text-muted flex justify-center items-center gap-1">
          <Shield className="w-3.5 h-3.5 text-brand-amber/60 shrink-0" />
          <span>Contas Demo: Barber (<b>admin / admin123</b>)</span>
        </div>
      </div>
    </div>
  );
}

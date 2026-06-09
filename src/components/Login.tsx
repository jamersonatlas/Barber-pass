import React, { useState } from 'react';
import { signInWithPopup, signInAnonymously, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { collection, query, where, getDocs, doc, updateDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { auth, db, googleProvider } from '../firebase';
import { 
  Scissors, 
  User as UserIcon, 
  Lock, 
  Calendar, 
  Star, 
  Eye, 
  EyeOff, 
  Sparkles, 
  X, 
  Info, 
  Shield, 
  ArrowLeft,
  Crown,
  Laptop,
  CheckCircle2
} from 'lucide-react';

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

type AccessRole = null | 'barber' | 'client' | 'admin';

export default function Login({ onLoginSuccess, onLoginStart }: LoginProps) {
  const [loginRole, setLoginRole] = useState<AccessRole>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showRegInfoModal, setShowRegInfoModal] = useState(false);

  // Quick reset when switching views
  const handleSelectRole = (role: AccessRole) => {
    setLoginRole(role);
    setUsername('');
    setPassword('');
    setError(null);
    setShowPassword(false);
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    if (onLoginStart) onLoginStart();

    try {
      const result = await signInWithPopup(auth, googleProvider);
      const email = result.user.email || '';
      // Administrative email assign
      const isSystemAdmin = email.trim().toLowerCase() === 'jamersonferramentas@gmail.com';
      
      onLoginSuccess({
        uid: isSystemAdmin ? 'admin_master' : result.user.uid,
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

      // 1. Support Admin Login via standard email & password
      if (loginRole === 'admin' || normalizedUsername === 'jamersonferramentas@gmail.com') {
        const adminEmail = 'jamersonferramentas@gmail.com';
        const targetEmail = normalizedUsername.includes('@') ? normalizedUsername : adminEmail;
        const targetPassword = password.trim();

        try {
          await signInWithEmailAndPassword(auth, targetEmail, targetPassword);
        } catch (authErr: any) {
          console.log('Admin login error, checking if first-time setup is needed:', authErr?.code);
          if (authErr?.code === 'auth/user-not-found' || authErr?.code === 'auth/invalid-credential' || authErr?.code === 'auth/wrong-password') {
            try {
              // Sign up on first use with the password they provided
              await createUserWithEmailAndPassword(auth, targetEmail, targetPassword);
            } catch (createErr) {
              setError('Senha administrativa incorreta.');
              setLoading(false);
              return;
            }
          } else {
            setError('Senha administrativa incorreta.');
            setLoading(false);
            return;
          }
        }

        onLoginSuccess({
          uid: 'admin_master',
          name: 'Administrador Master',
          email: targetEmail,
          role: 'admin',
        });
        setLoading(false);
        return;
      }

      // Ensure we are signed in anonymously first so that we are authenticated when querying collections
      let currentAuthUid = '';
      try {
        if (!auth.currentUser) {
          const authResult = await signInAnonymously(auth);
          currentAuthUid = authResult.user.uid;
        } else {
          currentAuthUid = auth.currentUser.uid;
        }
      } catch (authErr) {
        console.warn('Pre-login anonymous auth failed:', authErr);
      }

      // 2. Query 'barbers' collection (Barber match)
      if (loginRole === 'barber') {
        const qBarber = query(
          collection(db, 'barbers'),
          where('username', '==', normalizedUsername),
          where('password', '==', password.trim())
        );
        const barberSnapshot = await getDocs(qBarber);

        if (!barberSnapshot.empty) {
          const barberDoc = barberSnapshot.docs[0];
          const barberData = barberDoc.data();

          // Securely sync active anonymous UID to barber record
          if (currentAuthUid && barberData.firebaseUid !== currentAuthUid) {
            try {
              const bDocRef = doc(db, 'barbers', barberDoc.id);
              await updateDoc(bDocRef, { firebaseUid: currentAuthUid });
            } catch (updateErr) {
              console.error('Failed to update barber firebaseUid:', updateErr);
            }
          }

          onLoginSuccess({
            uid: barberDoc.id,
            name: barberData.name || 'Barbeiro',
            email: barberData.email || `${username}@barber.com`,
            role: 'barber',
          });
          setLoading(false);
          return;
        } else {
          setError('Usuário ou senha de barbeiro inválidos.');
          setLoading(false);
          return;
        }
      }

      // 3. Query 'clients' collection (Client match)
      if (loginRole === 'client') {
        const qClient = query(
          collection(db, 'clients'),
          where('username', '==', normalizedUsername),
          where('password', '==', password.trim())
        );
        const clientSnapshot = await getDocs(qClient);

        if (!clientSnapshot.empty) {
          const clientDoc = clientSnapshot.docs[0];
          const clientData = clientDoc.data();

          // Securely sync active anonymous UID to client record
          if (currentAuthUid && clientData.firebaseUid !== currentAuthUid) {
            try {
              const cDocRef = doc(db, 'clients', clientDoc.id);
              await updateDoc(cDocRef, { firebaseUid: currentAuthUid });
            } catch (updateErr) {
              console.error('Failed to update client firebaseUid:', updateErr);
            }
          }

          onLoginSuccess({
            uid: clientDoc.id,
            name: clientData.name || 'Cliente',
            email: clientData.email || `${username}@client.com`,
            role: 'client',
            clientId: clientDoc.id,
          });
        } else {
          setError('Usuário ou senha de cliente inválidos.');
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
    <div className="min-h-screen relative flex flex-col items-center justify-between pb-10 pt-8 px-4 font-sans select-none overflow-y-auto w-full">
      {/* Immersive Dark Barber Shop Background Image - Warm Lit Vintage Chair (looks identical to reference) */}
      <div 
        className="absolute inset-0 bg-cover bg-center z-0 transition-opacity duration-1000" 
        style={{ 
          backgroundImage: `url('https://images.unsplash.com/photo-1585747860715-2ba37e788b70?q=80&w=1200&auto=format&fit=crop')` 
        }}
      >
        {/* Semi-transparent dark overlay to protect text contrast while maintaining background clarity */}
        <div className="absolute inset-0 bg-black/75 md:bg-black/65"></div>
      </div>

      {/* 1. Header with Fictional Premium Logo Badge */}
      <div className="relative z-10 w-full max-w-sm flex flex-col items-center mt-3 text-center">
        
        {/* Beautiful Fictional Crest Badge with Overlapping Scissors & Crown */}
        <div className="relative mb-2 select-none flex flex-col items-center group">
          <div className="absolute inset-0 rounded-full bg-[#c5a880]/15 blur-xl scale-93 group-hover:scale-105 transition-transform duration-500"></div>
          <svg className="w-20 h-20 text-[#c5a880] filter drop-shadow-[0_4px_10px_rgba(197,168,128,0.4)] relative z-10 transition-transform duration-300 hover:rotate-2" viewBox="0 0 100 100" fill="none" stroke="currentColor">
            {/* Elegant outer golden circle ornament */}
            <circle cx="50" cy="50" r="44" stroke="currentColor" strokeWidth="1" strokeDasharray="4 3" />
            <circle cx="50" cy="50" r="40" stroke="currentColor" strokeWidth="1.2" />
            
            {/* Crown silhouette shape inside */}
            <path d="M36 39 L42 47 L50 35 L58 47 L64 39 L60 54 L40 54 Z" fill="currentColor" fillOpacity="0.75" />
            
            {/* Vintage shear handles bottom design */}
            <path d="M43 65 C41 63 41 59 44 57 L50 51 L56 57 C59 59 59 63 57 65 C55 67 51 67 50 64 C49 67 45 67 43 65 Z" fill="currentColor" />
            
            {/* Crossing scissor blades */}
            <line x1="37" y1="37" x2="63" y2="63" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="63" y1="37" x2="37" y2="63" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            
            {/* Small elegance stars */}
            <circle cx="28" cy="50" r="1.5" fill="currentColor" />
            <circle cx="72" cy="50" r="1.5" fill="currentColor" />
          </svg>
        </div>

        {/* Dynamic Fictional Branding */}
        <h1 className="font-display font-black text-3.2xl tracking-[0.16em] text-[#f5ebd8] uppercase leading-none drop-shadow-md select-none mt-1">
          ROYAL CUTS
        </h1>
        <p className="text-[#c5a880] font-bold text-[9px] tracking-[0.28em] uppercase mt-1 drop-shadow-sm select-none">
          HAIR & BEARD CLUB
        </p>

        {/* Symmetric Divider with Scissors symbol */}
        <div className="flex items-center justify-center gap-4 my-2.5 w-40 opacity-70 select-none">
          <div className="h-[1px] bg-gradient-to-r from-transparent to-[#c5a880]/40 flex-1"></div>
          <Scissors className="w-3 h-3 text-[#c5a880] shrink-0" />
          <div className="h-[1px] bg-gradient-to-l from-transparent to-[#c5a880]/40 flex-1"></div>
        </div>
      </div>

      {/* 2. Glassmorphism Screen Container Box */}
      <div className="relative z-10 w-full max-w-sm flex flex-col items-center">
        
        {/* Semi-transparent Glass effect Box with slightly blurred outline */}
        <div className="w-full bg-black/45 backdrop-blur-[12px] border border-white/10 rounded-2xl p-6.5 md:p-8 shadow-[0_12px_40px_rgba(0,0,0,0.6)] relative overflow-hidden transition-all duration-300">
          
          {/* Subtle Accent Glow Line across the top of the box */}
          <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-gradient-to-r from-transparent via-[#c5a880]/60 to-transparent opacity-80"></div>

          {/* SCREEN STATE A: GENERAL LANDING PRE-SELECT */}
          {loginRole === null && (
            <div className="space-y-6 animate-fade-in">
              <div className="text-center select-none">
                <h2 className="text-2xl font-extrabold text-[#f5ebd8] tracking-tight leading-none">
                  Olá, Seja Bem-Vindo!
                </h2>
                <p className="text-zinc-400 text-xs mt-2 tracking-wide font-medium">
                  Selecione o seu tipo de acesso para entrar
                </p>
              </div>

              {/* Dynamic Glassmorphic Access Mode Selector Buttons */}
              <div className="space-y-3 pt-2">
                
                {/* BUTTON 2: SOURCE CLIENT */}
                <button
                  type="button"
                  onClick={() => handleSelectRole('client')}
                  className="w-full bg-gradient-to-r from-white/5 to-white/10 hover:from-[#c5a880]/15 hover:to-[#c5a880]/5 hover:border-[#c5a880]/50 border border-white/5 rounded-xl p-4 flex items-center justify-between text-left transition-all duration-300 group cursor-pointer shadow-md"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-full bg-[#c5a880]/10 border border-[#c5a880]/20 flex items-center justify-center text-[#c5a880] group-hover:bg-[#c5a880]/25 transition-all">
                      <Crown className="w-5 h-5 shrink-0" />
                    </div>
                    <div>
                      <h3 className="font-extrabold text-sm text-[#f5ebd8] tracking-wide">
                        Sou Cliente
                      </h3>
                      <p className="text-[10px] text-zinc-400 mt-0.5 font-medium leading-tight">
                        Acompanhe planos, cortes e histórico
                      </p>
                    </div>
                  </div>
                  <span className="text-[#c5a880] font-bold text-lg group-hover:translate-x-1 transition-transform">→</span>
                </button>

                {/* BUTTON 1: SOURCE BARBER */}
                <button
                  type="button"
                  onClick={() => handleSelectRole('barber')}
                  className="w-full bg-gradient-to-r from-white/5 to-white/10 hover:from-[#c5a880]/15 hover:to-[#c5a880]/5 hover:border-[#c5a880]/50 border border-white/5 rounded-xl p-4 flex items-center justify-between text-left transition-all duration-300 group cursor-pointer shadow-md"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-full bg-[#c5a880]/10 border border-[#c5a880]/20 flex items-center justify-center text-[#c5a880] group-hover:bg-[#c5a880]/25 transition-all">
                      <Laptop className="w-5 h-5 shrink-0" />
                    </div>
                    <div>
                      <h3 className="font-extrabold text-sm text-[#f5ebd8] tracking-wide">
                        Sou Barbeiro
                      </h3>
                      <p className="text-[10px] text-zinc-400 mt-0.5 font-medium leading-tight">
                        Gerencie atendimentos e sua agenda
                      </p>
                    </div>
                  </div>
                  <span className="text-[#c5a880] font-bold text-lg group-hover:translate-x-1 transition-transform">→</span>
                </button>

              </div>

              {/* Informative Help Guide line */}
              <div className="text-center select-none pt-2">
                <button
                  type="button"
                  onClick={() => setShowRegInfoModal(true)}
                  className="text-[11px] text-zinc-400 hover:text-[#c5a880] transition-colors"
                >
                  Deseja assinar ou criar conta? <span className="text-[#c5a880] font-bold hover:underline">Saber mais</span>
                </button>
              </div>
            </div>
          )}

          {/* SCREEN STATE B: LOGIN FOR ACTIVE SELECTIONS */}
          {loginRole !== null && (
            <div className="animate-fade-in space-y-4">
              
              {/* Flexible top bar inside form view to return with clear status */}
              <div className="flex items-center justify-between pb-2 border-b border-white/5">
                <button
                  type="button"
                  onClick={() => handleSelectRole(null)}
                  className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-[#c5a880] transition-all cursor-pointer font-bold py-1"
                >
                  <ArrowLeft className="w-4 h-4 shrink-0" />
                  <span>Voltar</span>
                </button>

                <div className="flex items-center gap-1 bg-[#c5a880]/10 border border-[#c5a880]/25 px-2.5 py-0.5 rounded-full select-none text-[9px] uppercase tracking-wider font-black text-[#c5a880]">
                  {loginRole === 'client' ? (
                    <>
                      <Crown className="w-3 h-3 shrink-0" />
                      <span>Acesso Cliente</span>
                    </>
                  ) : loginRole === 'barber' ? (
                    <>
                      <Laptop className="w-3 h-3 shrink-0" />
                      <span>Acesso Barbeiro</span>
                    </>
                  ) : (
                    <>
                      <Shield className="w-3 h-3 shrink-0" />
                      <span>Painel Admin</span>
                    </>
                  )}
                </div>
              </div>

              {/* Headline */}
              <div className="text-center select-none pb-1">
                <h2 className="text-xl font-bold text-[#f5ebd8] leading-tight">
                  {loginRole === 'client' 
                    ? 'Acesso do Assinante' 
                    : loginRole === 'barber' 
                      ? 'Área do Barbeiro' 
                      : 'Administração'}
                </h2>
                <p className="text-zinc-400 text-xs mt-1.5">
                  {loginRole === 'client' 
                    ? 'Informe seu usuário de assinatura' 
                    : loginRole === 'barber' 
                      ? 'Entre com suas credenciais de equipe' 
                      : 'Por favor, identifique-se'}
                </p>
              </div>

              {/* Dynamic Credential inputs based on chosen section */}
              {loginRole === 'admin' ? (
                // Google Sign In & Email Access dedicated specifically for system admin
                <div className="space-y-4 pt-2">
                  <p className="text-xs text-zinc-400 text-center leading-relaxed">
                    Olá, Jamerson! O acesso mestre de administração é feito de forma segura e direta.
                  </p>

                   <button
                    type="button"
                    onClick={handleGoogleLogin}
                    disabled={loading}
                    className="w-full bg-[#111111]/70 hover:bg-[#151515]/90 border border-zinc-800 hover:border-[#c5a880]/60 text-[#f5ebd8] font-bold py-3.5 px-4 rounded-xl flex items-center justify-center gap-3 transition-all duration-200 cursor-pointer shadow-md text-xs active:scale-[0.99] disabled:opacity-50"
                  >
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
                    </svg>
                    <span>Entrar com Google</span>
                  </button>

                  <div className="my-4 w-full flex items-center justify-between text-[9px] text-zinc-600 uppercase tracking-widest font-black select-none">
                    <div className="h-[0.5px] bg-zinc-850 flex-1"></div>
                    <span className="px-3">OU ACESSO COM SENHA</span>
                    <div className="h-[0.5px] bg-zinc-850 flex-1"></div>
                  </div>

                  <form onSubmit={handleCredentialsLogin} className="space-y-3.5">
                    <div className="relative">
                      <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                      <input
                        type="text"
                        placeholder="E-mail ou Usuário do Administrador"
                        value={username}
                        onChange={(e) => {
                          setUsername(e.target.value);
                          if (error) setError(null);
                        }}
                        style={{ paddingLeft: '48px' }}
                        className="w-full bg-[#11111188]/60 focus:bg-[#080808]/90 border border-zinc-800/80 focus:border-[#c5a880]/70 text-[#f5ebd8] rounded-xl pr-4 py-3.5 text-sm focus:outline-none placeholder-zinc-500/85 transition-all"
                      />
                    </div>
                    
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                      <input
                        type="password"
                        placeholder="Senha de Acesso"
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          if (error) setError(null);
                        }}
                        style={{ paddingLeft: '48px' }}
                        className="w-full bg-[#11111188]/60 focus:bg-[#080808]/90 border border-zinc-800/80 focus:border-[#c5a880]/70 text-[#f5ebd8] rounded-xl pr-4 py-3.5 text-sm focus:outline-none placeholder-zinc-500/85 transition-all"
                      />
                    </div>

                    {error && (
                      <div className="p-3 bg-brand-danger-bg/40 border border-brand-danger-border/30 text-brand-danger-text text-xs rounded-xl font-medium leading-normal animate-fade-in">
                        <span>⚠️ {error}</span>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full bg-[#c5a880] hover:bg-[#b0946d] text-[#121212] font-black text-sm uppercase tracking-widest py-3.5 px-5 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg active:scale-98"
                    >
                      {loading ? (
                        <div className="w-4 h-4 border-2 border-[#121212] border-t-transparent rounded-full animate-spin"></div>
                      ) : (
                        <span>Acessar Painel</span>
                      )}
                    </button>
                  </form>
                </div>
              ) : (
                // Traditional Barber / Client inputs
                <form onSubmit={handleCredentialsLogin} className="space-y-4">
                  
                  {/* Username */}
                  <div className="relative">
                    <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                    <input
                      type="text"
                      placeholder="E-mail ou Usuário"
                      value={username}
                      onChange={(e) => {
                        setUsername(e.target.value);
                        if (error) setError(null);
                      }}
                      disabled={loading}
                      autoCapitalize="off"
                      style={{ paddingLeft: '48px' }}
                      className="w-full bg-[#11111188]/60 hover:bg-[#111111b8]/65 focus:bg-[#080808]/90 border border-zinc-800/80 focus:border-[#c5a880]/70 text-[#f5ebd8] rounded-xl pr-4 py-3.5 text-sm focus:outline-none transition-all duration-200 disabled:opacity-50 placeholder-zinc-500 focus:ring-1 focus:ring-[#c5a880]/20"
                    />
                  </div>

                  {/* Password with Eye switcher overlay */}
                  <div className="space-y-2.5">
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Senha"
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          if (error) setError(null);
                        }}
                        disabled={loading}
                        style={{ paddingLeft: '48px' }}
                        className="w-full bg-[#11111188]/60 hover:bg-[#111111b8]/65 focus:bg-[#080808]/90 border border-zinc-800/80 focus:border-[#c5a880]/70 text-[#f5ebd8] rounded-xl pr-11 py-3.5 text-sm focus:outline-none transition-all duration-200 disabled:opacity-50 placeholder-zinc-500 focus:ring-1 focus:ring-[#c5a880]/20"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-[#c5a880] transition-colors cursor-pointer p-1"
                        title={showPassword ? "Ocultar senha" : "Mostrar senha"}
                      >
                        {showPassword ? (
                          <EyeOff className="w-4 h-4 shrink-0" />
                        ) : (
                          <Eye className="w-4 h-4 shrink-0" />
                        )}
                      </button>
                    </div>

                    {/* Left & Right custom align footer under inputs */}
                    <div className="flex justify-between items-center pr-0.5 select-none">
                      <button
                        type="button"
                        onClick={() => setShowRegInfoModal(true)}
                        className="text-[11px] text-zinc-400 hover:text-[#c5a880] hover:underline"
                      >
                        Não possui acesso?
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowRegInfoModal(true)}
                        className="text-[11px] font-bold text-[#c5a880] hover:underline cursor-pointer opacity-95 hover:opacity-100"
                      >
                        Esqueceu sua senha?
                      </button>
                    </div>
                  </div>

                  {/* Error Box */}
                  {error && (
                    <div className="p-3 bg-brand-danger-bg/45 border border-brand-danger-border/30 text-brand-danger-text text-xs rounded-xl font-medium leading-normal animate-fade-in flex items-start gap-2">
                      <span className="shrink-0 text-sm">⚠️</span>
                      <span className="flex-1 text-[11px]">{error}</span>
                    </div>
                  )}

                  {/* Confirm Submission */}
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-[#c5a880] hover:bg-[#b0946d] text-[#121212] font-black text-xs uppercase tracking-widest py-3.5 px-5 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg hover:shadow-[#c5a880]/15 duration-200 active:scale-98 min-h-[46px] disabled:opacity-50"
                  >
                    {loading ? (
                      <div className="w-4 h-4 border-2 border-[#121212] border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <span>Entrar</span>
                    )}
                  </button>
                </form>
              )}

            </div>
          )}

        </div>
      </div>

      {/* 3. Bottom Row: Feature summaries & Admin button */}
      <div className="relative z-10 w-full max-w-sm flex flex-col items-center">
        
        {/* If user is in landing selection, show beautiful feature indicators */}
        {loginRole === null && (
          <div className="grid grid-cols-3 gap-2 text-center w-full select-none opacity-80 mt-4">
            <div className="flex flex-col items-center gap-1 p-1 rounded-xl">
              <Calendar className="w-4 h-4 text-[#c5a880]" />
              <span className="text-[10px] font-medium text-zinc-300 leading-tight">Agende seu horário</span>
            </div>
            <div className="flex flex-col items-center gap-1 p-1 rounded-xl">
              <Scissors className="w-4 h-4 text-[#c5a880]" />
              <span className="text-[10px] font-medium text-zinc-300 leading-tight">Escolha seu estilo</span>
            </div>
            <div className="flex flex-col items-center gap-1 p-1 rounded-xl">
              <Star className="w-4 h-4 text-[#c5a880]" />
              <span className="text-[10px] font-medium text-zinc-300 leading-tight">Sinta-se incrível</span>
            </div>
          </div>
        )}

        {/* ADMIN/JAMERSON ACCESS ENVELOPE (requested to be exactly at the bottom) */}
        <div className="mt-6 flex flex-col items-center select-none">
          {loginRole !== 'admin' ? (
            <button
              type="button"
              onClick={() => handleSelectRole('admin')}
              className="py-1 px-3 bg-white/5 hover:bg-[#c5a880]/10 border border-white/5 hover:border-[#c5a880]/40 text-xs text-zinc-400 hover:text-[#c5a880] rounded-lg flex items-center gap-1.5 transition-all cursor-pointer font-bold uppercase tracking-wider text-[10px]"
            >
              <Shield className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
              <span>Acesso Administrador</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleSelectRole(null)}
              className="text-xs text-zinc-400 hover:text-[#c5a880] transition-colors flex items-center gap-1 hover:underline font-bold"
            >
              <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
              <span>Voltar ao início</span>
            </button>
          ) }

        </div>

        {/* Small Immersive Smartphone visual indicator */}
        <div className="w-28 h-[4px] bg-white/10 rounded-full mt-5 select-none"></div>
      </div>

      {/* 4. Interactive Registration Drawer / Informative Modal */}
      {showRegInfoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm animate-fade-in text-left">
          <div className="w-full max-w-md bg-bg-dark-800 border border-[#c5a880]/50 rounded-2xl p-6 md:p-8 shadow-2xl relative">
            <button
              type="button"
              onClick={() => setShowRegInfoModal(false)}
              className="absolute top-4 right-4 text-zinc-500 hover:text-[#c5a880] cursor-pointer p-1.5 hover:bg-bg-dark-700/50 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 shrink-0" />
            </button>

            <div className="flex items-center gap-3.5 mb-5 select-none">
              <div className="w-10 h-10 rounded-full bg-[#c5a880]/15 border border-[#c5a880]/30 flex items-center justify-center text-[#c5a880]">
                <Sparkles className="w-5 h-5 shrink-0" />
              </div>
              <div>
                <h3 className="font-display font-extrabold text-[#f5ebd8] leading-tight text-lg">
                  Ativação de Conta & Planos
                </h3>
                <p className="text-[10px] text-[#c5a880] uppercase tracking-widest font-black mt-0.5">
                  ✂️ Passe de Barbeiro
                </p>
              </div>
            </div>

            <div className="space-y-4 text-sm text-[#d4d4d8] leading-relaxed">
              <div className="p-3.5 bg-brand-danger-bg/25 border border-brand-danger-border/30 text-amber-100 rounded-xl flex items-start gap-3 text-xs leading-relaxed">
                <Info className="w-5 h-5 shrink-0 text-[#c5a880] mt-0.5" />
                <p>
                  <strong className="text-white block mb-1">⚠️ IMPORTANTE: O cliente não pode se cadastrar sozinho</strong>
                  Para garantir a segurança do clube de assinaturas, apenas o seu barbeiro de confiança pode criar sua conta no sistema e fornecer o seu nome de usuário e senha exclusivos.
                </p>
              </div>

              <div className="p-4 bg-[#0a0a0a]/90 rounded-xl border border-zinc-900 space-y-3">
                <h4 className="font-bold text-xs text-white uppercase tracking-wider flex items-center gap-1.5">
                  <span className="text-[#c5a880]">📋</span> Como funciona o seu acesso:
                </h4>
                <ol className="list-decimal list-inside text-xs space-y-2 text-[#a1a1aa] pl-1">
                  <li>No seu próximo atendimento, solicite seu cadastro ao barbeiro.</li>
                  <li>O barbeiro ativará seu plano e criará seu <span className="text-[#c5a880] font-semibold">nome de usuário</span> e <span className="text-[#c5a880] font-semibold">senha</span> personalizados.</li>
                  <li>Insira as credenciais recebidas na tela anterior para entrar no seu portal, acompanhar os créditos de cortes deste mês e ver os prazos de renovação.</li>
                </ol>
              </div>

              <div className="p-3 bg-[#c5a880]/10 border border-[#c5a880]/10 text-[#c5a880] rounded-xl text-center text-xs font-medium">
                Precisou de uma nova senha? Solicite no balcão da barbearia.
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setShowRegInfoModal(false)}
                className="bg-[#c5a880] hover:bg-[#b0946d] text-[#121212] font-extrabold py-2.5 px-6 rounded-xl hover:shadow-lg transition-all cursor-pointer text-xs uppercase tracking-wider"
              >
                Entendi, obrigado!
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import ImageUpload from './ImageUpload';
import { 
  Sparkles, 
  Image as ImageIcon, 
  Instagram, 
  MapPin, 
  Phone, 
  Save, 
  ExternalLink,
  Crown,
  Heart,
  Palette,
  Eye
} from 'lucide-react';

interface AppearanceProps {
  user: {
    uid: string;
    displayName: string;
    email: string;
    role: 'admin' | 'barber' | 'client';
  };
  triggerToast: (msg: string) => void;
}

export default function Appearance({ user, triggerToast }: AppearanceProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // States for Barbearia settings
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [slogan, setSlogan] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [instagram, setInstagram] = useState('');
  const [address, setAddress] = useState('');

  // Hydrate state
  useEffect(() => {
    const fetchBarbearia = async () => {
      try {
        const docRef = doc(db, 'barbers', user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setName(data.name || user.displayName || '');
          setPhone(data.phone || '');
          setSlogan(data.slogan || '');
          setLogoUrl(data.logoUrl || data.avatarUrl || '');
          setBannerUrl(data.bannerUrl || '');
          setInstagram(data.instagram || '');
          setAddress(data.address || '');
        }
        setLoading(false);
      } catch (error) {
        console.error('Error fetching barbearia profile:', error);
        setLoading(false);
      }
    };
    fetchBarbearia();
  }, [user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const docRef = doc(db, 'barbers', user.uid);
      await updateDoc(docRef, {
        name: name.trim(),
        phone: phone.trim(),
        slogan: slogan.trim(),
        logoUrl: logoUrl.trim(),
        avatarUrl: logoUrl.trim(), // sync avatarUrl too
        bannerUrl: bannerUrl.trim(),
        instagram: instagram.trim(),
        address: address.trim()
      });
      triggerToast('Aparência e perfil atualizados com sucesso!');
    } catch (error) {
      console.error('Error saving custom info:', error);
      triggerToast('Erro de conexão ao salvar informações.');
    } finally {
      setSaving(false);
    }
  };

  const bookingLink = `${window.location.origin}${window.location.pathname}?agendar=true&barbearia=${user.uid}`;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden select-none animate-fade-in font-sans text-text-primary">
      {/* Header Bar */}
      <div className="px-6 py-4.5 border-b border-border-dark bg-bg-dark-800 flex items-center justify-between shrink-0 select-none shadow">
        <div>
          <h2 className="font-display font-medium text-xl md:text-2xl text-text-primary flex items-center gap-2">
            <span>🎨</span>
            <span>Personalizar Estilo e Tela Inicial</span>
          </h2>
          <p className="text-text-muted text-[11px] uppercase tracking-wider font-semibold mt-1">
            Modifique a cara da sua barbearia para seus clientes agendarem
          </p>
        </div>

        <a 
          href={bookingLink} 
          target="_blank" 
          rel="noopener noreferrer"
          className="bg-bg-dark-700 hover:bg-bg-dark-650 border border-border-dark text-text-primary text-xs font-semibold py-2 px-3 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <span>Ver seu link físico</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      {/* Main Content Areas */}
      {loading ? (
        <div className="flex-1 py-20 text-center flex flex-col items-center justify-center">
          <div className="w-8 h-8 border-2 border-[#c5a880] border-t-transparent rounded-full animate-spin mb-3"></div>
          <p className="text-xs text-text-secondary">Carregando painel de customização...</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Form Side */}
          <div className="lg:col-span-7 bg-bg-dark-800 border border-border-dark rounded-2xl p-5 md:p-6 shadow-xl space-y-6 self-start">
            <div className="flex items-center gap-2 border-b border-border-dark pb-3">
              <Palette className="w-5 h-5 text-[#c5a880]" />
              <h3 className="font-display font-bold text-base text-white">Configurações visuais do estabelecimento</h3>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              
              {/* Barbearia Custom Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-text-secondary flex items-center gap-1.5">
                  <Crown className="w-4 h-4 text-[#c5a880]" />
                  <span>Nome Comercial da Barbearia *</span>
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Barber Shop Vintage"
                  className="w-full bg-bg-dark-900 border border-border-dark text-text-primary rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-[#c5a880] transition-colors"
                />
              </div>

              {/* Slogan */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-text-secondary flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-[#c5a880]" />
                  <span>Slogan / Texto de Boas-vindas (Destaque na tela)</span>
                </label>
                <input
                  type="text"
                  value={slogan}
                  onChange={(e) => setSlogan(e.target.value)}
                  placeholder="Ex: Tradição, Estilo e o Melhor Atendimento da Cidade."
                  className="w-full bg-bg-dark-900 border border-border-dark text-text-primary rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-[#c5a880] transition-colors"
                />
              </div>

              {/* Logo Upload Component */}
              <ImageUpload
                label="Logomarca da Barbearia (Foto do Estabelecimento)"
                value={logoUrl}
                onChange={(base64) => setLogoUrl(base64)}
                onClear={() => setLogoUrl('')}
                maxDimensions={{ width: 400, height: 400 }}
                aspectRatioLabel="Proporção 1:1"
              />

              {/* Banner Upload Component */}
              <ImageUpload
                label="Imagem de Capa / Wallpaper (Destaque do Painel)"
                value={bannerUrl}
                onChange={(base64) => setBannerUrl(base64)}
                onClear={() => setBannerUrl('')}
                maxDimensions={{ width: 800, height: 400 }}
                aspectRatioLabel="Proporção Paisagem"
              />

              {/* Contact and Social Media */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-text-secondary flex items-center gap-1.5">
                    <Instagram className="w-4 h-4 text-[#c5a880]" />
                    <span>Instagram (Sem o @)</span>
                  </label>
                  <input
                    type="text"
                    value={instagram}
                    onChange={(e) => setInstagram(e.target.value)}
                    placeholder="Ex: royal_cuts"
                    className="w-full bg-bg-dark-900 border border-border-dark text-text-primary rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-[#c5a880] transition-colors"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-text-secondary flex items-center gap-1.5">
                    <Phone className="w-4 h-4 text-[#c5a880]" />
                    <span>WhatsApp / Telefone</span>
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Ex: (35) 99999-9999"
                    className="w-full bg-bg-dark-900 border border-border-dark text-text-primary rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-[#c5a880] transition-colors"
                  />
                </div>
              </div>

              {/* Physical Address */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-text-secondary flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-[#c5a880]" />
                  <span>Endereço Comercial</span>
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Ex: Av. Principal, 123, Centro, São Paulo - SP"
                  className="w-full bg-bg-dark-900 border border-border-dark text-text-primary rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-[#c5a880] transition-colors"
                />
              </div>

              <div className="pt-4 border-t border-border-dark flex justify-end">
                <button
                  type="submit"
                  disabled={saving || !name.trim()}
                  className="btn bg-[#c5a880] hover:bg-[#c5a880]/90 text-black font-bold text-xs py-3 px-6 rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow transition-all active:scale-[0.98] disabled:opacity-40"
                >
                  <Save className="w-4 h-4" />
                  <span>{saving ? 'Gravando Alterações...' : 'Salvar Aparência'}</span>
                </button>
              </div>
            </form>
          </div>

          {/* Interactive Live Screen Preview Side */}
          <div className="lg:col-span-5 space-y-4">
            <div className="flex items-center gap-2 pl-1 select-none">
              <Eye className="w-4.5 h-4.5 text-[#c5a880]" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">Pré-visualização em tempo real</h3>
            </div>

            {/* Smart simulated smartphone display */}
            <div className="border-4 border-bg-dark-900 bg-bg-dark-950 rounded-[2.5rem] p-3 shadow-2xl relative overflow-hidden aspect-[9/16] max-w-sm mx-auto flex flex-col">
              
              {/* Speaker Notch */}
              <div className="absolute top-2 left-1/2 -translate-x-1/2 w-28 h-4.5 bg-black rounded-full z-10 flex items-center justify-between px-4">
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-800"></span>
                <span className="w-8 h-1 bg-zinc-800 rounded"></span>
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-800"></span>
              </div>

              {/* Screen Area */}
              <div className="flex-1 bg-[#121214] rounded-[2rem] overflow-y-auto overflow-x-hidden pt-6 pb-4 px-3 space-y-4.5 scrollbar-thin flex flex-col">
                
                {/* Simulated Header */}
                <div className="flex items-center justify-between border-b border-zinc-800 pb-2 shrink-0">
                  <span className="text-[10px] font-mono text-zinc-500">14:30 💈</span>
                  <span className="text-[9px] font-bold text-[#c5a880] uppercase tracking-wider truncate max-w-[120px]">
                    {name || 'Minha Barbearia'}
                  </span>
                  <span className="text-[10px] text-[#c5a880]">●</span>
                </div>

                {/* Banner Capa */}
                {bannerUrl ? (
                  <div className="w-full h-24 rounded-xl overflow-hidden relative border border-zinc-800/80 bg-zinc-900">
                    <img 
                      src={bannerUrl} 
                      alt="Banner" 
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent flex items-end p-2.5">
                      <p className="text-[9px] text-[#c5a880] font-sans font-bold uppercase tracking-widest truncate leading-none">
                        Seja Bem-vindo!
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="w-full h-24 rounded-xl bg-gradient-to-br from-bg-dark-850 to-bg-dark-750 border border-zinc-800 p-4 flex flex-col justify-end">
                    <p className="text-[9px] text-[#c5a880] font-bold uppercase tracking-widest leading-none">
                      (Sem imagem de capa)
                    </p>
                  </div>
                )}

                {/* Logo & Headline */}
                <div className="flex flex-col items-center text-center space-y-2 select-none">
                  {logoUrl ? (
                    <img 
                      src={logoUrl} 
                      alt="Logo" 
                      referrerPolicy="no-referrer"
                      className="w-14 h-14 rounded-full object-cover border border-[#c5a880]/35 shadow-md bg-zinc-900" 
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center font-display font-extrabold text-[#c5a880] text-sm shadow-md">
                      {name ? name.slice(0, 2).toUpperCase() : 'B'}
                    </div>
                  )}

                  <div>
                    <h4 className="text-xs font-bold text-white font-display leading-tight">
                      {name || 'Nome da Barbearia'}
                    </h4>
                    {slogan ? (
                      <p className="text-[9.5px] text-zinc-400 mt-1 italic leading-normal max-w-[220px] mx-auto text-center">
                        "{slogan}"
                      </p>
                    ) : (
                      <p className="text-[9.5px] text-zinc-500 mt-1 italic">
                        Insira um slogan ou texto de recepção
                      </p>
                    )}
                  </div>
                </div>

                {/* Real-time contact badges in preview */}
                <div className="grid grid-cols-2 gap-2 text-[9px] select-none text-zinc-300">
                  {phone && (
                    <div className="bg-zinc-900/80 border border-zinc-800 rounded-lg p-1.5 flex items-center gap-1">
                      <Phone className="w-2.5 h-2.5 text-[#c5a880]" />
                      <span className="truncate font-mono">{phone}</span>
                    </div>
                  )}
                  {instagram && (
                    <div className="bg-zinc-900/80 border border-zinc-800 rounded-lg p-1.5 flex items-center gap-1">
                      <Instagram className="w-2.5 h-2.5 text-[#c5a880]" />
                      <span className="truncate">@{instagram}</span>
                    </div>
                  )}
                </div>

                {address && (
                  <div className="bg-zinc-900/80 border border-zinc-800 rounded-lg p-2 text-[9.5px] text-zinc-400 flex items-start gap-1 select-none leading-relaxed">
                    <MapPin className="w-3.5 h-3.5 text-[#c5a880] shrink-0 mt-0.5" />
                    <span className="line-clamp-2">{address}</span>
                  </div>
                )}

                {/* Steps indicator placeholder */}
                <div className="space-y-2 mt-2 select-none grow flex flex-col justify-end pb-2">
                  <div className="bg-zinc-900 border border-border-dark/30 rounded-xl p-3 flex items-center justify-between gap-2 opacity-95">
                    <div className="space-y-1">
                      <span className="text-[8px] uppercase tracking-wider font-bold text-zinc-500">Agendamento rápido</span>
                      <p className="text-[10px] text-white font-bold leading-none">Reservar Horário</p>
                    </div>
                    <div className="h-6 w-12 rounded-lg bg-[#c5a880]/15 border border-[#c5a880]/40 flex items-center justify-center text-[#c5a880] text-[8px] font-bold">
                      INICIAR
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}

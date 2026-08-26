import { useState, useEffect } from 'react';
import { Download, Smartphone, CheckCircle2, Info, Share, HelpCircle } from 'lucide-react';
import { motion } from 'motion/react';

interface InstallAppProps {
  triggerToast: (msg: string) => void;
}

export default function InstallApp({ triggerToast }: InstallAppProps) {
  const [isInstallable, setIsInstallable] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // Check if prompt is already stored
    if ((window as any).deferredPrompt) {
      setIsInstallable(true);
    }

    // Listen for the custom event
    const handleInstallable = () => {
      setIsInstallable(true);
    };

    // Listen for successful installation
    const handleAppInstalled = () => {
      setInstalled(true);
      setIsInstallable(false);
      triggerToast('Aplicativo instalado com sucesso!');
    };

    window.addEventListener('pwa-installable', handleInstallable);
    window.addEventListener('appinstalled', handleAppInstalled);

    // Simple heuristic check if already in standalone mode
    if (window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone) {
      setInstalled(true);
    }

    return () => {
      window.removeEventListener('pwa-installable', handleInstallable);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [triggerToast]);

  const handleInstallClick = async () => {
    const promptEvent = (window as any).deferredPrompt;
    if (!promptEvent) {
      triggerToast('Instalação automática indisponível. Siga o passo a passo abaixo.');
      return;
    }

    // Show the install prompt
    promptEvent.prompt();

    // Wait for the user to respond to the prompt
    const { outcome } = await promptEvent.userChoice;
    console.log(`User response to install prompt: ${outcome}`);

    // We've used the prompt, and can't use it again
    (window as any).deferredPrompt = null;
    setIsInstallable(false);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto select-none" id="install-app-container">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border-dark pb-5">
        <div className="space-y-1">
          <h2 className="text-xl font-extrabold text-white font-display">Baixar o Aplicativo do Barbeiro 📱</h2>
          <p className="text-xs text-text-secondary leading-relaxed">
            Instale o sistema diretamente no seu celular ou computador sem precisar de App Store ou Google Play!
          </p>
        </div>
      </div>

      {/* Main card */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        
        {/* Call to Action card */}
        <div className="md:col-span-5 bg-gradient-to-b from-bg-dark-800 to-bg-dark-900 border border-border-dark rounded-2xl p-6 flex flex-col justify-between space-y-6 shadow-xl relative overflow-hidden">
          {/* Subtle gold decoration */}
          <div className="absolute -top-12 -right-12 w-32 h-32 bg-brand-amber/5 rounded-full blur-2xl pointer-events-none" />
          
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-full bg-brand-amber/10 border border-brand-amber/20 flex items-center justify-center text-brand-amber">
              <Download className="w-6 h-6" />
            </div>

            <div className="space-y-2">
              <h3 className="text-base font-bold text-white">Instalação Direta (PWA)</h3>
              <p className="text-xs text-text-secondary leading-relaxed">
                Ao instalar, você ganha um ícone lindo na tela inicial do seu celular, acesso rápido em tela cheia, sem barra de navegação do navegador, e carregamento instantâneo.
              </p>
            </div>

            {/* List of features */}
            <div className="space-y-2.5 pt-2">
              <div className="flex items-center gap-2 text-xs text-text-primary">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Ícone oficial na sua tela inicial</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-text-primary">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Navegação limpa (sem barras do browser)</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-text-primary">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Atualizações automáticas em tempo real</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-text-primary">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Ocupa quase nada de espaço de memória</span>
              </div>
            </div>
          </div>

          <div className="pt-4">
            {installed ? (
              <div className="w-full bg-emerald-950/20 border border-emerald-500/20 rounded-xl p-3 flex items-center gap-2.5 text-emerald-400">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                <div className="text-xs font-bold">Você já está usando o aplicativo instalado!</div>
              </div>
            ) : isInstallable ? (
              <button
                onClick={handleInstallClick}
                className="w-full btn bg-brand-amber hover:bg-brand-amber-hover text-black font-extrabold text-xs py-3 rounded-xl flex items-center justify-center gap-2 shadow-lg hover:shadow-brand-amber/15 transition-all cursor-pointer transform active:scale-95"
              >
                <Download className="w-4.5 h-4.5 stroke-[2.2]" />
                <span>INSTALAR AGORA</span>
              </button>
            ) : (
              <div className="w-full bg-bg-dark-950 border border-border-dark rounded-xl p-3.5 space-y-1.5">
                <div className="flex items-center gap-2 text-brand-amber text-xs font-bold">
                  <Info className="w-4 h-4 shrink-0" />
                  <span>Configuração Pronta</span>
                </div>
                <p className="text-[11px] text-text-muted leading-normal">
                  Siga as instruções rápidas ao lado para instalar no seu aparelho de forma manual. É muito simples e leva menos de 10 segundos!
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Step-by-Step Instructions */}
        <div className="md:col-span-7 space-y-4">
          
          {/* iOS Section */}
          <div className="bg-bg-dark-800 border border-border-dark rounded-2xl p-5 space-y-3.5">
            <div className="flex items-center gap-2.5 pb-2 border-b border-border-dark/50">
              <span className="text-lg">🍏</span>
              <h3 className="font-bold text-sm text-white">Como instalar no iPhone (Safari / iOS)</h3>
            </div>
            
            <div className="space-y-3 text-xs leading-relaxed">
              <div className="flex gap-3">
                <div className="w-5 h-5 rounded-full bg-bg-dark-950 flex items-center justify-center text-[10px] font-bold border border-border-dark text-brand-amber shrink-0">
                  1
                </div>
                <div>
                  Abra este sistema no navegador <strong className="text-white">Safari</strong> do seu iPhone.
                </div>
              </div>
              
              <div className="flex gap-3">
                <div className="w-5 h-5 rounded-full bg-bg-dark-950 flex items-center justify-center text-[10px] font-bold border border-border-dark text-brand-amber shrink-0">
                  2
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  Toque no botão de <strong>Compartilhar</strong> 
                  <span className="inline-flex items-center justify-center p-1 bg-bg-dark-950 rounded border border-border-dark mx-0.5">
                    <Share className="w-3.5 h-3.5 text-brand-amber" />
                  </span> 
                  (geralmente na barra inferior do Safari).
                </div>
              </div>

              <div className="flex gap-3">
                <div className="w-5 h-5 rounded-full bg-bg-dark-950 flex items-center justify-center text-[10px] font-bold border border-border-dark text-brand-amber shrink-0">
                  3
                </div>
                <div>
                  Role a lista para baixo e toque em <strong className="text-brand-amber">"Adicionar à Tela de Início"</strong>.
                </div>
              </div>

              <div className="flex gap-3">
                <div className="w-5 h-5 rounded-full bg-bg-dark-950 flex items-center justify-center text-[10px] font-bold border border-border-dark text-brand-amber shrink-0">
                  4
                </div>
                <div>
                  Confirme o nome e clique em <strong>"Adicionar"</strong> no canto superior direito. Pronto! O app aparecerá na tela do seu celular.
                </div>
              </div>
            </div>
          </div>

          {/* Android Section */}
          <div className="bg-bg-dark-800 border border-border-dark rounded-2xl p-5 space-y-3.5">
            <div className="flex items-center gap-2.5 pb-2 border-b border-border-dark/50">
              <span className="text-lg">🤖</span>
              <h3 className="font-bold text-sm text-white">Como instalar no Android (Chrome / Samsung)</h3>
            </div>

            <div className="space-y-3 text-xs leading-relaxed">
              <div className="flex gap-3">
                <div className="w-5 h-5 rounded-full bg-bg-dark-950 flex items-center justify-center text-[10px] font-bold border border-border-dark text-brand-amber shrink-0">
                  1
                </div>
                <div>
                  Se você ver um aviso ou botão de instalação na tela, basta clicar nele.
                </div>
              </div>

              <div className="flex gap-3">
                <div className="w-5 h-5 rounded-full bg-bg-dark-950 flex items-center justify-center text-[10px] font-bold border border-border-dark text-brand-amber shrink-0">
                  2
                </div>
                <div>
                  Caso contrário, toque nos <strong>três pontinhos (⋮)</strong> no canto superior direito do Google Chrome.
                </div>
              </div>

              <div className="flex gap-3">
                <div className="w-5 h-5 rounded-full bg-bg-dark-950 flex items-center justify-center text-[10px] font-bold border border-border-dark text-brand-amber shrink-0">
                  3
                </div>
                <div>
                  Toque em <strong className="text-brand-amber">"Instalar aplicativo"</strong> ou <strong className="text-brand-amber">"Adicionar à tela inicial"</strong>.
                </div>
              </div>

              <div className="flex gap-3">
                <div className="w-5 h-5 rounded-full bg-bg-dark-950 flex items-center justify-center text-[10px] font-bold border border-border-dark text-brand-amber shrink-0">
                  4
                </div>
                <div>
                  Confirme a instalação. O aplicativo será baixado de fundo e adicionará o atalho diretamente ao seu telefone!
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Helpful banner */}
      <div className="bg-amber-950/20 border border-brand-amber/20 rounded-2xl p-4 flex gap-3 text-xs text-text-secondary">
        <HelpCircle className="w-5 h-5 text-brand-amber shrink-0 mt-0.5" />
        <div className="space-y-1">
          <strong className="text-white block">Posso compartilhar com meus clientes?</strong>
          <span>
            Sim! Esse mesmo aplicativo é otimizado para os clientes. Ao abrirem o link de agendamento no celular deles, eles também verão que podem instalar para marcar cortes e ver os planos contratados com muito mais facilidade, direto da tela inicial deles.
          </span>
        </div>
      </div>
    </div>
  );
}

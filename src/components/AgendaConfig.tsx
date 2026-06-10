import React, { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { 
  Calendar, 
  Clock, 
  Save, 
  RotateCcw,
  Check,
  AlertCircle,
  HelpCircle,
  CheckCircle2
} from 'lucide-react';

interface AgendaConfigProps {
  user: {
    uid: string;
    displayName: string;
    email: string;
    role: 'admin' | 'barber' | 'client';
  };
  triggerToast: (msg: string) => void;
}

// Complete list of time slots used as standard in the system
const ALL_TIME_SLOTS = [
  '07:00', '07:30', '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', 
  '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30',
  '17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00', '21:30'
];

const DEFAULT_DAYS = [1, 2, 3, 4, 5, 6]; // Seg a Sáb
const DEFAULT_HOURS = [
  '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', 
  '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30',
  '17:00', '17:30', '18:00', '18:30', '19:00', '19:30'
];

interface Weekday {
  id: number;
  name: string;
  fullName: string;
}

const WEEKDAYS: Weekday[] = [
  { id: 1, name: 'Seg', fullName: 'Segunda-feira' },
  { id: 2, name: 'Ter', fullName: 'Terça-feira' },
  { id: 3, name: 'Qua', fullName: 'Quarta-feira' },
  { id: 4, name: 'Qui', fullName: 'Quinta-feira' },
  { id: 5, name: 'Sex', fullName: 'Sexta-feira' },
  { id: 6, name: 'Sáb', fullName: 'Sábado' },
  { id: 0, name: 'Dom', fullName: 'Domingo' }
];

export default function AgendaConfig({ user, triggerToast }: AgendaConfigProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Scheduling Configurations
  const [workingDays, setWorkingDays] = useState<number[]>(DEFAULT_DAYS);
  const [workingHours, setWorkingHours] = useState<string[]>(DEFAULT_HOURS);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docRef = doc(db, 'barbers', user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.scheduleSettings) {
            setWorkingDays(data.scheduleSettings.workingDays ?? DEFAULT_DAYS);
            setWorkingHours(data.scheduleSettings.workingHours ?? DEFAULT_HOURS);
          }
        }
        setLoading(false);
      } catch (error) {
        console.error('Error fetching schedule settings:', error);
        setLoading(false);
      }
    };
    fetchSettings();
  }, [user]);

  const handleToggleDay = (dayId: number) => {
    setWorkingDays(prev => 
      prev.includes(dayId) ? prev.filter(id => id !== dayId) : [...prev, dayId]
    );
  };

  const handleToggleHour = (hour: string) => {
    setWorkingHours(prev => 
      prev.includes(hour) ? prev.filter(h => h !== hour) : [...prev, hour].sort()
    );
  };

  const handlePresetCommercial = () => {
    setWorkingHours(DEFAULT_HOURS);
    triggerToast('Horário Comercial Padrão aplicado nas preferências!');
  };

  const handlePresetSelectAll = () => {
    setWorkingHours(ALL_TIME_SLOTS);
    triggerToast('Todos os horários foram ativados!');
  };

  const handlePresetClear = () => {
    setWorkingHours([]);
    triggerToast('Horários limpos. Selecione ao menos um.');
  };

  const handlePresetSelectAllDays = () => {
    setWorkingDays([1, 2, 3, 4, 5, 6, 0]);
    triggerToast('Todos os dias ativados!');
  };

  const handleSave = async () => {
    if (workingDays.length === 0) {
      triggerToast('Atenção: Selecione ao menos um dia de trabalho!');
      return;
    }
    if (workingHours.length === 0) {
      triggerToast('Atenção: Selecione ao menos um horário de atendimento!');
      return;
    }

    setSaving(true);
    try {
      const docRef = doc(db, 'barbers', user.uid);
      await updateDoc(docRef, {
        scheduleSettings: {
          workingDays,
          workingHours
        }
      });
      triggerToast('Configuração de expediente salva com sucesso!');
    } catch (err) {
      console.error('Error saving schedule config:', err);
      triggerToast('Falha ao conectar com o banco de dados.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-bg-dark-900 self-center">
        <div className="w-10 h-10 border-4 border-brand-amber border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-text-secondary text-xs font-semibold">Carregando configurações da agenda...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden select-none animate-fade-in font-sans text-text-primary">
      {/* Header Bar */}
      <div className="px-6 py-4.5 border-b border-border-dark bg-bg-dark-800 flex items-center justify-between shrink-0 select-none shadow gap-4">
        <div>
          <h2 className="font-display font-medium text-xl md:text-2xl text-text-primary flex items-center gap-2">
            <span>📅</span>
            <span>Configurações da Agenda</span>
          </h2>
          <p className="text-[10px] md:text-xs text-text-muted mt-0.5 leading-relaxed">
            Defina em quais dias da semana e horários específicos seus clientes poderão realizar agendamentos.
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 bg-brand-amber hover:bg-brand-amber-hover disabled:bg-opacity-50 text-[#1a0e00] font-sans font-bold text-xs px-4 py-2.5 rounded-xl cursor-pointer shadow transition-all shrink-0 active:scale-95"
        >
          {saving ? (
            <div className="w-4 h-4 border-2 border-[#1a0e00] border-t-transparent rounded-full animate-spin"></div>
          ) : (
            <Save className="w-4 h-4" />
          )}
          <span>{saving ? 'Gravando...' : 'Salvar Alterações'}</span>
        </button>
      </div>

      {/* Settings Scrollable Panel */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 md:p-8 max-w-4xl w-full mx-auto">
        
        {/* Info advice box */}
        <div className="bg-[#c5a880]/5 border border-[#c5a880]/30 rounded-2xl p-4 flex gap-3 text-text-secondary">
          <AlertCircle className="w-5 h-5 text-brand-amber shrink-0 mt-0.5" />
          <div className="text-xs leading-relaxed space-y-1">
            <p className="font-bold text-text-primary">Funcionamento do Bloqueio Dinâmico:</p>
            <p>
              Os clientes que acessarem seu link profissional só verão os dias da semana e horários ativados abaixo. Quando um horário for reservado por um cliente, ele ficará automaticamente indisponível para outros agendamentos.
            </p>
          </div>
        </div>

        {/* Section 1: Working Days */}
        <div className="bg-bg-dark-850 border border-border-dark rounded-2xl p-5 md:p-6 space-y-4 shadow-lg">
          <div className="flex items-center justify-between border-b border-border-dark/60 pb-3">
            <div className="flex items-center gap-2.5">
              <Calendar className="w-5 h-5 text-brand-amber" />
              <div>
                <h3 className="text-sm font-bold text-text-primary">Dias de Expediente</h3>
                <p className="text-[10px] text-text-secondary">Ative os dias da semana em que os agendamentos são aceitos</p>
              </div>
            </div>
            
            <button
              onClick={handlePresetSelectAllDays}
              className="text-[10px] font-bold text-brand-amber hover:underline px-2 py-1 rounded"
            >
              Ativar Todos os Dias
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
            {WEEKDAYS.map(day => {
              const active = workingDays.includes(day.id);
              return (
                <button
                  type="button"
                  key={day.id}
                  onClick={() => handleToggleDay(day.id)}
                  className={`p-3.5 rounded-xl border flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                    active 
                      ? 'bg-[#c5a880]/15 border-brand-amber text-brand-amber font-bold ring-1 ring-brand-amber/30'
                      : 'bg-bg-dark-900 border-border-dark text-text-muted hover:border-text-secondary hover:text-text-primary'
                  }`}
                >
                  <span className="text-xs uppercase tracking-wider font-bold mb-1">{day.name}</span>
                  <span className="text-[10px] opacity-75">{active ? 'Ativo' : 'Fechado'}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Section 2: Active Working Hours */}
        <div className="bg-bg-dark-850 border border-border-dark rounded-2xl p-5 md:p-6 space-y-4 shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-border-dark/60 pb-3 gap-3">
            <div className="flex items-center gap-2.5">
              <Clock className="w-5 h-5 text-brand-amber" />
              <div>
                <h3 className="text-sm font-bold text-text-primary">Horários de Atendimento</h3>
                <p className="text-[10px] text-text-secondary">Marque os horários disponíveis ao público (Clique para alternar)</p>
              </div>
            </div>

            {/* Presets and template buttons for convenience */}
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <button
                type="button"
                onClick={handlePresetCommercial}
                className="text-[10px] font-bold bg-bg-dark-800 border border-border-dark text-text-secondary hover:text-text-primary px-2.5 py-1.5 rounded-lg hover:border-text-muted transition-colors cursor-pointer"
                title="Aplica horário de 08:00 a 19:30 excluindo o horário de almoço"
              >
                Horário Comercial
              </button>
              <button
                type="button"
                onClick={handlePresetSelectAll}
                className="text-[10px] font-bold bg-bg-dark-800 border border-border-dark text-text-secondary hover:text-text-primary px-2.5 py-1.5 rounded-lg hover:border-text-muted transition-colors cursor-pointer"
              >
                Ativar Todos
              </button>
              <button
                type="button"
                onClick={handlePresetClear}
                className="text-[10px] font-bold bg-bg-dark-800 border border-border-dark text-brand-danger-text hover:bg-brand-danger/10 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
              >
                Limpar Todos
              </button>
            </div>
          </div>

          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
            {ALL_TIME_SLOTS.map(hour => {
              const active = workingHours.includes(hour);
              return (
                <button
                  type="button"
                  key={hour}
                  onClick={() => handleToggleHour(hour)}
                  className={`py-2.5 rounded-lg border text-xs font-bold text-center cursor-pointer transition-all ${
                    active
                      ? 'bg-brand-amber/10 border-brand-amber text-brand-amber shadow'
                      : 'bg-bg-dark-900 border-border-dark text-text-muted hover:border-text-secondary hover:bg-bg-dark-800'
                  }`}
                >
                  {hour}
                </button>
              );
            })}
          </div>

          <div className="pt-2 text-center">
            <span className="text-[10px] text-text-muted font-semibold tracking-wide">
              Total de slots de atendimento ativos: <span className="text-brand-amber font-extrabold">{workingHours.length}</span>
            </span>
          </div>
        </div>

        {/* Outer Save Footer */}
        <div className="flex justify-end pt-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-brand-amber hover:bg-brand-amber-hover disabled:bg-opacity-50 text-[#1a0e00] font-sans font-bold text-xs px-6 py-3.5 rounded-xl cursor-pointer shadow-lg transition-all transform active:scale-95"
          >
            {saving ? (
              <div className="w-5 h-5 border-2 border-[#1a0e00] border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <Check className="w-5 h-5 font-bold" />
            )}
            <span>{saving ? 'Gravando configurações...' : 'Salvar e Aplicar Expeditente'}</span>
          </button>
        </div>

      </div>
    </div>
  );
}

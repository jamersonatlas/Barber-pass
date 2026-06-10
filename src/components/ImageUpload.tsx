import React, { useState, useRef } from 'react';
import { Upload, X, Image as ImageIcon, CheckCircle, AlertCircle } from 'lucide-react';

interface ImageUploadProps {
  label: string;
  value?: string;
  onChange: (base64: string) => void;
  onClear: () => void;
  maxDimensions?: { width: number; height: number };
  aspectRatioLabel?: string;
}

export default function ImageUpload({
  label,
  value,
  onChange,
  onClear,
  maxDimensions = { width: 400, height: 400 },
  aspectRatioLabel = "1:1 ou proporcional"
}: ImageUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          // Resize if exceeding constraint
          if (width > height) {
            if (width > maxDimensions.width) {
              height = Math.round((height * maxDimensions.width) / width);
              width = maxDimensions.width;
            }
          } else {
            if (height > maxDimensions.height) {
              width = Math.round((width * maxDimensions.height) / height);
              height = maxDimensions.height;
            }
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(event.target?.result as string); // fallback
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);
          const base64Str = canvas.toDataURL('image/jpeg', 0.82); // High quality with low storage footprint
          resolve(base64Str);
        };
        img.onerror = () => reject('Erro ao analisar as dimensões da imagem.');
      };
      reader.onerror = () => reject('Erro ao ler o arquivo.');
    });
  };

  const processFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('O arquivo selecionado deve ser uma imagem (PNG, JPG, JPEG, WEBP, etc.)');
      return;
    }

    setError(null);
    setCompressing(true);
    try {
      const base64 = await compressImage(file);
      onChange(base64);
    } catch (err: any) {
      console.error(err);
      setError(err || 'Erro ao converter imagem.');
    } finally {
      setCompressing(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await processFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      await processFile(e.target.files[0]);
    }
  };

  const onButtonClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="space-y-1.5 font-sans">
      <div className="flex justify-between items-center select-none text-xs">
        <label className="font-semibold text-text-secondary">{label}</label>
        <span className="text-[10px] text-text-muted italic">Sugerido: {aspectRatioLabel}</span>
      </div>

      <div className="relative">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/*"
          onChange={handleChange}
        />

        {value ? (
          /* Thumbnail preview */
          <div className="relative flex items-center justify-between p-3.5 bg-bg-dark-900 border border-brand-amber-border/30 rounded-xl animate-fade-in group hover:border-[#c5a880]/60 transition-colors">
            <div className="flex items-center gap-3">
              <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-bg-dark-800 border border-border-dark shrink-0">
                <img 
                  src={value} 
                  alt="Review upload" 
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-white flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5 text-brand-amber" />
                  <span>Arquivo carregado</span>
                </p>
                <p className="text-[10px] text-text-muted">Pronto para salvar no perfil.</p>
              </div>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
              className="p-2 text-text-muted hover:text-brand-danger-text hover:bg-brand-danger-bg/20 rounded-xl transition-all cursor-pointer"
              title="Remover imagem"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          /* Drag and Drop Zone */
          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onClick={onButtonClick}
            className={`flex flex-col items-center justify-center p-5 border-2 border-dashed rounded-xl cursor-pointer transition-all ${
              dragActive 
                ? 'border-[#c5a880] bg-[#c5a880]/10' 
                : 'border-border-dark hover:border-[#c5a880]/50 hover:bg-bg-dark-750 bg-bg-dark-900/60'
            }`}
          >
            {compressing ? (
              <div className="flex flex-col items-center py-2.5 space-y-2 select-none">
                <div className="w-5 h-5 border-2 border-[#c5a880] border-t-transparent rounded-full animate-spin"></div>
                <span className="text-[10px] uppercase tracking-wider text-[#c5a880] font-bold">Processando Imagem...</span>
              </div>
            ) : (
              <div className="text-center space-y-1.5 select-none">
                <div className="mx-auto w-8 h-8 rounded-full bg-bg-dark-800 flex items-center justify-center border border-border-dark text-[#c5a880]">
                  <Upload className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-bold text-white">
                    Arraste ou <span className="text-[#c5a880] hover:underline">clique para enviar</span>
                  </p>
                  <p className="text-[10px] text-text-muted">PNG, JPG ou WEBP (Max 5MB)</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-brand-danger-text bg-brand-danger-bg/15 p-2 rounded-lg border border-brand-danger-border/30">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

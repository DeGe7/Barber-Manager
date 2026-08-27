import { useRef, useState } from 'react';
import { useAuth } from '@/auth/auth';
import { ROLE_LABELS } from '@/auth/types';
import { Camera, UserCircle, Upload, Save, X, Pencil } from 'lucide-react';
import { toast } from 'sonner';

export default function Perfil() {
  const { profile: session, setAvatar, setName } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState(session?.avatar || '');
  const [draftAvatar, setDraftAvatar] = useState(session?.avatar || '');
  const [isEditing, setIsEditing] = useState(false);
  const [draftName, setDraftName] = useState(session?.name || '');
  const [isEditingName, setIsEditingName] = useState(false);

  if (!session) return null;

  const handlePhoto = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Selecione uma imagem válida.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('A imagem deve ter no máximo 2 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const avatar = String(reader.result);
      setDraftAvatar(avatar);
      setIsEditing(true);
    };
    reader.readAsDataURL(file);
  };

  const savePhoto = () => {
    setPreview(draftAvatar);
    setAvatar(draftAvatar);
    setIsEditing(false);
    toast.success('Foto de perfil atualizada.');
  };

  const cancelPhoto = () => {
    setDraftAvatar(preview);
    setIsEditing(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  const saveName = async () => {
    const trimmedName = draftName.trim();
    if (trimmedName.split(/\s+/).length < 2) {
      toast.error('Informe nome e sobrenome.');
      return;
    }
    try {
      await setName(trimmedName);
      setDraftName(trimmedName);
      setIsEditingName(false);
      toast.success('Nome atualizado.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível atualizar o nome.');
    }
  };

  const cancelName = () => {
    setDraftName(session.name);
    setIsEditingName(false);
  };

  return (
    <div className="p-5 md:p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4 border-b border-brand-border pb-6">
        <div className="p-3 rounded-xl bg-brand-surface border border-brand-border text-brand-gold"><UserCircle className="w-6 h-6" /></div>
        <div>
          <h2 className="text-2xl font-bold">Meu Perfil</h2>
          <p className="text-sm text-muted-foreground mt-1">Gerencie suas informações pessoais e sua foto.</p>
        </div>
      </div>

      <section className="bg-brand-surface border border-brand-border rounded-2xl p-6 md:p-8">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
          <div className="relative">
            <div className="w-32 h-32 rounded-full bg-brand-bg border-2 border-brand-gold/50 flex items-center justify-center overflow-hidden text-4xl font-bold text-brand-gold">
              {draftAvatar ? <img src={draftAvatar} alt={`Foto de ${session.name}`} className="w-full h-full object-cover" /> : session.name.charAt(0).toUpperCase()}
            </div>
            <button type="button" onClick={() => inputRef.current?.click()} aria-label="Alterar foto de perfil" className="absolute bottom-0 right-0 p-2 rounded-full bg-brand-gold text-brand-bg hover:bg-brand-gold/90">
              <Camera className="w-4 h-4" />
            </button>
            <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={event => handlePhoto(event.target.files?.[0])} />
          </div>
          <div className="flex-1 text-center sm:text-left">
            {isEditingName ? (
              <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                <input
                  value={draftName}
                  onChange={event => setDraftName(event.target.value)}
                  autoComplete="name"
                  aria-label="Nome e sobrenome"
                  className="min-w-0 flex-1 bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-gold"
                />
                <button type="button" onClick={saveName} aria-label="Salvar nome" className="p-2 rounded-lg bg-brand-gold text-brand-bg hover:bg-brand-gold/90">
                  <Save className="w-4 h-4" />
                </button>
                <button type="button" onClick={cancelName} aria-label="Cancelar edição do nome" className="p-2 rounded-lg border border-brand-border hover:border-brand-gold hover:text-brand-gold">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 justify-center sm:justify-start">
                <h3 className="text-xl font-bold">{session.name}</h3>
                <button type="button" onClick={() => setIsEditingName(true)} aria-label="Editar nome" title="Editar nome" className="p-1.5 rounded-md text-muted-foreground hover:text-brand-gold hover:bg-brand-gold/10">
                  <Pencil className="w-4 h-4" />
                </button>
              </div>
            )}
            <p className="text-sm text-muted-foreground mt-1">{session.email}</p>
            <span className="inline-block mt-3 px-3 py-1 rounded-full bg-brand-gold/10 text-brand-gold text-xs font-semibold">{session.role ? ROLE_LABELS[session.role] : 'Perfil em configuração'}</span>
            <button type="button" onClick={() => inputRef.current?.click()} className="mt-5 flex items-center gap-2 mx-auto sm:mx-0 px-4 py-2 rounded-lg border border-brand-border text-sm font-semibold hover:border-brand-gold hover:text-brand-gold transition-colors">
              <Upload className="w-4 h-4" /> Alterar foto
            </button>
            <p className="text-xs text-muted-foreground mt-2">PNG, JPG ou WEBP · máximo de 2 MB</p>
            {isEditing && (
              <div className="flex flex-wrap gap-2 mt-5 justify-center sm:justify-start">
                <button type="button" onClick={savePhoto} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-gold text-brand-bg text-sm font-bold hover:bg-brand-gold/90">
                  <Save className="w-4 h-4" /> Salvar alterações
                </button>
                <button type="button" onClick={cancelPhoto} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-brand-border text-sm font-semibold hover:border-brand-gold hover:text-brand-gold transition-colors">
                  <X className="w-4 h-4" /> Cancelar
                </button>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
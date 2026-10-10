import React, { useState, useMemo } from 'react';
import { Session, Student, Teacher } from '../types';
import { generateSessionFromWaitlistApi } from '../lib/db';
import { getSessionDayName, getSessionCategory } from '../lib/sessionUtils';
import { 
  Calendar, Clock, MapPin, Users, CheckCircle2, 
  ArrowRight, X, Sparkles, AlertCircle, Check, Info
} from 'lucide-react';

interface GenerateSessionFromWaitlistModalProps {
  session: Session | null;
  isOpen: boolean;
  onClose: () => void;
  students: Student[];
  teachers: Teacher[];
  onSessionCreated?: (newSessionId: string) => void;
}

export const GenerateSessionFromWaitlistModal: React.FC<GenerateSessionFromWaitlistModalProps> = ({
  session,
  isOpen,
  onClose,
  students,
  teachers,
  onSessionCreated
}) => {
  if (!isOpen || !session) return null;

  const waitlistIds = session.waitlistStudentIds || [];
  
  // Objets étudiants complets sur la liste d'attente
  const waitlistedStudents = useMemo(() => {
    return waitlistIds.map(id => {
      const found = students.find(s => s.id === id);
      return found || {
        id,
        lastName: 'Élève',
        firstName: id,
        classGroup: '',
        schoolYear: session.schoolYear,
        paid: 'NON',
        parentalAuth: 'NON',
        imageRights: 'NON',
        tshirt: '',
        size: '',
        licenseNumber: '',
        amount: '',
        paymentMethod: ''
      };
    });
  }, [waitlistIds, students, session.schoolYear]);

  // Date par défaut : proposer le prochain jour de semaine similaire ou le lendemain
  const defaultDateStr = useMemo(() => {
    if (!session.date) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow.toISOString().split('T')[0];
    }
    const parts = session.date.split('-');
    if (parts.length === 3) {
      const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      // Si c'est un mardi (2) proposer le jeudi (4) ou la semaine suivante
      if (d.getDay() === 2) {
        d.setDate(d.getDate() + 2); // Jeudi de la même semaine
      } else if (d.getDay() === 4) {
        d.setDate(d.getDate() + 5); // Mardi suivant
      } else {
        d.setDate(d.getDate() + 7); // Semaine suivante
      }
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    return '';
  }, [session.date]);

  // Formulaire d'édition de la nouvelle séance
  const [sessionName, setSessionName] = useState(
    session.name.includes('(Créneau B)') || session.name.includes('Groupe 2') 
      ? session.name 
      : `${session.name} (Créneau supplémentaire)`
  );
  const [sessionDate, setSessionDate] = useState(defaultDateStr);
  const [sessionTime, setSessionTime] = useState(session.time || '17:00');
  const [sessionEndTime, setSessionEndTime] = useState(session.endTime || '18:00');
  const [sessionLocation, setSessionLocation] = useState(session.location || '');
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<string[]>(session.teacherIds || []);
  const [maxParticipants, setMaxParticipants] = useState<number | ''>(
    session.maxParticipants || Math.max(15, waitlistIds.length)
  );

  // Sélection des élèves à transférer (tous sélectionnés par défaut)
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>(waitlistIds);
  // Option pour retirer ou conserver les élèves sur la liste d'attente d'origine
  const [removeFromSourceWaitlist, setRemoveFromSourceWaitlist] = useState<boolean>(true);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const proposedDayName = getSessionDayName(sessionDate);

  const toggleStudentSelection = (id: string) => {
    setSelectedStudentIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const selectAllStudents = () => {
    setSelectedStudentIds([...waitlistIds]);
  };

  const deselectAllStudents = () => {
    setSelectedStudentIds([]);
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionDate) {
      setError('Veuillez sélectionner une date pour la nouvelle séance.');
      return;
    }
    if (!sessionTime) {
      setError('Veuillez indiquer une heure de début.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const newSessionId = await generateSessionFromWaitlistApi(session, {
        name: sessionName.trim(),
        date: sessionDate,
        time: sessionTime,
        endTime: sessionEndTime || undefined,
        location: sessionLocation.trim() || undefined,
        teacherIds: selectedTeacherIds,
        maxParticipants: maxParticipants ? Number(maxParticipants) : undefined,
        studentIdsToTransfer: selectedStudentIds,
        removeFromSourceWaitlist
      });

      if (onSessionCreated) {
        onSessionCreated(newSessionId);
      }
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Erreur lors de la création de la séance.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-200"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* En-tête du modal */}
        <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 text-white p-4 sm:p-6 shrink-0 border-b border-purple-800/50">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-500/30 text-purple-200 border border-purple-400/30 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-purple-300" />
                  <span>Dédoublement de créneau</span>
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/20 text-white">
                  {waitlistIds.length} élève(s) en attente
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white truncate">
                Générer une nouvelle séance
              </h2>
              <p className="text-xs text-purple-200 mt-1">
                Séance source : <strong>{session.name}</strong> du {session.date} ({session.time})
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Corps avec formulaire */}
        <form onSubmit={handleGenerate} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* 1. Informations de la nouvelle séance */}
          <div className="space-y-3.5 bg-slate-50 p-4 rounded-2xl border border-slate-200">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-purple-600" />
              <span>Paramètres du nouveau créneau</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Intitulé de la nouvelle séance
                </label>
                <input
                  type="text"
                  required
                  value={sessionName}
                  onChange={e => setSessionName(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Date de la séance ({proposedDayName})
                </label>
                <input
                  type="date"
                  required
                  value={sessionDate}
                  onChange={e => setSessionDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Lieu
                </label>
                <input
                  type="text"
                  placeholder="Ex: Salle de musculation, Gymnase"
                  value={sessionLocation}
                  onChange={e => setSessionLocation(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Horaire de début
                </label>
                <input
                  type="time"
                  required
                  value={sessionTime}
                  onChange={e => setSessionTime(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Horaire de fin
                </label>
                <input
                  type="time"
                  value={sessionEndTime}
                  onChange={e => setSessionEndTime(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Capacité max (places)
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={maxParticipants}
                  onChange={e => setMaxParticipants(e.target.value ? Number(e.target.value) : '')}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Enseignant(s) responsable(s)
                </label>
                <select
                  multiple
                  value={selectedTeacherIds}
                  onChange={e => {
                    const opts = Array.from(e.target.selectedOptions).map((o: HTMLOptionElement) => o.value);
                    setSelectedTeacherIds(opts);
                  }}
                  className="w-full px-2 py-1.5 text-xs bg-white border border-slate-300 rounded-xl font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 h-16"
                >
                  {teachers.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <span className="text-[10px] text-slate-400 block mt-0.5">Maintenir Ctrl / Cmd pour plusieurs</span>
              </div>
            </div>
          </div>

          {/* 2. Élèves de la liste d'attente à inscrire directement */}
          <div className="space-y-3 bg-white p-4 rounded-2xl border border-slate-200">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-emerald-600" />
                  <span>Élèves à inscrire d'office ({selectedStudentIds.length} / {waitlistIds.length})</span>
                </h3>
                <p className="text-[11px] text-slate-500">
                  Ces élèves seront directement placés sur la liste principale de la nouvelle séance.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={selectAllStudents}
                  className="text-[11px] font-bold text-purple-700 hover:underline cursor-pointer"
                >
                  Tout cocher
                </button>
                <span className="text-slate-300">•</span>
                <button
                  type="button"
                  onClick={deselectAllStudents}
                  className="text-[11px] font-bold text-slate-500 hover:underline cursor-pointer"
                >
                  Tout décocher
                </button>
              </div>
            </div>

            {waitlistedStudents.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-3 text-center bg-slate-50 rounded-xl">
                La liste d'attente de cette séance est actuellement vide.
              </p>
            ) : (
              <div className="max-h-52 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl">
                {waitlistedStudents.map((st, idx) => {
                  const isSelected = selectedStudentIds.includes(st.id);
                  return (
                    <label
                      key={st.id}
                      className={`p-2.5 flex items-center justify-between gap-3 text-xs transition-colors cursor-pointer ${
                        isSelected ? 'bg-purple-50/50' : 'bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleStudentSelection(st.id)}
                          className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 rounded-md cursor-pointer"
                        />
                        <span className="text-slate-400 font-bold text-[10px] w-5">
                          #{idx + 1}
                        </span>
                        <div className="min-w-0 truncate">
                          <span className="font-bold text-slate-900 block truncate">
                            {st.lastName} {st.firstName}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            {st.classGroup || 'Classe non renseignée'}
                          </span>
                        </div>
                      </div>

                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                        isSelected ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {isSelected ? 'Sera inscrit ✓' : 'Non transféré'}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}

            {/* Option de purge de la liste d'attente source */}
            <div className="pt-2 border-t border-slate-100">
              <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer font-medium">
                <input
                  type="checkbox"
                  checked={removeFromSourceWaitlist}
                  onChange={e => setRemoveFromSourceWaitlist(e.target.checked)}
                  className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500 cursor-pointer"
                />
                <span>
                  Retirer automatiquement les élèves transférés de la liste d'attente de la séance d'origine
                </span>
              </label>
            </div>
          </div>

          {/* Pied du modal avec actions */}
          <div className="pt-2 flex items-center justify-between gap-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 cursor-pointer"
            >
              Annuler
            </button>

            <button
              type="submit"
              disabled={isSubmitting || !sessionDate}
              className="px-5 py-2.5 bg-purple-700 hover:bg-purple-800 active:scale-95 text-white font-black text-xs sm:text-sm rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <span>Création en cours...</span>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Créer la séance ({selectedStudentIds.length} inscrits d'office)</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

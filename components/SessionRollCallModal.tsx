import React, { useState, useEffect, useMemo } from 'react';
import { Student, Session, Teacher } from '../types';
import { saveSessionApi, promoteFromWaitlistApi, leaveSessionWaitlistApi, getTeachersList } from '../lib/db';
import { getSessionDayName, getSessionCategory } from '../lib/sessionUtils';
import { GenerateSessionFromWaitlistModal } from './GenerateSessionFromWaitlistModal';
import { 
  CheckCircle2, Circle, Users, UserCheck, PlusCircle, Search, 
  Printer, Share2, Check, Moon, Zap, Calendar, Clock, X,
  AlertCircle, Hourglass, Sparkles, UserPlus, Trash2, ArrowUpRight
} from 'lucide-react';

interface Props {
  session: Session | null;
  isOpen: boolean;
  onClose: () => void;
  students: Student[];
  activeYear: string;
  teachers?: Teacher[];
  onSessionUpdated?: (updatedSession: Session) => void;
  onNewSessionCreated?: (newSessionId: string) => void;
}

export const SessionRollCallModal: React.FC<Props> = ({
  session,
  isOpen,
  onClose,
  students,
  activeYear,
  teachers: teachersProp,
  onSessionUpdated,
  onNewSessionCreated,
}) => {
  // Local active session for fast optimistic updates
  const [currentSession, setCurrentSession] = useState<Session | null>(session);
  const [copiedLink, setCopiedLink] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  // Search & filters inside attendance list
  const [attendanceSearch, setAttendanceSearch] = useState('');
  const [attendanceStatusFilter, setAttendanceStatusFilter] = useState<'all' | 'present' | 'absent'>('all');

  // Search for direct student enrollment
  const [addSearch, setAddSearch] = useState('');
  const [isAddOpen, setIsAddOpen] = useState(false);

  // Modal de dédoublement de séance depuis liste d'attente
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [teachersList, setTeachersList] = useState<Teacher[]>(teachersProp || []);

  useEffect(() => {
    if (teachersProp && teachersProp.length > 0) {
      setTeachersList(teachersProp);
    } else {
      getTeachersList().then(list => setTeachersList(list || [])).catch(() => {});
    }
  }, [teachersProp]);

  // Sync when prop session changes or modal opens
  useEffect(() => {
    setCurrentSession(session);
    setAttendanceSearch('');
    setAttendanceStatusFilter('all');
    setAddSearch('');
    setIsAddOpen(false);
  }, [session, isOpen]);

  // Handle escape key to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Temporary notification toast
  useEffect(() => {
    if (!notification) return;
    const timer = setTimeout(() => setNotification(null), 3000);
    return () => clearTimeout(timer);
  }, [notification]);

  const todayStr = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }, []);

  // Enrolled students filtered and sorted
  const enrolledStudents = useMemo(() => {
    if (!currentSession) return [];
    const enrolledIds = new Set(currentSession.enrolledStudentIds || []);
    const presentIds = new Set(currentSession.presentStudentIds || []);

    return students
      .filter(s => enrolledIds.has(s.id))
      .filter(s => {
        if (attendanceStatusFilter === 'present' && !presentIds.has(s.id)) return false;
        if (attendanceStatusFilter === 'absent' && presentIds.has(s.id)) return false;
        if (!attendanceSearch.trim()) return true;
        const q = attendanceSearch.trim().toLowerCase();
        return (
          (s.lastName || '').toLowerCase().includes(q) ||
          (s.firstName || '').toLowerCase().includes(q) ||
          (s.classGroup || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const clsCmp = (a.classGroup || '').localeCompare(b.classGroup || '');
        if (clsCmp !== 0) return clsCmp;
        return (a.lastName || '').localeCompare(b.lastName || '');
      });
  }, [currentSession, students, attendanceStatusFilter, attendanceSearch]);

  // Candidate students for direct addition
  const nonEnrolledCandidates = useMemo(() => {
    if (!currentSession || !addSearch.trim()) return [];
    const enrolledIds = new Set(currentSession.enrolledStudentIds || []);
    const q = addSearch.trim().toLowerCase();

    return students
      .filter(s => !enrolledIds.has(s.id))
      .filter(s => 
        (s.lastName || '').toLowerCase().includes(q) ||
        (s.firstName || '').toLowerCase().includes(q) ||
        (s.classGroup || '').toLowerCase().includes(q)
      )
      .slice(0, 15);
  }, [currentSession, students, addSearch]);

  if (!isOpen || !currentSession) return null;

  const enrolledCount = currentSession.enrolledStudentIds?.length || 0;
  const presentCount = currentSession.presentStudentIds?.length || 0;
  const absentCount = Math.max(0, enrolledCount - presentCount);
  const presentPercent = enrolledCount > 0 ? Math.round((presentCount / enrolledCount) * 100) : 0;
  const isToday = currentSession.date === todayStr;
  const isPast = (currentSession.date || '') < todayStr;
  const dayName = getSessionDayName(currentSession.date);
  const isSoir = getSessionCategory(currentSession) === 'as_soir';

  // Toggle pointage présence d'un élève
  const handleToggleAttendance = async (studentId: string) => {
    const presentSet = new Set(currentSession.presentStudentIds || []);
    const willBePresent = !presentSet.has(studentId);

    if (willBePresent) {
      presentSet.add(studentId);
    } else {
      presentSet.delete(studentId);
    }

    const newPresentIds = Array.from(presentSet);
    const updated: Session = {
      ...currentSession,
      presentStudentIds: newPresentIds,
    };

    setCurrentSession(updated);
    if (onSessionUpdated) onSessionUpdated(updated);

    try {
      await saveSessionApi({
        ...updated,
        id: updated.id,
      });
    } catch (err) {
      console.error("Erreur sauvegarde présence:", err);
    }
  };

  // Pointer tous les inscrits présents
  const handleMarkAllPresent = async () => {
    if (!currentSession.enrolledStudentIds || currentSession.enrolledStudentIds.length === 0) return;
    const allIds = [...currentSession.enrolledStudentIds];

    const updated: Session = {
      ...currentSession,
      presentStudentIds: allIds,
    };

    setCurrentSession(updated);
    if (onSessionUpdated) onSessionUpdated(updated);
    setNotification(`✅ Tous les ${allIds.length} élèves sont pointés présents.`);

    try {
      await saveSessionApi({
        ...updated,
        id: updated.id,
      });
    } catch (err) {
      console.error(err);
    }
  };

  // Réinitialiser (tous absents)
  const handleMarkAllAbsent = async () => {
    if (!confirm("Voulez-vous réinitialiser le pointage et marquer tous les élèves absents ?")) return;

    const updated: Session = {
      ...currentSession,
      presentStudentIds: [],
    };

    setCurrentSession(updated);
    if (onSessionUpdated) onSessionUpdated(updated);
    setNotification("Pointage réinitialisé (tous absents).");

    try {
      await saveSessionApi({
        ...updated,
        id: updated.id,
      });
    } catch (err) {
      console.error(err);
    }
  };

  // Inscrire et pointer présent directement en 1 clic
  const handleDirectAddAndMarkPresent = async (student: Student) => {
    const enrolledSet = new Set(currentSession.enrolledStudentIds || []);
    const presentSet = new Set(currentSession.presentStudentIds || []);

    enrolledSet.add(student.id);
    presentSet.add(student.id);

    const updated: Session = {
      ...currentSession,
      enrolledStudentIds: Array.from(enrolledSet),
      presentStudentIds: Array.from(presentSet),
    };

    setCurrentSession(updated);
    if (onSessionUpdated) onSessionUpdated(updated);
    setNotification(`✅ ${student.lastName} ${student.firstName} inscrit et pointé présent !`);
    setAddSearch('');

    try {
      await saveSessionApi({
        ...updated,
        id: updated.id,
      });
    } catch (err) {
      console.error(err);
    }
  };

  // Retirer un élève de la séance
  const handleRemoveStudent = async (studentId: string) => {
    const enrolledSet = new Set(currentSession.enrolledStudentIds || []);
    const presentSet = new Set(currentSession.presentStudentIds || []);

    enrolledSet.delete(studentId);
    presentSet.delete(studentId);

    const updated: Session = {
      ...currentSession,
      enrolledStudentIds: Array.from(enrolledSet),
      presentStudentIds: Array.from(presentSet),
    };

    setCurrentSession(updated);
    if (onSessionUpdated) onSessionUpdated(updated);

    try {
      await saveSessionApi({
        ...updated,
        id: updated.id,
      });
    } catch (err) {
      console.error(err);
    }
  };

  // Promouvoir un élève de la liste d'attente vers les inscrits
  const handlePromoteWaitlistStudent = async (studentId: string) => {
    if (!currentSession) return;
    try {
      await promoteFromWaitlistApi(currentSession.id, studentId);
      const updatedWaitlist = (currentSession.waitlistStudentIds || []).filter(id => id !== studentId);
      const updatedEnrolled = Array.from(new Set([...(currentSession.enrolledStudentIds || []), studentId]));
      const updated: Session = {
        ...currentSession,
        waitlistStudentIds: updatedWaitlist,
        enrolledStudentIds: updatedEnrolled
      };
      setCurrentSession(updated);
      if (onSessionUpdated) onSessionUpdated(updated);
      setNotification(`✅ Élève promu de la liste d'attente vers les inscrits !`);
    } catch (err: any) {
      console.error(err);
      alert(err?.message || "Erreur lors de la promotion.");
    }
  };

  // Retirer un élève de la liste d'attente
  const handleRemoveFromWaitlist = async (studentId: string) => {
    if (!currentSession) return;
    try {
      await leaveSessionWaitlistApi(currentSession.id, studentId);
      const updatedWaitlist = (currentSession.waitlistStudentIds || []).filter(id => id !== studentId);
      const updated: Session = {
        ...currentSession,
        waitlistStudentIds: updatedWaitlist
      };
      setCurrentSession(updated);
      if (onSessionUpdated) onSessionUpdated(updated);
    } catch (err) {
      console.error(err);
    }
  };

  // Partager le lien d'inscription
  const handleShareLink = async () => {
    const url = `${window.location.origin}?enroll=${encodeURIComponent(currentSession.id)}`;
    if (navigator.share && /mobile|android|iphone/i.test(navigator.userAgent.toLowerCase())) {
      try {
        await navigator.share({
          title: `Inscription AS - ${currentSession.name}`,
          text: `Inscris-toi directement pour ${currentSession.name} (AS Rosa Parks) :`,
          url,
        });
        return;
      } catch (err: any) {
        if (err.name === 'AbortError') return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
      setNotification("Lien d'inscription copié !");
    } catch {
      prompt("Copiez ce lien d'inscription directe :", url);
    }
  };

  // Imprimer la feuille d'appel
  const handlePrint = () => {
    const enrolledIds = currentSession.enrolledStudentIds || [];
    const presentSet = new Set(currentSession.presentStudentIds || []);
    const sessionStudents = students.filter(s => enrolledIds.includes(s.id));

    const dateFormatted = currentSession.date
      ? new Date(currentSession.date + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      : '';

    const printWin = window.open('', '', 'height=750,width=900');
    if (!printWin) return;

    printWin.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Feuille d'appel - ${currentSession.name}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 25px; color: #0f172a; }
          .header { text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 15px; }
          .header h1 { margin: 0; font-size: 20px; font-weight: 800; text-transform: uppercase; }
          .header h2 { margin: 4px 0 0 0; font-size: 14px; font-weight: 600; color: #475569; }
          .meta { display: flex; justify-content: space-between; margin-bottom: 15px; font-size: 13px; font-weight: 600; background: #f8fafc; padding: 10px 14px; border-radius: 6px; border: 1px solid #e2e8f0; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 10px; }
          th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; }
          th { background-color: #f1f5f9; font-weight: bold; text-transform: uppercase; font-size: 11px; }
          .badge { padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 10px; }
          .present { background: #d1fae5; color: #065f46; }
          .absent { background: #f1f5f9; color: #64748b; }
          @media print {
            body { padding: 0; }
            @page { margin: 1cm; size: A4 portrait; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>ASSOCIATION SPORTIVE LYCÉE ROSA PARKS • UNSS</h1>
          <h2>Feuille d'Émargement & Pointage d'Appel — ${activeYear}</h2>
        </div>
        <div class="meta">
          <div>
            <strong>Séance :</strong> ${currentSession.name}<br/>
            <strong>Date :</strong> ${dateFormatted}
          </div>
          <div>
            <strong>Horaire :</strong> ${currentSession.time}${currentSession.endTime ? ` - ${currentSession.endTime}` : ''}<br/>
            <strong>Lieu :</strong> ${currentSession.location || 'Non précisé'}
          </div>
          <div>
            <strong>Inscrits :</strong> ${sessionStudents.length}<br/>
            <strong>Présents :</strong> ${presentSet.size} / ${sessionStudents.length}
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th style="width: 35px; text-align: center;">N°</th>
              <th>Nom</th>
              <th>Prénom</th>
              <th style="width: 70px; text-align: center;">Classe</th>
              <th style="width: 70px; text-align: center;">Cotisation</th>
              <th style="width: 70px; text-align: center;">AP</th>
              <th style="width: 70px; text-align: center;">Droit Image</th>
              <th style="width: 70px; text-align: center;">Nage</th>
              <th style="width: 85px; text-align: center;">Pointage</th>
              <th style="width: 120px;">Signature élève</th>
            </tr>
          </thead>
          <tbody>
            ${sessionStudents.map((s, idx) => `
              <tr>
                <td style="text-align: center; color: #64748b;">${idx + 1}</td>
                <td style="font-weight: bold;">${(s.lastName || '').toUpperCase()}</td>
                <td>${s.firstName || ''}</td>
                <td style="text-align: center; font-weight: 600;">${s.classGroup || ''}</td>
                <td style="text-align: center;">${String(s.paid).toUpperCase() === 'OUI' ? 'Payé ✓' : 'Non payé'}</td>
                <td style="text-align: center; color: ${s.parentalAuth === 'OUI' ? '#16a34a' : '#dc2626'}; font-weight: bold;">${s.parentalAuth === 'OUI' ? '✓' : '✗'}</td>
                <td style="text-align: center; color: ${s.imageRights === 'OUI' ? '#16a34a' : '#d97706'}; font-weight: bold;">${s.imageRights === 'OUI' ? '✓' : '✗'}</td>
                <td style="text-align: center; color: ${s.swimmingCertificate === 'OUI' ? '#0284c7' : '#64748b'}; font-weight: bold;">${s.swimmingCertificate === 'OUI' ? '✓' : '✗'}</td>
                <td style="text-align: center;">
                  ${presentSet.has(s.id) ? '<span class="badge present">PRÉSENT ✓</span>' : '<span class="badge absent">ABSENT</span>'}
                </td>
                <td></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <script>
          window.onload = function() { window.print(); window.close(); }
        </script>
      </body>
      </html>
    `);
    printWin.document.close();
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 lg:p-6 overflow-y-auto animate-in fade-in duration-200"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Toast notification inside modal */}
      {notification && (
        <div className="fixed top-6 right-6 z-60 bg-slate-900 text-white px-4 py-2.5 rounded-2xl shadow-2xl text-xs font-black flex items-center gap-2 border border-slate-700 animate-in slide-in-from-top-2">
          <span>{notification}</span>
        </div>
      )}

      {/* ENCADRÉ MODAL PRINCIPAL */}
      <div 
        className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 relative"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-session-title"
      >
        {/* En-tête de l'encadré */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-4 sm:p-6 border-b border-indigo-900/40 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-1.5">
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-300" />
                  <span>Feuille d'appel & Pointage</span>
                </span>

                {isSoir ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-200 border border-purple-400/30 flex items-center gap-1">
                    <Moon className="w-3 h-3 text-purple-300" />
                    <span>AS du Soir</span>
                  </span>
                ) : (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-200 border border-blue-400/30 flex items-center gap-1">
                    <Zap className="w-3 h-3 text-blue-300" />
                    <span>Mercredi</span>
                  </span>
                )}

                {isToday && (
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500 text-white shadow-xs">
                    Aujourd'hui
                  </span>
                )}

                {isPast && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-700 text-slate-300">
                    Séance passée
                  </span>
                )}
              </div>

              <h2 id="modal-session-title" className="text-xl sm:text-2xl font-black tracking-tight truncate text-white">
                {currentSession.name}
              </h2>

              <p className="text-xs sm:text-sm font-semibold text-slate-300 flex items-center gap-2 flex-wrap mt-1">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-indigo-300" />
                  <span>{dayName} {currentSession.date ? new Date(currentSession.date + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}</span>
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-indigo-300" />
                  <span>{currentSession.time}{currentSession.endTime ? ` - ${currentSession.endTime}` : ''}</span>
                </span>
                {currentSession.location && (
                  <>
                    <span>•</span>
                    <span className="text-indigo-200 truncate">📍 {currentSession.location}</span>
                  </>
                )}
              </p>
            </div>

            {/* Boutons d'action dans l'en-tête & Bouton Fermer */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleShareLink}
                className={`p-2 sm:px-3 sm:py-2 rounded-xl text-xs font-bold transition-all border flex items-center gap-1.5 cursor-pointer ${
                  copiedLink
                    ? 'bg-emerald-600 text-white border-emerald-500'
                    : 'bg-white/10 hover:bg-white/20 text-white border-white/15'
                }`}
                title="Copier le lien d'inscription pour les élèves"
              >
                {copiedLink ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4 text-indigo-200" />}
                <span className="hidden sm:inline">Lien élève</span>
              </button>

              <button
                type="button"
                onClick={handlePrint}
                className="p-2 sm:px-3 sm:py-2 bg-white/10 hover:bg-white/20 text-white border border-white/15 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                title="Imprimer la feuille d'appel"
              >
                <Printer className="w-4 h-4 text-indigo-200" />
                <span className="hidden sm:inline">Imprimer</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="p-2 bg-white/10 hover:bg-white/25 active:scale-95 text-white rounded-xl transition-all cursor-pointer ml-1"
                title="Fermer l'encadré (Échap)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Corps déroulant de l'encadré */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-slate-50/50">
          {/* BANDEAU DE STATISTIQUES & POINTAGE GLOBAL */}
          <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-indigo-50 border border-emerald-200 rounded-2xl p-4 sm:p-5 space-y-3 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-black text-sm shrink-0 shadow-sm">
                  {presentPercent}%
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl sm:text-2xl font-black text-emerald-950">
                      {presentCount} / {enrolledCount} présents
                    </span>
                    <span className="text-xs font-bold text-slate-500">
                      ({absentCount} absent{absentCount > 1 ? 's' : ''})
                    </span>
                  </div>
                  <p className="text-[11px] text-emerald-800 font-semibold">
                    Cliquez sur un élève pour basculer son statut Présent / Absent en direct.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleMarkAllPresent}
                  disabled={enrolledCount === 0}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black rounded-xl text-xs transition-all shadow-xs disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Tout pointer présent</span>
                </button>
                <button
                  type="button"
                  onClick={handleMarkAllAbsent}
                  disabled={presentCount === 0}
                  className="px-3 py-2 bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 font-bold rounded-xl text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  Réinitialiser
                </button>
              </div>
            </div>

            {/* Jauge visuelle */}
            <div className="w-full bg-emerald-200/60 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-emerald-600 h-full rounded-full transition-all duration-300 shadow-inner"
                style={{ width: `${presentPercent}%` }}
              />
            </div>
          </div>

          {/* BARRE D'OUTILS : FILTRES, RECHERCHE & BOUTON AJOUT ÉLÈVE */}
          <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-2.5">
            <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-bold border border-slate-200 shrink-0">
              <button
                type="button"
                onClick={() => setAttendanceStatusFilter('all')}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  attendanceStatusFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Tous ({enrolledCount})
              </button>
              <button
                type="button"
                onClick={() => setAttendanceStatusFilter('present')}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  attendanceStatusFilter === 'present' ? 'bg-emerald-600 text-white shadow-xs' : 'text-emerald-700 hover:bg-emerald-50'
                }`}
              >
                Présents ({presentCount})
              </button>
              <button
                type="button"
                onClick={() => setAttendanceStatusFilter('absent')}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  attendanceStatusFilter === 'absent' ? 'bg-rose-600 text-white shadow-xs' : 'text-rose-700 hover:bg-rose-50'
                }`}
              >
                Absents ({absentCount})
              </button>
            </div>

            <div className="relative flex-1 max-w-md">
              <input
                type="text"
                placeholder="Filtrer un inscrit (nom, prénom, classe)..."
                value={attendanceSearch}
                onChange={e => setAttendanceSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            <button
              type="button"
              onClick={() => setIsAddOpen(prev => !prev)}
              className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0 border ${
                isAddOpen 
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs' 
                  : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200'
              }`}
            >
              <PlusCircle className="w-4 h-4" />
              <span>{isAddOpen ? 'Fermer ajout direct' : '+ Ajouter un élève'}</span>
            </button>
          </div>

          {/* ENCADRÉ D'AJOUT DIRECT D'UN ÉLÈVE NON INSCRIT */}
          {isAddOpen && (
            <div className="p-4 sm:p-5 bg-indigo-50/80 border-2 border-indigo-300 rounded-2xl space-y-3 animate-in fade-in slide-in-from-top-2">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-indigo-950 flex items-center gap-1.5">
                    <UserCheck className="w-4 h-4 text-indigo-600" />
                    <span>Inscrire un élève de l'établissement à cette séance</span>
                  </h4>
                  <p className="text-[11px] text-indigo-800 font-medium">
                    Recherchez l'élève par son nom, prénom ou sa classe pour l'inscrire et le pointer immédiatement présent en 1 seul clic.
                  </p>
                </div>
              </div>

              <div className="relative">
                <input
                  type="text"
                  placeholder="Rechercher un élève de l'établissement (ex: Martin, 6B, Dupont)..."
                  value={addSearch}
                  onChange={e => setAddSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 bg-white border border-indigo-300 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                  autoFocus
                />
                <Search className="w-4 h-4 text-indigo-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              {nonEnrolledCandidates.length > 0 && (
                <div className="bg-white rounded-xl border border-indigo-200 divide-y divide-slate-100 max-h-60 overflow-y-auto shadow-xs">
                  {nonEnrolledCandidates.map(candidate => (
                    <div
                      key={candidate.id}
                      className="p-3 flex items-center justify-between gap-2.5 hover:bg-indigo-50/50 transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 text-xs sm:text-sm truncate flex items-center gap-2">
                          <span>{candidate.lastName} {candidate.firstName}</span>
                          <span className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-semibold">
                            {candidate.classGroup || 'Sans classe'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-slate-500 font-semibold mt-0.5">
                          <span>AP: {candidate.parentalAuth === 'OUI' ? '✓ Validée' : '✗ Manquante'}</span>
                          <span>•</span>
                          <span>Cotisation: {candidate.paid === 'OUI' ? '✓ Payée' : '✗ Non'}</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDirectAddAndMarkPresent(candidate)}
                        className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Inscrire & Présent ✓</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {addSearch.trim() && nonEnrolledCandidates.length === 0 && (
                <p className="text-xs text-indigo-800 italic text-center py-2 bg-white/60 rounded-xl">
                  Aucun élève correspondant trouvé dans l'établissement.
                </p>
              )}
            </div>
          )}

          {/* LISTE DES ÉLÈVES INSCRITS AVEC BOUTONS D'APPEL */}
          <div className="space-y-2">
            {enrolledStudents.map(s => {
              const isPresent = (currentSession.presentStudentIds || []).includes(s.id);
              const isAuth = String(s.parentalAuth).toUpperCase() === 'OUI';
              const isImage = String(s.imageRights).toUpperCase() === 'OUI';
              const isSwim = String(s.swimmingCertificate).toUpperCase() === 'OUI';
              const isPaid = String(s.paid).toUpperCase() === 'OUI';

              return (
                <div
                  key={s.id}
                  onClick={() => handleToggleAttendance(s.id)}
                  className={`flex items-center justify-between p-3 sm:p-3.5 rounded-2xl border transition-all cursor-pointer ${
                    isPresent
                      ? 'bg-emerald-50/90 border-emerald-300 shadow-2xs ring-1 ring-emerald-300'
                      : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="min-w-0">
                      <div className="font-black text-slate-900 text-sm sm:text-base flex items-center gap-1.5 flex-wrap leading-tight">
                        <span className="truncate">{s.lastName} {s.firstName}</span>
                        {isPresent && (
                          <span className="bg-emerald-200 text-emerald-950 text-[10px] font-black px-1.5 py-0.2 rounded uppercase">
                            Présent ✓
                          </span>
                        )}
                        <span className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-bold">
                          {s.classGroup || 'Sans classe'}
                        </span>
                      </div>

                      {/* Indicateurs de validation demandés (AP, Droit image, Savoir nager, Cotisation) */}
                      <div className="flex items-center gap-2 flex-wrap mt-1 text-[11px] font-semibold">
                        {isAuth ? (
                          <span className="text-emerald-700 flex items-center gap-0.5" title="Autorisation parentale validée">
                            <span>AP ✓</span>
                          </span>
                        ) : (
                          <span className="text-rose-600 font-bold flex items-center gap-0.5" title="Autorisation parentale manquante">
                            <span>AP ✗</span>
                          </span>
                        )}

                        <span className="text-slate-300">•</span>

                        {isImage ? (
                          <span className="text-emerald-700 flex items-center gap-0.5" title="Droit à l'image validé">
                            <span>Image ✓</span>
                          </span>
                        ) : (
                          <span className="text-amber-700 font-bold flex items-center gap-0.5" title="Droit à l'image refusé / non validé">
                            <span>Image ✗</span>
                          </span>
                        )}

                        <span className="text-slate-300">•</span>

                        {isSwim ? (
                          <span className="text-sky-700 flex items-center gap-0.5" title="Savoir nager validé">
                            <span>Nage ✓</span>
                          </span>
                        ) : (
                          <span className="text-slate-500 flex items-center gap-0.5" title="Savoir nager non validé">
                            <span>Nage ✗</span>
                          </span>
                        )}

                        <span className="text-slate-300">•</span>

                        {isPaid ? (
                          <span className="text-emerald-700 flex items-center gap-0.5" title="Cotisation réglée">
                            <span>Cotis. ✓</span>
                          </span>
                        ) : (
                          <span className="text-rose-600 font-bold flex items-center gap-0.5" title="Cotisation non payée">
                            <span>Cotis. ✗</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {/* GRAND BOUTON TACTILE ERGONOMIQUE */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleAttendance(s.id);
                      }}
                      className={`h-11 sm:h-12 px-3.5 sm:px-5 rounded-xl font-black text-xs sm:text-sm flex items-center gap-2 transition-all active:scale-95 cursor-pointer shadow-xs ${
                        isPresent
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200 ring-2 ring-emerald-400'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300'
                      }`}
                    >
                      {isPresent ? (
                        <>
                          <CheckCircle2 className="w-5 h-5 text-white" />
                          <span>Présent ✓</span>
                        </>
                      ) : (
                        <>
                          <Circle className="w-5 h-5 text-slate-400" />
                          <span>Absent</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Désinscrire ${s.lastName} ${s.firstName} de cette séance ?`)) {
                          handleRemoveStudent(s.id);
                        }
                      }}
                      className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer text-xs"
                      title="Désinscrire de cette séance"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}

            {enrolledCount === 0 && (
              <div className="p-8 sm:p-10 text-center space-y-3 bg-white rounded-2xl border border-dashed border-slate-200">
                <Users className="w-10 h-10 text-slate-300 mx-auto" />
                <h4 className="font-bold text-slate-700 text-sm">Aucun élève inscrit sur ce créneau</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Cliquez sur « + Ajouter un élève » ci-dessus pour rechercher et inscrire directement les élèves qui se présentent.
                </p>
                <button
                  type="button"
                  onClick={() => setIsAddOpen(true)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs shadow-sm transition-all cursor-pointer"
                >
                  + Inscrire un élève maintenant
                </button>
              </div>
            )}

            {enrolledCount > 0 && enrolledStudents.length === 0 && (
              <p className="text-center text-slate-400 py-8 text-xs italic bg-white rounded-2xl border border-slate-100">
                Aucun élève ne correspond aux critères de recherche actuels.
              </p>
            )}
          </div>

          {/* SECTION DÉDIÉE : LISTE D'ATTENTE DE LA SÉANCE */}
          <div className="bg-purple-50/80 border-2 border-purple-300 rounded-2xl p-4 sm:p-5 space-y-3.5 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-700 text-white flex items-center justify-center font-black text-sm shrink-0 shadow-xs">
                  <Hourglass className="w-5 h-5 text-purple-200" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-black text-purple-950 text-sm sm:text-base">
                      Liste d'attente
                    </h3>
                    <span className="bg-purple-200 text-purple-900 text-xs font-black px-2 py-0.5 rounded-full border border-purple-300">
                      {(currentSession.waitlistStudentIds || []).length} élève(s)
                    </span>
                  </div>
                  <p className="text-[11px] text-purple-800 font-medium">
                    Élèves pré-inscrits lorsque la séance était complète. Vous pouvez les promouvoir ou créer un nouveau créneau dédoublé.
                  </p>
                </div>
              </div>

              {/* Bouton clé : Créer une autre séance sur un autre jour à partir de cette liste d'attente */}
              <button
                type="button"
                onClick={() => setIsGenerateModalOpen(true)}
                disabled={(currentSession.waitlistStudentIds || []).length === 0}
                className="px-4 py-2.5 bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-800 hover:to-indigo-800 active:scale-95 text-white font-black text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                title="Générer une nouvelle séance sur un autre jour avec les élèves de la liste d'attente"
              >
                <Sparkles className="w-4 h-4 text-purple-200" />
                <span>+ Générer une séance depuis cette liste</span>
              </button>
            </div>

            {/* Liste des élèves en attente */}
            {(currentSession.waitlistStudentIds || []).length === 0 ? (
              <p className="text-xs text-purple-700/80 italic py-3 text-center bg-white/70 rounded-xl border border-purple-200">
                Aucun élève en liste d'attente actuellement sur cette séance.
              </p>
            ) : (
              <div className="bg-white rounded-xl border border-purple-200 divide-y divide-purple-100 max-h-56 overflow-y-auto shadow-2xs">
                {(currentSession.waitlistStudentIds || []).map((studentId, idx) => {
                  const student = students.find(s => s.id === studentId);
                  const isAuth = String(student?.parentalAuth).toUpperCase() === 'OUI';
                  const isPaid = String(student?.paid).toUpperCase() === 'OUI';

                  return (
                    <div
                      key={studentId}
                      className="p-3 flex items-center justify-between gap-3 hover:bg-purple-50/40 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-[11px] font-black w-6 h-6 rounded-full bg-purple-100 text-purple-800 flex items-center justify-center shrink-0">
                          #{idx + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="font-black text-slate-900 text-xs sm:text-sm truncate flex items-center gap-2">
                            <span>{student ? `${student.lastName} ${student.firstName}` : studentId}</span>
                            {student?.classGroup && (
                              <span className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-bold">
                                {student.classGroup}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-slate-500 font-medium mt-0.5">
                            <span>AP: {isAuth ? '✓' : '✗'}</span>
                            <span>•</span>
                            <span>Cotisation: {isPaid ? '✓' : '✗'}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handlePromoteWaitlistStudent(studentId)}
                          className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-2xs flex items-center gap-1 cursor-pointer"
                          title="Promouvoir dans la liste principale des inscrits"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Promouvoir inscrit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm(`Retirer cet élève de la liste d'attente ?`)) {
                              handleRemoveFromWaitlist(studentId);
                            }
                          }}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title="Retirer de la liste d'attente"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Modal de dédoublement de séance */}
        <GenerateSessionFromWaitlistModal
          session={currentSession}
          isOpen={isGenerateModalOpen}
          onClose={() => setIsGenerateModalOpen(false)}
          students={students}
          teachers={teachersList}
          onSessionCreated={(newId) => {
            setNotification('🎉 Nouvelle séance créée avec succès sur un autre jour à partir de la liste d\'attente !');
            if (onNewSessionCreated) onNewSessionCreated(newId);
          }}
        />

        {/* Pied de l'encadré */}
        <div className="p-3 sm:p-4 bg-slate-100 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-600 font-semibold flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
            <span>Enregistrement automatique et instantané</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-black rounded-xl transition-all shadow-xs cursor-pointer"
          >
            Fermer l'encadré
          </button>
        </div>
      </div>
    </div>
  );
};

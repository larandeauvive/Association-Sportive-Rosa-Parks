import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Student, Session } from '../types';
import { getSessionsList, saveSessionApi } from '../lib/db';
import { getSessionDayName, getSessionCategory } from '../lib/sessionUtils';
import { 
  Calendar, CheckCircle2, Circle, Users, PlusCircle, Search, 
  Printer, Share2, Check, Moon, Zap, Activity, Clock, 
  AlertCircle, Lock, UserCheck, RefreshCw, ChevronDown
} from 'lucide-react';

interface Props {
  students: Student[];
  activeYear: string;
}

export const TeacherRollCall: React.FC<Props> = ({ students, activeYear }) => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [notification, setNotification] = useState<string | null>(null);

  // Filtres pour restreindre le menu déroulant si nécessaire
  const [slotFilter, setSlotFilter] = useState<string>('all');
  const [titleFilter, setTitleFilter] = useState<string>('all');

  // Filtres internes au pointage d'appel de la séance sélectionnée
  const [attendanceSearch, setAttendanceSearch] = useState<string>('');
  const [attendanceStatusFilter, setAttendanceStatusFilter] = useState<'all' | 'present' | 'absent'>('all');

  // Recherche pour ajout direct d'élève non inscrit
  const [addSearch, setAddSearch] = useState<string>('');
  const [isAddOpen, setIsAddOpen] = useState<boolean>(false);

  const todayStr = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }, []);

  // Notification temporaire
  useEffect(() => {
    if (!notification) return;
    const t = setTimeout(() => setNotification(null), 3500);
    return () => clearTimeout(t);
  }, [notification]);

  // Chargement des séances
  const loadSessions = useCallback(async () => {
    setIsLoading(true);
    try {
      const list = await getSessionsList(activeYear);
      // Tri chronologique : plus proches d'abord
      list.sort((a, b) => {
        const dCmp = (a.date || '').localeCompare(b.date || '');
        if (dCmp !== 0) return dCmp;
        return (a.time || '').localeCompare(b.time || '');
      });
      setSessions(list);

      // Présélectionner automatiquement la séance du jour ou la plus proche à venir
      if (list.length > 0) {
        setSelectedSessionId(prev => {
          if (prev && list.some(s => s.id === prev)) return prev;
          const todaySess = list.find(s => s.date === todayStr);
          if (todaySess) return todaySess.id;
          const upcomingSess = list.find(s => (s.date || '') >= todayStr);
          if (upcomingSess) return upcomingSess.id;
          return list[0].id;
        });
      }
    } catch (e) {
      console.error("Erreur chargement séances:", e);
    } finally {
      setIsLoading(false);
    }
  }, [activeYear, todayStr]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Liste des intitulés uniques
  const uniqueTitles = useMemo(() => {
    const set = new Set<string>();
    sessions.forEach(s => {
      if (s.name?.trim()) set.add(s.name.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'));
  }, [sessions]);

  // Séances filtrées pour le menu déroulant
  const filteredSessions = useMemo(() => {
    return sessions.filter(s => {
      // 1. Filtre intitulé
      if (titleFilter !== 'all' && (s.name || '').trim().toLowerCase() !== titleFilter.trim().toLowerCase()) {
        return false;
      }
      // 2. Filtre créneau
      if (slotFilter !== 'all') {
        const cat = getSessionCategory(s);
        const dayName = getSessionDayName(s.date).toLowerCase();
        if (slotFilter === 'as_soir' && cat !== 'as_soir') return false;
        if (slotFilter === 'mardi' && dayName !== 'mardi') return false;
        if (slotFilter === 'jeudi' && dayName !== 'jeudi') return false;
        if (slotFilter === 'mercredi' && dayName !== 'mercredi') return false;
      }
      return true;
    });
  }, [sessions, titleFilter, slotFilter]);

  // Séance sélectionnée
  const currentSession = useMemo(() => {
    return sessions.find(s => s.id === selectedSessionId) || null;
  }, [sessions, selectedSessionId]);

  // Si le filtre rend la sélection actuelle invisible, réajuster
  useEffect(() => {
    if (filteredSessions.length > 0) {
      if (!filteredSessions.some(s => s.id === selectedSessionId)) {
        const todayMatch = filteredSessions.find(s => s.date === todayStr);
        if (todayMatch) setSelectedSessionId(todayMatch.id);
        else setSelectedSessionId(filteredSessions[0].id);
      }
    }
  }, [filteredSessions, selectedSessionId, todayStr]);

  // Élèves inscrits à la séance sélectionnée
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

  // Élèves pour ajout direct (non inscrits)
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

  // Toggle pointage présence d'un élève
  const handleToggleAttendance = async (studentId: string) => {
    if (!currentSession) return;
    const presentSet = new Set(currentSession.presentStudentIds || []);
    const willBePresent = !presentSet.has(studentId);

    if (willBePresent) {
      presentSet.add(studentId);
    } else {
      presentSet.delete(studentId);
    }

    const newPresentIds = Array.from(presentSet);

    // Mise à jour optimiste immédiate
    setSessions(prev => prev.map(s => s.id === currentSession.id ? {
      ...s,
      presentStudentIds: newPresentIds
    } : s));

    try {
      await saveSessionApi({
        ...currentSession,
        id: currentSession.id,
        presentStudentIds: newPresentIds
      });
    } catch (err) {
      console.error("Erreur sauvegarde présence:", err);
    }
  };

  // Pointer tous les inscrits présents
  const handleMarkAllPresent = async () => {
    if (!currentSession || !currentSession.enrolledStudentIds || currentSession.enrolledStudentIds.length === 0) return;
    const allIds = [...currentSession.enrolledStudentIds];

    setSessions(prev => prev.map(s => s.id === currentSession.id ? {
      ...s,
      presentStudentIds: allIds
    } : s));

    setNotification(`✅ Tous les ${allIds.length} élèves inscrits sont pointés présents.`);

    try {
      await saveSessionApi({
        ...currentSession,
        id: currentSession.id,
        presentStudentIds: allIds
      });
    } catch (err) {
      console.error(err);
    }
  };

  // Réinitialiser (tous absents)
  const handleMarkAllAbsent = async () => {
    if (!currentSession) return;
    if (!confirm("Voulez-vous réinitialiser le pointage et marquer tous les élèves absents ?")) return;

    setSessions(prev => prev.map(s => s.id === currentSession.id ? {
      ...s,
      presentStudentIds: []
    } : s));

    setNotification("Pointage réinitialisé (tous absents).");

    try {
      await saveSessionApi({
        ...currentSession,
        id: currentSession.id,
        presentStudentIds: []
      });
    } catch (err) {
      console.error(err);
    }
  };

  // Inscrire et pointer présent directement en 1 clic
  const handleDirectAddAndMarkPresent = async (student: Student) => {
    if (!currentSession) return;
    const enrolledSet = new Set(currentSession.enrolledStudentIds || []);
    const presentSet = new Set(currentSession.presentStudentIds || []);

    enrolledSet.add(student.id);
    presentSet.add(student.id);

    const newEnrolledIds = Array.from(enrolledSet);
    const newPresentIds = Array.from(presentSet);

    // Optimiste
    setSessions(prev => prev.map(s => s.id === currentSession.id ? {
      ...s,
      enrolledStudentIds: newEnrolledIds,
      presentStudentIds: newPresentIds
    } : s));

    setNotification(`✅ ${student.lastName} ${student.firstName} inscrit et pointé présent !`);
    setAddSearch('');

    try {
      await saveSessionApi({
        ...currentSession,
        id: currentSession.id,
        enrolledStudentIds: newEnrolledIds,
        presentStudentIds: newPresentIds
      });
    } catch (err) {
      console.error(err);
    }
  };

  // Retirer un élève de la séance
  const handleRemoveStudent = async (studentId: string) => {
    if (!currentSession) return;
    const enrolledSet = new Set(currentSession.enrolledStudentIds || []);
    const presentSet = new Set(currentSession.presentStudentIds || []);

    enrolledSet.delete(studentId);
    presentSet.delete(studentId);

    const newEnrolledIds = Array.from(enrolledSet);
    const newPresentIds = Array.from(presentSet);

    setSessions(prev => prev.map(s => s.id === currentSession.id ? {
      ...s,
      enrolledStudentIds: newEnrolledIds,
      presentStudentIds: newPresentIds
    } : s));

    try {
      await saveSessionApi({
        ...currentSession,
        id: currentSession.id,
        enrolledStudentIds: newEnrolledIds,
        presentStudentIds: newPresentIds
      });
    } catch (err) {
      console.error(err);
    }
  };

  // Partager le lien d'inscription
  const handleShareLink = async () => {
    if (!currentSession) return;
    const url = `${window.location.origin}?enroll=${encodeURIComponent(currentSession.id)}`;
    if (navigator.share && /mobile|android|iphone/i.test(navigator.userAgent.toLowerCase())) {
      try {
        await navigator.share({
          title: `Inscription AS - ${currentSession.name}`,
          text: `Inscris-toi directement pour ${currentSession.name} (AS Rosa Parks) :`,
          url
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
      setNotification("Lien d'inscription copié dans le presse-papier !");
    } catch {
      prompt("Copiez ce lien d'inscription directe :", url);
    }
  };

  // Imprimer la feuille d'appel
  const handlePrint = () => {
    if (!currentSession) return;
    const enrolledIds = currentSession.enrolledStudentIds || [];
    const presentSet = new Set(currentSession.presentStudentIds || []);
    const sessionStudents = students.filter(s => enrolledIds.includes(s.id));

    const dayName = getSessionDayName(currentSession.date);
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
              <th style="width: 85px; text-align: center;">Pointage</th>
              <th style="width: 140px;">Signature élève</th>
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

  const enrolledCount = currentSession?.enrolledStudentIds?.length || 0;
  const presentCount = currentSession?.presentStudentIds?.length || 0;
  const absentCount = Math.max(0, enrolledCount - presentCount);
  const presentPercent = enrolledCount > 0 ? Math.round((presentCount / enrolledCount) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Toast notification */}
      {notification && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-xl text-xs font-bold flex items-center gap-2 border border-slate-700 animate-in fade-in slide-in-from-bottom-2">
          <span>{notification}</span>
        </div>
      )}

      {/* BANDEAU SUPÉRIEUR : CHOIX DE LA SÉANCE DANS LE MENU DÉROULANT */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl shadow-sm border border-slate-200 space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div>
            <h2 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-emerald-100 text-emerald-800">
                <CheckCircle2 className="w-4 h-4" />
              </span>
              <span>Pointage d'Appel en Direct</span>
            </h2>
            <p className="text-xs text-slate-500 font-medium">
              Sélectionnez une séance dans le menu déroulant ci-dessous pour faire l'appel instantanément sur smartphone.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadSessions}
              disabled={isLoading}
              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Rafraîchir les séances et présences"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Actualiser</span>
            </button>
          </div>
        </div>

        {/* Filtres secondaires pour affiner le menu déroulant */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-slate-100">
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
              Filtrer par créneau :
            </label>
            <select
              value={slotFilter}
              onChange={e => setSlotFilter(e.target.value)}
              className="w-full text-xs font-semibold bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer transition-colors"
            >
              <option value="all">🗓️ Tous les créneaux</option>
              <option value="as_soir">🌙 AS du Soir (Mardi & Jeudi 17h-18h)</option>
              <option value="mardi">Mardi (17h - 18h)</option>
              <option value="jeudi">Jeudi (17h - 18h)</option>
              <option value="mercredi">⚡ Mercredi après-midi</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
              Filtrer par activité :
            </label>
            <select
              value={titleFilter}
              onChange={e => setTitleFilter(e.target.value)}
              className="w-full text-xs font-semibold bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer transition-colors"
            >
              <option value="all">🏷️ Toutes les activités ({uniqueTitles.length})</option>
              {uniqueTitles.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>

        {/* MENU DÉROULANT PRINCIPAL DU CHOIX DE LA SÉANCE */}
        <div>
          <label className="block text-xs font-black text-emerald-950 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-emerald-600" />
            <span>Séance à pointer ({filteredSessions.length} disponible(s)) :</span>
          </label>
          <div className="relative">
            <select
              value={selectedSessionId}
              onChange={e => setSelectedSessionId(e.target.value)}
              className="w-full text-xs sm:text-sm font-bold bg-emerald-50/70 hover:bg-emerald-50 border-2 border-emerald-500 rounded-xl px-3.5 py-3 text-emerald-950 focus:outline-none focus:ring-2 focus:ring-emerald-400 cursor-pointer shadow-xs appearance-none transition-all pr-10"
            >
              {filteredSessions.map(s => {
                const isToday = s.date === todayStr;
                const isPast = (s.date || '') < todayStr;
                const dayName = getSessionDayName(s.date);
                const dateFr = s.date ? new Date(s.date + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '';
                const timeStr = s.time ? `${s.time}${s.endTime ? `-${s.endTime}` : ''}` : '';
                const countEnrolled = (s.enrolledStudentIds || []).length;
                const countPresent = (s.presentStudentIds || []).length;

                const prefix = isToday ? '🎯 [AUJOURD\'HUI] ' : isPast ? '[Passée] ' : '';
                const label = `${prefix}${dayName} ${dateFr} • ${timeStr} — ${s.name} (${countPresent}/${countEnrolled} présents)`;

                return (
                  <option key={s.id} value={s.id} className="font-semibold text-slate-900 py-1">
                    {label}
                  </option>
                );
              })}
              {filteredSessions.length === 0 && (
                <option value="" disabled>Aucune séance ne correspond aux filtres</option>
              )}
            </select>
            <ChevronDown className="w-5 h-5 text-emerald-700 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* CORPS DE LA FEUILLE D'APPEL */}
      {currentSession ? (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col space-y-4 p-4 sm:p-6">
          {/* Bandeau d'en-tête de la séance choisie */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h3 className="text-xl sm:text-2xl font-black text-slate-900">{currentSession.name}</h3>
                {getSessionCategory(currentSession) === 'as_soir' ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 flex items-center gap-1 border border-purple-200">
                    <Moon className="w-3 h-3 text-purple-600" />
                    <span>AS du Soir</span>
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 flex items-center gap-1 border border-blue-200">
                    <Zap className="w-3 h-3 text-blue-600" />
                    <span>Mercredi</span>
                  </span>
                )}
                {currentSession.date === todayStr && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500 text-white shadow-xs">
                    Aujourd'hui
                  </span>
                )}
              </div>
              <p className="text-xs sm:text-sm font-semibold text-slate-600 flex items-center gap-1.5 flex-wrap">
                <span>📅 {getSessionDayName(currentSession.date)} {currentSession.date ? new Date(currentSession.date + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}</span>
                <span>•</span>
                <span>🕒 {currentSession.time}{currentSession.endTime ? ` - ${currentSession.endTime}` : ''}</span>
                {currentSession.location && <span>• 📍 {currentSession.location}</span>}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleShareLink}
                className={`p-2 sm:px-3 sm:py-2 rounded-xl text-xs font-bold transition-all border flex items-center gap-1.5 cursor-pointer shadow-2xs ${
                  copiedLink
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                }`}
                title="Partager / Copier le lien d'inscription pour les élèves"
              >
                {copiedLink ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4 text-indigo-600" />}
                <span className="hidden sm:inline">Lien inscription</span>
              </button>

              <button
                type="button"
                onClick={handlePrint}
                className="p-2 sm:px-3 sm:py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                title="Imprimer la feuille d'appel officielle"
              >
                <Printer className="w-4 h-4 text-slate-600" />
                <span className="hidden sm:inline">Imprimer</span>
              </button>
            </div>
          </div>

          {/* BARRE DE PROGRESSION & COMPTEURS DE POINTAGE */}
          <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-indigo-50 border border-emerald-200 rounded-2xl p-4 sm:p-5 space-y-3 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span className="text-2xl font-black text-emerald-950">
                  {presentCount} / {enrolledCount}
                </span>
                <span className="text-xs font-bold text-emerald-800 bg-white/80 px-2 py-0.5 rounded-full border border-emerald-200">
                  {presentPercent}% présents
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleMarkAllPresent}
                  disabled={enrolledCount === 0}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black rounded-xl text-xs transition-all shadow-xs disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Tout pointer présent</span>
                </button>
                <button
                  type="button"
                  onClick={handleMarkAllAbsent}
                  disabled={presentCount === 0}
                  className="px-3 py-1.5 bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 font-bold rounded-xl text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
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

          {/* FILTRES INTERNES DE LA LISTE D'APPEL */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
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
                placeholder="Filtrer un élève de la séance (nom, classe)..."
                value={attendanceSearch}
                onChange={e => setAttendanceSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            <button
              type="button"
              onClick={() => setIsAddOpen(prev => !prev)}
              className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
            >
              <PlusCircle className="w-4 h-4 text-indigo-600" />
              <span>{isAddOpen ? 'Fermer ajout direct' : '+ Ajouter un élève'}</span>
            </button>
          </div>

          {/* TIROIR D'AJOUT DIRECT D'UN ÉLÈVE NON INSCRIT */}
          {isAddOpen && (
            <div className="p-4 bg-indigo-50/70 border-2 border-indigo-200 rounded-2xl space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-indigo-950 flex items-center gap-1.5">
                    <UserCheck className="w-4 h-4 text-indigo-600" />
                    <span>Ajouter un élève non inscrit sur cette séance</span>
                  </h4>
                  <p className="text-[11px] text-indigo-800/80">
                    Tapez le nom ou la classe pour l'inscrire et le pointer directement présent en 1 seul clic.
                  </p>
                </div>
              </div>

              <div className="relative">
                <input
                  type="text"
                  placeholder="Rechercher dans tout l'établissement (ex: Martin, 6B, Dupont)..."
                  value={addSearch}
                  onChange={e => setAddSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 bg-white border border-indigo-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                  autoFocus
                />
                <Search className="w-4 h-4 text-indigo-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              {nonEnrolledCandidates.length > 0 && (
                <div className="bg-white rounded-xl border border-indigo-100 divide-y divide-slate-100 max-h-56 overflow-y-auto">
                  {nonEnrolledCandidates.map(candidate => (
                    <div
                      key={candidate.id}
                      className="p-2.5 flex items-center justify-between gap-2 hover:bg-indigo-50/40 transition-colors"
                    >
                      <div className="min-w-0">
                        <span className="font-bold text-slate-900 text-xs truncate block">
                          {candidate.lastName} {candidate.firstName}
                        </span>
                        <span className="text-[10px] text-slate-500 font-semibold">
                          {candidate.classGroup || 'Sans classe'}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDirectAddAndMarkPresent(candidate)}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-xs rounded-xl shadow-xs transition-all flex items-center gap-1 cursor-pointer shrink-0"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Inscrire & Présent</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {addSearch.trim() && nonEnrolledCandidates.length === 0 && (
                <p className="text-xs text-indigo-700 italic text-center py-2">
                  Aucun élève correspondant trouvé dans l'établissement.
                </p>
              )}
            </div>
          )}

          {/* LISTE DES ÉLÈVES INSCRITS AVEC GRANDS BOUTONS TACTILES */}
          <div className="space-y-2 pt-2">
            {enrolledStudents.map(s => {
              const isPresent = (currentSession.presentStudentIds || []).includes(s.id);

              return (
                <div
                  key={s.id}
                  onClick={() => handleToggleAttendance(s.id)}
                  className={`flex items-center justify-between p-3 sm:p-3.5 rounded-2xl border transition-all cursor-pointer ${
                    isPresent
                      ? 'bg-emerald-50/90 border-emerald-300 shadow-2xs'
                      : 'bg-white border-slate-200 hover:border-slate-300'
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
                        {String(s.parentalAuth).toUpperCase() !== 'OUI' && (
                          <span title="Autorisation parentale manquante" className="text-xs text-rose-500 font-bold leading-none">AP🚫</span>
                        )}
                        {String(s.paid).toUpperCase() !== 'OUI' && (
                          <span title="Cotisation non payée" className="text-xs text-rose-500 font-black leading-none">€🚫</span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 font-semibold mt-0.5">
                        {s.classGroup || 'Sans classe'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {/* GRAND BOUTON TACTILE (HAUTEUR MIN 44px IDÉAL SMARTPHONE) */}
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
              <div className="p-10 text-center space-y-3 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <Users className="w-10 h-10 text-slate-300 mx-auto" />
                <h4 className="font-bold text-slate-700 text-sm">Aucun élève inscrit sur ce créneau</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Cliquez sur « + Ajouter un élève » ci-dessus pour rechercher et pointer directement les élèves qui arrivent dans le gymnase.
                </p>
                <button
                  type="button"
                  onClick={() => setIsAddOpen(true)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs shadow-sm transition-all"
                >
                  + Ajouter un élève
                </button>
              </div>
            )}

            {enrolledCount > 0 && enrolledStudents.length === 0 && (
              <p className="text-center text-slate-400 py-8 text-xs italic">
                Aucun élève ne correspond aux critères de recherche actuels.
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl p-8 text-center text-slate-500 text-xs border border-slate-200">
          Aucune séance sélectionnée. Choisissez une séance dans le menu déroulant ci-dessus.
        </div>
      )}
    </div>
  );
};

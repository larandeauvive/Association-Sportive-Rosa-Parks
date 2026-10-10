import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Student, Session } from '../types';
import { getSessionsList } from '../lib/db';
import { getSessionDayName, getSessionCategory } from '../lib/sessionUtils';
import { SessionRollCallModal } from './SessionRollCallModal';
import { 
  Calendar, CheckCircle2, Users, Search, 
  Moon, Zap, Clock, RefreshCw, ChevronDown, 
  ChevronRight, ArrowRight, Sparkles, Filter
} from 'lucide-react';

interface Props {
  students: Student[];
  activeYear: string;
}

export const TeacherRollCall: React.FC<Props> = ({ students, activeYear }) => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [sessionSearch, setSessionSearch] = useState<string>('');

  // Filtres
  const [slotFilter, setSlotFilter] = useState<string>('all');
  const [titleFilter, setTitleFilter] = useState<string>('all');

  // Gestion de l'encadré modal
  const [modalSession, setModalSession] = useState<Session | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  // Historique repliable
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);

  const todayStr = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }, []);

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

  // Séances filtrées
  const filteredSessions = useMemo(() => {
    const q = sessionSearch.trim().toLowerCase();

    return sessions.filter(s => {
      // 1. Recherche texte libre
      if (q) {
        const matchName = (s.name || '').toLowerCase().includes(q);
        const matchLoc = (s.location || '').toLowerCase().includes(q);
        const matchDate = (s.date || '').toLowerCase().includes(q);
        const dayFr = getSessionDayName(s.date).toLowerCase();
        const matchDay = dayFr.includes(q);
        if (!matchName && !matchLoc && !matchDate && !matchDay) return false;
      }

      // 2. Filtre intitulé
      if (titleFilter !== 'all' && (s.name || '').trim().toLowerCase() !== titleFilter.trim().toLowerCase()) {
        return false;
      }

      // 3. Filtre créneau
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
  }, [sessions, sessionSearch, titleFilter, slotFilter]);

  // Découpage en catégories : Aujourd'hui, À venir, Passées
  const todaySessions = useMemo(() => {
    return filteredSessions.filter(s => s.date === todayStr);
  }, [filteredSessions, todayStr]);

  const upcomingSessions = useMemo(() => {
    return filteredSessions.filter(s => (s.date || '') >= todayStr);
  }, [filteredSessions, todayStr]);

  const pastSessions = useMemo(() => {
    return filteredSessions.filter(s => (s.date || '') < todayStr);
  }, [filteredSessions, todayStr]);

  // Séance sélectionnée dans le menu déroulant
  const currentSession = useMemo(() => {
    return sessions.find(s => s.id === selectedSessionId) || null;
  }, [sessions, selectedSessionId]);

  // Ouvrir l'encadré pour une séance spécifique
  const openRollCallModal = (session: Session) => {
    setSelectedSessionId(session.id);
    setModalSession(session);
    setIsModalOpen(true);
  };

  // Synchronisation lors de mise à jour dans le modal
  const handleSessionUpdated = (updatedSession: Session) => {
    setSessions(prev => prev.map(s => s.id === updatedSession.id ? updatedSession : s));
    if (modalSession?.id === updatedSession.id) {
      setModalSession(updatedSession);
    }
  };

  return (
    <div className="space-y-5">
      {/* BANDEAU SUPÉRIEUR ERGONOMIQUE AVEC MENU DÉROULANT ET RECHERCHE */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl shadow-sm border border-slate-200 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
              <span className="p-1.5 rounded-xl bg-emerald-100 text-emerald-800 shadow-2xs">
                <CheckCircle2 className="w-4 h-4" />
              </span>
              <span>Pointage d'Appel des Séances</span>
            </h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Cliquez sur n'importe quelle séance ci-dessous pour ouvrir l'encadré d'appel, pointer les présents ou inscrire un élève en 1 clic.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadSessions}
              disabled={isLoading}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Rafraîchir les séances et présences"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Actualiser</span>
            </button>
          </div>
        </div>

        {/* 1. MENU DÉROULANT DU CHOIX DE LA SÉANCE AVEC BOUTON D'OUVERTURE DIRECTE */}
        <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-2xl p-3.5 sm:p-4 space-y-2">
          <label className="block text-xs font-black text-emerald-950 uppercase tracking-wider flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-emerald-600" />
              <span>Choix rapide de la séance :</span>
            </span>
            <span className="text-[11px] font-bold text-emerald-800 lowercase">
              {filteredSessions.length} séance(s) listée(s)
            </span>
          </label>

          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <select
                value={selectedSessionId}
                onChange={e => setSelectedSessionId(e.target.value)}
                className="w-full text-xs sm:text-sm font-bold bg-white border-2 border-emerald-400 focus:border-emerald-600 rounded-xl px-3.5 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-200 cursor-pointer shadow-xs appearance-none pr-10"
              >
                {filteredSessions.map(s => {
                  const isSessToday = s.date === todayStr;
                  const isSessPast = (s.date || '') < todayStr;
                  const day = getSessionDayName(s.date);
                  const dateFr = s.date ? new Date(s.date + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '';
                  const timeStr = s.time ? `${s.time}${s.endTime ? `-${s.endTime}` : ''}` : '';
                  const countEnrolled = (s.enrolledStudentIds || []).length;
                  const countPresent = (s.presentStudentIds || []).length;

                  const prefix = isSessToday ? '🎯 [AUJOURD\'HUI] ' : isSessPast ? '[Passée] ' : '';
                  const label = `${prefix}${day} ${dateFr} • ${timeStr} — ${s.name} (${countPresent}/${countEnrolled} présents)`;

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
              <ChevronDown className="w-4 h-4 text-emerald-700 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            <button
              type="button"
              disabled={!currentSession}
              onClick={() => {
                if (currentSession) openRollCallModal(currentSession);
              }}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-xs sm:text-sm rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              <span>📋 Ouvrir l'appel de cette séance</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 2. RECHERCHE RAPIDE & FILTRES CRÉNEAU / ACTIVITÉ */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-1">
          {/* Recherche */}
          <div className="relative">
            <input
              type="text"
              placeholder="Rechercher une séance (nom, lieu, date)..."
              value={sessionSearch}
              onChange={e => setSessionSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-semibold"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Filtre créneau */}
          <div>
            <select
              value={slotFilter}
              onChange={e => setSlotFilter(e.target.value)}
              className="w-full text-xs font-semibold bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer transition-colors"
            >
              <option value="all">🗓️ Tous les créneaux</option>
              <option value="as_soir">🌙 AS du Soir (Mardi & Jeudi 17h-18h)</option>
              <option value="mardi">Mardi (17h - 18h)</option>
              <option value="jeudi">Jeudi (17h - 18h)</option>
              <option value="mercredi">⚡ Mercredi après-midi</option>
            </select>
          </div>

          {/* Filtre activité */}
          <div>
            <select
              value={titleFilter}
              onChange={e => setTitleFilter(e.target.value)}
              className="w-full text-xs font-semibold bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer transition-colors"
            >
              <option value="all">🏷️ Toutes les activités ({uniqueTitles.length})</option>
              {uniqueTitles.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* SÉANCE(S) D'AUJOURD'HUI MISES EN AVANT */}
      {todaySessions.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
              <span>🎯 Séances d'aujourd'hui</span>
              <span className="text-xs bg-amber-100 text-amber-900 px-2 py-0.2 rounded-full font-bold">
                {todaySessions.length}
              </span>
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {todaySessions.map(s => {
              const enrolled = (s.enrolledStudentIds || []).length;
              const present = (s.presentStudentIds || []).length;
              const percent = enrolled > 0 ? Math.round((present / enrolled) * 100) : 0;
              const isSoir = getSessionCategory(s) === 'as_soir';

              return (
                <div
                  key={s.id}
                  onClick={() => openRollCallModal(s)}
                  className="bg-gradient-to-r from-amber-500/10 via-amber-50/50 to-emerald-500/10 border-2 border-amber-400 hover:border-amber-500 rounded-2xl p-4 transition-all shadow-sm hover:shadow-md cursor-pointer group flex flex-col justify-between gap-3"
                  title="Cliquer pour ouvrir l'encadré d'appel"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap mb-1">
                        <span className="text-[10px] font-black uppercase tracking-wider bg-amber-500 text-white px-2 py-0.5 rounded-md shadow-2xs">
                          Aujourd'hui
                        </span>
                        {isSoir ? (
                          <span className="text-[10px] font-bold bg-purple-100 text-purple-800 px-2 py-0.5 rounded-md flex items-center gap-1 border border-purple-200">
                            <Moon className="w-2.5 h-2.5 text-purple-600" />
                            <span>AS du Soir</span>
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded-md flex items-center gap-1 border border-blue-200">
                            <Zap className="w-2.5 h-2.5 text-blue-600" />
                            <span>Mercredi</span>
                          </span>
                        )}
                      </div>

                      <h4 className="text-base font-black text-slate-900 group-hover:text-amber-950 transition-colors truncate">
                        {s.name}
                      </h4>

                      <p className="text-xs font-semibold text-slate-600 mt-0.5 flex items-center gap-1.5 flex-wrap">
                        <span>🕒 {s.time}{s.endTime ? ` - ${s.endTime}` : ''}</span>
                        {s.location && <span>• 📍 {s.location}</span>}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-xs font-black text-slate-900 bg-white px-2.5 py-1 rounded-lg border border-amber-200 shadow-2xs">
                        {present} / {enrolled}
                      </div>
                      <span className="text-[10px] text-slate-500 font-bold block mt-0.5">
                        {percent}% présents
                      </span>
                    </div>
                  </div>

                  {/* Jauge et bouton */}
                  <div className="pt-2 border-t border-amber-200/60 flex items-center justify-between gap-3">
                    <div className="flex-1 bg-white/80 rounded-full h-2 overflow-hidden border border-amber-200">
                      <div className="bg-emerald-600 h-full rounded-full transition-all" style={{ width: `${percent}%` }} />
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openRollCallModal(s);
                      }}
                      className="px-3 py-1.5 bg-amber-600 group-hover:bg-amber-700 active:scale-95 text-white font-black text-xs rounded-xl shadow-xs transition-all flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      <span>Faire l'appel</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* GRILLE DES PROCHAINES SÉANCES À VENIR (OPTIMISÉE ORDINATEUR) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-indigo-600" />
            <span>Prochaines séances à venir ({upcomingSessions.length})</span>
          </h3>
          <span className="text-xs text-slate-500 font-semibold hidden sm:inline">
            Cliquez sur un encadré pour ouvrir la feuille d'appel
          </span>
        </div>

        {upcomingSessions.length === 0 ? (
          <div className="p-8 text-center bg-white rounded-2xl border border-dashed border-slate-200 space-y-2">
            <Calendar className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-xs font-bold text-slate-600">Aucune séance à venir ne correspond aux critères.</p>
            <p className="text-[11px] text-slate-400">Modifiez vos filtres ou effectuez une recherche ci-dessus.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {upcomingSessions.map(s => {
              const isTodaySess = s.date === todayStr;
              const isSoir = getSessionCategory(s) === 'as_soir';
              const dayName = getSessionDayName(s.date);
              const dateFr = s.date ? new Date(s.date + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '';
              const enrolled = (s.enrolledStudentIds || []).length;
              const present = (s.presentStudentIds || []).length;
              const percent = enrolled > 0 ? Math.round((present / enrolled) * 100) : 0;

              return (
                <div
                  key={s.id}
                  onClick={() => openRollCallModal(s)}
                  className={`rounded-2xl p-4 transition-all shadow-2xs hover:shadow-md cursor-pointer group flex flex-col justify-between gap-3 border ${
                    isTodaySess
                      ? 'bg-amber-50/40 border-amber-300 hover:border-amber-400'
                      : isSoir
                        ? 'bg-white hover:bg-purple-50/30 border-slate-200 hover:border-purple-300'
                        : 'bg-white hover:bg-blue-50/30 border-slate-200 hover:border-blue-300'
                  }`}
                  title="Cliquer pour ouvrir l'encadré d'appel de cette séance"
                >
                  <div>
                    {/* Badges du haut */}
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-xs font-black text-slate-800 flex items-center gap-1 truncate">
                        <Calendar className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                        <span>{dayName} {dateFr}</span>
                      </span>

                      {isTodaySess ? (
                        <span className="text-[9px] font-black uppercase tracking-wider bg-amber-500 text-white px-2 py-0.5 rounded shadow-2xs shrink-0">
                          Aujourd'hui
                        </span>
                      ) : isSoir ? (
                        <span className="text-[10px] font-bold bg-purple-100 text-purple-800 px-2 py-0.5 rounded-md flex items-center gap-1 border border-purple-200 shrink-0">
                          <Moon className="w-2.5 h-2.5 text-purple-600" />
                          <span>Soir</span>
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded-md flex items-center gap-1 border border-blue-200 shrink-0">
                          <Zap className="w-2.5 h-2.5 text-blue-600" />
                          <span>Mercredi</span>
                        </span>
                      )}
                    </div>

                    {/* Intitulé */}
                    <h4 className="text-base font-black text-slate-900 group-hover:text-indigo-900 transition-colors line-clamp-1">
                      {s.name}
                    </h4>

                    {/* Horaires et lieu */}
                    <p className="text-xs font-medium text-slate-500 mt-1 flex items-center gap-1.5 flex-wrap">
                      <span>🕒 {s.time}{s.endTime ? ` - ${s.endTime}` : ''}</span>
                      {s.location && <span className="truncate">• 📍 {s.location}</span>}
                    </p>
                  </div>

                  {/* Bas de carte : Jauge des présences et bouton faire l'appel */}
                  <div className="pt-2.5 border-t border-slate-100 space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                      <span className="text-slate-500 text-[11px]">Présences :</span>
                      <span className="text-emerald-700 font-black">
                        {present} / {enrolled} ({percent}%)
                      </span>
                    </div>

                    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                      <div className="bg-emerald-600 h-full rounded-full transition-all" style={{ width: `${percent}%` }} />
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openRollCallModal(s);
                      }}
                      className="w-full mt-1 py-2 bg-slate-900 group-hover:bg-emerald-600 text-white font-black text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300 group-hover:text-white" />
                      <span>Faire l'appel</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SECTION HISTORIQUE DES SÉANCES PASSÉES (REPLIABLE) */}
      {pastSessions.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-3">
          <button
            type="button"
            onClick={() => setIsHistoryOpen(prev => !prev)}
            className="w-full flex items-center justify-between text-left cursor-pointer group"
          >
            <div className="flex items-center gap-2">
              <span className="p-1 rounded-lg bg-slate-100 text-slate-600 group-hover:bg-slate-200 transition-colors">
                {isHistoryOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </span>
              <span className="text-xs font-black uppercase tracking-wider text-slate-700">
                Historique des séances passées ({pastSessions.length})
              </span>
            </div>
            <span className="text-xs text-slate-400 font-semibold">
              {isHistoryOpen ? 'Replier' : 'Afficher les séances passées'}
            </span>
          </button>

          {isHistoryOpen && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-2 animate-in fade-in">
              {pastSessions.map(s => {
                const dayName = getSessionDayName(s.date);
                const dateFr = s.date ? new Date(s.date + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '';
                const enrolled = (s.enrolledStudentIds || []).length;
                const present = (s.presentStudentIds || []).length;

                return (
                  <div
                    key={s.id}
                    onClick={() => openRollCallModal(s)}
                    className="p-3.5 bg-slate-50/70 hover:bg-slate-100/80 border border-slate-200 rounded-xl transition-all cursor-pointer flex items-center justify-between gap-3 group"
                    title="Cliquer pour voir ou ajuster l'appel"
                  >
                    <div className="min-w-0">
                      <span className="text-[11px] font-bold text-slate-500 block">
                        {dayName} {dateFr} • {s.time}
                      </span>
                      <h5 className="font-bold text-xs text-slate-800 truncate group-hover:text-indigo-900">
                        {s.name}
                      </h5>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-black text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-200">
                        {present}/{enrolled}
                      </span>
                      <span className="text-xs text-indigo-600 font-bold group-hover:translate-x-0.5 transition-transform">
                        →
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* L'ENCADRÉ MODAL D'APPEL & AJOUT D'ÉLÈVES */}
      <SessionRollCallModal
        session={modalSession}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        students={students}
        activeYear={activeYear}
        onSessionUpdated={handleSessionUpdated}
      />
    </div>
  );
};

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Convocation, Session, Student, Teacher } from '../types';
import { 
  getConvocationsList, getSessionsList, saveSessionApi, 
  deleteSessionApi, saveConvocationApi, deleteConvocationApi,
  getAppSetting, getStudentsList, getTeachersList
} from '../lib/db';
import { 
  format, addMonths, subMonths, startOfMonth, endOfMonth, 
  startOfWeek, endOfWeek, isSameMonth, isSameDay, eachDayOfInterval,
  addWeeks, addDays, isWithinInterval, startOfDay, differenceInCalendarDays
} from 'date-fns';
import { fr } from 'date-fns/locale';
import { 
  ChevronLeft, ChevronRight, X, Printer, Users, FileText, 
  Calendar as CalendarIcon, PlusCircle, Loader2, Share2, 
  Trash2, Edit3, Download, FileUp, ShieldCheck, Clock, MapPin, Sparkles, Lock,
  ArrowRight, CheckCircle2, AlertCircle, Compass, CalendarDays, Zap, Flame, Check,
  Layers, Moon, History, ChevronDown, Repeat, Timer, Search
} from 'lucide-react';
import { RegistrationFormDoc } from '../types';
import { RegistrationFormModal } from './RegistrationFormModal';
import { SimplifiedEnrollmentModal } from './SimplifiedEnrollmentModal';
import { ConfirmDialog } from './ConfirmDialog';
import { downloadRegistrationForm, formatFileSize } from '../lib/registrationFormHelper';
import { getStudentCategory } from '../lib/categoryUtils';
import { getSessionCategory, getSessionDayName, formatRegistrationRule, getSeriesSessions } from '../lib/sessionUtils';

interface Props {
  students: Student[];
  activeYear: string;
  isPublic?: boolean;
  onOpenEnrollment?: (sessionId: string) => void;
}

type CalendarEvent = {
  id: string;
  type: 'session' | 'convocation';
  date: string;
  title: string;
  studentIds: string[];
  raw: Session | Convocation;
};

// Helper for exact date matching without UTC timezone shift
function isEventOnDay(eventDate: string, day: Date): boolean {
  if (!eventDate) return false;
  const dayStr = format(day, 'yyyy-MM-dd');
  const cleanDateStr = eventDate.slice(0, 10);
  return cleanDateStr === dayStr;
}

export const CalendarView: React.FC<Props> = ({ students, activeYear, isPublic, onOpenEnrollment }) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Élèves internes (récupération automatique exhaustive pour affichage public)
  const [internalStudents, setInternalStudents] = useState<Student[]>(students || []);
  useEffect(() => {
    if (students && students.length > 0) {
      setInternalStudents(students);
    }
    // Toujours charger l'ensemble complet de l'annuaire pour résoudre les noms de tous les inscrits
    getStudentsList().then(all => {
      if (all && all.length > 0) {
        setInternalStudents(prev => {
          const map = new Map<string, Student>();
          prev.forEach(s => map.set(s.id, s));
          all.forEach(s => map.set(s.id, s));
          return Array.from(map.values());
        });
      }
    }).catch(() => {});
  }, [students]);

  const effectiveStudents = useMemo(() => {
    if (students && students.length > 0) {
      // Fusionner avec internalStudents pour être certain de ne perdre aucun élève d'une autre année
      const map = new Map<string, Student>();
      internalStudents.forEach(s => map.set(s.id, s));
      students.forEach(s => map.set(s.id, s));
      return Array.from(map.values());
    }
    return internalStudents;
  }, [students, internalStudents]);

  const getEnrolledStudents = useCallback((studentIds: string[]) => {
    if (!studentIds || studentIds.length === 0) return [];
    return studentIds.map(sid => {
      const cleanSid = (sid || '').trim();
      const st = effectiveStudents.find(s => s.id === cleanSid || (s.id && s.id.toLowerCase() === cleanSid.toLowerCase()));
      if (st) {
        return {
          id: st.id,
          name: `${st.lastName} ${st.firstName}`.trim(),
          lastName: st.lastName,
          firstName: st.firstName,
          classGroup: st.classGroup
        };
      }
      return {
        id: cleanSid,
        name: cleanSid,
        lastName: cleanSid,
        firstName: '',
        classGroup: ''
      };
    }).sort((a, b) => (a.lastName || '').localeCompare(b.lastName || ''));
  }, [effectiveStudents]);

  // Mode d'affichage : 'columns' (2 Colonnes : AS du Soir & Mercredi), 'focus' (Focus 15 jours : cette semaine & semaine à venir), 'agenda' (Planning complet), 'month' (Grille mensuelle)
  // Sur le lien public partagé comme en interne, affiche immédiatement les 2 colonnes comme demandé par l'utilisateur
  const [viewMode, setViewMode] = useState<'columns' | 'focus' | 'agenda' | 'month'>('columns');

  // Sous-catégorie pour le mode 2 Colonnes : 'all' (2 colonnes côte à côte), 'as_soir' (AS du Soir seul), 'mercredi' (Mercredi seul)
  const [columnCategory, setColumnCategory] = useState<'all' | 'as_soir' | 'mercredi'>('all');
  const [calendarSearch, setCalendarSearch] = useState('');
  const [isAsSoirHistoryOpen, setIsAsSoirHistoryOpen] = useState(false);
  const [isMercrediHistoryOpen, setIsMercrediHistoryOpen] = useState(false);
  // Afficher l'AS du Soir d'une semaine à l'autre (false par défaut) pour ne pas surcharger le calendrier
  const [showAllAsSoir, setShowAllAsSoir] = useState(false);
  const [showLaterAsSoir, setShowLaterAsSoir] = useState(false);

  // Sous-filtre pour le mode Focus : 'all' (15 jours), 'thisWeek' (Cette semaine uniquement), 'nextWeek' (Semaine prochaine uniquement)
  const [focusFilter, setFocusFilter] = useState<'all' | 'thisWeek' | 'nextWeek'>('all');

  // Filtre d'étendue en mode Planning : 'all' (Tous les événements de la saison) ou 'month' (Uniquement le mois affiché)
  const [agendaScope, setAgendaScope] = useState<'all' | 'month'>('all');
  
  // Formulaire d'inscription téléchargeable
  const [registrationForm, setRegistrationForm] = useState<RegistrationFormDoc | null>(null);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  
  // Session en cours d'inscription (Fenêtre d'inscription simplifiée)
  const [enrollingSession, setEnrollingSession] = useState<Session | null>(null);

  // Suppression d'événement via boîte de dialogue in-app
  const [eventToDelete, setEventToDelete] = useState<CalendarEvent | null>(null);

  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [isCreatingEvent, setIsCreatingEvent] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [clickedDate, setClickedDate] = useState<Date | null>(null);
  
  const [newEventName, setNewEventName] = useState('');
  const [newEventTime, setNewEventTime] = useState('');
  const [newEventEndTime, setNewEventEndTime] = useState('');
  const [newEventLocation, setNewEventLocation] = useState('');
  const [newEventMeetingTime, setNewEventMeetingTime] = useState('');
  const [newEventMeetingLocation, setNewEventMeetingLocation] = useState('');
  const [newEventCafeteriaTime, setNewEventCafeteriaTime] = useState('');
  const [newEventReturnTime, setNewEventReturnTime] = useState('');
  const [newEventNeedSnack, setNewEventNeedSnack] = useState(false);
  const [newEventDescription, setNewEventDescription] = useState('');
  const [newEventRequireLicense, setNewEventRequireLicense] = useState(false);
  const [newEventRequireParentalAuth, setNewEventRequireParentalAuth] = useState(false);
  const [newEventRequireSwimmingCertificate, setNewEventRequireSwimmingCertificate] = useState(false);
  const [newEventRequirePaid, setNewEventRequirePaid] = useState(false);
  const [newEventMaxParticipants, setNewEventMaxParticipants] = useState<number | ''>('');
  const [newEventRegistrationOpenDate, setNewEventRegistrationOpenDate] = useState('');
  const [newEventRegistrationCloseDate, setNewEventRegistrationCloseDate] = useState('');
  const [newEventIsTeamRegistration, setNewEventIsTeamRegistration] = useState(false);
  const [newEventTeamSize, setNewEventTeamSize] = useState<number | ''>(4);
  const [isSavingEvent, setIsSavingEvent] = useState(false);
  const [newEventGenerateConvocation, setNewEventGenerateConvocation] = useState(false);

  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [newEventBlockOnlineRegistration, setNewEventBlockOnlineRegistration] = useState(false);
  const [newEventDirectRegistrationTeacherId, setNewEventDirectRegistrationTeacherId] = useState('');
  const [newEventDirectRegistrationTeacherName, setNewEventDirectRegistrationTeacherName] = useState('');
  const [newEventDirectRegistrationNotice, setNewEventDirectRegistrationNotice] = useState('');

  // Repères temporels pour le Focus hebdomadaire et la limitation d'une semaine à l'autre
  const today = useMemo(() => startOfDay(new Date()), []);
  const todayStr = useMemo(() => format(today, 'yyyy-MM-dd'), [today]);
  const currentWeekStart = useMemo(() => startOfWeek(today, { weekStartsOn: 1 }), [today]);
  const currentWeekEnd = useMemo(() => endOfWeek(today, { weekStartsOn: 1 }), [today]);
  const nextWeekStart = useMemo(() => startOfWeek(addWeeks(today, 1), { weekStartsOn: 1 }), [today]);
  const nextWeekEnd = useMemo(() => endOfWeek(addWeeks(today, 1), { weekStartsOn: 1 }), [today]);
  // Horizon d'une semaine à l'autre : couvre la semaine en cours et la semaine suivante (week-end inclus)
  const asSoirHorizonDate = useMemo(() => {
    const dayOfWeek = today.getDay();
    const baseWeekStart = (dayOfWeek === 0 || dayOfWeek === 6)
      ? startOfWeek(addDays(today, 2), { weekStartsOn: 1 })
      : startOfWeek(today, { weekStartsOn: 1 });
    return endOfWeek(addWeeks(baseWeekStart, 1), { weekStartsOn: 1 });
  }, [today]);
  const asSoirHorizonStr = useMemo(() => format(asSoirHorizonDate, 'yyyy-MM-dd'), [asSoirHorizonDate]);

  // Catégorisation des événements :
  // - 'as_soir' : Mardi ou Jeudi (créneaux récurrents 17h00 - 18h00)
  // - 'mercredi' : Séances du mercredi, compétitions UNSS, sorties
  const getEventCategory = useCallback((ev: CalendarEvent): 'as_soir' | 'mercredi' => {
    if (ev.type === 'session') {
      return getSessionCategory(ev.raw as Session);
    }
    const conv = ev.raw as Convocation;
    const d = (conv.departureDate || ev.date || '').slice(0, 10);
    const parts = d.split('-');
    if (parts.length === 3) {
      const day = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)).getDay();
      if (day === 2 || day === 4) return 'as_soir';
    }
    return 'mercredi';
  }, []);

  // Filtrage d'une semaine à l'autre pour l'AS du Soir afin de ne pas surcharger le calendrier
  const isEventVisibleInCalendar = useCallback((ev: CalendarEvent): boolean => {
    if (showAllAsSoir) return true;
    const cat = getEventCategory(ev);
    if (cat !== 'as_soir') return true;
    const evDate = (ev.date || '').slice(0, 10);
    if (evDate < todayStr) return true; // les séances passées restent archivées dans l'historique
    return evDate <= asSoirHorizonStr; // à venir : uniquement semaine en cours & semaine suivante
  }, [showAllAsSoir, getEventCategory, todayStr, asSoirHorizonStr]);

  // Événements de la semaine en cours (Lundi à Dimanche)
  const thisWeekEvents = useMemo(() => {
    return events
      .filter(e => {
        if (!e.date) return false;
        const dStr = e.date.slice(0, 10);
        const dt = new Date(`${dStr}T12:00:00`);
        return isWithinInterval(dt, { start: currentWeekStart, end: currentWeekEnd });
      })
      .sort((a, b) => {
        const dDiff = a.date.localeCompare(b.date);
        if (dDiff !== 0) return dDiff;
        const timeA = a.type === 'session' ? (a.raw as Session).time : (a.raw as Convocation).departureDate?.includes('T') ? (a.raw as Convocation).departureDate.split('T')[1] : '';
        const timeB = b.type === 'session' ? (b.raw as Session).time : (b.raw as Convocation).departureDate?.includes('T') ? (b.raw as Convocation).departureDate.split('T')[1] : '';
        return (timeA || '').localeCompare(timeB || '');
      });
  }, [events, currentWeekStart, currentWeekEnd]);

  // Événements de la semaine à venir (Lundi à Dimanche suivant)
  const nextWeekEvents = useMemo(() => {
    return events
      .filter(e => {
        if (!e.date) return false;
        const dStr = e.date.slice(0, 10);
        const dt = new Date(`${dStr}T12:00:00`);
        return isWithinInterval(dt, { start: nextWeekStart, end: nextWeekEnd });
      })
      .sort((a, b) => {
        const dDiff = a.date.localeCompare(b.date);
        if (dDiff !== 0) return dDiff;
        const timeA = a.type === 'session' ? (a.raw as Session).time : (a.raw as Convocation).departureDate?.includes('T') ? (a.raw as Convocation).departureDate.split('T')[1] : '';
        const timeB = b.type === 'session' ? (b.raw as Session).time : (b.raw as Convocation).departureDate?.includes('T') ? (b.raw as Convocation).departureDate.split('T')[1] : '';
        return (timeA || '').localeCompare(timeB || '');
      });
  }, [events, nextWeekStart, nextWeekEnd]);

  const twoWeeksEventsCount = thisWeekEvents.length + nextWeekEvents.length;

  // Badge relatif dynamique (Aujourd'hui, Demain, Dans X jours...)
  const getEventRelativeBadge = useCallback((dateStr: string) => {
    if (!dateStr) return { text: '', className: '', isToday: false, isTomorrow: false, isPast: false };
    const cleanDateStr = dateStr.slice(0, 10);
    const evDate = new Date(`${cleanDateStr}T12:00:00`);
    const diffDays = differenceInCalendarDays(evDate, today);

    if (diffDays === 0) {
      return {
        text: "Aujourd'hui",
        className: 'bg-emerald-600 text-white font-black animate-pulse shadow-xs',
        isToday: true,
        isTomorrow: false,
        isPast: false
      };
    }
    if (diffDays === 1) {
      return {
        text: 'Demain',
        className: 'bg-amber-500 text-white font-black shadow-xs',
        isToday: false,
        isTomorrow: true,
        isPast: false
      };
    }
    if (diffDays === -1) {
      return {
        text: 'Hier',
        className: 'bg-slate-200 text-slate-700 font-semibold',
        isToday: false,
        isTomorrow: false,
        isPast: true
      };
    }
    if (diffDays < -1) {
      return {
        text: 'Passé',
        className: 'bg-slate-100 text-slate-500 font-semibold',
        isToday: false,
        isTomorrow: false,
        isPast: true
      };
    }
    if (diffDays <= 6) {
      return {
        text: `Dans ${diffDays} jours`,
        className: 'bg-indigo-100 text-indigo-800 font-bold',
        isToday: false,
        isTomorrow: false,
        isPast: false
      };
    }
    return {
      text: `Dans ${diffDays} jours`,
      className: 'bg-purple-100 text-purple-800 font-bold',
      isToday: false,
      isTomorrow: false,
      isPast: false
    };
  }, [today]);

  // Événements du mois affiché, triés chronologiquement pour le mode planning/mobile
  // Filtrés d'une semaine à l'autre pour l'AS du Soir afin de ne pas saturer le calendrier
  const currentMonthEvents = useMemo(() => {
    return events
      .filter(e => {
        if (!e.date) return false;
        if (!isEventVisibleInCalendar(e)) return false;
        const d = new Date(e.date);
        return isSameMonth(d, currentMonth);
      })
      .sort((a, b) => {
        const dDiff = a.date.localeCompare(b.date);
        if (dDiff !== 0) return dDiff;
        const timeA = a.type === 'session' ? (a.raw as Session).time : (a.raw as Convocation).departureDate?.includes('T') ? (a.raw as Convocation).departureDate.split('T')[1] : '';
        const timeB = b.type === 'session' ? (b.raw as Session).time : (b.raw as Convocation).departureDate?.includes('T') ? (b.raw as Convocation).departureDate.split('T')[1] : '';
        return (timeA || '').localeCompare(timeB || '');
      });
  }, [events, currentMonth, isEventVisibleInCalendar]);

  // Tous les événements triés chronologiquement pour la vue agenda
  const sortedAllEvents = useMemo(() => {
    return [...events]
      .filter(e => e.date && isEventVisibleInCalendar(e))
      .sort((a, b) => {
        const dDiff = a.date.localeCompare(b.date);
        if (dDiff !== 0) return dDiff;
        const timeA = a.type === 'session' ? (a.raw as Session).time : (a.raw as Convocation).departureDate?.includes('T') ? (a.raw as Convocation).departureDate.split('T')[1] : '';
        const timeB = b.type === 'session' ? (b.raw as Session).time : (b.raw as Convocation).departureDate?.includes('T') ? (b.raw as Convocation).departureDate.split('T')[1] : '';
        return (timeA || '').localeCompare(timeB || '');
      });
  }, [events, isEventVisibleInCalendar]);

  // Événement le plus proche / pertinent pour saut rapide
  const nearestEvent = useMemo(() => {
    if (events.length === 0) return null;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const upcoming = events
      .filter(e => e.date && new Date(e.date) >= now && isEventVisibleInCalendar(e))
      .sort((a, b) => a.date.localeCompare(b.date));
    if (upcoming.length > 0) return upcoming[0];
    const sorted = [...events].filter(e => e.date && isEventVisibleInCalendar(e)).sort((a, b) => a.date.localeCompare(b.date));
    return sorted[0] || null;
  }, [events, isEventVisibleInCalendar]);

  // Groupement par mois pour le mode planning (YYYY-MM)
  const agendaMonthGroups = useMemo(() => {
    const list = agendaScope === 'month' ? currentMonthEvents : sortedAllEvents;
    const map: Record<string, CalendarEvent[]> = {};
    for (const ev of list) {
      if (!ev.date) continue;
      const key = ev.date.slice(0, 7);
      if (!map[key]) map[key] = [];
      map[key].push(ev);
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [agendaScope, currentMonthEvents, sortedAllEvents]);

  const {
    asSoirUpcoming,
    asSoirUpcomingImmediate,
    asSoirUpcomingLater,
    asSoirPast,
    mercrediUpcoming,
    mercrediPast,
    totalAsSoir,
    totalMercredi
  } = useMemo(() => {
    const q = calendarSearch.trim().toLowerCase();
    const filtered = q
      ? events.filter(e => 
          (e.title || '').toLowerCase().includes(q) ||
          (e.date || '').toLowerCase().includes(q) ||
          (e.type === 'session' && ((e.raw as Session).location || '').toLowerCase().includes(q))
        )
      : events;

    const sorted = [...filtered].sort((a, b) => {
      const dDiff = (a.date || '').localeCompare(b.date || '');
      if (dDiff !== 0) return dDiff;
      const timeA = a.type === 'session' ? ((a.raw as Session).time || '') : '';
      const timeB = b.type === 'session' ? ((b.raw as Session).time || '') : '';
      return timeA.localeCompare(timeB);
    });

    const nowStr = format(today, 'yyyy-MM-dd');
    const soirUpImmediate: CalendarEvent[] = [];
    const soirUpLater: CalendarEvent[] = [];
    const soirPast: CalendarEvent[] = [];
    const merUp: CalendarEvent[] = [];
    const merPast: CalendarEvent[] = [];

    sorted.forEach(ev => {
      const cat = getEventCategory(ev);
      const evDate = (ev.date || '').slice(0, 10);
      const isUpcoming = evDate >= nowStr;
      if (cat === 'as_soir') {
        if (isUpcoming) {
          // Filtrage d'une semaine à l'autre pour ne pas surcharger le calendrier
          if (evDate <= asSoirHorizonStr) {
            soirUpImmediate.push(ev);
          } else {
            soirUpLater.push(ev);
          }
        } else {
          soirPast.push(ev);
        }
      } else {
        if (isUpcoming) merUp.push(ev);
        else merPast.push(ev);
      }
    });

    const soirUp = (showAllAsSoir || showLaterAsSoir) ? [...soirUpImmediate, ...soirUpLater] : soirUpImmediate;

    return {
      asSoirUpcoming: soirUp,
      asSoirUpcomingImmediate: soirUpImmediate,
      asSoirUpcomingLater: soirUpLater,
      asSoirPast: soirPast,
      mercrediUpcoming: merUp,
      mercrediPast: merPast,
      totalAsSoir: soirUpImmediate.length + soirUpLater.length + soirPast.length,
      totalMercredi: merUp.length + merPast.length
    };
  }, [events, calendarSearch, today, getEventCategory, asSoirHorizonStr, showAllAsSoir, showLaterAsSoir]);

  const openEditModal = (event: CalendarEvent) => {
    if (event.type !== 'session') return;
    const session = event.raw as Session;
    setNewEventName(session.name || '');
    setNewEventTime(session.time || '');
    setNewEventEndTime(session.endTime || '');
    setNewEventLocation(session.location || '');
    setNewEventMeetingTime(session.meetingTime || '');
    setNewEventMeetingLocation(session.meetingLocation || '');
    setNewEventCafeteriaTime(session.cafeteriaTime || '');
    setNewEventReturnTime(session.returnTime || '');
    setNewEventNeedSnack(session.needSnack || false);
    setNewEventDescription(session.description || '');
    setNewEventRequireLicense(session.requireLicense ?? false);
    setNewEventRequireParentalAuth(!!session.requireParentalAuth);
    setNewEventRequireSwimmingCertificate(!!session.requireSwimmingCertificate);
    setNewEventRequirePaid(!!session.requirePaid);
    setNewEventMaxParticipants(session.maxParticipants || '');
    setNewEventRegistrationOpenDate(session.registrationOpenDate || '');
    setNewEventRegistrationCloseDate(session.registrationCloseDate || '');
    setNewEventIsTeamRegistration(!!session.isTeamRegistration);
    setNewEventTeamSize(session.teamSize || 4);
    setNewEventGenerateConvocation(!!session.convocationId);
    setNewEventBlockOnlineRegistration(!!session.blockOnlineRegistration);
    setNewEventDirectRegistrationTeacherId(session.directRegistrationTeacherId || '');
    setNewEventDirectRegistrationTeacherName(session.directRegistrationTeacherName || '');
    setNewEventDirectRegistrationNotice(session.directRegistrationNotice || '');
    setClickedDate(new Date(session.date));
    setEditingEventId(event.id);
    setIsCreatingEvent(true);
    setSelectedEvent(null);
  };

  const loadCalendarData = useCallback(async () => {
    try {
      let [convos, sessions, teachersData] = await Promise.all([
        getConvocationsList(activeYear),
        getSessionsList(activeYear),
        getTeachersList()
      ]);
      if (teachersData) setTeachers(teachersData);

      // Si le filtre par activeYear n'a rien renvoyé, charger l'ensemble pour résilience totale inter-postes
      if ((!convos || convos.length === 0) && (!sessions || sessions.length === 0)) {
        const [allConvos, allSessions] = await Promise.all([
          getConvocationsList(),
          getSessionsList()
        ]);
        if ((allConvos && allConvos.length > 0) || (allSessions && allSessions.length > 0)) {
          convos = allConvos;
          sessions = allSessions;
        }
      }

      const convoEvents: CalendarEvent[] = convos
        .filter(c => c.departureDate && !isNaN(new Date(c.departureDate).getTime()) && !c.sessionId)
        .map(c => {
          const linkedSession = sessions.find(s => s.convocationId === c.id || s.id === c.sessionId);
          const mergedStudentIds = Array.from(new Set([
            ...(c.studentIds || []),
            ...(linkedSession?.enrolledStudentIds || []),
            ...(linkedSession?.presentStudentIds || [])
          ]));
          return {
            id: c.id,
            type: 'convocation' as const,
            date: c.departureDate,
            title: c.competitionName || 'Convocation',
            studentIds: mergedStudentIds,
            raw: c
          };
        });

      const sessionEvents: CalendarEvent[] = sessions
        .filter(s => s.date && !isNaN(new Date(s.date).getTime()))
        .map(s => {
          const linkedConv = convos.find(c => c.id === s.convocationId || c.sessionId === s.id);
          const mergedStudentIds = Array.from(new Set([
            ...(s.enrolledStudentIds || []),
            ...(s.presentStudentIds || []),
            ...(linkedConv?.studentIds || [])
          ]));
          return {
            id: s.id,
            type: 'session' as const,
            date: s.date,
            title: s.name || 'Séance',
            studentIds: mergedStudentIds,
            raw: s
          };
        });

      const allCombined = [...convoEvents, ...sessionEvents];
      setEvents(allCombined);

      // Auto-positionner le mois affiché sur le mois contenant des événements réels si le mois par défaut est vide
      if (allCombined.length > 0) {
        setCurrentMonth(prevMonth => {
          const hasInCurrent = allCombined.some(e => e.date && isSameMonth(new Date(e.date), prevMonth));
          if (hasInCurrent) return prevMonth;

          const now = new Date();
          now.setHours(0, 0, 0, 0);
          const upcoming = allCombined
            .filter(e => e.date && new Date(e.date) >= now)
            .sort((a, b) => a.date.localeCompare(b.date));

          if (upcoming.length > 0 && upcoming[0].date) {
            return new Date(upcoming[0].date);
          }

          const sortedAll = [...allCombined]
            .filter(e => e.date)
            .sort((a, b) => a.date.localeCompare(b.date));
          if (sortedAll.length > 0 && sortedAll[0].date) {
            return new Date(sortedAll[0].date);
          }
          return prevMonth;
        });
      }
    } catch (err) {
      console.warn("Erreur chargement calendrier:", err);
    } finally {
      setLoading(false);
    }
  }, [activeYear]);

  useEffect(() => {
    loadCalendarData();
  }, [loadCalendarData]);

  // Chargement du formulaire d'inscription officiel
  useEffect(() => {
    const fetchForm = async () => {
      try {
        const form = await getAppSetting<RegistrationFormDoc>('registrationForm');
        setRegistrationForm(form);
      } catch (err) {
        console.warn("Erreur chargement formulaire inscription:", err);
      }
    };
    fetchForm();
  }, []);

  // Gestion de la touche Échap pour fermer immédiatement les fenêtres modales
  useEffect(() => {
    if (!isCreatingEvent && !selectedEvent) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsCreatingEvent(false);
        setSelectedEvent(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCreatingEvent, selectedEvent]);

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const days = eachDayOfInterval({ start: startDate, end: endDate });
  const weekDays = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

  const handleDayClick = (day: Date) => {
    if (isPublic) return;
    setClickedDate(day);
    setNewEventName('');
    setNewEventTime('13:30');
    setNewEventEndTime('');
    setNewEventLocation('');
    setNewEventMeetingTime('');
    setNewEventMeetingLocation('');
    setNewEventCafeteriaTime('');
    setNewEventReturnTime('');
    setNewEventNeedSnack(false);
    setNewEventDescription('');
    setNewEventRequireLicense(false);
    setNewEventRequireParentalAuth(false);
    setNewEventRequireSwimmingCertificate(false);
    setNewEventRequirePaid(false);
    setNewEventMaxParticipants('');
    setNewEventRegistrationOpenDate('');
    setNewEventRegistrationCloseDate('');
    setNewEventIsTeamRegistration(false);
    setNewEventTeamSize(4);
    setNewEventGenerateConvocation(false);
    setNewEventBlockOnlineRegistration(false);
    setNewEventDirectRegistrationTeacherId('');
    setNewEventDirectRegistrationTeacherName('');
    setNewEventDirectRegistrationNotice('');
    setEditingEventId(null);
    setIsCreatingEvent(true);
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clickedDate) return;
    
    setIsSavingEvent(true);
    try {
      if (editingEventId) {
        const sessionDoc = events.find(ev => ev.id === editingEventId)?.raw as Session;
        const existingEnrolled = sessionDoc?.enrolledStudentIds || [];
        const existingPresent = sessionDoc?.presentStudentIds || [];
        const existingTeams = sessionDoc?.teams || [];
        const existingConvId = sessionDoc?.convocationId;

        const updateData = {
          name: newEventName || 'Séance',
          date: format(clickedDate, 'yyyy-MM-dd'),
          time: newEventTime || '13:30',
          endTime: newEventEndTime,
          location: newEventLocation,
          meetingTime: newEventMeetingTime,
          meetingLocation: newEventMeetingLocation,
          cafeteriaTime: newEventCafeteriaTime,
          returnTime: newEventReturnTime,
          needSnack: newEventNeedSnack,
          description: newEventDescription,
          requireLicense: newEventRequireLicense,
          requireParentalAuth: newEventRequireParentalAuth,
          requireSwimmingCertificate: newEventRequireSwimmingCertificate,
          requirePaid: newEventRequirePaid,
          maxParticipants: newEventMaxParticipants ? Number(newEventMaxParticipants) : null,
          registrationOpenDate: newEventRegistrationOpenDate || null,
          registrationCloseDate: newEventRegistrationCloseDate || null,
          isTeamRegistration: newEventIsTeamRegistration,
          teamSize: newEventIsTeamRegistration ? (Number(newEventTeamSize) || 4) : null,
          blockOnlineRegistration: newEventBlockOnlineRegistration,
          directRegistrationTeacherId: newEventBlockOnlineRegistration ? (newEventDirectRegistrationTeacherId || null) : null,
          directRegistrationTeacherName: newEventBlockOnlineRegistration ? (newEventDirectRegistrationTeacherName || null) : null,
          directRegistrationNotice: newEventBlockOnlineRegistration ? (newEventDirectRegistrationNotice || null) : null,
          attachedPdf: sessionDoc?.attachedPdf || null,
          enrolledStudentIds: existingEnrolled,
          presentStudentIds: existingPresent,
          teams: existingTeams,
          convocationId: existingConvId
        };
        await saveSessionApi({ ...updateData, id: editingEventId });
        
        if (existingConvId) {
          const convUpdateData = {
            id: existingConvId,
            sessionId: editingEventId,
            competitionName: newEventName || 'Séance',
            departureDate: format(clickedDate, 'yyyy-MM-dd') + (newEventTime ? `T${newEventTime}` : 'T13:30'),
            returnDate: format(clickedDate, 'yyyy-MM-dd') + (newEventEndTime ? `T${newEventEndTime}` : 'T17:00'),
            needSnack: newEventNeedSnack ? 'OUI' : 'NON',
            meetingTime: newEventMeetingTime,
            meetingLocation: newEventMeetingLocation,
            cafeteriaTime: newEventCafeteriaTime,
            returnTime: newEventReturnTime,
            studentIds: existingEnrolled
          };
          await saveConvocationApi(convUpdateData);
        }
      } else {
        const sessionData: Partial<Session> = {
          name: newEventName || 'Séance',
          date: format(clickedDate, 'yyyy-MM-dd'),
          time: newEventTime || '13:30',
          endTime: newEventEndTime,
          location: newEventLocation,
          meetingTime: newEventMeetingTime,
          meetingLocation: newEventMeetingLocation,
          cafeteriaTime: newEventCafeteriaTime,
          returnTime: newEventReturnTime,
          needSnack: newEventNeedSnack,
          description: newEventDescription,
          requireLicense: newEventRequireLicense,
          requireParentalAuth: newEventRequireParentalAuth,
          requireSwimmingCertificate: newEventRequireSwimmingCertificate,
          requirePaid: newEventRequirePaid,
          maxParticipants: newEventMaxParticipants ? Number(newEventMaxParticipants) : undefined,
          registrationOpenDate: newEventRegistrationOpenDate || undefined,
          registrationCloseDate: newEventRegistrationCloseDate || undefined,
          isTeamRegistration: newEventIsTeamRegistration,
          teamSize: newEventIsTeamRegistration ? (Number(newEventTeamSize) || 4) : undefined,
          blockOnlineRegistration: newEventBlockOnlineRegistration,
          directRegistrationTeacherId: newEventBlockOnlineRegistration ? (newEventDirectRegistrationTeacherId || undefined) : undefined,
          directRegistrationTeacherName: newEventBlockOnlineRegistration ? (newEventDirectRegistrationTeacherName || undefined) : undefined,
          directRegistrationNotice: newEventBlockOnlineRegistration ? (newEventDirectRegistrationNotice || undefined) : undefined,
          teams: [],
          enrolledStudentIds: [],
          presentStudentIds: [],
          schoolYear: activeYear
        };
        const sessionResult = await saveSessionApi(sessionData);
        
        if (newEventGenerateConvocation && sessionResult?.id) {
           const convData: Partial<Convocation> = {
              competitionName: newEventName || 'Séance',
              departureDate: format(clickedDate, 'yyyy-MM-dd') + (newEventTime ? `T${newEventTime}` : 'T13:30'),
              returnDate: format(clickedDate, 'yyyy-MM-dd') + (newEventEndTime ? `T${newEventEndTime}` : 'T17:00'),
              guides: '',
              needSnack: newEventNeedSnack ? 'OUI' : 'NON',
              needPicnic: 'NON',
              schoolYear: activeYear,
              studentIds: [],
              sessionId: sessionResult.id,
              meetingTime: newEventMeetingTime,
              meetingLocation: newEventMeetingLocation,
              cafeteriaTime: newEventCafeteriaTime,
              returnTime: newEventReturnTime
           };
           try {
             const convResult = await saveConvocationApi(convData);
             if (convResult?.id) {
               await saveSessionApi({ id: sessionResult.id, convocationId: convResult.id });
             }
           } catch (convErr) {
             console.warn('Convocation creation warning (session was saved):', convErr);
           }
        }
      }
      setIsCreatingEvent(false);
      setEditingEventId(null);
      await loadCalendarData();
    } catch (err: any) {
      console.error('Erreur enregistrement séance calendrier:', err);
      alert('Erreur lors de l\'enregistrement de la séance : ' + (err?.message || 'Erreur inattendue'));
    } finally {
      setIsSavingEvent(false);
    }
  };

  const confirmDeleteEvent = async () => {
    if (!eventToDelete) return;
    try {
      if (eventToDelete.type === 'session') {
        const sessionDoc = eventToDelete.raw as Session;
        await deleteSessionApi(eventToDelete.id);
        if (sessionDoc.convocationId) {
          await deleteConvocationApi(sessionDoc.convocationId);
        }
        // Chercher aussi toute convocation ayant ce sessionId
        const convos = await getConvocationsList(activeYear);
        const linkedC = convos.find(c => c.sessionId === eventToDelete.id || c.id === sessionDoc.convocationId);
        if (linkedC && linkedC.id !== sessionDoc.convocationId) {
          await deleteConvocationApi(linkedC.id);
        }
      } else {
        const convoDoc = eventToDelete.raw as Convocation;
        await deleteConvocationApi(eventToDelete.id);
        if (convoDoc.sessionId) {
          await deleteSessionApi(convoDoc.sessionId);
        }
        // Chercher aussi toute séance ayant ce convocationId
        const sessions = await getSessionsList(activeYear);
        const linkedS = sessions.find(s => s.convocationId === eventToDelete.id || s.id === convoDoc.sessionId);
        if (linkedS && linkedS.id !== convoDoc.sessionId) {
          await deleteSessionApi(linkedS.id);
        }
      }
      
      setEventToDelete(null);
      setSelectedEvent(null);
      setIsCreatingEvent(false);
      setEditingEventId(null);
      await loadCalendarData();
    } catch (err: any) {
      console.error('Erreur suppression événement:', err);
      alert('Erreur lors de la suppression de l\'événement : ' + (err?.message || 'Erreur inattendue'));
    }
  };

  const printDocument = (type: 'liste' | 'convocation' | 'projet', eventOverride?: CalendarEvent) => {
    if (isPublic) return; // Sécurité absolue : les listings sont réservés exclusivement à l'administrateur
    const targetEvent = eventOverride || selectedEvent;
    if (!targetEvent) return;
    
    const eventStudents = students.filter(s => targetEvent.studentIds.includes(s.id));
    const dateStr = format(new Date(targetEvent.date), 'dd/MM/yyyy');
    
    let title = '';
    if (type === 'liste') title = `Liste d'appel - ${targetEvent.title}`;
    if (type === 'convocation') title = `Convocation UNSS`;
    if (type === 'projet') title = `Fiche Projet - ${targetEvent.title}`;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>${title}</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; padding: 40px; color: #1e293b; }
            h1 { font-size: 24px; margin-bottom: 8px; }
            .meta { font-size: 16px; color: #64748b; margin-bottom: 32px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #cbd5e1; padding: 12px; text-align: left; }
            th { background-color: #f8fafc; font-weight: 600; }
            .footer { margin-top: 50px; font-size: 14px; color: #64748b; text-align: center; }
            
            /* Specific layouts */
            .box { border: 1px solid #cbd5e1; padding: 20px; margin-bottom: 20px; border-radius: 8px; }
            .signature { margin-top: 40px; border-top: 1px dashed #cbd5e1; padding-top: 10px; width: 200px; text-align: center; float: right; }
          </style>
        </head>
        <body>
          <h1>${title}</h1>
          <div class="meta">
            Date : <strong>${dateStr}</strong><br/>
            Événement : <strong>${targetEvent.title}</strong><br/>
            Effectif : <strong>${eventStudents.length} élèves</strong>
          </div>
    `);

    if (type === 'convocation') {
      const isSession = targetEvent.type === 'session';
      const eventDetails = isSession ? targetEvent.raw as Session : null;
      const convoDetails = !isSession ? targetEvent.raw as Convocation : null;
      
      const meetingTime = (isSession ? eventDetails?.meetingTime : convoDetails?.meetingTime) || 'Non spécifiée';
      const meetingLocation = (isSession ? eventDetails?.meetingLocation : convoDetails?.meetingLocation) || 'Non spécifié';
      const returnTime = (isSession ? eventDetails?.returnTime : convoDetails?.returnTime) || (isSession ? eventDetails?.endTime : (convoDetails?.returnDate ? format(new Date(convoDetails.returnDate), 'HH:mm') : 'Non spécifiée'));
      const cafeteriaTime = (isSession ? eventDetails?.cafeteriaTime : convoDetails?.cafeteriaTime) || '';
      const snack = isSession ? (eventDetails?.needSnack ? 'Oui' : 'Non') : (convoDetails?.needSnack || 'Non');
      
      printWindow.document.write(`
        <div class="box">
          <p><strong>Lieu du RDV :</strong> ${meetingLocation}</p>
          <p><strong>Heure du RDV :</strong> ${meetingTime}</p>
          ${cafeteriaTime ? `<p><strong>Heure de passage au self :</strong> ${cafeteriaTime}</p>` : ''}
          <p><strong>Heure de retour :</strong> ${returnTime}</p>
          <p><strong>Goûter à prévoir :</strong> ${snack}</p>
        </div>
      `);
      
      if (!isPublic) {
        printWindow.document.write(`
          <p>Veuillez trouver ci-dessous la liste des élèves convoqués pour cet événement.</p>
        `);
      } else {
         printWindow.document.write(`
          <p>Veuillez vous présenter à l'heure indiquée.</p>
        `);
      }
    }

    if (type === 'projet') {
      printWindow.document.write(`
        <div class="box">
          <h3>Objectifs et Déroulement</h3>
          <p style="min-height: 150px; color: #94a3b8;">(À remplir...)</p>
        </div>
      `);
    }

    printWindow.document.write(`
          <table>
            <thead>
              <tr>
                <th>Nom</th>
                <th>Prénom</th>
                ${!isPublic ? '<th>Classe</th>' : ''}
                ${type === 'convocation' ? '<th>N° Licence</th><th>Catégorie</th><th>AP</th><th>Nage</th>' : ''}
                ${type === 'liste' && !isPublic ? '<th>Présent</th><th>Observation</th>' : ''}
                ${type === 'convocation' ? '<th>Signature</th>' : ''}
              </tr>
            </thead>
            <tbody>
              ${eventStudents.map(s => `
                <tr>
                  <td><strong>${s.lastName || ''}</strong></td>
                  <td>${s.firstName || ''}</td>
                  ${!isPublic ? `<td>${s.classGroup || ''}</td>` : ''}
                  ${type === 'convocation' ? `<td style="font-family: monospace;">${s.licenseNumber || '-'}</td><td><strong>${getStudentCategory(s, activeYear)}</strong></td><td style="text-align:center;">${s.parentalAuth === 'OUI' ? '✓' : '✗'}</td><td style="text-align:center;">${s.swimmingCertificate === 'OUI' ? '✓' : '✗'}</td>` : ''}
                  ${type === 'liste' && !isPublic ? '<td></td><td></td>' : ''}
                  ${type === 'convocation' ? '<td></td>' : ''}
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          <div class="signature">Signature / Cachet</div>
          
          <div style="clear:both;"></div>
          <div class="footer">Généré le ${format(new Date(), 'dd/MM/yyyy')} - AS Rosa Parks</div>
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    // Use a slight timeout to ensure styles load before printing
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };

  const handleShare = () => {
    const url = new URL(window.location.origin + window.location.pathname);
    url.searchParams.set('public', 'calendar');
    if (activeYear) {
      url.searchParams.set('schoolYear', activeYear);
    }
    navigator.clipboard.writeText(url.toString());
    alert('Lien du calendrier public copié dans le presse-papiers !');
  };

  const renderColumnEventCard = (event: CalendarEvent, isPast = false) => {
    const isSession = event.type === 'session';
    const rawSession = isSession ? (event.raw as Session) : null;
    const rawConv = !isSession ? (event.raw as Convocation) : null;
    const cleanDateStr = event.date.slice(0, 10);
    const eventDateObj = new Date(`${cleanDateStr}T12:00:00`);
    const dayName = getSessionDayName(cleanDateStr);
    const isFull = rawSession?.maxParticipants !== undefined && ((rawSession.enrolledStudentIds || []).length >= rawSession.maxParticipants);
    const enrolledCount = event.studentIds.length;
    const maxCap = rawSession?.maxParticipants;
    const rel = getEventRelativeBadge(event.date);
    const cat = getEventCategory(event);
    const isSoir = cat === 'as_soir';
    const series = isSession ? getSeriesSessions(rawSession!, events.filter(e => e.type === 'session').map(e => e.raw as Session)) : [];
    const isSeries = series.length > 1;
    const deadlineText = isSession ? formatRegistrationRule(rawSession!) : '';

    return (
      <div
        key={event.id}
        onClick={() => setSelectedEvent(event)}
        className={`group rounded-2xl border-2 transition-all p-3.5 sm:p-4 shadow-xs hover:shadow-md cursor-pointer flex flex-col justify-between gap-3 ${
          rel.isToday
            ? 'border-amber-400 bg-amber-50/40 ring-2 ring-amber-400/30'
            : isPast
            ? 'bg-slate-50/70 border-slate-200/80 hover:bg-slate-100/70'
            : isSoir
            ? 'border-purple-200 bg-white hover:border-purple-400 hover:bg-purple-50/20'
            : 'border-blue-200 bg-white hover:border-blue-400 hover:bg-blue-50/20'
        }`}
      >
        <div className="space-y-2">
          {/* Ligne 1 : Badges et Catégorie */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 flex-wrap">
              {isSoir ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-900 border border-purple-200 flex items-center gap-1 shadow-2xs">
                  <Moon className="w-3 h-3 text-purple-600" /> {dayName || 'Soir'}
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-900 border border-blue-200 flex items-center gap-1 shadow-2xs">
                  <Zap className="w-3 h-3 text-blue-600" /> Mercredi
                </span>
              )}

              {isSeries && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 flex items-center gap-0.5 border border-slate-200">
                  <Repeat className="w-2.5 h-2.5 text-slate-500" /> Récurrent
                </span>
              )}

              {rel.isToday && (
                <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-amber-500 text-white shadow-xs animate-pulse">
                  Aujourd'hui
                </span>
              )}

              {isPast && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-200 text-slate-600">
                  Passée
                </span>
              )}

              {isFull && !isPast && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200">
                  Complet
                </span>
              )}

              {rawSession?.blockOnlineRegistration && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1 shadow-2xs">
                  <Lock className="w-2.5 h-2.5 text-amber-700" />
                  <span>{rawSession.directRegistrationTeacherName ? `Voir ${rawSession.directRegistrationTeacherName}` : 'Direct prof'}</span>
                </span>
              )}

              {rawSession?.attachedPdf && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-200 flex items-center gap-0.5">
                  <FileText className="w-2.5 h-2.5 text-rose-600" /> PDF joint
                </span>
              )}
            </div>

            {/* Places / Inscrits */}
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md border shrink-0 ${
              isPast ? 'bg-slate-100 text-slate-600 border-slate-200' : 'bg-white text-slate-800 border-slate-200 shadow-2xs'
            }`}>
              👥 {enrolledCount} {maxCap ? `/ ${maxCap}` : 'inscrits'}
            </span>
          </div>

          {/* Titre */}
          <h3 className={`text-base font-black leading-snug group-hover:text-indigo-600 transition-colors ${
            isPast ? 'text-slate-700' : isSoir ? 'text-purple-950' : 'text-blue-950'
          }`}>
            {event.title}
          </h3>

          {/* Date & Horaires */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600 font-semibold">
            <span className="font-bold text-slate-800">
              {format(eventDateObj, 'EEEE d MMMM yyyy', { locale: fr })}
            </span>
            <span>•</span>
            <span className="font-bold text-indigo-700 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-indigo-500" />
              {isSession 
                ? `${rawSession?.time || ''}${rawSession?.endTime ? ` - ${rawSession.endTime}` : ''}`
                : (rawConv?.departureDate?.includes('T') ? rawConv.departureDate.split('T')[1] : '')}
            </span>
            {(rawSession?.location || rawConv?.meetingLocation || rawConv?.guides) && (
              <>
                <span>•</span>
                <span className="flex items-center gap-1 text-slate-600 truncate max-w-[220px]">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">{rawSession?.location || rawConv?.meetingLocation || rawConv?.guides}</span>
                </span>
              </>
            )}
          </div>

          {/* Règle d'inscription */}
          {deadlineText && deadlineText !== 'Inscriptions sans date limite' && (
            <div className="text-[11px] text-indigo-800 font-medium flex items-center gap-1">
              <Timer className="w-3 h-3 text-indigo-500 shrink-0" />
              <span className="truncate">{deadlineText}</span>
            </div>
          )}

          {/* Description si présente */}
          {rawSession?.description && (
            <p className="text-xs text-slate-500 line-clamp-1 font-normal">
              {rawSession.description}
            </p>
          )}
        </div>

        {/* Barre d'action */}
        <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap" onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-1.5">
            {rawSession?.attachedPdf && (
              <button
                type="button"
                onClick={() => {
                  const link = document.createElement('a');
                  link.href = rawSession.attachedPdf!.fileData;
                  link.download = rawSession.attachedPdf!.fileName || 'document.pdf';
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors cursor-pointer"
                title={`Télécharger ${rawSession.attachedPdf.fileName}`}
              >
                <Download className="w-3 h-3 text-rose-600" />
                <span>PDF Infos</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setSelectedEvent(event)}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              Fiche & Inscrits
            </button>
          </div>

          <div>
            {!isPast && !isFull && isSession && !rawSession?.blockOnlineRegistration && (
              <button
                type="button"
                onClick={() => setEnrollingSession(rawSession)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 rounded-lg shadow-xs transition-all cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>S'inscrire</span>
              </button>
            )}
            {!isPast && isSession && rawSession?.blockOnlineRegistration && (
              <span className="text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg">
                Inscription directe prof
              </span>
            )}
            {!isPast && !isSession && (
              <button
                type="button"
                onClick={() => setSelectedEvent(event)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors cursor-pointer"
              >
                Convocation UNSS
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderFocusEventCard = (event: CalendarEvent) => {
    const isSession = event.type === 'session';
    const rawSession = isSession ? (event.raw as Session) : null;
    const rawConv = !isSession ? (event.raw as Convocation) : null;
    const cleanDateStr = event.date.slice(0, 10);
    const eventDateObj = new Date(`${cleanDateStr}T12:00:00`);
    const isPast = new Date(event.date).setHours(23, 59, 59, 999) < new Date().getTime();
    const isFull = rawSession?.maxParticipants !== undefined && ((rawSession.enrolledStudentIds || []).length >= rawSession.maxParticipants);
    const enrolledCount = event.studentIds.length;
    const enrolledStudents = getEnrolledStudents(event.studentIds);
    const maxCap = rawSession?.maxParticipants;
    const rel = getEventRelativeBadge(event.date);

    return (
      <div
        key={event.id}
        onClick={() => {
          setSelectedEvent(event);
        }}
        className={`group bg-white rounded-2xl border-2 transition-all p-4 sm:p-5 shadow-xs hover:shadow-md cursor-pointer active:scale-[0.99] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
          rel.isToday
            ? 'border-emerald-500 bg-emerald-50/20 ring-2 ring-emerald-500/20'
            : rel.isTomorrow
            ? 'border-amber-400 bg-amber-50/20'
            : isSession
            ? 'border-indigo-100 hover:border-indigo-400'
            : 'border-emerald-100 hover:border-emerald-400'
        }`}
      >
        {/* Colonne Date & Details */}
        <div className="flex items-start sm:items-center gap-3.5 min-w-0 flex-1">
          {/* Badge Date */}
          <div className={`shrink-0 w-16 sm:w-20 py-2 sm:py-2.5 rounded-2xl text-center border flex flex-col justify-center shadow-xs transition-transform group-hover:scale-105 ${
            rel.isToday
              ? 'bg-emerald-600 text-white border-emerald-700'
              : rel.isTomorrow
              ? 'bg-amber-500 text-white border-amber-600'
              : 'bg-slate-100 text-slate-800 border-slate-200/90'
          }`}>
            <span className={`text-[10px] font-black uppercase tracking-wider ${
              rel.isToday || rel.isTomorrow ? 'text-white/90' : 'text-slate-500'
            }`}>
              {format(eventDateObj, 'EEE', { locale: fr })}
            </span>
            <span className="text-xl sm:text-2xl font-black leading-none my-0.5 tracking-tight">
              {format(eventDateObj, 'dd')}
            </span>
            <span className={`text-[10px] font-bold uppercase tracking-wider ${
              rel.isToday || rel.isTomorrow ? 'text-white/90' : 'text-indigo-700'
            }`}>
              {format(eventDateObj, 'MMM', { locale: fr })}
            </span>
          </div>

          {/* Corps de l'événement */}
          <div className="space-y-1.5 min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              {/* Badge relatif */}
              <span className={`text-[10px] uppercase tracking-wider px-2.5 py-0.5 rounded-full ${rel.className}`}>
                {rel.text}
              </span>

              {/* Type */}
              <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                isSession ? 'bg-indigo-100 text-indigo-800' : 'bg-emerald-100 text-emerald-800'
              }`}>
                {isSession ? 'Séance' : 'Compétition UNSS'}
              </span>

              {rawSession?.isTeamRegistration && (
                <span className="text-[10px] font-bold bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Users className="w-3 h-3" /> Tournoi ({rawSession.teamSize || 4} élèves)
                </span>
              )}

              {rawSession?.blockOnlineRegistration && (
                <span className="text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Lock className="w-3 h-3 text-amber-700" />
                  {rawSession.directRegistrationTeacherName ? `Voir ${rawSession.directRegistrationTeacherName}` : 'Direct prof'}
                </span>
              )}

              {isFull && !isPast && (
                <span className="text-[10px] font-bold bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full">
                  Complet
                </span>
              )}
            </div>

            <h3 className="text-base sm:text-lg font-black text-slate-900 leading-snug group-hover:text-indigo-600 transition-colors">
              {event.title}
            </h3>

            <div className="flex flex-wrap items-center gap-y-1 gap-x-3 text-xs text-slate-600 font-semibold">
              <span className="flex items-center gap-1 text-slate-700">
                <Clock className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span>
                  {isSession 
                    ? `${rawSession?.time || ''}${rawSession?.endTime ? ` - ${rawSession.endTime}` : ''}` 
                    : (rawConv?.departureDate?.includes('T') ? rawConv.departureDate.split('T')[1] : '')}
                </span>
              </span>

              {(rawSession?.location || rawConv?.guides || rawConv?.meetingLocation) && (
                <>
                  <span className="text-slate-300">•</span>
                  <span className="flex items-center gap-1 text-slate-700">
                    <MapPin className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    <span className="truncate max-w-[200px] sm:max-w-none">
                      {rawSession?.location || rawConv?.meetingLocation || rawConv?.guides}
                    </span>
                  </span>
                </>
              )}

              <span className="text-slate-300">•</span>
              <span className="flex items-center gap-1 text-slate-700">
                <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>
                  {enrolledCount} inscrit{enrolledCount > 1 ? 's' : ''} {maxCap ? `/ ${maxCap}` : ''}
                </span>
              </span>

              {rawSession?.needSnack && (
                <>
                  <span className="text-slate-300">•</span>
                  <span className="text-amber-700 font-bold">🍪 Goûter</span>
                </>
              )}
            </div>

            {rawSession?.description && (
              <p className="text-xs text-slate-500 line-clamp-1 font-normal">
                {rawSession.description}
              </p>
            )}

            {/* Noms des élèves inscrits affichés directement sur la carte */}
            <div className="pt-2 border-t border-slate-100/90 mt-2">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Élèves inscrits ({enrolledStudents.length}{maxCap ? ` / ${maxCap} places` : ''}) :</span>
                </span>
                {enrolledStudents.length > 0 && (
                  <span className="text-[10px] font-semibold text-slate-400 hidden sm:inline">
                    Cliquez sur la séance pour la fiche détaillée
                  </span>
                )}
              </div>

              {enrolledStudents.length === 0 ? (
                <p className="text-xs text-slate-400 italic">
                  Aucun élève encore inscrit à ce créneau.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {enrolledStudents.map((st) => (
                    <span
                      key={st.id}
                      className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-indigo-50/90 hover:bg-indigo-100 text-indigo-950 font-bold border border-indigo-200/80 transition-colors shadow-2xs"
                      title={`${st.name} ${st.classGroup ? `(${st.classGroup})` : ''}`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                      <span>{st.name}</span>
                      {st.classGroup && (
                        <span className="text-[10px] font-semibold text-indigo-700 bg-white/90 px-1.5 py-0.5 rounded border border-indigo-100 ml-0.5">
                          {st.classGroup}
                        </span>
                      )}
                    </span>
                  ))}
                </div>
              )}

              {/* Si tournoi avec équipes */}
              {rawSession?.isTeamRegistration && (rawSession.teams || []).length > 0 && (
                <div className="mt-2 pt-2 border-t border-purple-100/80 space-y-1.5">
                  <span className="text-xs font-black text-purple-900 flex items-center gap-1">
                    <Users className="w-3.5 h-3.5 text-purple-600" />
                    <span>Équipes enregistrées ({rawSession.teams!.length}) :</span>
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {rawSession.teams!.map((team, idx) => (
                      <div key={team.id || idx} className="bg-purple-50/70 p-2 rounded-xl border border-purple-200 text-xs">
                        <div className="font-bold text-purple-950 flex items-center justify-between mb-1">
                          <span>{team.name}</span>
                          <span className="text-[10px] font-semibold text-purple-700 bg-white px-1.5 py-0.5 rounded border border-purple-200">
                            {team.studentIds?.length || 0} / {rawSession.teamSize || 4} élèves
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {(team.studentIds || []).map(sid => {
                            const st = effectiveStudents.find(s => s.id === sid);
                            return (
                              <span key={sid} className="bg-white px-1.5 py-0.5 rounded text-[11px] font-medium text-slate-800 border border-purple-100">
                                {st ? `${st.lastName} ${st.firstName}` : sid}
                                {st?.classGroup ? ` (${st.classGroup})` : ''}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Colonne droite : Actions CTA */}
        <div className="shrink-0 w-full sm:w-auto flex items-center justify-between sm:justify-end gap-2 border-t sm:border-t-0 pt-2.5 sm:pt-0 border-slate-100">
          {isPublic && isSession && (
            <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedEvent(event);
                }}
                className="flex-1 sm:flex-initial px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-1 cursor-pointer"
                title="Consulter les détails et la liste des inscrits"
              >
                <Users className="w-3.5 h-3.5 text-indigo-600" />
                <span>Inscrits ({enrolledCount})</span>
              </button>

              {!isPast && !isFull ? (
                rawSession?.blockOnlineRegistration ? (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-900 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-xl shadow-2xs">
                    <Lock className="w-3.5 h-3.5 text-amber-700" />
                    {rawSession.directRegistrationTeacherName 
                      ? `Avec ${rawSession.directRegistrationTeacherName}` 
                      : "Auprès du professeur"}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (rawSession) {
                        setEnrollingSession(rawSession);
                      }
                    }}
                    className="flex-1 sm:flex-initial px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-black text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer hover:shadow-indigo-500/20"
                  >
                    <span>{rawSession?.isTeamRegistration ? 'Inscrire équipe' : "M'inscrire"}</span>
                    <ChevronRight className="w-3.5 h-3.5 stroke-[2.5]" />
                  </button>
                )
              ) : (
                <span className="text-xs font-bold text-slate-400 bg-slate-100 px-3 py-1.5 rounded-xl">
                  {isPast ? 'Passée' : 'Complet'}
                </span>
              )}
            </div>
          )}

          {isPublic && !isSession && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedEvent(event);
              }}
              className="w-full sm:w-auto px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs rounded-xl border border-emerald-200 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Users className="w-3.5 h-3.5 text-emerald-600" />
              <span>Inscrits & Détails ({enrolledCount})</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}

          {!isPublic && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedEvent(event);
                }}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg transition-colors cursor-pointer"
              >
                Gérer
              </button>
              {isSession && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openEditModal(event);
                  }}
                  className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors cursor-pointer"
                  title="Modifier"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return <div className="text-center py-20 text-slate-500 font-medium">Chargement du calendrier...</div>;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header adapté smartphone & desktop */}
      <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col gap-3 sm:gap-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center shrink-0 border ${
              viewMode === 'columns'
                ? 'bg-purple-600 text-white border-purple-700 shadow-sm'
                : viewMode === 'focus' 
                ? 'bg-indigo-600 text-white border-indigo-700 shadow-sm' 
                : 'bg-indigo-50 text-indigo-600 border border-indigo-100'
            }`}>
              {viewMode === 'columns' ? (
                <Layers className="w-5 h-5 sm:w-6 sm:h-6 text-purple-100" />
              ) : viewMode === 'focus' ? (
                <Sparkles className="w-5 h-5 sm:w-6 sm:h-6" />
              ) : (
                <CalendarIcon className="w-5 h-5 sm:w-6 sm:h-6" />
              )}
            </div>
            <div className="min-w-0">
              <h2 className="text-lg sm:text-2xl font-black text-slate-900 tracking-tight truncate">
                {viewMode === 'columns'
                  ? "Créneaux d'Activités & Compétitions"
                  : viewMode === 'focus' 
                  ? "Focus semaine & à venir" 
                  : viewMode === 'agenda' 
                  ? "Planning complet de la saison" 
                  : format(currentMonth, 'MMMM yyyy', { locale: fr })}
              </h2>
              <p className="text-xs sm:text-sm font-semibold text-slate-500 truncate">
                {viewMode === 'columns'
                  ? "AS du Soir (Mardi & Jeudi) & Séances du Mercredi"
                  : viewMode === 'focus'
                  ? `Du ${format(currentWeekStart, 'd MMMM', { locale: fr })} au ${format(nextWeekEnd, 'd MMMM yyyy', { locale: fr })}`
                  : isPublic 
                  ? "Séances & compétitions — AS Lycée Rosa Parks" 
                  : "Gérez les séances et convocations"}
              </p>
            </div>
          </div>

          {/* Navigation Mois ou Action Focus */}
          {viewMode === 'month' ? (
            <div className="flex items-center gap-1.5 shrink-0">
              <button 
                onClick={prevMonth} 
                className="p-2 sm:p-2.5 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-xl border border-slate-200 transition-colors cursor-pointer" 
                title="Mois précédent"
                aria-label="Mois précédent"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button 
                onClick={() => setCurrentMonth(new Date())}
                className="hidden md:inline-flex px-3 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors cursor-pointer"
              >
                Aujourd'hui
              </button>
              {nearestEvent && !isSameMonth(new Date(nearestEvent.date), currentMonth) && (
                <button 
                  type="button"
                  onClick={() => setCurrentMonth(new Date(nearestEvent.date))}
                  className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-xl border border-indigo-200 transition-colors cursor-pointer"
                  title={`Afficher le mois des événements (${format(new Date(nearestEvent.date), 'MMMM yyyy', { locale: fr })})`}
                >
                  <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Voir {format(new Date(nearestEvent.date), 'MMM yyyy', { locale: fr })}</span>
                </button>
              )}
              <button 
                onClick={nextMonth} 
                className="p-2 sm:p-2.5 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-xl border border-slate-200 transition-colors cursor-pointer" 
                title="Mois suivant"
                aria-label="Mois suivant"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          ) : viewMode === 'focus' ? (
            <div className="flex items-center gap-2 shrink-0">
              <span className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-700 font-bold text-xs rounded-xl border border-indigo-200">
                <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse" />
                <span>{twoWeeksEventsCount} événement{twoWeeksEventsCount > 1 ? 's' : ''} sur 15j</span>
              </span>
            </div>
          ) : viewMode === 'columns' ? (
            <div className="flex items-center gap-2 shrink-0">
              <span className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 text-purple-800 font-bold text-xs rounded-xl border border-purple-200">
                <Moon className="w-3.5 h-3.5 text-purple-600" />
                <span>AS du Soir ({totalAsSoir})</span>
                <span className="text-slate-300">•</span>
                <Zap className="w-3.5 h-3.5 text-blue-600" />
                <span>Mercredi ({totalMercredi})</span>
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setViewMode('columns')}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-xl border border-indigo-200 transition-all cursor-pointer shadow-2xs"
              >
                <Layers className="w-3.5 h-3.5 text-indigo-600" />
                <span className="hidden sm:inline">Vue 2 Colonnes</span>
                <span className="sm:hidden">2 Colonnes</span>
              </button>
            </div>
          )}
        </div>

        {/* Barre d'outils tactile : Onglets Focus / Planning / Mois & Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100">
          {/* Sélecteur de vue tactile pour smartphone & mode planning */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold flex-wrap gap-1">
              <button
                type="button"
                onClick={() => setViewMode('columns')}
                className={`px-3 sm:px-3.5 py-2 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                  viewMode === 'columns' ? 'bg-indigo-600 text-white shadow-xs font-black' : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Affichage en 2 colonnes : AS du Soir et Séances Mercredi"
              >
                <Layers className="w-4 h-4" />
                <span>2 Colonnes ({events.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('focus')}
                className={`px-3 sm:px-3.5 py-2 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                  viewMode === 'focus' ? 'bg-indigo-600 text-white shadow-xs font-black' : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Focus sur cette semaine et la semaine prochaine"
              >
                <Sparkles className="w-4 h-4" />
                <span>Focus 15j ({twoWeeksEventsCount})</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('agenda')}
                className={`px-3 sm:px-3.5 py-2 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                  viewMode === 'agenda' ? 'bg-indigo-600 text-white shadow-xs font-black' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Users className="w-4 h-4" />
                <span>Planning ({events.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('month')}
                className={`px-3 sm:px-3.5 py-2 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                  viewMode === 'month' ? 'bg-indigo-600 text-white shadow-xs font-black' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <CalendarIcon className="w-4 h-4" />
                <span>Mois ({currentMonthEvents.length})</span>
              </button>
            </div>

            {viewMode === 'agenda' && events.length > 0 && (
              <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setAgendaScope('all')}
                  className={`px-2.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                    agendaScope === 'all' ? 'bg-white text-indigo-700 font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Toute la saison ({events.length})
                </button>
                <button
                  type="button"
                  onClick={() => setAgendaScope('month')}
                  className={`px-2.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                    agendaScope === 'month' ? 'bg-white text-indigo-700 font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Ce mois ({currentMonthEvents.length})
                </button>
              </div>
            )}
            {viewMode !== 'columns' && (
              <button
                type="button"
                onClick={() => setShowAllAsSoir(!showAllAsSoir)}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all border flex items-center gap-1.5 cursor-pointer ${
                  showAllAsSoir 
                    ? 'bg-purple-100 text-purple-900 border-purple-300' 
                    : 'bg-white text-slate-700 hover:bg-slate-50 border-slate-200 shadow-2xs'
                }`}
                title={showAllAsSoir ? "Afficher tous les créneaux AS du Soir de l'année" : "Limité d'une semaine à l'autre pour ne pas encombrer le calendrier"}
              >
                <Moon className="w-3.5 h-3.5 text-purple-600" />
                <span className="hidden md:inline">AS du Soir :</span>
                <span>{showAllAsSoir ? 'Tout afficher' : '1-2 semaines'}</span>
              </button>
            )}
          </div>

          {/* Boutons d'actions */}
          <div className="flex items-center gap-2">
            {isPublic && (
              <button
                type="button"
                onClick={() => downloadRegistrationForm(registrationForm)}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white rounded-xl font-bold text-xs transition-all shadow-xs cursor-pointer"
                title="Télécharger la fiche d'inscription"
              >
                <Download className="w-3.5 h-3.5 stroke-[2.5]" />
                <span className="hidden sm:inline">Télécharger la fiche d'inscription</span>
                <span className="sm:hidden">Fiche d'adhésion</span>
              </button>
            )}

            {!isPublic && (
              <>
                <button 
                  type="button"
                  onClick={() => setIsFormModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl font-bold text-xs transition-colors"
                >
                  <FileUp className="w-3.5 h-3.5" />
                  <span>Formulaire AS</span>
                </button>
                <button 
                  onClick={handleShare}
                  className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 text-white hover:bg-slate-800 rounded-xl font-bold text-xs transition-colors"
                  title="Partager le calendrier"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Partager</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Bannière de téléchargement du formulaire sur le calendrier partagé */}
      {isPublic && (
        <div className="bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-900 rounded-2xl p-4 sm:p-6 text-white border border-indigo-800/60 shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-in fade-in duration-200">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 flex items-center justify-center shrink-0 shadow-inner">
              <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-200" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider bg-indigo-500/30 text-indigo-200 px-2 py-0.5 rounded-full border border-indigo-400/30">
                  Adhésion & Licence UNSS
                </span>
                <span className="text-[11px] text-slate-300 hidden sm:inline">
                  {registrationForm?.fileName ? "● Formulaire officiel actif" : "● Fiche d'adhésion officielle"}
                </span>
              </div>
              <h3 className="text-base sm:text-lg font-black text-white mt-1 leading-snug tracking-tight">
                Fiche d'inscription & adhésion à l'AS
              </h3>
              <p className="text-xs text-slate-300 mt-0.5 max-w-2xl leading-relaxed">
                À imprimer, faire signer et remettre aux professeurs d'EPS avec le règlement pour participer aux activités.
              </p>
            </div>
          </div>

          <div className="shrink-0 w-full md:w-auto">
            <button
              type="button"
              onClick={() => downloadRegistrationForm(registrationForm)}
              className="w-full md:w-auto flex items-center justify-center gap-2 px-5 py-2.5 sm:py-3 bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 font-black rounded-xl text-xs sm:text-sm transition-all shadow-md cursor-pointer"
            >
              <Download className="w-4 h-4 stroke-[2.5]" />
              <span>
                {registrationForm?.fileName 
                  ? `Télécharger le document (${formatFileSize(registrationForm.fileSize)})` 
                  : "Télécharger la fiche d'inscription"}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* En mode Enseignant/Admin : Récapitulatif du document en ligne */}
      {!isPublic && (
        <div className="bg-white px-5 py-3.5 rounded-xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 border border-indigo-100">
              <FileText className="w-4 h-4" />
            </div>
            <div className="truncate">
              <span className="font-bold text-slate-800">Formulaire d'inscription sur le calendrier partagé : </span>
              {registrationForm ? (
                <span className="text-slate-600">
                  <strong className="text-slate-900">{registrationForm.fileName}</strong> ({formatFileSize(registrationForm.fileSize)}) — Mis en ligne le {new Date(registrationForm.updatedAt).toLocaleDateString('fr-FR')}
                </span>
              ) : (
                <span className="text-amber-700">Aucun fichier personnalisé téléversé (modèle standard proposé par défaut).</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => downloadRegistrationForm(registrationForm)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-slate-700 hover:text-slate-950 bg-slate-100 hover:bg-slate-200/80 rounded-lg font-semibold transition-colors"
              title="Tester le téléchargement du formulaire actuel"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Tester le téléchargement</span>
            </button>
            <button
              type="button"
              onClick={() => setIsFormModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold transition-colors shadow-xs"
            >
              <FileUp className="w-3.5 h-3.5" />
              <span>{registrationForm ? "Remplacer le fichier" : "Charger le fichier"}</span>
            </button>
          </div>
        </div>
      )}

      {/* VUE 1 : AFFICHAGE EN 2 COLONNES (AS DU SOIR & MERCREDI) */}
      {viewMode === 'columns' ? (
        <div className="space-y-4 sm:space-y-6 mb-6 animate-in fade-in duration-150">
          {/* Barre d'outils et sélecteur de colonne */}
          <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200/90 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            {/* Sélecteur de colonnes */}
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
              <button
                type="button"
                onClick={() => setColumnCategory('all')}
                className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  columnCategory === 'all'
                    ? 'bg-white text-slate-900 shadow-xs font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Layers className="w-3.5 h-3.5 text-indigo-600" />
                <span>2 Colonnes</span>
              </button>
              <button
                type="button"
                onClick={() => setColumnCategory('as_soir')}
                className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  columnCategory === 'as_soir'
                    ? 'bg-purple-600 text-white shadow-xs font-black'
                    : 'text-purple-800 hover:bg-purple-50'
                }`}
              >
                <Moon className="w-3.5 h-3.5 text-purple-300" />
                <span>AS du Soir ({totalAsSoir})</span>
              </button>
              <button
                type="button"
                onClick={() => setColumnCategory('mercredi')}
                className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  columnCategory === 'mercredi'
                    ? 'bg-blue-600 text-white shadow-xs font-black'
                    : 'text-blue-800 hover:bg-blue-50'
                }`}
              >
                <Zap className="w-3.5 h-3.5 text-blue-300" />
                <span>Mercredi ({totalMercredi})</span>
              </button>
            </div>

            {/* Recherche et bascule AS du Soir */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Rechercher un créneau, un sport, un lieu, une date..."
                  value={calendarSearch}
                  onChange={e => setCalendarSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                />
              </div>

              <button
                type="button"
                onClick={() => setShowAllAsSoir(!showAllAsSoir)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border flex items-center justify-center gap-1.5 cursor-pointer shrink-0 ${
                  showAllAsSoir 
                    ? 'bg-purple-100 text-purple-900 border-purple-300' 
                    : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-200'
                }`}
                title={showAllAsSoir ? "Affichage de tous les créneaux AS du soir de la saison" : "Affichage limité d'une semaine à l'autre"}
              >
                <Moon className="w-3.5 h-3.5 text-purple-600" />
                <span className="hidden md:inline">AS du Soir :</span>
                <span>{showAllAsSoir ? 'Toutes les semaines' : "D'une semaine à l'autre"}</span>
              </button>
            </div>
          </div>

          {/* Grille 2 Colonnes */}
          <div className={`grid gap-4 sm:gap-6 ${
            columnCategory === 'all' ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1 max-w-4xl mx-auto'
          }`}>
            {/* ========================================================= */}
            {/* COLONNE 1 : AS DU SOIR (Mardi ou Jeudi 17h00 - 18h00)      */}
            {/* ========================================================= */}
            {(columnCategory === 'all' || columnCategory === 'as_soir') && (
              <div className="bg-white rounded-2xl shadow-xs border border-purple-200 overflow-hidden flex flex-col min-h-[500px]">
                {/* En-tête */}
                <div className="p-3.5 sm:p-4 border-b border-purple-100 bg-gradient-to-r from-purple-50 via-indigo-50/50 to-purple-50 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-purple-600 text-white flex items-center justify-center shadow-xs">
                      <Moon className="w-4 h-4 sm:w-5 sm:h-5 text-purple-100" />
                    </div>
                    <div>
                      <h3 className="font-black text-slate-900 text-sm sm:text-base leading-tight flex items-center gap-1.5">
                        <span>AS du Soir</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 font-black border border-purple-200">
                          {totalAsSoir}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-bold border border-indigo-200 hidden sm:inline" title="Affichage limité d'une semaine à l'autre pour ne pas encombrer le calendrier">
                          D'une semaine à l'autre
                        </span>
                      </h3>
                      <p className="text-[10px] sm:text-xs font-semibold text-purple-700">
                        Mardi ou Jeudi (17h00 - 18h00) • Récurrents
                      </p>
                    </div>
                  </div>

                  {!isPublic && (
                    <button
                      type="button"
                      onClick={() => handleDayClick(new Date())}
                      className="p-1.5 text-purple-700 hover:bg-purple-100 rounded-lg transition-colors cursor-pointer"
                      title="Créer un créneau"
                    >
                      <PlusCircle className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                  )}
                </div>

                {/* Liste des séances AS du Soir */}
                <div className="p-3 sm:p-4 space-y-3 flex-1 overflow-y-auto">
                  {/* Séances à venir */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-[11px] font-black uppercase tracking-wider text-purple-900 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-purple-600 animate-pulse" />
                        À venir ({asSoirUpcoming.length})
                      </span>
                      {!showAllAsSoir && (
                        <span className="text-[10px] font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-100">
                          Semaine en cours & suivante
                        </span>
                      )}
                    </div>

                    {asSoirUpcoming.map(ev => renderColumnEventCard(ev, false))}

                    {asSoirUpcoming.length === 0 && (
                      <div className="p-6 text-center text-xs text-purple-800/70 bg-purple-50/40 rounded-xl border border-dashed border-purple-200 font-medium">
                        Aucun créneau du soir programmé à venir.
                      </div>
                    )}

                    {/* Semaines ultérieures masquées par défaut pour ne pas surcharger */}
                    {asSoirUpcomingLater.length > 0 && !showAllAsSoir && (
                      <div className="pt-2 border-t border-purple-100">
                        <button
                          type="button"
                          onClick={() => setShowLaterAsSoir(!showLaterAsSoir)}
                          className="w-full flex items-center justify-between p-2 rounded-xl bg-purple-50/70 hover:bg-purple-100/70 text-purple-900 text-xs font-bold border border-purple-200 transition-colors cursor-pointer"
                        >
                          <div className="flex items-center gap-1.5">
                            <CalendarDays className="w-3.5 h-3.5 text-purple-600" />
                            <span>Semaines suivantes ({asSoirUpcomingLater.length} créneaux)</span>
                          </div>
                          <div className="flex items-center gap-1 text-[10px] text-purple-700">
                            <span>{showLaterAsSoir ? 'Masquer' : 'Afficher'}</span>
                            {showLaterAsSoir ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          </div>
                        </button>

                        {showLaterAsSoir && (
                          <div className="mt-2 space-y-2 animate-in fade-in">
                            {asSoirUpcomingLater.map(ev => renderColumnEventCard(ev, false))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Historique AS du Soir */}
                  {asSoirPast.length > 0 && (
                    <div className="pt-3 border-t border-purple-100">
                      <button
                        type="button"
                        onClick={() => setIsAsSoirHistoryOpen(!isAsSoirHistoryOpen)}
                        className="w-full flex items-center justify-between p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold border border-slate-200 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-1.5">
                          <History className="w-3.5 h-3.5 text-purple-600" />
                          <span>Historique des créneaux passés ({asSoirPast.length})</span>
                        </div>
                        {isAsSoirHistoryOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>

                      {isAsSoirHistoryOpen && (
                        <div className="mt-2 space-y-2 animate-in fade-in">
                          {asSoirPast.map(ev => renderColumnEventCard(ev, true))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ========================================================= */}
            {/* COLONNE 2 : SÉANCES MERCREDI (Ponctuels, compétitions...)   */}
            {/* ========================================================= */}
            {(columnCategory === 'all' || columnCategory === 'mercredi') && (
              <div className="bg-white rounded-2xl shadow-xs border border-blue-200 overflow-hidden flex flex-col min-h-[500px]">
                {/* En-tête */}
                <div className="p-3.5 sm:p-4 border-b border-blue-100 bg-gradient-to-r from-blue-50 via-cyan-50/50 to-blue-50 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
                      <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-blue-100" />
                    </div>
                    <div>
                      <h3 className="font-black text-slate-900 text-sm sm:text-base leading-tight flex items-center gap-1.5">
                        <span>Séances Mercredi</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-black border border-blue-200">
                          {totalMercredi}
                        </span>
                      </h3>
                      <p className="text-[10px] sm:text-xs font-semibold text-blue-700">
                        Mercredi • Créneaux ponctuels
                      </p>
                    </div>
                  </div>

                  {!isPublic && (
                    <button
                      type="button"
                      onClick={() => handleDayClick(new Date())}
                      className="p-1.5 text-blue-700 hover:bg-blue-100 rounded-lg transition-colors cursor-pointer"
                      title="Créer un créneau"
                    >
                      <PlusCircle className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                  )}
                </div>

                {/* Liste des séances Mercredi */}
                <div className="p-3 sm:p-4 space-y-3 flex-1 overflow-y-auto">
                  {/* Séances à venir */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-[11px] font-black uppercase tracking-wider text-blue-900 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
                        À venir ({mercrediUpcoming.length})
                      </span>
                    </div>

                    {mercrediUpcoming.map(ev => renderColumnEventCard(ev, false))}

                    {mercrediUpcoming.length === 0 && (
                      <div className="p-6 text-center text-xs text-blue-800/70 bg-blue-50/40 rounded-xl border border-dashed border-blue-200 font-medium">
                        Aucune séance du mercredi programmée à venir.
                      </div>
                    )}
                  </div>

                  {/* Historique Mercredi */}
                  {mercrediPast.length > 0 && (
                    <div className="pt-3 border-t border-blue-100">
                      <button
                        type="button"
                        onClick={() => setIsMercrediHistoryOpen(!isMercrediHistoryOpen)}
                        className="w-full flex items-center justify-between p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold border border-slate-200 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-1.5">
                          <History className="w-3.5 h-3.5 text-blue-600" />
                          <span>Historique des créneaux passés ({mercrediPast.length})</span>
                        </div>
                        {isMercrediHistoryOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>

                      {isMercrediHistoryOpen && (
                        <div className="mt-2 space-y-2 animate-in fade-in">
                          {mercrediPast.map(ev => renderColumnEventCard(ev, true))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : viewMode === 'focus' ? (
        <div className="space-y-4 sm:space-y-6 mb-6 animate-in fade-in duration-150">
          {/* Sous-filtre tactile & indicateur */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 sm:p-4 rounded-2xl border border-slate-200/90 shadow-xs">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <span className="text-xs font-bold text-slate-500 mr-1 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-indigo-600" />
                Filtrer :
              </span>
              <button
                type="button"
                onClick={() => setFocusFilter('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  focusFilter === 'all'
                    ? 'bg-slate-900 text-white shadow-xs font-black'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Tous les 15 jours ({twoWeeksEventsCount})
              </button>
              <button
                type="button"
                onClick={() => setFocusFilter('thisWeek')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  focusFilter === 'thisWeek'
                    ? 'bg-indigo-600 text-white shadow-xs font-black'
                    : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                }`}
              >
                📍 Cette semaine ({thisWeekEvents.length})
              </button>
              <button
                type="button"
                onClick={() => setFocusFilter('nextWeek')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  focusFilter === 'nextWeek'
                    ? 'bg-purple-600 text-white shadow-xs font-black'
                    : 'bg-purple-50 text-purple-700 hover:bg-purple-100'
                }`}
              >
                🚀 Semaine prochaine ({nextWeekEvents.length})
              </button>
            </div>

            <div className="text-xs font-semibold text-slate-500 hidden sm:block">
              Aujourd'hui : {format(today, 'EEEE dd MMMM yyyy', { locale: fr })}
            </div>
          </div>

          {/* Cartes récapitulatives interactives */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            {/* Carte 1 : Cette semaine */}
            <div
              onClick={() => setFocusFilter(focusFilter === 'thisWeek' ? 'all' : 'thisWeek')}
              className={`p-4 sm:p-5 rounded-2xl border-2 transition-all cursor-pointer ${
                thisWeekEvents.length > 0
                  ? focusFilter === 'thisWeek'
                    ? 'bg-gradient-to-br from-indigo-500/10 to-indigo-50 border-indigo-600 shadow-md ring-2 ring-indigo-500/20'
                    : 'bg-white border-indigo-200 hover:border-indigo-400 shadow-xs'
                  : 'bg-slate-50/80 border-slate-200 text-slate-500'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2.5">
                  <span className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-sm ${
                    thisWeekEvents.length > 0 ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-600'
                  }`}>
                    📍
                  </span>
                  <div>
                    <h3 className="text-base font-black text-slate-900 leading-tight">
                      Cette semaine
                    </h3>
                    <p className="text-[11px] font-semibold text-slate-500">
                      Du {format(currentWeekStart, 'd MMMM', { locale: fr })} au {format(currentWeekEnd, 'd MMMM yyyy', { locale: fr })}
                    </p>
                  </div>
                </div>
                <span className={`text-xs font-black px-2.5 py-1 rounded-full ${
                  thisWeekEvents.length > 0 
                    ? 'bg-indigo-600 text-white shadow-2xs' 
                    : 'bg-slate-200 text-slate-600'
                }`}>
                  {thisWeekEvents.length} {thisWeekEvents.length > 1 ? 'événements' : 'événement'}
                </span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                {thisWeekEvents.length > 0 
                  ? `${thisWeekEvents.length} rendez-vous au programme cette semaine. Cliquez pour zoomer.` 
                  : "Aucune séance ni compétition prévue cette semaine (repos / trêve)."}
              </p>
            </div>

            {/* Carte 2 : Semaine à venir */}
            <div
              onClick={() => setFocusFilter(focusFilter === 'nextWeek' ? 'all' : 'nextWeek')}
              className={`p-4 sm:p-5 rounded-2xl border-2 transition-all cursor-pointer ${
                nextWeekEvents.length > 0
                  ? focusFilter === 'nextWeek'
                    ? 'bg-gradient-to-br from-purple-500/10 to-purple-50 border-purple-600 shadow-md ring-2 ring-purple-500/20'
                    : 'bg-white border-purple-200 hover:border-purple-400 shadow-xs'
                  : 'bg-slate-50/80 border-slate-200 text-slate-500'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2.5">
                  <span className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-sm ${
                    nextWeekEvents.length > 0 ? 'bg-purple-100 text-purple-700' : 'bg-slate-200 text-slate-600'
                  }`}>
                    🚀
                  </span>
                  <div>
                    <h3 className="text-base font-black text-slate-900 leading-tight">
                      Semaine à venir
                    </h3>
                    <p className="text-[11px] font-semibold text-slate-500">
                      Du {format(nextWeekStart, 'd MMMM', { locale: fr })} au {format(nextWeekEnd, 'd MMMM yyyy', { locale: fr })}
                    </p>
                  </div>
                </div>
                <span className={`text-xs font-black px-2.5 py-1 rounded-full ${
                  nextWeekEvents.length > 0 
                    ? 'bg-purple-600 text-white shadow-2xs' 
                    : 'bg-slate-200 text-slate-600'
                }`}>
                  {nextWeekEvents.length} {nextWeekEvents.length > 1 ? 'événements' : 'événement'}
                </span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                {nextWeekEvents.length > 0 
                  ? `${nextWeekEvents.length} rendez-vous programmés la semaine prochaine. Anticipez vos inscriptions !` 
                  : "Aucun événement programmé pour la semaine prochaine."}
              </p>
            </div>
          </div>

          {/* CAS OÙ LES 2 SEMAINES SONT VIDES */}
          {twoWeeksEventsCount === 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-4 shadow-xs">
              <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto border border-indigo-100">
                <CalendarDays className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900">Aucun événement sur les 15 prochains jours</h3>
                <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto mt-1 leading-relaxed">
                  Période calme (vacances scolaires, examens ou pause sportive).
                  {nearestEvent && ` Prochain rendez-vous enregistré : le ${format(new Date(nearestEvent.date), 'dd MMMM yyyy', { locale: fr })} (${nearestEvent.title}).`}
                </p>
              </div>
              <div className="pt-2 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setViewMode('agenda')}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Users className="w-4 h-4" />
                  <span>Consulter le planning complet ({events.length} événements)</span>
                </button>
              </div>
            </div>
          )}

          {/* SECTION 1 : CETTE SEMAINE */}
          {(focusFilter === 'all' || focusFilter === 'thisWeek') && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 px-1 pt-1">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-black uppercase tracking-wider text-indigo-700 bg-indigo-50 border border-indigo-200/80 px-3 py-1 rounded-lg">
                    📍 Cette semaine
                  </span>
                  <span className="text-xs font-bold text-slate-500 truncate">
                    du {format(currentWeekStart, 'd MMMM', { locale: fr })} au {format(currentWeekEnd, 'd MMMM', { locale: fr })}
                  </span>
                </div>
                <span className="text-xs font-bold text-slate-500 shrink-0">
                  {thisWeekEvents.length} événement{thisWeekEvents.length > 1 ? 's' : ''}
                </span>
              </div>

              {thisWeekEvents.length === 0 ? (
                <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-6 text-center space-y-2">
                  <p className="text-sm font-bold text-slate-700">Aucun événement prévu cette semaine</p>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    Pas d'entraînement ni de compétition officielle du {format(currentWeekStart, 'd MMMM', { locale: fr })} au {format(currentWeekEnd, 'd MMMM', { locale: fr })}.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {thisWeekEvents.map(renderFocusEventCard)}
                </div>
              )}
            </div>
          )}

          {/* SECTION 2 : SEMAINE PROCHAINE */}
          {(focusFilter === 'all' || focusFilter === 'nextWeek') && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 px-1 pt-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-black uppercase tracking-wider text-purple-700 bg-purple-50 border border-purple-200/80 px-3 py-1 rounded-lg">
                    🚀 Semaine prochaine
                  </span>
                  <span className="text-xs font-bold text-slate-500 truncate">
                    du {format(nextWeekStart, 'd MMMM', { locale: fr })} au {format(nextWeekEnd, 'd MMMM', { locale: fr })}
                  </span>
                </div>
                <span className="text-xs font-bold text-slate-500 shrink-0">
                  {nextWeekEvents.length} événement{nextWeekEvents.length > 1 ? 's' : ''}
                </span>
              </div>

              {nextWeekEvents.length === 0 ? (
                <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-6 text-center space-y-2">
                  <p className="text-sm font-bold text-slate-700">Aucun événement pour la semaine prochaine</p>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    Le planning de la semaine suivante n'a pas encore de créneau enregistré.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {nextWeekEvents.map(renderFocusEventCard)}
                </div>
              )}
            </div>
          )}

          {/* Bouton de bascule vers le planning complet */}
          <div className="pt-2 text-center">
            <button
              type="button"
              onClick={() => setViewMode('agenda')}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 rounded-xl text-xs font-bold transition-all border border-slate-200 cursor-pointer"
            >
              <Users className="w-4 h-4 text-slate-500" />
              <span>Consulter l'intégralité du planning annuel ({events.length} événements)</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : viewMode === 'agenda' ? (
        <div className="space-y-4 mb-6">
          {/* Bannière de retour rapide au Focus 15j */}
          <div className="bg-indigo-50/90 border border-indigo-200 rounded-2xl p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-indigo-950 shadow-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 animate-ping shrink-0" />
              <p className="text-xs sm:text-sm font-bold truncate">
                {twoWeeksEventsCount > 0 
                  ? `Focus 15 jours : ${thisWeekEvents.length} événement(s) cette semaine • ${nextWeekEvents.length} la semaine prochaine` 
                  : "Consultez le focus sur les événements de la semaine et de la semaine à venir"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setViewMode('focus')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-bold rounded-xl transition-all shadow-xs shrink-0 cursor-pointer self-start sm:self-auto"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Voir le Focus 15j ({twoWeeksEventsCount})</span>
            </button>
          </div>
          {events.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-3 shadow-xs">
              <div className="w-12 h-12 bg-indigo-50 text-indigo-500 rounded-full flex items-center justify-center mx-auto">
                <CalendarIcon className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-800">Aucun événement programmé</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Il n'y a pas encore de séance ou de convocation enregistrée pour cette année scolaire.
              </p>
            </div>
          ) : agendaScope === 'month' && currentMonthEvents.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-3 shadow-xs">
              <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto">
                <CalendarIcon className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-800">Aucun événement en {format(currentMonth, 'MMMM yyyy', { locale: fr })}</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                {events.length} événement{events.length > 1 ? 's sont' : ' est'} programmé{events.length > 1 ? 's' : ''} sur d'autres mois de la saison.
              </p>
              <div className="pt-2 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setAgendaScope('all')}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  Voir tous les événements ({events.length})
                </button>
                {nearestEvent && (
                  <button
                    type="button"
                    onClick={() => setCurrentMonth(new Date(nearestEvent.date))}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer"
                  >
                    Aller au 1er événement ({format(new Date(nearestEvent.date), 'MMMM yyyy', { locale: fr })})
                  </button>
                )}
              </div>
            </div>
          ) : (
            agendaMonthGroups.map(([monthKey, monthEvts]) => {
              const monthDate = new Date(`${monthKey}-01T00:00:00`);
              return (
                <div key={monthKey} className="space-y-3">
                  {agendaScope === 'all' && (
                    <div className="flex items-center gap-2 px-1 pt-2">
                      <span className="text-xs font-black uppercase tracking-wider text-indigo-700 bg-indigo-50 border border-indigo-200/80 px-3 py-1 rounded-lg">
                        {format(monthDate, 'MMMM yyyy', { locale: fr })}
                      </span>
                      <span className="text-xs font-bold text-slate-500">
                        ({monthEvts.length} événement{monthEvts.length > 1 ? 's' : ''})
                      </span>
                      <div className="flex-1 h-px bg-slate-200/80" />
                    </div>
                  )}

                  <div className="space-y-3">
                    {monthEvts.map(event => {
                      const isSession = event.type === 'session';
                      const rawSession = isSession ? (event.raw as Session) : null;
                      const rawConv = !isSession ? (event.raw as Convocation) : null;
                      const eventDateObj = new Date(event.date);
                      const isPast = new Date(event.date).setHours(23, 59, 59, 999) < new Date().getTime();
                      const isFull = rawSession?.maxParticipants !== undefined && ((rawSession.enrolledStudentIds || []).length >= rawSession.maxParticipants);

                      return (
                        <div
                          key={event.id}
                          onClick={() => {
                            setSelectedEvent(event);
                          }}
                          className={`bg-white rounded-2xl border-2 transition-all p-3.5 sm:p-4 shadow-xs hover:shadow-md cursor-pointer active:scale-[0.99] ${
                            isSession ? 'border-indigo-100 hover:border-indigo-400' : 'border-emerald-100 hover:border-emerald-400'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            {/* Badge Date bien visible pour le scroll sur smartphone */}
                            <div className="shrink-0 w-13 sm:w-16 py-2 bg-slate-100/90 rounded-xl text-center border border-slate-200/80 flex flex-col justify-center">
                              <span className="text-[10px] font-bold text-slate-500 uppercase">
                                {format(eventDateObj, 'EEE', { locale: fr })}
                              </span>
                              <span className="text-lg sm:text-xl font-black text-slate-900 leading-none my-0.5">
                                {format(eventDateObj, 'dd')}
                              </span>
                              <span className="text-[9px] font-bold text-indigo-700 uppercase">
                                {format(eventDateObj, 'MMM', { locale: fr })}
                              </span>
                            </div>

                            <div className="space-y-1 flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                                  isSession ? 'bg-indigo-100 text-indigo-800' : 'bg-emerald-100 text-emerald-800'
                                }`}>
                                  {isSession ? 'Séance' : 'Convocation'}
                                </span>
                                {rawSession?.isTeamRegistration && (
                                  <span className="text-[10px] font-bold bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                                    <Users className="w-3 h-3" /> Tournoi ({rawSession.teamSize || 4})
                                  </span>
                                )}
                                {isPast && (
                                  <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                                    Passé
                                  </span>
                                )}
                                {isFull && !isPast && (
                                  <span className="text-[10px] font-bold bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full">
                                    Complet
                                  </span>
                                )}
                              </div>

                              <h3 className="text-base sm:text-lg font-black text-slate-900 leading-snug">
                                {event.title}
                              </h3>

                              <div className="flex flex-wrap items-center gap-y-1 gap-x-3 text-xs text-slate-600 font-medium">
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                  <span>{isSession ? `${rawSession?.time || ''}${rawSession?.endTime ? ` - ${rawSession.endTime}` : ''}` : (rawConv?.departureDate?.includes('T') ? rawConv.departureDate.split('T')[1] : '')}</span>
                                </span>
                                {(rawSession?.location || rawConv?.guides) && (
                                  <>
                                    <span>•</span>
                                    <span className="flex items-center gap-1">
                                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                      <span className="truncate max-w-[150px] sm:max-w-none">{rawSession?.location || rawConv?.guides}</span>
                                    </span>
                                  </>
                                )}
                              </div>

                              {/* Noms des inscrits affichés en vue planning */}
                              {(() => {
                                const enrolledStudents = getEnrolledStudents(event.studentIds);
                                return (
                                  <div className="pt-1.5 border-t border-slate-100/90 mt-1">
                                    <div className="flex items-center gap-1 text-[11px] font-bold text-slate-700 mb-1">
                                      <Users className="w-3 h-3 text-indigo-600" />
                                      <span>Inscrits ({enrolledStudents.length}{rawSession?.maxParticipants ? ` / ${rawSession.maxParticipants}` : ''}) :</span>
                                    </div>
                                    {enrolledStudents.length === 0 ? (
                                      <span className="text-[11px] text-slate-400 italic">Aucun élève inscrit</span>
                                    ) : (
                                      <div className="flex flex-wrap gap-1">
                                        {enrolledStudents.map(st => (
                                          <span
                                            key={st.id}
                                            className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-indigo-50/90 text-indigo-950 font-bold border border-indigo-200/70 shadow-2xs"
                                            title={`${st.name} ${st.classGroup ? `(${st.classGroup})` : ''}`}
                                          >
                                            <span className="w-1 h-1 rounded-full bg-indigo-500" />
                                            <span>{st.name}</span>
                                            {st.classGroup && (
                                              <span className="text-[9px] text-indigo-700 bg-white px-1 py-0.2 rounded border border-indigo-100 font-semibold">
                                                {st.classGroup}
                                              </span>
                                            )}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>

                            <div className="shrink-0 flex flex-col items-end justify-between self-stretch">
                              <span className="text-[11px] font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-lg">
                                👥 {event.studentIds.length} {rawSession?.maxParticipants ? `/ ${rawSession.maxParticipants}` : ''}
                              </span>

                              {isPublic && isSession && !isPast && !isFull && (
                                rawSession?.blockOnlineRegistration ? (
                                  <span className="mt-2 text-[10px] font-bold text-amber-900 bg-amber-100 border border-amber-300 px-2 py-1 rounded-lg text-right flex items-center gap-1 shadow-2xs">
                                    <Lock className="w-3 h-3 text-amber-700" />
                                    {rawSession?.directRegistrationTeacherName ? `Voir ${rawSession.directRegistrationTeacherName}` : "Direct prof"}
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (rawSession) {
                                        setEnrollingSession(rawSession);
                                      }
                                    }}
                                    className="mt-2 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-black text-xs rounded-xl shadow-xs transition-all flex items-center gap-1 cursor-pointer"
                                  >
                                    <span>M'inscrire</span>
                                    <ChevronRight className="w-3.5 h-3.5" />
                                  </button>
                                )
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* VUE 2 : GRILLE MENSUELLE CLASSIQUE (OPTIMISÉE MOBILE) */
        <div className="space-y-4 mb-6">
          {/* Bannière de retour rapide au Focus 15j */}
          <div className="bg-indigo-50/90 border border-indigo-200 rounded-2xl p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-indigo-950 shadow-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 animate-ping shrink-0" />
              <p className="text-xs sm:text-sm font-bold truncate">
                {twoWeeksEventsCount > 0 
                  ? `Focus 15 jours : ${thisWeekEvents.length} événement(s) cette semaine • ${nextWeekEvents.length} la semaine prochaine` 
                  : "Consultez le focus sur les événements de la semaine et de la semaine à venir"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setViewMode('focus')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-bold rounded-xl transition-all shadow-xs shrink-0 cursor-pointer self-start sm:self-auto"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Voir le Focus 15j ({twoWeeksEventsCount})</span>
            </button>
          </div>
          {currentMonthEvents.length === 0 && events.length > 0 && (
            <div className="bg-amber-50 border border-amber-200/90 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-900 shadow-xs animate-in fade-in duration-200">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0 text-amber-700 text-lg border border-amber-200">
                  🗓️
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-amber-950">
                    Aucun événement pour {format(currentMonth, 'MMMM yyyy', { locale: fr })}
                  </p>
                  <p className="text-xs text-amber-800 truncate">
                    {events.length} événement{events.length > 1 ? 's sont' : ' est'} programmé{events.length > 1 ? 's' : ''} cette saison.
                    {nearestEvent && ` Prochaine séance : ${format(new Date(nearestEvent.date), 'dd MMMM yyyy', { locale: fr })}.`}
                  </p>
                </div>
              </div>
              {nearestEvent && (
                <button
                  type="button"
                  onClick={() => setCurrentMonth(new Date(nearestEvent.date))}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all whitespace-nowrap cursor-pointer active:scale-95 self-start sm:self-auto flex items-center gap-1.5"
                >
                  <span>Aller à {format(new Date(nearestEvent.date), 'MMMM yyyy', { locale: fr })}</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-md shadow-slate-200/50 overflow-hidden">
            <div className="grid grid-cols-7 border-b border-slate-200/80 bg-slate-50/50">
              {weekDays.map(day => (
                <div key={day} className="py-2.5 sm:py-3.5 text-center text-[10px] sm:text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                  <span className="hidden sm:inline">{day}</span>
                  <span className="sm:hidden">{day.charAt(0)}</span>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 auto-rows-fr">
            {days.map((day, dayIdx) => {
              const dayEvents = events.filter(e => isEventOnDay(e.date, day) && isEventVisibleInCalendar(e)).sort((a, b) => {
                const timeA = a.type === 'session' ? (a.raw as Session).time : (a.raw as Convocation).departureDate?.includes('T') ? (a.raw as Convocation).departureDate.split('T')[1] : '';
                const timeB = b.type === 'session' ? (b.raw as Session).time : (b.raw as Convocation).departureDate?.includes('T') ? (b.raw as Convocation).departureDate.split('T')[1] : '';
                return (timeA || '').localeCompare(timeB || '');
              });
              const isCurrentMonth = isSameMonth(day, currentMonth);
              
              return (
                <div 
                  key={day.toString()} 
                  onClick={() => handleDayClick(day)}
                  className={`group min-h-[75px] sm:min-h-[140px] p-1 sm:p-2 border-b border-r border-slate-100/80 transition-all duration-200 ${!isPublic ? 'cursor-pointer hover:bg-slate-50/80' : 'cursor-pointer sm:cursor-default'}
                    ${!isCurrentMonth ? 'bg-slate-50/40 opacity-40' : 'bg-white'}
                    ${dayIdx % 7 === 6 ? 'border-r-0' : ''}
                  `}
                >
                  <div className="flex justify-between items-start mb-0.5 sm:mb-1.5">
                    <div className={`text-xs sm:text-sm font-bold w-6 h-6 sm:w-8 sm:h-8 flex items-center justify-center rounded-full transition-colors duration-200
                      ${isSameDay(day, new Date()) 
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200 ring-2 ring-indigo-600 ring-offset-2' 
                        : 'text-slate-600 group-hover:text-indigo-600 group-hover:bg-indigo-50'
                      }
                    `}>
                      {format(day, 'd')}
                    </div>
                    {!isPublic && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleDayClick(day); }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all rounded-lg cursor-pointer"
                        title="Ajouter un événement"
                      >
                        <PlusCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      </button>
                    )}
                  </div>
                  
                  <div className="space-y-1 mt-1 sm:mt-2">
                    {dayEvents.map(event => {
                      const enrolled = getEnrolledStudents(event.studentIds);
                      const titleTooltip = enrolled.length > 0 
                        ? `${event.title} • Inscrits (${enrolled.length}) : ${enrolled.map(s => s.name).join(', ')}`
                        : `${event.title} • Aucun inscrit`;

                      return (
                        <button
                          key={event.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedEvent(event);
                          }}
                          className={`w-full text-left px-1.5 sm:px-2 py-1.5 rounded-md sm:rounded-lg text-[10px] sm:text-xs font-semibold transition-all duration-200 border cursor-pointer ${
                            event.type === 'session' 
                              ? ((event.raw as Session)?.blockOnlineRegistration
                                  ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100 hover:border-amber-400 shadow-2xs font-bold'
                                  : 'bg-indigo-50/90 text-indigo-700 border-indigo-200/70 hover:bg-indigo-100 hover:border-indigo-300 shadow-2xs')
                              : 'bg-emerald-50/90 text-emerald-700 border-emerald-200/70 hover:bg-emerald-100 hover:border-emerald-300 shadow-2xs'
                          }`}
                          title={titleTooltip}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="truncate flex items-center gap-1 min-w-0 font-bold">
                              {(event.raw as Session)?.blockOnlineRegistration && (
                                <Lock className="w-3 h-3 text-amber-700 shrink-0" />
                              )}
                              <span className="truncate">{event.title}</span>
                            </span>
                            {enrolled.length > 0 && (
                              <span className="text-[9px] font-black bg-indigo-600 text-white px-1.5 py-0.2 rounded-full shrink-0 shadow-2xs">
                                {enrolled.length}
                              </span>
                            )}
                          </div>
                          {enrolled.length > 0 && (
                            <div className="text-[9px] font-semibold text-slate-700 truncate mt-1 pt-0.5 border-t border-slate-200/60 flex items-center gap-1">
                              <span className="text-indigo-600 font-bold">👥</span>
                              <span className="truncate">{enrolled.map(s => s.name).join(', ')}</span>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    )}

      {/* Legend */}
      <div className="flex flex-wrap gap-6 items-center text-sm font-semibold text-slate-600 px-4 py-3 bg-white rounded-xl border border-slate-200/80 shadow-sm inline-flex mb-8">
        <div className="flex items-center gap-2.5">
          <div className="w-3.5 h-3.5 rounded bg-indigo-500 shadow-sm"></div>
          <span>Séances & Entraînements</span>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="w-3.5 h-3.5 rounded bg-emerald-500 shadow-sm"></div>
          <span>Convocations & Évènements</span>
        </div>
      </div>

      {/* Event Details Modal */}
      {selectedEvent && (
        <div 
          className="fixed inset-0 z-50 flex flex-col items-center justify-center p-2 sm:p-4 bg-slate-900/50 backdrop-blur-sm overflow-hidden"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedEvent(null);
          }}
        >
          <div 
            className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-2xl max-h-[calc(100vh-1.5rem)] sm:max-h-[calc(100vh-3rem)] flex flex-col overflow-hidden border border-slate-200/50 animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 sm:p-8 border-b border-slate-100 flex justify-between items-start shrink-0 bg-white">
              <div>
                <div className="flex flex-wrap items-center gap-3 mb-2">
                  <span className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest
                    ${selectedEvent.type === 'session' ? 'bg-indigo-100/80 text-indigo-700' : 'bg-emerald-100/80 text-emerald-700'}
                  `}>
                    {selectedEvent.type === 'session' ? 'Séance' : 'Convocation'}
                  </span>
                  {selectedEvent.type === 'session' && (selectedEvent.raw as Session).isTeamRegistration && (
                    <span className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest bg-purple-100 text-purple-800 border border-purple-200">
                      🏆 En équipe ({(selectedEvent.raw as Session).teamSize || 4} élèves)
                    </span>
                  )}
                  {(selectedEvent.raw as any).targetAudience === 'adults' && (
                    <span className="px-3 py-1.5 text-xs font-bold uppercase tracking-widest rounded-lg bg-rose-100 text-rose-700">
                      Adultes uniquement
                    </span>
                  )}
                  <span className="text-sm font-semibold text-slate-500">
                    {format(new Date(selectedEvent.date), 'dd MMMM yyyy', { locale: fr })}
                  </span>
                </div>
                <h2 className="text-3xl font-black text-slate-900 mt-3 mb-3 tracking-tight">{selectedEvent.title}</h2>
                {selectedEvent.type === 'session' && (
                  <div className="flex flex-wrap items-center gap-1.5 mb-3">
                    {(selectedEvent.raw as Session).blockOnlineRegistration && (
                      <span className="inline-flex items-center gap-1 bg-amber-400 text-amber-950 text-xs font-black px-2.5 py-0.5 rounded-full shadow-2xs">
                        <Lock className="w-3.5 h-3.5" />
                        {(selectedEvent.raw as Session).directRegistrationTeacherName 
                          ? `Voir avec ${(selectedEvent.raw as Session).directRegistrationTeacherName}` 
                          : "Inscription directe prof"}
                      </span>
                    )}
                    {(selectedEvent.raw as Session).requirePaid && (
                      <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-800 text-xs font-bold px-2.5 py-0.5 rounded-full border border-emerald-200">
                        💳 Cotisation à jour requise
                      </span>
                    )}
                    {(selectedEvent.raw as Session).requireLicense && (
                      <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 text-xs font-bold px-2.5 py-0.5 rounded-full border border-indigo-200">
                        🪪 Licence requise
                      </span>
                    )}
                    {(selectedEvent.raw as Session).requireParentalAuth && (
                      <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-800 text-xs font-bold px-2.5 py-0.5 rounded-full border border-amber-200">
                        📄 AP requise
                      </span>
                    )}
                    {(selectedEvent.raw as Session).requireSwimmingCertificate && (
                      <span className="inline-flex items-center gap-1 bg-cyan-50 text-cyan-800 text-xs font-bold px-2.5 py-0.5 rounded-full border border-cyan-200">
                        🏊 Savoir nager requis
                      </span>
                    )}
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  {selectedEvent.type === 'session' && (selectedEvent.raw as Session).time && (
                    <p className="text-slate-600 font-semibold text-sm flex items-center gap-2">
                      <span className="text-lg">🕒</span> {(selectedEvent.raw as Session).time} 
                      {(selectedEvent.raw as Session).endTime ? ` - ${(selectedEvent.raw as Session).endTime}` : ''}
                    </p>
                  )}
                  {selectedEvent.type === 'session' && (selectedEvent.raw as Session).location && (
                    <p className="text-slate-600 font-semibold text-sm flex items-center gap-2">
                      <span className="text-lg">📍</span> {(selectedEvent.raw as Session).location}
                    </p>
                  )}
                  {selectedEvent.type === 'session' && (selectedEvent.raw as Session).needSnack && (
                    <p className="text-amber-600 font-bold text-sm flex items-center gap-2 bg-amber-50 px-3 py-1.5 rounded-lg w-fit mt-1">
                      <span className="text-lg">🍪</span> Goûter à prévoir
                    </p>
                  )}
                  {selectedEvent.type === 'session' && (selectedEvent.raw as Session).description && (
                    <p className="text-slate-600 font-medium text-sm mt-3 bg-slate-50 p-4 rounded-xl border border-slate-200/80 shadow-sm inline-block">
                      {(selectedEvent.raw as Session).description}
                    </p>
                  )}

                  {selectedEvent.type === 'session' && (selectedEvent.raw as Session).attachedPdf && (
                    <div className="mt-3 p-3.5 bg-indigo-50/90 border border-indigo-200 rounded-xl flex items-center justify-between gap-3 shadow-2xs">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-red-100 text-red-600 flex items-center justify-center font-black text-xs shrink-0 border border-red-200">
                          PDF
                        </div>
                        <div className="min-w-0">
                          <span className="text-[10px] font-bold text-indigo-900 uppercase tracking-wide block">
                            Document joint / Recueil d'informations
                          </span>
                          <p className="text-xs font-bold text-slate-900 truncate">
                            {(selectedEvent.raw as Session).attachedPdf!.fileName}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const doc = (selectedEvent.raw as Session).attachedPdf!;
                          const link = document.createElement('a');
                          link.href = doc.fileData;
                          link.download = doc.fileName || 'recueil_informations.pdf';
                          document.body.appendChild(link);
                          link.click();
                          document.body.removeChild(link);
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-bold rounded-lg transition-colors shadow-2xs shrink-0 cursor-pointer"
                        title="Télécharger le document d'information"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Télécharger</span>
                      </button>
                    </div>
                  )}
                  
                  {selectedEvent.type === 'convocation' && (selectedEvent.raw as Convocation).needSnack === 'OUI' && (
                    <p className="text-amber-600 font-medium text-sm">🍪 Goûter à prévoir</p>
                  )}
                  {selectedEvent.type === 'convocation' && (selectedEvent.raw as Convocation).needPicnic === 'OUI' && (
                    <p className="text-orange-600 font-medium text-sm">🥪 Pique-nique à prévoir</p>
                  )}
                </div>
              </div>
              <button 
                onClick={() => setSelectedEvent(null)}
                className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 min-h-0 bg-slate-50 overscroll-contain">
              {!isPublic && (
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 mb-6">
                  <h3 className="font-semibold text-slate-700 mb-4 flex items-center gap-2">
                    <Printer className="w-4 h-4 text-slate-400" />
                    Générer des documents
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <button 
                      onClick={() => printDocument('liste')}
                      className="flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition-colors border border-slate-200 cursor-pointer"
                    >
                      <Users className="w-4 h-4" />
                      Liste d'appel
                    </button>
                    <button 
                      onClick={() => printDocument('convocation')}
                      className="flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg font-medium transition-colors border border-emerald-200 cursor-pointer"
                    >
                      <FileText className="w-4 h-4" />
                      Convocation
                    </button>
                    <button 
                      onClick={() => printDocument('projet')}
                      className="flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg font-medium transition-colors border border-indigo-200 cursor-pointer"
                    >
                      <FileText className="w-4 h-4" />
                      Fiche Projet
                    </button>
                  </div>
                </div>
              )}
              
              {/* Si séance par équipe : Affichage des équipes inscrites (Visible public & enseignant) */}
              {selectedEvent.type === 'session' && (selectedEvent.raw as Session).isTeamRegistration && (
                <div className="mb-6">
                  <h3 className="font-bold text-slate-800 mb-3 flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-purple-600" />
                      Équipes enregistrées ({((selectedEvent.raw as Session).teams || []).length})
                    </span>
                    <span className="text-xs bg-purple-100 text-purple-800 font-bold px-2.5 py-0.5 rounded-full border border-purple-200">
                      {(selectedEvent.raw as Session).teamSize || 4} élèves / équipe
                    </span>
                  </h3>

                  {((selectedEvent.raw as Session).teams || []).length === 0 ? (
                    <p className="text-sm text-slate-500 italic p-4 bg-white rounded-xl border border-slate-200 text-center">
                      Aucune équipe n'est encore inscrite pour cette séance.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {((selectedEvent.raw as Session).teams || []).map((team, tIdx) => (
                        <div key={team.id || tIdx} className="bg-white p-3.5 rounded-xl border border-purple-100 shadow-xs">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                              <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-700 text-xs flex items-center justify-center font-black">
                                {tIdx + 1}
                              </span>
                              <span>{team.name}</span>
                            </h4>
                            <span className="text-[11px] font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md">
                              {team.studentIds?.length || 0} / {(selectedEvent.raw as Session).teamSize || 4} élèves
                            </span>
                          </div>
                          <ul className="space-y-1 text-xs text-slate-600">
                            {(team.studentIds || []).map(sid => {
                              const st = effectiveStudents.find(s => s.id === sid);
                              return (
                                <li key={sid} className="flex items-center justify-between py-0.5 border-b border-slate-50 last:border-b-0">
                                  <span className="font-semibold text-slate-800">
                                    {st ? `${st.lastName} ${st.firstName}` : sid}
                                  </span>
                                  {st?.classGroup && (
                                    <span className="text-[10px] text-slate-500 font-semibold bg-slate-100 px-1.5 py-0.5 rounded">
                                      {st.classGroup}
                                    </span>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Tous les élèves inscrits (Visible pour TOUS : enseignants et public) */}
              {(() => {
                const enrolled = getEnrolledStudents(selectedEvent.studentIds);
                const maxCap = selectedEvent.type === 'session' ? (selectedEvent.raw as Session).maxParticipants : undefined;
                return (
                  <div className="mb-6">
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <h3 className="font-black text-slate-900 flex items-center gap-2 text-base">
                        <Users className="w-4 h-4 text-indigo-600" />
                        <span>Élèves inscrits sur le calendrier ({enrolled.length}{maxCap ? ` / ${maxCap} places` : ''})</span>
                      </h3>
                      {maxCap && (
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${
                          enrolled.length >= maxCap ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-700'
                        }`}>
                          {enrolled.length >= maxCap ? 'Complet' : `${maxCap - enrolled.length} place(s) restante(s)`}
                        </span>
                      )}
                    </div>
                    
                    {enrolled.length === 0 ? (
                      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 text-center space-y-1.5 shadow-xs">
                        <Users className="w-8 h-8 text-slate-300 mx-auto" />
                        <p className="text-sm font-bold text-slate-700">Aucun élève encore inscrit</p>
                        <p className="text-xs text-slate-400">
                          {isPublic 
                            ? "Soyez le premier à vous inscrire pour cette séance !" 
                            : "Aucun participant enregistré pour le moment."}
                        </p>
                      </div>
                    ) : (
                      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                        <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                          <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 z-10">
                              <tr>
                                <th className="px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wider w-10">#</th>
                                <th className="px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Nom & Prénom</th>
                                <th className="px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Classe</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {enrolled.map((st, idx) => (
                                <tr key={st.id || idx} className="hover:bg-indigo-50/40 transition-colors">
                                  <td className="px-4 py-2.5 text-xs font-bold text-slate-400">
                                    {idx + 1}
                                  </td>
                                  <td className="px-4 py-2.5">
                                    <div className="font-black text-slate-900 flex items-center gap-1.5">
                                      <span>{st.lastName || st.name}</span>
                                      <span className="font-medium text-slate-600">{st.firstName}</span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-2.5 text-right">
                                    {st.classGroup ? (
                                      <span className="bg-indigo-50 text-indigo-700 border border-indigo-200/80 px-2 py-0.5 rounded-md text-xs font-bold">
                                        {st.classGroup}
                                      </span>
                                    ) : (
                                      <span className="text-xs text-slate-400">-</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
              
              {/* Actions d'inscription et informations pour le public */}
              {isPublic && (() => {
                const isSession = selectedEvent.type === 'session';
                const isConvocation = selectedEvent.type === 'convocation';
                
                let isClosed = false;
                let isFull = false;
                
                if (isSession) {
                  const session = selectedEvent.raw as Session;
                  isFull = session.maxParticipants !== undefined && (session.enrolledStudentIds || []).length >= session.maxParticipants;
                  const isPast = new Date(selectedEvent.date).setHours(0,0,0,0) < new Date().setHours(0,0,0,0);
                  isClosed = isFull || isPast;
                }
                
                if (isSession && !isClosed) {
                  const sess = selectedEvent.raw as Session;
                  if (sess.blockOnlineRegistration) {
                    return (
                      <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl text-amber-950 text-sm text-center space-y-2 shadow-2xs mt-4">
                        <div className="flex items-center justify-center gap-2 font-bold text-amber-900 text-base">
                          <Lock className="w-5 h-5 text-amber-700" />
                          <span>Inscription en ligne bloquée</span>
                        </div>
                        <p className="text-xs font-semibold text-amber-800 leading-relaxed">
                          {sess.directRegistrationNotice || (sess.directRegistrationTeacherName
                            ? `Voir l'inscription directement avec ${sess.directRegistrationTeacherName}.`
                            : "Voir l'inscription directement avec l'enseignant responsable.")}
                        </p>
                      </div>
                    );
                  }
                  return (
                    <div className="mt-4 pt-4 border-t border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                      <div>
                        <h4 className="text-sm font-black text-slate-900">Participer à ce créneau ?</h4>
                        <p className="text-xs text-slate-500">Inscrivez-vous en quelques clics avec votre nom ou prénom.</p>
                      </div>
                      <button 
                        onClick={() => {
                          setSelectedEvent(null);
                          setEnrollingSession(sess);
                        }}
                        className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 ${sess.isTeamRegistration ? 'bg-purple-600 hover:bg-purple-700' : 'bg-indigo-600 hover:bg-indigo-700'} text-white rounded-xl font-black text-sm transition-all shadow-md active:scale-95 cursor-pointer`}
                      >
                        <Users className="w-4 h-4" />
                        <span>{sess.isTeamRegistration ? `Inscrire une équipe (${sess.teamSize || 4} élèves)` : "Je m'inscris à cette séance"}</span>
                      </button>
                    </div>
                  );
                }
                
                if (isConvocation) {
                  return (
                    <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-950 text-sm mt-4">
                      <p className="font-bold mb-1 flex items-center gap-1.5">
                        <CalendarIcon className="w-4 h-4 text-emerald-700" />
                        <span>Rencontre / Compétition UNSS</span>
                      </p>
                      <p className="text-xs text-emerald-800 leading-relaxed">
                        Événement sur convocation officielle. Les élèves convoqués sont listés ci-dessus.
                      </p>
                    </div>
                  );
                }

                if (isSession && isClosed) {
                  return (
                    <div className="p-3 bg-slate-100 border border-slate-200 rounded-xl text-slate-700 text-xs text-center font-bold mt-4">
                      {isFull 
                        ? "Les inscriptions en ligne sont closes (séance complète)." 
                        : "Les inscriptions en ligne pour cette séance sont closes (séance passée)."}
                    </div>
                  );
                }
                
                return null;
              })()}
            </div>
            
            <div className="p-4 border-t border-slate-100 flex justify-between items-center shrink-0 bg-white">
              {!isPublic ? (
                <div className="flex gap-2">
                  {selectedEvent.type === 'session' && (
                    <button
                      onClick={() => openEditModal(selectedEvent)}
                      className="px-4 py-2 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg font-medium transition-colors flex items-center gap-2"
                      title="Modifier l'événement"
                    >
                      <Edit3 className="w-4 h-4" />
                      <span>Modifier</span>
                    </button>
                  )}
                  <button
                    onClick={() => setEventToDelete(selectedEvent)}
                    className="px-4 py-2 text-red-600 bg-red-50 hover:bg-red-100 rounded-lg font-medium transition-colors flex items-center gap-2 cursor-pointer"
                    title="Supprimer l'événement"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Supprimer</span>
                  </button>
                </div>
              ) : (
                <div />
              )}
              <button
                onClick={() => setSelectedEvent(null)}
                className="px-5 py-2 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg font-medium transition-colors"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Event Modal */}
      {isCreatingEvent && clickedDate && (
        <div 
          className="fixed inset-0 z-50 flex flex-col items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-sm overflow-hidden"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsCreatingEvent(false);
          }}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[calc(100vh-1.5rem)] sm:max-h-[calc(100vh-3rem)] flex flex-col overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header fixe toujours visible avec bouton de fermeture croix */}
            <div className="px-5 py-3.5 sm:px-6 sm:py-4 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50/90">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 border border-indigo-100">
                  <PlusCircle className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
                    {editingEventId ? 'Modifier la Séance' : 'Créer une Séance'}
                  </h2>
                  <p className="text-xs text-indigo-600 font-semibold mt-0.5 capitalize">
                    {format(clickedDate, 'EEEE d MMMM yyyy', { locale: fr })}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreatingEvent(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer"
                title="Fermer la fenêtre (Échap)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleCreateEvent} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1 min-h-0 overscroll-contain">
                <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50/60 rounded-lg text-indigo-950 text-xs font-semibold border border-indigo-100">
                  <CalendarIcon className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>Date :</span>
                  <span className="capitalize text-indigo-700 font-bold">{format(clickedDate, 'EEEE d MMMM yyyy', { locale: fr })}</span>
                </div>
                
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Nom de la séance</label>
                  <input 
                    type="text" 
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={newEventName}
                    onChange={e => setNewEventName(e.target.value)}
                    placeholder="Ex: Entraînement Futsal"
                    autoFocus
                  />
                </div>

                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Heure de RDV</label>
                    <input 
                      type="time" 
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                      value={newEventMeetingTime}
                      onChange={e => setNewEventMeetingTime(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Lieu de RDV</label>
                    <input 
                      type="text" 
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                      value={newEventMeetingLocation}
                      onChange={e => setNewEventMeetingLocation(e.target.value)}
                      placeholder="Ex: Gymnase"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Passage au self</label>
                    <input 
                      type="time" 
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                      value={newEventCafeteriaTime}
                      onChange={e => setNewEventCafeteriaTime(e.target.value)}
                      title="Heure de passage au self (optionnelle)"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Heure de retour</label>
                    <input 
                      type="time" 
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                      value={newEventReturnTime}
                      onChange={e => setNewEventReturnTime(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Début (Séance) *</label>
                    <input 
                      type="time" 
                      required
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                      value={newEventTime}
                      onChange={e => setNewEventTime(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Fin (Séance)</label>
                    <input 
                      type="time" 
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                      value={newEventEndTime}
                      onChange={e => setNewEventEndTime(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Lieu de la séance</label>
                  <input 
                    type="text" 
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    value={newEventLocation}
                    onChange={e => setNewEventLocation(e.target.value)}
                    placeholder="Ex: Stade municipal"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Informations (Optionnel)</label>
                  <textarea 
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    value={newEventDescription}
                    onChange={e => setNewEventDescription(e.target.value)}
                    placeholder="Ex: Penser à prendre les maillots..."
                    rows={2}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Max Inscrits</label>
                    <input 
                      type="number" 
                      min="1"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                      value={newEventMaxParticipants}
                      onChange={e => setNewEventMaxParticipants(e.target.value ? parseInt(e.target.value) : '')}
                      placeholder="Illimité"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Ouverture inscript.</label>
                    <input 
                      type="datetime-local" 
                      className="w-full px-2.5 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs"
                      value={newEventRegistrationOpenDate}
                      onChange={e => setNewEventRegistrationOpenDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Fermeture inscript.</label>
                    <input 
                      type="datetime-local" 
                      className="w-full px-2.5 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs"
                      value={newEventRegistrationCloseDate}
                      onChange={e => setNewEventRegistrationCloseDate(e.target.value)}
                    />
                  </div>
                </div>

                {/* OPTION : BLOQUER L'INSCRIPTION EN LIGNE AVEC MENTION ENSEIGNANT */}
                <div className="bg-amber-50/80 border border-amber-300 rounded-xl p-3.5 space-y-2.5 shadow-2xs">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input 
                      type="checkbox"
                      className="w-4 h-4 text-amber-600 rounded border-gray-300 focus:ring-amber-500 mt-0.5"
                      checked={newEventBlockOnlineRegistration}
                      onChange={e => {
                        const checked = e.target.checked;
                        const defaultTeacher = teachers[0];
                        setNewEventBlockOnlineRegistration(checked);
                        if (checked && !newEventDirectRegistrationTeacherId && defaultTeacher) {
                          setNewEventDirectRegistrationTeacherId(defaultTeacher.id);
                          setNewEventDirectRegistrationTeacherName(defaultTeacher.name);
                          setNewEventDirectRegistrationNotice(`voir l'inscription directement avec ${defaultTeacher.name}`);
                        }
                      }}
                    />
                    <div>
                      <span className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5 text-amber-700" />
                        Bloquer l'inscription en ligne (inscription directe auprès d'un enseignant)
                      </span>
                      <p className="text-[11px] text-amber-800 leading-tight mt-0.5 font-medium">
                        Interdit l'inscription en ligne pour cet événement et indique avec quel enseignant s'inscrire en direct.
                      </p>
                    </div>
                  </label>

                  {newEventBlockOnlineRegistration && (
                    <div className="pt-2 border-t border-amber-200/90 space-y-2.5 bg-white/70 p-2.5 rounded-lg">
                      <div>
                        <label className="block text-[11px] font-bold text-amber-950 mb-1">
                          Cocher l'un des enseignants pour l'inscription directe :
                        </label>
                        {teachers.length > 0 ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            {teachers.map(t => {
                              const isSelected = newEventDirectRegistrationTeacherId === t.id;
                              return (
                                <label
                                  key={t.id}
                                  className={`flex items-center gap-2 p-2 rounded-lg border text-left text-xs font-bold transition-all cursor-pointer select-none ${
                                    isSelected 
                                      ? 'bg-amber-600 text-white border-amber-700 shadow-xs' 
                                      : 'bg-white text-slate-700 border-amber-200 hover:bg-amber-50'
                                  }`}
                                >
                                  <input 
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => {
                                      if (isSelected) {
                                        setNewEventDirectRegistrationTeacherId('');
                                        setNewEventDirectRegistrationTeacherName('');
                                        setNewEventDirectRegistrationNotice("voir l'inscription directement avec l'enseignant responsable");
                                      } else {
                                        setNewEventDirectRegistrationTeacherId(t.id);
                                        setNewEventDirectRegistrationTeacherName(t.name);
                                        setNewEventDirectRegistrationNotice(`voir l'inscription directement avec ${t.name}`);
                                      }
                                    }}
                                    className="w-4 h-4 text-amber-600 rounded border-gray-300 focus:ring-amber-500 shrink-0 cursor-pointer"
                                  />
                                  <span className="truncate">{t.name}</span>
                                </label>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-xs text-amber-800 italic">Aucun enseignant disponible.</p>
                        )}
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-amber-950 mb-1">
                          Mention affichée aux élèves :
                        </label>
                        <input 
                          type="text"
                          className="w-full px-2.5 py-1.5 text-xs font-bold bg-white text-amber-950 border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                          value={newEventDirectRegistrationNotice}
                          onChange={e => setNewEventDirectRegistrationNotice(e.target.value)}
                          placeholder="Ex: voir l'inscription directement avec M. Dupont"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-2 pt-1">
                  <div className="flex items-center gap-2 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                    <input 
                      type="checkbox" 
                      id="needSnackCal"
                      className="w-4 h-4 text-amber-600 rounded border-gray-300 focus:ring-amber-500"
                      checked={newEventNeedSnack}
                      onChange={e => setNewEventNeedSnack(e.target.checked)}
                    />
                    <label htmlFor="needSnackCal" className="text-xs font-semibold text-amber-900 cursor-pointer">
                      Prévoir un goûter
                    </label>
                  </div>

                  {/* Éléments nécessaires pour pouvoir s'inscrire */}
                  <div className="bg-slate-50/90 p-3 sm:p-3.5 rounded-xl border border-slate-200 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
                        Éléments nécessaires pour pouvoir s'inscrire
                      </label>
                      <span className="text-[10px] text-slate-500 font-medium">Contrôle inscription</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                      <label className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${newEventRequirePaid ? 'bg-indigo-50/80 border-indigo-300 text-indigo-950' : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'}`}>
                        <input 
                          type="checkbox" 
                          id="requirePaidCal"
                          className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500 mt-0.5"
                          checked={newEventRequirePaid}
                          onChange={e => setNewEventRequirePaid(e.target.checked)}
                        />
                        <div>
                          <span className="text-xs font-bold block">Cotisation à jour</span>
                          <span className="text-[10px] text-slate-500 leading-tight block">Paiement validé exigé</span>
                        </div>
                      </label>

                      <label className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${newEventRequireLicense ? 'bg-indigo-50/80 border-indigo-300 text-indigo-950' : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'}`}>
                        <input 
                          type="checkbox" 
                          id="requireLicenseCal"
                          className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500 mt-0.5"
                          checked={newEventRequireLicense}
                          onChange={e => setNewEventRequireLicense(e.target.checked)}
                        />
                        <div>
                          <span className="text-xs font-bold block">Numéro de licence</span>
                          <span className="text-[10px] text-slate-500 leading-tight block">Licence AS obligatoire</span>
                        </div>
                      </label>

                      <label className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${newEventRequireParentalAuth ? 'bg-indigo-50/80 border-indigo-300 text-indigo-950' : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'}`}>
                        <input 
                          type="checkbox" 
                          id="requireParentalAuthCal"
                          className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500 mt-0.5"
                          checked={newEventRequireParentalAuth}
                          onChange={e => setNewEventRequireParentalAuth(e.target.checked)}
                        />
                        <div>
                          <span className="text-xs font-bold block">Autorisation parentale</span>
                          <span className="text-[10px] text-slate-500 leading-tight block">AP validée exigée</span>
                        </div>
                      </label>

                      <label className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${newEventRequireSwimmingCertificate ? 'bg-indigo-50/80 border-indigo-300 text-indigo-950' : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'}`}>
                        <input 
                          type="checkbox" 
                          id="requireSwimmingCal"
                          className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500 mt-0.5"
                          checked={newEventRequireSwimmingCertificate}
                          onChange={e => setNewEventRequireSwimmingCertificate(e.target.checked)}
                        />
                        <div>
                          <span className="text-xs font-bold block">Savoir nager</span>
                          <span className="text-[10px] text-slate-500 leading-tight block">Attestation exigée</span>
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* Section Inscription en équipe */}
                  <div className="bg-purple-50/80 p-3 rounded-xl border border-purple-200 space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="checkbox" 
                        id="isTeamRegCal"
                        className="w-4 h-4 text-purple-600 rounded border-gray-300 focus:ring-purple-500"
                        checked={newEventIsTeamRegistration}
                        onChange={e => setNewEventIsTeamRegistration(e.target.checked)}
                      />
                      <span className="text-xs font-bold text-purple-950 flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-purple-700" />
                        Inscription en équipe (Tournoi / Raid / Relais...)
                      </span>
                    </label>

                    {newEventIsTeamRegistration && (
                      <div className="pl-6 pt-1 space-y-1.5 border-t border-purple-200/60 mt-1">
                        <div className="flex items-center gap-2">
                          <label htmlFor="teamSizeCal" className="text-xs font-bold text-purple-900 whitespace-nowrap">
                            Nombre d'élèves requis par équipe :
                          </label>
                          <input 
                            type="number"
                            id="teamSizeCal"
                            min="2"
                            max="20"
                            required={newEventIsTeamRegistration}
                            className="w-20 px-2.5 py-1 text-xs font-bold text-purple-900 bg-white border border-purple-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                            value={newEventTeamSize}
                            onChange={e => setNewEventTeamSize(e.target.value ? parseInt(e.target.value) : '')}
                          />
                        </div>
                        <p className="text-[11px] text-purple-700 leading-tight">
                          L'inscription de l'équipe ne pourra être validée que lorsque celle-ci comptera exactement <strong>{newEventTeamSize || 4} élèves</strong>.
                        </p>
                      </div>
                    )}
                  </div>
                  
                  {!editingEventId && (
                    <div className="flex items-center gap-2 bg-indigo-50 p-2.5 rounded-lg border border-indigo-200">
                      <input 
                        type="checkbox" 
                        id="generateConvocation"
                        className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                        checked={newEventGenerateConvocation}
                        onChange={e => setNewEventGenerateConvocation(e.target.checked)}
                      />
                      <label htmlFor="generateConvocation" className="text-xs font-semibold text-indigo-900 cursor-pointer">
                        Intégrer dans la gestion des convocations
                      </label>
                    </div>
                  )}
                  {editingEventId && newEventGenerateConvocation && (
                    <div className="flex items-center gap-2 bg-indigo-50 p-2.5 rounded-lg border border-indigo-200">
                      <span className="text-xs font-semibold text-indigo-900">
                        Cette séance est liée à une convocation.
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer fixe toujours visible et ancré avec les boutons d'action */}
              <div className="px-5 py-3 sm:px-6 sm:py-3.5 border-t border-slate-100 bg-slate-50/95 flex items-center justify-between gap-3 shrink-0">
                <div>
                  {editingEventId && !isPublic && (
                    <button
                      type="button"
                      onClick={() => {
                        const ev = events.find(e => e.id === editingEventId);
                        if (ev) setEventToDelete(ev);
                      }}
                      className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg font-semibold text-sm transition-colors flex items-center gap-1.5 cursor-pointer"
                      title="Supprimer cet événement"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Supprimer</span>
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setIsCreatingEvent(false)}
                    className="px-4 py-2 text-slate-600 hover:bg-slate-200/80 rounded-lg font-semibold text-sm transition-colors cursor-pointer"
                    disabled={isSavingEvent}
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingEvent}
                    className="flex items-center gap-2 px-5 py-2.5 text-white bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] rounded-lg font-bold text-sm transition-all shadow-md shadow-indigo-600/20 disabled:opacity-50 cursor-pointer"
                  >
                    {isSavingEvent && <Loader2 className="w-4 h-4 animate-spin" />}
                    <span>{editingEventId ? 'Enregistrer les modifications' : 'Créer la séance'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Modal de gestion du formulaire d'inscription pour les enseignants */}
      <RegistrationFormModal
        isOpen={isFormModalOpen}
        onClose={() => setIsFormModalOpen(false)}
        currentForm={registrationForm}
        onFormUpdated={(newDoc) => setRegistrationForm(newDoc)}
      />

      {/* Fenêtre d'inscription simplifiée ultra-lisible */}
      <SimplifiedEnrollmentModal
        isOpen={!!enrollingSession}
        onClose={() => setEnrollingSession(null)}
        session={enrollingSession}
        onSuccess={() => {
          loadCalendarData();
        }}
      />
      {/* Boîte de dialogue de confirmation de suppression in-app (évite tout blocage window.confirm) */}
      <ConfirmDialog
        isOpen={!!eventToDelete}
        title="Supprimer l'événement"
        message={`Êtes-vous sûr de vouloir supprimer cet événement (« ${eventToDelete?.title} ») ? Cette action est irréversible.`}
        onConfirm={confirmDeleteEvent}
        onCancel={() => setEventToDelete(null)}
      />
    </div>
  );
};

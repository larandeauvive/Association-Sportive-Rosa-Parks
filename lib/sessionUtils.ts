import { Session } from '../types';

export interface SessionRegistrationStatus {
  isOpen: boolean;
  isClosed: boolean;
  notYetOpen: boolean;
  statusLabel: string;
  closeDateDisplay: string;
  openDateDisplay?: string;
  closeDateTime?: Date;
  openDateTime?: Date;
  isRelativeDays: boolean;
  daysBefore?: number;
}

/**
 * Calcule la date et heure exacte de clôture des inscriptions pour une séance donnée.
 */
export function calculateSessionDeadlineDate(session: Session): Date | null {
  if (session.registrationDaysBefore !== undefined && session.registrationDaysBefore !== null && !isNaN(Number(session.registrationDaysBefore))) {
    const daysBefore = Number(session.registrationDaysBefore);
    const dateParts = (session.date || '').split('-');
    if (dateParts.length === 3) {
      const year = parseInt(dateParts[0], 10);
      const month = parseInt(dateParts[1], 10) - 1;
      const day = parseInt(dateParts[2], 10);

      const deadline = new Date(year, month, day);
      deadline.setDate(deadline.getDate() - daysBefore);

      if (session.registrationCloseTime) {
        const [h, m] = session.registrationCloseTime.split(':').map(Number);
        deadline.setHours(h || 0, m || 0, 0, 0);
      } else if (session.time) {
        const [h, m] = session.time.split(':').map(Number);
        deadline.setHours(h || 0, m || 0, 0, 0);
      } else {
        deadline.setHours(23, 59, 59, 999);
      }
      return deadline;
    }
  }

  if (session.registrationCloseDate) {
    const d = new Date(session.registrationCloseDate);
    if (!isNaN(d.getTime())) return d;
  }

  return null;
}

/**
 * Calcule la date et heure exacte d'ouverture des inscriptions pour une séance donnée.
 */
export function calculateSessionOpenDate(session: Session): Date | null {
  if (session.registrationOpenDaysBefore !== undefined && session.registrationOpenDaysBefore !== null && !isNaN(Number(session.registrationOpenDaysBefore))) {
    const daysBefore = Number(session.registrationOpenDaysBefore);
    const dateParts = (session.date || '').split('-');
    if (dateParts.length === 3) {
      const year = parseInt(dateParts[0], 10);
      const month = parseInt(dateParts[1], 10) - 1;
      const day = parseInt(dateParts[2], 10);

      const openDate = new Date(year, month, day);
      openDate.setDate(openDate.getDate() - daysBefore);
      openDate.setHours(0, 0, 0, 0);
      return openDate;
    }
  }

  if (session.registrationOpenDate) {
    const d = new Date(session.registrationOpenDate);
    if (!isNaN(d.getTime())) return d;
  }

  return null;
}

/**
 * Analyse l'état des inscriptions d'une séance (ouvert, fermé, pas encore ouvert).
 */
export function getSessionRegistrationStatus(session: Session, now = new Date()): SessionRegistrationStatus {
  const closeDateTime = calculateSessionDeadlineDate(session);
  const openDateTime = calculateSessionOpenDate(session);
  const isRelative = session.registrationDaysBefore !== undefined && session.registrationDaysBefore !== null && !isNaN(Number(session.registrationDaysBefore));

  // Vérifier si la séance est passée
  const sessionEndTime = session.endTime || session.time || '23:59';
  const [endH, endM] = sessionEndTime.split(':').map(Number);
  const sessionEndDateTime = new Date(session.date + 'T00:00:00');
  sessionEndDateTime.setHours(endH || 23, endM || 59, 59, 999);

  if (now.getTime() > sessionEndDateTime.getTime()) {
    return {
      isOpen: false,
      isClosed: true,
      notYetOpen: false,
      statusLabel: 'Séance passée',
      closeDateDisplay: 'Séance terminée',
      isRelativeDays: isRelative,
      daysBefore: isRelative ? Number(session.registrationDaysBefore) : undefined
    };
  }

  // Vérifier si pas encore ouvert
  if (openDateTime && now.getTime() < openDateTime.getTime()) {
    const openStr = openDateTime.toLocaleDateString('fr-FR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short'
    });
    const openHour = openDateTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return {
      isOpen: false,
      isClosed: false,
      notYetOpen: true,
      statusLabel: `Ouverture le ${openStr} à ${openHour}`,
      closeDateDisplay: closeDateTime ? `Fermeture le ${closeDateTime.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}` : '',
      openDateDisplay: `Dès le ${openStr}`,
      openDateTime,
      closeDateTime: closeDateTime || undefined,
      isRelativeDays: isRelative,
      daysBefore: isRelative ? Number(session.registrationDaysBefore) : undefined
    };
  }

  // Vérifier si clôturé
  if (closeDateTime && now.getTime() > closeDateTime.getTime()) {
    const closeStr = closeDateTime.toLocaleDateString('fr-FR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short'
    });
    const closeHour = closeDateTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return {
      isOpen: false,
      isClosed: true,
      notYetOpen: false,
      statusLabel: `Inscriptions closes depuis le ${closeStr} à ${closeHour}`,
      closeDateDisplay: `Clôturé (${closeStr})`,
      closeDateTime,
      isRelativeDays: isRelative,
      daysBefore: isRelative ? Number(session.registrationDaysBefore) : undefined
    };
  }

  // Ouvert
  let closeDisplay = 'Ouvertes sans date limite';
  if (closeDateTime) {
    const closeStr = closeDateTime.toLocaleDateString('fr-FR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short'
    });
    const closeHour = closeDateTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    closeDisplay = `Jusqu'au ${closeStr} à ${closeHour}`;
  }

  return {
    isOpen: true,
    isClosed: false,
    notYetOpen: false,
    statusLabel: closeDateTime ? `Inscriptions ouvertes (${closeDisplay})` : 'Inscriptions ouvertes',
    closeDateDisplay: closeDisplay,
    closeDateTime: closeDateTime || undefined,
    openDateTime: openDateTime || undefined,
    isRelativeDays: isRelative,
    daysBefore: isRelative ? Number(session.registrationDaysBefore) : undefined
  };
}

/**
 * Renvoie une description lisible de la règle de clôture pour affichage résumé (ex: "Fermeture 2 jours avant à 18h00").
 */
export function formatRegistrationRule(session: Session): string {
  if (session.registrationDaysBefore !== undefined && session.registrationDaysBefore !== null && !isNaN(Number(session.registrationDaysBefore))) {
    const days = Number(session.registrationDaysBefore);
    const timeStr = session.registrationCloseTime ? ` à ${session.registrationCloseTime}` : (session.time ? ` à ${session.time}` : '');
    if (days === 0) return `Clôture le jour même (J-0)${timeStr}`;
    if (days === 1) return `Clôture la veille (J-1)${timeStr}`;
    return `Clôture ${days} jours avant (J-${days})${timeStr}`;
  }

  if (session.registrationCloseDate) {
    const d = new Date(session.registrationCloseDate);
    if (!isNaN(d.getTime())) {
      return `Clôture le ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
    }
  }

  return 'Inscriptions sans date limite';
}

/**
 * Récupère toutes les séances de la même série (via recurrenceGroupId ou même nom dans l'année active),
 * classées par ordre chronologique.
 */
export function getSeriesSessions(
  sessionOrName: string | Partial<Session>,
  yearOrAllSessions: string | Session[],
  maybeAllSessions?: Session[]
): Session[] {
  let allSessions: Session[] = [];
  let normName = '';
  let activeYear = '';
  let groupId: string | undefined = undefined;

  if (typeof sessionOrName === 'string') {
    normName = (sessionOrName || '').trim().toLowerCase();
    activeYear = typeof yearOrAllSessions === 'string' ? yearOrAllSessions : '';
    allSessions = maybeAllSessions || (Array.isArray(yearOrAllSessions) ? yearOrAllSessions : []);
  } else if (sessionOrName && typeof sessionOrName === 'object') {
    allSessions = (Array.isArray(yearOrAllSessions) ? yearOrAllSessions : maybeAllSessions) || [];
    normName = (sessionOrName.name || '').trim().toLowerCase();
    activeYear = sessionOrName.schoolYear || '';
    groupId = sessionOrName.recurrenceGroupId;
  }

  return allSessions
    .filter(s => {
      if (groupId && s.recurrenceGroupId && s.recurrenceGroupId === groupId) {
        return true;
      }
      if (activeYear && s.schoolYear && s.schoolYear !== activeYear) {
        return false;
      }
      if (normName && (s.name || '').trim().toLowerCase() === normName) {
        return true;
      }
      return false;
    })
    .sort((a, b) => {
      const dCmp = (a.date || '').localeCompare(b.date || '');
      if (dCmp !== 0) return dCmp;
      return (a.time || '').localeCompare(b.time || '');
    });
}

/**
 * Récupère les séances de la même série à partir d'une date donnée (inclus).
 */
export function getFutureSeriesSessions(currentSession: Session, allSessions: Session[]): Session[] {
  const series = getSeriesSessions(currentSession, allSessions);
  return series.filter(s => (s.date || '') >= (currentSession.date || ''));
}

export type SessionCategory = 'as_soir' | 'mercredi';

/**
 * Catégorise un créneau d'activité :
 * - 'as_soir' : Créneau récurrent hebdomadaire du soir (Mardi ou Jeudi, 17h00 - 18h00, ex: AS Muscu, AS Sport Co)
 * - 'mercredi' : Créneau ponctuel (Mercredi après-midi, compétitions, tournois, sorties sportives, raids)
 */
export function getSessionCategory(session: Partial<Session>): SessionCategory {
  if (!session.date) {
    if (session.name && /soir|muscu|sport co/i.test(session.name)) return 'as_soir';
    return 'mercredi';
  }

  // Vérifier le jour de la semaine
  const parts = session.date.split('-');
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    const dateObj = new Date(y, m, d);
    const day = dateObj.getDay(); // 0: Dim, 1: Lun, 2: Mar, 3: Mer, 4: Jeu, 5: Ven, 6: Sam

    // Mardi (2) ou Jeudi (4) -> AS du Soir
    if (day === 2 || day === 4) {
      return 'as_soir';
    }
    // Mercredi (3) -> Créneau du Mercredi
    if (day === 3) {
      return 'mercredi';
    }
  }

  // Vérification horaire de fin d'après-midi / soirée (17h00 - 18h00)
  if (session.time && (session.time.startsWith('17:') || session.time.startsWith('18:') || session.time.startsWith('16:45'))) {
    return 'as_soir';
  }

  // Mots-clés AS du Soir
  if (session.name && /soir|muscu/i.test(session.name)) {
    return 'as_soir';
  }

  return 'mercredi';
}

/**
 * Renvoie le jour en français (ex: "Mardi", "Jeudi", "Mercredi")
 */
export function getSessionDayName(dateStr?: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return '';
  const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  return days[d.getDay()] || '';
}

export interface AbsencePenaltyResult {
  isBlocked: boolean;
  reason?: string;
  penalizingSession?: Session;
  penaltyDateFr?: string;
  dayName?: string;
}

/**
 * Calcule le lundi (00:00:00) de la semaine civile contenant la date donnée (format YYYY-MM-DD).
 */
export function getMondayOfWeek(dateStr: string): Date {
  const parts = dateStr.split('-');
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  const date = new Date(y, m, d);
  const day = date.getDay(); // 0: Dim, 1: Lun, 2: Mar, 3: Mer, 4: Jeu, 5: Ven, 6: Sam
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(y, m, d + diffToMonday);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

/**
 * Détermine si une séance a lieu un mardi (soir) ou un jeudi.
 */
export function isTuesdayOrThursdaySession(session: Partial<Session>): boolean {
  if (!session.date) {
    if (session.name && /mardi|jeudi|muscu|sport co|soir/i.test(session.name)) return true;
    return false;
  }
  const parts = session.date.split('-');
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    const dateObj = new Date(y, m, d);
    const day = dateObj.getDay();
    // 2 = Mardi, 4 = Jeudi
    if (day === 2 || day === 4) return true;
  }
  if (session.name && /mardi|jeudi|muscu|sport co|soir/i.test(session.name)) return true;
  return false;
}

/**
 * Vérifie si un élève est sous le coup d'une suspension d'inscription pour la semaine suivante
 * suite à une absence non pointée (inscrit mais non présent) lors d'une séance du mardi soir ou du jeudi.
 *
 * Règle demandée :
 * Si un élève inscrit sur une séance du mardi soir (ou du jeudi) est absent (non pointé présent et non excusé),
 * son inscription la semaine suivante (semaine civile N+1) est impossible.
 */
export function checkUnexcusedAbsencePenalty(
  targetSession: Session,
  studentId: string,
  allSessions: Session[]
): AbsencePenaltyResult {
  if (!targetSession.date) {
    return { isBlocked: false };
  }

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const mondayTarget = getMondayOfWeek(targetSession.date);
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;

  for (const pastSession of allSessions) {
    if (!pastSession.date || pastSession.id === targetSession.id) continue;
    if (pastSession.schoolYear && targetSession.schoolYear && pastSession.schoolYear !== targetSession.schoolYear) continue;

    // Doit être un créneau du mardi (soir) ou du jeudi
    if (!isTuesdayOrThursdaySession(pastSession)) continue;

    // Doit être antérieure à targetSession et ne pas être dans le futur
    if (pastSession.date >= targetSession.date) continue;
    if (pastSession.date > todayStr) continue;

    // Calcul de l'écart exact en semaines civiles entre les lundis
    const mondayPast = getMondayOfWeek(pastSession.date);
    const diffWeeks = Math.round((mondayTarget.getTime() - mondayPast.getTime()) / msPerWeek);

    // La règle bloque rigoureusement l'inscription la semaine suivante (exactement diffWeeks === 1)
    if (diffWeeks !== 1) continue;

    const enrolledIds = pastSession.enrolledStudentIds || [];
    const presentIds = pastSession.presentStudentIds || [];
    const excusedIds = pastSession.excusedStudentIds || [];

    const wasEnrolled = enrolledIds.includes(studentId);
    const wasPresent = presentIds.includes(studentId);
    const wasExcused = excusedIds.includes(studentId);

    // L'appel doit avoir eu lieu (au moins un élève présent, ou date déjà passée avec inscrits)
    const rollCallConducted = presentIds.length > 0 || (pastSession.date < todayStr && enrolledIds.length > 0);

    if (wasEnrolled && !wasPresent && !wasExcused && rollCallConducted) {
      const dayName = getSessionDayName(pastSession.date);
      const dateFr = new Date(pastSession.date + 'T00:00:00').toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long'
      });

      return {
        isBlocked: true,
        reason: `Inscription impossible pour la semaine suivante : élève noté(e) absent(e) lors de la séance du ${dayName} ${dateFr} (${pastSession.name || 'Séance'}). Conformément au règlement de l'AS, toute absence non justifiée sur un créneau du mardi soir ou du jeudi entraîne la suspension des inscriptions pour la semaine suivante.`,
        penalizingSession: pastSession,
        penaltyDateFr: dateFr,
        dayName
      };
    }
  }

  return { isBlocked: false };
}

/**
 * Vérifie si un élève est sous le coup d'une suspension d'inscription pour la semaine en cours.
 */
export function isStudentSuspendedThisWeek(
  studentId: string,
  allSessions: Session[],
  refDateStr?: string
): AbsencePenaltyResult {
  const now = new Date();
  const dateStr = refDateStr || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  
  const dummySession: Session = {
    id: '__current_week_check__',
    name: 'Vérification semaine',
    date: dateStr,
    time: '17:00',
    schoolYear: '',
    requireLicense: false,
    enrolledStudentIds: [],
    presentStudentIds: []
  };

  return checkUnexcusedAbsencePenalty(dummySession, studentId, allSessions);
}

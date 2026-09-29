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

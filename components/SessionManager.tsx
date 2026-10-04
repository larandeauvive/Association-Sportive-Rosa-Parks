import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Student, Session, AttachedPdfDoc } from '../types';
import { startOfWeek, endOfWeek, addWeeks, addDays, format } from 'date-fns';
import { 
  PlusCircle, Calendar, Trash2, CheckCircle2, Circle, Users, 
  Save, Link2, Edit2, ShieldCheck, AlertCircle, Search,
  ChevronDown, ChevronRight, History, ArrowUpDown, Clock,
  Repeat, CalendarDays, Timer, Sparkles, Info, Lock,
  FileText, FileUp, Download, Eye, X, Loader2,
  Moon, Zap, Layers
} from 'lucide-react';
import { ConfirmDialog } from './ConfirmDialog';
import { 
  getSessionsList, saveSessionApi, updateSessionApi, deleteSessionApi, 
  getTeachersList, saveConvocationApi, deleteTeamFromSession, 
  enrollTeamInSession 
} from '../lib/db';
import { 
  getSeriesSessions, getFutureSeriesSessions, 
  formatRegistrationRule, getSessionRegistrationStatus,
  getSessionCategory, getSessionDayName, SessionCategory
} from '../lib/sessionUtils';

interface SessionManagerProps {
  students: Student[];
  activeYear: string;
  defaultCategory?: 'all' | 'as_soir' | 'mercredi';
}

export function SessionManager({ students, activeYear, defaultCategory = 'all' }: SessionManagerProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  
  // Catégorie active : 'all' (2 colonnes côte à côte), 'as_soir' (Mardi/Jeudi 17h-18h), ou 'mercredi' (Ponctuels)
  const [activeCategory, setActiveCategory] = useState<'all' | 'as_soir' | 'mercredi'>(defaultCategory);

  useEffect(() => {
    if (defaultCategory) {
      setActiveCategory(defaultCategory);
    }
  }, [defaultCategory]);

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const activeSession = sessions.find(s => s.id === activeSessionId);

  const [searchTerm, setSearchTerm] = useState('');
  const [sessionSearch, setSessionSearch] = useState('');
  const [isAsSoirHistoryOpen, setIsAsSoirHistoryOpen] = useState(false);
  const [isMercrediHistoryOpen, setIsMercrediHistoryOpen] = useState(false);
  const [pastSortOrder, setPastSortOrder] = useState<'asc' | 'desc'>('asc');
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);
  const [deleteScope, setDeleteScope] = useState<'single' | 'future' | 'all'>('single');

  // Gestion de la récurrence & modification groupée
  const [updateScope, setUpdateScope] = useState<'all' | 'future' | 'single'>('all');
  const [isSaving, setIsSaving] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  // Modalités d'inscription (Délai en jours vs Date calendrier vs Sans date)
  const [deadlineMode, setDeadlineMode] = useState<'relative' | 'fixed' | 'none'>('relative');
  const [enableOpenDeadline, setEnableOpenDeadline] = useState(false);

  // Gestion du glisser-déposer de PDF sur la feuille de séance
  const [isPdfDraggingOnSheet, setIsPdfDraggingOnSheet] = useState(false);
  const [isPdfDraggingInForm, setIsPdfDraggingInForm] = useState(false);
  const [isUploadingPdf, setIsUploadingPdf] = useState(false);
  const [viewingPdfDoc, setViewingPdfDoc] = useState<AttachedPdfDoc | null>(null);
  const sheetPdfInputRef = useRef<HTMLInputElement>(null);
  const formPdfInputRef = useRef<HTMLInputElement>(null);

  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return '0 Ko';
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  };

  const downloadAttachedPdf = (doc: AttachedPdfDoc) => {
    const link = document.createElement('a');
    link.href = doc.fileData;
    link.download = doc.fileName || 'recueil_informations.pdf';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const readFileAsAttachedPdf = (file: File): Promise<AttachedPdfDoc> => {
    return new Promise((resolve, reject) => {
      const isPdf = file.name.toLowerCase().endsWith('.pdf') || 
                    file.type.toLowerCase().includes('pdf') || 
                    file.type === 'application/pdf';
      if (!isPdf) {
        return reject(new Error("Seuls les fichiers au format PDF sont acceptés."));
      }
      if (file.size > 25 * 1024 * 1024) {
        return reject(new Error("Le fichier PDF est trop volumineux (maximum 25 Mo)."));
      }
      const reader = new FileReader();
      reader.onload = () => {
        resolve({
          fileName: file.name,
          fileSize: file.size,
          fileData: reader.result as string,
          uploadedAt: new Date().toISOString(),
          title: file.name.replace(/\.[^/.]+$/, "")
        });
      };
      reader.onerror = () => reject(new Error("Erreur lors de la lecture du fichier PDF."));
      reader.readAsDataURL(file);
    });
  };

  const todayStr = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, []);

  // Afficher l'AS du Soir au-delà de la semaine suivante (replié par défaut)
  const [showLaterAsSoir, setShowLaterAsSoir] = useState(false);

  // Horizon d'une semaine à l'autre pour l'AS du Soir (semaine en cours et semaine suivante)
  const asSoirHorizonDate = useMemo(() => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const baseWeekStart = (dayOfWeek === 0 || dayOfWeek === 6)
      ? startOfWeek(addDays(now, 2), { weekStartsOn: 1 })
      : startOfWeek(now, { weekStartsOn: 1 });
    return endOfWeek(addWeeks(baseWeekStart, 1), { weekStartsOn: 1 });
  }, []);
  const asSoirHorizonStr = useMemo(() => format(asSoirHorizonDate, 'yyyy-MM-dd'), [asSoirHorizonDate]);
  
  const [isCreating, setIsCreating] = useState(false);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceCount, setRecurrenceCount] = useState(4);
  const [formData, setFormData] = useState<Partial<Session>>({
    date: new Date().toISOString().split('T')[0],
    time: '13:30',
    requireLicense: false,
    requirePaid: false,
    teacherIds: []
  });

  const newSession = formData;
  const [editingSession, setEditingSession] = useState<Session | null>(null);

  // Effacer la notification après 4 secondes
  useEffect(() => {
    if (!notification) return;
    const timer = setTimeout(() => setNotification(null), 4000);
    return () => clearTimeout(timer);
  }, [notification]);

  const fetchSessionManagerData = useCallback(async () => {
    try {
      const [tList, sList] = await Promise.all([
        getTeachersList(),
        getSessionsList(activeYear)
      ]);
      setTeachers(tList);
      
      // Tri strict par ordre chronologique (date puis heure)
      sList.sort((a, b) => {
        const dateCmp = (a.date || '').localeCompare(b.date || '');
        if (dateCmp !== 0) return dateCmp;
        return (a.time || '').localeCompare(b.time || '');
      });
      setSessions(sList);

      // Présélection automatique de la séance la plus pertinente
      setActiveSessionId(prev => {
        if (prev && sList.some(s => s.id === prev)) return prev;
        const now = new Date();
        const curDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const todaySess = sList.find(s => s.date === curDate);
        const upcomingSess = sList.find(s => s.date > curDate);
        const latestPast = [...sList].reverse().find(s => s.date < curDate);
        return (todaySess || upcomingSess || latestPast || sList[0])?.id || null;
      });
    } catch (err) {
      console.warn("Erreur chargement séances:", err);
    }
  }, [activeYear]);

  useEffect(() => {
    fetchSessionManagerData();
  }, [fetchSessionManagerData]);

  const handleDropPdfOnSheet = async (file: File) => {
    if (!activeSession) {
      alert("Veuillez d'abord sélectionner une séance avant de glisser un document.");
      return;
    }
    setIsUploadingPdf(true);
    try {
      const doc = await readFileAsAttachedPdf(file);
      await updateSessionApi(activeSession.id, { attachedPdf: doc });
      setSessions(prev => prev.map(s => s.id === activeSession.id ? { ...s, attachedPdf: doc } : s));
      setNotification(`✅ Document "${doc.fileName}" joint à la feuille de séance avec succès !`);
    } catch (err: any) {
      alert(err?.message || "Erreur lors du dépôt du PDF.");
    } finally {
      setIsUploadingPdf(false);
    }
  };

  const handleDeletePdfFromSheet = async () => {
    if (!activeSession || !activeSession.attachedPdf) return;
    if (!confirm(`Supprimer le document joint "${activeSession.attachedPdf.fileName}" de cette séance ?`)) return;
    setIsUploadingPdf(true);
    try {
      await updateSessionApi(activeSession.id, { attachedPdf: null });
      setSessions(prev => prev.map(s => s.id === activeSession.id ? { ...s, attachedPdf: null } : s));
      setNotification("Le document joint a été retiré de la séance.");
    } catch (err: any) {
      alert(err?.message || "Erreur lors de la suppression du document.");
    } finally {
      setIsUploadingPdf(false);
    }
  };

  const handleDropPdfInForm = async (file: File) => {
    try {
      const doc = await readFileAsAttachedPdf(file);
      setFormData(prev => ({ ...prev, attachedPdf: doc }));
      setNotification(`✅ Fichier "${doc.fileName}" sélectionné (sera enregistré avec la séance).`);
    } catch (err: any) {
      alert(err?.message || "Erreur lors du dépôt du PDF.");
    }
  };

  const openCreateForm = (presetCategory?: 'as_soir' | 'mercredi') => {
    const targetCategory = presetCategory || (activeCategory !== 'all' ? activeCategory : 'as_soir');
    
    // Proposer automatiquement la prochaine date adaptée
    const now = new Date();
    let proposedDate = new Date();
    
    if (targetCategory === 'as_soir') {
      // Trouver le prochain mardi (2) ou jeudi (4)
      for (let i = 1; i <= 7; i++) {
        const testD = new Date(now);
        testD.setDate(now.getDate() + i);
        if (testD.getDay() === 2 || testD.getDay() === 4) {
          proposedDate = testD;
          break;
        }
      }
    } else {
      // Trouver le prochain mercredi (3)
      for (let i = 1; i <= 7; i++) {
        const testD = new Date(now);
        testD.setDate(now.getDate() + i);
        if (testD.getDay() === 3) {
          proposedDate = testD;
          break;
        }
      }
    }

    const proposedDateStr = `${proposedDate.getFullYear()}-${String(proposedDate.getMonth() + 1).padStart(2, '0')}-${String(proposedDate.getDate()).padStart(2, '0')}`;

    if (targetCategory === 'as_soir') {
      setFormData({
        name: 'AS Musculation',
        date: proposedDateStr,
        time: '17:00',
        endTime: '18:00',
        location: 'Salle de musculation',
        requireLicense: false,
        requirePaid: false,
        enrolledStudentIds: [],
        presentStudentIds: [],
        registrationDaysBefore: 0,
        registrationCloseTime: '12:00',
        blockOnlineRegistration: false,
        directRegistrationTeacherId: undefined,
        directRegistrationTeacherName: undefined,
        directRegistrationNotice: undefined,
        attachedPdf: null
      });
      setIsRecurring(true);
      setRecurrenceCount(8);
      setDeadlineMode('relative');
      setEnableOpenDeadline(false);
      setUpdateScope('all');
    } else {
      setFormData({
        name: 'Rencontre / Sortie Mercredi',
        date: proposedDateStr,
        time: '13:30',
        endTime: '16:30',
        location: 'Gymnase / Extérieur',
        requireLicense: false,
        requirePaid: false,
        enrolledStudentIds: [],
        presentStudentIds: [],
        registrationDaysBefore: 1,
        registrationCloseTime: '18:00',
        blockOnlineRegistration: false,
        directRegistrationTeacherId: undefined,
        directRegistrationTeacherName: undefined,
        directRegistrationNotice: undefined,
        attachedPdf: null
      });
      setIsRecurring(false);
      setRecurrenceCount(1);
      setDeadlineMode('relative');
      setEnableOpenDeadline(false);
      setUpdateScope('single');
    }

    setIsCreating(true);
  };

  const openEditForm = (sess: Session) => {
    setFormData({ 
      ...sess,
      blockOnlineRegistration: !!sess.blockOnlineRegistration,
      directRegistrationTeacherId: sess.directRegistrationTeacherId,
      directRegistrationTeacherName: sess.directRegistrationTeacherName,
      directRegistrationNotice: sess.directRegistrationNotice,
      attachedPdf: sess.attachedPdf || null
    });
    const series = getSeriesSessions(sess, sessions);
    setUpdateScope(series.length > 1 ? 'all' : 'single');
    setIsRecurring(false);

    if (sess.registrationDaysBefore !== undefined && sess.registrationDaysBefore !== null) {
      setDeadlineMode('relative');
      setEnableOpenDeadline(sess.registrationOpenDaysBefore !== undefined && sess.registrationOpenDaysBefore !== null);
    } else if (sess.registrationCloseDate) {
      setDeadlineMode('fixed');
      setEnableOpenDeadline(false);
    } else {
      setDeadlineMode('none');
      setEnableOpenDeadline(false);
    }

    setIsCreating(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.date) return;
    setIsSaving(true);

    try {
      // Préparation des paramètres de délai d'inscription
      let regDaysBefore: number | undefined = undefined;
      let regCloseTime: string | undefined = undefined;
      let regOpenDaysBefore: number | undefined = undefined;
      let regCloseDate: string | undefined = undefined;
      let regOpenDate: string | undefined = undefined;

      if (deadlineMode === 'relative') {
        regDaysBefore = formData.registrationDaysBefore !== undefined && formData.registrationDaysBefore !== null 
          ? Number(formData.registrationDaysBefore) 
          : 1;
        regCloseTime = formData.registrationCloseTime || '18:00';
        if (enableOpenDeadline && formData.registrationOpenDaysBefore !== undefined && formData.registrationOpenDaysBefore !== null) {
          regOpenDaysBefore = Number(formData.registrationOpenDaysBefore);
        }
      } else if (deadlineMode === 'fixed') {
        regCloseDate = formData.registrationCloseDate || undefined;
        regOpenDate = formData.registrationOpenDate || undefined;
      }

      const commonFields: Partial<Session> = {
        name: (formData.name || '').trim(),
        time: formData.time || '13:30',
        endTime: formData.endTime || undefined,
        location: formData.location || undefined,
        teacherIds: formData.teacherIds || [],
        needSnack: !!formData.needSnack,
        description: formData.description || undefined,
        maxParticipants: formData.maxParticipants ? Number(formData.maxParticipants) : undefined,
        targetAudience: formData.targetAudience || 'all',
        requireLicense: !!formData.requireLicense,
        requireParentalAuth: !!formData.requireParentalAuth,
        requireSwimmingCertificate: !!formData.requireSwimmingCertificate,
        requirePaid: !!formData.requirePaid,
        isTeamRegistration: !!formData.isTeamRegistration,
        teamSize: formData.isTeamRegistration ? (Number(formData.teamSize) || 4) : undefined,
        meetingTime: formData.meetingTime || undefined,
        meetingLocation: formData.meetingLocation || undefined,
        cafeteriaTime: formData.cafeteriaTime || undefined,
        returnTime: formData.returnTime || undefined,
        schoolYear: activeYear,
        registrationDaysBefore: regDaysBefore,
        registrationCloseTime: regCloseTime,
        registrationOpenDaysBefore: regOpenDaysBefore,
        registrationCloseDate: regCloseDate,
        registrationOpenDate: regOpenDate,
        blockOnlineRegistration: !!formData.blockOnlineRegistration,
        directRegistrationTeacherId: formData.blockOnlineRegistration ? formData.directRegistrationTeacherId : undefined,
        directRegistrationTeacherName: formData.blockOnlineRegistration ? formData.directRegistrationTeacherName : undefined,
        directRegistrationNotice: formData.blockOnlineRegistration ? formData.directRegistrationNotice : undefined,
        attachedPdf: formData.attachedPdf !== undefined ? formData.attachedPdf : null
      };

      if (formData.id) {
        // Mode modification
        const currentSeries = getSeriesSessions(formData, sessions);
        const hasSeries = currentSeries.length > 1;

        if (hasSeries && (updateScope === 'all' || updateScope === 'future')) {
          const targets = updateScope === 'all' 
            ? currentSeries 
            : currentSeries.filter(s => (s.date || '') >= (formData.date || ''));

          // Assurer un même recurrenceGroupId partagé pour toute la série
          const sharedGroupId = formData.recurrenceGroupId || 
            currentSeries.find(s => s.recurrenceGroupId)?.recurrenceGroupId || 
            `rec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

          for (const target of targets) {
            await saveSessionApi({
              ...target,
              ...commonFields,
              recurrenceGroupId: sharedGroupId,
              id: target.id,
              date: target.date, // Conserve sa propre date de calendrier hebdomadaire
              schoolYear: target.schoolYear || activeYear,
              enrolledStudentIds: target.enrolledStudentIds || [],
              presentStudentIds: target.presentStudentIds || [],
              teams: target.teams || [],
              convocationId: target.convocationId
            });
          }

          setNotification(`${targets.length} séances du créneau « ${formData.name} » ont été mises à jour simultanément !`);
        } else {
          // Modification de cette séance uniquement
          await saveSessionApi({
            ...formData,
            ...commonFields,
            id: formData.id,
            date: formData.date
          });
          setNotification(`Séance du ${formData.date} mise à jour avec succès.`);
        }

        setIsCreating(false);
        await fetchSessionManagerData();
        return;
      }

      // Mode création
      let firstDocId: string | null = null;
      const count = isRecurring ? Math.max(1, recurrenceCount) : 1;
      const newRecurrenceGroupId = isRecurring 
        ? `rec_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
        : undefined;

      for (let i = 0; i < count; i++) {
        let dateStr = formData.date || todayStr;
        if (i > 0) {
          const parts = (formData.date || '').split('-');
          if (parts.length === 3) {
            const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
            d.setDate(d.getDate() + (i * 7));
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            dateStr = `${y}-${m}-${day}`;
          }
        }

        const created = await saveSessionApi({
          ...commonFields,
          date: dateStr,
          recurrenceGroupId: newRecurrenceGroupId,
          enrolledStudentIds: [],
          presentStudentIds: [],
          teams: []
        });

        if (i === 0 && created?.id) firstDocId = created.id;
      }

      if (firstDocId) setActiveSessionId(firstDocId);
      setIsCreating(false);
      setNotification(
        count > 1 
          ? `Série créée : ${count} séances consécutives pour « ${formData.name} » avec clôture automatique !`
          : `Séance « ${formData.name} » créée avec succès.`
      );
      await fetchSessionManagerData();
    } catch (error: any) {
      console.error('Erreur enregistrement séance:', error);
      alert("Erreur lors de l'enregistrement de la séance : " + (error?.message || 'Erreur inattendue'));
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!sessionToDelete) return;
    const target = sessions.find(s => s.id === sessionToDelete);
    if (!target) {
      setSessionToDelete(null);
      return;
    }

    const series = getSeriesSessions(target, sessions);
    const hasSeries = series.length > 1;

    try {
      if (hasSeries && deleteScope === 'all') {
        for (const s of series) {
          await deleteSessionApi(s.id);
        }
        setNotification(`Toutes les ${series.length} séances du créneau « ${target.name} » ont été supprimées.`);
      } else if (hasSeries && deleteScope === 'future') {
        const futureTargets = series.filter(s => (s.date || '') >= (target.date || ''));
        for (const s of futureTargets) {
          await deleteSessionApi(s.id);
        }
        setNotification(`${futureTargets.length} séances futures du créneau ont été supprimées.`);
      } else {
        await deleteSessionApi(target.id);
        setNotification(`Séance du ${target.date} supprimée.`);
      }

      if (activeSessionId === sessionToDelete) setActiveSessionId(null);
      await fetchSessionManagerData();
    } catch (err) {
      console.error(err);
    }
    setSessionToDelete(null);
    setDeleteScope('single');
  };

  const toggleEnrollment = async (studentId: string) => {
    if (!activeSession) return;
    const enrolled = new Set<string>(activeSession.enrolledStudentIds || []);
    if (enrolled.has(studentId)) {
      enrolled.delete(studentId);
    } else {
      if (activeSession.requirePaid) {
        const student = students.find(s => s.id === studentId);
        if (student && String(student.paid).toUpperCase() !== 'OUI') {
          const proceed = confirm(`Attention : ${student.firstName} ${student.lastName} n'est pas à jour de cotisation (paiement non validé).\n\nVoulez-vous tout de même l'inscrire à cette séance ?`);
          if (!proceed) return;
        }
      }
      enrolled.add(studentId);
    }
    
    // Also remove from present if un-enrolled
    const present = new Set<string>(activeSession.presentStudentIds || []);
    if (!enrolled.has(studentId) && present.has(studentId)) {
      present.delete(studentId);
    }

    try {
      const newEnrolledIds = Array.from(enrolled);
      const newPresentIds = Array.from(present);

      // Mise à jour optimiste locale immédiate pour réactivité instantanée
      setSessions(prev => prev.map(s => s.id === activeSession.id ? {
        ...s,
        enrolledStudentIds: newEnrolledIds,
        presentStudentIds: newPresentIds
      } : s));

      await saveSessionApi({
        ...activeSession,
        id: activeSession.id,
        enrolledStudentIds: newEnrolledIds,
        presentStudentIds: newPresentIds
      });
      
      if (activeSession.convocationId) {
         await saveConvocationApi({
           id: activeSession.convocationId,
           studentIds: newEnrolledIds
         });
      }
      await fetchSessionManagerData();
    } catch (err) {
      console.error(err);
    }
  };

  const toggleAttendance = async (studentId: string) => {
    if (!activeSession) return;
    const present = new Set<string>(activeSession.presentStudentIds || []);
    if (present.has(studentId)) {
      present.delete(studentId);
    } else {
      present.add(studentId);
    }
    try {
      const newPresentIds = Array.from(present);

      // Mise à jour optimiste locale immédiate
      setSessions(prev => prev.map(s => s.id === activeSession.id ? {
        ...s,
        presentStudentIds: newPresentIds
      } : s));

      await saveSessionApi({
        ...activeSession,
        id: activeSession.id,
        presentStudentIds: newPresentIds
      });
      await fetchSessionManagerData();
    } catch (err) {
      console.error(err);
    }
  };

  const filteredStudents = useMemo(() => {
    return students.filter(student => {
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch = (student.lastName || '').toLowerCase().includes(searchLower) ||
                            (student.firstName || '').toLowerCase().includes(searchLower) ||
                            (student.classGroup || '').toLowerCase().includes(searchLower);
                            
      if (!matchesSearch) return false;
      
      const audience = formData.targetAudience || 'all';
      if (audience === 'students' && student.isAdult) return false;
      if (audience === 'adults' && !student.isAdult) return false;
      
      return true;
    });
  }, [students, searchTerm, formData.targetAudience]);

  // Partitionnement chronologique et par catégorie :
  // Colonne 1 : AS du Soir (Mardi ou Jeudi, 17h00 - 18h00, récurrents)
  // Colonne 2 : Mercredi (Créneaux ponctuels, compétitions, tournois, sorties)
  const { 
    asSoirUpcoming, asSoirUpcomingImmediate, asSoirUpcomingLater, asSoirPast, 
    mercrediUpcoming, mercrediPast,
    totalAsSoir, totalMercredi 
  } = useMemo(() => {
    const q = sessionSearch.trim().toLowerCase();
    const filtered = q
      ? sessions.filter(s => 
          (s.name || '').toLowerCase().includes(q) ||
          (s.date || '').toLowerCase().includes(q) ||
          (s.meetingLocation || '').toLowerCase().includes(q)
        )
      : sessions;

    // Ordre chronologique strict (date puis heure)
    const sorted = [...filtered].sort((a, b) => {
      const dateCmp = (a.date || '').localeCompare(b.date || '');
      if (dateCmp !== 0) return dateCmp;
      return (a.time || '').localeCompare(b.time || '');
    });

    const soirUpImmediate: Session[] = [];
    const soirUpLater: Session[] = [];
    const soirPast: Session[] = [];
    const merUp: Session[] = [];
    const merPast: Session[] = [];

    sorted.forEach(s => {
      const cat = getSessionCategory(s);
      const isUpcoming = (s.date || '') >= todayStr;

      if (cat === 'as_soir') {
        if (isUpcoming) {
          // Filtrage d'une semaine à l'autre pour ne pas saturer l'affichage
          if ((s.date || '') <= asSoirHorizonStr) {
            soirUpImmediate.push(s);
          } else {
            soirUpLater.push(s);
          }
        } else {
          soirPast.push(s);
        }
      } else {
        if (isUpcoming) merUp.push(s);
        else merPast.push(s);
      }
    });

    const soirUp = showLaterAsSoir ? [...soirUpImmediate, ...soirUpLater] : soirUpImmediate;

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
  }, [sessions, sessionSearch, todayStr, asSoirHorizonStr, showLaterAsSoir]);

  const displayedAsSoirPast = useMemo(() => {
    if (pastSortOrder === 'desc') return [...asSoirPast].reverse();
    return asSoirPast;
  }, [asSoirPast, pastSortOrder]);

  const displayedMercrediPast = useMemo(() => {
    if (pastSortOrder === 'desc') return [...mercrediPast].reverse();
    return mercrediPast;
  }, [mercrediPast, pastSortOrder]);

  // Si la séance active est dans l'historique ou s'il n'y a aucune séance à venir, ouvrir l'historique automatiquement
  useEffect(() => {
    if (activeSessionId) {
      if (asSoirPast.some(s => s.id === activeSessionId)) setIsAsSoirHistoryOpen(true);
      if (mercrediPast.some(s => s.id === activeSessionId)) setIsMercrediHistoryOpen(true);
    }
  }, [activeSessionId, asSoirPast, mercrediPast]);

  const renderSessionCard = (s: Session, isPast = false) => {
    const isSelected = activeSessionId === s.id && !isCreating;
    const isToday = s.date === todayStr;
    const series = getSeriesSessions(s, sessions);
    const isSeries = series.length > 1;
    const deadlineText = formatRegistrationRule(s);
    const category = getSessionCategory(s);
    const isSoir = category === 'as_soir';
    const dayName = getSessionDayName(s.date);

    return (
      <div 
        key={s.id}
        onClick={() => { setActiveSessionId(s.id); setIsCreating(false); }}
        className={`p-3 rounded-xl cursor-pointer transition-all border ${
          isSelected 
            ? isSoir
              ? 'bg-purple-50/95 border-purple-400 shadow-sm ring-2 ring-purple-400'
              : 'bg-blue-50/95 border-blue-400 shadow-sm ring-2 ring-blue-400'
            : isPast
              ? 'bg-slate-50/70 border-slate-200/80 hover:border-slate-300 hover:bg-slate-100/60'
              : isToday
                ? 'bg-amber-50/70 border-amber-300 hover:border-amber-400 shadow-xs'
                : 'bg-white border-slate-200/80 hover:border-slate-300 hover:shadow-xs'
        }`}
      >
        <div className="flex justify-between items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`font-bold truncate text-sm ${isSelected ? (isSoir ? 'text-purple-950 font-black' : 'text-blue-950 font-black') : isPast ? 'text-slate-700' : 'text-slate-900'}`}>
                {s.name}
              </span>
              {isSoir && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 flex items-center gap-0.5 border border-purple-200" title="AS du Soir (Mardi / Jeudi)">
                  <Moon className="w-2.5 h-2.5 text-purple-600" /> {dayName || 'Soir'}
                </span>
              )}
              {!isSoir && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 flex items-center gap-0.5 border border-blue-200" title="Mercredi (Créneau ponctuel)">
                  <Zap className="w-2.5 h-2.5 text-blue-600" /> Mercredi
                </span>
              )}
              {isSeries && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 flex items-center gap-0.5 border border-slate-200" title={`Créneau récurrent (${series.length} séances)`}>
                  <Repeat className="w-2.5 h-2.5" /> Récurrent
                </span>
              )}
              {isToday && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-amber-500 text-white shadow-xs">
                  Aujourd'hui
                </span>
              )}
              {isPast && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-200 text-slate-600">
                  Passée
                </span>
              )}
              {s.blockOnlineRegistration && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-0.5" title={s.directRegistrationNotice || "Inscription directe enseignant"}>
                  <Lock className="w-2.5 h-2.5 text-amber-700" />
                  <span>{s.directRegistrationTeacherName ? `Voir ${s.directRegistrationTeacherName}` : "Direct prof"}</span>
                </span>
              )}
              {s.attachedPdf && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-200 flex items-center gap-0.5" title={`Document joint : ${s.attachedPdf.fileName}`}>
                  <FileText className="w-2.5 h-2.5 text-rose-600" />
                  <span>PDF</span>
                </span>
              )}
            </div>
            <div className="text-xs text-slate-500 mt-1 flex items-center gap-1.5 flex-wrap">
              <span className="font-semibold text-slate-700">
                {dayName ? `${dayName} ` : ''}{new Date(s.date + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
              </span>
              <span>•</span>
              <span className="font-medium text-slate-800">{s.time}{s.endTime ? ` - ${s.endTime}` : ''}</span>
              {s.location && <span className="text-slate-400 truncate">• {s.location}</span>}
            </div>
            {deadlineText && deadlineText !== 'Inscriptions sans date limite' && (
              <div className="text-[10px] text-indigo-700 font-medium mt-1 flex items-center gap-1 truncate">
                <Timer className="w-3 h-3 text-indigo-500 shrink-0" />
                <span className="truncate">{deadlineText}</span>
              </div>
            )}
            {s.teacherIds && s.teacherIds.length > 0 && (
              <div className="text-[11px] text-slate-600 font-medium mt-0.5 truncate">
                Resp: {s.teacherIds.map(tid => teachers.find(t => t.id === tid)?.name).filter(Boolean).join(', ')}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className={`text-xs font-semibold px-2 py-0.5 rounded-md border ${
              isPast 
                ? 'bg-slate-100 border-slate-200 text-slate-600' 
                : isSelected
                  ? 'bg-white border-indigo-200 text-indigo-900 font-bold'
                  : 'bg-white border-slate-200 text-slate-700'
            }`} title="Présents / Inscrits">
              {(s.presentStudentIds || []).length} / {(s.enrolledStudentIds || []).length}
            </div>
            <button 
              type="button"
              onClick={(e) => { e.stopPropagation(); setSessionToDelete(s.id); }} 
              className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors" 
              title="Supprimer la séance"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col xl:flex-row gap-6 min-h-[600px] h-full">
      {/* Colonne(s) de gauche : Créneaux récurrents AS du Soir et Créneaux ponctuels Mercredi */}
      <div className={`flex flex-col gap-4 shrink-0 transition-all ${
        activeCategory === 'all' ? 'w-full xl:w-[680px]' : 'w-full xl:w-96'
      }`}>
        {/* Bandeau d'actions et Sélecteur de vue */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 space-y-3">
          <div className="flex items-center gap-2">
            <button 
              onClick={() => openCreateForm(activeCategory === 'mercredi' ? 'mercredi' : 'as_soir')}
              className="flex-1 flex items-center justify-center gap-2 bg-slate-900 text-white py-2 px-3 sm:px-4 rounded-lg font-bold hover:bg-slate-800 transition shadow-sm cursor-pointer text-xs sm:text-sm"
            >
              <PlusCircle className="w-4 h-4 text-emerald-400" />
              <span>Nouveau Créneau</span>
            </button>
          </div>

          {/* Sélecteur de colonnes / onglets rapides */}
          <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setActiveCategory('all')}
              className={`flex-1 py-1.5 px-2 rounded-md transition-all flex items-center justify-center gap-1.5 ${
                activeCategory === 'all'
                  ? 'bg-white text-slate-900 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-indigo-600" />
              <span>2 Colonnes</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveCategory('as_soir')}
              className={`flex-1 py-1.5 px-2 rounded-md transition-all flex items-center justify-center gap-1.5 ${
                activeCategory === 'as_soir'
                  ? 'bg-purple-600 text-white shadow-xs font-bold'
                  : 'text-purple-800 hover:bg-purple-50'
              }`}
            >
              <Moon className="w-3.5 h-3.5 text-purple-300" />
              <span>AS du Soir ({totalAsSoir})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveCategory('mercredi')}
              className={`flex-1 py-1.5 px-2 rounded-md transition-all flex items-center justify-center gap-1.5 ${
                activeCategory === 'mercredi'
                  ? 'bg-blue-600 text-white shadow-xs font-bold'
                  : 'text-blue-800 hover:bg-blue-50'
              }`}
            >
              <Zap className="w-3.5 h-3.5 text-blue-300" />
              <span>Mercredi ({totalMercredi})</span>
            </button>
          </div>

          {/* Recherche */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <input 
              type="text" 
              placeholder="Rechercher un créneau (nom, date, lieu...)" 
              value={sessionSearch} 
              onChange={e => setSessionSearch(e.target.value)} 
              className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500" 
            />
          </div>
        </div>

        {/* CONTENEUR DES COLONNES */}
        <div className={`grid gap-4 ${
          activeCategory === 'all' ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'
        }`}>

          {/* ========================================================= */}
          {/* COLONNE 1 : AS DU SOIR (Mardi & Jeudi 17h00 - 18h00)       */}
          {/* ========================================================= */}
          {(activeCategory === 'all' || activeCategory === 'as_soir') && (
            <div className="bg-white rounded-xl shadow-sm border border-purple-200 overflow-hidden flex flex-col min-h-[500px]">
              {/* En-tête de colonne AS du Soir */}
              <div className="p-3 border-b border-purple-100 bg-gradient-to-r from-purple-50 to-indigo-50/60 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-purple-600 text-white flex items-center justify-center shadow-xs">
                    <Moon className="w-4 h-4 text-purple-100" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm leading-tight flex items-center gap-1.5">
                      <span>AS du Soir</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-purple-100 text-purple-800 font-bold border border-purple-200">
                        {totalAsSoir}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-indigo-50 text-indigo-700 font-semibold border border-indigo-200" title="Affichage limité d'une semaine à l'autre pour ne pas surcharger le calendrier">
                        D'une semaine à l'autre
                      </span>
                    </h3>
                    <p className="text-[10px] font-semibold text-purple-700">
                      Mardi ou Jeudi (17h00 - 18h00) • Récurrents
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => openCreateForm('as_soir')}
                  className="p-1 text-purple-700 hover:bg-purple-100 rounded-md transition-colors"
                  title="Ajouter un créneau AS du Soir (Mardi / Jeudi)"
                >
                  <PlusCircle className="w-4 h-4" />
                </button>
              </div>

              {/* Liste des séances AS du Soir */}
              <div className="overflow-y-auto flex-1 p-2 space-y-3">
                {/* Séances à venir AS du Soir */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between px-2 pt-1 pb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-purple-900 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-purple-600 inline-block animate-pulse"></span>
                      À venir ({asSoirUpcoming.length})
                    </span>
                    {!showLaterAsSoir && (
                      <span className="text-[10px] font-medium text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-100">
                        Semaine en cours & suivante
                      </span>
                    )}
                  </div>

                  {asSoirUpcoming.map(s => renderSessionCard(s, false))}

                  {asSoirUpcoming.length === 0 && (
                    <div className="p-3 text-center text-xs text-purple-800/60 bg-purple-50/40 rounded-lg border border-dashed border-purple-200">
                      Aucun créneau du soir programmé.
                    </div>
                  )}

                  {/* Semaines ultérieures masquées par défaut pour ne pas surcharger */}
                  {asSoirUpcomingLater.length > 0 && !showLaterAsSoir && (
                    <div className="pt-2 border-t border-purple-100">
                      <button
                        type="button"
                        onClick={() => setShowLaterAsSoir(true)}
                        className="w-full flex items-center justify-between p-2 rounded-lg bg-purple-50/70 hover:bg-purple-100 text-purple-900 text-xs font-bold border border-purple-200 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-1.5">
                          <CalendarDays className="w-3.5 h-3.5 text-purple-600" />
                          <span>Semaines suivantes ({asSoirUpcomingLater.length} masquées)</span>
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-purple-700">
                          <span>Afficher tout</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </div>
                      </button>
                    </div>
                  )}

                  {showLaterAsSoir && asSoirUpcomingLater.length > 0 && (
                    <div className="pt-2 border-t border-purple-100">
                      <button
                        type="button"
                        onClick={() => setShowLaterAsSoir(false)}
                        className="w-full flex items-center justify-between p-2 rounded-lg bg-purple-100/70 hover:bg-purple-200/70 text-purple-900 text-xs font-bold border border-purple-200 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-1.5">
                          <CalendarDays className="w-3.5 h-3.5 text-purple-600" />
                          <span>Semaines suivantes ({asSoirUpcomingLater.length} affichées)</span>
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-purple-700">
                          <span>Replier (d'une semaine à l'autre)</span>
                          <ChevronDown className="w-3.5 h-3.5" />
                        </div>
                      </button>
                    </div>
                  )}
                </div>

                {/* Historique des séances passées AS du Soir */}
                {asSoirPast.length > 0 && (
                  <div className="pt-2 border-t border-purple-100">
                    <button
                      type="button"
                      onClick={() => setIsAsSoirHistoryOpen(!isAsSoirHistoryOpen)}
                      className="w-full flex items-center justify-between p-2 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold border border-slate-200 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-1.5">
                        <History className="w-3.5 h-3.5 text-purple-600" />
                        <span>Historique ({asSoirPast.length})</span>
                      </div>
                      {isAsSoirHistoryOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </button>

                    {isAsSoirHistoryOpen && (
                      <div className="mt-1.5 space-y-1.5 animate-in fade-in">
                        {displayedAsSoirPast.map(s => renderSessionCard(s, true))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* COLONNE 2 : MERCREDI (Créneaux ponctuels, compétitions)    */}
          {/* ========================================================= */}
          {(activeCategory === 'all' || activeCategory === 'mercredi') && (
            <div className="bg-white rounded-xl shadow-sm border border-blue-200 overflow-hidden flex flex-col min-h-[500px]">
              {/* En-tête de colonne Mercredi */}
              <div className="p-3 border-b border-blue-100 bg-gradient-to-r from-blue-50 to-cyan-50/60 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
                    <Zap className="w-4 h-4 text-blue-100" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm leading-tight flex items-center gap-1.5">
                      <span>Séances Mercredi</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-blue-100 text-blue-800 font-bold border border-blue-200">
                        {totalMercredi}
                      </span>
                    </h3>
                    <p className="text-[10px] font-semibold text-blue-700">
                      Mercredi • Créneaux ponctuels
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => openCreateForm('mercredi')}
                  className="p-1 text-blue-700 hover:bg-blue-100 rounded-md transition-colors"
                  title="Ajouter un créneau du Mercredi"
                >
                  <PlusCircle className="w-4 h-4" />
                </button>
              </div>

              {/* Liste des séances Mercredi */}
              <div className="overflow-y-auto flex-1 p-2 space-y-3">
                {/* Séances à venir Mercredi */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between px-2 pt-1 pb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-blue-900 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-blue-600 inline-block animate-pulse"></span>
                      À venir ({mercrediUpcoming.length})
                    </span>
                  </div>

                  {mercrediUpcoming.map(s => renderSessionCard(s, false))}

                  {mercrediUpcoming.length === 0 && (
                    <div className="p-3 text-center text-xs text-blue-800/60 bg-blue-50/40 rounded-lg border border-dashed border-blue-200">
                      Aucune séance du mercredi programmée.
                    </div>
                  )}
                </div>

                {/* Historique des séances passées Mercredi */}
                {mercrediPast.length > 0 && (
                  <div className="pt-2 border-t border-blue-100">
                    <button
                      type="button"
                      onClick={() => setIsMercrediHistoryOpen(!isMercrediHistoryOpen)}
                      className="w-full flex items-center justify-between p-2 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold border border-slate-200 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-1.5">
                        <History className="w-3.5 h-3.5 text-blue-600" />
                        <span>Historique ({mercrediPast.length})</span>
                      </div>
                      {isMercrediHistoryOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </button>

                    {isMercrediHistoryOpen && (
                      <div className="mt-1.5 space-y-1.5 animate-in fade-in">
                        {displayedMercrediPast.map(s => renderSessionCard(s, true))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Content */}
      <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
        {isCreating ? (
          <form onSubmit={handleCreate} className="flex flex-col flex-1 h-full min-h-0 overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                  {formData.id ? <Edit2 className="w-5 h-5 text-indigo-600" /> : <PlusCircle className="w-5 h-5 text-indigo-600" />}
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
                    {formData.id ? 'Modifier la séance' : 'Créer une nouvelle séance'}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {formData.id ? 'Mise à jour des paramètres et options' : `Ajout d'un créneau dans l'année active (${activeYear})`}
                  </p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setIsCreating(false)} 
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer"
                title="Fermer"
              >
                ✕
              </button>
            </div>
            
            <div className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1 min-h-0 overscroll-contain">
              {/* BANNIÈRE DE GESTION DE CRÉNEAU RÉCURRENT LORS DE LA MODIFICATION */}
              {formData.id && (() => {
                const currentSeries = getSeriesSessions(formData, sessions);
                if (currentSeries.length <= 1) return null;
                const futureTargets = currentSeries.filter(s => (s.date || '') >= (formData.date || ''));

                return (
                  <div className="bg-gradient-to-r from-purple-50 via-indigo-50 to-blue-50 border-2 border-purple-300 rounded-2xl p-4 sm:p-5 space-y-3.5 shadow-xs animate-in fade-in">
                    <div className="flex items-start gap-3">
                      <div className="p-2.5 bg-purple-600 text-white rounded-xl shrink-0 mt-0.5 shadow-xs">
                        <Repeat className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-bold text-slate-900 text-base">
                            Créneau récurrent détecté : « {formData.name} »
                          </h3>
                          <span className="text-xs px-2.5 py-0.5 bg-purple-100 text-purple-800 rounded-full font-black border border-purple-200">
                            {currentSeries.length} séances au total
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                          Ce créneau est répété chaque semaine. Vous pouvez mettre à jour l'ensemble des séances en une seule fois (horaires, lieu, enseignants responsables, règles et délais d'inscription) tout en préservant le calendrier et les présences de chaque semaine.
                        </p>
                      </div>
                    </div>

                    <div className="pt-1">
                      <label className="block text-xs font-bold text-purple-950 uppercase tracking-wider mb-2">
                        Périmètre des modifications à enregistrer :
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <button
                          type="button"
                          onClick={() => setUpdateScope('all')}
                          className={`text-left p-3 rounded-xl border-2 text-xs transition-all cursor-pointer ${
                            updateScope === 'all'
                              ? 'bg-purple-600 text-white border-purple-600 font-bold shadow-sm ring-2 ring-purple-300'
                              : 'bg-white text-slate-700 border-purple-200 hover:border-purple-400 hover:bg-purple-50/50'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-black text-sm">Toutes les séances</span>
                            <Repeat className="w-4 h-4 opacity-80" />
                          </div>
                          <p className={updateScope === 'all' ? 'text-purple-100 text-[11px]' : 'text-slate-500 text-[11px]'}>
                            Modifier les {currentSeries.length} séances du créneau pour toute l'année
                          </p>
                        </button>

                        <button
                          type="button"
                          onClick={() => setUpdateScope('future')}
                          className={`text-left p-3 rounded-xl border-2 text-xs transition-all cursor-pointer ${
                            updateScope === 'future'
                              ? 'bg-purple-600 text-white border-purple-600 font-bold shadow-sm ring-2 ring-purple-300'
                              : 'bg-white text-slate-700 border-purple-200 hover:border-purple-400 hover:bg-purple-50/50'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-black text-sm">Cette séance et suivantes</span>
                            <CalendarDays className="w-4 h-4 opacity-80" />
                          </div>
                          <p className={updateScope === 'future' ? 'text-purple-100 text-[11px]' : 'text-slate-500 text-[11px]'}>
                            Modifier les {futureTargets.length} séances restantes à venir
                          </p>
                        </button>

                        <button
                          type="button"
                          onClick={() => setUpdateScope('single')}
                          className={`text-left p-3 rounded-xl border-2 text-xs transition-all cursor-pointer ${
                            updateScope === 'single'
                              ? 'bg-purple-600 text-white border-purple-600 font-bold shadow-sm ring-2 ring-purple-300'
                              : 'bg-white text-slate-700 border-purple-200 hover:border-purple-400 hover:bg-purple-50/50'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-black text-sm">Cette séance uniquement</span>
                            <CheckCircle2 className="w-4 h-4 opacity-80" />
                          </div>
                          <p className={updateScope === 'single' ? 'text-purple-100 text-[11px]' : 'text-slate-500 text-[11px]'}>
                            Uniquement la séance du {formData.date}
                          </p>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* SÉLECTEUR RAPIDE DE TYPE DE CRÉNEAU EN MODE CRÉATION */}
              {!formData.id && (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-2">
                  <span className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Type de créneau à programmer :
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => openCreateForm('as_soir')}
                      className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all cursor-pointer ${
                        formData.time?.startsWith('17:') || formData.time?.startsWith('18:')
                          ? 'bg-purple-50/90 border-purple-500 text-purple-950 font-bold shadow-xs ring-1 ring-purple-400'
                          : 'bg-white border-slate-200 text-slate-700 hover:border-purple-300'
                      }`}
                    >
                      <div className="w-8 h-8 rounded-lg bg-purple-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                        <Moon className="w-4 h-4 text-purple-100" />
                      </div>
                      <div>
                        <span className="text-xs font-bold block text-purple-950">🌙 AS du Soir</span>
                        <span className="text-[11px] text-purple-700 block">Mardi ou Jeudi (17h00 - 18h00) • Récurrent</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => openCreateForm('mercredi')}
                      className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all cursor-pointer ${
                        !formData.time?.startsWith('17:') && !formData.time?.startsWith('18:')
                          ? 'bg-blue-50/90 border-blue-500 text-blue-950 font-bold shadow-xs ring-1 ring-blue-400'
                          : 'bg-white border-slate-200 text-slate-700 hover:border-blue-300'
                      }`}
                    >
                      <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                        <Zap className="w-4 h-4 text-blue-100" />
                      </div>
                      <div>
                        <span className="text-xs font-bold block text-blue-950">⚡ Créneau Mercredi</span>
                        <span className="text-[11px] text-blue-700 block">13h30 - 16h30 • Ponctuel / Sorties / Compétitions</span>
                      </div>
                    </button>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Nom de la séance</label>
                <input 
                  type="text" 
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-900"
                  value={formData.name || ''}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  placeholder="Ex: AS Musculation, Entraînement Futsal, etc."
                />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Heure de RDV</label>
                  <input 
                    type="time" 
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={formData.meetingTime || ''}
                    onChange={e => setFormData({...formData, meetingTime: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Lieu de RDV</label>
                  <input 
                    type="text" 
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={formData.meetingLocation || ''}
                    onChange={e => setFormData({...formData, meetingLocation: e.target.value})}
                    placeholder="Ex: Gymnase"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Passage au self</label>
                  <input 
                    type="time" 
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={formData.cafeteriaTime || ''}
                    onChange={e => setFormData({...formData, cafeteriaTime: e.target.value})}
                    title="Heure de passage au self (optionnelle)"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Heure de retour</label>
                  <input 
                    type="time" 
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={formData.returnTime || ''}
                    onChange={e => setFormData({...formData, returnTime: e.target.value})}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    {formData.id && updateScope !== 'single' ? 'Date de référence' : 'Date de la séance'}
                  </label>
                  <input 
                    type="date" 
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-semibold"
                    value={formData.date || ''}
                    onChange={e => setFormData({...formData, date: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Début (Séance)</label>
                  <input 
                    type="time" 
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-semibold"
                    value={formData.time || ''}
                    onChange={e => setFormData({...formData, time: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Fin (Séance)</label>
                  <input 
                    type="time" 
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-semibold"
                    value={formData.endTime || ''}
                    onChange={e => setFormData({...formData, endTime: e.target.value})}
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Lieu de la séance</label>
                <input 
                  type="text" 
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={formData.location || ''}
                  onChange={e => setFormData({...formData, location: e.target.value})}
                  placeholder="Ex: Salle de musculation, Halle des sports..."
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Informations supplémentaires / consignes</label>
                <textarea 
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={formData.description || ''}
                  onChange={e => setFormData({...formData, description: e.target.value})}
                  placeholder="Ex: Prévoir serviette et bouteille d'eau obligatoires..."
                  rows={2}
                />
              </div>

              {/* SECTION : DOCUMENT JOINT / RECUEIL D'INFORMATIONS (PDF) */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-indigo-600" />
                    <span>Document PDF joint (Recueil d'informations utiles)</span>
                  </label>
                  <span className="text-[10px] text-slate-500 font-medium">Optionnel • Max 25 Mo</span>
                </div>
                <p className="text-xs text-slate-500">
                  Ce document (règlement, consignes, horaires, plan, parcours...) sera consultable et téléchargeable par les élèves et les enseignants sur la feuille de séance.
                </p>

                {formData.attachedPdf ? (
                  <div className="p-3 bg-white border border-indigo-200 rounded-xl shadow-2xs flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-red-100 text-red-600 flex items-center justify-center font-black text-[10px] shrink-0 border border-red-200">
                        PDF
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 truncate">
                          {formData.attachedPdf.fileName}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {formatFileSize(formData.attachedPdf.fileSize)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => downloadAttachedPdf(formData.attachedPdf!)}
                        className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                        title="Télécharger pour vérifier"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, attachedPdf: null })}
                        className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        title="Supprimer ce document"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setIsPdfDraggingInForm(true); }}
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsPdfDraggingInForm(true); }}
                    onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsPdfDraggingInForm(false); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsPdfDraggingInForm(false);
                      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                        handleDropPdfInForm(e.dataTransfer.files[0]);
                      }
                    }}
                    onClick={() => formPdfInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-3.5 text-center cursor-pointer transition-all ${
                      isPdfDraggingInForm 
                        ? 'border-indigo-600 bg-indigo-50/70 scale-[1.01]' 
                        : 'border-slate-300 hover:border-indigo-400 hover:bg-white bg-slate-100/50'
                    }`}
                  >
                    <input 
                      ref={formPdfInputRef}
                      type="file"
                      accept=".pdf,application/pdf"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          handleDropPdfInForm(e.target.files[0]);
                        }
                      }}
                    />
                    <div className="flex flex-col items-center">
                      <FileUp className="w-5 h-5 text-indigo-500 mb-1" />
                      <span className="text-xs font-bold text-slate-700">
                        Glisser-déposer un fichier PDF ici
                      </span>
                      <span className="text-[10px] text-slate-400">
                        ou cliquez pour parcourir vos fichiers
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Nombre maximum de participants (optionnel)</label>
                  <input 
                    type="number" 
                    min="1"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={formData.maxParticipants || ''}
                    onChange={e => setFormData({...formData, maxParticipants: e.target.value ? parseInt(e.target.value) : undefined})}
                    placeholder="Laisser vide pour illimité"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Public Cible</label>
                  <select 
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={formData.targetAudience || 'all'}
                    onChange={e => setFormData({...formData, targetAudience: e.target.value as any})}
                  >
                    <option value="all">Tous (Élèves et Adultes)</option>
                    <option value="students">Élèves uniquement</option>
                    <option value="adults">Adultes/Encadrants uniquement</option>
                  </select>
                </div>
              </div>

              {teachers.length > 0 && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Enseignants Responsables</label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {teachers.map(t => (
                      <label key={t.id} className="flex items-center gap-2 cursor-pointer p-2 bg-white border border-slate-200 rounded-lg hover:border-indigo-300 transition-colors">
                        <input 
                          type="checkbox" 
                          className="rounded text-indigo-600 focus:ring-indigo-500"
                          checked={(formData.teacherIds || []).includes(t.id)}
                          onChange={e => {
                            const current = new Set(formData.teacherIds || []);
                            if (e.target.checked) current.add(t.id);
                            else current.delete(t.id);
                            setFormData({...formData, teacherIds: Array.from(current)});
                          }}
                        />
                        <span className="text-sm font-medium text-slate-700">{t.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* OPTION : BLOQUER L'INSCRIPTION EN LIGNE AVEC MENTION ENSEIGNANT */}
              <div className="bg-amber-50/80 border-2 border-amber-300 rounded-xl p-4 sm:p-5 space-y-3.5 shadow-2xs">
                <div className="flex items-start justify-between gap-3">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input 
                      type="checkbox"
                      className="w-4 h-4 text-amber-600 rounded border-gray-300 focus:ring-amber-500 mt-0.5"
                      checked={!!formData.blockOnlineRegistration}
                      onChange={e => {
                        const checked = e.target.checked;
                        const defaultTeacher = teachers.find(t => (formData.teacherIds || []).includes(t.id)) || teachers[0];
                        setFormData(prev => ({
                          ...prev,
                          blockOnlineRegistration: checked,
                          directRegistrationTeacherId: checked ? (prev.directRegistrationTeacherId || defaultTeacher?.id) : prev.directRegistrationTeacherId,
                          directRegistrationTeacherName: checked ? (prev.directRegistrationTeacherName || defaultTeacher?.name) : prev.directRegistrationTeacherName,
                          directRegistrationNotice: checked 
                            ? (prev.directRegistrationNotice || (defaultTeacher?.name ? `voir l'inscription directement avec ${defaultTeacher.name}` : "voir l'inscription directement avec l'enseignant responsable"))
                            : prev.directRegistrationNotice
                        }));
                      }}
                    />
                    <div>
                      <span className="text-xs font-bold text-amber-950 uppercase tracking-wide flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5 text-amber-700" />
                        Bloquer l'inscription en ligne (inscription directe auprès d'un enseignant)
                      </span>
                      <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed font-medium">
                        Cochez cette option pour interdire l'inscription via le site internet. Une mention officielle invitera les élèves à s'adresser directement à l'enseignant coché.
                      </p>
                    </div>
                  </label>
                  {formData.blockOnlineRegistration && (
                    <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase rounded-full bg-amber-200 text-amber-900 border border-amber-300 shrink-0">
                      Activé
                    </span>
                  )}
                </div>

                {formData.blockOnlineRegistration && (
                  <div className="pt-3 border-t border-amber-200/90 space-y-3 bg-white/70 p-3.5 rounded-lg">
                    <div>
                      <label className="block text-xs font-bold text-amber-950 mb-1.5">
                        Cocher l'un des enseignants pour l'inscription directe :
                      </label>
                      {teachers.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                          {teachers.map(t => {
                            const isSelected = formData.directRegistrationTeacherId === t.id;
                            return (
                              <label
                                key={t.id}
                                className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-left text-xs font-bold transition-all cursor-pointer select-none ${
                                  isSelected 
                                    ? 'bg-amber-600 text-white border-amber-700 shadow-xs' 
                                    : 'bg-white text-slate-700 border-amber-200 hover:bg-amber-50 hover:border-amber-400'
                                }`}
                              >
                                <input 
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => {
                                    if (isSelected) {
                                      setFormData(prev => ({
                                        ...prev,
                                        directRegistrationTeacherId: undefined,
                                        directRegistrationTeacherName: undefined,
                                        directRegistrationNotice: "voir l'inscription directement avec l'enseignant responsable"
                                      }));
                                    } else {
                                      setFormData(prev => ({
                                        ...prev,
                                        directRegistrationTeacherId: t.id,
                                        directRegistrationTeacherName: t.name,
                                        directRegistrationNotice: `voir l'inscription directement avec ${t.name}`
                                      }));
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
                        <p className="text-xs text-amber-800 italic">Aucun enseignant configuré dans l'application.</p>
                      )}
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-bold text-amber-950">
                          Mention affichée aux élèves et parents :
                        </label>
                        <span className="text-[10px] text-amber-700 font-medium">Texte personnalisable</span>
                      </div>
                      <input 
                        type="text"
                        className="w-full px-3 py-2 text-xs font-bold bg-white text-amber-950 border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-2xs"
                        value={formData.directRegistrationNotice || ''}
                        onChange={e => setFormData(prev => ({ ...prev, directRegistrationNotice: e.target.value }))}
                        placeholder="Ex: voir l'inscription directement avec M. Dupont"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION CLÉ : MODALITÉS & DÉLAIS D'INSCRIPTION (Délai en jours vs Date calendrier) */}
              <div className="bg-slate-50 p-4 sm:p-5 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-indigo-600" />
                      Modalités & Délais d'inscription
                    </label>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Réglez les conditions de clôture et d'ouverture des inscriptions
                    </p>
                  </div>
                  
                  {/* Sélecteur de mode de délai */}
                  <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 text-xs font-semibold shadow-2xs">
                    <button
                      type="button"
                      onClick={() => {
                        setDeadlineMode('relative');
                        setFormData(prev => ({
                          ...prev,
                          registrationDaysBefore: prev.registrationDaysBefore !== undefined && prev.registrationDaysBefore !== null ? prev.registrationDaysBefore : 1,
                          registrationCloseTime: prev.registrationCloseTime || '18:00',
                          registrationCloseDate: undefined,
                          registrationOpenDate: undefined
                        }));
                      }}
                      className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                        deadlineMode === 'relative' 
                          ? 'bg-indigo-600 text-white font-bold shadow-xs' 
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      ⏱️ Délai en jours (Recommandé)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDeadlineMode('fixed');
                        setFormData(prev => ({
                          ...prev,
                          registrationDaysBefore: undefined,
                          registrationCloseTime: undefined,
                          registrationOpenDaysBefore: undefined
                        }));
                      }}
                      className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                        deadlineMode === 'fixed' 
                          ? 'bg-indigo-600 text-white font-bold shadow-xs' 
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      📅 Date calendrier fixe
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDeadlineMode('none');
                        setFormData(prev => ({
                          ...prev,
                          registrationDaysBefore: undefined,
                          registrationCloseTime: undefined,
                          registrationOpenDaysBefore: undefined,
                          registrationCloseDate: undefined,
                          registrationOpenDate: undefined
                        }));
                      }}
                      className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                        deadlineMode === 'none' 
                          ? 'bg-indigo-600 text-white font-bold shadow-xs' 
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Sans date limite
                    </button>
                  </div>
                </div>

                {/* CONTENU SELON LE MODE CHOISI */}
                {deadlineMode === 'relative' && (
                  <div className="space-y-3 pt-1">
                    <div className="bg-white p-3.5 rounded-xl border border-indigo-200 shadow-2xs space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
                          Clôture des inscriptions avant la séance
                        </label>
                        <span className="text-[11px] text-indigo-700 font-bold bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-100">
                          Automatique sur chaque semaine
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Nombre de jours avant la séance (J-X)
                          </label>
                          <div className="flex items-center gap-2">
                            <input 
                              type="number" 
                              min="0"
                              max="60"
                              className="w-24 px-3 py-1.5 text-sm font-bold text-slate-900 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              value={formData.registrationDaysBefore !== undefined ? formData.registrationDaysBefore : 1}
                              onChange={e => setFormData({
                                ...formData, 
                                registrationDaysBefore: e.target.value === '' ? 0 : parseInt(e.target.value, 10)
                              })}
                            />
                            <span className="text-xs text-slate-700 font-semibold">
                              {(formData.registrationDaysBefore ?? 1) === 0 
                                ? 'jour (le jour même de la séance)' 
                                : (formData.registrationDaysBefore ?? 1) === 1 
                                  ? 'jour (la veille de la séance)' 
                                  : 'jours avant la séance'}
                            </span>
                          </div>

                          {/* Raccourcis rapides */}
                          <div className="flex flex-wrap gap-1 mt-2">
                            {[
                              { label: 'J-0 (Jour même)', val: 0 },
                              { label: 'J-1 (La veille)', val: 1 },
                              { label: 'J-2 (2 jours)', val: 2 },
                              { label: 'J-3 (3 jours)', val: 3 },
                              { label: 'J-7 (1 semaine)', val: 7 }
                            ].map(preset => (
                              <button
                                key={preset.val}
                                type="button"
                                onClick={() => setFormData({ ...formData, registrationDaysBefore: preset.val })}
                                className={`text-[10px] px-2.5 py-0.5 rounded-md border font-medium transition-colors cursor-pointer ${
                                  (formData.registrationDaysBefore ?? 1) === preset.val
                                    ? 'bg-indigo-600 text-white border-indigo-600 font-bold'
                                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                                }`}
                              >
                                {preset.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Heure limite le jour de clôture
                          </label>
                          <input 
                            type="time" 
                            className="w-full px-3 py-1.5 text-sm font-bold text-slate-900 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            value={formData.registrationCloseTime || '18:00'}
                            onChange={e => setFormData({ ...formData, registrationCloseTime: e.target.value })}
                          />

                          {/* Heures rapides */}
                          <div className="flex flex-wrap gap-1 mt-2">
                            {['12:00', '18:00', '20:00'].map(t => (
                              <button
                                key={t}
                                type="button"
                                onClick={() => setFormData({ ...formData, registrationCloseTime: t })}
                                className={`text-[10px] px-2 py-0.5 rounded border transition-colors cursor-pointer ${
                                  formData.registrationCloseTime === t
                                    ? 'bg-indigo-600 text-white border-indigo-600 font-bold'
                                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                                }`}
                              >
                                {t}
                              </button>
                            ))}
                            {formData.time && (
                              <button
                                type="button"
                                onClick={() => setFormData({ ...formData, registrationCloseTime: formData.time })}
                                className={`text-[10px] px-2 py-0.5 rounded border transition-colors cursor-pointer ${
                                  formData.registrationCloseTime === formData.time
                                    ? 'bg-indigo-600 text-white border-indigo-600 font-bold'
                                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                                }`}
                              >
                                Début ({formData.time})
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Aperçu concret calculé dynamiquement */}
                      {(() => {
                        const days = formData.registrationDaysBefore !== undefined ? Number(formData.registrationDaysBefore) : 1;
                        const closeTime = formData.registrationCloseTime || '18:00';
                        const sessionDateStr = formData.date || todayStr;
                        const parts = sessionDateStr.split('-');
                        let previewText = '';
                        if (parts.length === 3) {
                          const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
                          d.setDate(d.getDate() - days);
                          const closeDayStr = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
                          const sessDayStr = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
                          previewText = `Pour la séance du ${sessDayStr}, les inscriptions se fermeront le ${closeDayStr} à ${closeTime}.`;
                        }
                        return (
                          <div className="bg-indigo-50/80 border border-indigo-200 rounded-lg p-3 text-xs text-indigo-950 flex items-start gap-2.5">
                            <Sparkles className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                            <div>
                              <p className="font-bold text-indigo-900">{previewText}</p>
                              <p className="text-[11px] text-indigo-700 mt-0.5 leading-relaxed">
                                ✨ Idéal pour les créneaux récurrents : chaque semaine calcule sa clôture automatiquement selon cette règle, sans avoir à ressaisir de date de calendrier !
                              </p>
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Ouverture des inscriptions (optionnel) */}
                    <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-2.5">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input 
                          type="checkbox"
                          className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                          checked={enableOpenDeadline}
                          onChange={e => {
                            setEnableOpenDeadline(e.target.checked);
                            if (e.target.checked && (formData.registrationOpenDaysBefore === undefined || formData.registrationOpenDaysBefore === null)) {
                              setFormData(prev => ({ ...prev, registrationOpenDaysBefore: 7 }));
                            }
                          }}
                        />
                        <span className="text-xs font-bold text-slate-800">
                          Restreindre l'ouverture des inscriptions à l'avance (ex: ouvrir 7 jours avant)
                        </span>
                      </label>

                      {enableOpenDeadline && (
                        <div className="pl-6 pt-1 space-y-2 border-t border-slate-100">
                          <div className="flex items-center gap-2">
                            <label className="text-xs font-medium text-slate-600">
                              Ouvrir les inscriptions :
                            </label>
                            <input 
                              type="number"
                              min="1"
                              max="60"
                              className="w-20 px-2 py-1 text-xs font-bold border border-slate-300 rounded-lg"
                              value={formData.registrationOpenDaysBefore !== undefined ? formData.registrationOpenDaysBefore : 7}
                              onChange={e => setFormData({ 
                                ...formData, 
                                registrationOpenDaysBefore: e.target.value === '' ? 7 : parseInt(e.target.value, 10) 
                              })}
                            />
                            <span className="text-xs text-slate-600 font-medium">jours avant la séance</span>
                          </div>
                          <div className="flex gap-1">
                            {[
                              { label: '3 jours avant', val: 3 },
                              { label: '1 semaine avant (7j)', val: 7 },
                              { label: '2 semaines avant (14j)', val: 14 }
                            ].map(preset => (
                              <button
                                key={preset.val}
                                type="button"
                                onClick={() => setFormData({ ...formData, registrationOpenDaysBefore: preset.val })}
                                className={`text-[10px] px-2.5 py-0.5 rounded border transition-colors cursor-pointer ${
                                  (formData.registrationOpenDaysBefore ?? 7) === preset.val
                                    ? 'bg-indigo-600 text-white border-indigo-600 font-bold'
                                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                                }`}
                              >
                                {preset.label}
                              </button>
                            ))}
                          </div>
                          <p className="text-[11px] text-slate-500">
                            💡 Les élèves ne pourront s'inscrire qu'à compter de {formData.registrationOpenDaysBefore ?? 7} jours avant chaque séance.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {deadlineMode === 'fixed' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Date & heure d'ouverture (optionnel)
                      </label>
                      <input 
                        type="datetime-local" 
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                        value={formData.registrationOpenDate || ''}
                        onChange={e => setFormData({...formData, registrationOpenDate: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Date & heure de fermeture (optionnel)
                      </label>
                      <input 
                        type="datetime-local" 
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                        value={formData.registrationCloseDate || ''}
                        onChange={e => setFormData({...formData, registrationCloseDate: e.target.value})}
                      />
                    </div>
                  </div>
                )}

                {deadlineMode === 'none' && (
                  <div className="bg-white p-3 rounded-lg border border-slate-200 text-xs text-slate-600 flex items-center gap-2">
                    <Info className="w-4 h-4 text-slate-400 shrink-0" />
                    <span>
                      Les inscriptions resteront ouvertes en permanence jusqu'à l'heure de début de la séance.
                    </span>
                  </div>
                )}
              </div>

              {/* Éléments nécessaires pour s'inscrire */}
              <div className="bg-slate-50/90 p-4 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-indigo-600" />
                    Éléments nécessaires pour pouvoir s'inscrire
                  </label>
                  <span className="text-[11px] text-slate-500 font-medium">Contrôle à l'inscription</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                  <label className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${formData.requirePaid ? 'bg-indigo-50/80 border-indigo-300 text-indigo-950' : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'}`}>
                    <input 
                      type="checkbox" 
                      className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 mt-0.5"
                      checked={formData.requirePaid || false}
                      onChange={e => setFormData({...formData, requirePaid: e.target.checked})}
                    />
                    <div>
                      <span className="text-xs font-bold block">Cotisation à jour</span>
                      <span className="text-[10px] text-slate-500 leading-tight block">Paiement validé exigé</span>
                    </div>
                  </label>

                  <label className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${formData.requireLicense ? 'bg-indigo-50/80 border-indigo-300 text-indigo-950' : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'}`}>
                    <input 
                      type="checkbox" 
                      className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 mt-0.5"
                      checked={formData.requireLicense || false}
                      onChange={e => setFormData({...formData, requireLicense: e.target.checked})}
                    />
                    <div>
                      <span className="text-xs font-bold block">Numéro de licence</span>
                      <span className="text-[10px] text-slate-500 leading-tight block">Licence AS obligatoire</span>
                    </div>
                  </label>

                  <label className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${formData.requireParentalAuth ? 'bg-indigo-50/80 border-indigo-300 text-indigo-950' : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'}`}>
                    <input 
                      type="checkbox" 
                      className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 mt-0.5"
                      checked={formData.requireParentalAuth || false}
                      onChange={e => setFormData({...formData, requireParentalAuth: e.target.checked})}
                    />
                    <div>
                      <span className="text-xs font-bold block">Autorisation parentale</span>
                      <span className="text-[10px] text-slate-500 leading-tight block">AP validée exigée</span>
                    </div>
                  </label>

                  <label className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${formData.requireSwimmingCertificate ? 'bg-indigo-50/80 border-indigo-300 text-indigo-950' : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'}`}>
                    <input 
                      type="checkbox" 
                      className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 mt-0.5"
                      checked={formData.requireSwimmingCertificate || false}
                      onChange={e => setFormData({...formData, requireSwimmingCertificate: e.target.checked})}
                    />
                    <div>
                      <span className="text-xs font-bold block">Savoir nager</span>
                      <span className="text-[10px] text-slate-500 leading-tight block">Attestation requise</span>
                    </div>
                  </label>
                </div>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer p-2 bg-amber-50 border border-amber-200 rounded-lg">
                  <input 
                    type="checkbox" 
                    className="rounded text-amber-600 focus:ring-amber-500 w-5 h-5"
                    checked={formData.needSnack || false}
                    onChange={e => setFormData({...formData, needSnack: e.target.checked})}
                  />
                  <span className="text-sm font-semibold text-amber-800">Prévoir un goûter</span>
                </label>

                {/* Option Inscription en Équipe */}
                <div className="bg-purple-50/80 p-3 rounded-xl border border-purple-200 space-y-2">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="rounded text-purple-600 focus:ring-purple-500 w-5 h-5"
                      checked={formData.isTeamRegistration || false}
                      onChange={e => setFormData({
                        ...formData, 
                        isTeamRegistration: e.target.checked,
                        teamSize: e.target.checked ? (formData.teamSize || 4) : undefined
                      })}
                    />
                    <span className="text-sm font-bold text-purple-950 flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-purple-700" />
                      Inscription en équipe (Tournoi / Raid / Relais...)
                    </span>
                  </label>

                  {formData.isTeamRegistration && (
                    <div className="pl-7 pt-1 space-y-1.5 border-t border-purple-200/60 mt-1">
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-bold text-purple-900 whitespace-nowrap">
                          Nombre d'élèves requis par équipe :
                        </label>
                        <input 
                          type="number"
                          min="2"
                          max="20"
                          required={formData.isTeamRegistration}
                          className="w-20 px-2.5 py-1 text-xs font-bold text-purple-900 bg-white border border-purple-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                          value={formData.teamSize || 4}
                          onChange={e => setFormData({...formData, teamSize: parseInt(e.target.value) || 2})}
                        />
                      </div>
                      <p className="text-xs text-purple-700 leading-tight">
                        L'inscription de l'équipe ne pourra être validée que lorsque celle-ci comptera exactement <strong>{formData.teamSize || 4} élèves</strong>.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {!formData.id && (
                <div className="border-t border-slate-200 pt-4 mt-4">
                  <label className="flex items-center gap-2 cursor-pointer p-3 bg-purple-50/80 border border-purple-200 rounded-xl hover:bg-purple-100/50 transition-colors">
                    <input 
                      type="checkbox" 
                      className="rounded text-purple-600 focus:ring-purple-500 w-5 h-5"
                      checked={isRecurring}
                      onChange={e => setIsRecurring(e.target.checked)}
                    />
                    <div>
                      <span className="text-sm font-bold text-purple-950 block">Répéter cette séance (créneau récurrent hebdomadaire)</span>
                      <span className="text-xs text-purple-700 block">Ex: AS Musculation tous les mercredis</span>
                    </div>
                  </label>
                  
                  {isRecurring && (
                    <div className="mt-3 ml-2 pl-4 border-l-2 border-purple-300 space-y-2">
                      <label className="block text-xs font-bold text-slate-700">Nombre total de séances hebdomadaires à générer</label>
                      <div className="flex items-center gap-3">
                        <input 
                          type="number" 
                          min="2"
                          max="40"
                          className="w-28 px-3 py-2 border border-slate-300 rounded-lg font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                          value={recurrenceCount}
                          onChange={e => setRecurrenceCount(parseInt(e.target.value) || 2)}
                        />
                        <div className="flex gap-1">
                          {[4, 8, 12, 16, 25].map(cnt => (
                            <button
                              key={cnt}
                              type="button"
                              onClick={() => setRecurrenceCount(cnt)}
                              className={`text-xs px-2.5 py-1 rounded-md border font-semibold transition-colors cursor-pointer ${
                                recurrenceCount === cnt 
                                  ? 'bg-purple-600 text-white border-purple-600' 
                                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              {cnt} sem.
                            </button>
                          ))}
                        </div>
                      </div>
                      <p className="text-xs text-slate-500">
                        Chaque séance sera espacée de 7 jours et partagera la même règle de clôture d'inscription relative.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50/90 flex items-center justify-between gap-3 shrink-0">
              <button 
                type="button" 
                onClick={() => setIsCreating(false)} 
                className="px-4 py-2 bg-slate-100 text-slate-700 font-semibold rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Annuler
              </button>
              <button 
                type="submit" 
                disabled={isSaving}
                className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg transition-colors shadow-sm cursor-pointer disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    <span>Enregistrement en cours...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>
                      {formData.id 
                        ? (() => {
                            const curSeries = getSeriesSessions(formData, sessions);
                            const fut = curSeries.filter(s => (s.date || '') >= (formData.date || ''));
                            if (curSeries.length > 1 && updateScope === 'all') {
                              return `Modifier les ${curSeries.length} séances du créneau « ${formData.name} »`;
                            }
                            if (curSeries.length > 1 && updateScope === 'future') {
                              return `Modifier les ${fut.length} séances à venir`;
                            }
                            return 'Enregistrer les modifications';
                          })()
                        : (isRecurring
                            ? `Créer la série de ${recurrenceCount} séances`
                            : 'Enregistrer la séance')}
                    </span>
                  </>
                )}
              </button>
            </div>
          </form>
        ) : activeSession ? (
          <div 
            className="flex flex-col h-full relative"
            onDragEnter={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsPdfDraggingOnSheet(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsPdfDraggingOnSheet(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (e.currentTarget.contains(e.relatedTarget as Node)) return;
              setIsPdfDraggingOnSheet(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsPdfDraggingOnSheet(false);
              if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                handleDropPdfOnSheet(e.dataTransfer.files[0]);
              }
            }}
          >
            {/* Overlay visuel lors du glisser-déposer sur toute la feuille de séance */}
            {isPdfDraggingOnSheet && (
              <div className="absolute inset-0 z-50 bg-indigo-900/85 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-white text-center rounded-2xl border-4 border-dashed border-indigo-300 animate-in fade-in duration-150 pointer-events-none">
                <FileUp className="w-16 h-16 mb-4 text-indigo-200 animate-bounce" />
                <h3 className="text-xl sm:text-2xl font-black">
                  Déposez votre document PDF ici
                </h3>
                <p className="text-sm text-indigo-100 max-w-md mt-2 font-medium">
                  Le PDF (recueil d'informations utiles, consignes, horaires, plan...) sera immédiatement joint à la feuille de séance « {activeSession.name} ».
                </p>
                <span className="mt-4 px-3 py-1 rounded-full bg-indigo-500/40 border border-indigo-300/40 text-xs font-semibold">
                  Relâchez le document pour l'associer
                </span>
              </div>
            )}
            <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-1.5">
                  <h2 className="text-2xl font-black text-slate-900">{activeSession.name}</h2>
                  
                  {/* Badge créneau récurrent */}
                  {(() => {
                    const series = getSeriesSessions(activeSession, sessions);
                    if (series.length > 1) {
                      return (
                        <button
                          onClick={() => openEditForm(activeSession)}
                          className="bg-purple-100 hover:bg-purple-200 text-purple-800 text-xs font-bold px-2.5 py-1 rounded-full border border-purple-200 flex items-center gap-1.5 cursor-pointer transition-colors"
                          title="Cliquez pour modifier l'ensemble des séances du créneau"
                        >
                          <Repeat className="w-3.5 h-3.5 text-purple-700" />
                          <span>Créneau récurrent ({series.length} séances)</span>
                        </button>
                      );
                    }
                    return null;
                  })()}

                  {activeSession.isTeamRegistration && (
                    <span className="bg-purple-100 text-purple-800 text-xs font-bold px-2.5 py-1 rounded-full border border-purple-200 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-purple-700" />
                      Équipe ({activeSession.teamSize || 4} élèves / équipe)
                    </span>
                  )}
                  {activeSession.requirePaid && (
                    <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-2 py-0.5 rounded-full border border-emerald-200">💳 Cotisation requise</span>
                  )}
                  {activeSession.requireLicense && (
                    <span className="bg-indigo-100 text-indigo-800 text-xs font-bold px-2 py-0.5 rounded-full border border-indigo-200">🪪 Licence requise</span>
                  )}
                  {activeSession.requireParentalAuth && (
                    <span className="bg-amber-100 text-amber-800 text-xs font-bold px-2 py-0.5 rounded-full border border-amber-200">📄 AP requise</span>
                  )}
                  {activeSession.requireSwimmingCertificate && (
                    <span className="bg-cyan-100 text-cyan-800 text-xs font-bold px-2 py-0.5 rounded-full border border-cyan-200">🏊 Savoir nager requis</span>
                  )}
                  {activeSession.needSnack && (
                    <span className="bg-amber-100 text-amber-800 text-xs font-bold px-2 py-1 rounded-full border border-amber-200">Goûter à prévoir</span>
                  )}
                </div>

                <div className="flex flex-col gap-1 mt-2">
                  <p className="text-slate-600 font-medium text-sm">
                    📅 {new Date(activeSession.date + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} • 
                    🕒 {activeSession.time} {activeSession.endTime ? `- ${activeSession.endTime}` : ''}
                  </p>
                  {activeSession.location && (
                    <p className="text-slate-600 font-medium text-sm">📍 {activeSession.location}</p>
                  )}
                  {activeSession.description && (
                    <p className="text-slate-500 text-sm mt-1 bg-white p-2 rounded border border-slate-200 inline-block">
                      {activeSession.description}
                    </p>
                  )}

                  {/* Règle & État d'inscription en direct */}
                  {(() => {
                    const regStatus = getSessionRegistrationStatus(activeSession);
                    const ruleStr = formatRegistrationRule(activeSession);

                    return (
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-900">
                          <Timer className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                          <span>Règle : {ruleStr}</span>
                        </span>

                        {regStatus.notYetOpen && (
                          <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
                            <span>⏳</span>
                            <span>{regStatus.statusLabel}</span>
                          </span>
                        )}
                        {regStatus.isClosed && (
                          <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-700">
                            <span>🔒</span>
                            <span>{regStatus.statusLabel}</span>
                          </span>
                        )}
                        {regStatus.isOpen && (
                          <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800">
                            <span>🟢</span>
                            <span>{regStatus.statusLabel}</span>
                          </span>
                        )}
                      </div>
                    );
                  })()}

                  {activeSession.blockOnlineRegistration && (
                    <div className="mt-3 p-3 bg-amber-50 border border-amber-300 rounded-xl text-amber-950 flex items-start gap-2.5">
                      <Lock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold text-xs uppercase tracking-wide text-amber-900 block">
                          🔒 Inscription en ligne bloquée
                        </span>
                        <span className="text-xs font-semibold text-amber-800">
                          {activeSession.directRegistrationNotice || (activeSession.directRegistrationTeacherName 
                            ? `Voir l'inscription directement avec ${activeSession.directRegistrationTeacherName}`
                            : "Voir l'inscription directement avec l'enseignant responsable.")}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <button 
                  onClick={() => {
                    const url = `${window.location.origin}?enroll=${activeSession.id}`;
                    navigator.clipboard.writeText(url);
                    alert('Lien copié : ' + url);
                  }}
                  className="mt-3 flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer"
                >
                  <Link2 className="w-4 h-4" /> Copier le lien d'inscription publique
                </button>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button 
                  onClick={() => openEditForm(activeSession)}
                  className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors cursor-pointer border border-indigo-100 hover:border-indigo-300"
                  title="Modifier cette séance ou la série complète"
                >
                  <Edit2 className="w-5 h-5" />
                </button>
                <button 
                  onClick={() => setSessionToDelete(activeSession.id)}
                  className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-colors cursor-pointer border border-red-100 hover:border-red-300"
                  title="Supprimer la séance"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            <div className="p-6 flex-1 flex flex-col overflow-hidden">
              {/* ZONE DU DOCUMENT JOINT (PDF) SUR LA FEUILLE DE SÉANCE */}
              <div className="mb-5 shrink-0">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-indigo-600" />
                    <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Document joint / Recueil d'informations utiles (PDF)
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500 font-medium">
                    {activeSession.attachedPdf ? "Document en ligne pour cette séance" : "Glissez-déposez votre PDF ici"}
                  </span>
                </div>

                {activeSession.attachedPdf ? (
                  <div
                    onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setIsPdfDraggingOnSheet(true); }}
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsPdfDraggingOnSheet(true); }}
                    onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsPdfDraggingOnSheet(false); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsPdfDraggingOnSheet(false);
                      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                        handleDropPdfOnSheet(e.dataTransfer.files[0]);
                      }
                    }}
                    className={`p-3.5 sm:p-4 rounded-xl border-2 transition-all ${
                      isPdfDraggingOnSheet 
                        ? 'border-indigo-600 bg-indigo-50/80 scale-[1.01]' 
                        : 'border-indigo-200/90 bg-indigo-50/40 hover:border-indigo-300'
                    }`}
                  >
                    <input 
                      ref={sheetPdfInputRef}
                      type="file"
                      accept=".pdf,application/pdf"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          handleDropPdfOnSheet(e.target.files[0]);
                        }
                      }}
                    />

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shrink-0 font-black text-xs shadow-2xs border border-red-200">
                          PDF
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                            {activeSession.attachedPdf.fileName}
                          </p>
                          <p className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                            <span>Taille : {formatFileSize(activeSession.attachedPdf.fileSize)}</span>
                            <span>•</span>
                            <span>Déposé le {new Date(activeSession.attachedPdf.uploadedAt).toLocaleDateString('fr-FR')}</span>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setViewingPdfDoc(activeSession.attachedPdf!)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-indigo-700 text-xs font-bold rounded-lg border border-indigo-200 shadow-2xs transition-colors cursor-pointer"
                          title="Consulter le PDF dans l'application"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Consulter</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => downloadAttachedPdf(activeSession.attachedPdf!)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-bold rounded-lg shadow-2xs transition-colors cursor-pointer"
                          title="Télécharger le fichier PDF sur votre ordinateur"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Télécharger</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => sheetPdfInputRef.current?.click()}
                          className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-white rounded-lg transition-colors cursor-pointer"
                          title="Remplacer par un autre PDF"
                        >
                          <FileUp className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={handleDeletePdfFromSheet}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-white rounded-lg transition-colors cursor-pointer"
                          title="Supprimer ce document de la séance"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400 italic mt-2">
                      💡 Vous pouvez glisser un autre fichier PDF sur ce cadre à tout moment pour le remplacer.
                    </p>
                  </div>
                ) : (
                  <div
                    onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setIsPdfDraggingOnSheet(true); }}
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsPdfDraggingOnSheet(true); }}
                    onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsPdfDraggingOnSheet(false); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsPdfDraggingOnSheet(false);
                      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                        handleDropPdfOnSheet(e.dataTransfer.files[0]);
                      }
                    }}
                    onClick={() => sheetPdfInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-3.5 sm:p-4 text-center cursor-pointer transition-all ${
                      isPdfDraggingOnSheet
                        ? 'border-indigo-600 bg-indigo-50/70 scale-[1.01]'
                        : 'border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/30 bg-slate-50/60'
                    }`}
                  >
                    <input 
                      ref={sheetPdfInputRef}
                      type="file"
                      accept=".pdf,application/pdf"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          handleDropPdfOnSheet(e.target.files[0]);
                        }
                      }}
                    />
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3">
                      <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                        {isUploadingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
                      </div>
                      <div className="text-center sm:text-left">
                        <span className="text-xs font-bold text-slate-800 block">
                          Glisser-déposer un PDF sur cette feuille de séance
                        </span>
                        <span className="text-[11px] text-slate-500 block">
                          Recueil d'informations utiles pour les élèves ou les enseignants (consignes, horaires, plan...) • ou cliquez pour parcourir
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-4 mb-4">
                <div className="relative flex-1">
                  <input 
                    type="text" 
                    placeholder="Rechercher un élève par nom ou prénom..." 
                    className="w-full pl-10 pr-4 py-2.5 bg-white border-2 border-indigo-200 focus:border-indigo-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-100 font-semibold text-sm shadow-2xs"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                  />
                  <Search className="w-4 h-4 text-indigo-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {/* Section Équipes si la séance est en mode équipe */}
              {activeSession.isTeamRegistration && (
                <div className="mb-6 bg-purple-50/50 p-4 rounded-xl border border-purple-100 shrink-0">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                      <Users className="w-4 h-4 text-purple-600" />
                      Équipes inscrites ({activeSession.teams?.length || 0})
                    </h3>
                    <span className="text-xs bg-purple-100 text-purple-800 font-bold px-2.5 py-0.5 rounded-full border border-purple-200">
                      Règle : {activeSession.teamSize || 4} élèves par équipe
                    </span>
                  </div>

                  {(!activeSession.teams || activeSession.teams.length === 0) ? (
                    <p className="text-xs text-slate-500 italic py-1">
                      Aucune équipe n'est encore constituée pour cette séance.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {activeSession.teams.map((team, idx) => (
                        <div key={team.id} className="bg-white p-3 rounded-lg border border-purple-200/80 shadow-xs flex flex-col justify-between">
                          <div>
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                                <span className="w-4 h-4 rounded-full bg-purple-100 text-purple-700 text-[10px] flex items-center justify-center font-black">
                                  {idx + 1}
                                </span>
                                <span className="truncate">{team.name}</span>
                              </span>
                              <button
                                onClick={async () => {
                                  if (confirm(`Supprimer l'équipe "${team.name}" ?`)) {
                                    await deleteTeamFromSession(activeSession.id, team.id);
                                    await fetchSessionManagerData();
                                  }
                                }}
                                className="text-slate-400 hover:text-red-500 p-0.5 transition-colors cursor-pointer"
                                title="Supprimer cette équipe"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <div className="space-y-1">
                              {team.studentIds.map(sid => {
                                const st = students.find(s => s.id === sid);
                                return (
                                  <div key={sid} className="text-[11px] text-slate-700 flex items-center justify-between bg-slate-50 px-2 py-0.5 rounded">
                                    <span className="truncate">{st ? `${st.lastName} ${st.firstName}` : sid}</span>
                                    {st?.classGroup && <span className="text-[9px] text-slate-400 font-bold ml-1">{st.classGroup}</span>}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                          <div className="mt-2 pt-1 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
                            <span>{team.studentIds.length} / {activeSession.teamSize || 4} membres</span>
                            <span className="text-emerald-600 font-semibold">Équipe complète ✓</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 flex-1 overflow-hidden">
                
                {/* List of enrolled students */}
                <div className="flex flex-col overflow-hidden border border-slate-200 rounded-xl">
                  <div className="bg-slate-100 p-3 border-b border-slate-200 font-semibold text-slate-700 flex justify-between">
                    <span>Pointage des présents</span>
                    <span className="bg-white px-2 py-0.5 rounded text-xs border border-slate-200">
                      {(activeSession.presentStudentIds || []).length} / {(activeSession.enrolledStudentIds || []).length} présents
                    </span>
                  </div>
                  <div className="overflow-y-auto flex-1 p-2 space-y-1">
                    {filteredStudents.filter(s => (activeSession.enrolledStudentIds || []).includes(s.id)).map(s => {
                      const isPresent = (activeSession.presentStudentIds || []).includes(s.id);
                      return (
                        <div key={`enrolled_${s.id}`} className={`flex items-center justify-between p-2 rounded-lg border ${isPresent ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-100'} hover:border-slate-300 transition-colors`}>
                          <div className="flex items-center gap-3">
                            <button 
                              onClick={() => toggleAttendance(s.id)}
                              className={`p-1 rounded-full transition-colors ${isPresent ? 'text-emerald-600' : 'text-slate-300 hover:text-slate-400'}`}
                            >
                              {isPresent ? <CheckCircle2 className="w-6 h-6" /> : <Circle className="w-6 h-6" />}
                            </button>
                            <div>
                              <div className="font-semibold text-slate-800 flex items-center gap-1 flex-wrap">
                                {String(s.parentalAuth).toUpperCase() !== 'OUI' && <span title="Autorisation parentale manquante" className="text-sm text-rose-500 leading-none">AP🚫</span>}
                                {String(s.swimmingCertificate).toUpperCase() !== 'OUI' && <span title="Savoir nager non validé" className="text-sm">🏊‍♂️🚫</span>}
                                {String(s.imageRights).toUpperCase() !== 'OUI' && <span title="Droit à l'image non validé" className="text-sm">📷🚫</span>}
                                {String(s.paid).toUpperCase() !== 'OUI' && <span title="Paiement manquant" className="text-sm text-rose-500 font-bold leading-none">€🚫</span>}
                                {activeSession.requirePaid && (
                                  String(s.paid).toUpperCase() === 'OUI' ? (
                                    <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-1.5 py-0.5 rounded border border-emerald-300">Cotisation OK ✓</span>
                                  ) : (
                                    <span className="bg-rose-100 text-rose-800 text-[10px] font-bold px-1.5 py-0.5 rounded border border-rose-300">Cotisation non payée ⚠️</span>
                                  )
                                )}
                                <span>{s.lastName} {s.firstName}</span>
                              </div>
                              <span className="text-xs text-slate-500">{s.classGroup}</span>
                            </div>
                          </div>
                          <button 
                            onClick={() => toggleEnrollment(s.id)}
                            className="text-xs text-slate-400 hover:text-red-500 px-2 py-1"
                            title="Désinscrire"
                          >
                            Retirer
                          </button>
                        </div>
                      );
                    })}
                    {(activeSession.enrolledStudentIds || []).length === 0 && (
                      <p className="text-center text-slate-500 py-8 text-sm">Aucun élève inscrit pour cette séance. Sélectionnez-les dans la liste de droite.</p>
                    )}
                  </div>
                </div>

                {/* List of non-enrolled students (Database) */}
                <div className="flex flex-col overflow-hidden border border-slate-200 rounded-xl">
                  <div className="bg-slate-50 p-3 border-b border-slate-200 font-semibold text-slate-700">
                    Tous les élèves ({filteredStudents.length})
                  </div>
                  <div className="overflow-y-auto flex-1 p-2 space-y-1">
                    {filteredStudents.map(s => {
                      const isEnrolled = (activeSession.enrolledStudentIds || []).includes(s.id);
                      return (
                        <div key={`all_${s.id}`} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded-lg transition-colors border border-transparent hover:border-slate-100">
                          <div>
                            <div className="font-medium text-slate-700 flex items-center gap-1 flex-wrap">
                                {String(s.parentalAuth).toUpperCase() !== 'OUI' && <span title="Autorisation parentale manquante" className="text-sm text-rose-500 leading-none">AP🚫</span>}
                                {String(s.swimmingCertificate).toUpperCase() !== 'OUI' && <span title="Savoir nager non validé" className="text-sm">🏊‍♂️🚫</span>}
                                {String(s.imageRights).toUpperCase() !== 'OUI' && <span title="Droit à l'image non validé" className="text-sm">📷🚫</span>}
                                {String(s.paid).toUpperCase() !== 'OUI' && <span title="Paiement manquant" className="text-sm text-rose-500 font-bold leading-none">€🚫</span>}
                                {activeSession.requirePaid && (
                                  String(s.paid).toUpperCase() === 'OUI' ? (
                                    <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-1.5 py-0.5 rounded border border-emerald-300">Cotisation OK ✓</span>
                                  ) : (
                                    <span className="bg-rose-100 text-rose-800 text-[10px] font-bold px-1.5 py-0.5 rounded border border-rose-300">Cotisation non payée ⚠️</span>
                                  )
                                )}
                                <span>{s.lastName} {s.firstName}</span>
                            </div>
                            <span className="text-xs text-slate-400">{s.classGroup}</span>
                          </div>
                          <button 
                            onClick={() => toggleEnrollment(s.id)}
                            className={`text-xs px-3 py-1 rounded-full font-medium transition-colors ${isEnrolled ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                          >
                            {isEnrolled ? 'Inscrit' : 'Inscrire'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
            <Users className="w-12 h-12 mb-4 opacity-20" />
            <p>Sélectionnez ou créez une séance</p>
          </div>
        )}
      </div>

      {/* MODALE DE SUPPRESSION AVEC GESTION DE CRÉNEAU RÉCURRENT */}
      {sessionToDelete && (() => {
        const target = sessions.find(s => s.id === sessionToDelete);
        if (!target) return null;
        const series = getSeriesSessions(target, sessions);
        const futureSeries = series.filter(s => (s.date || '') >= (target.date || ''));

        if (series.length > 1) {
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
              <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-red-100 text-red-600 rounded-xl">
                    <Trash2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-lg">Supprimer des séances</h3>
                    <p className="text-xs text-slate-500">
                      Créneau récurrent « {target.name} » ({series.length} séances au total)
                    </p>
                  </div>
                </div>

                <p className="text-sm text-slate-600">
                  Cette séance fait partie d'une série récurrente. Choisissez quelles séances vous souhaitez supprimer :
                </p>

                <div className="space-y-2">
                  <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    deleteScope === 'single'
                      ? 'bg-red-50 border-red-300 text-red-950 font-semibold'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}>
                    <input 
                      type="radio" 
                      name="deleteScope" 
                      checked={deleteScope === 'single'} 
                      onChange={() => setDeleteScope('single')}
                      className="mt-1 text-red-600 focus:ring-red-500"
                    />
                    <div>
                      <span className="block text-sm font-bold">Uniquement cette séance</span>
                      <span className="block text-xs text-slate-500">Séance du {target.date}</span>
                    </div>
                  </label>

                  <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    deleteScope === 'future'
                      ? 'bg-red-50 border-red-300 text-red-950 font-semibold'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}>
                    <input 
                      type="radio" 
                      name="deleteScope" 
                      checked={deleteScope === 'future'} 
                      onChange={() => setDeleteScope('future')}
                      className="mt-1 text-red-600 focus:ring-red-500"
                    />
                    <div>
                      <span className="block text-sm font-bold">Cette séance et les séances suivantes</span>
                      <span className="block text-xs text-slate-500">{futureSeries.length} séance(s) à partir du {target.date}</span>
                    </div>
                  </label>

                  <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    deleteScope === 'all'
                      ? 'bg-red-50 border-red-300 text-red-950 font-semibold'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}>
                    <input 
                      type="radio" 
                      name="deleteScope" 
                      checked={deleteScope === 'all'} 
                      onChange={() => setDeleteScope('all')}
                      className="mt-1 text-red-600 focus:ring-red-500"
                    />
                    <div>
                      <span className="block text-sm font-bold">Toutes les séances du créneau</span>
                      <span className="block text-xs text-slate-500">Supprimer les {series.length} séances de l'année scolaire</span>
                    </div>
                  </label>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button 
                    type="button" 
                    onClick={() => { setSessionToDelete(null); setDeleteScope('single'); }} 
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-sm transition-colors cursor-pointer"
                  >
                    Annuler
                  </button>
                  <button 
                    type="button" 
                    onClick={confirmDelete}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg text-sm transition-colors shadow-sm cursor-pointer"
                  >
                    Confirmer la suppression
                  </button>
                </div>
              </div>
            </div>
          );
        }

        return (
          <ConfirmDialog 
            isOpen={!!sessionToDelete}
            title="Supprimer la séance"
            message="Êtes-vous sûr de vouloir supprimer cette séance ? Cette action est irréversible et supprimera également les données de pointage associées."
            onConfirm={confirmDelete}
            onCancel={() => setSessionToDelete(null)}
          />
        );
      })()}

      {/* Visionneuse PDF intégrée */}
      {viewingPdfDoc && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex flex-col p-3 sm:p-6 animate-in fade-in">
          <div className="bg-white rounded-2xl flex-1 flex flex-col overflow-hidden max-w-4xl w-full mx-auto shadow-2xl border border-slate-200">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-red-100 text-red-600 flex items-center justify-center font-black text-xs shrink-0">
                  PDF
                </div>
                <div className="min-w-0">
                  <span className="font-bold text-slate-900 text-sm truncate block">
                    {viewingPdfDoc.fileName}
                  </span>
                  <span className="text-[10px] text-slate-500 font-medium">
                    Recueil d'informations ({formatFileSize(viewingPdfDoc.fileSize)})
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => downloadAttachedPdf(viewingPdfDoc)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-bold rounded-lg transition-colors shadow-xs cursor-pointer"
                  title="Télécharger le document"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Télécharger</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewingPdfDoc(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                  title="Fermer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 bg-slate-100 p-2 min-h-0">
              <iframe
                src={viewingPdfDoc.fileData}
                title={viewingPdfDoc.fileName}
                className="w-full h-full rounded-xl border border-slate-200 bg-white"
              />
            </div>
          </div>
        </div>
      )}

      {/* Notification Toast */}
      {notification && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-5 border border-slate-700">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="text-sm font-semibold">{notification}</span>
          <button 
            onClick={() => setNotification(null)}
            className="text-slate-400 hover:text-white text-xs font-bold ml-2 p-1"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

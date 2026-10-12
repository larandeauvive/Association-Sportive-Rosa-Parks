import React, { useState, useMemo } from 'react';
import { Session, Student } from '../types';
import { normalizeGender } from '../lib/utils';
import { getSessionCategory } from '../lib/sessionUtils';
import { 
  Moon, Calendar, Clock, TrendingUp, Users, 
  ArrowUpRight, PieChart, Sparkles, CheckCircle2, ChevronRight, History
} from 'lucide-react';
import { AttendanceDetailModal, SlotAnalysisData, DemographicBreakdown } from './AttendanceDetailModal';

interface Props {
  sessions: Session[];
  students: Student[];
  activeYear: string;
}

// Vérifie si une séance est passée (strictement à la date d'aujourd'hui ou antérieure)
export function isPastSession(s: Partial<Session>, todayStr: string): boolean {
  if (!s.date) return false;
  return s.date <= todayStr;
}

// Vérifie si une séance a lieu en fin d'après-midi / soirée (le soir)
export function isEveningSession(s: Partial<Session>): boolean {
  if (s.time) {
    // Exclure les séances du matin ou du midi
    if (
      s.time.startsWith('08:') || s.time.startsWith('09:') || 
      s.time.startsWith('10:') || s.time.startsWith('11:') || 
      s.time.startsWith('12:') || s.time.startsWith('13:')
    ) {
      return false;
    }
    if (s.time >= '16:00' || s.time.startsWith('17:') || s.time.startsWith('18:') || s.time.startsWith('19:')) {
      return true;
    }
  }
  return getSessionCategory(s) === 'as_soir' || /soir|muscu|sport co/i.test(s.name || '');
}

export const AttendanceStatsSection: React.FC<Props> = ({ sessions, students, activeYear }) => {
  const [selectedSlot, setSelectedSlot] = useState<SlotAnalysisData | null>(null);

  // Date du jour format YYYY-MM-DD
  const todayStr = useMemo(() => {
    return new Date().toISOString().split('T')[0];
  }, []);

  const todayFr = useMemo(() => {
    return new Date().toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  }, []);

  // Indexation des élèves par ID pour un accès rapide
  const studentMap = useMemo(() => {
    const map = new Map<string, Student>();
    students.forEach(s => map.set(s.id, s));
    return map;
  }, [students]);

  // Filtrer STRICTEMENT les séances passées de l'année active (hors créneaux adultes)
  const pastSessions = useMemo(() => {
    return sessions.filter(s => {
      if (s.schoolYear && s.schoolYear !== activeYear) return false;
      if (s.targetAudience === 'adults') return false;
      return isPastSession(s, todayStr);
    });
  }, [sessions, activeYear, todayStr]);

  // Fonction helper pour calculer les statistiques démographiques (Filles/Garçons et Niveaux)
  const computeBreakdown = (
    sessList: Session[],
    mode: 'cumulative' | 'unique'
  ): { breakdown: DemographicBreakdown; uniqueIds: Set<string>; totalAttendances: number } => {
    let girls = 0;
    let boys = 0;
    let unassignedGender = 0;
    let level2nde = 0;
    let level1ere = 0;
    let levelTerminale = 0;
    let levelAutre = 0;
    let totalAttendances = 0;
    const uniqueIds = new Set<string>();

    if (mode === 'cumulative') {
      sessList.forEach(s => {
        const attendees = (s.presentStudentIds && s.presentStudentIds.length > 0)
          ? s.presentStudentIds
          : (s.enrolledStudentIds || []);

        attendees.forEach(id => {
          totalAttendances++;
          uniqueIds.add(id);
          const st = studentMap.get(id);
          if (st) {
            const g = normalizeGender(st.gender);
            if (g === 'F') girls++;
            else if (g === 'M') boys++;
            else unassignedGender++;

            const c = (st.classGroup || '').toUpperCase();
            if (c.includes('2') || c.includes('SECONDE')) level2nde++;
            else if (c.includes('1') || c.includes('PREMIERE')) level1ere++;
            else if (c.includes('T') || c.includes('TERM')) levelTerminale++;
            else levelAutre++;
          } else {
            unassignedGender++;
            levelAutre++;
          }
        });
      });
    } else {
      // Mode élèves uniques
      sessList.forEach(s => {
        const attendees = (s.presentStudentIds && s.presentStudentIds.length > 0)
          ? s.presentStudentIds
          : (s.enrolledStudentIds || []);
        attendees.forEach(id => uniqueIds.add(id));
      });

      uniqueIds.forEach(id => {
        const st = studentMap.get(id);
        if (st) {
          const g = normalizeGender(st.gender);
          if (g === 'F') girls++;
          else if (g === 'M') boys++;
          else unassignedGender++;

          const c = (st.classGroup || '').toUpperCase();
          if (c.includes('2') || c.includes('SECONDE')) level2nde++;
          else if (c.includes('1') || c.includes('PREMIERE')) level1ere++;
          else if (c.includes('T') || c.includes('TERM')) levelTerminale++;
          else levelAutre++;
        } else {
          unassignedGender++;
          levelAutre++;
        }
      });
      totalAttendances = uniqueIds.size;
    }

    const total = mode === 'cumulative' ? totalAttendances : uniqueIds.size;
    const specifiedGenderTotal = girls + boys;
    const baseGender = specifiedGenderTotal > 0 ? specifiedGenderTotal : (total || 1);
    const girlsPercent = total > 0 ? Math.round((girls / baseGender) * 100) : 0;
    const boysPercent = total > 0 ? 100 - girlsPercent : 0;

    const baseLevel = total > 0 ? total : 1;
    const level2ndePercent = total > 0 ? Math.round((level2nde / baseLevel) * 100) : 0;
    const level1erePercent = total > 0 ? Math.round((level1ere / baseLevel) * 100) : 0;
    const levelTerminalePercent = total > 0 ? Math.round((levelTerminale / baseLevel) * 100) : 0;
    const levelAutrePercent = total > 0 ? Math.max(0, 100 - (level2ndePercent + level1erePercent + levelTerminalePercent)) : 0;

    return {
      breakdown: {
        total,
        girls,
        boys,
        unassignedGender,
        girlsPercent,
        boysPercent,
        level2nde,
        level1ere,
        levelTerminale,
        levelAutre,
        level2ndePercent,
        level1erePercent,
        levelTerminalePercent,
        levelAutrePercent
      },
      uniqueIds,
      totalAttendances
    };
  };

  // Création des 4 créneaux d'analyse (calculés UNIQUEMENT sur les séances passées)
  const slotStats = useMemo(() => {
    // 1. Découpage des séances passées
    const tuesdaySessions: Session[] = [];
    const thursdaySessions: Session[] = [];
    const wednesdaySessions: Session[] = [];
    const allEveningSessions: Session[] = [];

    pastSessions.forEach(sess => {
      const cat = getSessionCategory(sess);
      let day = -1;
      if (sess.date) {
        const parts = sess.date.split('-');
        if (parts.length === 3) {
          const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
          day = d.getDay();
        }
      }

      const isEvening = isEveningSession(sess);

      // Mardi Soir (day === 2 et horaire de soirée)
      if (day === 2 && isEvening) {
        tuesdaySessions.push(sess);
        allEveningSessions.push(sess);
      }
      // Jeudi Soir (day === 4 et horaire de soirée)
      else if (day === 4 && isEvening) {
        thursdaySessions.push(sess);
        allEveningSessions.push(sess);
      }
      // Mercredi (day === 3 ou catégorie mercredi)
      else if (day === 3 || cat === 'mercredi') {
        wednesdaySessions.push(sess);
      }
      // Autre créneau du soir éventuel (ex: lundi soir ou vendredi soir)
      else if (cat === 'as_soir' && isEvening) {
        allEveningSessions.push(sess);
      }
    });

    const buildSlotData = (
      key: SlotAnalysisData['slotKey'],
      title: string,
      badgeLabel: string,
      description: string,
      accentColor: SlotAnalysisData['accentColor'],
      sessList: Session[]
    ): SlotAnalysisData => {
      // Tri chronologique des séances passées
      const sorted = [...sessList].sort((a, b) => (a.date || '').localeCompare(b.date || ''));

      let totalPresent = 0;
      let totalEnrolled = 0;
      let sessionsWithRollCall = 0;

      sorted.forEach(s => {
        const pCount = (s.presentStudentIds || []).length;
        const eCount = (s.enrolledStudentIds || []).length;
        if (pCount > 0) {
          totalPresent += pCount;
          sessionsWithRollCall++;
        } else {
          // Si l'appel n'a pas été pointé, on prend les élèves inscrits
          totalPresent += eCount;
        }
        totalEnrolled += eCount;
      });

      const count = sorted.length;
      const avgPresent = count > 0 ? parseFloat((totalPresent / count).toFixed(1)) : 0;
      const avgEnrolled = count > 0 ? parseFloat((totalEnrolled / count).toFixed(1)) : 0;

      const cum = computeBreakdown(sorted, 'cumulative');
      const unq = computeBreakdown(sorted, 'unique');

      return {
        slotKey: key,
        title,
        badgeLabel,
        description,
        accentColor,
        sessions: sorted,
        averageAttendance: avgPresent,
        averageEnrolled: avgEnrolled,
        totalAttendances: cum.totalAttendances,
        totalEnrolled,
        uniqueStudentsCount: unq.uniqueIds.size,
        sessionsWithRollCall,
        cumulativeStats: cum.breakdown,
        uniqueStats: unq.breakdown
      };
    };

    return {
      soirGlobal: buildSlotData(
        'soir_global',
        'Fréquentation moyenne le soir',
        'Global Soir',
        'Créneaux du soir de l\'AS (Mardi et Jeudi de 17h à 18h / 19h combinés)',
        'purple',
        allEveningSessions
      ),
      mardiSoir: buildSlotData(
        'mardi_soir',
        'Fréquentation Mardi soir',
        'Mardi 17h-18h',
        'Créneaux sportifs réguliers du mardi soir (ex: Musculation, Renforcement, Loisirs)',
        'indigo',
        tuesdaySessions
      ),
      jeudiSoir: buildSlotData(
        'jeudi_soir',
        'Fréquentation Jeudi soir',
        'Jeudi 17h-18h',
        'Créneaux sportifs réguliers du jeudi soir (ex: Sports collectifs, Musculation)',
        'amber',
        thursdaySessions
      ),
      mercredi: buildSlotData(
        'mercredi',
        'Fréquentation Mercredi',
        'Mercredi 13h-17h',
        'Créneaux d\'activités du mercredi après-midi (compétitions UNSS, sorties et tournois)',
        'emerald',
        wednesdaySessions
      )
    };
  }, [pastSessions, studentMap]);

  return (
    <div className="space-y-4">
      {/* Section Header */}
      <div className="flex items-center justify-between flex-wrap gap-2 pt-2">
        <div>
          <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-indigo-600" />
            Fréquentation moyenne des créneaux de l'AS
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Calculée <strong className="text-slate-700 font-bold">exclusivement à partir des séances passées</strong> • Cliquez sur une case pour ouvrir le détail mixité (filles/garçons) et niveaux (2ndes, 1ère, Tale).
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
            <History className="w-3.5 h-3.5" />
            Séances passées uniquement ({pastSessions.length})
          </span>

          <span className="text-xs font-semibold px-3 py-1 bg-slate-100 text-slate-600 rounded-xl border border-slate-200">
            Au {todayFr}
          </span>
        </div>
      </div>

      {/* Grid des 4 cartes de fréquentation */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* 1. MOYENNE DU SOIR (GLOBAL) */}
        <div 
          onClick={() => setSelectedSlot(slotStats.soirGlobal)}
          className="group relative bg-white hover:bg-purple-50/20 p-5 rounded-2xl border-2 border-purple-200/80 hover:border-purple-400 shadow-xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 bg-purple-100 text-purple-700 rounded-xl group-hover:scale-105 transition-transform">
                <Moon className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-black px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full border border-purple-200">
                Total Soir
              </span>
            </div>

            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Moyenne le soir
            </p>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-3xl font-black text-slate-900">
                {slotStats.soirGlobal.averageAttendance}
              </span>
              <span className="text-xs font-bold text-purple-600">
                élèves / séance
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {slotStats.soirGlobal.sessions.length} séance{slotStats.soirGlobal.sessions.length > 1 ? 's' : ''} passée{slotStats.soirGlobal.sessions.length > 1 ? 's' : ''} • {slotStats.soirGlobal.uniqueStudentsCount} élèves uniques
            </p>

            {/* Micro-barres Mixité & Niveaux */}
            <div className="mt-4 pt-3 border-t border-slate-100 space-y-2">
              <div>
                <div className="flex justify-between text-[11px] font-bold mb-1">
                  <span className="text-rose-600">♀ {slotStats.soirGlobal.cumulativeStats.girlsPercent}%</span>
                  <span className="text-blue-600">♂ {slotStats.soirGlobal.cumulativeStats.boysPercent}%</span>
                </div>
                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden flex">
                  <div className="bg-rose-500 h-full" style={{ width: `${slotStats.soirGlobal.cumulativeStats.girlsPercent}%` }} />
                  <div className="bg-blue-600 h-full" style={{ width: `${slotStats.soirGlobal.cumulativeStats.boysPercent}%` }} />
                </div>
              </div>

              <div className="flex items-center justify-between text-[10px] font-semibold text-slate-500 pt-0.5">
                <span className="text-emerald-700">2nde: {slotStats.soirGlobal.cumulativeStats.level2ndePercent}%</span>
                <span className="text-amber-700">1ère: {slotStats.soirGlobal.cumulativeStats.level1erePercent}%</span>
                <span className="text-purple-700">Tale: {slotStats.soirGlobal.cumulativeStats.levelTerminalePercent}%</span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-2 flex items-center justify-between text-xs font-bold text-purple-700 group-hover:text-purple-900">
            <span>Détail complet</span>
            <ChevronRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
          </div>
        </div>

        {/* 2. MARDI SOIR */}
        <div 
          onClick={() => setSelectedSlot(slotStats.mardiSoir)}
          className="group relative bg-white hover:bg-indigo-50/20 p-5 rounded-2xl border-2 border-indigo-200/80 hover:border-indigo-400 shadow-xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 bg-indigo-100 text-indigo-700 rounded-xl group-hover:scale-105 transition-transform">
                <Clock className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-black px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full border border-indigo-200">
                Mardi 17h
              </span>
            </div>

            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Mardi soir
            </p>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-3xl font-black text-slate-900">
                {slotStats.mardiSoir.averageAttendance}
              </span>
              <span className="text-xs font-bold text-indigo-600">
                élèves / séance
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {slotStats.mardiSoir.sessions.length} séance{slotStats.mardiSoir.sessions.length > 1 ? 's' : ''} passée{slotStats.mardiSoir.sessions.length > 1 ? 's' : ''} • {slotStats.mardiSoir.uniqueStudentsCount} élèves uniques
            </p>

            {/* Micro-barres Mixité & Niveaux */}
            <div className="mt-4 pt-3 border-t border-slate-100 space-y-2">
              <div>
                <div className="flex justify-between text-[11px] font-bold mb-1">
                  <span className="text-rose-600">♀ {slotStats.mardiSoir.cumulativeStats.girlsPercent}%</span>
                  <span className="text-blue-600">♂ {slotStats.mardiSoir.cumulativeStats.boysPercent}%</span>
                </div>
                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden flex">
                  <div className="bg-rose-500 h-full" style={{ width: `${slotStats.mardiSoir.cumulativeStats.girlsPercent}%` }} />
                  <div className="bg-blue-600 h-full" style={{ width: `${slotStats.mardiSoir.cumulativeStats.boysPercent}%` }} />
                </div>
              </div>

              <div className="flex items-center justify-between text-[10px] font-semibold text-slate-500 pt-0.5">
                <span className="text-emerald-700">2nde: {slotStats.mardiSoir.cumulativeStats.level2ndePercent}%</span>
                <span className="text-amber-700">1ère: {slotStats.mardiSoir.cumulativeStats.level1erePercent}%</span>
                <span className="text-purple-700">Tale: {slotStats.mardiSoir.cumulativeStats.levelTerminalePercent}%</span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-2 flex items-center justify-between text-xs font-bold text-indigo-700 group-hover:text-indigo-900">
            <span>Détail filles/garçons & niveaux</span>
            <ChevronRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
          </div>
        </div>

        {/* 3. JEUDI SOIR */}
        <div 
          onClick={() => setSelectedSlot(slotStats.jeudiSoir)}
          className="group relative bg-white hover:bg-amber-50/20 p-5 rounded-2xl border-2 border-amber-200/80 hover:border-amber-400 shadow-xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 bg-amber-100 text-amber-700 rounded-xl group-hover:scale-105 transition-transform">
                <Clock className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-black px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full border border-amber-200">
                Jeudi 17h
              </span>
            </div>

            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Jeudi soir
            </p>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-3xl font-black text-slate-900">
                {slotStats.jeudiSoir.averageAttendance}
              </span>
              <span className="text-xs font-bold text-amber-600">
                élèves / séance
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {slotStats.jeudiSoir.sessions.length} séance{slotStats.jeudiSoir.sessions.length > 1 ? 's' : ''} passée{slotStats.jeudiSoir.sessions.length > 1 ? 's' : ''} • {slotStats.jeudiSoir.uniqueStudentsCount} élèves uniques
            </p>

            {/* Micro-barres Mixité & Niveaux */}
            <div className="mt-4 pt-3 border-t border-slate-100 space-y-2">
              <div>
                <div className="flex justify-between text-[11px] font-bold mb-1">
                  <span className="text-rose-600">♀ {slotStats.jeudiSoir.cumulativeStats.girlsPercent}%</span>
                  <span className="text-blue-600">♂ {slotStats.jeudiSoir.cumulativeStats.boysPercent}%</span>
                </div>
                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden flex">
                  <div className="bg-rose-500 h-full" style={{ width: `${slotStats.jeudiSoir.cumulativeStats.girlsPercent}%` }} />
                  <div className="bg-blue-600 h-full" style={{ width: `${slotStats.jeudiSoir.cumulativeStats.boysPercent}%` }} />
                </div>
              </div>

              <div className="flex items-center justify-between text-[10px] font-semibold text-slate-500 pt-0.5">
                <span className="text-emerald-700">2nde: {slotStats.jeudiSoir.cumulativeStats.level2ndePercent}%</span>
                <span className="text-amber-700">1ère: {slotStats.jeudiSoir.cumulativeStats.level1erePercent}%</span>
                <span className="text-purple-700">Tale: {slotStats.jeudiSoir.cumulativeStats.levelTerminalePercent}%</span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-2 flex items-center justify-between text-xs font-bold text-amber-700 group-hover:text-amber-900">
            <span>Détail filles/garçons & niveaux</span>
            <ChevronRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
          </div>
        </div>

        {/* 4. MERCREDI */}
        <div 
          onClick={() => setSelectedSlot(slotStats.mercredi)}
          className="group relative bg-white hover:bg-emerald-50/20 p-5 rounded-2xl border-2 border-emerald-200/80 hover:border-emerald-400 shadow-xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 bg-emerald-100 text-emerald-700 rounded-xl group-hover:scale-105 transition-transform">
                <Calendar className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-black px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-200">
                Mercredi PM
              </span>
            </div>

            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Mercredi
            </p>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-3xl font-black text-slate-900">
                {slotStats.mercredi.averageAttendance}
              </span>
              <span className="text-xs font-bold text-emerald-600">
                élèves / séance
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {slotStats.mercredi.sessions.length} séance{slotStats.mercredi.sessions.length > 1 ? 's' : ''} passée{slotStats.mercredi.sessions.length > 1 ? 's' : ''} • {slotStats.mercredi.uniqueStudentsCount} élèves uniques
            </p>

            {/* Micro-barres Mixité & Niveaux */}
            <div className="mt-4 pt-3 border-t border-slate-100 space-y-2">
              <div>
                <div className="flex justify-between text-[11px] font-bold mb-1">
                  <span className="text-rose-600">♀ {slotStats.mercredi.cumulativeStats.girlsPercent}%</span>
                  <span className="text-blue-600">♂ {slotStats.mercredi.cumulativeStats.boysPercent}%</span>
                </div>
                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden flex">
                  <div className="bg-rose-500 h-full" style={{ width: `${slotStats.mercredi.cumulativeStats.girlsPercent}%` }} />
                  <div className="bg-blue-600 h-full" style={{ width: `${slotStats.mercredi.cumulativeStats.boysPercent}%` }} />
                </div>
              </div>

              <div className="flex items-center justify-between text-[10px] font-semibold text-slate-500 pt-0.5">
                <span className="text-emerald-700">2nde: {slotStats.mercredi.cumulativeStats.level2ndePercent}%</span>
                <span className="text-amber-700">1ère: {slotStats.mercredi.cumulativeStats.level1erePercent}%</span>
                <span className="text-purple-700">Tale: {slotStats.mercredi.cumulativeStats.levelTerminalePercent}%</span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-2 flex items-center justify-between text-xs font-bold text-emerald-700 group-hover:text-emerald-900">
            <span>Détail filles/garçons & niveaux</span>
            <ChevronRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
          </div>
        </div>
      </div>

      {/* Mini résumé comparatif */}
      <div className="bg-gradient-to-r from-slate-50 via-indigo-50/30 to-purple-50/30 border border-slate-200/80 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 text-xs">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-600 text-white rounded-xl shadow-2xs">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <p className="font-extrabold text-slate-800">
              Synthèse de l'assiduité sur les séances passées
            </p>
            <p className="text-slate-500 mt-0.5">
              Soirée passée la plus fréquentée : <span className="font-bold text-slate-900">{slotStats.mardiSoir.averageAttendance >= slotStats.jeudiSoir.averageAttendance ? 'Mardi soir' : 'Jeudi soir'}</span> ({Math.max(slotStats.mardiSoir.averageAttendance, slotStats.jeudiSoir.averageAttendance)} élèves/séance) • Mixité du soir : <span className="font-bold text-rose-600">♀ {slotStats.soirGlobal.cumulativeStats.girlsPercent}%</span> / <span className="font-bold text-blue-600">♂ {slotStats.soirGlobal.cumulativeStats.boysPercent}%</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-500 font-medium">
            Cliquez sur un créneau pour voir le détail de mixité, niveaux et la liste nominative
          </span>
        </div>
      </div>

      {/* Modal interactif lorsqu'on clique sur une case */}
      {selectedSlot && (
        <AttendanceDetailModal
          data={selectedSlot}
          students={students}
          onClose={() => setSelectedSlot(null)}
        />
      )}
    </div>
  );
};

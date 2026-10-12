import React, { useState, useMemo } from 'react';
import { Session, Student } from '../types';
import { normalizeGender } from '../lib/utils';
import { 
  X, Users, Calendar, Moon, Sun, Clock, CheckCircle2, 
  TrendingUp, Award, Search, Filter, ArrowUpRight, BarChart3, ChevronDown, ChevronUp
} from 'lucide-react';

export interface DemographicBreakdown {
  total: number;
  girls: number;
  boys: number;
  unassignedGender: number;
  girlsPercent: number;
  boysPercent: number;
  level2nde: number;
  level1ere: number;
  levelTerminale: number;
  levelAutre: number;
  level2ndePercent: number;
  level1erePercent: number;
  levelTerminalePercent: number;
  levelAutrePercent: number;
}

export interface SlotAnalysisData {
  slotKey: 'soir_global' | 'mardi_soir' | 'jeudi_soir' | 'mercredi';
  title: string;
  badgeLabel: string;
  description: string;
  accentColor: 'indigo' | 'amber' | 'emerald' | 'purple';
  sessions: Session[];
  averageAttendance: number;
  averageEnrolled: number;
  totalAttendances: number;
  totalEnrolled: number;
  uniqueStudentsCount: number;
  sessionsWithRollCall: number;
  cumulativeStats: DemographicBreakdown;
  uniqueStats: DemographicBreakdown;
}

interface Props {
  data: SlotAnalysisData;
  students: Student[];
  onClose: () => void;
}

export const AttendanceDetailModal: React.FC<Props> = ({ data, students, onClose }) => {
  const [calculationBasis, setCalculationBasis] = useState<'cumulative' | 'unique'>('cumulative');
  const [showSessionList, setShowSessionList] = useState(false);
  const [showRoster, setShowRoster] = useState(false);
  const [searchStudent, setSearchStudent] = useState('');
  const [filterGender, setFilterGender] = useState<'ALL' | 'F' | 'M'>('ALL');
  const [filterLevel, setFilterLevel] = useState<'ALL' | '2nde' | '1ère' | 'Terminale'>('ALL');

  const studentMap = useMemo(() => {
    const map = new Map<string, Student>();
    students.forEach(s => map.set(s.id, s));
    return map;
  }, [students]);

  const activeStats = calculationBasis === 'cumulative' ? data.cumulativeStats : data.uniqueStats;

  // Élèves du créneau avec compteur de participations
  const studentRoster = useMemo(() => {
    const attendanceMap = new Map<string, number>();
    
    data.sessions.forEach(sess => {
      const attendees = (sess.presentStudentIds && sess.presentStudentIds.length > 0)
        ? sess.presentStudentIds
        : (sess.enrolledStudentIds || []);
      
      attendees.forEach(id => {
        attendanceMap.set(id, (attendanceMap.get(id) || 0) + 1);
      });
    });

    const list: Array<{
      student: Student;
      count: number;
      gender: string;
      level: string;
    }> = [];

    attendanceMap.forEach((count, id) => {
      const st = studentMap.get(id);
      if (st) {
        const g = normalizeGender(st.gender);
        const c = (st.classGroup || '').toUpperCase();
        let lvl = 'Autre';
        if (c.includes('2') || c.includes('SECONDE')) lvl = '2nde';
        else if (c.includes('1') || c.includes('PREMIERE')) lvl = '1ère';
        else if (c.includes('T') || c.includes('TERM')) lvl = 'Terminale';
        
        list.push({ student: st, count, gender: g, level: lvl });
      }
    });

    // Tri par nombre de participations décroissant, puis nom
    list.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return (a.student.lastName || '').localeCompare(b.student.lastName || '');
    });

    return list;
  }, [data.sessions, studentMap]);

  // Filtrage liste élèves
  const filteredRoster = useMemo(() => {
    return studentRoster.filter(item => {
      const q = searchStudent.toLowerCase().trim();
      if (q) {
        const full = `${item.student.lastName} ${item.student.firstName} ${item.student.classGroup}`.toLowerCase();
        if (!full.includes(q)) return false;
      }
      if (filterGender !== 'ALL' && item.gender !== filterGender) return false;
      if (filterLevel !== 'ALL' && item.level !== filterLevel) return false;
      return true;
    });
  }, [studentRoster, searchStudent, filterGender, filterLevel]);

  // Accent styling
  const colorStyles = {
    indigo: {
      bgLight: 'bg-indigo-50/70',
      border: 'border-indigo-200',
      text: 'text-indigo-700',
      badge: 'bg-indigo-100 text-indigo-800 border-indigo-200',
      iconBg: 'bg-indigo-600 text-white',
      accentBar: 'bg-indigo-600',
    },
    amber: {
      bgLight: 'bg-amber-50/70',
      border: 'border-amber-200',
      text: 'text-amber-700',
      badge: 'bg-amber-100 text-amber-800 border-amber-200',
      iconBg: 'bg-amber-600 text-white',
      accentBar: 'bg-amber-600',
    },
    emerald: {
      bgLight: 'bg-emerald-50/70',
      border: 'border-emerald-200',
      text: 'text-emerald-700',
      badge: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      iconBg: 'bg-emerald-600 text-white',
      accentBar: 'bg-emerald-600',
    },
    purple: {
      bgLight: 'bg-purple-50/70',
      border: 'border-purple-200',
      text: 'text-purple-700',
      badge: 'bg-purple-100 text-purple-800 border-purple-200',
      iconBg: 'bg-purple-600 text-white',
      accentBar: 'bg-purple-600',
    }
  }[data.accentColor];

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="bg-white w-full max-w-4xl max-h-[92vh] rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className={`p-6 border-b border-slate-200/80 ${colorStyles.bgLight} flex items-start justify-between gap-4 relative`}>
          <div className="flex items-start gap-4">
            <div className={`p-3.5 rounded-2xl shadow-sm ${colorStyles.iconBg}`}>
              {data.slotKey === 'mercredi' ? (
                <Calendar className="w-6 h-6" />
              ) : data.slotKey === 'soir_global' ? (
                <Moon className="w-6 h-6" />
              ) : (
                <Clock className="w-6 h-6" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  {data.title}
                </h2>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${colorStyles.badge}`}>
                  {data.badgeLabel}
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-white text-slate-600 border border-slate-200 shadow-2xs">
                  {data.sessions.length} séance{data.sessions.length > 1 ? 's' : ''} passée{data.sessions.length > 1 ? 's' : ''}
                </span>
              </div>
              <p className="text-sm text-slate-600 mt-1 max-w-xl">
                {data.description}
              </p>
            </div>
          </div>

          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-white/80 rounded-xl transition-colors border border-transparent hover:border-slate-200"
            title="Fermer la fenêtre (Échap)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Top Key Numbers */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-200/70">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Fréquentation moy.</p>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl sm:text-3xl font-black text-slate-900">{data.averageAttendance}</span>
                <span className="text-xs font-semibold text-slate-500">élèves / séance</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                {data.averageEnrolled > 0 ? `(${data.averageEnrolled} inscrits en moy.)` : 'Basé sur les présences'}
              </p>
            </div>

            <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-200/70">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total des présences</p>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl sm:text-3xl font-black text-indigo-600">{data.totalAttendances}</span>
                <span className="text-xs font-semibold text-slate-500">venues cumulées</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Sur {data.sessions.length} séance{data.sessions.length > 1 ? 's' : ''} passée{data.sessions.length > 1 ? 's' : ''}
              </p>
            </div>

            <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-200/70">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Élèves distincts</p>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl sm:text-3xl font-black text-emerald-600">{data.uniqueStudentsCount}</span>
                <span className="text-xs font-semibold text-slate-500">élèves uniques</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Ayant participé au moins 1 fois
              </p>
            </div>

            <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-200/70">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Taux d'assiduité</p>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl sm:text-3xl font-black text-amber-600">
                  {data.totalEnrolled > 0 ? Math.round((data.totalAttendances / data.totalEnrolled) * 100) : 100}%
                </span>
                <span className="text-xs font-semibold text-slate-500">présents/inscrits</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                {data.sessionsWithRollCall} appel{data.sessionsWithRollCall > 1 ? 's' : ''} pointé{data.sessionsWithRollCall > 1 ? 's' : ''}
              </p>
            </div>
          </div>

          {/* Basis Toggle: Cumul vs Distincts */}
          <div className="flex items-center justify-between flex-wrap gap-3 bg-slate-100/70 p-2 rounded-2xl border border-slate-200/60">
            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider px-2">
              Mode de calcul des répartitions :
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCalculationBasis('cumulative')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  calculationBasis === 'cumulative'
                    ? 'bg-white text-indigo-700 shadow-xs border border-slate-200'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                Cumul des participations (moyenne par séance)
              </button>
              <button
                type="button"
                onClick={() => setCalculationBasis('unique')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  calculationBasis === 'unique'
                    ? 'bg-white text-indigo-700 shadow-xs border border-slate-200'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                Élèves uniques distincts ({data.uniqueStudentsCount})
              </button>
            </div>
          </div>

          {/* Main 2 Columns: Gender Mixity & Class Levels */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* 1. RÉPARTITION FILLE / GARÇON */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                  Répartition Fille / Garçon
                </h3>
                <span className="text-xs font-bold px-2 py-0.5 bg-slate-100 text-slate-700 rounded-lg">
                  Total : {activeStats.total}
                </span>
              </div>

              {/* Progress bar */}
              <div>
                <div className="flex justify-between text-xs font-bold mb-2">
                  <span className="text-rose-600 flex items-center gap-1">
                    ♀ Filles : {activeStats.girls} ({activeStats.girlsPercent}%)
                  </span>
                  <span className="text-blue-600 flex items-center gap-1">
                    ♂ Garçons : {activeStats.boys} ({activeStats.boysPercent}%)
                  </span>
                </div>
                <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden flex shadow-inner">
                  <div 
                    className="bg-rose-500 h-full transition-all duration-500"
                    style={{ width: `${activeStats.girlsPercent}%` }}
                    title={`Filles : ${activeStats.girls} (${activeStats.girlsPercent}%)`}
                  />
                  <div 
                    className="bg-blue-600 h-full transition-all duration-500"
                    style={{ width: `${activeStats.boysPercent}%` }}
                    title={`Garçons : ${activeStats.boys} (${activeStats.boysPercent}%)`}
                  />
                </div>
              </div>

              {/* Detail cards */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="p-3.5 bg-rose-50/60 rounded-xl border border-rose-100">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-rose-700">Filles</p>
                    <span className="text-xs font-extrabold px-1.5 py-0.5 bg-rose-100 text-rose-800 rounded">
                      {activeStats.girlsPercent}%
                    </span>
                  </div>
                  <p className="text-2xl font-black text-rose-900 mt-1">
                    {activeStats.girls}
                  </p>
                  <p className="text-[11px] text-rose-600/80 mt-0.5">
                    {data.sessions.length > 0 ? `~${(activeStats.girls / data.sessions.length).toFixed(1)} filles / séance` : ''}
                  </p>
                </div>

                <div className="p-3.5 bg-blue-50/60 rounded-xl border border-blue-100">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-blue-700">Garçons</p>
                    <span className="text-xs font-extrabold px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded">
                      {activeStats.boysPercent}%
                    </span>
                  </div>
                  <p className="text-2xl font-black text-blue-900 mt-1">
                    {activeStats.boys}
                  </p>
                  <p className="text-[11px] text-blue-600/80 mt-0.5">
                    {data.sessions.length > 0 ? `~${(activeStats.boys / data.sessions.length).toFixed(1)} garçons / séance` : ''}
                  </p>
                </div>
              </div>

              {activeStats.unassignedGender > 0 && (
                <p className="text-xs text-amber-700 bg-amber-50 p-2 rounded-lg border border-amber-200">
                  Genre non renseigné pour {activeStats.unassignedGender} élève{activeStats.unassignedGender > 1 ? 's' : ''}.
                </p>
              )}
            </div>

            {/* 2. RÉPARTITION PAR NIVEAU (2NDES, 1ÈRE, TALE) */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  Répartition 2ndes, 1ère et Tale
                </h3>
                <span className="text-xs font-bold px-2 py-0.5 bg-slate-100 text-slate-700 rounded-lg">
                  Total : {activeStats.total}
                </span>
              </div>

              {/* Stacked level bar */}
              <div>
                <div className="flex justify-between text-xs font-bold mb-2 text-slate-700">
                  <span className="text-emerald-700">2ndes : {activeStats.level2ndePercent}%</span>
                  <span className="text-amber-700">1ère : {activeStats.level1erePercent}%</span>
                  <span className="text-purple-700">Tale : {activeStats.levelTerminalePercent}%</span>
                </div>
                <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden flex shadow-inner">
                  <div 
                    className="bg-emerald-500 h-full transition-all duration-500"
                    style={{ width: `${activeStats.level2ndePercent}%` }}
                    title={`2ndes : ${activeStats.level2nde} (${activeStats.level2ndePercent}%)`}
                  />
                  <div 
                    className="bg-amber-500 h-full transition-all duration-500"
                    style={{ width: `${activeStats.level1erePercent}%` }}
                    title={`1ère : ${activeStats.level1ere} (${activeStats.level1erePercent}%)`}
                  />
                  <div 
                    className="bg-purple-600 h-full transition-all duration-500"
                    style={{ width: `${activeStats.levelTerminalePercent}%` }}
                    title={`Tale : ${activeStats.levelTerminale} (${activeStats.levelTerminalePercent}%)`}
                  />
                  {activeStats.levelAutrePercent > 0 && (
                    <div 
                      className="bg-slate-400 h-full transition-all duration-500"
                      style={{ width: `${activeStats.levelAutrePercent}%` }}
                      title={`Autre : ${activeStats.levelAutre} (${activeStats.levelAutrePercent}%)`}
                    />
                  )}
                </div>
              </div>

              {/* Grid cards for 2ndes, 1ère, Tale */}
              <div className="grid grid-cols-3 gap-2.5 pt-1">
                <div className="p-3 bg-emerald-50/70 rounded-xl border border-emerald-100 text-center">
                  <span className="text-[11px] font-extrabold text-emerald-800 uppercase">2ndes</span>
                  <p className="text-xl font-black text-emerald-950 mt-1">
                    {activeStats.level2nde}
                  </p>
                  <p className="text-[11px] font-bold text-emerald-700 mt-0.5">
                    {activeStats.level2ndePercent}%
                  </p>
                  <p className="text-[10px] text-emerald-600/70 mt-0.5">
                    {data.sessions.length > 0 ? `~${(activeStats.level2nde / data.sessions.length).toFixed(1)}/s` : ''}
                  </p>
                </div>

                <div className="p-3 bg-amber-50/70 rounded-xl border border-amber-100 text-center">
                  <span className="text-[11px] font-extrabold text-amber-800 uppercase">1ères</span>
                  <p className="text-xl font-black text-amber-950 mt-1">
                    {activeStats.level1ere}
                  </p>
                  <p className="text-[11px] font-bold text-amber-700 mt-0.5">
                    {activeStats.level1erePercent}%
                  </p>
                  <p className="text-[10px] text-amber-600/70 mt-0.5">
                    {data.sessions.length > 0 ? `~${(activeStats.level1ere / data.sessions.length).toFixed(1)}/s` : ''}
                  </p>
                </div>

                <div className="p-3 bg-purple-50/70 rounded-xl border border-purple-100 text-center">
                  <span className="text-[11px] font-extrabold text-purple-800 uppercase">Tales</span>
                  <p className="text-xl font-black text-purple-950 mt-1">
                    {activeStats.levelTerminale}
                  </p>
                  <p className="text-[11px] font-bold text-purple-700 mt-0.5">
                    {activeStats.levelTerminalePercent}%
                  </p>
                  <p className="text-[10px] text-purple-600/70 mt-0.5">
                    {data.sessions.length > 0 ? `~${(activeStats.levelTerminale / data.sessions.length).toFixed(1)}/s` : ''}
                  </p>
                </div>
              </div>

              {activeStats.levelAutre > 0 && (
                <p className="text-xs text-slate-500 bg-slate-50 p-2 rounded-lg border border-slate-200">
                  Autres niveaux (BTS, CAP, etc.) : {activeStats.levelAutre} ({activeStats.levelAutrePercent}%)
                </p>
              )}
            </div>
          </div>

          {/* Section: Séance par séance (collapsible) */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
            <button
              type="button"
              onClick={() => setShowSessionList(!showSessionList)}
              className="w-full p-4 bg-slate-50 hover:bg-slate-100/80 transition-colors flex items-center justify-between text-left"
            >
              <div className="flex items-center gap-2.5">
                <Calendar className="w-4 h-4 text-slate-600" />
                <span className="text-sm font-bold text-slate-800">
                  Historique détaillé des {data.sessions.length} séances passées de ce créneau
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-semibold">
                  {showSessionList ? 'Masquer' : 'Afficher le détail'}
                </span>
                {showSessionList ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
              </div>
            </button>

            {showSessionList && (
              <div className="p-4 space-y-2.5 max-h-72 overflow-y-auto divide-y divide-slate-100">
                {data.sessions.length === 0 ? (
                  <p className="text-sm text-slate-400 py-4 text-center">Aucune séance passée enregistrée pour ce créneau.</p>
                ) : (
                  data.sessions.map((sess) => {
                    const attendees = (sess.presentStudentIds && sess.presentStudentIds.length > 0)
                      ? sess.presentStudentIds
                      : (sess.enrolledStudentIds || []);
                    const hasRollCall = (sess.presentStudentIds && sess.presentStudentIds.length > 0);
                    
                    let girlsCount = 0;
                    let boysCount = 0;
                    let count2nde = 0;
                    let count1ere = 0;
                    let countTale = 0;

                    attendees.forEach(id => {
                      const st = studentMap.get(id);
                      if (st) {
                        const g = normalizeGender(st.gender);
                        if (g === 'F') girlsCount++;
                        else if (g === 'M') boysCount++;

                        const c = (st.classGroup || '').toUpperCase();
                        if (c.includes('2') || c.includes('SECONDE')) count2nde++;
                        else if (c.includes('1') || c.includes('PREMIERE')) count1ere++;
                        else if (c.includes('T') || c.includes('TERM')) countTale++;
                      }
                    });

                    return (
                      <div key={sess.id} className="pt-2.5 first:pt-0 flex items-center justify-between flex-wrap gap-2 text-xs">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900">
                              {sess.date} {sess.time ? `• ${sess.time}` : ''}
                            </span>
                            <span className="text-slate-600 font-medium">
                              {sess.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 text-slate-500">
                            <span>{attendees.length} participant{attendees.length > 1 ? 's' : ''} ({sess.enrolledStudentIds?.length || 0} inscrits)</span>
                            {hasRollCall ? (
                              <span className="inline-flex items-center text-emerald-600 font-semibold">
                                <CheckCircle2 className="w-3 h-3 mr-0.5" /> Appel pointé
                              </span>
                            ) : (
                              <span className="text-amber-600">Inscrits (appel non pointé)</span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 font-bold border border-rose-100">
                            ♀ {girlsCount}
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-bold border border-blue-100">
                            ♂ {boysCount}
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-bold border border-emerald-100">
                            2nde: {count2nde}
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 font-bold border border-amber-100">
                            1ère: {count1ere}
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 font-bold border border-purple-100">
                            Tale: {countTale}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* Section: Liste nominative des élèves assidus (collapsible) */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
            <button
              type="button"
              onClick={() => setShowRoster(!showRoster)}
              className="w-full p-4 bg-slate-50 hover:bg-slate-100/80 transition-colors flex items-center justify-between text-left"
            >
              <div className="flex items-center gap-2.5">
                <Users className="w-4 h-4 text-slate-600" />
                <span className="text-sm font-bold text-slate-800">
                  Liste des {studentRoster.length} élèves ayant fréquenté ce créneau
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-semibold">
                  {showRoster ? 'Masquer' : 'Afficher la liste nominative'}
                </span>
                {showRoster ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
              </div>
            </button>

            {showRoster && (
              <div className="p-4 space-y-3">
                {/* Search & filters */}
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input 
                      type="text" 
                      placeholder="Rechercher par nom, prénom ou classe..." 
                      value={searchStudent}
                      onChange={e => setSearchStudent(e.target.value)}
                      className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>

                  <select 
                    value={filterGender}
                    onChange={e => setFilterGender(e.target.value as any)}
                    className="text-xs py-1.5 px-3 bg-white border border-slate-200 rounded-xl focus:outline-none"
                  >
                    <option value="ALL">Tous genres</option>
                    <option value="F">Filles uniquement</option>
                    <option value="M">Garçons uniquement</option>
                  </select>

                  <select 
                    value={filterLevel}
                    onChange={e => setFilterLevel(e.target.value as any)}
                    className="text-xs py-1.5 px-3 bg-white border border-slate-200 rounded-xl focus:outline-none"
                  >
                    <option value="ALL">Tous niveaux</option>
                    <option value="2nde">2ndes</option>
                    <option value="1ère">1ères</option>
                    <option value="Terminale">Terminales</option>
                  </select>
                </div>

                {/* Table */}
                <div className="max-h-60 overflow-y-auto border border-slate-100 rounded-xl">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 sticky top-0">
                      <tr>
                        <th className="py-2 px-3">Élève</th>
                        <th className="py-2 px-3">Classe</th>
                        <th className="py-2 px-3">Genre</th>
                        <th className="py-2 px-3">Niveau</th>
                        <th className="py-2 px-3 text-right">Participations</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredRoster.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-4 text-center text-slate-400">
                            Aucun élève trouvé.
                          </td>
                        </tr>
                      ) : (
                        filteredRoster.map(item => (
                          <tr key={item.student.id} className="hover:bg-slate-50/70">
                            <td className="py-2 px-3 font-semibold text-slate-900">
                              {item.student.lastName} {item.student.firstName}
                            </td>
                            <td className="py-2 px-3 text-slate-600">
                              {item.student.classGroup || '—'}
                            </td>
                            <td className="py-2 px-3">
                              {item.gender === 'F' ? (
                                <span className="text-rose-600 font-bold">♀ Fille</span>
                              ) : item.gender === 'M' ? (
                                <span className="text-blue-600 font-bold">♂ Garçon</span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            <td className="py-2 px-3">
                              <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                                item.level === '2nde' ? 'bg-emerald-50 text-emerald-700' :
                                item.level === '1ère' ? 'bg-amber-50 text-amber-700' :
                                item.level === 'Terminale' ? 'bg-purple-50 text-purple-700' :
                                'bg-slate-50 text-slate-600'
                              }`}>
                                {item.level}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-right font-black text-indigo-700">
                              {item.count} séance{item.count > 1 ? 's' : ''}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <p className="text-xs text-slate-500">
            Calculé sur {data.sessions.length} séance{data.sessions.length > 1 ? 's' : ''} passée{data.sessions.length > 1 ? 's' : ''} ({data.totalAttendances} présences enregistrées).
          </p>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors shadow-xs"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};

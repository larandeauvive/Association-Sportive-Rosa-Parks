import React, { useState, useEffect, useMemo } from 'react';
import { Convocation, Session, Student } from '../types';
import { Activity, Users, Trophy, TrendingUp, Percent, UserCheck, PieChart, Settings, Shirt, CreditCard, ChevronRight, Search, School, Sparkles } from 'lucide-react';
import { getConvocationsList, getSessionsList } from '../lib/db';
import { normalizeGender } from '../lib/utils';
import { AttendanceStatsSection } from './AttendanceStatsSection';
import { TshirtStatsModal } from './TshirtStatsModal';
import { CheckSearchModal } from './CheckSearchModal';
import { SchoolDemographicsModal, SchoolDemographicsData } from './SchoolDemographicsModal';

interface Props {
  students: Student[];
  activeYear: string;
  onNewConvocation: () => void;
  onOpenStudentSheet?: (student: Student) => void;
  onOpenCheckSearch?: () => void;
}

export function getStudentLevel(classGroup?: string): string {
  const c = (classGroup || '').toUpperCase().trim();
  if (!c || c === 'AUCUNE') return 'Autre';
  if (c.includes('BTS')) return 'BTS / Sup';
  if (c.includes('CAP')) return 'CAP';
  if (c.includes('DEAS')) return 'DEAS';
  if (c.includes('2') || c.includes('SECONDE')) return '2nde';
  if (c.includes('1') || c.includes('PREMIERE')) return '1ère';
  if (c.startsWith('T') || c.includes('TERM')) return 'Terminale';
  return c;
}

export const Dashboard: React.FC<Props> = ({ 
  students, 
  activeYear, 
  onNewConvocation,
  onOpenStudentSheet,
  onOpenCheckSearch 
}) => {
  const isAdmin = true;
  const [convocations, setConvocations] = useState<Convocation[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  // Configuration des effectifs réels du lycée (effectif total, filles, garçons, et par niveau)
  const [demographics, setDemographics] = useState<SchoolDemographicsData>(() => {
    try {
      const saved = localStorage.getItem(`as_school_demographics_${activeYear}`) || localStorage.getItem('as_school_demographics');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // fallback
    }
    const legacyTotal = parseInt(localStorage.getItem('as_school_total') || '500', 10);
    const validTotal = !isNaN(legacyTotal) && legacyTotal > 0 ? legacyTotal : 500;
    return {
      schoolTotal: validTotal,
      girlsTotal: Math.round(validTotal / 2),
      boysTotal: Math.round(validTotal / 2),
      levelTotals: {}
    };
  });

  const [isDemographicsModalOpen, setIsDemographicsModalOpen] = useState(false);
  const [isTshirtModalOpen, setIsTshirtModalOpen] = useState(false);
  const [isCheckSearchModalOpen, setIsCheckSearchModalOpen] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [convos, sess] = await Promise.all([
          getConvocationsList(activeYear),
          getSessionsList(activeYear)
        ]);
        setConvocations(convos);
        setSessions(sess);
      } catch (err) {
        console.error("Erreur Dashboard:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [activeYear]);

  // Filtrer les élèves de l'année active
  const yearStudents = useMemo(() => {
    return students.filter(s => !s.schoolYear || s.schoolYear === activeYear);
  }, [students, activeYear]);

  // Élèves licenciés (avec un numéro de licence renseigné)
  const licensedStudentsList = useMemo(() => {
    return yearStudents.filter(s => !!(s.licenseNumber && s.licenseNumber.trim() !== ''));
  }, [yearStudents]);

  // Calcul automatique des effectifs réels présents dans la base élèves importée pour l'année
  const dbTotals = useMemo(() => {
    let girls = 0;
    let boys = 0;
    const levels: Record<string, number> = {};

    yearStudents.forEach(s => {
      const g = normalizeGender(s.gender);
      if (g === 'F') girls++;
      else if (g === 'M') boys++;

      const lvl = getStudentLevel(s.classGroup);
      levels[lvl] = (levels[lvl] || 0) + 1;
    });

    return {
      total: yearStudents.length,
      girls,
      boys,
      levels
    };
  }, [yearStudents]);

  // Élèves ayant demandé / commandé un T-shirt
  const tshirtStudents = useMemo(() => {
    return yearStudents.filter(s => {
      const t = String(s.tshirt || '').trim().toUpperCase();
      const hasSize = !!(s.size && s.size.trim() !== '');
      return t === 'OUI' || t === 'YES' || hasSize;
    });
  }, [yearStudents]);

  // Répartition détaillée des T-shirts par taille
  const sizeDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    tshirtStudents.forEach(s => {
      let rawSize = (s.size || '').trim();
      const sz = rawSize ? rawSize.toUpperCase() : 'NON PRÉCISÉE';
      counts[sz] = (counts[sz] || 0) + 1;
    });

    const order = ['10 ANS', '12 ANS', '14 ANS', '16 ANS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', 'NON PRÉCISÉE'];
    const sorted = Object.keys(counts).sort((a, b) => {
      const idxA = order.indexOf(a);
      const idxB = order.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });

    return sorted.map(size => ({
      size,
      count: counts[size],
      percentage: tshirtStudents.length > 0 ? Math.round((counts[size] / tshirtStudents.length) * 100) : 0
    }));
  }, [tshirtStudents]);

  // Chèques enregistrés cette année
  const studentsWithChecks = useMemo(() => {
    return yearStudents.filter(s => !!(s.checkNumber && s.checkNumber.trim() !== ''));
  }, [yearStudents]);

  if (loading) {
    return <div className="text-center py-20 text-slate-500 font-medium">Chargement des statistiques...</div>;
  }

  // Effectifs de référence du lycée (configurés ou déduits de la base importée)
  const effectiveSchoolTotal = (demographics.schoolTotal && demographics.schoolTotal > 0)
    ? demographics.schoolTotal
    : (dbTotals.total > 0 ? dbTotals.total : 500);

  const effectiveSchoolGirls = (demographics.girlsTotal && demographics.girlsTotal > 0)
    ? demographics.girlsTotal
    : (dbTotals.girls > 0 ? dbTotals.girls : Math.round(effectiveSchoolTotal / 2));

  const effectiveSchoolBoys = (demographics.boysTotal && demographics.boysTotal > 0)
    ? demographics.boysTotal
    : (dbTotals.boys > 0 ? dbTotals.boys : Math.max(1, effectiveSchoolTotal - effectiveSchoolGirls));

  const handleSaveDemographics = (data: SchoolDemographicsData) => {
    setDemographics(data);
    localStorage.setItem(`as_school_demographics_${activeYear}`, JSON.stringify(data));
    localStorage.setItem('as_school_demographics', JSON.stringify(data));
    localStorage.setItem('as_school_total', data.schoolTotal.toString());
  };

  // Statistiques Générales
  const totalStudents = yearStudents.length;
  const licensedStudents = licensedStudentsList.length;
  const paidStudents = yearStudents.filter(s => s.paid === 'OUI' || s.freeLicense).length;
  const freeLicenseStudents = yearStudents.filter(s => !!s.freeLicense).length;
  
  // Taux de pénétration global (% d'élèves du lycée licenciés à l'AS)
  const penetrationRate = effectiveSchoolTotal > 0 ? ((licensedStudents / effectiveSchoolTotal) * 100).toFixed(1) : '0';

  // Licenciés par sexe
  const femaleLicensedStudents = licensedStudentsList.filter(s => normalizeGender(s.gender) === 'F').length;
  const maleLicensedStudents = licensedStudentsList.filter(s => normalizeGender(s.gender) === 'M').length;
  const specifiedGenderLicensedTotal = femaleLicensedStudents + maleLicensedStudents;
  const unassignedGenderLicensed = licensedStudents - specifiedGenderLicensedTotal;

  // Taux de pénétration par rapport au nombre total d'élèves du même sexe dans le lycée :
  // % Filles = (Nombre de filles licenciées / Total filles du lycée) * 100
  const femaleRate = effectiveSchoolGirls > 0 
    ? ((femaleLicensedStudents / effectiveSchoolGirls) * 100).toFixed(1) 
    : '0';

  // % Garçons = (Nombre de garçons licenciés / Total garçons du lycée) * 100
  const maleRate = effectiveSchoolBoys > 0 
    ? ((maleLicensedStudents / effectiveSchoolBoys) * 100).toFixed(1) 
    : '0';

  // Part respective au sein des licenciés de l'AS (pour la jauge interne)
  const licensedGenderBase = specifiedGenderLicensedTotal > 0 ? specifiedGenderLicensedTotal : licensedStudents;
  const femaleAsShare = licensedGenderBase > 0 ? Math.round((femaleLicensedStudents / licensedGenderBase) * 100) : 0;
  const maleAsShare = licensedGenderBase > 0 ? 100 - femaleAsShare : 0;

  // Licenciés par niveau scolaire
  const licensedLevelCounts: Record<string, number> = {};
  licensedStudentsList.forEach(s => {
    const lvl = getStudentLevel(s.classGroup);
    licensedLevelCounts[lvl] = (licensedLevelCounts[lvl] || 0) + 1;
  });

  // Total inscrits AS par niveau
  const asLevelCounts: Record<string, number> = {};
  yearStudents.forEach(s => {
    const lvl = getStudentLevel(s.classGroup);
    asLevelCounts[lvl] = (asLevelCounts[lvl] || 0) + 1;
  });

  // Niveaux scolaires à présenter
  const standardLevels = ['2nde', '1ère', 'Terminale', 'BTS / Sup', 'CAP', 'DEAS'];
  const availableLevels = Array.from(new Set([
    ...standardLevels,
    ...Object.keys(dbTotals.levels),
    ...Object.keys(licensedLevelCounts),
    ...Object.keys(demographics.levelTotals || {})
  ])).filter(lvl => {
    const schoolCount = (demographics.levelTotals?.[lvl] !== undefined)
      ? demographics.levelTotals[lvl]
      : (dbTotals.levels[lvl] || 0);
    const licCount = licensedLevelCounts[lvl] || 0;
    return ['2nde', '1ère', 'Terminale'].includes(lvl) || schoolCount > 0 || licCount > 0;
  });

  availableLevels.sort((a, b) => {
    const order = ['2nde', '1ère', 'Terminale', 'BTS / Sup', 'CAP', 'DEAS', 'Autre'];
    const idxA = order.indexOf(a);
    const idxB = order.indexOf(b);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.localeCompare(b);
  });

  return (
    <div className="space-y-6">
      {/* Top Banner & Quick Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-4">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Inscrits AS</p>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900">{totalStudents}</span>
              <span className="text-xs font-semibold text-emerald-600">
                ({paidStudents} cotisations{freeLicenseStudents > 0 ? ` dont ${freeLicenseStudents} gratuite${freeLicenseStudents > 1 ? 's' : ''}` : ''})
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-4">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <UserCheck className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Licenciés UNSS</p>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900">{licensedStudents}</span>
              <span className="text-xs font-semibold text-slate-500">
                sur {totalStudents} ({totalStudents > 0 ? Math.round((licensedStudents/totalStudents)*100) : 0}%)
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
              <Percent className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Taux pénétration</p>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-black text-slate-900">{penetrationRate}%</span>
                <span className="text-xs text-slate-500">({licensedStudents}/{effectiveSchoolTotal} lycéens)</span>
              </div>
            </div>
          </div>
          {isAdmin && (
            <button 
              type="button"
              onClick={() => setIsDemographicsModalOpen(true)}
              className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 transition cursor-pointer"
              title="Configurer les effectifs de référence du lycée (filles, garçons, niveaux)"
            >
              <Settings className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-purple-50 text-purple-600 rounded-xl">
              <Trophy className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Compétitions</p>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-900">{convocations.length}</span>
                <span className="text-xs font-semibold text-slate-500">({sessions.length} séances)</span>
              </div>
            </div>
          </div>
          {isAdmin && (
            <button
              onClick={onNewConvocation}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-colors shadow-xs"
            >
              + Convoc
            </button>
          )}
        </div>
      </div>

      {/* Statistiques de fréquentation des créneaux AS (Soir global, Mardi soir, Jeudi soir, Mercredi) */}
      <AttendanceStatsSection
        sessions={sessions}
        students={yearStudents}
        activeYear={activeYear}
      />

      {/* Deux Colonnes : Genre / Mixité & Niveaux */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Mixité Filles / Garçons (Taux par rapport au total du même sexe dans le lycée) */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <PieChart className="w-4 h-4 text-indigo-600" /> Mixité des Licenciés
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Pourcentage calculé par rapport à l'effectif total du même sexe dans le lycée
              </p>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsDemographicsModalOpen(true)}
                className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 transition cursor-pointer"
                title="Modifier les effectifs filles/garçons du lycée"
              >
                <Settings className="w-4 h-4" />
              </button>
              <span className="text-xs font-bold px-2.5 py-0.5 bg-indigo-50 text-indigo-700 rounded-full border border-indigo-100">
                {licensedStudents} licencié{licensedStudents > 1 ? 's' : ''}
              </span>
            </div>
          </div>

          {/* Cartes comparatives Filles / Garçons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* Filles */}
            <div className="p-4 bg-gradient-to-br from-rose-50/70 to-pink-50/40 rounded-xl border border-rose-200 shadow-2xs space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-rose-800">
                  Filles
                </span>
                <span className="text-xs font-black px-2 py-0.5 bg-rose-100 text-rose-900 rounded-md">
                  {femaleRate}% du lycée
                </span>
              </div>

              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-rose-950">
                  {femaleLicensedStudents}
                </span>
                <span className="text-xs font-semibold text-rose-700">
                  licenciée{femaleLicensedStudents > 1 ? 's' : ''} sur {effectiveSchoolGirls} filles
                </span>
              </div>

              {/* Jauge Filles par rapport au lycée */}
              <div className="w-full bg-rose-200/80 rounded-full h-2 overflow-hidden">
                <div 
                  className="bg-rose-500 h-full transition-all duration-500" 
                  style={{ width: `${Math.min(100, Math.max(0, parseFloat(femaleRate)))}%` }} 
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-rose-700/90 font-medium pt-0.5">
                <span>Pénétration : {femaleRate}%</span>
                <span>{femaleAsShare}% de l'AS</span>
              </div>
            </div>

            {/* Garçons */}
            <div className="p-4 bg-gradient-to-br from-blue-50/70 to-indigo-50/40 rounded-xl border border-blue-200 shadow-2xs space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-blue-800">
                  Garçons
                </span>
                <span className="text-xs font-black px-2 py-0.5 bg-blue-100 text-blue-900 rounded-md">
                  {maleRate}% du lycée
                </span>
              </div>

              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-blue-950">
                  {maleLicensedStudents}
                </span>
                <span className="text-xs font-semibold text-blue-700">
                  licencié{maleLicensedStudents > 1 ? 's' : ''} sur {effectiveSchoolBoys} garçons
                </span>
              </div>

              {/* Jauge Garçons par rapport au lycée */}
              <div className="w-full bg-blue-200/80 rounded-full h-2 overflow-hidden">
                <div 
                  className="bg-blue-600 h-full transition-all duration-500" 
                  style={{ width: `${Math.min(100, Math.max(0, parseFloat(maleRate)))}%` }} 
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-blue-700/90 font-medium pt-0.5">
                <span>Pénétration : {maleRate}%</span>
                <span>{maleAsShare}% de l'AS</span>
              </div>
            </div>

          </div>

          {/* Jauge de répartition interne Filles / Garçons au sein des licenciés */}
          <div className="pt-2 border-t border-slate-100 space-y-1.5">
            <div className="flex justify-between text-xs font-bold text-slate-600">
              <span className="text-rose-600">Proportion AS : {femaleAsShare}% F ({femaleLicensedStudents})</span>
              <span className="text-blue-600">Proportion AS : {maleAsShare}% G ({maleLicensedStudents})</span>
            </div>
            <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden flex">
              <div 
                className="bg-rose-500 h-full transition-all duration-500" 
                style={{ width: `${femaleAsShare}%` }} 
              />
              <div 
                className="bg-blue-600 h-full transition-all duration-500" 
                style={{ width: `${maleAsShare}%` }} 
              />
            </div>
          </div>

          {unassignedGenderLicensed > 0 && (
            <p className="text-[11px] text-amber-700 bg-amber-50 px-2.5 py-1.5 rounded-lg border border-amber-200">
              ⚠️ Genre non renseigné pour {unassignedGenderLicensed} élève{unassignedGenderLicensed > 1 ? 's' : ''} licencié{unassignedGenderLicensed > 1 ? 's' : ''}.
            </p>
          )}
        </div>

        {/* Répartition par Niveaux Scolaires (Taux en fonction du nombre d'élèves de chaque niveau au lycée) */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-600" /> Répartition par niveau scolaire
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Pourcentage calculé en fonction de l'effectif réel de chaque niveau dans le lycée
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsDemographicsModalOpen(true)}
              className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 transition cursor-pointer"
              title="Modifier les effectifs par niveau du lycée"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {availableLevels.map(lvl => {
              const licCount = licensedLevelCounts[lvl] || 0;
              const asCount = asLevelCounts[lvl] || 0;
              const schoolCount = (demographics.levelTotals?.[lvl] !== undefined && demographics.levelTotals[lvl] > 0)
                ? demographics.levelTotals[lvl]
                : (dbTotals.levels[lvl] || licCount || 0);

              const levelRate = schoolCount > 0 
                ? ((licCount / schoolCount) * 100).toFixed(1) 
                : '0';

              const asShare = licensedStudents > 0 
                ? Math.round((licCount / licensedStudents) * 100) 
                : 0;

              return (
                <div key={lvl} className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2 hover:border-indigo-300 transition-all">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-slate-900 uppercase">{lvl}</span>
                    <span className="text-xs font-black px-1.5 py-0.5 bg-emerald-100 text-emerald-900 rounded-md">
                      {levelRate}%
                    </span>
                  </div>

                  <div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-xl font-black text-slate-900">{licCount}</span>
                      <span className="text-[11px] font-semibold text-slate-500">
                        / {schoolCount} él.
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 font-medium">
                      du niveau au lycée
                    </p>
                  </div>

                  {/* Barre de pénétration du niveau */}
                  <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                    <div 
                      className="bg-emerald-500 h-full transition-all duration-500" 
                      style={{ width: `${Math.min(100, Math.max(0, parseFloat(levelRate)))}%` }} 
                    />
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-slate-500 font-medium pt-0.5 border-t border-slate-200/60">
                    <span>{asShare}% de l'AS</span>
                    {asCount > licCount && (
                      <span className="text-indigo-600 font-semibold" title={`${asCount} inscrits AS au total dont ${licCount} licenciés UNSS`}>
                        {asCount} inscrits
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
            <span>
              💡 Pourcentages calculés sur l'effectif de chaque niveau.
            </span>
            <button
              type="button"
              onClick={() => setIsDemographicsModalOpen(true)}
              className="font-bold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer"
            >
              Ajuster les effectifs ⚙️
            </button>
          </div>
        </div>

      </div>

      {/* SECTION T-SHIRTS ET DÉTAIL DES TAILLES */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl shadow-2xs">
              <Shirt className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-black text-slate-900">
                  T-shirts & Maillots AS
                </h3>
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200">
                  {tshirtStudents.length} t-shirt{tshirtStudents.length > 1 ? 's' : ''} demandé{tshirtStudents.length > 1 ? 's' : ''}
                </span>
                <span className="text-xs font-semibold text-slate-500">
                  ({totalStudents > 0 ? Math.round((tshirtStudents.length / totalStudents) * 100) : 0}% des élèves)
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Détail quantitatif par taille pour passer commande auprès du fournisseur et gérer la distribution
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsTshirtModalOpen(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer active:scale-95"
            >
              <span>📋 Voir le listing nominatif & tailles</span>
              <ChevronRight className="w-3.5 h-3.5 stroke-[2.5]" />
            </button>
          </div>
        </div>

        {/* Grille des tailles */}
        {sizeDistribution.length === 0 ? (
          <div className="p-8 text-center text-slate-400 italic bg-slate-50 rounded-xl border border-dashed border-slate-200">
            Aucun T-shirt ou taille renseignée pour les élèves inscrits en {activeYear}.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {sizeDistribution.map(item => (
              <button
                key={item.size}
                type="button"
                onClick={() => setIsTshirtModalOpen(true)}
                className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-indigo-50/70 hover:border-indigo-300 transition-all text-left group cursor-pointer shadow-2xs"
                title={`Cliquez pour voir les ${item.count} élève(s) en taille ${item.size}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black px-2 py-0.5 rounded bg-white text-slate-800 border border-slate-200 group-hover:border-indigo-300 group-hover:text-indigo-900">
                    {item.size}
                  </span>
                  <span className="text-xs font-bold text-slate-400 group-hover:text-indigo-600">
                    {item.percentage}%
                  </span>
                </div>
                <div className="mt-2.5 flex items-baseline gap-1">
                  <span className="text-2xl font-black text-slate-900 group-hover:text-indigo-950">
                    {item.count}
                  </span>
                  <span className="text-xs text-slate-500">pièce{item.count > 1 ? 's' : ''}</span>
                </div>
                <div className="mt-2 w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="h-full bg-indigo-600 transition-all"
                    style={{ width: `${item.percentage}%` }}
                  />
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Section Recherche par numéro de chèque */}
        <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-amber-50/60 p-4 rounded-xl border border-amber-200">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500 text-white rounded-lg shadow-2xs shrink-0">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider text-amber-950 flex items-center gap-1.5">
                <span>Recherche par Numéro de Chèque</span>
                <span className="px-2 py-0.5 bg-amber-200/80 text-amber-900 text-[10px] rounded-full font-bold">
                  {studentsWithChecks.length} chèque{studentsWithChecks.length > 1 ? 's' : ''}
                </span>
              </h4>
              <p className="text-xs text-amber-900/80 mt-0.5 font-medium">
                Retrouvez instantanément le titulaire d'un chèque de cotisation et accédez à sa fiche élève en 1 clic
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (onOpenCheckSearch) {
                onOpenCheckSearch();
              } else {
                setIsCheckSearchModalOpen(true);
              }
            }}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black shadow-xs transition cursor-pointer active:scale-95 shrink-0"
          >
            <Search className="w-4 h-4" />
            <span>Rechercher un chèque</span>
          </button>
        </div>
      </div>

      {/* Modales associées */}
      <SchoolDemographicsModal
        isOpen={isDemographicsModalOpen}
        onClose={() => setIsDemographicsModalOpen(false)}
        activeYear={activeYear}
        dbTotals={dbTotals}
        currentDemographics={demographics}
        onSave={handleSaveDemographics}
      />

      <TshirtStatsModal
        isOpen={isTshirtModalOpen}
        onClose={() => setIsTshirtModalOpen(false)}
        students={students}
        activeYear={activeYear}
        onOpenStudentSheet={onOpenStudentSheet}
      />

      <CheckSearchModal
        isOpen={isCheckSearchModalOpen}
        onClose={() => setIsCheckSearchModalOpen(false)}
        students={students}
        activeYear={activeYear}
        onOpenStudentSheet={(st) => {
          setIsCheckSearchModalOpen(false);
          onOpenStudentSheet?.(st);
        }}
      />
    </div>
  );
};

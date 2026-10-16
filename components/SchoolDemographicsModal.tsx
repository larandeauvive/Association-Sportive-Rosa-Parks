import React, { useState, useEffect } from 'react';
import { X, School, Users, Check, RotateCcw, Sparkles } from 'lucide-react';

export interface SchoolDemographicsData {
  schoolTotal: number;
  girlsTotal: number;
  boysTotal: number;
  levelTotals: Record<string, number>;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  activeYear: string;
  dbTotals: {
    total: number;
    girls: number;
    boys: number;
    levels: Record<string, number>;
  };
  currentDemographics: SchoolDemographicsData;
  onSave: (data: SchoolDemographicsData) => void;
}

export const SchoolDemographicsModal: React.FC<Props> = ({
  isOpen,
  onClose,
  activeYear,
  dbTotals,
  currentDemographics,
  onSave
}) => {
  const [schoolTotal, setSchoolTotal] = useState<number>(currentDemographics.schoolTotal || 500);
  const [girlsTotal, setGirlsTotal] = useState<number>(currentDemographics.girlsTotal || 250);
  const [boysTotal, setBoysTotal] = useState<number>(currentDemographics.boysTotal || 250);
  const [levelTotals, setLevelTotals] = useState<Record<string, number>>(currentDemographics.levelTotals || {});

  useEffect(() => {
    if (isOpen) {
      setSchoolTotal(currentDemographics.schoolTotal || 500);
      setGirlsTotal(currentDemographics.girlsTotal || 250);
      setBoysTotal(currentDemographics.boysTotal || 250);
      setLevelTotals(currentDemographics.levelTotals || {});
    }
  }, [isOpen, currentDemographics]);

  if (!isOpen) return null;

  // Liste ordonnée des niveaux
  const standardLevels = ['2nde', '1ère', 'Terminale', 'BTS / Sup', 'CAP', 'DEAS', 'Autre'];
  const allLevels = Array.from(new Set([...standardLevels, ...Object.keys(dbTotals.levels), ...Object.keys(levelTotals)]));
  
  // Trier selon l'ordre standard
  allLevels.sort((a, b) => {
    const idxA = standardLevels.indexOf(a);
    const idxB = standardLevels.indexOf(b);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.localeCompare(b);
  });

  const handleAutoFillFromDb = () => {
    const total = dbTotals.total > 0 ? dbTotals.total : 500;
    const girls = dbTotals.girls > 0 ? dbTotals.girls : Math.round(total / 2);
    const boys = dbTotals.boys > 0 ? dbTotals.boys : total - girls;
    
    setSchoolTotal(total);
    setGirlsTotal(girls);
    setBoysTotal(boys);
    setLevelTotals({ ...dbTotals.levels });
  };

  const handleLevelChange = (level: string, value: string) => {
    const num = parseInt(value, 10);
    setLevelTotals(prev => ({
      ...prev,
      [level]: isNaN(num) || num < 0 ? 0 : num
    }));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      schoolTotal: Math.max(1, schoolTotal),
      girlsTotal: Math.max(0, girlsTotal),
      boysTotal: Math.max(0, boysTotal),
      levelTotals
    });
    onClose();
  };

  const sumLevels = Object.values(levelTotals).reduce<number>((a, b) => a + (typeof b === 'number' ? b : 0), 0);
  const sumGender = (girlsTotal || 0) + (boysTotal || 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-xs">
              <School className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
                <span>Effectifs de Référence du Lycée</span>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800">
                  {activeYear}
                </span>
              </h2>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Utilisés pour calculer les pourcentages réels de mixité et de pénétration par niveau scolaire
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          
          {/* Action rapide auto-remplissage */}
          <div className="bg-gradient-to-r from-indigo-50 to-sky-50 border border-indigo-200/80 p-4 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
            <div className="space-y-0.5">
              <p className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-indigo-600" />
                <span>Synchronisation automatique avec la base élèves</span>
              </p>
              <p className="text-[11px] text-indigo-800/80">
                La base importée contient actuellement <strong>{dbTotals.total} élèves</strong> ({dbTotals.girls} filles, {dbTotals.boys} garçons).
              </p>
            </div>
            <button
              type="button"
              onClick={handleAutoFillFromDb}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition shadow-2xs cursor-pointer shrink-0 active:scale-95"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Charger depuis la base</span>
            </button>
          </div>

          {/* Section 1 : Effectif Global & Mixité */}
          <div className="space-y-4">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-600 flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-600" />
              <span>1. Effectif total & Répartition par sexe dans le lycée</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              
              {/* Total Lycée */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100 transition">
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Total Établissement
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    value={schoolTotal}
                    onChange={e => setSchoolTotal(parseInt(e.target.value) || 0)}
                    className="w-full bg-white px-3 py-1.5 border border-slate-300 rounded-lg text-base font-black text-slate-900 focus:outline-hidden"
                    required
                  />
                  <span className="text-xs font-semibold text-slate-400">élèves</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">Base globale de pénétration</p>
              </div>

              {/* Filles Lycée */}
              <div className="p-3.5 bg-rose-50/60 rounded-xl border border-rose-200 focus-within:border-rose-500 focus-within:ring-2 focus-within:ring-rose-100 transition">
                <label className="block text-[11px] font-bold text-rose-800 uppercase tracking-wider mb-1">
                  Nombre de Filles
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    value={girlsTotal}
                    onChange={e => setGirlsTotal(parseInt(e.target.value) || 0)}
                    className="w-full bg-white px-3 py-1.5 border border-rose-300 rounded-lg text-base font-black text-rose-950 focus:outline-hidden"
                    required
                  />
                  <span className="text-xs font-semibold text-rose-600">filles</span>
                </div>
                <p className="text-[10px] text-rose-700/80 mt-1">Dénominateur % Filles</p>
              </div>

              {/* Garçons Lycée */}
              <div className="p-3.5 bg-blue-50/60 rounded-xl border border-blue-200 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 transition">
                <label className="block text-[11px] font-bold text-blue-800 uppercase tracking-wider mb-1">
                  Nombre de Garçons
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    value={boysTotal}
                    onChange={e => setBoysTotal(parseInt(e.target.value) || 0)}
                    className="w-full bg-white px-3 py-1.5 border border-blue-300 rounded-lg text-base font-black text-blue-950 focus:outline-hidden"
                    required
                  />
                  <span className="text-xs font-semibold text-blue-600">garçons</span>
                </div>
                <p className="text-[10px] text-blue-700/80 mt-1">Dénominateur % Garçons</p>
              </div>

            </div>

            {sumGender !== schoolTotal && (
              <p className="text-[11px] text-slate-500 italic">
                ℹ️ Filles + Garçons = {sumGender} (Total lycée renseigné : {schoolTotal}). Les pourcentages de chaque sexe s'appuient directement sur l'effectif respectif de filles et de garçons.
              </p>
            )}
          </div>

          {/* Section 2 : Effectifs par Niveau Scolaire */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-600">
                2. Effectifs par Niveau Scolaire dans le lycée
              </h3>
              <span className="text-[11px] font-semibold text-slate-500">
                Somme des niveaux : {sumLevels} élèves
              </span>
            </div>

            <p className="text-xs text-slate-500">
              Chaque pourcentage de niveau sera calculé selon la formule : <code className="bg-slate-100 px-1 py-0.5 rounded text-indigo-700 font-mono text-[11px]">(licenciés du niveau / élèves du niveau) × 100</code>.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
              {allLevels.map(lvl => {
                const val = levelTotals[lvl] !== undefined ? levelTotals[lvl] : (dbTotals.levels[lvl] || 0);
                return (
                  <div key={lvl} className="p-3 bg-slate-50 rounded-xl border border-slate-200/90 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100 transition">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-black text-slate-800 uppercase">{lvl}</span>
                      {dbTotals.levels[lvl] !== undefined && (
                        <span className="text-[10px] text-slate-400 font-medium" title="Nombre d'élèves présents dans la base importée">
                          (base: {dbTotals.levels[lvl]})
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        value={val}
                        onChange={e => handleLevelChange(lvl, e.target.value)}
                        className="w-full bg-white px-2.5 py-1.5 border border-slate-300 rounded-lg text-sm font-black text-slate-900 focus:outline-hidden"
                      />
                      <span className="text-xs text-slate-500 font-medium">élèves</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </form>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="inline-flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-xs transition cursor-pointer active:scale-95"
          >
            <Check className="w-4 h-4 stroke-[3]" />
            <span>Enregistrer les effectifs</span>
          </button>
        </div>

      </div>
    </div>
  );
};
